import { describe, expect, it, vi } from 'vitest';
import type { DocumentRecord, DocumentRepository } from '../src/repositories/documentRepo.js';
import type { AIService } from '../src/services/ai.js';
import { createIngestionService, IngestionError } from '../src/services/ingestion.js';

function createMockRepo(overrides: Partial<DocumentRepository> = {}): DocumentRepository {
  const baseDoc: DocumentRecord = {
    id: 'doc-100',
    userId: 'user-1',
    filename: 'handbook.pdf',
    status: 'processing',
    errorMessage: null,
    createdAt: '2026-11-21T06:00:00.000Z',
  };

  return {
    createDocument: vi.fn().mockResolvedValue(baseDoc),
    updateDocumentStatus: vi
      .fn()
      .mockImplementation(async (_docId, _userId, status, errorMessage = null) => ({
        ...baseDoc,
        status,
        errorMessage,
      })),
    insertChunks: vi.fn().mockResolvedValue(undefined),
    listDocuments: vi.fn().mockResolvedValue([]),
    getDocumentById: vi.fn().mockResolvedValue(null),
    deleteDocument: vi.fn().mockResolvedValue(true),
    matchChunks: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createMockAI(overrides: Partial<AIService> = {}): AIService {
  return {
    embedDocuments: vi.fn().mockImplementation(async (texts: string[]) =>
      texts.map((_, i) => Array(768).fill(0.01 * (i + 1)))
    ),
    embedQuery: vi.fn().mockResolvedValue(Array(768).fill(0.05)),
    generateAnswer: vi.fn().mockResolvedValue('Mock answer'),
    ...overrides,
  };
}

describe('createIngestionService', () => {
  it('creates document, extracts PDF text, chunks, embeds, stores chunks, and marks document completed', async () => {
    const repo = createMockRepo();
    const ai = createMockAI();
    const extractText = vi.fn().mockResolvedValue({
      text: 'Paragraph one about authentication.\n\nParagraph two about authorization.',
      pageCount: 2,
    });

    const service = createIngestionService({ repo, ai, extractText });

    const result = await service.ingestPdf({
      userId: 'user-1',
      filename: 'handbook.pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf'),
    });

    expect(repo.createDocument).toHaveBeenCalledWith('user-1', 'handbook.pdf');
    expect(extractText).toHaveBeenCalledTimes(1);
    expect(ai.embedDocuments).toHaveBeenCalledTimes(1);
    expect(repo.insertChunks).toHaveBeenCalledTimes(1);

    const insertedChunks = vi.mocked(repo.insertChunks).mock.calls[0]?.[0] ?? [];
    expect(insertedChunks.length).toBeGreaterThan(0);
    expect(insertedChunks[0]).toMatchObject({
      documentId: 'doc-100',
      userId: 'user-1',
      chunkIndex: 0,
      metadata: { filename: 'handbook.pdf', pageCount: 2 },
    });

    expect(repo.updateDocumentStatus).toHaveBeenCalledWith('doc-100', 'user-1', 'completed');
    expect(result.document.status).toBe('completed');
    expect(result.chunkCount).toBe(insertedChunks.length);
  });

  it('marks document status as failed with error_message when extraction or embedding fails', async () => {
    const repo = createMockRepo();
    const ai = createMockAI();
    const extractText = vi.fn().mockRejectedValue(new Error('No extractable text found in PDF'));

    const service = createIngestionService({ repo, ai, extractText });

    await expect(
      service.ingestPdf({
        userId: 'user-1',
        filename: 'scanned.pdf',
        buffer: Buffer.from('%PDF-1.4 scanned'),
      })
    ).rejects.toBeInstanceOf(IngestionError);

    expect(repo.updateDocumentStatus).toHaveBeenCalledWith(
      'doc-100',
      'user-1',
      'failed',
      'No extractable text found in PDF'
    );
    expect(repo.insertChunks).not.toHaveBeenCalled();
  });
});
