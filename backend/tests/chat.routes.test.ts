import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { TokenVerifier } from '../src/middleware/auth.js';
import type { DocumentRepository } from '../src/repositories/documentRepo.js';
import type { AIService, RetrievedChunk } from '../src/services/ai.js';

const fakeVerifyToken: TokenVerifier = async (token) => {
  if (token === 'token-user-a') {
    return { id: 'user-a', email: 'a@example.com' };
  }
  return null;
};

function setupChatTestApp(matchedChunks: RetrievedChunk[] = []) {
  const repo: DocumentRepository = {
    createDocument: vi.fn(),
    updateDocumentStatus: vi.fn(),
    insertChunks: vi.fn(),
    listDocuments: vi.fn(),
    getDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    matchChunks: vi.fn().mockResolvedValue(matchedChunks),
  };

  const aiService: AIService = {
    embedDocuments: vi.fn(),
    embedQuery: vi.fn().mockResolvedValue(Array(768).fill(0.25)),
    generateAnswer: vi
      .fn()
      .mockResolvedValue('Kullanıcı doğrulaması Supabase JWT token ile yapılır.'),
  };

  const app = createApp({
    verifyToken: fakeVerifyToken,
    documentRepo: repo,
    aiService,
  });

  return { app, repo, aiService };
}

describe('POST /api/chat', () => {
  it('returns 401 when unauthenticated', async () => {
    const { app } = setupChatTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ question: 'How does authentication work?' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when question is missing or blank', async () => {
    const { app } = setupChatTestApp();
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-user-a')
      .send({ question: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('retrieves relevant chunks scoped to authenticated user, generates answer, and returns sources', async () => {
    const sampleChunks: RetrievedChunk[] = [
      {
        id: 'chunk-10',
        documentId: 'doc-1',
        filename: 'auth-guide.pdf',
        chunkIndex: 2,
        content: 'Uygulamada kullanıcı doğrulaması Supabase JWT token ile yapılır.',
        metadata: { pageCount: 4 },
        similarity: 0.91,
      },
    ];

    const { app, repo, aiService } = setupChatTestApp(sampleChunks);

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-user-a')
      .send({ question: 'Uygulamada kullanıcı doğrulaması nasıl yapılıyor?' });

    expect(res.status).toBe(200);
    expect(aiService.embedQuery).toHaveBeenCalledWith(
      'Uygulamada kullanıcı doğrulaması nasıl yapılıyor?'
    );
    expect(repo.matchChunks).toHaveBeenCalledWith(
      expect.any(Array),
      'user-a',
      expect.objectContaining({
        matchThreshold: 0.3,
        matchCount: 5,
      })
    );
    expect(aiService.generateAnswer).toHaveBeenCalledWith(
      'Uygulamada kullanıcı doğrulaması nasıl yapılıyor?',
      sampleChunks
    );

    expect(res.body).toEqual({
      answer: 'Kullanıcı doğrulaması Supabase JWT token ile yapılır.',
      sources: [
        {
          documentId: 'doc-1',
          filename: 'auth-guide.pdf',
          chunkIndex: 2,
          content: 'Uygulamada kullanıcı doğrulaması Supabase JWT token ile yapılır.',
          similarity: 0.91,
        },
      ],
    });
  });

  it('returns fallback message and empty sources without calling LLM when no relevant chunks are found', async () => {
    const { app, aiService } = setupChatTestApp([]);

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer token-user-a')
      .send({ question: 'Kuantum bilgisayarların çalışma prensibi nedir?' });

    expect(res.status).toBe(200);
    expect(aiService.generateAnswer).not.toHaveBeenCalled();
    expect(res.body.sources).toEqual([]);
    expect(res.body.answer).toMatch(/ilgili bilgi bulunamadı|not find relevant/i);
  });
});
