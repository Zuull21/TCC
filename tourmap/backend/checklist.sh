#!/usr/bin/env bash
# checklist.sh — Verifica pré-requisitos antes de iniciar o TourMap backend

set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[0;34m'
RST='\033[0m'

PASS=0
FAIL=0

ok()   { echo -e "  ${GRN}[OK]${RST}  $1"; ((PASS++)); }
fail() { echo -e "  ${RED}[FAIL]${RST} $1"; ((FAIL++)); }
warn() { echo -e "  ${YLW}[WARN]${RST} $1"; }
section() { echo -e "\n${BLU}── $1 ──────────────────────────────────────────${RST}"; }

echo -e "${BLU}╔══════════════════════════════════════╗${RST}"
echo -e "${BLU}║     TourMap — Checklist de Setup     ║${RST}"
echo -e "${BLU}╚══════════════════════════════════════╝${RST}"

# ── 1. Arquivo .env ───────────────────────────────────────────────────────────
section "Arquivo .env"

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  fail ".env não encontrado — copie .env.example e preencha"
  echo "  Execute: cp .env.example .env"
else
  ok ".env existe"
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE" 2>/dev/null || true; set +a
fi

# ── 2. Variáveis de ambiente obrigatórias ─────────────────────────────────────
section "Variáveis de ambiente"

check_var() {
  local var="$1"
  local val="${!var:-}"
  if [ -z "$val" ]; then
    fail "$var não definida"
  else
    ok "$var definida"
  fi
}

check_var DB_HOST
check_var DB_PORT
check_var DB_NAME
check_var DB_USER
check_var DB_PASSWORD
check_var JWT_SECRET
check_var JWT_EXPIRES_IN
check_var PORT

# JWT_SECRET precisa ter no mínimo 32 caracteres
JWT_SECRET="${JWT_SECRET:-}"
if [ ${#JWT_SECRET} -lt 32 ]; then
  fail "JWT_SECRET tem menos de 32 caracteres (atual: ${#JWT_SECRET}) — inseguro"
else
  ok "JWT_SECRET tem comprimento adequado (${#JWT_SECRET} chars)"
fi

# PORT dentro de faixa razoável
PORT="${PORT:-3001}"
if [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ]; then
  ok "PORT=$PORT (válida)"
else
  fail "PORT=$PORT inválida (use entre 1024 e 65535)"
fi

# ── 3. Node.js e npm ──────────────────────────────────────────────────────────
section "Runtime Node.js"

if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js $NODE_VER"
  else
    fail "Node.js $NODE_VER — requer >= 18"
  fi
else
  fail "Node.js não encontrado"
fi

if command -v npm &>/dev/null; then
  ok "npm $(npm --version)"
else
  fail "npm não encontrado"
fi

# ── 4. Dependências npm instaladas ────────────────────────────────────────────
section "Dependências npm"

if [ -d "node_modules" ]; then
  ok "node_modules existe"
else
  fail "node_modules não encontrado — execute: npm install"
fi

REQUIRED_PKGS=("express" "sequelize" "mysql2" "jsonwebtoken" "bcrypt" "helmet" "joi" "socket.io")
for pkg in "${REQUIRED_PKGS[@]}"; do
  if [ -d "node_modules/$pkg" ]; then
    ok "  $pkg instalado"
  else
    fail "  $pkg não encontrado em node_modules"
  fi
done

# ── 5. Conexão com banco de dados MySQL ───────────────────────────────────────
section "Banco de dados MySQL"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-tourmap}"

if command -v mysql &>/dev/null; then
  if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" \
      -e "SELECT 1;" "$DB_NAME" &>/dev/null 2>&1; then
    ok "Conexão MySQL OK ($DB_HOST:$DB_PORT/$DB_NAME)"
  else
    fail "Não foi possível conectar ao MySQL ($DB_HOST:$DB_PORT/$DB_NAME)"
    warn "Verifique se o MySQL está rodando e as credenciais estão corretas"
  fi
else
  warn "cliente mysql não encontrado no PATH — teste de conexão pulado"
  # Tenta via node como fallback
  if node -e "
    const { Sequelize } = require('sequelize');
    const s = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD,
      { host: process.env.DB_HOST, port: process.env.DB_PORT, dialect: 'mysql', logging: false });
    s.authenticate().then(() => { console.log('ok'); process.exit(0); })
              .catch(() => process.exit(1));
  " &>/dev/null 2>&1; then
    ok "Conexão MySQL via Sequelize OK"
  else
    fail "Conexão MySQL falhou (Sequelize)"
  fi
fi

# ── 6. Health check do servidor (se já estiver rodando) ───────────────────────
section "Health check HTTP"

API_PORT="${PORT:-3001}"
HEALTH_URL="http://localhost:${API_PORT}/api/health"

if command -v curl &>/dev/null; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    ok "GET $HEALTH_URL → 200"
  elif [ "$HTTP_STATUS" = "000" ]; then
    warn "Servidor não está rodando em :${API_PORT} — execute: npm start (ou npm run dev)"
  else
    fail "GET $HEALTH_URL → $HTTP_STATUS (esperado 200)"
  fi
else
  warn "curl não encontrado — health check pulado"
fi

# ── 7. Bcrypt funcional ───────────────────────────────────────────────────────
section "Bcrypt"

if node -e "
  const b = require('bcrypt');
  b.hash('test', 10).then(h => b.compare('test', h)).then(ok => {
    if (!ok) process.exit(1);
    console.log('ok');
    process.exit(0);
  }).catch(() => process.exit(1));
" &>/dev/null 2>&1; then
  ok "bcrypt hash + compare funcionando"
else
  fail "bcrypt não funcional — execute: npm rebuild bcrypt"
fi

# ── 8. JWT sign/verify ────────────────────────────────────────────────────────
section "JWT"

if node -e "
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'test';
  const token = jwt.sign({ id: 1 }, secret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, secret);
  if (!decoded.id) process.exit(1);
  console.log('ok');
  process.exit(0);
" &>/dev/null 2>&1; then
  ok "JWT sign + verify funcionando"
else
  fail "JWT não funcional"
fi

# ── Sumário ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLU}══════════════════════════════════════════${RST}"
echo -e "  Resultado: ${GRN}$PASS OK${RST}  |  ${RED}$FAIL FALHA(S)${RST}"
echo -e "${BLU}══════════════════════════════════════════${RST}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}Corrija os itens marcados com [FAIL] antes de iniciar o servidor.${RST}\n"
  exit 1
else
  echo -e "\n${GRN}Tudo certo! Inicie com: npm run dev${RST}\n"
  exit 0
fi
