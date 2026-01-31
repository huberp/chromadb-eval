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
   * Chunk a single text into overlapping segments
   */
  private chunkText(text: string, sourceFile: string): Chunk[] {
    const chunks: Chunk[] = [];
    const words = text.split(/\s+/);
    
    let currentChunk: string[] = [];
    let chunkIndex = 0;
    
    for (let i = 0; i < words.length; i++) {
      currentChunk.push(words[i]);
      
      // Check if we've reached the chunk size
      if (currentChunk.join(' ').length >= this.chunkSize) {
        const chunkContent = currentChunk.join(' ');
        chunks.push({
          id: `${sourceFile}-chunk-${chunkIndex}`,
          content: chunkContent,
          sourceFile: sourceFile,
          chunkIndex: chunkIndex
        });
        
        // Create overlap for next chunk
        const overlapWords = Math.floor(currentChunk.length * this.chunkOverlap / this.chunkSize);
        currentChunk = currentChunk.slice(-overlapWords);
        chunkIndex++;
      }
    }
    
    // Add remaining content as final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIndex}`,
        content: currentChunk.join(' '),
        sourceFile: sourceFile,
        chunkIndex: chunkIndex
      });
    }
    
    return chunks;
  }
}
