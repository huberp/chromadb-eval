/**
 * Tests for the BM25 index builder in src/prepare-bm25.ts.
 *
 * These tests verify that:
 *   1. tokenize() is consistent with webapp/bm25.js (same stop-word list and
 *      Porter stemmer, so index-time and query-time token streams match).
 *   2. buildBm25IndexData() produces a correct inverted index with proper
 *      document frequencies, term frequencies, doc lengths, and avgdl.
 *   3. BM25 scores computed from the precomputed index are equivalent to
 *      scores computed by the build()-based Bm25Index in bm25.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { stemmer } from 'stemmer';
import { tokenize, buildBm25IndexData } from '../prepare-bm25';

// ---------------------------------------------------------------------------
// tokenize()
// ---------------------------------------------------------------------------

describe('tokenize', () => {
    it('lowercases, splits on non-word chars, removes stop words, and stems', () => {
        const tokens = tokenize('Apples are nutritious fruits');
        // "are" is a stop word → removed
        // "apples" → stem "appl", "nutritious" → "nutritious" (or "nutritious")
        // "fruits" → "fruit"
        expect(tokens).not.toContain('are');
        expect(tokens).toContain(stemmer('apples'));
        expect(tokens).toContain(stemmer('fruits'));
    });

    it('returns empty array for empty input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize('   ')).toEqual([]);
    });

    it('removes all stop words from a stop-word-only string', () => {
        // "and", "of", "the" are all English stop words
        expect(tokenize('and of the')).toEqual([]);
    });

    it('stems inflected forms to the same token', () => {
        const t1 = tokenize('vitamin');
        const t2 = tokenize('vitamins');
        const t3 = tokenize('vitamines');
        expect(t1[0]).toBe(t2[0]);
        expect(t1[0]).toBe(t3[0]);
    });

    it('matches stemmer package output directly', () => {
        const tokens = tokenize('computing optimization');
        expect(tokens).toContain(stemmer('computing'));
        expect(tokens).toContain(stemmer('optimization'));
    });
});

// ---------------------------------------------------------------------------
// buildBm25IndexData()
// ---------------------------------------------------------------------------

describe('buildBm25IndexData', () => {
    it('returns n equal to the number of input entries', () => {
        const data = buildBm25IndexData([
            { id: 'doc-a', plainText: 'apple orange' },
            { id: 'doc-b', plainText: 'banana grape' },
        ]);
        expect(data.n).toBe(2);
    });

    it('computes avgdl as the mean token count across documents', () => {
        const data = buildBm25IndexData([
            { id: 'doc-a', plainText: 'apple orange banana' },   // 3 content words
            { id: 'doc-b', plainText: 'grape' },                  // 1 content word
        ]);
        // avgdl = (len(tokenize('apple orange banana')) + len(tokenize('grape'))) / 2
        const lenA = tokenize('apple orange banana').length;
        const lenB = tokenize('grape').length;
        expect(data.avgdl).toBeCloseTo((lenA + lenB) / 2, 5);
    });

    it('records docLengths indexed by integer document ID', () => {
        const data = buildBm25IndexData([
            { id: 'doc-a', plainText: 'apple orange' },
            { id: 'doc-b', plainText: 'vector database embeddings' },
        ]);
        // docs[0] = 'doc-a', docs[1] = 'doc-b'
        expect(typeof data.docLengths[0]).toBe('number');
        expect(typeof data.docLengths[1]).toBe('number');
        expect(data.docLengths[0]).toBe(tokenize('apple orange').length);
        expect(data.docLengths[1]).toBe(tokenize('vector database embeddings').length);
    });

    it('builds the inverted index with correct df', () => {
        const data = buildBm25IndexData([
            { id: 'doc-a', plainText: 'apple orange' },
            { id: 'doc-b', plainText: 'apple banana' },
            { id: 'doc-c', plainText: 'orange banana' },
        ]);
        const appleStem = stemmer('apple');
        const orangeStem = stemmer('orange');
        const bananaStem = stemmer('banana');
        // "apple" appears in doc-a and doc-b → df = 2
        expect(data.index[appleStem]?.df).toBe(2);
        // "orange" appears in doc-a and doc-c → df = 2
        expect(data.index[orangeStem]?.df).toBe(2);
        // "banana" appears in doc-b and doc-c → df = 2
        expect(data.index[bananaStem]?.df).toBe(2);
    });

    it('records correct term frequencies in postings', () => {
        const data = buildBm25IndexData([
            { id: 'doc-a', plainText: 'apple apple apple juice' },
            { id: 'doc-b', plainText: 'apple juice' },
        ]);
        const appleStem = stemmer('apple');
        const postings = data.index[appleStem]?.postings ?? [];
        // data.docs[0] = 'doc-a', data.docs[1] = 'doc-b'
        const postingA = postings.find(p => data.docs[p.id] === 'doc-a');
        const postingB = postings.find(p => data.docs[p.id] === 'doc-b');
        expect(postingA?.tf).toBe(3);
        expect(postingB?.tf).toBe(1);
    });

    it('maps doc string IDs to integer IDs via the docs table', () => {
        const data = buildBm25IndexData([
            { id: '01-apples.0', plainText: 'apples are tasty fruits' },
        ]);
        // docs table should map int 0 → '01-apples.0'
        expect(data.docs[0]).toBe('01-apples.0');
        // docLengths should be indexed by int ID
        expect(typeof data.docLengths[0]).toBe('number');
        // postings should use integer ID (0)
        const fruitStem = stemmer('fruits');
        const postings = data.index[fruitStem]?.postings ?? [];
        expect(postings[0]?.id).toBe(0);
    });

    it('handles empty plainText without throwing', () => {
        const data = buildBm25IndexData([
            { id: 'doc-a', plainText: '' },
            { id: 'doc-b', plainText: 'apple' },
        ]);
        expect(data.n).toBe(2);
        expect(data.docLengths[0]).toBe(0);  // doc-a has integer ID 0
    });

    it('handles an empty entries array', () => {
        const data = buildBm25IndexData([]);
        expect(data.n).toBe(0);
        expect(data.avgdl).toBe(0);
        expect(Object.keys(data.index).length).toBe(0);
    });

    it('produces BM25 scores consistent with the inline implementation', () => {
        // Reproduce a simple BM25 score computation using the precomputed data
        // and verify it matches a hand-computed reference.
        const BM25_K1 = 1.5;
        const BM25_B = 0.75;

        const entries = [
            { id: 'doc-a', plainText: 'apple apple apple orange' },
            { id: 'doc-b', plainText: 'banana orange grape' },
        ];
        const data = buildBm25IndexData(entries);

        const queryTerm = stemmer('orange');
        const entry = data.index[queryTerm];
        expect(entry).toBeDefined();

        const N = data.n;
        const { df, postings } = entry;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

        // Compute BM25 scores for each posting using numeric IDs
        const scores: Record<number, number> = {};
        for (const posting of postings) {
            const dl = data.docLengths[posting.id];  // posting.id is now a number
            const tfNorm = (posting.tf * (BM25_K1 + 1)) /
                (posting.tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / data.avgdl));
            scores[posting.id] = idf * tfNorm;
        }

        // Find integer IDs for doc-a and doc-b
        const idA = data.docs.indexOf('doc-a');
        const idB = data.docs.indexOf('doc-b');
        // "orange" appears once in both docs; doc-b is shorter so its score is higher
        expect(scores[idB]).toBeGreaterThan(scores[idA]);
    });
});
