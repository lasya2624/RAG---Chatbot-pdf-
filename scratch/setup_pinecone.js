const { Pinecone } = require('@pinecone-database/pinecone');

async function setupPinecone() {
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
  });

  const indexName = process.env.PINECONE_INDEX_NAME || 'rag-documents';

  try {
    const existingIndexes = await pc.listIndexes();
    const indexExists = existingIndexes.indexes.some(idx => idx.name === indexName);

    if (!indexExists) {
      console.log(`Creating Pinecone index: ${indexName}...`);
      await pc.createIndex({
        name: indexName,
        dimension: 768, // Google text-embedding-004 outputs 768 dimensions
        metric: 'cosine',
        spec: { 
          serverless: { 
            cloud: 'aws', 
            region: 'us-east-1' 
          }
        }
      });
      console.log('Index created successfully!');
    } else {
      console.log(`Index ${indexName} already exists.`);
    }
  } catch (error) {
    console.error('Error setting up Pinecone:', error);
  }
}

setupPinecone();
