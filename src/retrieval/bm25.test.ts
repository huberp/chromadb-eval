/**
 * Node-side BM25 algorithm tests.
 *
 * These tests mirror the browser-side webapp/bm25.js using a plain TypeScript
 * implementation so they can be run with vitest without a browser.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal BM25 implementation (mirrors webapp/bm25.js exactly)
// ---------------------------------------------------------------------------

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Common English stop words that carry little discriminative information.
 * Filtering these prevents high-frequency function words (e.g. "of", "the")
 * from dominating BM25 scores and returning irrelevant documents.
 *
 * IMPORTANT: This list must be kept in sync with the identical constant in
 * webapp/bm25.js, which is the authoritative source.
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
 * IMPORTANT: Must be kept in sync with the identical function in webapp/bm25.js.
 */
function stem(word: string): string {
    const len = word.length;
    if (len <= 3) return word;

    if (len > 7 && word.endsWith('ational')) return word.slice(0, -7) + 'ate';
    if (len > 7 && word.endsWith('ness'))    return word.slice(0, -4);
    if (len > 7 && word.endsWith('ment'))    return word.slice(0, -4);
    if (len > 6 && word.endsWith('tion'))    return word.slice(0, -3);
    if (len > 6 && word.endsWith('sion'))    return word.slice(0, -3);
    if (len > 6 && word.endsWith('ize'))     return word.slice(0, -3);
    if (len > 6 && word.endsWith('ise'))     return word.slice(0, -3);

    if (len > 5 && word.endsWith('ing')) {
        const s = word.slice(0, -3);
        if (s.length > 1 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1])) {
            return s.slice(0, -1);
        }
        return s;
    }

    if (len > 4 && word.endsWith('ed')) {
        const s = word.slice(0, -2);
        if (s.length > 1 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1])) {
            return s.slice(0, -1);
        }
        return s;
    }

    if (len > 5 && word.endsWith('er')) return word.slice(0, -2);
    if (len > 5 && word.endsWith('ly')) return word.slice(0, -2);

    if (len > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'i';
    if (len > 4 && word.endsWith('es'))  return word.slice(0, -2);
    if (len > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    if (len > 4 && word.endsWith('e'))   return word.slice(0, -1);

    return word;
}

function tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 0 && !STOP_WORDS.has(t)).map(stem);
}

interface Doc {
    id: string;
    tokens: string[];
}

class Bm25Index {
    private docs: Doc[] = [];
    private df: Map<string, number> = new Map();
    private avgdl = 0;
    private built = false;

    build(docs: Array<{ id: string; text: string }>): void {
        this.docs = [];
        this.df = new Map();
        let totalTokens = 0;

        for (const doc of docs) {
            const tokens = tokenize(doc.text);
            this.docs.push({ id: doc.id, tokens });
            totalTokens += tokens.length;

            const seen = new Set(tokens);
            for (const term of seen) {
                this.df.set(term, (this.df.get(term) || 0) + 1);
            }
        }

        this.avgdl = this.docs.length > 0 ? totalTokens / this.docs.length : 0;
        this.built = true;
    }

    search(query: string, k = 5): Array<{ id: string; score: number }> {
        if (!this.built) throw new Error('Index not built');

        const queryTerms = tokenize(query);
        if (queryTerms.length === 0) return [];

        const N = this.docs.length;
        const scores = new Map<string, number>();

        for (const term of queryTerms) {
            const df = this.df.get(term) || 0;
            if (df === 0) continue;

            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

            for (const doc of this.docs) {
                const dl = doc.tokens.length;
                const tf = doc.tokens.filter(t => t === term).length;
                if (tf === 0) continue;

                const tfNorm = (tf * (BM25_K1 + 1)) /
                    (tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / this.avgdl));

                scores.set(doc.id, (scores.get(doc.id) || 0) + idf * tfNorm);
            }
        }

        return Array.from(scores.entries())
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
            .slice(0, k);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bm25Index', () => {
    it('returns relevant doc at rank 1 for exact-match query', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'doc-a', text: 'chromadb-manager.ts is a TypeScript file' },
            { id: 'doc-b', text: 'apples and oranges are fruits' },
            { id: 'doc-c', text: 'vector database embeddings search' },
        ]);

        const results = index.search('chromadb-manager.ts', 3);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe('doc-a');
    });

    it('scores zero for queries with no matching terms', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'doc-a', text: 'apples and oranges' },
            { id: 'doc-b', text: 'bananas and grapes' },
        ]);

        const results = index.search('chromadb typescript', 5);
        expect(results.length).toBe(0);
    });

    it('respects top-k limit', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'a', text: 'the quick brown fox' },
            { id: 'b', text: 'the quick brown dog' },
            { id: 'c', text: 'the quick cat' },
            { id: 'd', text: 'the lazy fox' },
        ]);

        const results = index.search('the quick', 2);
        expect(results.length).toBe(2);
    });

    it('returns empty array for empty query', () => {
        const index = new Bm25Index();
        index.build([{ id: 'doc-a', text: 'some text here' }]);
        expect(index.search('', 5)).toEqual([]);
        expect(index.search('   ', 5)).toEqual([]);
    });

    it('tie-breaks by id (lexicographic) for determinism', () => {
        const index = new Bm25Index();
        // All docs have identical text — same BM25 score
        index.build([
            { id: 'doc-z', text: 'apple' },
            { id: 'doc-a', text: 'apple' },
            { id: 'doc-m', text: 'apple' },
        ]);

        const results = index.search('apple', 3);
        const ids = results.map(r => r.id);
        // Tie-break: lexicographic asc
        expect(ids).toEqual(['doc-a', 'doc-m', 'doc-z']);
    });

    it('ranks docs with higher term frequency higher', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'low', text: 'apple juice is tasty' },
            { id: 'high', text: 'apple apple apple cider apple recipe' },
        ]);

        const results = index.search('apple', 2);
        expect(results[0].id).toBe('high');
    });

    it('produces stable results on repeated calls (determinism)', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'doc-1', text: 'model training loss' },
            { id: 'doc-2', text: 'loss function gradient model' },
            { id: 'doc-3', text: 'embedding model vector space' },
        ]);

        const r1 = index.search('model loss', 3).map(r => r.id);
        const r2 = index.search('model loss', 3).map(r => r.id);
        expect(r1).toEqual(r2);
    });

    it('stemmer matches "vitamines" to docs containing "vitamin" or "vitamins"', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'maths-doc', text: 'the sum of the product of the terms of the series of numbers' },
            { id: 'fruit-doc', text: 'oranges are rich in vitamin c and vitamin benefits' },
        ]);

        // "advantage of vitamines":
        //   "of" is a stop word (removed).
        //   "advantage" stems to "advantag" (no doc has it — no contribution).
        //   "vitamines" stems to "vitamin" — matches "vitamin" in fruit-doc.
        // So the maths doc does NOT appear; the fruit doc DOES.
        const results = index.search('advantage of vitamines', 5);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe('fruit-doc');
        expect(results.every(r => r.id !== 'maths-doc')).toBe(true);
    });

    it('returns empty array when query contains only stop words', () => {
        const index = new Bm25Index();
        index.build([{ id: 'doc-a', text: 'apples and oranges are healthy fruits' }]);

        // All words in this query are stop words
        expect(index.search('and of the', 5)).toEqual([]);
    });

    it('finds vitamin-related docs for content query after stop word removal', () => {
        const index = new Bm25Index();
        index.build([
            { id: 'vitamin-doc', text: 'oranges contain vitamin c benefits health nutrition' },
            { id: 'maths-doc', text: 'the sum of squares of integers algebra calculus' },
        ]);

        // "vitamin" is a content word → should match the fruit doc, not the maths doc
        const results = index.search('vitamin benefits', 5);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe('vitamin-doc');
    });

    it('stemmer maps inflected forms to the same token', () => {
        // vitamin, vitamins, vitamines must all produce the same stem so they
        // match each other in both the index and the query.
        expect(stem('vitamin')).toBe('vitamin');
        expect(stem('vitamins')).toBe('vitamin');
        expect(stem('vitamines')).toBe('vitamin');
        // advantage / advantages share a stem
        expect(stem('advantage')).toBe('advantag');
        expect(stem('advantages')).toBe('advantag');
        // -ing with double-letter collapse
        expect(stem('running')).toBe('run');
    });

    it('stemmer strips all supported suffix patterns', () => {
        // -ational → -ate
        expect(stem('relational')).toBe('relate');
        // -ness
        expect(stem('happiness')).toBe('happi');
        // -ment
        expect(stem('treatment')).toBe('treat');
        // -tion
        expect(stem('nutrition')).toBe('nutrit');
        // -sion
        expect(stem('expansion')).toBe('expans');
        // -ize
        expect(stem('optimize')).toBe('optim');
        // -ise
        expect(stem('advertise')).toBe('advert');
        // -ing (no double consonant)
        expect(stem('computing')).toBe('comput');
        // -ing (double consonant collapse)
        expect(stem('running')).toBe('run');
        expect(stem('sitting')).toBe('sit');
        // -ed (no double consonant)
        expect(stem('computed')).toBe('comput');
        // -ed (double consonant collapse)
        expect(stem('stemmed')).toBe('stem');
        // -er
        expect(stem('greater')).toBe('great');
        // -ly
        expect(stem('quickly')).toBe('quick');
        // -ies → -i
        expect(stem('parties')).toBe('parti');
        // -es
        expect(stem('oranges')).toBe('orang');
        // -s (not -ss)
        expect(stem('fruits')).toBe('fruit');
        // -ss is not stripped
        expect(stem('grass')).toBe('grass');
        // -e
        expect(stem('compute')).toBe('comput');
    });

    it('stemmer handles exact technical terms without destroying them', () => {
        // Short tokens and identifiers should not be mangled by the stemmer.
        expect(stem('c')).toBe('c');             // length ≤ 3 — untouched
        expect(stem('ts')).toBe('ts');            // length ≤ 3 — untouched
        expect(stem('bm25')).toBe('bm25');        // no matching suffix
    });
});
