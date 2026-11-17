import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Navbar    from '../components/Navbar';
import BottomNav from '../components/BottomNav';

export default function Privacy() {
  return (
    <div className="screen">
      <Navbar />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <ShieldCheck size={24} color="var(--primary)" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Política de Privacidade</h1>
        </div>

        <div
          style={{
            background: 'var(--gray-50)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            color: 'var(--gray-600)',
            lineHeight: 1.7,
          }}
        >
          <p style={{ marginBottom: 16 }}>
            <strong style={{ color: 'var(--gray-900)' }}>Documento em elaboração.</strong>
          </p>
          <p style={{ marginBottom: 16 }}>
            A Política de Privacidade da plataforma TourMap descreverá como coletamos,
            usamos e protegemos seus dados pessoais em conformidade com a Lei Geral de
            Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
          <p style={{ marginBottom: 16 }}>
            Os dados coletados durante o cadastro (nome, e-mail, data de nascimento) são
            utilizados exclusivamente para identificação e personalização da experiência
            na plataforma. Nenhum dado é compartilhado com terceiros sem consentimento explícito.
          </p>
          <p>
            Dúvidas sobre privacidade:{' '}
            <a href="mailto:privacidade@tourmap.com.br" style={{ color: 'var(--primary)' }}>
              privacidade@tourmap.com.br
            </a>
          </p>
        </div>

        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--gray-500)' }}>
          Última atualização: em breve. ·{' '}
          <Link to="/terms" style={{ color: 'var(--primary)' }}>
            Termos de Uso
          </Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
