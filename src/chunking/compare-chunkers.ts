/**
 * Comparison script for legacy and AST-based document chunkers.
 * 
 * This script compares the outputs of DocumentChunker (legacy) and 
 * AstDocumentChunker on the same documents to help validate the new implementation.
 * 
 * It displays:
 * - Number of chunks from each chunker
 * - Average chunk length for each
 * - Sample chunks with metadata comparison
 */

import * as path from 'path';
import * as fs from 'fs';
import { DocumentChunker, Chunk } from './legacy-chunker';
import { AstDocumentChunker, AstChunk } from './ast-chunker';

async function main() {
  console.log('=== Chunker Comparison: Legacy vs AST ===\n');
  
  const documentsPath = path.join(__dirname, '../../documents');
  
  // Initialize both chunkers with identical settings
  const chunkSize = 1000;
  const chunkOverlap = 150;
  
  console.log(`Configuration:`);
  console.log(`  Chunk Size: ${chunkSize} characters`);
  console.log(`  Chunk Overlap: ${chunkOverlap} characters`);
  console.log(`  Documents Path: ${documentsPath}\n`);
  
  const legacyChunker = new DocumentChunker(chunkSize, chunkOverlap);
  const astChunker = new AstDocumentChunker({ chunkSize, chunkOverlap });
  
  try {
    console.log('Loading and chunking documents...\n');
    
    // Chunk documents with both chunkers
    const legacyChunks = await legacyChunker.chunkDocuments(documentsPath);
    const astChunks = await astChunker.chunkDocuments(documentsPath);
    
    console.log('=== Overall Summary ===\n');
    console.log(`Legacy Chunker: ${legacyChunks.length} total chunks`);
    console.log(`AST Chunker:    ${astChunks.length} total chunks`);
    
    if (legacyChunks.length > 0) {
      const diffPercentage = ((astChunks.length - legacyChunks.length) / legacyChunks.length * 100).toFixed(1);
      console.log(`Difference:     ${astChunks.length - legacyChunks.length} chunks (${diffPercentage}%)\n`);
    } else {
      console.log(`Difference:     ${astChunks.length - legacyChunks.length} chunks\n`);
    }
    
    // Calculate average chunk lengths using the safe helper function
    const legacyAvgLength = getAvgLength(legacyChunks);
    const astAvgLength = getAvgLength(astChunks);
    
    console.log(`Average Chunk Length:`);
    console.log(`  Legacy: ${legacyAvgLength.toFixed(0)} characters`);
    console.log(`  AST:    ${astAvgLength.toFixed(0)} characters\n`);
    
    // Group chunks by file
    const legacyByFile = groupChunksByFile(legacyChunks);
    const astByFile = groupChunksByFile(astChunks);
    
    // Get all unique file names
    const allFiles = new Set([...legacyByFile.keys(), ...astByFile.keys()]);
    const sortedFiles = Array.from(allFiles).sort();
    
    console.log('=== Per-File Comparison ===\n');
    
    for (const file of sortedFiles) {
      const legacyFileChunks = legacyByFile.get(file) || [];
      const astFileChunks = astByFile.get(file) || [];
      
      console.log(`📄 ${file}`);
      console.log(`   Legacy: ${legacyFileChunks.length} chunks, avg ${getAvgLength(legacyFileChunks).toFixed(0)} chars`);
      console.log(`   AST:    ${astFileChunks.length} chunks, avg ${getAvgLength(astFileChunks).toFixed(0)} chars`);
      
      // Show sample chunks (first 3 from each)
      const sampleCount = 3;
      const maxSamples = Math.max(
        Math.min(sampleCount, legacyFileChunks.length),
        Math.min(sampleCount, astFileChunks.length)
      );
      
      if (maxSamples > 0) {
        console.log(`\n   Sample Chunks (showing first ${Math.min(sampleCount, Math.max(legacyFileChunks.length, astFileChunks.length))}):\n`);
        
        for (let i = 0; i < maxSamples; i++) {
          console.log(`   --- Chunk ${i + 1} ---`);
          
          // Legacy chunk
          if (i < legacyFileChunks.length) {
            const chunk = legacyFileChunks[i];
            console.log(`   Legacy:`);
            console.log(`     Length: ${chunk.content.length} chars`);
            console.log(`     Header Hierarchy: ${JSON.stringify(chunk.metadata?.headerHierarchy || [])}`);
            console.log(`     Section: ${chunk.metadata?.section || 'N/A'}`);
            console.log(`     Chunk Type: ${chunk.metadata?.chunkType || 'N/A'}`);
            if (chunk.metadata?.language) {
              console.log(`     Language: ${chunk.metadata.language}`);
            }
            console.log(`     Content: ${chunk.content.substring(0, 80).replace(/\n/g, ' ')}...`);
          } else {
            console.log(`   Legacy: (no chunk at index ${i})`);
          }
          
          console.log();
          
          // AST chunk
          if (i < astFileChunks.length) {
            const chunk = astFileChunks[i];
            console.log(`   AST:`);
            console.log(`     Length: ${chunk.content.length} chars`);
            console.log(`     Header Hierarchy: ${JSON.stringify(chunk.metadata?.headerHierarchy || [])}`);
            console.log(`     Section: ${chunk.metadata?.section || 'N/A'}`);
            console.log(`     Chunk Type: ${chunk.metadata?.chunkType || 'N/A'}`);
            console.log(`     AST Node Types: ${JSON.stringify(chunk.metadata?.astNodeTypes || [])}`);
            if (chunk.metadata?.language) {
              console.log(`     Language: ${chunk.metadata.language}`);
            }
            console.log(`     Content: ${chunk.content.substring(0, 80).replace(/\n/g, ' ')}...`);
          } else {
            console.log(`   AST: (no chunk at index ${i})`);
          }
          
          console.log();
        }
      }
      
      console.log();
    }
    
    // Compare chunk type distributions
    console.log('=== Chunk Type Distribution ===\n');
    
    const legacyTypes = countChunkTypes(legacyChunks);
    const astTypes = countChunkTypes(astChunks);
    
    const allTypes = new Set([...legacyTypes.keys(), ...astTypes.keys()]);
    
    console.log(`${'Type'.padEnd(15)} ${'Legacy'.padEnd(10)} ${'AST'.padEnd(10)} ${'Difference'}`);
    console.log('-'.repeat(50));
    
    for (const type of Array.from(allTypes).sort()) {
      const legacyCount = legacyTypes.get(type) || 0;
      const astCount = astTypes.get(type) || 0;
      const diff = astCount - legacyCount;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      
      console.log(`${type.padEnd(15)} ${legacyCount.toString().padEnd(10)} ${astCount.toString().padEnd(10)} ${diffStr}`);
    }
    
    console.log('\n=== AST-Specific Information ===\n');
    
    // Show unique AST node types found
    const astNodeTypes = new Set<string>();
    for (const chunk of astChunks) {
      if (chunk.metadata?.astNodeTypes) {
        chunk.metadata.astNodeTypes.forEach(t => astNodeTypes.add(t));
      }
    }
    
    console.log(`AST Node Types Found (${astNodeTypes.size} unique):`);
    console.log(`  ${Array.from(astNodeTypes).sort().join(', ')}`);
    
    console.log('\n=== Comparison Complete ===');
    console.log('✓ Both chunkers successfully processed all documents');
    console.log('✓ Per-file and overall statistics generated');
    console.log('✓ Sample chunks displayed with detailed metadata\n');
    
  } catch (error) {
    console.error('✗ Error during comparison:', error);
    process.exit(1);
  }
}

/**
 * Group chunks by their source file name.
 */
function groupChunksByFile<T extends { sourceFile: string }>(chunks: T[]): Map<string, T[]> {
  const byFile = new Map<string, T[]>();
  
  for (const chunk of chunks) {
    const existing = byFile.get(chunk.sourceFile) || [];
    existing.push(chunk);
    byFile.set(chunk.sourceFile, existing);
  }
  
  return byFile;
}

/**
 * Calculate average chunk length for an array of chunks.
 */
function getAvgLength<T extends { content: string }>(chunks: T[]): number {
  if (chunks.length === 0) return 0;
  return chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length;
}

/**
 * Count chunks by their type.
 */
function countChunkTypes<T extends { metadata?: { chunkType?: string } }>(chunks: T[]): Map<string, number> {
  const types = new Map<string, number>();
  
  for (const chunk of chunks) {
    const type = chunk.metadata?.chunkType || 'unknown';
    types.set(type, (types.get(type) || 0) + 1);
  }
  
  return types;
}

main();
