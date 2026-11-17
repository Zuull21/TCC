import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, MapPin, AlertCircle } from 'lucide-react';
import { auth as authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';

// ── Força da senha ────────────────────────────────────────────────────────────

function getStrength(password) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8)      score++;
  if (/[A-Z]/.test(password))   score++;
  if (/[0-9]/.test(password))   score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: 'Fraca',  color: 'var(--danger)',  width: '30%' };
  if (score <= 2) return { label: 'Média',  color: 'var(--warning)', width: '62%' };
  if (score <= 3) return { label: 'Boa',    color: '#0284C7',        width: '80%' };
  return           { label: 'Forte',  color: 'var(--success)', width: '100%' };
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', birth_date: '' });
  const [accepted, setAccepted]         = useState(false);
  const [showPass, setShowPass]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const strength = getStrength(form.password);

  function set(field) {
    return (e) => { setForm((p) => ({ ...p, [field]: e.target.value })); setError(''); };
  }

  function calcAge(birth_date) {
    if (!birth_date) return null;
    const today = new Date();
    const birth = new Date(birth_date);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  function validate() {
    const { name, email, password, confirm, birth_date } = form;
    if (!name.trim())                return setError('Informe seu nome.'),              false;
    if (name.trim().length < 3)      return setError('Nome deve ter pelo menos 3 caracteres.'), false;
    if (!email.trim())               return setError('Informe seu e-mail.'),             false;
    if (!/\S+@\S+\.\S+/.test(email)) return setError('E-mail inválido.'),               false;
    if (!password)                   return setError('Informe uma senha.'),              false;
    if (password.length < 8)         return setError('Senha deve ter pelo menos 8 caracteres.'), false;
    if (!/[A-Z]/.test(password))     return setError('Senha precisa de uma letra maiúscula.'), false;
    if (!/[0-9]/.test(password))     return setError('Senha precisa de um número.'),    false;
    if (password !== confirm)        return setError('As senhas não coincidem.'),        false;
    if (!birth_date)                 return setError('Informe sua data de nascimento.'), false;
    const age = calcAge(birth_date);
    if (age === null || isNaN(age))  return setError('Data de nascimento inválida.'),   false;
    if (age < 18)                    return setError('Você deve ter pelo menos 18 anos.'), false;
    if (age > 120)                   return setError('Data de nascimento inválida.'),   false;
    if (!accepted)                   return setError('Aceite os termos para continuar.'), false;
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const { data } = await authApi.register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        age: calcAge(form.birth_date),
      });
      if (data.token) {
        // Servidor sem verificação de e-mail: a conta já está ativa
        login(data.token, data.user, data.csrfToken);
        navigate('/', { replace: true });
      } else {
        navigate(`/verify-email?userId=${data.userId}`);
      }
    } catch (err) {
      const body = err.response?.data;
      setError(body?.error || (body?.details?.[0]) || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">

        {/* Logo */}
        <div className="logo">
          <div className="logo__icon"><MapPin size={20} /></div>
          <span className="logo__text">TourMap</span>
        </div>

        <h1 className="auth-title">Criar conta</h1>
        <p className="auth-subtitle">Junte-se a milhares de viajantes brasileiros.</p>

        {error && (
          <div className="alert alert--error" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>

          {/* Nome */}
          <div className="field">
            <label className="field__label" htmlFor="name">Nome completo</label>
            <input
              id="name" type="text" className="field__input"
              placeholder="Maria da Silva"
              value={form.name} onChange={set('name')}
              autoComplete="name" autoFocus
            />
          </div>

          {/* E-mail */}
          <div className="field">
            <label className="field__label" htmlFor="email">E-mail</label>
            <input
              id="email" type="email" className="field__input"
              placeholder="maria@exemplo.com"
              value={form.email} onChange={set('email')}
              autoComplete="email"
            />
          </div>

          {/* Data de nascimento */}
          <div className="field">
            <label className="field__label" htmlFor="birth_date">Data de nascimento</label>
            <input
              id="birth_date" type="date" className="field__input"
              value={form.birth_date} onChange={set('birth_date')}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
              min={new Date(new Date().setFullYear(new Date().getFullYear() - 120)).toISOString().split('T')[0]}
              style={{ maxWidth: 200 }}
            />
          </div>

          {/* Senha */}
          <div className="field">
            <label className="field__label" htmlFor="password">Senha</label>
            <div className="field__input-wrapper">
              <input
                id="password" type={showPass ? 'text' : 'password'}
                className="field__input" placeholder="Mínimo 8 caracteres"
                value={form.password} onChange={set('password')}
                autoComplete="new-password"
              />
              <button type="button" className="field__input-action"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Ocultar' : 'Mostrar'}>
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Indicador de força */}
            {form.password && strength && (
              <>
                <div className="strength-bar">
                  <div
                    className="strength-bar__fill"
                    style={{ width: strength.width, background: strength.color }}
                  />
                </div>
                <span className="strength-label" style={{ color: strength.color }}>
                  Força: {strength.label}
                </span>
              </>
            )}
          </div>

          {/* Confirmar senha */}
          <div className="field">
            <label className="field__label" htmlFor="confirm">Confirmar senha</label>
            <div className="field__input-wrapper">
              <input
                id="confirm" type={showConfirm ? 'text' : 'password'}
                className="field__input" placeholder="Repita a senha"
                value={form.confirm} onChange={set('confirm')}
                autoComplete="new-password"
              />
              <button type="button" className="field__input-action"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Ocultar' : 'Mostrar'}>
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Termos */}
          <label className="checkbox-field">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              Li e aceito os{' '}
              <Link to="/terms" className="link">Termos de Uso</Link>
              {' '}e a{' '}
              <Link to="/privacy" className="link">Política de Privacidade</Link>.
            </span>
          </label>

          <button type="submit" className="btn btn--primary" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <Spinner /> : 'Criar conta'}
          </button>

        </form>

        <p className="auth-footer">
          Já tem conta?{' '}
          <Link to="/login" className="link">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
