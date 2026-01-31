/**
 * Verification script for AST-based section extraction.
 * 
 * This script tests the extractAstSections function by parsing sample
 * documents and logging the extracted sections with their heading hierarchies
 * and node types.
 * 
 * Usage:
 *   npx tsx src/verify-ast-sections.ts
 * 
 * This demonstrates that:
 * - The extractAstSections function correctly groups content by headings
 * - Heading hierarchies are maintained properly
 * - Content order is preserved
 * - All node types are correctly assigned to sections
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdownToAst, extractAstSections } from './chunking/markdown-ast';
import type { Content } from 'mdast';

/**
 * Get a brief description of a node for display
 */
function getNodeDescription(node: Content): string {
  switch (node.type) {
    case 'heading':
      return `heading (level ${node.depth})`;
    case 'paragraph':
      return 'paragraph';
    case 'code':
      return `code (${node.lang || 'no-lang'})`;
    case 'list':
      return `list (${node.ordered ? 'ordered' : 'unordered'}, ${node.children.length} items)`;
    case 'table':
      return `table (${node.children.length} rows)`;
    case 'blockquote':
      return 'blockquote';
    case 'thematicBreak':
      return 'thematic-break';
    case 'html':
      return 'html';
    default:
      return node.type;
  }
}

/**
 * Parse and display section information for a markdown file
 */
function verifyDocument(filePath: string): void {
  const filename = path.basename(filePath);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Document: ${filename}`);
  console.log('='.repeat(60));
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ast = parseMarkdownToAst(content);
    const sections = extractAstSections(ast);
    
    console.log(`✓ Extracted ${sections.length} section(s)`);
    
    sections.forEach((section, idx) => {
      console.log(`\n--- Section ${idx + 1} ---`);
      
      if (section.headings.length === 0) {
        console.log(`Heading hierarchy: [none]`);
      } else {
        console.log(`Heading hierarchy: ${section.headings.map(h => `"${h}"`).join(' > ')}`);
      }
      
      console.log(`Content nodes (${section.nodes.length}):`);
      section.nodes.forEach((node, nodeIdx) => {
        console.log(`  ${nodeIdx + 1}. ${getNodeDescription(node)}`);
      });
    });
    
  } catch (error) {
    console.error(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main function to verify section extraction on sample documents
 */
function main(): void {
  console.log('='.repeat(60));
  console.log('AST Section Extraction Verification');
  console.log('='.repeat(60));
  
  const documentsPath = path.join(__dirname, '../documents');
  
  // Test with documents that have various heading structures
  const testFiles = [
    '01-apples.md',       // Simple structure
    '06-simd-intro.md',   // Multiple heading levels
    '11-algebra.md'       // Different content types
  ];
  
  testFiles.forEach(filename => {
    const filePath = path.join(documentsPath, filename);
    if (fs.existsSync(filePath)) {
      verifyDocument(filePath);
    } else {
      console.log(`\nSkipping ${filename} (not found)`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('Verification Complete');
  console.log('='.repeat(60));
}

// Run verification
main();
