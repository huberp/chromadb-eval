/**
 * Markdown AST parsing utilities.
 * 
 * This module provides infrastructure for parsing markdown documents into
 * Abstract Syntax Trees (AST) using the unified/remark ecosystem.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root, Content, Heading, PhrasingContent } from 'mdast';

// Re-export types for use in other modules
export type { Root, Content } from 'mdast';

/**
 * Represents a section of a markdown document with its heading hierarchy
 * and associated content nodes.
 */
export interface AstSection {
  /** Hierarchy of headings, e.g. ["SIMD", "Programming SIMD in C++"] */
  headings: string[];
  /** Block-level nodes in this section */
  nodes: Content[];
}

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

/**
 * Extract text content from a heading node.
 * Recursively processes phrasing content to extract plain text.
 * 
 * @param node - The heading node to extract text from
 * @returns The plain text content of the heading
 */
function extractHeadingText(node: Heading): string {
  function extractText(content: PhrasingContent): string {
    switch (content.type) {
      case 'text':
        return content.value;
      case 'emphasis':
      case 'strong':
      case 'delete':
      case 'link':
        return content.children.map(extractText).join('');
      case 'inlineCode':
        return content.value;
      case 'image':
        return content.alt || '';
      case 'break':
        return '\n';
      default:
        return '';
    }
  }
  
  return node.children.map(extractText).join('');
}

/**
 * Extract sections from a markdown AST based on heading hierarchy.
 * 
 * This function processes the root node's children in order, maintaining a heading
 * stack based on heading depth. When a heading is encountered, the stack is updated.
 * Non-heading nodes are grouped with the current heading hierarchy into sections.
 * 
 * @param root - The root node of the markdown AST
 * @returns An array of sections, each containing a heading hierarchy and associated nodes
 * 
 * @example
 * ```typescript
 * const ast = parseMarkdownToAst('# Title\n\nSome content\n\n## Section\n\nMore content');
 * const sections = extractAstSections(ast);
 * // sections[0] = { headings: ['Title'], nodes: [paragraph] }
 * // sections[1] = { headings: ['Title', 'Section'], nodes: [paragraph] }
 * ```
 */
export function extractAstSections(root: Root): AstSection[] {
  const sections: AstSection[] = [];
  const headingStack: string[] = [];
  let currentNodes: Content[] = [];
  
  for (const node of root.children) {
    if (node.type === 'heading') {
      // Save the previous section if it has content
      if (currentNodes.length > 0) {
        sections.push({
          // Filter out any undefined entries in the heading stack that may occur
          // when a document has headings without all parent levels defined
          // (e.g., ## Section without a # Title before it)
          headings: headingStack.filter(h => h !== undefined),
          nodes: currentNodes
        });
        currentNodes = [];
      }
      
      // Update the heading stack based on depth
      // Keep only headings above the current level (depth - 1)
      headingStack.length = node.depth - 1;
      // Set the current level to this heading's text
      headingStack[node.depth - 1] = extractHeadingText(node);
    } else {
      // Non-heading block node - add to current section
      currentNodes.push(node);
    }
  }
  
  // Add the final section if it has content
  if (currentNodes.length > 0) {
    sections.push({
      // Filter out any undefined entries in the heading stack that may occur
      // when a document has headings without all parent levels defined
      // (e.g., ## Section without a # Title before it)
      headings: headingStack.filter(h => h !== undefined),
      nodes: currentNodes
    });
  }
  
  return sections;
}
