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
        // Use multiple hash functions to distribute each term across multiple dimensions
        // This reduces hash collisions and improves embedding quality
        const tfidfWeight = tfValue * idfValue;
        
        // Use 3 different hash functions for better distribution
        for (let hashIdx = 0; hashIdx < 3; hashIdx++) {
          const hash = this.hashWord(word, hashIdx);
          const embIdx = hash % this.embeddingDim;
          const sign = ((hash >> 16) & 1) === 0 ? 1 : -1; // Use sign to add variance
          embedding[embIdx] += sign * tfidfWeight / 3; // Divide by number of hashes
        }
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

  /**
   * Hash function for distributing words across embedding dimensions
   * Uses different seeds for different hash indices to create independent hash functions
   */
  private hashWord(word: string, hashIdx: number): number {
    let hash = hashIdx * 2654435761; // Prime number as initial seed
    
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }
}
