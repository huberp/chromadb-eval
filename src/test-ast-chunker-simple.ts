/**
 * Simple test script for AST chunker with a test markdown file
 */

import * as fs from 'fs';
import { AstDocumentChunker } from './chunking/ast-chunker';

const testMarkdown = fs.readFileSync('/tmp/test-markdown.md', 'utf-8');
const chunker = new AstDocumentChunker({ chunkSize: 500, chunkOverlap: 100 });

const chunks = chunker.chunkMarkdown(testMarkdown, 'test.md');

console.log(`Created ${chunks.length} chunks\n`);

chunks.forEach((chunk, idx) => {
  console.log(`\n=== Chunk ${idx + 1} ===`);
  console.log(`Type: ${chunk.metadata?.chunkType}`);
  console.log(`AST Node Types: ${JSON.stringify(chunk.metadata?.astNodeTypes)}`);
  console.log(`Language: ${chunk.metadata?.language || 'none'}`);
  console.log(`Header: ${chunk.metadata?.section}`);
  console.log(`Content (${chunk.content.length} chars):`);
  console.log(chunk.content);
});
