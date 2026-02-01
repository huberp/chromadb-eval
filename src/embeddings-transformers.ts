/**
 * Transformers.js-based embedding provider using LLM models.
 * Uses @xenova/transformers for local LLM-based embeddings without external API calls.
 */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

export interface TransformersEmbeddingConfig {
  modelId: string;
  batchSize?: number;
}

export class TransformersEmbeddings {
  private pipeline: FeatureExtractionPipeline | null = null;
  private config: TransformersEmbeddingConfig;

  constructor(config: TransformersEmbeddingConfig) {
    this.config = {
      batchSize: 32,
      ...config
    };
  }

  /**
   * Initialize the embedding model pipeline
   */
  async initialize(): Promise<void> {
    console.log(`Initializing transformers.js embedding model: ${this.config.modelId}...`);
    
    // Lazy-initialize the pipeline with feature extraction
    this.pipeline = await pipeline('feature-extraction', this.config.modelId, {
      // These options ensure optimal embedding generation
      quantized: true, // Use quantized models for better performance
    });
    
    console.log('Transformers.js model loaded successfully');
  }

  /**
   * Generate embeddings for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) {
      throw new Error('Pipeline not initialized. Call initialize() first.');
    }

    // Generate embedding using the pipeline
    const output = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });

    // Convert tensor to regular array
    return Array.from(output.data);
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) {
      throw new Error('Pipeline not initialized. Call initialize() first.');
    }

    const embeddings: number[][] = [];
    const batchSize = this.config.batchSize || 32;

    // Process in batches to manage memory
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // Process batch sequentially for now (transformers.js handles batching internally)
      for (const text of batch) {
        const embedding = await this.embed(text);
        embeddings.push(embedding);
      }
      
      if ((i + batchSize) % 100 === 0 || i + batchSize >= texts.length) {
        console.log(`Processed ${Math.min(i + batchSize, texts.length)}/${texts.length} embeddings`);
      }
    }

    return embeddings;
  }
}
