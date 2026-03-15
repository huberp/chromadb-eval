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
export { splitIntoSentences } from './sentence-splitter';

/**
 * Configuration for the chunker factory.
 */
export interface ChunkerConfig {
  /** Chunking mode: 'legacy' for string-based, 'ast' for AST-based, 'ast-sentence' for hierarchical sentence-level */
  mode: 'legacy' | 'ast' | 'ast-sentence';
  /** Target chunk size in characters */
  chunkSize?: number;
  /** Overlap size between chunks in characters */
  chunkOverlap?: number;
  /** Minimum paragraph length for sentence sub-chunking (only used for 'ast-sentence' mode, default: 300) */
  minParagraphLength?: number;
}

/**
 * Create a chunker instance based on the configuration.
 * 
 * @param config - Configuration specifying which chunker to create and its parameters
 * @returns A chunker instance (either DocumentChunker or AstDocumentChunker)
 */
export function createChunker(config: ChunkerConfig): DocumentChunker | AstDocumentChunker {
  if (config.mode === 'ast-sentence') {
    return new AstDocumentChunker({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      sentenceChunking: {
        enabled: true,
        minParagraphLength: config.minParagraphLength,
      },
    });
  }

  const options = {
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap
  };
  
  return config.mode === 'ast'
    ? new AstDocumentChunker(options)
    : new DocumentChunker(options);
}
