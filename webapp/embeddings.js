import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// Configure transformers.js to use CDN models
env.allowLocalModels = false;
env.allowRemoteModels = true;

const OWNER = 'huberp';
const REPO = 'chromadb-eval';
export const EMBEDDINGS_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/data-main/embeddings.json`;
const MODEL_ID = 'Xenova/all-mpnet-base-v2';

// Computes cosine similarity between two equal-length vectors.
// Returns a value in [-1, 1] where 1 means identical direction.
// Returns 0 if either vector has zero magnitude.
export function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

// Fetches the pre-computed embeddings JSON from the data-main branch.
// Calls updateStatus to report progress. Returns the embeddings array on success, null on error.
export async function loadEmbeddings(updateStatus) {
    try {
        updateStatus('Loading embeddings database...', 'loading');
        const response = await fetch(EMBEDDINGS_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch embeddings: ${response.status}`);
        }
        const embeddings = await response.json();
        updateStatus(`Loaded ${embeddings.length} document chunks`, 'success');
        return embeddings;
    } catch (error) {
        updateStatus(`Error loading embeddings: ${error.message}`, 'error');
        console.error('Error loading embeddings:', error);
        return null;
    }
}

// Loads the Transformers.js feature-extraction pipeline with the configured model
// using int8 quantization (dtype 'q8') for faster inference.
// Calls updateStatus to report progress. Returns the embedder on success, null on error.
export async function initializeModel(updateStatus) {
    try {
        updateStatus('Initializing embedding model (this may take a moment)...', 'loading');
        const embedder = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
        updateStatus('Model initialized successfully', 'success');
        return embedder;
    } catch (error) {
        updateStatus(`Error initializing model: ${error.message}`, 'error');
        console.error('Error initializing model:', error);
        return null;
    }
}

// Runs the query string through the embedding model using mean pooling and
// L2 normalization. Returns the embedding as a plain number array.
export async function computeQueryEmbedding(embedder, query) {
    if (!embedder) {
        throw new Error('Embedder not initialized');
    }

    const output = await embedder(query, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// Scores every entry in embeddings by cosine similarity to queryEmbedding,
// sorts descending, and returns the top k results (default 5).
export function findTopMatches(embeddings, queryEmbedding, k = 5) {
    const similarities = embeddings.map((entry, index) => ({
        index,
        similarity: cosineSimilarity(queryEmbedding, entry.embedding),
        entry
    }));

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Return top K
    return similarities.slice(0, k);
}
