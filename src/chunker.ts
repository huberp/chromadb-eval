import * as fs from 'fs';
import * as path from 'path';

export interface Chunk {
  id: string;
  content: string;
  sourceFile: string;
  chunkIndex: number;
}

export class DocumentChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize: number = 500, chunkOverlap: number = 50) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Load and chunk all markdown files from a directory
   */
  async chunkDocuments(directoryPath: string): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    const files = fs.readdirSync(directoryPath);
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(directoryPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileChunks = this.chunkText(content, file);
        chunks.push(...fileChunks);
      }
    }
    
    return chunks;
  }

  /**
   * Chunk a single text into overlapping segments using semantic boundaries
   * This implementation follows RAG best practices:
   * - Respects semantic boundaries (sentences, paragraphs, markdown sections)
   * - Uses 10-20% overlap to preserve context at boundaries
   * - Employs recursive splitting to balance semantic integrity with size constraints
   */
  private chunkText(text: string, sourceFile: string): Chunk[] {
    const chunks: Chunk[] = [];
    
    // Split by paragraphs first (markdown double newlines)
    const paragraphs = text.split(/\n\n+/);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      if (!paragraph) continue;
      
      // If adding this paragraph would exceed chunk size
      if (currentChunk && (currentChunk.length + paragraph.length + 2) > this.chunkSize) {
        // Save current chunk
        if (currentChunk.trim()) {
          chunks.push({
            id: `${sourceFile}-chunk-${chunkIndex}`,
            content: currentChunk.trim(),
            sourceFile: sourceFile,
            chunkIndex: chunkIndex
          });
          chunkIndex++;
          
          // Create overlap by keeping the last sentences of the previous chunk
          const overlapText = this.extractOverlap(currentChunk);
          currentChunk = overlapText;
        } else {
          currentChunk = '';
        }
        
        // If single paragraph is too large, split by sentences
        if (paragraph.length > this.chunkSize) {
          const sentenceChunks = this.splitBySentences(paragraph, sourceFile, chunkIndex);
          chunks.push(...sentenceChunks);
          chunkIndex += sentenceChunks.length;
          currentChunk = sentenceChunks.length > 0 ? this.extractOverlap(sentenceChunks[sentenceChunks.length - 1].content) : '';
          continue;
        }
      }
      
      // Add paragraph to current chunk
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
    }
    
    // Add final chunk if there's remaining content
    if (currentChunk.trim()) {
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIndex}`,
        content: currentChunk.trim(),
        sourceFile: sourceFile,
        chunkIndex: chunkIndex
      });
    }
    
    return chunks;
  }

  /**
   * Split a large paragraph by sentences while respecting semantic boundaries
   */
  private splitBySentences(text: string, sourceFile: string, startIndex: number): Chunk[] {
    const chunks: Chunk[] = [];
    // Split by sentence boundaries (. ! ?) followed by space or newline
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = '';
    let chunkIndex = startIndex;
    
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      
      // If adding this sentence would exceed chunk size
      if (currentChunk && (currentChunk.length + sentence.length + 1) > this.chunkSize) {
        // Save current chunk
        if (currentChunk.trim()) {
          chunks.push({
            id: `${sourceFile}-chunk-${chunkIndex}`,
            content: currentChunk.trim(),
            sourceFile: sourceFile,
            chunkIndex: chunkIndex
          });
          chunkIndex++;
          
          // Create overlap by keeping part of the previous chunk
          const overlapText = this.extractOverlap(currentChunk);
          currentChunk = overlapText;
        } else {
          currentChunk = '';
        }
      }
      
      // Add sentence to current chunk
      if (currentChunk) {
        currentChunk += ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    }
    
    // Add final chunk if there's remaining content
    if (currentChunk.trim()) {
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIndex}`,
        content: currentChunk.trim(),
        sourceFile: sourceFile,
        chunkIndex: chunkIndex
      });
    }
    
    return chunks;
  }

  /**
   * Extract overlap text from the end of a chunk (approximately 10-20% of chunk size)
   * Tries to break at sentence boundaries for better context preservation
   */
  private extractOverlap(text: string): string {
    const overlapSize = Math.floor(this.chunkSize * 0.15); // 15% overlap
    
    if (text.length <= overlapSize) {
      return text;
    }
    
    // Try to find a sentence boundary within the overlap region
    const overlapStart = text.length - overlapSize;
    const overlapText = text.substring(overlapStart);
    
    // Look for sentence boundaries (. ! ?) in the overlap region
    const sentenceBoundary = overlapText.search(/[.!?]\s+/);
    
    if (sentenceBoundary !== -1) {
      // Start from the sentence boundary
      return overlapText.substring(sentenceBoundary + 2).trim();
    }
    
    // If no sentence boundary found, return the overlap as-is
    return overlapText.trim();
  }
}
