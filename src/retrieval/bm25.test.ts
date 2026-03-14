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

function tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 0);
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
});
