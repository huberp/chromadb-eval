/**
 * Markdown AST parsing utilities.
 * 
 * This module provides infrastructure for parsing markdown documents into
 * Abstract Syntax Trees (AST) using the unified/remark ecosystem.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';

// Re-export Root type for use in other modules
export type { Root } from 'mdast';

/**
 * Parse markdown text into an mdast Abstract Syntax Tree.
 * 
 * This function uses unified with remark-parse and remark-gfm plugins
 * to convert markdown text into a structured AST representation.
 * 
 * @param markdown - The markdown text to parse
 * @returns The mdast Root node representing the parsed document
 * @throws Error if parsing fails, with a clear message including the input preview
 */
export function parseMarkdownToAst(markdown: string): Root {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm);
    
    const ast = processor.parse(markdown);
    return ast;
  } catch (error) {
    const preview = markdown.substring(0, 100).replace(/\n/g, ' ');
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse markdown to AST: ${errorMessage}\n` +
      `Input preview: "${preview}${markdown.length > 100 ? '...' : ''}"`
    );
  }
}
