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

export interface GeminiAIServiceOptions {
  apiKey?: string;
  embeddingModel?: string;
  chatModel?: string;
  outputDimensionality?: number;
  fetchFn?: typeof fetch;
}

interface GeminiErrorPayload {
  error?: {
    message?: string;
    status?: string;
    code?: number;
  };
}

interface GeminiEmbedContentResponse extends GeminiErrorPayload {
  embedding?: {
    values?: number[];
  };
}

interface GeminiGenerateContentResponse extends GeminiErrorPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_EMBEDDING_DIMENSIONS = 768;

function resolveEmbeddingModel(rawModel?: string): string {
  const cleaned = (rawModel ?? 'gemini-embedding-001').trim().replace(/^models\//, '');
  if (!cleaned || cleaned === 'text-embedding-004' || cleaned === 'embedding-001') {
    return 'gemini-embedding-001';
  }
  return cleaned;
}

function resolveChatModel(rawModel?: string): string {
  const cleaned = (rawModel ?? 'gemini-2.5-flash').trim().replace(/^models\//, '');
  return cleaned || 'gemini-2.5-flash';
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

export function createGeminiAIService(options: GeminiAIServiceOptions = {}): AIService {
  const env = options.apiKey ? null : getEnv();
  const apiKey = options.apiKey ?? env!.GEMINI_API_KEY;
  const embeddingModel = resolveEmbeddingModel(
    options.embeddingModel ?? env?.GEMINI_EMBEDDING_MODEL
  );
  const chatModel = resolveChatModel(options.chatModel ?? env?.GEMINI_CHAT_MODEL);
  const outputDimensionality = options.outputDimensionality ?? DEFAULT_EMBEDDING_DIMENSIONS;
  const fetchFn = options.fetchFn ?? fetch;

  async function embedSingleText(text: string): Promise<number[]> {
    const cleanedText = text.replace(/\n/g, ' ').trim();
    const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(embeddingModel)}:embedContent`;

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: `models/${embeddingModel}`,
        content: {
          parts: [{ text: cleanedText || ' ' }],
        },
        outputDimensionality,
      }),
    });

    const data = (await response.json()) as GeminiEmbedContentResponse;

    if (!response.ok) {
      const apiMsg = data?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Gemini embedding request failed: ${apiMsg}`);
    }

    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini embedding response returned an empty vector');
    }

    return values;
  }

  return {
    async embedDocuments(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }

      const vectors: number[][] = [];
      for (const text of texts) {
        const vec = await embedSingleText(text);
        vectors.push(vec);
      }
      return vectors;
    },

    async embedQuery(text: string): Promise<number[]> {
      return embedSingleText(text);
    },

    async generateAnswer(question: string, contextChunks: RetrievedChunk[]): Promise<string> {
      const prompt = buildRagPrompt(question, contextChunks);
      const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(chatModel)}:generateContent`;

      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
          },
        }),
      });

      const data = (await response.json()) as GeminiGenerateContentResponse;

      if (!response.ok) {
        const apiMsg = data?.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`Gemini chat completion failed: ${apiMsg}`);
      }

      const answer = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!answer) {
        throw new Error('Gemini returned an empty answer');
      }

      return answer;
    },
  };
}
