import type { DocumentRepository } from '../repositories/documentRepo.js';
import type { AIService } from './ai.js';

export interface SourceReference {
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export interface ChatResponse {
  answer: string;
  sources: SourceReference[];
}

export interface RagServiceDeps {
  repo: DocumentRepository;
  ai: AIService;
  matchThreshold?: number;
  matchCount?: number;
}

export interface AnswerQuestionOptions {
  documentId?: string;
}

export interface RagService {
  answerQuestion(
    userId: string,
    question: string,
    options?: AnswerQuestionOptions
  ): Promise<ChatResponse>;
}

const NO_CONTEXT_FALLBACK_MESSAGE =
  'Yüklediğiniz dokümanlarda bu soruyla ilgili bilgi bulunamadı. Lütfen ilgili bir PDF dokümanı yüklediğinizden ve işlenme durumunun tamamlandığından emin olun.';

export function createRagService(deps: RagServiceDeps): RagService {
  const { repo, ai, matchThreshold = 0.3, matchCount = 5 } = deps;

  return {
    async answerQuestion(
      userId: string,
      question: string,
      options: AnswerQuestionOptions = {}
    ): Promise<ChatResponse> {
      const cleanedQuestion = question.trim();
      const queryEmbedding = await ai.embedQuery(cleanedQuestion);

      const rawMatchedChunks = await repo.matchChunks(queryEmbedding, userId, {
        matchThreshold,
        matchCount: options.documentId ? matchCount * 3 : matchCount,
      });

      const matchedChunks = options.documentId
        ? rawMatchedChunks.filter((c) => c.documentId === options.documentId).slice(0, matchCount)
        : rawMatchedChunks;

      if (matchedChunks.length === 0) {
        return {
          answer: NO_CONTEXT_FALLBACK_MESSAGE,
          sources: [],
        };
      }

      const answer = await ai.generateAnswer(cleanedQuestion, matchedChunks);

      const sources: SourceReference[] = matchedChunks.map((chunk) => ({
        documentId: chunk.documentId,
        filename: chunk.filename,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        similarity: chunk.similarity,
      }));

      return {
        answer,
        sources,
      };
    },
  };
}
