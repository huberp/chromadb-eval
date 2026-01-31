# chromadb-eval

Evaluation of using ChromaDB vector store and full text search, based on TypeScript and fed with markdown files. This project demonstrates ChromaDB's vector and fulltext search capabilities using local embeddings.

## Features

- **Local Embeddings**: Uses custom TF-IDF-based embeddings for local operation without API calls
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

This application requires a ChromaDB server to be running. Start it using Docker:

```bash
docker run -d -p 8000:8000 chromadb/chroma:latest
```

Or use Docker Compose (create a `docker-compose.yml` file):

```yaml
version: '3.8'
services:
  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
```

Then run:
```bash
docker-compose up -d
```

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

### Configuration Options

You can customize chunking behavior via environment variables:
- `CHUNKING_MODE`: Set to `legacy` (default) or `ast`
- `CHUNK_SIZE`: Target chunk size in characters (default: 1000)
- `CHUNK_OVERLAP`: Overlap size between chunks in characters (default: 150)

Example with custom settings:
```bash
CHUNKING_MODE=ast CHUNK_SIZE=1500 CHUNK_OVERLAP=200 npm start
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
- `src/embeddings.ts`: Local embedding generation using Transformers.js
- `src/chromadb-manager.ts`: ChromaDB operations including storage, querying, and analysis
- `src/index.ts`: Main application orchestrating the workflow
- `documents/`: 20 markdown documents for demonstration

## Technical Details

- **Chunk Size**: 500 characters with 50 character overlap
- **Embedding Model**: Custom TF-IDF-based embeddings (384-dimensional vectors)
- **Similarity Metric**: Cosine similarity
- **Storage**: Local ChromaDB instance

## Requirements

- Node.js 18+
- npm or yarn

## License

ISC
