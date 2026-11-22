export type DocumentStatus = 'processing' | 'completed' | 'failed';

export interface DocumentItem {
  id: string;
  userId: string;
  filename: string;
  status: DocumentStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface DocumentDetail extends DocumentItem {
  chunkCount: number;
}

export interface UploadDocumentResponse {
  document: DocumentItem;
  chunkCount: number;
}

export interface CitationSource {
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export interface ChatResponse {
  answer: string;
  sources: CitationSource[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: CitationSource[];
  timestamp: string;
}
