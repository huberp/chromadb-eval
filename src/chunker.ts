import * as fs from 'fs';
import * as path from 'path';

export interface ChunkMetadata {
  sourceFile: string;
  chunkIndex: number;
  headerHierarchy?: string[];  // e.g., ["Introduction to SIMD", "How SIMD Works"]
  section?: string;             // e.g., "How SIMD Works"
  chunkType?: 'text' | 'code' | 'list' | 'table';  // Type of content
  language?: string;            // For code blocks
}

export interface Chunk {
  id: string;
  content: string;
  sourceFile: string;
  chunkIndex: number;
  metadata?: ChunkMetadata;
}

export class DocumentChunker {
  private chunkSize: number;
  private chunkOverlap: number;
  
  // Constants for content detection and chunking
  private readonly MIN_TEXT_CHUNK_SIZE = 50;  // Minimum text size to create a chunk
  private readonly LIST_DETECTION_THRESHOLD = 0.5;  // 50% of lines must be list items

  // Default: 1000 chars ≈ 250 tokens (middle of 200-500 token range)
  // Overlap: 150 chars ≈ 1-2 sentences
  constructor(chunkSize: number = 1000, chunkOverlap: number = 150) {
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
   * Chunk a single text into overlapping segments using markdown structure
   * This implementation follows Mistral's recommendations:
   * - Splits at markdown headers as primary boundaries
   * - Preserves header hierarchy in metadata
   * - Handles code blocks and tables separately
   * - Uses 1-2 sentence overlap
   * - Target chunk size: 200-500 tokens (≈1000 chars)
   */
  private chunkText(text: string, sourceFile: string): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;
    
    // Extract sections by headers
    const sections = this.extractSections(text);
    
    for (const section of sections) {
      // Check if section contains code blocks
      const codeBlocks = this.extractCodeBlocks(section.content);
      
      if (codeBlocks.length > 0) {
        // Handle sections with code blocks
        const sectionChunks = this.chunkSectionWithCode(
          section,
          codeBlocks,
          sourceFile,
          chunkIndex
        );
        chunks.push(...sectionChunks);
        chunkIndex += sectionChunks.length;
      } else {
        // Handle regular text sections
        const sectionChunks = this.chunkSection(
          section,
          sourceFile,
          chunkIndex
        );
        chunks.push(...sectionChunks);
        chunkIndex += sectionChunks.length;
      }
    }
    
    return chunks;
  }

  /**
   * Extract sections based on markdown headers
   */
  private extractSections(text: string): Array<{
    headers: string[];
    content: string;
    level: number;
  }> {
    const sections: Array<{ headers: string[]; content: string; level: number }> = [];
    const lines = text.split('\n');
    
    let currentHeaders: string[] = [];
    let currentContent: string[] = [];
    let currentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section if it has content
        if (currentContent.length > 0) {
          sections.push({
            headers: [...currentHeaders],
            content: currentContent.join('\n').trim(),
            level: currentLevel
          });
          currentContent = [];
        }
        
        const level = headerMatch[1].length;
        const headerText = headerMatch[2].trim();
        
        // Update header hierarchy - keep only headers above current level
        currentHeaders = currentHeaders.slice(0, level - 1);
        currentHeaders.push(headerText);
        currentLevel = level;
      } else {
        currentContent.push(line);
      }
    }
    
    // Add final section
    if (currentContent.length > 0) {
      sections.push({
        headers: [...currentHeaders],
        content: currentContent.join('\n').trim(),
        level: currentLevel
      });
    }
    
    return sections;
  }

  /**
   * Extract code blocks from text
   */
  private extractCodeBlocks(text: string): Array<{
    code: string;
    language: string;
    start: number;
    end: number;
  }> {
    const codeBlocks: Array<{ code: string; language: string; start: number; end: number }> = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      codeBlocks.push({
        code: match[2].trim(),
        language: match[1] || 'text',
        start: match.index,
        end: match.index + match[0].length
      });
    }
    
    return codeBlocks;
  }

  /**
   * Chunk a section that contains code blocks
   */
  private chunkSectionWithCode(
    section: { headers: string[]; content: string; level: number },
    codeBlocks: Array<{ code: string; language: string; start: number; end: number }>,
    sourceFile: string,
    startIndex: number
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = startIndex;
    let lastEnd = 0;
    
    for (const block of codeBlocks) {
      // Add text before code block if substantial
      const textBefore = section.content.substring(lastEnd, block.start).trim();
      if (textBefore.length > this.MIN_TEXT_CHUNK_SIZE) {
        const textChunks = this.chunkTextContent(
          textBefore,
          section.headers,
          sourceFile,
          chunkIndex,
          'text'
        );
        chunks.push(...textChunks);
        chunkIndex += textChunks.length;
      }
      
      // Add code block as separate chunk
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIndex}`,
        content: block.code,
        sourceFile: sourceFile,
        chunkIndex: chunkIndex,
        metadata: {
          sourceFile: sourceFile,
          chunkIndex: chunkIndex,
          headerHierarchy: section.headers.filter(h => h),
          section: section.headers[section.headers.length - 1],
          chunkType: 'code',
          language: block.language
        }
      });
      chunkIndex++;
      lastEnd = block.end;
    }
    
    // Add remaining text after last code block
    const textAfter = section.content.substring(lastEnd).trim();
    if (textAfter.length > this.MIN_TEXT_CHUNK_SIZE) {
      const textChunks = this.chunkTextContent(
        textAfter,
        section.headers,
        sourceFile,
        chunkIndex,
        'text'
      );
      chunks.push(...textChunks);
    }
    
    return chunks;
  }

  /**
   * Chunk a regular section without code blocks
   */
  private chunkSection(
    section: { headers: string[]; content: string; level: number },
    sourceFile: string,
    startIndex: number
  ): Chunk[] {
    // Determine chunk type (list, table, or text)
    const chunkType = this.detectContentType(section.content);
    
    return this.chunkTextContent(
      section.content,
      section.headers,
      sourceFile,
      startIndex,
      chunkType
    );
  }

  /**
   * Detect content type (list, table, or text)
   */
  private detectContentType(content: string): 'text' | 'list' | 'table' {
    const lines = content.split('\n');
    // Match both unordered (-, *, +) and ordered (1., 2., etc.) lists
    const listLines = lines.filter(l => l.trim().match(/^([-*+]|\d+\.)\s+/));
    const tableLines = lines.filter(l => l.includes('|'));
    
    if (listLines.length > lines.length * this.LIST_DETECTION_THRESHOLD) return 'list';
    if (tableLines.length > 2) return 'table';
    return 'text';
  }

  /**
   * Chunk text content with overlap
   */
  private chunkTextContent(
    text: string,
    headers: string[],
    sourceFile: string,
    startIndex: number,
    chunkType: 'text' | 'code' | 'list' | 'table'
  ): Chunk[] {
    const chunks: Chunk[] = [];
    
    // For lists and tables, try to keep them together if possible
    if ((chunkType === 'list' || chunkType === 'table') && text.length <= this.chunkSize) {
      chunks.push({
        id: `${sourceFile}-chunk-${startIndex}`,
        content: text,
        sourceFile: sourceFile,
        chunkIndex: startIndex,
        metadata: {
          sourceFile: sourceFile,
          chunkIndex: startIndex,
          headerHierarchy: headers.filter(h => h),
          section: headers[headers.length - 1],
          chunkType: chunkType
        }
      });
      return chunks;
    }
    
    // Split by paragraphs
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    
    let currentChunk = '';
    let chunkIndex = startIndex;
    let previousChunk = '';
    
    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (!trimmedPara) continue;
      
      // Check if adding paragraph exceeds chunk size
      if (currentChunk && (currentChunk.length + trimmedPara.length + 2) > this.chunkSize) {
        // Save current chunk
        chunks.push({
          id: `${sourceFile}-chunk-${chunkIndex}`,
          content: currentChunk.trim(),
          sourceFile: sourceFile,
          chunkIndex: chunkIndex,
          metadata: {
            sourceFile: sourceFile,
            chunkIndex: chunkIndex,
            headerHierarchy: headers.filter(h => h),
            section: headers[headers.length - 1],
            chunkType: chunkType
          }
        });
        
        previousChunk = currentChunk;
        chunkIndex++;
        
        // Create overlap with 1-2 sentences from previous chunk
        const overlap = this.extractSentenceOverlap(currentChunk);
        currentChunk = overlap;
        
        // If single paragraph is too large, split by sentences
        if (trimmedPara.length > this.chunkSize) {
          const sentenceChunks = this.splitBySentencesWithMetadata(
            trimmedPara,
            headers,
            sourceFile,
            chunkIndex,
            chunkType,
            currentChunk
          );
          chunks.push(...sentenceChunks);
          chunkIndex += sentenceChunks.length;
          currentChunk = sentenceChunks.length > 0 ? 
            this.extractSentenceOverlap(sentenceChunks[sentenceChunks.length - 1].content) : '';
          continue;
        }
      }
      
      // Add paragraph to current chunk
      if (currentChunk) {
        currentChunk += '\n\n' + trimmedPara;
      } else {
        currentChunk = trimmedPara;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIndex}`,
        content: currentChunk.trim(),
        sourceFile: sourceFile,
        chunkIndex: chunkIndex,
        metadata: {
          sourceFile: sourceFile,
          chunkIndex: chunkIndex,
          headerHierarchy: headers.filter(h => h),
          section: headers[headers.length - 1],
          chunkType: chunkType
        }
      });
    }
    
    return chunks;
  }

  /**
   * Split a large paragraph by sentences while respecting semantic boundaries
   */
  private splitBySentencesWithMetadata(
    text: string,
    headers: string[],
    sourceFile: string,
    startIndex: number,
    chunkType: 'text' | 'code' | 'list' | 'table',
    initialOverlap: string = ''
  ): Chunk[] {
    const chunks: Chunk[] = [];
    // Split by sentence boundaries (. ! ?) followed by space or newline
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = initialOverlap;
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
            chunkIndex: chunkIndex,
            metadata: {
              sourceFile: sourceFile,
              chunkIndex: chunkIndex,
              headerHierarchy: headers.filter(h => h),
              section: headers[headers.length - 1],
              chunkType: chunkType
            }
          });
          chunkIndex++;
          
          // Create overlap with 1-2 sentences
          const overlap = this.extractSentenceOverlap(currentChunk);
          currentChunk = overlap;
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
        chunkIndex: chunkIndex,
        metadata: {
          sourceFile: sourceFile,
          chunkIndex: chunkIndex,
          headerHierarchy: headers.filter(h => h),
          section: headers[headers.length - 1],
          chunkType: chunkType
        }
      });
    }
    
    return chunks;
  }

  /**
   * Extract 1-2 sentences for overlap (as recommended by Mistral)
   */
  private extractSentenceOverlap(text: string): string {
    // Split into sentences
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    // Take last 1-2 sentences (up to overlap size)
    if (sentences.length === 0) return '';
    
    // Try to get 2 sentences if available
    if (sentences.length >= 2) {
      const lastTwo = sentences.slice(-2).join(' ');
      if (lastTwo.length <= this.chunkOverlap) {
        return lastTwo;
      }
    }
    
    // Fall back to 1 sentence
    const lastOne = sentences[sentences.length - 1];
    if (lastOne.length <= this.chunkOverlap) {
      return lastOne;
    }
    
    // If even 1 sentence is too long, use empty overlap to avoid breaking semantic meaning
    // This is better than truncating mid-sentence
    return '';
  }
}
