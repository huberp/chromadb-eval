/**
 * Verification script for markdown AST parsing.
 * 
 * This script tests the parseMarkdownToAst function by parsing sample
 * documents and logging the top-level node types to verify parsing works.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdownToAst } from './chunking/markdown-ast';
import type { Root, Content } from 'mdast';

/**
 * Get the type of a node, including specific details for certain node types
 */
function getNodeDescription(node: Content): string {
  switch (node.type) {
    case 'heading':
      return `heading (level ${node.depth})`;
    case 'code':
      return `code (${node.lang || 'no-lang'})`;
    case 'list':
      return `list (${node.ordered ? 'ordered' : 'unordered'})`;
    case 'table':
      return `table (${node.children.length} rows)`;
    default:
      return node.type;
  }
}

/**
 * Parse and display information about a markdown file
 */
function verifyDocument(filePath: string): void {
  const filename = path.basename(filePath);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Document: ${filename}`);
  console.log('='.repeat(60));
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ast: Root = parseMarkdownToAst(content);
    
    console.log(`✓ Parsed successfully`);
    console.log(`  Total top-level nodes: ${ast.children.length}`);
    
    // Count node types
    const nodeTypeCounts = new Map<string, number>();
    ast.children.forEach((node) => {
      const desc = getNodeDescription(node);
      nodeTypeCounts.set(desc, (nodeTypeCounts.get(desc) || 0) + 1);
    });
    
    console.log(`\nNode type distribution:`);
    const sortedTypes = Array.from(nodeTypeCounts.entries())
      .sort((a, b) => b[1] - a[1]);
    
    sortedTypes.forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
    // Show first few nodes
    console.log(`\nFirst 5 top-level nodes:`);
    ast.children.slice(0, 5).forEach((node, idx) => {
      console.log(`  ${idx + 1}. ${getNodeDescription(node)}`);
    });
    
  } catch (error) {
    console.error(`✗ Failed to parse: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main function to verify parsing on sample documents
 */
function main(): void {
  console.log('='.repeat(60));
  console.log('Markdown AST Parsing Verification');
  console.log('='.repeat(60));
  
  const documentsPath = path.join(__dirname, '../documents');
  
  // Test with a few sample documents
  const testFiles = [
    '01-apples.md',
    '06-simd-intro.md',
    '11-algebra.md'
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
