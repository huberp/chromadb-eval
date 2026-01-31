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
 * Parse and validate a positive integer from an environment variable.
 */
function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Default chunking configuration.
 * Defaults to legacy mode for backward compatibility.
 * 
 * Can be overridden via environment variables:
 * - CHUNKING_MODE: 'legacy' or 'ast'
 * - CHUNK_SIZE: positive integer (default: 1000)
 * - CHUNK_OVERLAP: positive integer (default: 150, must be less than CHUNK_SIZE)
 */
export const defaultChunkingConfig: ChunkingConfig = (() => {
  const mode = (process.env.CHUNKING_MODE === 'ast' ? 'ast' : 'legacy') as 'legacy' | 'ast';
  const chunkSize = parsePositiveInt(process.env.CHUNK_SIZE, 1000);
  let chunkOverlap = parsePositiveInt(process.env.CHUNK_OVERLAP, 150);
  
  // Ensure chunkOverlap is less than chunkSize
  if (chunkOverlap >= chunkSize) {
    console.warn(`Warning: CHUNK_OVERLAP (${chunkOverlap}) must be less than CHUNK_SIZE (${chunkSize}). Using default overlap of 150.`);
    chunkOverlap = Math.min(150, Math.floor(chunkSize / 2));
  }
  
  return { mode, chunkSize, chunkOverlap };
})();

/**
 * Get the current chunking configuration.
 * This function allows for future extension with config file support.
 */
export function getChunkingConfig(): ChunkingConfig {
  return defaultChunkingConfig;
}
