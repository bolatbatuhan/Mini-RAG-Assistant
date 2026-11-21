import type { DocumentRecord, DocumentRepository } from '../repositories/documentRepo.js';
import type { AIService } from './ai.js';
import { splitTextIntoChunks, type ChunkOptions } from './chunker.js';
import { extractPdfText, type PdfTextExtractor } from './pdf.js';

export class IngestionError extends Error {
  public readonly documentId: string;

  constructor(message: string, documentId: string) {
    super(message);
    this.name = 'IngestionError';
    this.documentId = documentId;
  }
}

export interface IngestPdfInput {
  userId: string;
  filename: string;
  buffer: Buffer;
}

export interface IngestPdfResult {
  document: DocumentRecord;
  chunkCount: number;
}

export interface IngestionServiceDeps {
  repo: DocumentRepository;
  ai: AIService;
  extractText?: PdfTextExtractor;
  chunkOptions?: ChunkOptions;
}

export interface IngestionService {
  ingestPdf(input: IngestPdfInput): Promise<IngestPdfResult>;
}

export function createIngestionService(deps: IngestionServiceDeps): IngestionService {
  const { repo, ai, extractText = extractPdfText, chunkOptions } = deps;

  return {
    async ingestPdf(input: IngestPdfInput): Promise<IngestPdfResult> {
      const { userId, filename, buffer } = input;
      const createdDoc = await repo.createDocument(userId, filename);

      try {
        const { text, pageCount } = await extractText(buffer);
        const textChunks = await splitTextIntoChunks(text, chunkOptions);

        if (textChunks.length === 0) {
          throw new Error('Document produced zero text chunks after splitting');
        }

        const embeddings = await ai.embedDocuments(textChunks.map((c) => c.content));

        if (embeddings.length !== textChunks.length) {
          throw new Error('Embedding count mismatch with generated text chunks');
        }

        await repo.insertChunks(
          textChunks.map((chunk, index) => ({
            documentId: createdDoc.id,
            userId,
            content: chunk.content,
            embedding: embeddings[index]!,
            chunkIndex: chunk.chunkIndex,
            metadata: {
              filename,
              pageCount,
            },
          }))
        );

        const completedDoc = await repo.updateDocumentStatus(createdDoc.id, userId, 'completed');

        return {
          document: completedDoc,
          chunkCount: textChunks.length,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown ingestion failure';
        await repo.updateDocumentStatus(createdDoc.id, userId, 'failed', errorMessage);
        throw new IngestionError(errorMessage, createdDoc.id);
      }
    },
  };
}
