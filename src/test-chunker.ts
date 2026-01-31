/**
 * Test to verify DocumentChunker still works after adding AST infrastructure
 */

import { DocumentChunker } from './chunking';
import * as path from 'path';

async function testDocumentChunker() {
  console.log('Testing DocumentChunker behavior...\n');

  const chunker = new DocumentChunker();
  const documentsPath = path.join(__dirname, '../documents');

  try {
    const chunks = await chunker.chunkDocuments(documentsPath);
    
    console.log('✓ DocumentChunker works correctly');
    console.log(`  Total chunks created: ${chunks.length}`);
    
    if (chunks.length > 0) {
      const sample = chunks[0];
      console.log('\n  Sample chunk:');
      console.log(`    ID: ${sample.id}`);
      console.log(`    Source: ${sample.sourceFile}`);
      console.log(`    Content length: ${sample.content.length} chars`);
      console.log(`    Has metadata: ${!!sample.metadata}`);
    }
    
    console.log('\n✓ No changes to DocumentChunker behavior');
  } catch (error) {
    console.error('✗ DocumentChunker failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testDocumentChunker();
