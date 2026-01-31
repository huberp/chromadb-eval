import { pipeline } from '@xenova/transformers';

export class LocalEmbeddings {
  private embedder: any = null;

  /**
   * Initialize the embedding model
   */
  async initialize(): Promise<void> {
    console.log('Loading embedding model...');
    // Using a smaller, efficient model for local embeddings
    this.embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log('Embedding model loaded successfully');
  }

  /**
   * Generate embeddings for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embedder not initialized. Call initialize() first.');
    }

    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }
    
    return embeddings;
  }
}
