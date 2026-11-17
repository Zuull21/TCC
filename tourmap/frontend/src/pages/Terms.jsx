import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import Navbar    from '../components/Navbar';
import BottomNav from '../components/BottomNav';

export default function Terms() {
  return (
    <div className="screen">
      <Navbar />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <FileText size={24} color="var(--primary)" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Termos de Uso</h1>
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
            Os Termos de Uso da plataforma TourMap estão sendo redigidos e serão publicados
            antes do lançamento oficial. Ao utilizar a plataforma durante este período,
            você concorda com as práticas descritas neste documento provisório.
          </p>
          <p style={{ marginBottom: 16 }}>
            A TourMap é uma plataforma de descoberta de pontos turísticos e eventos culturais
            no Brasil. O uso indevido da plataforma — incluindo cadastro de locais falsos,
            avaliações fraudulentas ou qualquer forma de abuso — poderá resultar na suspensão
            da conta.
          </p>
          <p>
            Dúvidas ou sugestões:{' '}
            <a href="mailto:contato@tourmap.com.br" style={{ color: 'var(--primary)' }}>
              contato@tourmap.com.br
            </a>
          </p>
        </div>

        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--gray-500)' }}>
          Última atualização: em breve. ·{' '}
          <Link to="/privacy" style={{ color: 'var(--primary)' }}>
            Política de Privacidade
          </Link>
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
