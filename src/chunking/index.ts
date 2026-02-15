/**
 * Chunking module for document processing.
 * 
 * This module provides utilities for splitting markdown documents into
 * semantically meaningful chunks for vector database storage and retrieval.
 */

import { DocumentChunker } from './legacy-chunker';
import { AstDocumentChunker } from './ast-chunker';

export { DocumentChunker, Chunk, ChunkMetadata, DocumentChunkerOptions } from './legacy-chunker';
export { AstDocumentChunker, AstChunk, AstChunkMetadata, AstChunkerOptions } from './ast-chunker';

/**
 * Configuration for the chunker factory.
 */
export interface ChunkerConfig {
  /** Chunking mode: 'legacy' for string-based, 'ast' for AST-based */
  mode: 'legacy' | 'ast';
  /** Target chunk size in characters */
  chunkSize?: number;
  /** Overlap size between chunks in characters */
  chunkOverlap?: number;
}

/**
 * Create a chunker instance based on the configuration.
 * 
 * @param config - Configuration specifying which chunker to create and its parameters
 * @returns A chunker instance (either DocumentChunker or AstDocumentChunker)
 */
export function createChunker(config: ChunkerConfig): DocumentChunker | AstDocumentChunker {
  const options = {
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap
  };
  
  return config.mode === 'ast'
    ? new AstDocumentChunker(options)
    : new DocumentChunker(options);
}
