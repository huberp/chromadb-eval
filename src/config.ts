/**
 * Configuration module for chunking behavior.
 * 
 * This module allows switching between the legacy string-based chunker
 * and the new AST-based chunker via configuration.
 */

export interface ChunkingConfig {
  /** Chunking mode: 'legacy' for string-based, 'ast' for AST-based */
  mode: 'legacy' | 'ast';
  /** Target chunk size in characters */
  chunkSize: number;
  /** Overlap size between chunks in characters */
  chunkOverlap: number;
}

/**
 * Default chunking configuration.
 * Defaults to legacy mode for backward compatibility.
 * 
 * Can be overridden via environment variables:
 * - CHUNKING_MODE: 'legacy' or 'ast'
 * - CHUNK_SIZE: number (default: 1000)
 * - CHUNK_OVERLAP: number (default: 150)
 */
export const defaultChunkingConfig: ChunkingConfig = {
  mode: (process.env.CHUNKING_MODE === 'ast' ? 'ast' : 'legacy') as 'legacy' | 'ast',
  chunkSize: process.env.CHUNK_SIZE ? parseInt(process.env.CHUNK_SIZE, 10) : 1000,
  chunkOverlap: process.env.CHUNK_OVERLAP ? parseInt(process.env.CHUNK_OVERLAP, 10) : 150,
};

/**
 * Get the current chunking configuration.
 * This function allows for future extension with config file support.
 */
export function getChunkingConfig(): ChunkingConfig {
  return defaultChunkingConfig;
}
