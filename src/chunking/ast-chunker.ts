/**
 * AST-based markdown document chunker.
 * 
 * This implementation uses remark/mdast for structure-aware chunking,
 * providing better understanding of markdown structure compared to
 * string-based approaches.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Content, Paragraph, Code, List, Table, Blockquote, PhrasingContent } from 'mdast';
import { parseMarkdownToAst, extractAstSections, AstSection } from './markdown-ast';
import { ChunkMetadata } from './legacy-chunker';

/**
 * Extended chunk metadata that includes AST node type information.
 */
export interface AstChunkMetadata extends ChunkMetadata {
  /** List of mdast node types contributing to this chunk */
  astNodeTypes?: string[];
}

/**
 * Chunk with AST-aware metadata.
 */
export interface AstChunk {
  id: string;
  content: string;
  sourceFile: string;
  chunkIndex: number;
  metadata?: AstChunkMetadata;
}

/**
 * Configuration options for the AST-based chunker.
 */
export interface AstChunkerOptions {
  /** Target chunk size in characters (default: 1000) */
  chunkSize?: number;
  /** Overlap size between chunks in characters (default: 150) */
  chunkOverlap?: number;
}

/**
 * AST-based document chunker that uses remark/mdast for structure-aware chunking.
 * 
 * This chunker parses markdown into an Abstract Syntax Tree and uses structural
 * information to create more semantically meaningful chunks. It maintains the same
 * chunking strategies as the legacy chunker (chunk size, overlap, special handling
 * for code blocks, lists, and tables) while leveraging AST information.
 */
export class AstDocumentChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(options: AstChunkerOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 150;
  }

  /**
   * Load and chunk all markdown files from a directory.
   * 
   * @param directoryPath - Path to directory containing markdown files
   * @returns Promise resolving to array of chunks
   */
  async chunkDocuments(directoryPath: string): Promise<AstChunk[]> {
    const chunks: AstChunk[] = [];
    const files = fs.readdirSync(directoryPath);
    
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(directoryPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileChunks = this.chunkMarkdown(content, file);
        chunks.push(...fileChunks);
      }
    }
    
    return chunks;
  }

  /**
   * Chunk a markdown string using AST-based analysis.
   * 
   * @param markdown - The markdown text to chunk
   * @param sourceFile - Source file name for metadata
   * @returns Array of AST-aware chunks
   */
  chunkMarkdown(markdown: string, sourceFile: string): AstChunk[] {
    const ast = parseMarkdownToAst(markdown);
    const sections = extractAstSections(ast);
    
    const chunks: AstChunk[] = [];
    let chunkIndex = 0;
    
    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, sourceFile, chunkIndex);
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }
    
    return chunks;
  }

  /**
   * Chunk a single section by grouping nodes into chunk candidates.
   */
  private chunkSection(section: AstSection, sourceFile: string, startIndex: number): AstChunk[] {
    const chunks: AstChunk[] = [];
    let chunkIndex = startIndex;
    
    // Group nodes into chunk candidates
    const nodeGroups = this.groupNodesIntoChunks(section.nodes);
    
    // Format the section heading to prepend to chunks
    const headingPrefix = this.formatHeadingHierarchy(section.headings);
    
    let previousChunkContent = '';
    
    for (const group of nodeGroups) {
      const content = this.serializeNodes(group.nodes);
      const chunkType = this.determineChunkType(group.nodes);
      const astNodeTypes = this.extractNodeTypes(group.nodes);
      const language = this.extractLanguage(group.nodes);
      
      // Apply overlap from previous chunk if not the first chunk
      let finalContent = content;
      if (chunkIndex > startIndex && previousChunkContent) {
        const overlap = this.extractSentenceOverlap(previousChunkContent);
        if (overlap) {
          finalContent = overlap + '\n\n' + content;
        }
      }
      
      // Prepend the heading to the chunk content
      if (headingPrefix) {
        finalContent = headingPrefix + '\n\n' + finalContent;
      }
      
      chunks.push({
        id: `${sourceFile}-chunk-${chunkIndex}`,
        content: finalContent.trim(),
        sourceFile: sourceFile,
        chunkIndex: chunkIndex,
        metadata: {
          sourceFile: sourceFile,
          chunkIndex: chunkIndex,
          headerHierarchy: section.headings.filter(h => h),
          section: section.headings[section.headings.length - 1],
          chunkType: chunkType,
          astNodeTypes: astNodeTypes,
          language: language
        }
      });
      
      previousChunkContent = content;
      chunkIndex++;
    }
    
    return chunks;
  }

  /**
   * Group nodes into chunk candidates based on size and type.
   */
  private groupNodesIntoChunks(nodes: Content[]): Array<{ nodes: Content[] }> {
    const groups: Array<{ nodes: Content[] }> = [];
    let currentGroup: Content[] = [];
    let currentSize = 0;
    
    for (const node of nodes) {
      const nodeText = this.serializeNode(node);
      const nodeSize = nodeText.length;
      
      // Special handling for code blocks - treat as their own chunk
      if (node.type === 'code') {
        // Save current group if it has content
        if (currentGroup.length > 0) {
          groups.push({ nodes: currentGroup });
          currentGroup = [];
          currentSize = 0;
        }
        
        // Code block becomes its own chunk
        // Optionally include a small neighboring paragraph as context if total size stays ≤ chunkSize
        groups.push({ nodes: [node] });
        continue;
      }
      
      // Special handling for lists and tables - try to keep as single chunk
      if ((node.type === 'list' || node.type === 'table') && nodeSize <= this.chunkSize) {
        // Save current group if it has content
        if (currentGroup.length > 0) {
          groups.push({ nodes: currentGroup });
          currentGroup = [];
          currentSize = 0;
        }
        
        // List/table becomes its own chunk
        groups.push({ nodes: [node] });
        continue;
      }
      
      // For paragraphs and other nodes, combine until chunkSize is reached
      if (currentSize + nodeSize > this.chunkSize && currentGroup.length > 0) {
        // Current group is full, save it
        groups.push({ nodes: currentGroup });
        currentGroup = [node];
        currentSize = nodeSize;
      } else {
        // Add to current group
        currentGroup.push(node);
        currentSize += nodeSize;
      }
    }
    
    // Add final group if it has content
    if (currentGroup.length > 0) {
      groups.push({ nodes: currentGroup });
    }
    
    return groups;
  }

  /**
   * Serialize a single AST node to text.
   */
  private serializeNode(node: Content): string {
    switch (node.type) {
      case 'paragraph':
        return this.serializeParagraph(node);
      case 'code':
        return this.serializeCode(node);
      case 'list':
        return this.serializeList(node);
      case 'table':
        return this.serializeTable(node);
      case 'blockquote':
        return this.serializeBlockquote(node);
      case 'heading':
        // Headings are handled separately in sections, but just in case
        return '';
      case 'thematicBreak':
        return '---';
      case 'html':
        return node.value;
      default:
        return '';
    }
  }

  /**
   * Serialize multiple nodes to text.
   */
  private serializeNodes(nodes: Content[]): string {
    return nodes.map(node => this.serializeNode(node)).filter(s => s).join('\n\n');
  }

  /**
   * Serialize a paragraph node.
   */
  private serializeParagraph(node: Paragraph): string {
    return this.serializePhrasingContent(node.children);
  }

  /**
   * Serialize phrasing content (inline content).
   */
  private serializePhrasingContent(children: PhrasingContent[]): string {
    return children.map(child => {
      switch (child.type) {
        case 'text':
          return child.value;
        case 'emphasis':
          return `*${this.serializePhrasingContent(child.children)}*`;
        case 'strong':
          return `**${this.serializePhrasingContent(child.children)}**`;
        case 'delete':
          return `~~${this.serializePhrasingContent(child.children)}~~`;
        case 'inlineCode':
          return `\`${child.value}\``;
        case 'link':
          return `[${this.serializePhrasingContent(child.children)}](${child.url})`;
        case 'image':
          return `![${child.alt || ''}](${child.url})`;
        case 'break':
          return '\n';
        default:
          return '';
      }
    }).join('');
  }

  /**
   * Serialize a code block node.
   */
  private serializeCode(node: Code): string {
    const lang = node.lang || '';
    return `\`\`\`${lang}\n${node.value}\n\`\`\``;
  }

  /**
   * Serialize a list node.
   */
  private serializeList(node: List): string {
    return node.children.map((item, index) => {
      const prefix = node.ordered ? `${(node.start || 1) + index}. ` : '- ';
      const content = item.children.map(child => {
        if (child.type === 'paragraph') {
          return this.serializeParagraph(child);
        } else if (child.type === 'list') {
          // Nested list - indent it
          return this.serializeList(child).split('\n').map(line => '  ' + line).join('\n');
        }
        return '';
      }).filter(s => s).join('\n');
      return prefix + content;
    }).join('\n');
  }

  /**
   * Serialize a table node.
   */
  private serializeTable(node: Table): string {
    const rows = node.children.map(row => {
      const cells = row.children.map(cell => {
        return this.serializePhrasingContent(cell.children);
      });
      return '| ' + cells.join(' | ') + ' |';
    });
    
    // Add separator after header
    if (rows.length > 0) {
      const headerSeparator = '|' + node.children[0].children.map(() => '---').join('|') + '|';
      return rows[0] + '\n' + headerSeparator + '\n' + rows.slice(1).join('\n');
    }
    
    return rows.join('\n');
  }

  /**
   * Serialize a blockquote node.
   */
  private serializeBlockquote(node: Blockquote): string {
    return node.children.map(child => {
      const content = this.serializeNode(child);
      return content.split('\n').map(line => '> ' + line).join('\n');
    }).join('\n');
  }

  /**
   * Determine the primary chunk type from nodes.
   */
  private determineChunkType(nodes: Content[]): 'text' | 'code' | 'list' | 'table' {
    // Find the dominant node type
    const typeCounts: Record<string, number> = {};
    
    for (const node of nodes) {
      const type = node.type;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    
    // Map AST node types to chunk types
    if (typeCounts['code'] > 0) return 'code';
    if (typeCounts['table'] > 0) return 'table';
    if (typeCounts['list'] > 0) return 'list';
    return 'text';
  }

  /**
   * Extract all AST node types from nodes.
   */
  private extractNodeTypes(nodes: Content[]): string[] {
    const types = new Set<string>();
    
    for (const node of nodes) {
      types.add(node.type);
    }
    
    return Array.from(types).sort();
  }

  /**
   * Extract language from code nodes if present.
   */
  private extractLanguage(nodes: Content[]): string | undefined {
    for (const node of nodes) {
      if (node.type === 'code' && node.lang) {
        return node.lang;
      }
    }
    return undefined;
  }

  /**
   * Format the heading hierarchy into markdown heading format.
   * Only formats the deepest (current) heading.
   * 
   * @param headings - Array of heading texts from top to bottom of hierarchy
   * @returns Formatted markdown heading (e.g., "## Section Name")
   */
  private formatHeadingHierarchy(headings: string[]): string {
    if (headings.length === 0) {
      return '';
    }
    
    // Use the deepest heading level
    const currentHeading = headings[headings.length - 1];
    const level = headings.length;
    
    // Format as markdown heading with appropriate number of #
    const prefix = '#'.repeat(level);
    return `${prefix} ${currentHeading}`;
  }

  /**
   * Extract 1-2 sentences for overlap (matching legacy chunker strategy).
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
    return '';
  }
}
