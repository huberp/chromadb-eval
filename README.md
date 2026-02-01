# chromadb-eval

Evaluation of using ChromaDB vector store and full text search, based on TypeScript and fed with markdown files. This project demonstrates ChromaDB's vector and fulltext search capabilities with multiple embedding strategies, including modern LLM-based embeddings.

## Features

- **Multiple Embedding Strategies**:
  - **LLM Embeddings** (default): Uses transformers.js for local LLM-based embeddings with `Xenova/all-mpnet-base-v2`
  - **Local Embeddings**: Uses custom TF-IDF-based embeddings for lightweight operation
  - **HuggingFace Embeddings**: Uses Hugging Face Text Embeddings Inference server with modern AI models
- **Document Chunking**: Intelligent text chunking with overlap for better context preservation
  - **AST Chunker**: Structure-aware chunking using remark/mdast (default)
  - **Legacy Chunker**: String-based markdown chunking (fallback)
- **Vector Search**: Semantic search using ChromaDB's vector store
- **Fulltext Analysis**: Term frequency analysis across documents
- **Document Similarity**: Computes top 10 most similar document pairs
- **Interactive Queries**: Ask questions via command line or GitHub Actions workflow

## Documents

The project includes 20 markdown documents covering three main topics:
- **Fruits** (5 docs): Apples, Bananas, Oranges, Berries, Tropical Fruits
- **SIMD** (5 docs): Introduction, Vectors, CPUs, Programming, Optimization
- **Mathematics** (10 docs): Algebra, Calculus, Geometry, Number Theory, Statistics, Linear Algebra, Trigonometry, Set Theory, Combinatorics, Graph Theory

## Installation

```bash
npm install
```

## Prerequisites

This application requires a ChromaDB server to be running. The default embedding strategy uses transformers.js for local LLM-based embeddings, which requires no additional setup beyond installing npm dependencies.

### Option 1: ChromaDB with LLM embeddings (default, recommended)

Start ChromaDB using Docker:

```bash
docker run -d -p 8000:8000 chromadb/chroma:latest
```

This setup uses transformers.js with the `Xenova/all-mpnet-base-v2` model for high-quality embeddings. The model is automatically downloaded on first use and cached locally for future runs (approximately 80MB download).

### Option 2: ChromaDB with local TF-IDF embeddings (lightweight)

Start ChromaDB using Docker:

```bash
docker run -d -p 8000:8000 chromadb/chroma:latest
```

Then run with the local embedding strategy:

```bash
EMBEDDING_STRATEGY=local npm start
```

### Option 3: ChromaDB + HuggingFace Embeddings (external server)

Use Docker Compose to start both services:

```bash
docker-compose up -d
```

This will start:
- ChromaDB server on port 8000
- Hugging Face Text Embeddings Inference server on port 8001 with the `sentence-transformers/all-MiniLM-L6-v2` model

**Note:** The HuggingFace Text Embeddings Inference server requires internet access on first startup to download the model (approximately 80MB). Once downloaded, it will be cached in a Docker volume for future use.

## Usage

### Run the full evaluation

```bash
npm start
```

This will:
1. Chunk all markdown documents (using AST chunker by default)
2. Build and store the local ChromaDB with vectors and fulltext
3. Compute and display top 10 document similarities
4. Report 10 most common terms
5. Wait for user questions (if provided as argument)

### Switch between chunking modes

The application supports two chunking modes:

#### AST Mode (Default)
Structure-aware chunking using remark/mdast for better markdown understanding:
```bash
npm start
# or explicitly
CHUNKING_MODE=ast npm start
```

#### Legacy Mode (Fallback)
String-based markdown chunking with robust content detection:
```bash
CHUNKING_MODE=legacy npm start
```

**Note**: AST mode provides improved structural awareness of markdown documents. Both modes follow the same chunking strategies (chunk size, overlap, special handling for code blocks, lists, and tables) but AST mode leverages the Abstract Syntax Tree for more precise parsing.

### Switch between embedding strategies

The application supports three embedding strategies:

#### LLM Embeddings (Default, Recommended)
Uses transformers.js for local LLM-based embeddings with high-quality semantic understanding:
```bash
npm start
# or explicitly
EMBEDDING_STRATEGY=llm npm start
```

You can customize the model:
```bash
EMBEDDING_MODEL_ID=Xenova/all-MiniLM-L6-v2 npm start
```

#### Local Embeddings (Lightweight)
Uses TF-IDF-based embeddings for lightweight operation without model downloads:
```bash
EMBEDDING_STRATEGY=local npm start
```

#### HuggingFace Embeddings (External Server)
Uses Hugging Face Text Embeddings Inference server with modern AI models:
```bash
EMBEDDING_STRATEGY=huggingface npm start
```

**Note**: When using HuggingFace embeddings, make sure the embedding server is running (see Prerequisites section).

### Configuration Options

You can customize both chunking and embedding behavior via environment variables:

**Chunking:**
- `CHUNKING_MODE`: Set to `legacy` (default) or `ast`
- `CHUNK_SIZE`: Target chunk size in characters (default: 1000)
- `CHUNK_OVERLAP`: Overlap size between chunks in characters (default: 150)

**Embeddings:**
- `EMBEDDING_STRATEGY`: Set to `llm` (default), `local`, or `huggingface`
- `EMBEDDING_MODEL_ID`: Model ID for LLM embeddings (default: Xenova/all-mpnet-base-v2)
- `EMBEDDING_BATCH_SIZE`: Batch size for embedding generation (default: 32)
- `HUGGINGFACE_EMBEDDING_URL`: URL of the HuggingFace embedding server (default: http://localhost:8001/embed)
- `EMBEDDING_MODEL`: Model name for reference/logging

Example with custom settings:
```bash
CHUNKING_MODE=ast CHUNK_SIZE=1500 CHUNK_OVERLAP=200 EMBEDDING_STRATEGY=llm EMBEDDING_MODEL_ID=Xenova/all-MiniLM-L6-v2 npm start
```

### Ask a question

```bash
npm start "What are the benefits of apples?"
```

### Development mode

```bash
npm run dev
```

### Build TypeScript

```bash
npm run build
```

## GitHub Actions Workflows

This project includes several GitHub Actions workflows for different operations:

### Cache Embedding Model
Automatically downloads and caches the transformers.js embedding model for faster workflow runs:
1. Go to the "Actions" tab in GitHub
2. Select "Cache Embedding Model" workflow
3. Click "Run workflow"
4. The model will be cached and reused across all subsequent workflow runs

This workflow also runs automatically:
- Weekly to refresh the cache
- When embedding configuration changes

### Cache Prepared ChromaDB
Prepares ChromaDB with all documents and embeddings, then caches the result:
1. Go to the "Actions" tab in GitHub
2. Select "Cache Prepared ChromaDB" workflow
3. Click "Run workflow"
4. The prepared database will be cached and can be reused in other workflows

This workflow runs automatically when:
- Documents are modified
- Source code changes
- The workflow file itself changes
- Manual trigger (workflow_dispatch)

### Reusable ChromaDB Preparation
The project uses a reusable workflow (`.github/workflows/prepare-chromadb.yml`) that centralizes cache configuration and checking. This workflow:
- Computes model ID and cache keys in a consistent way
- Checks if the ChromaDB and model caches exist
- Returns outputs (cache_hit, model_id, cache_key) to calling workflows
- Each calling workflow then restores the caches in its own job environment

**Note:** Due to GitHub Actions job isolation, caches must be restored in each job that uses them. The reusable workflow serves as a "configuration provider" that ensures all workflows use identical cache keys and can check cache availability before running expensive operations.

This architecture eliminates code duplication in cache key computation and ensures consistent ChromaDB setup across all workflows.

### ChromaDB Query
Ask questions about the documents via GitHub Actions:
1. Go to the "Actions" tab in GitHub
2. Select "ChromaDB Query" workflow
3. Click "Run workflow"
4. Enter your question
5. View the results in the workflow run logs

This workflow uses cached ChromaDB data when available, or prepares it on-demand if the cache is not found.

### Compute Document Similarities
Manually trigger this workflow to compute and display the top 10 most similar document pairs based on vector embeddings.

### Analyze Common Terms
Manually trigger this workflow to analyze and display the 10 most common terms across all documents.

**Note:** All workflows now use LLM embeddings by default and leverage model caching for improved performance. The "Cache Prepared ChromaDB" workflow handles all database preparation and caching needs.

## Architecture

- `src/chunking/`: Document chunking module with configurable size and overlap
  - `legacy-chunker.ts`: Legacy string-based markdown chunker
  - `ast-chunker.ts`: AST-based markdown chunker (experimental)
  - `markdown-ast.ts`: AST parsing utilities
  - `index.ts`: Public API re-exports
- `src/config.ts`: Configuration module for chunking behavior
- `src/embedding-config.ts`: Configuration module for embedding strategies
- `src/embeddings.ts`: Local TF-IDF-based embedding generation (naive approach)
- `src/embeddings-transformers.ts`: Transformers.js-based LLM embeddings (default)
- `src/embedding-factory.ts`: Factory for creating embedding functions
- `src/chromadb-manager.ts`: ChromaDB operations including storage, querying, and analysis
- `src/index.ts`: Main application orchestrating the workflow
- `documents/`: 20 markdown documents for demonstration

## Technical Details

- **Chunk Size**: 1000 characters with 150 character overlap (configurable)
- **Embedding Models**:
  - **LLM (default)**: `Xenova/all-mpnet-base-v2` via transformers.js (768-dimensional vectors)
  - **Local**: Custom TF-IDF-based embeddings (384-dimensional vectors)
  - **HuggingFace**: `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vectors)
- **Similarity Metric**: Cosine similarity
- **Storage**: Local ChromaDB instance

## Requirements

- Node.js 18+
- npm or yarn

## License

ISC
