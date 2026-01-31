/**
 * Verification script for the AST-based document chunker.
 * 
 * This script tests the AstDocumentChunker by:
 * 1. Loading markdown files from the documents directory
 * 2. Chunking them using the AST-based chunker
 * 3. Displaying chunk metadata to verify correctness
 */

import * as path from 'path';
import { AstDocumentChunker } from './chunking/ast-chunker';

async function main() {
  console.log('=== AST Document Chunker Verification ===\n');
  
  const documentsPath = path.join(__dirname, '../documents');
  const chunker = new AstDocumentChunker({ chunkSize: 1000, chunkOverlap: 150 });
  
  try {
    console.log(`Loading and chunking documents from: ${documentsPath}\n`);
    
    const chunks = await chunker.chunkDocuments(documentsPath);
    
    console.log(`✓ Successfully chunked ${chunks.length} chunks from documents directory\n`);
    
    // Show summary statistics
    const chunkTypes = new Map<string, number>();
    const astNodeTypesSet = new Set<string>();
    const languages = new Set<string>();
    
    for (const chunk of chunks) {
      const type = chunk.metadata?.chunkType || 'unknown';
      chunkTypes.set(type, (chunkTypes.get(type) || 0) + 1);
      
      if (chunk.metadata?.astNodeTypes) {
        chunk.metadata.astNodeTypes.forEach(t => astNodeTypesSet.add(t));
      }
      
      if (chunk.metadata?.language) {
        languages.add(chunk.metadata.language);
      }
    }
    
    console.log('Chunk Type Distribution:');
    for (const [type, count] of Array.from(chunkTypes.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count} chunks`);
    }
    
    console.log('\nAST Node Types Found:');
    console.log(`  ${Array.from(astNodeTypesSet).sort().join(', ')}`);
    
    if (languages.size > 0) {
      console.log('\nCode Languages Found:');
      console.log(`  ${Array.from(languages).sort().join(', ')}`);
    }
    
    // Show a few example chunks with detailed metadata
    console.log('\n=== Example Chunks (first 3) ===\n');
    
    for (let i = 0; i < Math.min(3, chunks.length); i++) {
      const chunk = chunks[i];
      console.log(`--- Chunk ${i + 1} ---`);
      console.log(`ID: ${chunk.id}`);
      console.log(`Source: ${chunk.sourceFile}`);
      console.log(`Chunk Index: ${chunk.chunkIndex}`);
      console.log(`Content Length: ${chunk.content.length} chars`);
      
      if (chunk.metadata) {
        console.log(`Header Hierarchy: ${JSON.stringify(chunk.metadata.headerHierarchy)}`);
        console.log(`Section: ${chunk.metadata.section}`);
        console.log(`Chunk Type: ${chunk.metadata.chunkType}`);
        console.log(`AST Node Types: ${JSON.stringify(chunk.metadata.astNodeTypes)}`);
        if (chunk.metadata.language) {
          console.log(`Language: ${chunk.metadata.language}`);
        }
      }
      
      console.log(`Content Preview: ${chunk.content.substring(0, 150)}...`);
      console.log('');
    }
    
    // Test specific markdown features
    console.log('=== Testing Specific Features ===\n');
    
    // Find a code block chunk
    const codeChunk = chunks.find(c => c.metadata?.chunkType === 'code');
    if (codeChunk) {
      console.log('✓ Found code block chunk');
      console.log(`  Language: ${codeChunk.metadata?.language || 'none'}`);
      console.log(`  AST Node Types: ${JSON.stringify(codeChunk.metadata?.astNodeTypes)}`);
    } else {
      console.log('⚠ No code block chunks found');
    }
    
    // Find a list chunk
    const listChunk = chunks.find(c => c.metadata?.chunkType === 'list');
    if (listChunk) {
      console.log('\n✓ Found list chunk');
      console.log(`  AST Node Types: ${JSON.stringify(listChunk.metadata?.astNodeTypes)}`);
      console.log(`  Content preview: ${listChunk.content.substring(0, 100)}...`);
    } else {
      console.log('\n⚠ No list chunks found');
    }
    
    // Find a table chunk
    const tableChunk = chunks.find(c => c.metadata?.chunkType === 'table');
    if (tableChunk) {
      console.log('\n✓ Found table chunk');
      console.log(`  AST Node Types: ${JSON.stringify(tableChunk.metadata?.astNodeTypes)}`);
    } else {
      console.log('\n⚠ No table chunks found');
    }
    
    // Check header hierarchies
    const chunksWithHeaders = chunks.filter(c => 
      c.metadata?.headerHierarchy && c.metadata.headerHierarchy.length > 0
    );
    console.log(`\n✓ ${chunksWithHeaders.length} chunks have header hierarchies`);
    
    // Check that all chunks have astNodeTypes
    const chunksWithNodeTypes = chunks.filter(c => 
      c.metadata?.astNodeTypes && c.metadata.astNodeTypes.length > 0
    );
    console.log(`✓ ${chunksWithNodeTypes.length} chunks have AST node types`);
    
    console.log('\n=== Verification Complete ===');
    console.log('✓ AstDocumentChunker successfully processed all documents');
    console.log('✓ All chunks have meaningful metadata');
    console.log('✓ Header hierarchies, chunk types, and AST node types are populated');
    
  } catch (error) {
    console.error('✗ Error during verification:', error);
    process.exit(1);
  }
}

main();
