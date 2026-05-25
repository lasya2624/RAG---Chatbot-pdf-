import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { tool, ToolLoopAgent, createAgentUIStreamResponse } from 'ai';
import { z } from 'zod';
// Import removed
import { localEmbeddings } from '@/lib/embeddings';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
});

// Tool to query uploaded documents
const queryDocumentsTool = tool({
  description: 'Search through the user uploaded documents for specific information',
  parameters: z.object({
    query: z.string().describe('The search query to look for in the documents'),
  }),
  execute: async ({ query }) => {
    try {
      console.log(`Querying documents for: "${query}" using local embeddings...`);
      
      if (!query || typeof query !== 'string' || query.trim() === '') {
        console.warn("Model provided an empty or undefined query.");
        return { context: "Error: You must provide a specific search query string to use this tool. Please try calling the tool again with a detailed query parameter." };
      }

      const { Pinecone } = await import('@pinecone-database/pinecone');
      const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
      const indexName = process.env.PINECONE_INDEX_NAME || 'rag-documents';
      const index = pc.Index(indexName);
      
      try {
        const queryEmbedding = await localEmbeddings.embedQuery(query);
        
        const results = await index.query({
          vector: queryEmbedding,
          topK: 10,
          includeMetadata: true
        });

        const relevantDocs = results.matches.map((match: any) => match.metadata?.text || '');
        const context = relevantDocs.join('\n---\n');
        
        console.log(`Found ${results.matches.length} relevant context chunks.`);
        return { context: context || "No relevant information found." };
      } catch (e: any) {
        console.error("Pinecone query error:", e.message);
        return { context: "Document store is unavailable or empty." };
      }
    } catch (error) {
      console.error("Retrieval error:", error);
      return { context: "No documents have been uploaded yet, or the document store is unavailable." };
    }
  },
});

// List of models to try in order of preference
const MODELS_TO_TRY = [
  'gemini-2.5-flash-lite',
];

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    let lastError: any = null;

    // Try each model in order
    for (const modelId of MODELS_TO_TRY) {
      try {
        console.log(`Attempting chat with model: ${modelId} using ToolLoopAgent...`);

        const agent = new ToolLoopAgent({
          model: google(modelId),
          tools: {
            queryDocuments: queryDocumentsTool,
          },
          toolChoice: 'auto',
          instructions: "You are a helpful RAG assistant. You MUST use the `queryDocuments` tool to answer ANY and ALL questions about the uploaded documents. If the user asks for a summary or description, use the tool with a broad query to gather context. Do NOT say you cannot summarize or describe documents; instead, search for the most relevant sections and provide your best answer based on that content.",
        });

        return createAgentUIStreamResponse({
          agent,
          uiMessages: messages,
        });
      } catch (error: any) {
        console.error(`Error with model ${modelId}:`, error.message);
        lastError = error;
        continue; // Try next model
      }
    }

    throw lastError || new Error("All models failed to respond.");
  } catch (error: any) {
    console.error("Chat error:", error);
    return Response.json({
      error: error.message,
      details: "No response from any Gemini models. Please check your API key and quota."
    }, { status: 500 });
  }
}
