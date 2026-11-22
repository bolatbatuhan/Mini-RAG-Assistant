import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { deleteDocument, getDocumentDetail, uploadDocument } from '../lib/api.ts';
import type { DocumentDetail, DocumentItem, DocumentStatus } from '../types/api.ts';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface DocumentsPanelProps {
  documents: DocumentItem[];
  loading: boolean;
  error: string | null;
  selectedDocumentId: string;
  onSelectDocumentId: (id: string) => void;
  onRefresh: () => Promise<void>;
}

function formatStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case 'completed':
      return 'Tamamlandı';
    case 'processing':
      return 'İşleniyor';
    case 'failed':
      return 'Hatalı';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function DocumentsPanel({
  documents,
  loading,
  error,
  selectedDocumentId,
  onSelectDocumentId,
  onRefresh,
}: DocumentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inspectedDoc, setInspectedDoc] = useState<DocumentDetail | null>(null);
  const [inspectLoadingId, setInspectLoadingId] = useState<string | null>(null);

  const validateAndUpload = async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setUploadError('Yalnızca PDF (.pdf) formatındaki dosyalar yüklenebilir.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`Dosya boyutu maksimum ${MAX_FILE_SIZE_MB} MB sınırını aşıyor.`);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadDocument(file);
      setUploadSuccess(
        `"${result.document.filename}" başarıyla işlendi (${result.chunkCount} metin parçası oluşturuldu).`
      );
      await onRefresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'PDF yüklenirken hata oluştu.');
      await onRefresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void validateAndUpload(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) {
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void validateAndUpload(file);
    }
  };

  const handleInspect = async (id: string) => {
    if (inspectedDoc?.id === id) {
      setInspectedDoc(null);
      return;
    }
    setInspectLoadingId(id);
    setUploadError(null);
    try {
      const detail = await getDocumentDetail(id);
      setInspectedDoc(detail);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Detay bilgisi alınamadı.');
    } finally {
      setInspectLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setUploadError(null);
    try {
      await deleteDocument(id);
      if (selectedDocumentId === id) {
        onSelectDocumentId('');
      }
      if (inspectedDoc?.id === id) {
        setInspectedDoc(null);
      }
      setConfirmDeleteId(null);
      await onRefresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Doküman silinemedi.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="panel documents-panel" aria-label="Doküman Yönetimi">
      <div className="panel-header">
        <div>
          <h2>Dokümanlarım</h2>
          <p className="panel-subtitle">PDF yükleyin ve işlenme durumunu takip edin</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void onRefresh()}
          disabled={loading || uploading}
        >
          Yenile
        </button>
      </div>

      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${uploading ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="file-input-hidden"
          id="pdf-upload-input"
        />
        <label htmlFor="pdf-upload-input" className="upload-label">
          <span className="upload-title">
            {uploading
              ? 'PDF metni çıkarılıyor ve vektörleştiriliyor...'
              : 'PDF dosyasını buraya sürükleyin veya seçmek için tıklayın'}
          </span>
          <span className="upload-hint">
            Yalnızca .pdf dosyaları • Maksimum {MAX_FILE_SIZE_MB} MB
          </span>
        </label>
      </div>

      {uploadError && (
        <div className="alert alert-error" role="alert">
          {uploadError}
        </div>
      )}

      {uploadSuccess && (
        <div className="alert alert-info" role="status">
          {uploadSuccess}
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {loading && documents.length === 0 ? (
        <div className="empty-box" role="status">
          Dokümanlar yükleniyor...
        </div>
      ) : documents.length === 0 ? (
        <div className="empty-box">
          <p>Henüz yüklenmiş bir PDF dokümanınız bulunmuyor.</p>
          <p className="empty-hint">
            İlk PDF dokümanınızı yükledikten sonra sağdaki sohbet panelinden sorular
            sorabilirsiniz.
          </p>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((doc) => {
            const isSelected = selectedDocumentId === doc.id;
            const isInspected = inspectedDoc?.id === doc.id;
            const isConfirmingDelete = confirmDeleteId === doc.id;

            return (
              <li
                key={doc.id}
                className={`document-card ${isSelected ? 'selected' : ''}`}
              >
                <div className="document-card-top">
                  <div className="document-info">
                    <span className="document-name" title={doc.filename}>
                      {doc.filename}
                    </span>
                    <span className="document-date">{formatDate(doc.createdAt)}</span>
                  </div>
                  <span className={`status-badge status-${doc.status}`}>
                    {formatStatusLabel(doc.status)}
                  </span>
                </div>

                {doc.errorMessage && (
                  <p className="document-error-text">Hata: {doc.errorMessage}</p>
                )}

                {isInspected && inspectedDoc && (
                  <div className="document-detail-box">
                    <div>
                      <strong>Doküman ID:</strong> <code>{inspectedDoc.id}</code>
                    </div>
                    <div>
                      <strong>Toplam Metin Parçası (Chunk):</strong> {inspectedDoc.chunkCount}
                    </div>
                    <div>
                      <strong>Durum:</strong> {formatStatusLabel(inspectedDoc.status)}
                    </div>
                  </div>
                )}

                <div className="document-actions">
                  {doc.status === 'completed' && (
                    <button
                      type="button"
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => onSelectDocumentId(isSelected ? '' : doc.id)}
                    >
                      {isSelected ? 'Filtre Aktif (Tümü İçin Tıkla)' : 'Sadece Bunu Sorgula'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleInspect(doc.id)}
                    disabled={inspectLoadingId === doc.id}
                  >
                    {inspectLoadingId === doc.id
                      ? 'Yükleniyor...'
                      : isInspected
                        ? 'Detayı Gizle'
                        : 'Detay'}
                  </button>

                  {!isConfirmingDelete ? (
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => setConfirmDeleteId(doc.id)}
                      disabled={deletingId === doc.id}
                    >
                      Sil
                    </button>
                  ) : (
                    <span className="confirm-delete-group">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => void handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? 'Siliniyor...' : 'Onayla'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingId === doc.id}
                      >
                        İptal
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
