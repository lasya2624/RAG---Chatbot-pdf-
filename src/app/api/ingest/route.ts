import { NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { localEmbeddings } from '@/lib/embeddings';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    console.log(`Starting ingestion for file: ${file.name}`);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const data = await pdf(buffer);
    const text = data.text?.trim();

    console.log(`Extracted ${text?.length || 0} characters from PDF.`);
    if (!text || text.length < 5) {
      console.error("PDF extraction returned empty or insufficient text.");
      return NextResponse.json({ 
        error: "Could not extract text from PDF.", 
        details: "The document might be an image/scanned PDF, or it may be empty. Please try a text-based PDF." 
      }, { status: 400 });
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([text]);
    console.log(`Split document into ${docs.length} chunks.`);

    console.log("Generating embeddings using Google Gemini API...");
    const textsToEmbed = docs.map(doc => doc.pageContent);
    const docIds = docs.map((_, i) => `chunk_${i}`);
    
    // Generate embeddings
    const embeddings = await localEmbeddings.embedDocuments(textsToEmbed);

    const { Pinecone } = await import('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const indexName = process.env.PINECONE_INDEX_NAME || 'rag-documents';
    const index = pc.Index(indexName);

    // Delete existing vectors so the bot only answers from the latest PDF
    try {
      await index.deleteAll();
      console.log(`Cleared existing vectors in Pinecone index '${indexName}'`);
    } catch (e: any) {
      console.log("Index clear check: " + (e.message || "Could not clear index"));
    }

    // Format for Pinecone
    const records = docIds.map((id, i) => ({
      id,
      values: embeddings[i],
      metadata: { text: textsToEmbed[i] }
    }));

    console.log(`Prepared ${records.length} records for Pinecone.`);
    if (records.length === 0) {
      throw new Error(`Records array is empty. Docs length: ${docs.length}, Embeddings length: ${embeddings?.length}`);
    }
    
    if (!records[0].values || records[0].values.length === 0) {
      throw new Error(`Embedding values are missing or empty for the first record.`);
    }

    // Upsert to Pinecone
    await index.upsert({ records });

    console.log("Ingestion complete.");
    return NextResponse.json({
      success: true,
      message: `Successfully indexed ${docs.length} chunks from ${file.name}`
    });

  } catch (error: any) {
    console.error("Ingestion error:", error);

    // Handle specific ChromaDB errors
    if (error.message?.includes("collection") || error.message?.includes("already exists")) {
      return NextResponse.json({
        error: "Collection already exists. Please restart ChromaDB or use a different collection name.",
        details: error.message
      }, { status: 500 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}