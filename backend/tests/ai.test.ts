import { describe, expect, it, vi } from 'vitest';
import {
  buildRagPrompt,
  createGeminiAIService,
  type RetrievedChunk,
} from '../src/services/ai.js';

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

describe('createGeminiAIService (official GenAI v1beta REST endpoint)', () => {
  it('sends AQ-prefixed API key and outputDimensionality=768 for embedQuery and embedDocuments', async () => {
    const fakeVector = Array.from({ length: 768 }, (_, i) => i * 0.001);
    const mockFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        embedding: { values: fakeVector },
      }),
    }));

    const ai = createGeminiAIService({
      apiKey: 'AQ.test-key-123',
      embeddingModel: 'gemini-embedding-001',
      chatModel: 'gemini-2.5-flash',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const queryVec = await ai.embedQuery('What is RAG?');
    expect(queryVec).toHaveLength(768);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'AQ.test-key-123',
        },
      })
    );

    const parsedBody = JSON.parse(
      (mockFetch.mock.calls[0]?.[1] as { body: string }).body
    ) as { outputDimensionality: number; model: string };
    expect(parsedBody.outputDimensionality).toBe(768);
    expect(parsedBody.model).toBe('models/gemini-embedding-001');

    const docVecs = await ai.embedDocuments(['Chunk A', 'Chunk B']);
    expect(docVecs).toHaveLength(2);
    expect(docVecs[0]).toHaveLength(768);
    expect(docVecs[1]).toHaveLength(768);
  });

  it('automatically upgrades legacy text-embedding-004 model name to gemini-embedding-001', async () => {
    const fakeVector = Array(768).fill(0.1);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ embedding: { values: fakeVector } }),
    });

    const ai = createGeminiAIService({
      apiKey: 'AQ.test-key-123',
      embeddingModel: 'text-embedding-004',
      chatModel: 'gemini-2.5-flash',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await ai.embedQuery('Upgrade test');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      expect.anything()
    );
  });

  it('calls gemini-3.8-flash:generateContent (auto-upgrading legacy gemini-2.5-flash) and extracts grounded answer text', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Authentication uses Supabase JWT tokens.' }],
            },
          },
        ],
      }),
    });

    const ai = createGeminiAIService({
      apiKey: 'AQ.test-key-123',
      embeddingModel: 'gemini-embedding-001',
      chatModel: 'gemini-2.5-flash',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const answer = await ai.generateAnswer('How does auth work?', [
      {
        id: 'c1',
        documentId: 'd1',
        filename: 'doc.pdf',
        chunkIndex: 0,
        content: 'Authentication uses Supabase JWT tokens.',
        metadata: {},
        similarity: 0.92,
      },
    ]);

    expect(answer).toBe('Authentication uses Supabase JWT tokens.');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'AQ.test-key-123',
        },
      })
    );
  });

  it('throws a descriptive error instead of returning an empty vector when the Gemini API fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'API key not valid. Please pass a valid API key.' },
      }),
    });

    const ai = createGeminiAIService({
      apiKey: 'invalid-key',
      embeddingModel: 'gemini-embedding-001',
      chatModel: 'gemini-2.5-flash',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(ai.embedDocuments(['Chunk 1'])).rejects.toThrow(
      /API key not valid/i
    );
  });
});
