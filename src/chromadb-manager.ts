import { ChromaClient, Collection, EmbeddingFunction } from 'chromadb';
import { Chunk } from './chunking';
import { LocalEmbeddings } from './embeddings';
import { createEmbeddingFunction } from './embedding-factory';

export interface DocumentSimilarity {
  doc1: string;
  doc2: string;
  similarity: number;
}

export class ChromaDBManager {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingFunction: EmbeddingFunction | null = null;
  private localEmbedder: LocalEmbeddings | null = null;
  private strategy: string = 'unknown';
  private modelName: string = 'unknown';

  constructor() {
    this.client = new ChromaClient({ 
      host: 'localhost',
      port: 8000
    });
  }

  /**
   * Initialize ChromaDB and create/get collection
   */
  async initialize(): Promise<void> {
    // Create embedding function based on configuration
    const embeddingSetup = await createEmbeddingFunction();
    this.embeddingFunction = embeddingSetup.embeddingFunction;
    this.localEmbedder = embeddingSetup.localEmbedder || null;
    this.strategy = embeddingSetup.strategy;
    this.modelName = embeddingSetup.modelName;
    
    try {
      // Delete existing collection if it exists
      await this.client.deleteCollection({ name: 'documents' });
    } catch (error) {
      // Collection doesn't exist, that's fine
    }
    
    // Create new collection with the configured embedding function
    this.collection = await this.client.createCollection({
      name: 'documents',
      metadata: { 'hnsw:space': 'cosine' },
      embeddingFunction: this.embeddingFunction
    });
    
    console.log(`ChromaDB collection created successfully with ${this.strategy} embeddings (${this.modelName})`);
  }

  /**
   * Add chunks to ChromaDB with embeddings and metadata
   */
  async addChunks(chunks: Chunk[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    console.log(`Processing ${chunks.length} chunks...`);
    
    // Build vocabulary from all chunks (only needed for local embeddings)
    if (this.localEmbedder) {
      const allTexts = chunks.map(c => c.content);
      this.localEmbedder.buildVocabulary(allTexts);
    }
    
    // Process in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);
      
      // For HuggingFace, we let ChromaDB handle the embedding via the embeddingFunction
      // For local, we need to compute embeddings ourselves
      let embeddings: number[][] | undefined;
      if (this.localEmbedder) {
        embeddings = await this.localEmbedder.embedBatch(texts);
      }
      
      const addParams: any = {
        ids: batch.map(c => c.id),
        documents: texts,
        metadatas: batch.map(c => ({
          sourceFile: c.sourceFile,
          chunkIndex: c.chunkIndex,
          headerHierarchy: c.metadata?.headerHierarchy?.join(' > ') || '',
          section: c.metadata?.section || '',
          chunkType: c.metadata?.chunkType || 'text',
          language: c.metadata?.language || ''
        }))
      };
      
      // Only add embeddings if using local strategy (HuggingFace handles it automatically)
      if (embeddings) {
        addParams.embeddings = embeddings;
      }
      
      await this.collection.add(addParams);
      
      console.log(`Processed ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks`);
    }
    
    console.log('All chunks added to ChromaDB');
  }

  /**
   * Query ChromaDB with a question
   */
  async query(question: string, topK: number = 5): Promise<any> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    // For HuggingFace, ChromaDB will automatically call the embedding function
    // For local, we need to manually create the embedding
    if (this.localEmbedder) {
      const embedding = await this.localEmbedder.embed(question);
      
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: topK
      });
      
      return results;
    } else {
      // For HuggingFace, use queryTexts instead of queryEmbeddings
      const results = await this.collection.query({
        queryTexts: [question],
        nResults: topK
      });
      
      return results;
    }
  }

  /**
   * Compute document similarities based on vector embeddings
   */
  async computeDocumentSimilarities(): Promise<DocumentSimilarity[]> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    // Get all documents with embeddings
    const allData = await this.collection.get({
      include: ['embeddings', 'metadatas']
    });
    
    // Group embeddings by source file
    const docEmbeddings = new Map<string, number[][]>();
    
    for (let i = 0; i < allData.ids.length; i++) {
      const metadata = allData.metadatas?.[i] as { sourceFile: string };
      const embedding = allData.embeddings?.[i];
      
      if (metadata && embedding) {
        if (!docEmbeddings.has(metadata.sourceFile)) {
          docEmbeddings.set(metadata.sourceFile, []);
        }
        docEmbeddings.get(metadata.sourceFile)!.push(embedding);
      }
    }
    
    // Compute average embedding for each document
    const docAvgEmbeddings = new Map<string, number[]>();
    for (const [doc, embeddings] of docEmbeddings.entries()) {
      const avgEmbedding = this.averageEmbeddings(embeddings);
      docAvgEmbeddings.set(doc, avgEmbedding);
    }
    
    // Compute pairwise similarities
    const similarities: DocumentSimilarity[] = [];
    const docs = Array.from(docAvgEmbeddings.keys());
    
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const emb1 = docAvgEmbeddings.get(docs[i])!;
        const emb2 = docAvgEmbeddings.get(docs[j])!;
        const similarity = this.cosineSimilarity(emb1, emb2);
        
        similarities.push({
          doc1: docs[i],
          doc2: docs[j],
          similarity: similarity
        });
      }
    }
    
    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, 10);
  }

  /**
   * Get most common terms from fulltext
   */
  async getMostCommonTerms(topN: number = 10): Promise<Map<string, number>> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    const allData = await this.collection.get();
    const documents = allData.documents || [];
    
    // Count word frequencies
    const wordCounts = new Map<string, number>();
    
    for (const doc of documents) {
      if (doc) {
        // Tokenize and clean words
        const words = doc.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 3); // Filter out short words
        
        for (const word of words) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }
    
    // Sort by frequency and return top N
    const sorted = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    
    return new Map(sorted);
  }

  /**
   * Helper: Average multiple embeddings
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      return [];
    }
    
    const dim = embeddings[0].length;
    const avg = new Array(dim).fill(0);
    
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i];
      }
    }
    
    for (let i = 0; i < dim; i++) {
      avg[i] /= embeddings.length;
    }
    
    return avg;
  }

  /**
   * Helper: Compute cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    
    // Handle zero magnitude vectors
    if (magnitude === 0) {
      return 0;
    }
    
    return dotProduct / magnitude;
  }
}
