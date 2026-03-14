/**
 * Node-side RRF fusion tests.
 *
 * These tests mirror the browser-side webapp/fusion.js logic.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal RRF implementation (mirrors webapp/fusion.js exactly)
// ---------------------------------------------------------------------------

function rrfFuse(
    rankedLists: Array<Array<{ id: string }>>,
    k: number,
    rrfK = 60
): Array<{ id: string; score: number }> {
    const scores = new Map<string, number>();

    for (const list of rankedLists) {
        list.forEach((item, rank) => {
            const rrfScore = 1 / (rrfK + rank + 1);
            scores.set(item.id, (scores.get(item.id) || 0) + rrfScore);
        });
    }

    return Array.from(scores.entries())
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, k);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rrfFuse', () => {
    it('promotes docs present in multiple lists', () => {
        const denseList = [{ id: 'doc-a' }, { id: 'doc-b' }, { id: 'doc-c' }];
        const bm25List  = [{ id: 'doc-b' }, { id: 'doc-d' }, { id: 'doc-a' }];

        const results = rrfFuse([denseList, bm25List], 5);
        const ids = results.map(r => r.id);

        // doc-b appears at rank 1 in dense and rank 0 in bm25 → highest combined score
        // doc-a appears at rank 0 in dense and rank 2 in bm25 → second
        expect(ids[0]).toBe('doc-b');
        expect(ids[1]).toBe('doc-a');
    });

    it('respects top-k limit', () => {
        const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
        const results = rrfFuse([list], 3);
        expect(results.length).toBe(3);
    });

    it('tie-breaks by id (lexicographic) for determinism', () => {
        // doc-z at rank 0 in list1, rank 1 in list2 → score = 1/(61) + 1/(62)
        // doc-a at rank 1 in list1, rank 0 in list2 → score = 1/(62) + 1/(61)
        // Both have identical scores; tie-break by id asc → doc-a first
        const list1 = [{ id: 'doc-z' }, { id: 'doc-a' }];
        const list2 = [{ id: 'doc-a' }, { id: 'doc-z' }];
        const results = rrfFuse([list1, list2], 2);
        expect(results[0].id).toBe('doc-a');
        expect(results[1].id).toBe('doc-z');
    });

    it('handles a single ranked list', () => {
        const list = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
        const results = rrfFuse([list], 3);
        expect(results.map(r => r.id)).toEqual(['x', 'y', 'z']);
    });

    it('handles empty ranked lists', () => {
        const results = rrfFuse([[], []], 5);
        expect(results).toEqual([]);
    });

    it('produces stable results on repeated calls (determinism)', () => {
        const list1 = [{ id: 'doc-1' }, { id: 'doc-2' }, { id: 'doc-3' }];
        const list2 = [{ id: 'doc-3' }, { id: 'doc-1' }, { id: 'doc-4' }];

        const r1 = rrfFuse([list1, list2], 4).map(r => r.id);
        const r2 = rrfFuse([list1, list2], 4).map(r => r.id);
        expect(r1).toEqual(r2);
    });

    it('accumulates scores correctly across lists', () => {
        // doc-a at rank 0 in both lists: score = 1/(60+1) + 1/(60+1) = 2/61
        // doc-b at rank 1 in both lists: score = 2/(60+2) = 2/62 < 2/61
        const list = [{ id: 'doc-a' }, { id: 'doc-b' }];
        const results = rrfFuse([list, list], 2);
        expect(results[0].id).toBe('doc-a');
        expect(results[0].score).toBeCloseTo(2 / 61, 6);
        expect(results[1].score).toBeCloseTo(2 / 62, 6);
    });
});
