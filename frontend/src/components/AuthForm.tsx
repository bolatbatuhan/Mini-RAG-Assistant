import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

type AuthMode = 'login' | 'register';

export function AuthForm() {
  const { signIn, signUp, isConfigured } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Lütfen e-posta ve şifre alanlarını doldurun.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const result = await signIn(trimmedEmail, password);
        if (result.error) {
          setErrorMessage(result.error);
        }
      } else {
        const result = await signUp(trimmedEmail, password);
        if (result.error) {
          setErrorMessage(result.error);
        } else if (result.requiresEmailConfirmation) {
          setInfoMessage(
            'Kayıt başarılı! Lütfen e-posta kutunuzu kontrol ederek hesabınızı doğrulayın, ardından giriş yapın.'
          );
          setMode('login');
          setPassword('');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-container" aria-label="Kimlik doğrulama">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Mini RAG — Document Assistant</h2>
          <p className="auth-subtitle">
            PDF dokümanlarınızı yükleyin ve doğal dilde sorular sorun.
          </p>
        </div>

        {!isConfigured && (
          <div className="alert alert-error" role="alert">
            Supabase yapılandırması eksik. Lütfen <code>frontend/.env</code> dosyasında{' '}
            <code>VITE_SUPABASE_URL</code> ve <code>VITE_SUPABASE_ANON_KEY</code> değişkenlerini
            tanımlayın.
          </div>
        )}

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => handleModeChange('login')}
          >
            Giriş Yap
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => handleModeChange('register')}
          >
            Kayıt Ol
          </button>
        </div>

        {errorMessage && (
          <div className="alert alert-error" role="alert">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="alert alert-info" role="status">
            {infoMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="form-field">
            <span>E-posta</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="ornek@eposta.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting || !isConfigured}
              required
            />
          </label>

          <label className="form-field">
            <span>Şifre</span>
            <input
              type="password"
              name="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="En az 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting || !isConfigured}
              minLength={6}
              required
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting || !isConfigured}
          >
            {submitting
              ? 'İşleniyor...'
              : mode === 'login'
                ? 'Giriş Yap'
                : 'Hesap Oluştur'}
          </button>
        </form>
      </div>
    </section>
  );
}
