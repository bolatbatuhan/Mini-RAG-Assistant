import { getSupabaseAdminClient } from '../lib/supabase.js';
import type { RetrievedChunk } from '../services/ai.js';

export type DocumentStatus = 'processing' | 'completed' | 'failed';

export interface DocumentRecord {
  id: string;
  userId: string;
  filename: string;
  status: DocumentStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface DocumentDetailRecord extends DocumentRecord {
  chunkCount: number;
}

export interface ChunkInsertInput {
  documentId: string;
  userId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  metadata: Record<string, unknown>;
}

export interface MatchChunksOptions {
  matchThreshold?: number;
  matchCount?: number;
}

export interface DocumentRepository {
  createDocument(userId: string, filename: string): Promise<DocumentRecord>;
  updateDocumentStatus(
    documentId: string,
    userId: string,
    status: DocumentStatus,
    errorMessage?: string | null
  ): Promise<DocumentRecord>;
  insertChunks(chunks: ChunkInsertInput[]): Promise<void>;
  listDocuments(userId: string): Promise<DocumentRecord[]>;
  getDocumentById(documentId: string, userId: string): Promise<DocumentDetailRecord | null>;
  deleteDocument(documentId: string, userId: string): Promise<boolean>;
  matchChunks(
    queryEmbedding: number[],
    userId: string,
    options?: MatchChunksOptions
  ): Promise<RetrievedChunk[]>;
}

interface DocumentRow {
  id: string;
  user_id: string;
  filename: string;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
}

interface MatchChunkRow {
  id: string;
  document_id: string;
  filename: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

function mapDocumentRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.filename,
    status: row.status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
  };
}

export function createSupabaseDocumentRepository(): DocumentRepository {
  const supabase = getSupabaseAdminClient();

  return {
    async createDocument(userId: string, filename: string): Promise<DocumentRecord> {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          filename,
          status: 'processing',
        })
        .select('id, user_id, filename, status, error_message, created_at')
        .single();

      if (error || !data) {
        throw new Error(`Failed to create document: ${error?.message ?? 'Unknown error'}`);
      }

      return mapDocumentRow(data as DocumentRow);
    },

    async updateDocumentStatus(
      documentId: string,
      userId: string,
      status: DocumentStatus,
      errorMessage: string | null = null
    ): Promise<DocumentRecord> {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status,
          error_message: errorMessage,
        })
        .eq('id', documentId)
        .eq('user_id', userId)
        .select('id, user_id, filename, status, error_message, created_at')
        .single();

      if (error || !data) {
        throw new Error(`Failed to update document status: ${error?.message ?? 'Unknown error'}`);
      }

      return mapDocumentRow(data as DocumentRow);
    },

    async insertChunks(chunks: ChunkInsertInput[]): Promise<void> {
      if (chunks.length === 0) {
        return;
      }

      const rows = chunks.map((chunk) => ({
        document_id: chunk.documentId,
        user_id: chunk.userId,
        content: chunk.content,
        embedding: chunk.embedding,
        chunk_index: chunk.chunkIndex,
        metadata: chunk.metadata,
      }));

      const { error } = await supabase.from('document_chunks').insert(rows);
      if (error) {
        throw new Error(`Failed to insert document chunks: ${error.message}`);
      }
    },

    async listDocuments(userId: string): Promise<DocumentRecord[]> {
      const { data, error } = await supabase
        .from('documents')
        .select('id, user_id, filename, status, error_message, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to list documents: ${error.message}`);
      }

      return ((data ?? []) as DocumentRow[]).map(mapDocumentRow);
    },

    async getDocumentById(documentId: string, userId: string): Promise<DocumentDetailRecord | null> {
      const { data, error } = await supabase
        .from('documents')
        .select('id, user_id, filename, status, error_message, created_at')
        .eq('id', documentId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to fetch document: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      const { count, error: countError } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .eq('user_id', userId);

      if (countError) {
        throw new Error(`Failed to count document chunks: ${countError.message}`);
      }

      return {
        ...mapDocumentRow(data as DocumentRow),
        chunkCount: count ?? 0,
      };
    },

    async deleteDocument(documentId: string, userId: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)
        .eq('user_id', userId)
        .select('id');

      if (error) {
        throw new Error(`Failed to delete document: ${error.message}`);
      }

      return Array.isArray(data) && data.length > 0;
    },

    async matchChunks(
      queryEmbedding: number[],
      userId: string,
      options: MatchChunksOptions = {}
    ): Promise<RetrievedChunk[]> {
      const matchThreshold = options.matchThreshold ?? 0.3;
      const matchCount = options.matchCount ?? 5;

      const { data, error } = await supabase.rpc('match_document_chunks', {
        query_embedding: queryEmbedding,
        p_user_id: userId,
        match_threshold: matchThreshold,
        match_count: matchCount,
      });

      if (error) {
        throw new Error(`Failed to match document chunks: ${error.message}`);
      }

      return ((data ?? []) as MatchChunkRow[]).map((row) => ({
        id: row.id,
        documentId: row.document_id,
        filename: row.filename,
        chunkIndex: row.chunk_index,
        content: row.content,
        metadata: row.metadata ?? {},
        similarity: row.similarity,
      }));
    },
  };
}
