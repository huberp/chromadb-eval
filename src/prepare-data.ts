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

/**
 * Custom JSON stringifier that keeps embedding arrays compact (single line).
 * This significantly reduces file size by not adding line breaks for each
 * vector dimension.
 */
function stringifyWithCompactEmbeddings(data: any): string {
  return JSON.stringify(data, (key, value) => {
    // Keep embedding arrays as-is (they'll be compacted in the final output)
    return value;
  }, 2).replace(
    // Replace multi-line embedding arrays with single-line compact format
    /"embedding":\s*\[\s*([\s\S]*?)\s*\]/g,
    (match, contents) => {
      // Extract all numbers from the array content
      const numbers = contents.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/g) || [];
      return `"embedding": [${numbers.join(', ')}]`;
    }
  );
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

  // Pre-compute document sizes to avoid redundant stat calls
  const docSizes = new Map<string, number>();
  for (const file of mdFiles) {
    docSizes.set(file, fs.statSync(path.join(DOCUMENTS_DIR, file)).size);
  }

  interface ChunkReference {
    file: string;
    rawUrl: string;
    size: number;
  }

  interface EmbeddingEntry {
    id: string;
    chunkIndex: number;
    sourceFile: string;
    chunkFile: string;
    chunkRawUrl: string;
    chunkSize: number;
    before: ChunkReference | null;
    after: ChunkReference | null;
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

    // Create before reference object if there's a previous chunk
    const before: ChunkReference | null = beforeChunk
      ? {
          file: `${docName(beforeChunk.sourceFile)}.${beforeChunk.chunkIndex}.md`,
          rawUrl: rawUrl(`chunks/${docName(beforeChunk.sourceFile)}.${beforeChunk.chunkIndex}.md`),
          size: beforeChunk.content.length,
        }
      : null;

    // Create after reference object if there's a next chunk
    const after: ChunkReference | null = afterChunk
      ? {
          file: `${docName(afterChunk.sourceFile)}.${afterChunk.chunkIndex}.md`,
          rawUrl: rawUrl(`chunks/${docName(afterChunk.sourceFile)}.${afterChunk.chunkIndex}.md`),
          size: afterChunk.content.length,
        }
      : null;

    entries.push({
      id: chunk.id,
      chunkIndex: chunk.chunkIndex,
      sourceFile: chunk.sourceFile,
      chunkFile: chunkFileName,
      chunkRawUrl: rawUrl(`chunks/${chunkFileName}`),
      chunkSize: chunk.content.length,
      before,
      after,
      documentFile: chunk.sourceFile,
      documentRawUrl: rawUrl(`documents/${chunk.sourceFile}`),
      documentSize: docSizes.get(chunk.sourceFile) || 0,
      section: chunk.metadata?.section,
      headerHierarchy: chunk.metadata?.headerHierarchy,
      chunkType: chunk.metadata?.chunkType,
      embedding: embeddings[i],
    });
  }

  const outputJsonPath = path.join(OUTPUT_DIR, 'embeddings.json');
  fs.writeFileSync(outputJsonPath, stringifyWithCompactEmbeddings(entries), 'utf-8');
  console.log(`Wrote ${entries.length} embedding entries to ${outputJsonPath}`);

  console.log('\n=== Data preparation complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
