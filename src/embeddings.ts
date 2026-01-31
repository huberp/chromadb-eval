export class LocalEmbeddings {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private embeddingDim: number = 384;

  /**
   * Initialize the embedding model
   */
  async initialize(): Promise<void> {
    console.log('Initializing local embedding function...');
    console.log('Using simple TF-IDF-based embeddings for demonstration');
  }

  /**
   * Build vocabulary and IDF from documents
   */
  buildVocabulary(documents: string[]): void {
    const docFreq = new Map<string, number>();
    
    // Count document frequency for each term
    for (const doc of documents) {
      const uniqueWords = new Set(this.tokenize(doc));
      for (const word of uniqueWords) {
        docFreq.set(word, (docFreq.get(word) || 0) + 1);
      }
    }
    
    // Build vocabulary and calculate IDF
    let idx = 0;
    for (const [word, freq] of docFreq.entries()) {
      this.vocabulary.set(word, idx++);
      this.idf.set(word, Math.log(documents.length / freq));
    }
    
    console.log(`Vocabulary size: ${this.vocabulary.size} terms`);
  }

  /**
   * Generate embeddings for a single text using TF-IDF
   */
  async embed(text: string): Promise<number[]> {
    const embedding = new Array(this.embeddingDim).fill(0);
    const words = this.tokenize(text);
    
    // Calculate term frequency
    const tf = new Map<string, number>();
    for (const word of words) {
      tf.set(word, (tf.get(word) || 0) + 1);
    }
    
    // Normalize term frequencies
    for (const [word, count] of tf.entries()) {
      tf.set(word, count / words.length);
    }
    
    // Create TF-IDF embedding
    for (const [word, tfValue] of tf.entries()) {
      const vocabIdx = this.vocabulary.get(word);
      const idfValue = this.idf.get(word) || 0;
      
      if (vocabIdx !== undefined) {
        // Use simple hash to distribute terms across embedding dimensions
        const embIdx = vocabIdx % this.embeddingDim;
        embedding[embIdx] += tfValue * idfValue;
      }
    }
    
    // Normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }
    
    return embedding;
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

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }
}
