import { ChromaClient, Collection, EmbeddingFunction } from 'chromadb';
import { Chunk } from './chunking';
import { LocalEmbeddings } from './embeddings';
import { TransformersEmbeddings } from './embeddings-transformers';
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
  private transformersEmbedder: TransformersEmbeddings | null = null;
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
   * @param tryReuseExisting If true, will try to reuse existing collection instead of recreating.
   *                         Falls back to creating new collection if it doesn't exist.
   * @returns Object with success flag and whether fallback to recreation occurred
   */
  async initialize(tryReuseExisting: boolean = false): Promise<{ success: boolean; fallbackToRecreation: boolean }> {
    // Create embedding function based on configuration
    const embeddingSetup = await createEmbeddingFunction();
    this.embeddingFunction = embeddingSetup.embeddingFunction;
    this.localEmbedder = embeddingSetup.localEmbedder || null;
    this.transformersEmbedder = embeddingSetup.transformersEmbedder || null;
    this.strategy = embeddingSetup.strategy;
    this.modelName = embeddingSetup.modelName;
    
    let cacheFailed = false;
    
    if (tryReuseExisting) {
      // Try to get existing collection
      try {
        this.collection = await this.client.getCollection({
          name: 'documents',
          embeddingFunction: this.embeddingFunction
        });
        
        // Verify the cached collection has the expected embedding configuration
        const collectionData = await this.collection.get({ limit: 1, include: ['embeddings'] });
        if (collectionData.embeddings && collectionData.embeddings.length > 0) {
          // Collection exists and has data, verify it's usable
          console.log(`Reusing existing ChromaDB collection with ${this.strategy} embeddings (${this.modelName})`);
          
          // For local TF-IDF embeddings, rebuild vocabulary from stored documents
          if (this.localEmbedder) {
            try {
              console.log('Rebuilding vocabulary from cached documents...');
              const allDocuments = await this.collection.get({ include: ['documents'] });
              if (allDocuments.documents && allDocuments.documents.length > 0) {
                this.localEmbedder.buildVocabulary(allDocuments.documents);
                console.log(`Vocabulary rebuilt successfully from ${allDocuments.documents.length} cached documents`);
              } else {
                console.warn('No documents found in cached collection, vocabulary will be empty');
              }
            } catch (error) {
              console.error('Failed to rebuild vocabulary from cached documents:', error);
              throw new Error('Could not rebuild vocabulary for local embeddings. Please clear cache and recreate the database.');
            }
          }
          
          return { success: true, fallbackToRecreation: false };
        } else {
          // Collection exists but is empty - fall back to recreation
          console.warn('⚠️  Cached collection exists but is empty. Falling back to recreation...');
          cacheFailed = true;
        }
      } catch (error) {
        // Collection doesn't exist - fall back to recreation
        console.warn('⚠️  Expected cached collection not found. Cache may be invalid or not restored properly.');
        console.warn('⚠️  Falling back to recreating ChromaDB collection...');
        cacheFailed = true;
      }
      
      // If we reach here, cache was invalid - fall through to recreation
    } else {
      try {
        // Delete existing collection if it exists
        await this.client.deleteCollection({ name: 'documents' });
      } catch (error) {
        // Collection doesn't exist, that's fine
      }
    }
    
    // Create new collection with the configured embedding function
    this.collection = await this.client.createCollection({
      name: 'documents',
      metadata: { 'hnsw:space': 'cosine' },
      embeddingFunction: this.embeddingFunction
    });
    
    console.log(`ChromaDB collection created successfully with ${this.strategy} embeddings (${this.modelName})`);
    
    // Return flag indicating whether this was a fallback from cache attempt
    return { success: true, fallbackToRecreation: cacheFailed };
  }

  /**
   * Add chunks to ChromaDB with embeddings and metadata
   */
  async addChunks(chunks: Chunk[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    console.log(`Processing ${chunks.length} chunks...`);
    
    // Build vocabulary from all chunks (only needed for local TF-IDF embeddings)
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
      // For local TF-IDF and transformers.js, we need to compute embeddings ourselves
      let embeddings: number[][] | undefined;
      if (this.localEmbedder) {
        embeddings = await this.localEmbedder.embedBatch(texts);
      } else if (this.transformersEmbedder) {
        embeddings = await this.transformersEmbedder.embedBatch(texts);
      }
      
      interface AddParams {
        ids: string[];
        documents: string[];
        metadatas: Array<{
          sourceFile: string;
          chunkIndex: number;
          headerHierarchy: string;
          section: string;
          chunkType: string;
          language: string;
        }>;
        embeddings?: number[][];
      }
      
      const addParams: AddParams = {
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

    // For local TF-IDF and transformers.js, we need to manually create the embedding
    // For HuggingFace, ChromaDB will automatically call the embedding function
    if (this.localEmbedder || this.transformersEmbedder) {
      const embedding = this.localEmbedder 
        ? await this.localEmbedder.embed(question)
        : await this.transformersEmbedder!.embed(question);
      
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
