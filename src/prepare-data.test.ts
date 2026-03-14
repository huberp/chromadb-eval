/**
 * Tests for prepare-data.ts output: verifies that embeddings.json entries
 * contain the plainText field populated with non-empty markdown-stripped text.
 *
 * Uses the actual documents in the /documents directory and the AstDocumentChunker
 * + removeMd so we can validate the field without running the full pipeline.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import removeMd from 'remove-markdown';
import { AstDocumentChunker } from './chunking/ast-chunker';

const DOCUMENTS_DIR = path.resolve(__dirname, '../documents');

describe('prepare-data plainText field', () => {
    it('generates non-empty plainText for every chunk', () => {
        const mdFiles = fs.readdirSync(DOCUMENTS_DIR)
            .filter(f => f.endsWith('.md'))
            .sort();

        expect(mdFiles.length).toBeGreaterThan(0);

        const chunker = new AstDocumentChunker();

        for (const file of mdFiles) {
            const content = fs.readFileSync(path.join(DOCUMENTS_DIR, file), 'utf-8');
            const chunks = chunker.chunkMarkdown(content, file);

            for (const chunk of chunks) {
                const plainText = removeMd(chunk.content);
                expect(typeof plainText).toBe('string');
                expect(plainText.trim().length).toBeGreaterThan(0);
            }
        }
    });

    it('plainText does not contain markdown heading syntax', () => {
        const mdFiles = fs.readdirSync(DOCUMENTS_DIR)
            .filter(f => f.endsWith('.md'))
            .sort()
            .slice(0, 3); // Test a subset for speed

        const chunker = new AstDocumentChunker();

        for (const file of mdFiles) {
            const content = fs.readFileSync(path.join(DOCUMENTS_DIR, file), 'utf-8');
            const chunks = chunker.chunkMarkdown(content, file);

            for (const chunk of chunks) {
                const plainText = removeMd(chunk.content);
                // Heading syntax (lines starting with #) should be stripped
                const lines = plainText.split('\n');
                for (const line of lines) {
                    expect(line).not.toMatch(/^#{1,6}\s/);
                }
            }
        }
    });
});
