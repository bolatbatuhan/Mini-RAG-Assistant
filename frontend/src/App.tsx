import { useCallback, useEffect, useState } from 'react';
import { AuthForm } from './components/AuthForm.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { DocumentsPanel } from './components/DocumentsPanel.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { listDocuments } from './lib/api.ts';
import type { DocumentItem } from './types/api.ts';

function WorkspaceContent() {
  const { user, loading, signOut } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');

  const refreshDocuments = useCallback(async () => {
    if (!user) {
      setDocuments([]);
      return;
    }
    setDocsLoading(true);
    setDocsError(null);
    try {
      const items = await listDocuments();
      setDocuments(items);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Dokümanlar alınamadı.');
    } finally {
      setDocsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void refreshDocuments();
    } else {
      setDocuments([]);
      setSelectedDocumentId('');
    }
  }, [user, refreshDocuments]);

  if (loading) {
    return (
      <main className="app-shell">
        <div className="loading-state" role="status">
          Oturum kontrol ediliyor...
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <AuthForm />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Mini RAG — Document Assistant</h1>
          <p className="app-subtitle">Kişisel PDF bilgi tabanınız üzerinde soru-cevap asistanı</p>
        </div>
        <div className="user-bar">
          <span className="user-email">{user.email}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            Çıkış Yap
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <DocumentsPanel
          documents={documents}
          loading={docsLoading}
          error={docsError}
          selectedDocumentId={selectedDocumentId}
          onSelectDocumentId={setSelectedDocumentId}
          onRefresh={refreshDocuments}
        />

        <ChatPanel
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          onSelectDocumentId={setSelectedDocumentId}
        />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceContent />
    </AuthProvider>
  );
}
