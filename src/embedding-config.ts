/**
 * Configuration module for embedding strategies.
 * 
 * This module allows switching between different embedding approaches:
 * - 'llm': Uses transformers.js for local LLM-based embeddings (default)
 * - 'local': Uses the naive TF-IDF-based local embeddings
 * - 'huggingface': Uses Hugging Face Text Embeddings Inference server
 */

export interface EmbeddingConfig {
  /** Embedding strategy: 'llm' for transformers.js, 'local' for naive TF-IDF, 'huggingface' for HF server */
  strategy: 'llm' | 'local' | 'huggingface';
  /** URL of the Hugging Face embedding server (required when strategy is 'huggingface') */
  huggingfaceUrl?: string;
  /** Model ID for LLM embeddings (used when strategy is 'llm') */
  modelId?: string;
  /** Batch size for embedding generation */
  batchSize?: number;
  /** Model name for reference/logging */
  modelName: string;
}

/**
 * Default embedding configuration.
 * Defaults to LLM mode using transformers.js with all-mpnet-base-v2.
 * 
 * Can be overridden via environment variables:
 * - EMBEDDING_STRATEGY: 'llm' (default), 'local', or 'huggingface'
 * - EMBEDDING_MODEL_ID: Model ID for LLM embeddings (default: Xenova/all-mpnet-base-v2)
 * - HUGGINGFACE_EMBEDDING_URL: URL of the HuggingFace embedding server (default: http://localhost:8001/embed)
 * - EMBEDDING_MODEL: Model name for reference/logging
 * - EMBEDDING_BATCH_SIZE: Batch size for embedding generation (default: 32)
 */
export const defaultEmbeddingConfig: EmbeddingConfig = (() => {
  let strategy: 'llm' | 'local' | 'huggingface' = 'llm';
  
  // Parse strategy from environment variable
  if (process.env.EMBEDDING_STRATEGY === 'local') {
    strategy = 'local';
  } else if (process.env.EMBEDDING_STRATEGY === 'huggingface') {
    strategy = 'huggingface';
  }
  
  const huggingfaceUrl = process.env.HUGGINGFACE_EMBEDDING_URL || 'http://localhost:8001/embed';
  const modelId = process.env.EMBEDDING_MODEL_ID || 'Xenova/all-mpnet-base-v2';
  const batchSize = process.env.EMBEDDING_BATCH_SIZE ? parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) : 32;
  
  // Determine model name for logging
  let modelName = process.env.EMBEDDING_MODEL;
  if (!modelName) {
    if (strategy === 'llm') {
      modelName = modelId;
    } else if (strategy === 'huggingface') {
      modelName = 'sentence-transformers/all-MiniLM-L6-v2';
    } else {
      modelName = 'TF-IDF';
    }
  }
  
  return { strategy, huggingfaceUrl, modelId, batchSize, modelName };
})();

/**
 * Get the current embedding configuration.
 * This function allows for future extension with config file support.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return defaultEmbeddingConfig;
}
