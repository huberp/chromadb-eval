# Recommended Improvements for RAG System

This document outlines practical, high-ROI upgrades to move this project from a solid baseline RAG demo toward more production-style ("state of the art") retrieval-augmented generation.

## 1. Hybrid retrieval (dense + lexical)
**Problem:** Pure dense-vector similarity can miss exact-match needs (filenames, symbols, IDs, error messages, rare terms).

**Improve by:**
- Add a keyword/BM25-style index in addition to dense embeddings.
- Fuse dense and lexical candidates using a simple strategy like **Reciprocal Rank Fusion (RRF)** or a weighted score.

**Suggested implementation approach:**
- Keep Chroma (dense) for semantic retrieval.
- Add a lightweight lexical layer (e.g., BM25) over the same chunk texts.
- Retrieve top *k1* from each, then fuse → top *k*.

## 2. Reranking (cross-encoder)
**Problem:** The initial top-k from vector search often contains near-misses.

**Improve by:**
- Retrieve a larger candidate set (e.g., 30–100 chunks).
- Run a **reranker** (cross-encoder) that scores (query, chunk) pairs and selects the best final context.

**Notes:**
- This is one of the most impactful upgrades for answer quality.
- Reranking is typically slower than embeddings, so apply it only to a small candidate set.

## 3. Chunking improvements (token-aware + adaptive)
**Problem:** Chunking by characters can produce inconsistent token lengths and may split semantically coherent units.

**Improve by:**
- Chunk by **tokens** (embedder/LLM tokenization) to respect model context limits.
- Use **adaptive rules** per content type:
  - Keep code blocks intact when possible.
  - Keep tables intact.
  - Prefer chunk boundaries at headings/sections.

## 4. Query-aware context expansion / context packing
**Problem:** Small chunks help retrieval, but answers often need surrounding context.

**Improve by:**
- After selecting the final chunks, optionally **expand** context by including neighbors (previous/next) or parent section headings.
- Implement **context packing**: deduplicate near-identical chunks and pack the most coverage under a token budget.

## 5. Embedding model strategy (domain + prompting)
**Problem:** One embedding model is rarely optimal for every corpus.

**Improve by:**
- Evaluate alternative embedding models based on your domain (general text vs developer docs vs code).
- Follow model-specific conventions (some models expect query/passage prefixes or specific pooling behavior).
- Ensure embeddings are **normalized** when using cosine similarity (you already do this in transformers.js).

## 6. Metadata filtering as a first-class feature
**Problem:** Retrieval often improves dramatically when you can scope candidates.

**Improve by:**
- Add metadata filters (language, file path, doc type, section, recency) during retrieval.
- Consider structured fields for headings and source URL so UIs can present better citations.

## 7. Multi-vector / sparse+dense representations (optional)
**Problem:** A single vector per chunk can lose important signals.

Improve by (optional, more advanced):
- Store multiple embeddings per source (e.g., chunk text + title/heading embedding).
- Consider sparse encoders (or BM25) in combination with dense encoders.

## 8. Citations and traceability
**Problem:** Without citations, it’s hard to debug and trust answers.

**Improve by:**
- Always return citations (chunk URLs) for each answer.
- Store and display: source file, section, raw URL, and offsets/neighbor links.

## 9. Answerability + clarifying questions
**Problem:** RAG systems can hallucinate when retrieval is weak.

**Improve by:**
- Add simple confidence heuristics:
  - similarity thresholds
  - reranker score thresholds
  - agreement between lexical+dense retrievers
- If confidence is low, ask a clarifying question or return “not found in corpus.”

## 10. Evaluation harness (make improvements measurable)
**Problem:** It’s hard to know if changes help without metrics.

**Improve by:**
- Create a small “golden set” of queries with expected relevant chunks.
- Track retrieval metrics:
  - **Recall@k**
  - **MRR** (Mean Reciprocal Rank)
  - **nDCG**
- Compare strategies: dense-only vs hybrid vs hybrid+rerank, and chunking variants.

---

## Suggested roadmap
1. **Short term (days–weeks)**
   - Add hybrid retrieval (BM25 + dense) + metadata filters.
   - Add citations in output.

2. **Medium term (weeks–1–2 months)**
   - Add reranking.
   - Improve chunking to be token-aware and adaptive.
   - Add neighbor expansion + context packing.

3. **Long term (ongoing)**
   - Systematic embedding model evaluation.
   - Multi-vector approaches.
   - Expand evaluation suite and regression tests.
