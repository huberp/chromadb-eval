/**
 * Browser-side BM25 lexical search index.
 *
 * Standard BM25 scoring with k1=1.5 and b=0.75.
 * The index is built once at startup from plainText fields in embeddings.json.
 *
 * Tokenizer: lowercase, split on non-word characters, drop empty tokens.
 * This matches the simple approach used in chromadb-manager.ts getMostCommonTerms().
 */

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** Tokenize a string into lowercase word tokens. */
function tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 0);
}

export class Bm25Index {
    constructor() {
        this._docs = [];       // Array of { id, tokens }
        this._df = new Map();  // term -> document frequency
        this._avgdl = 0;       // average document length (in tokens)
        this._built = false;
    }

    /**
     * Build the BM25 index from an array of { id, text } documents.
     * Call this once after loadEmbeddings() completes.
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
     * Search the index for a query string.
     * Returns the top k documents sorted by BM25 score descending.
     * Tie-break by id (lexicographic) for determinism.
     *
     * @param {string} query
     * @param {number} k
     * @returns {Array<{id: string, score: number}>}
     */
    search(query, k = 5) {
        if (!this._built) {
            throw new Error('BM25 index not built. Call build() first.');
        }

        const queryTerms = tokenize(query);
        if (queryTerms.length === 0) {
            return [];
        }

        const N = this._docs.length;
        const scores = new Map(); // id -> score

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
        const results = Array.from(scores.entries())
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

        return results.slice(0, k);
    }
}
