# chromadb-eval

Evaluation of using ChromaDB vector store and full text search, based on TypeScript and fed with markdown files. This project demonstrates ChromaDB's vector and fulltext search capabilities with both local and modern AI embeddings.

## Features

- **Multiple Embedding Strategies**:
  - **Local Embeddings** (default): Uses custom TF-IDF-based embeddings for local operation without API calls
  - **HuggingFace Embeddings**: Uses Hugging Face Text Embeddings Inference server with modern AI models
- **Document Chunking**: Intelligent text chunking with overlap for better context preservation
  - **Legacy Chunker**: String-based markdown chunking (default)
  - **AST Chunker**: Structure-aware chunking using remark/mdast (experimental)
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

This application requires a ChromaDB server to be running. You can also optionally run a Hugging Face Text Embeddings Inference server for modern AI embeddings.

### Option 1: ChromaDB only (uses local TF-IDF embeddings)

Start ChromaDB using Docker:

```bash
docker run -d -p 8000:8000 chromadb/chroma:latest
```

### Option 2: ChromaDB + HuggingFace Embeddings (recommended)

Use Docker Compose to start both services:

```bash
docker-compose up -d
```

This will start:
- ChromaDB server on port 8000
- Hugging Face Text Embeddings Inference server on port 8001 with the `sentence-transformers/all-MiniLM-L6-v2` model

The `sentence-transformers/all-MiniLM-L6-v2` model is compatible with both Hugging Face TEI and Transformers.js, making it ideal for this use case.

**Note:** The HuggingFace Text Embeddings Inference server requires internet access on first startup to download the model (approximately 80MB). Once downloaded, it will be cached in a Docker volume for future use. If you're in a restricted environment, you can pre-download the model or use the local TF-IDF embeddings instead.

## Usage

### Run the full evaluation

```bash
npm start
```

This will:
1. Chunk all markdown documents (using legacy chunker by default)
2. Build and store the local ChromaDB with vectors and fulltext
3. Compute and display top 10 document similarities
4. Report 10 most common terms
5. Wait for user questions (if provided as argument)

### Switch between chunking modes

The application supports two chunking modes:

#### Legacy Mode (Default)
String-based markdown chunking with robust content detection:
```bash
npm start
# or explicitly
CHUNKING_MODE=legacy npm start
```

#### AST Mode (Experimental)
Structure-aware chunking using remark/mdast for better markdown understanding:
```bash
CHUNKING_MODE=ast npm start
```

**Note**: AST mode is experimental and provides improved structural awareness of markdown documents. Both modes follow the same chunking strategies (chunk size, overlap, special handling for code blocks, lists, and tables) but AST mode leverages the Abstract Syntax Tree for more precise parsing.

### Switch between embedding strategies

The application supports two embedding strategies:

#### Local Embeddings (Default)
Uses TF-IDF-based embeddings for local operation without external dependencies:
```bash
npm start
# or explicitly
EMBEDDING_STRATEGY=local npm start
```

#### HuggingFace Embeddings (Recommended for production)
Uses Hugging Face Text Embeddings Inference server with modern AI models:
```bash
EMBEDDING_STRATEGY=huggingface npm start
```

**Note**: When using HuggingFace embeddings, make sure the embedding server is running (see Prerequisites section). The default configuration uses `sentence-transformers/all-MiniLM-L6-v2` which is compatible with Transformers.js.

### Configuration Options

You can customize both chunking and embedding behavior via environment variables:

**Chunking:**
- `CHUNKING_MODE`: Set to `legacy` (default) or `ast`
- `CHUNK_SIZE`: Target chunk size in characters (default: 1000)
- `CHUNK_OVERLAP`: Overlap size between chunks in characters (default: 150)

**Embeddings:**
- `EMBEDDING_STRATEGY`: Set to `local` (default) or `huggingface`
- `HUGGINGFACE_EMBEDDING_URL`: URL of the HuggingFace embedding server (default: http://localhost:8001/embed)
- `EMBEDDING_MODEL`: Model name for reference/logging (default: sentence-transformers/all-MiniLM-L6-v2 for huggingface, TF-IDF for local)

Example with custom settings:
```bash
CHUNKING_MODE=ast CHUNK_SIZE=1500 CHUNK_OVERLAP=200 EMBEDDING_STRATEGY=huggingface npm start
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

### ChromaDB Query
Ask questions about the documents via GitHub Actions:
1. Go to the "Actions" tab in GitHub
2. Select "ChromaDB Query" workflow
3. Click "Run workflow"
4. Enter your question
5. View the results in the workflow run logs

### Prepare ChromaDB
Automatically chunks documents and stores them in ChromaDB. Runs on:
- Manual trigger (workflow_dispatch)
- When documents or source code changes

### Compute Document Similarities
Manually trigger this workflow to compute and display the top 10 most similar document pairs based on vector embeddings.

### Analyze Common Terms
Manually trigger this workflow to analyze and display the 10 most common terms across all documents.

## Architecture

- `src/chunking/`: Document chunking module with configurable size and overlap
  - `legacy-chunker.ts`: Legacy string-based markdown chunker
  - `ast-chunker.ts`: AST-based markdown chunker (experimental)
  - `markdown-ast.ts`: AST parsing utilities
  - `index.ts`: Public API re-exports
- `src/config.ts`: Configuration module for chunking behavior
- `src/embedding-config.ts`: Configuration module for embedding strategies
- `src/embeddings.ts`: Local TF-IDF-based embedding generation (naive approach)
- `src/embedding-factory.ts`: Factory for creating embedding functions
- `src/chromadb-manager.ts`: ChromaDB operations including storage, querying, and analysis
- `src/index.ts`: Main application orchestrating the workflow
- `documents/`: 20 markdown documents for demonstration

## Technical Details

- **Chunk Size**: 1000 characters with 150 character overlap (configurable)
- **Embedding Models**:
  - **Local**: Custom TF-IDF-based embeddings (384-dimensional vectors)
  - **HuggingFace**: `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vectors, compatible with Transformers.js)
- **Similarity Metric**: Cosine similarity
- **Storage**: Local ChromaDB instance

## Requirements

- Node.js 18+
- npm or yarn

## License

ISC
