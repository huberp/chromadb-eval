# chromadb-eval

Evaluation of using ChromaDB vector store and full text search, based on TypeScript and fed with markdown files. This project demonstrates ChromaDB's vector and fulltext search capabilities using local embeddings.

## Features

- **Local Embeddings**: Uses custom TF-IDF-based embeddings for local operation without API calls
- **Document Chunking**: Intelligent text chunking with overlap for better context preservation
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
1. Chunk all markdown documents
2. Build and store the local ChromaDB with vectors and fulltext
3. Compute and display top 10 document similarities
4. Report 10 most common terms
5. Wait for user questions (if provided as argument)

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

- `src/chunker.ts`: Document chunking logic with configurable size and overlap
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
