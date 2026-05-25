import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';

export const localEmbeddings = {
  embedDocuments: async (texts: string[]): Promise<number[][]> => {
    // Process in batches if there are many texts, but for simple docs embedMany handles it well
    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel('gemini-embedding-2'),
      values: texts,
    });
    return embeddings;
  },

  embedQuery: async (text: string): Promise<number[]> => {
    const { embedding } = await embed({
      model: google.textEmbeddingModel('gemini-embedding-2'),
      value: text,
    });
    return embedding;
  }
};
