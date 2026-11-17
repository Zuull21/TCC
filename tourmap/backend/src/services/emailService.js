const { transporter } = require('../config/email');

// EMAIL_FROM separado do login SMTP: em alguns provedores (Mailtrap, SES) o usuário não é um e-mail
const FROM = `"TourMap" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;
const BRAND_COLOR = '#5B4FE8';
const BRAND_LIGHT = '#EDE9FF';
const YEAR = new Date().getFullYear();

// ── Bloco estrutural compartilhado ────────────────────────────────────────────

function emailWrapper(headerBg, headerSubtitle, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="light"/>
  <title>TourMap</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f7;
             font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f0f0f7;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(91,79,232,.12);">

        <!-- ── Header ── -->
        <tr>
          <td style="background:${headerBg};padding:36px 40px 32px;text-align:center;">
            <!-- Logotipo textual -->
            <div style="display:inline-flex;align-items:center;gap:8px;">
              <span style="font-size:28px;">🗺️</span>
              <span style="font-size:24px;font-weight:700;color:#ffffff;
                           letter-spacing:-0.5px;">TourMap</span>
            </div>
            <p style="margin:8px 0 0;color:rgba(255,255,255,.75);font-size:13px;">
              ${headerSubtitle}
            </p>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding:40px 40px 32px;">
            ${body}
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background:#f8f7ff;padding:20px 40px;text-align:center;
                     border-top:1px solid #e8e4ff;">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
              Este é um e-mail automático — não responda.<br/>
              © ${YEAR} TourMap · Descubra o melhor do Brasil 🇧🇷
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

function verificationTemplate(name, code) {
  const body = `
    <h2 style="margin:0 0 8px;color:#1f1f3a;font-size:22px;font-weight:700;">
      Confirme o seu e-mail
    </h2>
    <p style="margin:0 0 6px;color:#4b5563;font-size:15px;line-height:1.65;">
      Olá, <strong>${name}</strong>! 👋
    </p>
    <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.65;">
      Use o código abaixo para ativar a sua conta no TourMap.
      Ele é válido por <strong>5 minutos</strong> e só pode ser usado uma vez.
    </p>

    <!-- ── Código ── -->
    <div style="background:${BRAND_LIGHT};border:2px dashed ${BRAND_COLOR};
                border-radius:12px;padding:28px 24px;text-align:center;
                margin-bottom:28px;">
      <p style="margin:0 0 6px;color:#6d28d9;font-size:12px;
                font-weight:600;letter-spacing:2px;text-transform:uppercase;">
        Seu código de verificação
      </p>
      <span style="display:block;font-size:48px;font-weight:800;
                   letter-spacing:14px;color:${BRAND_COLOR};
                   font-family:'Courier New',Courier,monospace;
                   line-height:1.2;">
        ${code}
      </span>
      <p style="margin:10px 0 0;color:#7c6bd0;font-size:13px;">
        ⏱️ Expira em 5 minutos
      </p>
    </div>

    <!-- ── Passos ── -->
    <div style="background:#fafafa;border-radius:10px;padding:20px 24px;
                margin-bottom:24px;">
      <p style="margin:0 0 10px;color:#374151;font-size:14px;font-weight:600;">
        Como usar:
      </p>
      <ol style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;
                 line-height:1.8;">
        <li>Abra o TourMap no seu navegador</li>
        <li>Digite o código de 6 dígitos acima</li>
        <li>Pronto — explore os melhores destinos do Brasil!</li>
      </ol>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
      Se você não criou uma conta no TourMap, ignore este e-mail com segurança.
      Nenhuma ação é necessária.
    </p>
  `;

  return emailWrapper(
    `linear-gradient(135deg, ${BRAND_COLOR} 0%, #7c3aed 100%)`,
    'Plataforma de Turismo Inteligente para o Brasil',
    body
  );
}

function passwordResetTemplate(name, code) {
  const body = `
    <h2 style="margin:0 0 8px;color:#1f1f3a;font-size:22px;font-weight:700;">
      Redefinição de senha
    </h2>
    <p style="margin:0 0 6px;color:#4b5563;font-size:15px;line-height:1.65;">
      Olá, <strong>${name}</strong>!
    </p>
    <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.65;">
      Recebemos uma solicitação para redefinir a senha da sua conta.
      Use o código abaixo — ele expira em <strong>5 minutos</strong>.
    </p>

    <div style="background:#fef2f2;border:2px dashed #dc2626;
                border-radius:12px;padding:28px 24px;text-align:center;
                margin-bottom:28px;">
      <p style="margin:0 0 6px;color:#dc2626;font-size:12px;
                font-weight:600;letter-spacing:2px;text-transform:uppercase;">
        Código de redefinição
      </p>
      <span style="display:block;font-size:48px;font-weight:800;
                   letter-spacing:14px;color:#b91c1c;
                   font-family:'Courier New',Courier,monospace;
                   line-height:1.2;">
        ${code}
      </span>
      <p style="margin:10px 0 0;color:#ef4444;font-size:13px;">
        ⏱️ Expira em 5 minutos
      </p>
    </div>

    <div style="background:#fff7ed;border-left:4px solid #f59e0b;
                border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">
        <strong>⚠️ Segurança:</strong> nunca compartilhe este código com ninguém.
        O TourMap jamais solicitará seu código por telefone ou chat.
      </p>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
      Se você não solicitou a redefinição de senha, ignore este e-mail.
      Sua senha permanece inalterada.
    </p>
  `;

  return emailWrapper(
    'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    'Segurança da sua conta',
    body
  );
}

// ── Funções exportadas ────────────────────────────────────────────────────────

async function sendVerificationEmail(to, name, code) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${code} — Código de verificação TourMap`,
    html: verificationTemplate(name, code),
  });
}

async function sendPasswordResetEmail(to, name, code) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${code} — Redefinição de senha TourMap`,
    html: passwordResetTemplate(name, code),
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
