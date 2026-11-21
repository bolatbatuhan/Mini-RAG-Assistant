import { AuthForm } from './components/AuthForm.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';

function WorkspaceContent() {
  const { user, loading, signOut } = useAuth();

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

      <section className="workspace-placeholder">
        <p>
          Oturum açıldı (<strong>{user.email}</strong>). Doküman yönetimi ve RAG sohbet ekranı
          bir sonraki adımda (Task 13) bu alana eklenecektir.
        </p>
      </section>
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
