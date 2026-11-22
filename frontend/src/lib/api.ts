import { supabase } from './supabase.ts';
import type {
  ChatResponse,
  DocumentDetail,
  DocumentItem,
  UploadDocumentResponse,
} from '../types/api.ts';

const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:4000'
).replace(/\/+$/, '');

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Oturum süresi dolmuş veya geçersiz. Lütfen tekrar giriş yapın.');
  }
  return data.session.access_token;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body && typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  } catch {
    // ignore JSON parse error
  }
  return fallback;
}

export async function listDocuments(): Promise<DocumentItem[]> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/documents`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Dokümanlar yüklenemedi.'));
  }

  const data = (await response.json()) as { documents: DocumentItem[] };
  return data.documents ?? [];
}

export async function getDocumentDetail(id: string): Promise<DocumentDetail> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Doküman detayı alınamadı.'));
  }

  const data = (await response.json()) as { document: DocumentDetail };
  return data.document;
}

export async function uploadDocument(file: File): Promise<UploadDocumentResponse> {
  const token = await getAccessToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'PDF yükleme ve işleme başarısız oldu.'));
  }

  return (await response.json()) as UploadDocumentResponse;
}

export async function deleteDocument(id: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Doküman silinemedi.'));
  }
}

export async function askQuestion(
  question: string,
  documentId?: string
): Promise<ChatResponse> {
  const token = await getAccessToken();
  const payload: { question: string; documentId?: string } = { question };
  if (documentId) {
    payload.documentId = documentId;
  }

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Soru yanıtlanırken bir hata oluştu.'));
  }

  return (await response.json()) as ChatResponse;
}
