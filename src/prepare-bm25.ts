/**
 * Prepare BM25 index data for the gh-pages app.
 *
 * This script is separate from prepare-data.ts to keep BM25 preprocessing
 * modular and independent of embedding generation.
 *
 * It reads the embeddings.json produced by prepare-data.ts (which already
 * contains the per-chunk plain text) and builds a precomputed BM25 inverted
 * index, writing the result to:
 *   <outputDir>/bm25/index.json
 *
 * The inverted index is keyed by document IDs (not file paths), enabling
 * exact O(1) lookups at query time.  The format contains everything needed
 * for BM25 scoring without re-tokenizing documents in the browser:
 *   - n:          total number of documents
 *   - avgdl:      average document length in tokens
 *   - docLengths: map of doc ID → token count
 *   - index:      map of stem → { df, postings: [{ id, tf }] }
 *
 * Tokenization pipeline (lowercase → split → stop-word filter → Porter stem)
 * uses the same `stopword` and `stemmer` npm packages as webapp/bm25.js so
 * that index-time and query-time token streams are always identical.
 */

import * as fs from 'fs';
import * as path from 'path';
import { stemmer } from 'stemmer';
import { eng as STOP_WORDS_LIST } from 'stopword';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || path.join(__dirname, '../data-output'));
const EMBEDDINGS_JSON = path.join(OUTPUT_DIR, 'embeddings.json');
const BM25_DIR = path.join(OUTPUT_DIR, 'bm25');
const BM25_INDEX_FILE = path.join(BM25_DIR, 'index.json');

// ---------------------------------------------------------------------------
// Tokenization  (must stay in sync with webapp/bm25.js)
// ---------------------------------------------------------------------------

/** English stop words as a Set for O(1) lookup. */
export const STOP_WORDS = new Set(STOP_WORDS_LIST);

/**
 * Tokenize a text string.
 * Pipeline: lowercase → split on non-word characters → stop-word filter → Porter stem.
 * Exported for unit-testing and to verify parity with webapp/bm25.js.
 */
export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/\W+/)
        .filter(t => t.length > 0 && !STOP_WORDS.has(t))
        .map(stemmer);
}

// ---------------------------------------------------------------------------
// BM25 index data types
// ---------------------------------------------------------------------------

interface Posting {
    id: number;
    tf: number;
}

interface TermEntry {
    df: number;
    postings: Posting[];
}

/** Shape of the JSON file written to bm25/index.json. */
export interface Bm25IndexData {
    n: number;
    avgdl: number;
    /** Maps integer document ID (array index) to the original string document ID. */
    docs: string[];
    /** Document lengths (token counts) indexed by integer document ID. */
    docLengths: number[];
    index: Record<string, TermEntry>;
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

/**
 * Build a BM25 inverted index from an array of { id, plainText } entries.
 * Each `id` must be a unique document identifier (not a file path).
 * Exported for unit-testing.
 */
export function buildBm25IndexData(
    entries: Array<{ id: string; plainText: string }>,
): Bm25IndexData {
    const docs: string[] = [];
    const docLengths: number[] = [];
    const invertedIndex: Record<string, TermEntry> = {};
    let totalTokens = 0;

    for (let numId = 0; numId < entries.length; numId++) {
        const entry = entries[numId];
        docs.push(entry.id);
        const tokens = tokenize(entry.plainText || '');
        docLengths.push(tokens.length);
        totalTokens += tokens.length;

        // Count term frequencies within this document
        const tfMap = new Map<string, number>();
        for (const token of tokens) {
            tfMap.set(token, (tfMap.get(token) || 0) + 1);
        }

        // Update inverted index using integer doc ID
        for (const [term, tf] of tfMap) {
            if (!invertedIndex[term]) {
                invertedIndex[term] = { df: 0, postings: [] };
            }
            invertedIndex[term].df += 1;
            invertedIndex[term].postings.push({ id: numId, tf });
        }
    }

    const n = entries.length;
    const avgdl = n > 0 ? totalTokens / n : 0;

    return { n, avgdl, docs, docLengths, index: invertedIndex };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    console.log('=== Prepare BM25 Index ===\n');

    // 1. Read embeddings.json (produced by prepare-data.ts)
    if (!fs.existsSync(EMBEDDINGS_JSON)) {
        console.error(`embeddings.json not found at ${EMBEDDINGS_JSON}`);
        console.error('Run "npm run prepare-data" first to generate embeddings.json');
        process.exit(1);
    }

    const rawData = fs.readFileSync(EMBEDDINGS_JSON, 'utf-8');
    const entries: Array<{ id: string; plainText: string }> = JSON.parse(rawData);
    console.log(`Read ${entries.length} entries from embeddings.json\n`);

    // 2. Build the inverted index
    const indexData = buildBm25IndexData(entries);
    const termCount = Object.keys(indexData.index).length;
    console.log(
        `Built BM25 index: ${indexData.n} docs, ${termCount} unique terms, ` +
        `avgdl=${indexData.avgdl.toFixed(1)}`,
    );

    // 3. Write to bm25/index.json
    fs.mkdirSync(BM25_DIR, { recursive: true });
    fs.writeFileSync(BM25_INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf-8');
    console.log(`\nWrote BM25 index to ${BM25_INDEX_FILE}`);

    console.log('\n=== BM25 index preparation complete ===');
}

// Only execute main() when this file is run directly (not when imported as a module).
// This allows tokenize() and buildBm25IndexData() to be imported by tests
// without triggering the file-system side-effects in main().
if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
