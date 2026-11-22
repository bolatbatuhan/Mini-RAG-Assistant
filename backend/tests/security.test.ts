import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { TokenVerifier } from '../src/middleware/auth.js';
import type { DocumentRepository } from '../src/repositories/documentRepo.js';
import type { AIService } from '../src/services/ai.js';

const fakeVerifyToken: TokenVerifier = async (token) => {
  if (token === 'token-user-a') {
    return { id: 'user-a', email: 'a@example.com' };
  }
  return null;
};

function createTestDeps() {
  const repo: DocumentRepository = {
    createDocument: vi.fn(),
    updateDocumentStatus: vi.fn(),
    insertChunks: vi.fn(),
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    matchChunks: vi.fn().mockResolvedValue([]),
  };

  const aiService: AIService = {
    embedDocuments: vi.fn(),
    embedQuery: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
    generateAnswer: vi.fn().mockResolvedValue('Answer'),
  };

  return { repo, aiService };
}

describe('Backend Security Hardening (Strict CORS & Rate Limiting)', () => {
  it('allows requests from configured ALLOWED_ORIGIN', async () => {
    const { repo, aiService } = createTestDeps();
    const app = createApp({
      verifyToken: fakeVerifyToken,
      documentRepo: repo,
      aiService,
      allowedOrigin: 'https://my-rag-app.vercel.app',
    });

    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://my-rag-app.vercel.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://my-rag-app.vercel.app');
  });

  it('rejects requests from unauthorized origins with 403', async () => {
    const { repo, aiService } = createTestDeps();
    const app = createApp({
      verifyToken: fakeVerifyToken,
      documentRepo: repo,
      aiService,
      allowedOrigin: 'https://my-rag-app.vercel.app',
    });

    const res = await request(app)
      .get('/api/documents')
      .set('Origin', 'https://malicious-site.example.com')
      .set('Authorization', 'Bearer token-user-a');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not allowed by CORS/i);
  });

  it('enforces rate limiting on /api/chat when enabled and returns 429 on excess requests', async () => {
    const { repo, aiService } = createTestDeps();
    const app = createApp({
      verifyToken: fakeVerifyToken,
      documentRepo: repo,
      aiService,
      enableRateLimit: true,
      rateLimitMax: 2,
    });

    const sendChat = () =>
      request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer token-user-a')
        .send({ question: 'Test question?' });

    const res1 = await sendChat();
    const res2 = await sendChat();
    const res3 = await sendChat();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(429);
    expect(res3.body.error).toMatch(/Too many requests|Çok fazla istek/i);
  });
});
