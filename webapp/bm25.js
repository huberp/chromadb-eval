/**
 * Browser-side BM25 lexical search index.
 *
 * Standard BM25 scoring with k1=1.5 and b=0.75.
 * The index is built once at startup from plainText fields in embeddings.json.
 *
 * Tokenizer pipeline: lowercase → split on non-word characters → stop-word
 * filter → suffix stemmer.  The stemmer ensures that inflected forms such as
 * "vitamins", "vitamines", "vitamin" all collapse to the same index token so
 * that lexical recall is not lost to minor morphological variation.
 *
 * State-of-the-art BM25 pipelines (Elasticsearch/Lucene, BM25s, Whoosh) apply
 * the same two-step approach: stop-word removal + Porter/Snowball stemmer.
 * The dense model already handles semantic similarity for spelling variants;
 * the stemmer closes the gap for BM25 lexical recall.
 */

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Common English stop words that carry little discriminative information.
 * Filtering these prevents high-frequency function words (e.g. "of", "the")
 * from dominating BM25 scores and returning irrelevant documents.
 */
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'that', 'this', 'it', 'its', 'as', 'so',
    'not', 'no', 'we', 'you', 'he', 'she', 'they', 'i', 'my', 'our',
    'if', 'then', 'than', 'about', 'up', 'out', 'also', 'into', 'can',
    'all', 'more', 'over', 'such', 'their', 'what', 'which', 'who', 'how',
]);

/**
 * Minimal English suffix stemmer (Porter-inspired).
 *
 * State-of-the-art RAG/BM25 systems (Elasticsearch, BM25s, Lucene) apply a
 * stemmer so that inflected forms ("vitamins", "vitamines") map to the same
 * index token as the base form ("vitamin"), improving lexical recall without
 * requiring the dense model for every morphological variant.
 *
 * This strips the most common English suffixes in priority order.  It is
 * intentionally simple — full Porter correctness is not required; the goal is
 * recall improvement on the document corpus.
 *
 * Key examples:
 *   "vitamins"  → "vitamin"   (strip -s)
 *   "vitamines" → "vitamin"   (strip -es)
 *   "advantages"→ "advantag"  (strip -es)
 *   "advantage" → "advantag"  (strip -e)
 *   "running"   → "run"       (strip -ing + double-letter collapse)
 *   "computed"  → "comput"    (strip -ed)
 *
 * @param {string} word - A single lowercase token (length > 0).
 * @returns {string} Stemmed token.
 */
function stem(word) {
    const len = word.length;
    if (len <= 3) return word;

    // Longer suffixes first to avoid under-stripping.
    if (len > 7 && word.endsWith('ational')) return word.slice(0, -7) + 'ate';
    if (len > 7 && word.endsWith('ness'))    return word.slice(0, -4);
    if (len > 7 && word.endsWith('ment'))    return word.slice(0, -4);
    if (len > 6 && word.endsWith('tion'))    return word.slice(0, -3);
    if (len > 6 && word.endsWith('sion'))    return word.slice(0, -3);
    if (len > 6 && word.endsWith('ize'))     return word.slice(0, -3);
    if (len > 6 && word.endsWith('ise'))     return word.slice(0, -3);

    // -ing: collapse double consonant ("running" → "run", "computing" → "comput")
    if (len > 5 && word.endsWith('ing')) {
        const s = word.slice(0, -3);
        if (s.length > 1 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1])) {
            return s.slice(0, -1);
        }
        return s;
    }

    // -ed: same double-consonant collapse
    if (len > 4 && word.endsWith('ed')) {
        const s = word.slice(0, -2);
        if (s.length > 1 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1])) {
            return s.slice(0, -1);
        }
        return s;
    }

    if (len > 5 && word.endsWith('er')) return word.slice(0, -2);
    if (len > 5 && word.endsWith('ly')) return word.slice(0, -2);

    // -ies → -i ("parties" → "parti")
    if (len > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'i';
    // -es ("vitamines" → "vitamin", "advantages" → "advantag")
    if (len > 4 && word.endsWith('es'))  return word.slice(0, -2);
    // -s but not -ss ("vitamins" → "vitamin")
    if (len > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    // -e ("advantage" → "advantag")
    if (len > 4 && word.endsWith('e'))   return word.slice(0, -1);

    return word;
}

/** Tokenize a string: lowercase → split → stop-word filter → stem. */
function tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 0 && !STOP_WORDS.has(t)).map(stem);
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
