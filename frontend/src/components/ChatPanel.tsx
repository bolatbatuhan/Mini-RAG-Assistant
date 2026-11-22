import { useState, type FormEvent } from 'react';
import { askQuestion } from '../lib/api.ts';
import type { ChatMessage, CitationSource, DocumentItem } from '../types/api.ts';

interface ChatPanelProps {
  documents: DocumentItem[];
  selectedDocumentId: string;
  onSelectDocumentId: (id: string) => void;
}

const EXAMPLE_QUESTIONS = [
  'Bu dokümanın ana konusu ve temel maddeleri nelerdir?',
  'Uygulamada kullanıcı doğrulaması veya güvenlik nasıl sağlanıyor?',
  'Dokümanda geçen önemli teknik gereksinimler neler?',
];

function CitationList({ sources }: { sources: CitationSource[] }) {
  const [expanded, setExpanded] = useState(true);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="citations-wrapper">
      <button
        type="button"
        className="citations-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span>Kaynak Alıntıları ({sources.length} parça)</span>
        <span>{expanded ? '▲ Gizle' : '▼ Göster'}</span>
      </button>

      {expanded && (
        <ul className="citations-list">
          {sources.map((source, idx) => (
            <li
              key={`${source.documentId}-${source.chunkIndex}-${idx}`}
              className="citation-card"
            >
              <div className="citation-header">
                <span className="citation-doc">{source.filename}</span>
                <span className="citation-meta">
                  Parça #{source.chunkIndex} • %{Math.round(source.similarity * 100)} benzerlik
                </span>
              </div>
              <p className="citation-excerpt">{source.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatPanel({
  documents,
  selectedDocumentId,
  onSelectDocumentId,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const completedDocuments = documents.filter((d) => d.status === 'completed');
  const hasCompletedDocs = completedDocuments.length > 0;

  const submitQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || asking) {
      return;
    }

    setChatError(null);
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setAsking(true);

    try {
      const response = await askQuestion(
        trimmed,
        selectedDocumentId ? selectedDocumentId : undefined
      );

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Yanıt alınırken bir hata oluştu.');
    } finally {
      setAsking(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitQuestion(question);
  };

  return (
    <section className="panel chat-panel" aria-label="RAG Soru-Cevap Asistanı">
      <div className="panel-header">
        <div>
          <h2>Doküman Asistanı (RAG Chat)</h2>
          <p className="panel-subtitle">
            Yanıtlar yalnızca yüklediğiniz PDF dokümanlarındaki ilgili parçalara dayanır
          </p>
        </div>

        <div className="scope-selector">
          <label htmlFor="doc-scope-select" className="scope-label">
            Kapsam:
          </label>
          <select
            id="doc-scope-select"
            value={selectedDocumentId}
            onChange={(e) => onSelectDocumentId(e.target.value)}
            disabled={!hasCompletedDocs || asking}
            className="scope-select"
          >
            <option value="">Tüm Dokümanlar ({completedDocuments.length})</option>
            {completedDocuments.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.filename}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grounded-banner">
        <strong>Bilgi:</strong> Asistan yalnızca yüklenen dokümanlardan bulduğu kaynaklara göre
        cevap verir ve kullanılan kaynak parçalarını her cevabın altında listeler.
      </div>

      <div className="chat-messages">
        {!hasCompletedDocs ? (
          <div className="empty-box">
            <p>Soru sorabilmek için önce en az bir PDF dokümanı yükleyin.</p>
            <p className="empty-hint">
              Sol panelden bir PDF yüklediğinizde metin parçaları ve vektörler otomatik olarak
              hazırlanacaktır.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-box">
            <p>Dokümanlarınız hazır! Aşağıdan bir soru sorabilir veya örneklerden seçebilirsiniz:</p>
            <div className="example-questions">
              {EXAMPLE_QUESTIONS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className="example-chip"
                  onClick={() => void submitQuestion(sample)}
                  disabled={asking}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <article
              key={msg.id}
              className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}
            >
              <div className="bubble-role">
                {msg.role === 'user' ? 'Siz' : 'Doküman Asistanı'}
              </div>
              <div className="bubble-content">{msg.content}</div>
              {msg.role === 'assistant' && msg.sources && (
                <CitationList sources={msg.sources} />
              )}
            </article>
          ))
        )}

        {asking && (
          <div className="chat-bubble bubble-assistant loading-bubble" role="status">
            <div className="bubble-role">Doküman Asistanı</div>
            <div className="bubble-content">
              İlgili doküman parçaları aranıyor ve yanıt oluşturuluyor...
            </div>
          </div>
        )}
      </div>

      {chatError && (
        <div className="alert alert-error" role="alert">
          {chatError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            hasCompletedDocs
              ? 'Dokümanlarınız hakkında bir soru yazın...'
              : 'Önce bir PDF dokümanı yükleyin...'
          }
          disabled={!hasCompletedDocs || asking}
          maxLength={2000}
          className="chat-input"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!hasCompletedDocs || asking || !question.trim()}
        >
          {asking ? 'Yanıtlanıyor...' : 'Sor'}
        </button>
      </form>
    </section>
  );
}
