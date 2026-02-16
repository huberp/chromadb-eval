/**
 * Prepare data for the gh-pages app.
 *
 * This script:
 * 1. Reads all markdown documents from /documents
 * 2. Chunks them using AstDocumentChunker
 * 3. Writes each chunk as <docname>.<chunk-number>.md into <outputDir>/chunks
 * 4. Copies full documents into <outputDir>/documents
 * 5. Computes embeddings for every chunk via transformers.js
 * 6. Produces a single JSON file (<outputDir>/embeddings.json) containing an
 *    array of objects with the embedding vector and rich metadata (resolvable
 *    raw-content links for chunk, before/after neighbours, and the full
 *    document, plus sizes).
 */

import * as fs from 'fs';
import * as path from 'path';
import { AstDocumentChunker, AstChunk } from './chunking/ast-chunker';
import { TransformersEmbeddings } from './embeddings-transformers';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DOCUMENTS_DIR = path.resolve(__dirname, '../documents');
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || path.join(__dirname, '../data-output'));
const CHUNKS_DIR = path.join(OUTPUT_DIR, 'chunks');
const DOCS_DIR = path.join(OUTPUT_DIR, 'documents');

// GitHub raw-content base URL.  The workflow sets this env-var; during local
// runs we fall back to a placeholder so the script still works.
const RAW_BASE_URL = process.env.RAW_BASE_URL || 'https://raw.githubusercontent.com/{owner}/{repo}/data-main';

const MODEL_ID = process.env.EMBEDDING_MODEL_ID || 'Xenova/all-mpnet-base-v2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip the .md extension from a filename. */
function docName(filename: string): string {
  return filename.replace(/\.md$/, '');
}

/** Build a raw-content URL for a file inside the output tree. */
function rawUrl(relativePath: string): string {
  return `${RAW_BASE_URL}/${relativePath}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Prepare Data for gh-pages ===\n');

  // 1. Ensure output directories exist
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  // 2. Read all markdown files
  const mdFiles = fs.readdirSync(DOCUMENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  if (mdFiles.length === 0) {
    console.error('No markdown files found in', DOCUMENTS_DIR);
    process.exit(1);
  }
  console.log(`Found ${mdFiles.length} markdown documents\n`);

  // 3. Copy full documents to output
  for (const file of mdFiles) {
    const src = path.join(DOCUMENTS_DIR, file);
    const dst = path.join(DOCS_DIR, file);
    fs.copyFileSync(src, dst);
  }
  console.log(`Copied ${mdFiles.length} full documents to ${DOCS_DIR}\n`);

  // 4. Chunk every document using AstDocumentChunker
  const chunker = new AstDocumentChunker();
  const allChunks: AstChunk[] = [];

  for (const file of mdFiles) {
    const content = fs.readFileSync(path.join(DOCUMENTS_DIR, file), 'utf-8');
    const chunks = chunker.chunkMarkdown(content, file);
    allChunks.push(...chunks);
  }
  console.log(`Created ${allChunks.length} chunks\n`);

  // 5. Write each chunk as a markdown file
  for (const chunk of allChunks) {
    const chunkFileName = `${docName(chunk.sourceFile)}.${chunk.chunkIndex}.md`;
    const chunkPath = path.join(CHUNKS_DIR, chunkFileName);
    fs.writeFileSync(chunkPath, chunk.content, 'utf-8');
  }
  console.log(`Wrote ${allChunks.length} chunk files to ${CHUNKS_DIR}\n`);

  // 6. Compute embeddings using transformers.js
  console.log(`Initializing embedding model: ${MODEL_ID}`);
  const embedder = new TransformersEmbeddings({ modelId: MODEL_ID });
  await embedder.initialize();

  const texts = allChunks.map(c => c.content);
  console.log(`Computing embeddings for ${texts.length} chunks...`);
  const embeddings = await embedder.embedBatch(texts);
  console.log('Embeddings computed\n');

  // 7. Build the metadata JSON
  interface EmbeddingEntry {
    id: string;
    chunkIndex: number;
    sourceFile: string;
    chunkFile: string;
    chunkRawUrl: string;
    chunkSize: number;
    beforeChunkFile: string | null;
    beforeChunkRawUrl: string | null;
    beforeChunkSize: number | null;
    afterChunkFile: string | null;
    afterChunkRawUrl: string | null;
    afterChunkSize: number | null;
    documentFile: string;
    documentRawUrl: string;
    documentSize: number;
    section: string | undefined;
    headerHierarchy: string[] | undefined;
    chunkType: string | undefined;
    embedding: number[];
  }

  const entries: EmbeddingEntry[] = [];

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    const chunkFileName = `${docName(chunk.sourceFile)}.${chunk.chunkIndex}.md`;

    // Determine before / after neighbours (only within the same source file)
    let beforeChunk: AstChunk | null = null;
    let afterChunk: AstChunk | null = null;

    if (i > 0 && allChunks[i - 1].sourceFile === chunk.sourceFile) {
      beforeChunk = allChunks[i - 1];
    }
    if (i < allChunks.length - 1 && allChunks[i + 1].sourceFile === chunk.sourceFile) {
      afterChunk = allChunks[i + 1];
    }

    const beforeFileName = beforeChunk
      ? `${docName(beforeChunk.sourceFile)}.${beforeChunk.chunkIndex}.md`
      : null;
    const afterFileName = afterChunk
      ? `${docName(afterChunk.sourceFile)}.${afterChunk.chunkIndex}.md`
      : null;

    const docFileSize = fs.statSync(path.join(DOCUMENTS_DIR, chunk.sourceFile)).size;

    entries.push({
      id: chunk.id,
      chunkIndex: chunk.chunkIndex,
      sourceFile: chunk.sourceFile,
      chunkFile: chunkFileName,
      chunkRawUrl: rawUrl(`chunks/${chunkFileName}`),
      chunkSize: chunk.content.length,
      beforeChunkFile: beforeFileName,
      beforeChunkRawUrl: beforeFileName ? rawUrl(`chunks/${beforeFileName}`) : null,
      beforeChunkSize: beforeChunk ? beforeChunk.content.length : null,
      afterChunkFile: afterFileName,
      afterChunkRawUrl: afterFileName ? rawUrl(`chunks/${afterFileName}`) : null,
      afterChunkSize: afterChunk ? afterChunk.content.length : null,
      documentFile: chunk.sourceFile,
      documentRawUrl: rawUrl(`documents/${chunk.sourceFile}`),
      documentSize: docFileSize,
      section: chunk.metadata?.section,
      headerHierarchy: chunk.metadata?.headerHierarchy,
      chunkType: chunk.metadata?.chunkType,
      embedding: embeddings[i],
    });
  }

  const outputJsonPath = path.join(OUTPUT_DIR, 'embeddings.json');
  fs.writeFileSync(outputJsonPath, JSON.stringify(entries, null, 2), 'utf-8');
  console.log(`Wrote ${entries.length} embedding entries to ${outputJsonPath}`);

  console.log('\n=== Data preparation complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
