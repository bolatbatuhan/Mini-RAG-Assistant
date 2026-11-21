import { describe, expect, it } from 'vitest';
import { splitTextIntoChunks } from '../src/services/chunker.js';

describe('splitTextIntoChunks', () => {
  it('splits long text into overlapping chunks with sequential chunkIndex', async () => {
    const paragraph = 'Authentication in this application uses Supabase JWT bearer tokens. ';
    const longText = paragraph.repeat(40); // ~2720 chars

    const chunks = await splitTextIntoChunks(longText, {
      chunkSize: 500,
      chunkOverlap: 100,
    });

    expect(chunks.length).toBeGreaterThan(4);
    chunks.forEach((chunk, index) => {
      expect(chunk.chunkIndex).toBe(index);
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.content.length).toBeLessThanOrEqual(500);
    });
  });

  it('returns a single chunk when text is shorter than chunkSize', async () => {
    const chunks = await splitTextIntoChunks('Short document text.', {
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        content: 'Short document text.',
      },
    ]);
  });

  it('returns an empty array for empty or whitespace-only text', async () => {
    const chunks = await splitTextIntoChunks('   \n\t  ');
    expect(chunks).toEqual([]);
  });
});
