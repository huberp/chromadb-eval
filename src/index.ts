import * as path from 'path';
import { DocumentChunker, AstDocumentChunker, createChunker } from './chunking';
import { ChromaDBManager } from './chromadb-manager';
import { ChunkingConfig, getChunkingConfig } from './config';

/**
 * Chunk all markdown documents and store them in ChromaDB.
 * Consolidates the duplicated chunking + storing logic used by both
 * the fresh-build path and the cache-fallback path.
 */
async function chunkAndStoreDocuments(chromaDB: ChromaDBManager, config: ChunkingConfig): Promise<void> {
  console.log(`Using ${config.mode} chunker (chunkSize: ${config.chunkSize}, chunkOverlap: ${config.chunkOverlap})\n`);

  const chunker = createChunker(config);

  console.log('Chunking documents...');
  const documentsPath = path.join(__dirname, '../documents');
  const chunks = await chunker.chunkDocuments(documentsPath);
  console.log(`Created ${chunks.length} chunks from documents\n`);

  console.log('Storing chunks in ChromaDB...');
  await chromaDB.addChunks(chunks);
  console.log('');
}

async function main() {
  console.log('=== ChromaDB Evaluator ===\n');

  // Get user question from command line arguments
  const userQuestion = process.argv[2];
  
  // Check if we should use cached data
  const useCached = process.env.USE_CACHED_CHROMADB === 'true';

  try {
    const chromaDB = new ChromaDBManager();
    const config = getChunkingConfig();

    // Determine whether documents need to be (re-)processed
    let needsDocumentProcessing = true;

    if (useCached) {
      // Try to reuse an existing ChromaDB collection
      console.log('✅ Using cached ChromaDB data\n');
      console.log('Initializing ChromaDB connection...');
      const result = await chromaDB.initialize(true);
      console.log('');

      if (result.fallbackToRecreation) {
        console.log('⚠️  Cache was invalid, performing full document processing...\n');
      } else {
        needsDocumentProcessing = false;
      }
    } else {
      // Fresh build – recreate the collection
      console.log('Initializing ChromaDB and storing chunks...');
      await chromaDB.initialize(false);
    }

    if (needsDocumentProcessing) {
      await chunkAndStoreDocuments(chromaDB, config);
    }

    // Step 3: Compute top 10 document similarities
    console.log('Step 3: Computing top 10 document similarities...');
    const similarities = await chromaDB.computeDocumentSimilarities();
    console.log('\nTop 10 Most Similar Document Pairs:');
    console.log('=====================================');
    similarities.forEach((sim, idx) => {
      console.log(`${idx + 1}. ${sim.doc1} <-> ${sim.doc2}`);
      console.log(`   Similarity: ${sim.similarity.toFixed(4)}\n`);
    });

    // Step 4: Report 10 most common terms
    console.log('Step 4: Finding most common terms...');
    const commonTerms = await chromaDB.getMostCommonTerms(10);
    console.log('\n10 Most Common Terms:');
    console.log('====================');
    let termIdx = 1;
    for (const [term, count] of commonTerms) {
      console.log(`${termIdx}. "${term}" - appears ${count} times`);
      termIdx++;
    }
    console.log('');

    // Step 5: Answer user question (if provided)
    if (userQuestion) {
      console.log('Step 5: Answering user question...');
      console.log(`Question: "${userQuestion}"\n`);
      
      const results = await chromaDB.query(userQuestion, 5);
      
      console.log('Top 5 Relevant Chunks:');
      console.log('======================');
      
      if (results.documents && results.documents[0] && results.documents[0].length > 0) {
        results.documents[0].forEach((doc: string, idx: number) => {
          const metadata = results.metadatas?.[0]?.[idx] as { sourceFile: string };
          const distance = results.distances?.[0]?.[idx];
          
          console.log(`\n${idx + 1}. Source: ${metadata?.sourceFile}`);
          console.log(`   Distance: ${distance?.toFixed(4)}`);
          console.log(`   Content: ${doc.substring(0, 200)}...`);
        });
      } else {
        console.log('\nNo matching chunks found.');
      }
    } else {
      console.log('Step 5: No question provided');
      console.log('To ask a question, run: npm start "your question here"');
    }

    console.log('\n=== Evaluation Complete ===');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
