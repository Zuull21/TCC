import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { auth as authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';

const CODE_LENGTH = 6;

// ── Mascara e-mail: mar**@gm***.com ──────────────────────────────────────────
function maskEmail(email) {
  if (!email) return '';
  const [user, domain] = email.split('@');
  const maskedUser = user.slice(0, 2) + '*'.repeat(Math.max(user.length - 2, 2));
  const [domName, ...domExt] = domain.split('.');
  const maskedDom = domName.slice(0, 2) + '*'.repeat(Math.max(domName.length - 2, 1));
  return `${maskedUser}@${maskedDom}.${domExt.join('.')}`;
}

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const userId = params.get('userId');
  const emailHint = params.get('email') || '';
  const { login } = useAuth();

  const [digits, setDigits]       = useState(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputsRef = useRef([]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── Auto-foco no primeiro input ───────────────────────────────────────────
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // ── Handlers de dígito ────────────────────────────────────────────────────
  function handleChange(index, value) {
    const clean = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setError('');

    if (clean && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        inputsRef.current[index - 1]?.focus();
      } else if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      }
    }
    if (e.key === 'ArrowLeft'  && index > 0)              inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    inputsRef.current[focusIdx]?.focus();
  }

  // ── Verificar código ──────────────────────────────────────────────────────
  async function handleVerify(e) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length < CODE_LENGTH) {
      setError('Insira todos os 6 dígitos do código.');
      return;
    }
    if (!userId) {
      setError('ID de usuário ausente. Tente se cadastrar novamente.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await authApi.verifyEmail({ userId: Number(userId), code });
      login(data.token, data.user, data.csrfToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Código inválido ou expirado. Tente novamente.');
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  // ── Reenviar código ───────────────────────────────────────────────────────
  async function handleResend() {
    if (countdown > 0 || !userId) return;
    setResending(true);
    setError('');
    setSuccess('');
    try {
      await authApi.resendCode({ userId: Number(userId) });
      setSuccess('Novo código enviado! Verifique o seu e-mail.');
      setCountdown(30);
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError(err.response.data?.error || 'Aguarde antes de reenviar.');
        setCountdown(30);
      } else {
        setError('Não foi possível reenviar. Tente novamente.');
      }
    } finally {
      setResending(false);
    }
  }

  const code = digits.join('');

  return (
    <div className="auth-screen">
      <div className="auth-card">

        {/* Logo */}
        <div className="logo">
          <div className="logo__icon"><MapPin size={20} /></div>
          <span className="logo__text">TourMap</span>
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--primary-light)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={26} color="var(--primary)" />
          </div>
          <h1 className="auth-title">Verifique seu e-mail</h1>
          <p className="auth-subtitle" style={{ marginBottom: 12 }}>
            Enviamos um código de 6 dígitos para
          </p>
          {emailHint && (
            <span className="email-mask">
              <Mail size={14} />
              {maskEmail(emailHint)}
            </span>
          )}
          {!emailHint && (
            <span className="email-mask">seu e-mail cadastrado</span>
          )}
          <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 8 }}>
            O código expira em <strong>5 minutos</strong>.
          </p>
        </div>

        {/* Feedback */}
        {error && (
          <div className="alert alert--error" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="alert alert--success" style={{ marginBottom: 16 }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{success}</span>
          </div>
        )}

        {/* Inputs OTP */}
        <form onSubmit={handleVerify}>
          <div className="otp-container">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputsRef.current[i] = el)}
                className={`otp-input${d ? ' otp-input--filled' : ''}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                aria-label={`Dígito ${i + 1}`}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || code.length < CODE_LENGTH}
          >
            {loading ? <Spinner /> : 'Verificar e entrar'}
          </button>
        </form>

        {/* Reenviar */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 8 }}>
            Não recebeu o código?
          </p>
          <button
            className="resend-btn"
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            type="button"
          >
            {resending
              ? 'Enviando…'
              : countdown > 0
              ? `Reenviar em ${countdown}s`
              : 'Reenviar código'}
          </button>
        </div>

        <p className="auth-footer" style={{ marginTop: 24 }}>
          Conta errada?{' '}
          <a href="/register" className="link">Voltar ao cadastro</a>
        </p>
      </div>
    </div>
  );
}
