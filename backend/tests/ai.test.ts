import { describe, expect, it } from 'vitest';
import { buildRagPrompt, type RetrievedChunk } from '../src/services/ai.js';

describe('buildRagPrompt', () => {
  it('formats retrieved chunks with filename, chunk index, and content into a grounded prompt', () => {
    const chunks: RetrievedChunk[] = [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        filename: 'security-guide.pdf',
        chunkIndex: 0,
        content: 'User authentication is performed using Supabase Auth JWT access tokens.',
        metadata: { pageCount: 3 },
        similarity: 0.88,
      },
      {
        id: 'chunk-2',
        documentId: 'doc-2',
        filename: 'api-spec.pdf',
        chunkIndex: 4,
        content: 'Every protected API route verifies the Bearer token on the backend.',
        metadata: { pageCount: 10 },
        similarity: 0.79,
      },
    ];

    const prompt = buildRagPrompt('How is user authentication performed?', chunks);

    expect(prompt).toContain('security-guide.pdf');
    expect(prompt).toContain('Chunk #0');
    expect(prompt).toContain(
      'User authentication is performed using Supabase Auth JWT access tokens.'
    );
    expect(prompt).toContain('api-spec.pdf');
    expect(prompt).toContain('Chunk #4');
    expect(prompt).toContain('How is user authentication performed?');
    expect(prompt).toMatch(/ONLY|yalnızca/i);
  });
});
