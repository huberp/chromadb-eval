/**
 * Embedding factory that creates the appropriate embedding function
 * based on configuration.
 */

import { EmbeddingFunction } from 'chromadb';
import { HuggingfaceServerEmbeddingFunction } from '@chroma-core/huggingface-server';
import { LocalEmbeddings } from './embeddings';
import { EmbeddingConfig, getEmbeddingConfig } from './embedding-config';

/**
 * Wrapper class to make LocalEmbeddings compatible with ChromaDB's EmbeddingFunction interface
 */
class LocalEmbeddingFunction implements EmbeddingFunction {
  private embedder: LocalEmbeddings;

  constructor(embedder: LocalEmbeddings) {
    this.embedder = embedder;
  }

  async generate(texts: string[]): Promise<number[][]> {
    return await this.embedder.embedBatch(texts);
  }
}

/**
 * Factory function to create an embedding function based on configuration
 */
export async function createEmbeddingFunction(config?: EmbeddingConfig): Promise<{
  embeddingFunction: EmbeddingFunction;
  localEmbedder?: LocalEmbeddings;
  strategy: string;
  modelName: string;
}> {
  const embedConfig = config || getEmbeddingConfig();
  
  console.log(`Initializing ${embedConfig.strategy} embedding function...`);
  console.log(`Model: ${embedConfig.modelName}`);
  
  if (embedConfig.strategy === 'huggingface') {
    // Validate required configuration
    if (!embedConfig.huggingfaceUrl) {
      throw new Error('HUGGINGFACE_EMBEDDING_URL is required when using huggingface strategy');
    }
    
    // Use Hugging Face Text Embeddings Inference server
    const embeddingFunction = new HuggingfaceServerEmbeddingFunction({
      url: embedConfig.huggingfaceUrl
    });
    
    return {
      embeddingFunction,
      strategy: embedConfig.strategy,
      modelName: embedConfig.modelName
    };
  } else {
    // Use local TF-IDF embeddings (the "naive" approach)
    const localEmbedder = new LocalEmbeddings();
    await localEmbedder.initialize();
    const embeddingFunction = new LocalEmbeddingFunction(localEmbedder);
    
    return {
      embeddingFunction,
      localEmbedder,
      strategy: embedConfig.strategy,
      modelName: embedConfig.modelName
    };
  }
}
