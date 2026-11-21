import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { getEnv } from '../config/env.js';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface AIService {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  generateAnswer(question: string, contextChunks: RetrievedChunk[]): Promise<string>;
}

export function buildRagPrompt(question: string, chunks: RetrievedChunk[]): string {
  const formattedContext = chunks
    .map(
      (chunk, idx) =>
        `[Source ${idx + 1} | Document: ${chunk.filename} | Chunk #${chunk.chunkIndex}]\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  return [
    'You are a helpful document assistant. Answer the user question using ONLY the provided document excerpts below.',
    'If the provided excerpts do not contain enough information to answer the question, explicitly state that the answer could not be found in the uploaded documents. Do not invent facts outside the context.',
    'Respond in the same language as the user question.',
    '',
    '=== DOCUMENT EXCERPTS ===',
    formattedContext,
    '=== END OF EXCERPTS ===',
    '',
    `User Question: ${question}`,
  ].join('\n');
}

export function createGeminiAIService(): AIService {
  const env = getEnv();

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_EMBEDDING_MODEL,
  });

  const chatModel = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_CHAT_MODEL,
    temperature: 0.1,
  });

  return {
    async embedDocuments(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }
      return embeddings.embedDocuments(texts);
    },

    async embedQuery(text: string): Promise<number[]> {
      return embeddings.embedQuery(text);
    },

    async generateAnswer(question: string, contextChunks: RetrievedChunk[]): Promise<string> {
      const prompt = buildRagPrompt(question, contextChunks);
      const response = await chatModel.invoke(prompt);

      if (typeof response.content === 'string') {
        return response.content.trim();
      }

      if (Array.isArray(response.content)) {
        return response.content
          .map((part) => (typeof part === 'string' ? part : 'text' in part ? String(part.text ?? '') : ''))
          .join('')
          .trim();
      }

      return String(response.content ?? '').trim();
    },
  };
}
