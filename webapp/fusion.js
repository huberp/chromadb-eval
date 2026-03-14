/**
 * Reciprocal Rank Fusion (RRF) for hybrid dense + BM25 retrieval.
 *
 * RRF formula: score(id) += 1 / (rrfK + rank) for each ranked list.
 * Tie-break by id (lexicographic) for determinism.
 *
 * Reference: Cormack, Clarke & Buettcher (2009) — "Reciprocal Rank Fusion
 * outperforms Condorcet and individual Rank Learning Methods".
 */

/**
 * Fuse multiple ranked lists using Reciprocal Rank Fusion.
 *
 * @param {Array<Array<{id: string}>>} rankedLists - Each list is ordered best-first.
 * @param {number} k - Number of results to return.
 * @param {number} rrfK - RRF constant (default 60, standard value from literature).
 * @returns {Array<{id: string, score: number}>} - Fused results, best-first.
 */
export function rrfFuse(rankedLists, k, rrfK = 60) {
    const scores = new Map(); // id -> accumulated RRF score

    for (const list of rankedLists) {
        list.forEach((item, rank) => {
            // rank is 0-based; RRF uses 1-based rank convention
            const rrfScore = 1 / (rrfK + rank + 1);
            scores.set(item.id, (scores.get(item.id) || 0) + rrfScore);
        });
    }

    // Sort by score desc, tie-break by id asc for determinism
    const results = Array.from(scores.entries())
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    return results.slice(0, k);
}
