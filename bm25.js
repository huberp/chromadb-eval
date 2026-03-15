/**
 * Browser-side BM25 lexical search index.
 *
 * Standard BM25 scoring with k1=1.5 and b=0.75.
 *
 * The index can be populated in two ways:
 *   1. load(data)  — preferred: loads a precomputed index from data-main/bm25/index.json,
 *                    generated at build time by src/prepare-bm25.ts.  This avoids
 *                    re-tokenising all documents in the browser at startup.
 *   2. build(docs) — fallback: builds the index at runtime from { id, text } pairs
 *                    (e.g. from the plainText fields of embeddings.json).
 *
 * Tokenizer pipeline: lowercase → split on non-word characters → stop-word
 * filter → Porter stemmer.
 *
 * Stop words and stemming are provided by two well-maintained npm packages
 * loaded from the esm.sh CDN:
 *   • stopword  (fergiemcdowall/stopword) — English stop word list (`eng`)
 *   • stemmer   (words/stemmer)           — Porter Stemmer algorithm
 *
 * Using the same stemmer at both index-build time and query time ensures that
 * morphological variants ("vitamin", "vitamins", "vitamines") all collapse to
 * the same token, matching the approach used by Elasticsearch/Lucene
 * (EnglishAnalyzer), BM25s, and Whoosh.
 */

import { eng as STOP_WORDS_LIST } from 'https://esm.sh/stopword@3.1.5';
import { stemmer } from 'https://esm.sh/stemmer@2.0.1';
import { REPO_OWNER, REPO_NAME } from './config.js';

/** URL of the precomputed BM25 index on the data-main branch. */
export const BM25_INDEX_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/data-main/bm25/index.json`;

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** English stop words as a Set for O(1) lookup. */
const STOP_WORDS = new Set(STOP_WORDS_LIST);

/** Tokenize: lowercase → split → stop-word filter → Porter stem. */
function tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 0 && !STOP_WORDS.has(t)).map(stemmer);
}

/**
 * Fetch the precomputed BM25 index from the data-main branch.
 * Returns the parsed index data on success, null on error.
 *
 * @param {function(string, string): void} updateStatus
 * @returns {Promise<object|null>}
 */
export async function loadBm25Index(updateStatus) {
    try {
        updateStatus('Loading BM25 index...', 'loading');
        const response = await fetch(BM25_INDEX_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch BM25 index: ${response.status}`);
        }
        const data = await response.json();
        updateStatus('BM25 index loaded', 'success');
        return data;
    } catch (error) {
        updateStatus(`Error loading BM25 index: ${error.message}`, 'error');
        console.error('Error loading BM25 index:', error);
        return null;
    }
}

export class Bm25Index {
    constructor() {
        this._docs = [];       // Array of { id, tokens } — used in build() mode
        this._df = new Map();  // term -> document frequency — used in build() mode
        this._avgdl = 0;       // average document length (in tokens) — used in build() mode
        this._built = false;

        // Precomputed data set by load()
        this._loaded = false;
        this._n = 0;
        this._loadedAvgdl = 0;
        this._docIds = null;      // string[] mapping int ID → original string doc ID
        this._docLengths = null;  // number[] indexed by int ID
        this._index = null;       // Record<string, { df, postings: [{id: number, tf}] }>
    }

    /**
     * Build the BM25 index at runtime from an array of { id, text } documents.
     * Prefer load() when a precomputed index is available.
     *
     * @param {Array<{id: string, text: string}>} docs
     */
    build(docs) {
        const t0 = performance.now();

        this._docs = [];
        this._df = new Map();

        let totalTokens = 0;

        for (const doc of docs) {
            const tokens = tokenize(doc.text);
            this._docs.push({ id: doc.id, tokens });
            totalTokens += tokens.length;

            // Compute term set for this document (for df counting)
            const seen = new Set(tokens);
            for (const term of seen) {
                this._df.set(term, (this._df.get(term) || 0) + 1);
            }
        }

        this._avgdl = this._docs.length > 0 ? totalTokens / this._docs.length : 0;
        this._built = true;

        const elapsed = (performance.now() - t0).toFixed(1);
        console.log(`[BM25] Index built: ${this._docs.length} docs, ${this._df.size} unique terms, avgdl=${this._avgdl.toFixed(1)}, time=${elapsed}ms`);
    }

    /**
     * Load a precomputed BM25 index produced by src/prepare-bm25.ts.
     * After this call, search() uses the precomputed data without re-tokenising
     * any documents.
     *
     * @param {{ n: number, avgdl: number, docs: string[], docLengths: number[], index: object }} data
     */
    load(data) {
        this._loaded = true;
        this._n = data.n;
        this._loadedAvgdl = data.avgdl;
        this._docIds = data.docs;
        this._docLengths = data.docLengths;
        this._index = data.index;
        console.log(`[BM25] Loaded precomputed index: ${Object.keys(data.index).length} terms, ${data.n} docs, avgdl=${data.avgdl.toFixed(1)}`);
    }

    /**
     * Search the index for a query string.
     * Returns the top k documents sorted by BM25 score descending.
     * Tie-break by id (lexicographic) for determinism.
     *
     * @param {string} query
     * @param {number} k
     * @returns {Array<{id: string, score: number}>}
     */
    search(query, k = 5) {
        if (!this._built && !this._loaded) {
            throw new Error('BM25 index not ready. Call build() or load() first.');
        }

        const queryTerms = tokenize(query);
        if (queryTerms.length === 0) {
            return [];
        }

        if (this._loaded) {
            return this._searchLoaded(queryTerms, k);
        }
        return this._searchBuilt(queryTerms, k);
    }

    /**
     * Search using the precomputed inverted index (set via load()).
     * Postings use integer doc IDs; results are mapped back to string IDs.
     * @private
     */
    _searchLoaded(queryTerms, k) {
        const N = this._n;
        const scores = new Map();

        for (const term of queryTerms) {
            const entry = this._index[term];
            if (!entry) continue;

            const { df, postings } = entry;
            // IDF component: ln((N - df + 0.5) / (df + 0.5) + 1)
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            for (const posting of postings) {
                const { id, tf } = posting;  // id is an integer index
                const dl = this._docLengths[id] || 0;
                // BM25 TF component
                const tfNorm = (tf * (BM25_K1 + 1)) /
                    (tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / this._loadedAvgdl));
                scores.set(id, (scores.get(id) || 0) + idf * tfNorm);
            }
        }

        return Array.from(scores.entries())
            .map(([numId, score]) => ({ id: this._docIds[numId] ?? '', score }))
            .filter(r => r.id !== '')
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
            .slice(0, k);
    }

    /**
     * Search using the in-memory token arrays (set via build()).
     * @private
     */
    _searchBuilt(queryTerms, k) {
        const N = this._docs.length;
        const scores = new Map();

        for (const term of queryTerms) {
            const df = this._df.get(term) || 0;
            if (df === 0) continue;

            // IDF component: ln((N - df + 0.5) / (df + 0.5) + 1)
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            for (const doc of this._docs) {
                const dl = doc.tokens.length;
                // Term frequency in this document
                const tf = doc.tokens.filter(t => t === term).length;
                if (tf === 0) continue;

                // BM25 TF component
                const tfNorm = (tf * (BM25_K1 + 1)) /
                    (tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / this._avgdl));

                scores.set(doc.id, (scores.get(doc.id) || 0) + idf * tfNorm);
            }
        }

        // Convert to array, sort by score desc, tie-break by id asc
        return Array.from(scores.entries())
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
            .slice(0, k);
    }
}

