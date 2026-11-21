import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { TokenVerifier } from '../src/middleware/auth.js';
import type {
  ChunkInsertInput,
  DocumentDetailRecord,
  DocumentRecord,
  DocumentRepository,
  DocumentStatus,
} from '../src/repositories/documentRepo.js';
import { createIngestionService } from '../src/services/ingestion.js';
import type { AIService } from '../src/services/ai.js';

function createInMemoryRepo(): DocumentRepository {
  const docs = new Map<string, DocumentRecord>();
  const chunks = new Map<string, ChunkInsertInput[]>();
  let counter = 1;

  return {
    async createDocument(userId: string, filename: string): Promise<DocumentRecord> {
      const id = `doc-${counter++}`;
      const record: DocumentRecord = {
        id,
        userId,
        filename,
        status: 'processing',
        errorMessage: null,
        createdAt: new Date().toISOString(),
      };
      docs.set(id, record);
      chunks.set(id, []);
      return record;
    },

    async updateDocumentStatus(
      documentId: string,
      userId: string,
      status: DocumentStatus,
      errorMessage: string | null = null
    ): Promise<DocumentRecord> {
      const existing = docs.get(documentId);
      if (!existing || existing.userId !== userId) {
        throw new Error('Document not found');
      }
      const updated: DocumentRecord = {
        ...existing,
        status,
        errorMessage,
      };
      docs.set(documentId, updated);
      return updated;
    },

    async insertChunks(newChunks: ChunkInsertInput[]): Promise<void> {
      for (const chunk of newChunks) {
        const list = chunks.get(chunk.documentId) ?? [];
        list.push(chunk);
        chunks.set(chunk.documentId, list);
      }
    },

    async listDocuments(userId: string): Promise<DocumentRecord[]> {
      return Array.from(docs.values()).filter((d) => d.userId === userId);
    },

    async getDocumentById(
      documentId: string,
      userId: string
    ): Promise<DocumentDetailRecord | null> {
      const existing = docs.get(documentId);
      if (!existing || existing.userId !== userId) {
        return null;
      }
      const docChunks = chunks.get(documentId) ?? [];
      return {
        ...existing,
        chunkCount: docChunks.length,
      };
    },

    async deleteDocument(documentId: string, userId: string): Promise<boolean> {
      const existing = docs.get(documentId);
      if (!existing || existing.userId !== userId) {
        return false;
      }
      docs.delete(documentId);
      chunks.delete(documentId);
      return true;
    },

    async matchChunks() {
      return [];
    },
  };
}

const fakeVerifyToken: TokenVerifier = async (token) => {
  if (token === 'token-user-a') {
    return { id: 'user-a', email: 'a@example.com' };
  }
  if (token === 'token-user-b') {
    return { id: 'user-b', email: 'b@example.com' };
  }
  return null;
};

const fakeAI: AIService = {
  async embedDocuments(texts: string[]) {
    return texts.map(() => Array(768).fill(0.1));
  },
  async embedQuery() {
    return Array(768).fill(0.1);
  },
  async generateAnswer() {
    return 'Mock answer';
  },
};

function setupTestApp(options: { maxUploadSizeMb?: number; failExtraction?: boolean } = {}) {
  const repo = createInMemoryRepo();
  const ingestionService = createIngestionService({
    repo,
    ai: fakeAI,
    extractText: async () => {
      if (options.failExtraction) {
        throw new Error('No extractable text found in PDF');
      }
      return {
        text: 'Sample extracted text from PDF about authentication and security.',
        pageCount: 1,
      };
    },
  });

  const app = createApp({
    verifyToken: fakeVerifyToken,
    documentRepo: repo,
    ingestionService,
    maxUploadSizeMb: options.maxUploadSizeMb ?? 1,
  });

  return { app, repo };
}

describe('Documents REST API (/api/documents)', () => {
  it('returns 401 when accessing /api/documents without authentication', async () => {
    const { app } = setupTestApp();
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('returns 400 when POST /api/documents has no file attached', async () => {
    const { app } = setupTestApp();
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PDF file is required/i);
  });

  it('returns 400 when uploading a non-PDF file', async () => {
    const { app } = setupTestApp();
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a')
      .attach('file', Buffer.from('hello world'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only PDF files are allowed/i);
  });

  it('returns 400 when file has .pdf extension but invalid PDF header', async () => {
    const { app } = setupTestApp();
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a')
      .attach('file', Buffer.from('not-a-real-pdf-binary'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid PDF file/i);
  });

  it('returns 413 when uploaded PDF exceeds maxUploadSizeMb', async () => {
    const { app } = setupTestApp({ maxUploadSizeMb: 0.001 }); // ~1 KB limit
    const largeBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4096, 'a')]);

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a')
      .attach('file', largeBuffer, {
        filename: 'huge.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/File size exceeds/i);
  });

  it('uploads a valid PDF, runs ingestion, and returns 201 with completed document', async () => {
    const { app } = setupTestApp();
    const pdfBuffer = Buffer.from('%PDF-1.4\nvalid fake pdf content');

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a')
      .attach('file', pdfBuffer, {
        filename: 'architecture.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({
      filename: 'architecture.pdf',
      userId: 'user-a',
      status: 'completed',
    });
    expect(res.body.chunkCount).toBe(1);
  });

  it('marks document as failed and returns 422 when PDF text extraction fails', async () => {
    const { app } = setupTestApp({ failExtraction: true });
    const pdfBuffer = Buffer.from('%PDF-1.4\nscanned image only');

    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a')
      .attach('file', pdfBuffer, {
        filename: 'scanned.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(422);
    expect(uploadRes.body.error).toMatch(/No extractable text found in PDF/i);

    const listRes = await request(app)
      .get('/api/documents')
      .set('Authorization', 'Bearer token-user-a');

    expect(listRes.status).toBe(200);
    expect(listRes.body.documents).toHaveLength(1);
    expect(listRes.body.documents[0].status).toBe('failed');
  });

  it('enforces strict user ownership isolation on list, detail, and delete endpoints', async () => {
    const { app } = setupTestApp();
    const pdfBuffer = Buffer.from('%PDF-1.4\nuser A secret pdf');

    // User A uploads a document
    const uploadRes = await request(app)
      .post('/api/documents')
      .set('Authorization', 'Bearer token-user-a')
      .attach('file', pdfBuffer, {
        filename: 'user-a-secret.pdf',
        contentType: 'application/pdf',
      });

    const docId = uploadRes.body.document.id as string;

    // User B lists documents -> should see 0 documents
    const listB = await request(app)
      .get('/api/documents')
      .set('Authorization', 'Bearer token-user-b');
    expect(listB.status).toBe(200);
    expect(listB.body.documents).toEqual([]);

    // User B tries to get User A's document detail -> 404
    const detailB = await request(app)
      .get(`/api/documents/${docId}`)
      .set('Authorization', 'Bearer token-user-b');
    expect(detailB.status).toBe(404);

    // User B tries to delete User A's document -> 404
    const deleteB = await request(app)
      .delete(`/api/documents/${docId}`)
      .set('Authorization', 'Bearer token-user-b');
    expect(deleteB.status).toBe(404);

    // User A can fetch detail -> 200 with chunkCount
    const detailA = await request(app)
      .get(`/api/documents/${docId}`)
      .set('Authorization', 'Bearer token-user-a');
    expect(detailA.status).toBe(200);
    expect(detailA.body.document).toMatchObject({
      id: docId,
      filename: 'user-a-secret.pdf',
      chunkCount: 1,
    });

    // User A deletes own document -> 200
    const deleteA = await request(app)
      .delete(`/api/documents/${docId}`)
      .set('Authorization', 'Bearer token-user-a');
    expect(deleteA.status).toBe(200);
    expect(deleteA.body).toEqual({ deleted: true });

    // Confirm deleted
    const detailAfterDelete = await request(app)
      .get(`/api/documents/${docId}`)
      .set('Authorization', 'Bearer token-user-a');
    expect(detailAfterDelete.status).toBe(404);
  });
});
