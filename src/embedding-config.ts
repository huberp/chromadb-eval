/**
 * Configuration module for embedding strategies.
 * 
 * This module allows switching between different embedding approaches:
 * - 'local': Uses the naive TF-IDF-based local embeddings
 * - 'huggingface': Uses Hugging Face Text Embeddings Inference server
 */

export interface EmbeddingConfig {
  /** Embedding strategy: 'local' for naive TF-IDF, 'huggingface' for HF server */
  strategy: 'local' | 'huggingface';
  /** URL of the Hugging Face embedding server (required when strategy is 'huggingface') */
  huggingfaceUrl?: string;
  /** Model name for reference/logging */
  modelName: string;
}

/**
 * Default embedding configuration.
 * Defaults to local mode for backward compatibility.
 * 
 * Can be overridden via environment variables:
 * - EMBEDDING_STRATEGY: 'local' or 'huggingface'
 * - HUGGINGFACE_EMBEDDING_URL: URL of the HuggingFace embedding server (default: http://localhost:8001/embed)
 * - EMBEDDING_MODEL: Model name for reference/logging
 */
export const defaultEmbeddingConfig: EmbeddingConfig = (() => {
  const strategy = (process.env.EMBEDDING_STRATEGY === 'huggingface' ? 'huggingface' : 'local') as 'local' | 'huggingface';
  const huggingfaceUrl = process.env.HUGGINGFACE_EMBEDDING_URL || 'http://localhost:8001/embed';
  const modelName = process.env.EMBEDDING_MODEL || (strategy === 'huggingface' ? 'sentence-transformers/all-MiniLM-L6-v2' : 'TF-IDF');
  
  return { strategy, huggingfaceUrl, modelName };
})();

/**
 * Get the current embedding configuration.
 * This function allows for future extension with config file support.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  return defaultEmbeddingConfig;
}
