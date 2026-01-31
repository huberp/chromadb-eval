import * as path from 'path';
import { DocumentChunker, AstDocumentChunker } from './chunking';
import { ChromaDBManager } from './chromadb-manager';
import { getChunkingConfig } from './config';

async function main() {
  console.log('=== ChromaDB Evaluator ===\n');

  // Get user question from command line arguments
  const userQuestion = process.argv[2];

  try {
    // Get chunking configuration
    const config = getChunkingConfig();
    console.log(`Using ${config.mode} chunker (chunkSize: ${config.chunkSize}, chunkOverlap: ${config.chunkOverlap})\n`);

    // Initialize components with Mistral-recommended settings
    // 1000 chars ≈ 250 tokens (within 200-500 token range)
    // 150 chars overlap ≈ 1-2 sentences
    const chunker = config.mode === 'ast'
      ? new AstDocumentChunker({ chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap })
      : new DocumentChunker(config.chunkSize, config.chunkOverlap);
    const chromaDB = new ChromaDBManager();

    // Step 1: Chunk documents
    console.log('Step 1: Chunking documents...');
    const documentsPath = path.join(__dirname, '../documents');
    const chunks = await chunker.chunkDocuments(documentsPath);
    console.log(`Created ${chunks.length} chunks from documents\n`);

    // Step 2: Initialize ChromaDB and add chunks
    console.log('Step 2: Initializing ChromaDB and storing chunks...');
    await chromaDB.initialize();
    await chromaDB.addChunks(chunks);
    console.log('');

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
      
      if (results.documents && results.documents[0]) {
        results.documents[0].forEach((doc: string, idx: number) => {
          const metadata = results.metadatas?.[0]?.[idx] as { sourceFile: string };
          const distance = results.distances?.[0]?.[idx];
          
          console.log(`\n${idx + 1}. Source: ${metadata?.sourceFile}`);
          console.log(`   Distance: ${distance?.toFixed(4)}`);
          console.log(`   Content: ${doc.substring(0, 200)}...`);
        });
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
