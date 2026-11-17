import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, MapPin, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../services/api';
import Spinner from '../components/Spinner';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  function validate() {
    if (!email.trim())    { setError('Informe o seu e-mail.');  return false; }
    if (!password.trim()) { setError('Informe a sua senha.');   return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('E-mail inválido.'); return false; }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const { data } = await authApi.login({ email: email.trim().toLowerCase(), password });
      login(data.token, data.user, data.csrfToken);
      navigate('/', { replace: true });
    } catch (err) {
      const body = err.response?.data;
      if (body?.needsVerification) {
        navigate(`/verify-email?userId=${body.userId}`);
        return;
      }
      setError(body?.error || 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">

        {/* Logo */}
        <div className="logo">
          <div className="logo__icon">
            <MapPin size={20} />
          </div>
          <span className="logo__text">TourMap</span>
        </div>

        <h1 className="auth-title">Bem-vindo de volta!</h1>
        <p className="auth-subtitle">Entre na sua conta para continuar explorando.</p>

        {/* Erro da API */}
        {error && (
          <div className="alert alert--error" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>

          {/* E-mail */}
          <div className="field">
            <label className="field__label" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              className="field__input"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
              autoFocus
            />
          </div>

          {/* Senha */}
          <div className="field">
            <label className="field__label" htmlFor="password">Senha</label>
            <div className="field__input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="field__input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="field__input-action"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Botão */}
          <button type="submit" className="btn btn--primary" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <Spinner /> : 'Entrar'}
          </button>

        </form>

        <p className="auth-footer">
          Não tem conta?{' '}
          <Link to="/register" className="link">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
