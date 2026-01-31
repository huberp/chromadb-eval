/**
 * Chunking module for document processing.
 * 
 * This module provides utilities for splitting markdown documents into
 * semantically meaningful chunks for vector database storage and retrieval.
 */

export { DocumentChunker, Chunk, ChunkMetadata } from './legacy-chunker';
export { AstDocumentChunker, AstChunk, AstChunkMetadata } from './ast-chunker';
