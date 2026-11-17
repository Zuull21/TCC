# TourMap

Plataforma web de turismo urbano com classificação automática de sentimento em avaliações escritas em português.

Projeto de TCC: a plataforma é o ambiente de teste da pesquisa, que compara um modelo treinado em inglês (RoBERTa), um modelo multilíngue (DistilBERT) e uma lista de palavras em português, e propõe um método híbrido (modelo + lista) para reduzir inversões de sentido (elogio lido como crítica e vice-versa). O kit de avaliação está descrito em [Avaliação dos modelos](#avaliação-dos-modelos).

**Stack:** React 18 + Vite · Leaflet · Node.js 20 + Express · MySQL 8 + Sequelize · Socket.IO · transformers.js (modelo de sentimento ONNX rodando no backend) · Docker · Terraform (AWS).

---

## Rodar localmente

### Opção 1 — Docker (mais simples)

Requer Docker Desktop.

```bash
cp .env.example .env      # preencha JWT_SECRET (e troque as senhas do banco)
docker compose up --build
```

Acesse **http://localhost**. Na primeira vez, o backend baixa o modelo de sentimento (~540 MB); a análise fica disponível ~1 minuto depois.

Para popular o banco:
```bash
docker compose exec backend node src/config/syncDb.js      # tabelas, admin e catálogo de pontos turísticos
docker compose exec backend node scripts/seed-events.js    # eventos e contas de demonstração
```

### Opção 2 — Node + MySQL instalados

Requer Node.js 20 e MySQL 8.

```bash
# 1. Banco
mysql -u root -p -e "CREATE DATABASE tourmap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Backend
cd backend
cp .env.example .env      # preencha DB_PASSWORD e JWT_SECRET
npm install
node src/config/syncDb.js # cria as tabelas e carrega o catálogo de pontos turísticos
node scripts/seed-events.js
npm run dev               # http://localhost:3001

# 3. Frontend (outro terminal)
cd frontend
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

`bash backend/checklist.sh` verifica variáveis, banco e dependências antes de subir.

### Principais variáveis (`backend/.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `localhost` / `3306` / `tourmap` / `root` / — | MySQL |
| `JWT_SECRET` | — | Obrigatório. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `EMAIL_VERIFICATION` | `on` | `off` cria a conta já verificada (sem e-mail) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` | Mailtrap | SMTP para o código de verificação |
| `SENTIMENT_ENGINE` | `local` | `local` (ONNX no backend) · `api` (Hugging Face, exige créditos) · `off` (só lista de palavras) |
| `SENTIMENT_DTYPE` | `fp32` | `q8` usa o modelo quantizado (4× menor) |
| `FRONTEND_URL` | `http://localhost:5173` | Origem permitida pelo CORS |
| `ADMIN_PASSWORD` | — | Senha da conta `admin@tourmap.com.br`. Vazia: é gerada uma aleatória, mostrada uma única vez no terminal |
| `SEED_PASSWORD` | — | Senha das contas de demonstração. Vazia: gerada e mostrada no terminal |

Lista completa e comentada: `backend/.env.example`.

---

## Testes

```bash
cd backend
npm test        # testes automatizados (banco, e-mail e modelo simulados)
```

---

## Avaliação dos modelos

| Arquivo | Conteúdo |
|---|---|
| `backend/scripts/sentiment-datasets.js` | As 60 frases: Conjunto A (desenvolvimento) e Conjunto B (validação), 30 cada, com o rótulo final |
| `backend/scripts/dados-graficos/rotulagem/` | Planilhas dos dois anotadores (concordância: 53 de 60, kappa de Cohen 0,823) |
| `backend/scripts/evaluate-sentiment.js` | Roda as abordagens nos dois conjuntos e calcula acurácia, F1 macro e validação cruzada do limiar |
| `backend/scripts/export-chart-data.js` | Curva ROC/AUC, confiança nos acertos e erros, intervalos por bootstrap e teste de McNemar |
| `backend/scripts/sentiment-evaluation.json` | Resultados salvos da última execução |

```bash
cd backend
node scripts/evaluate-sentiment.js             # roda os modelos (baixa ~1 GB na 1ª vez)
node scripts/evaluate-sentiment.js --offline   # recalcula a partir do JSON salvo
node scripts/export-chart-data.js              # estatísticas dos gráficos
```

Modelos: [cardiffnlp/twitter-roberta-base-sentiment-latest](https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest) (M1) e [lxyuan/distilbert-base-multilingual-cased-sentiments-student](https://huggingface.co/lxyuan/distilbert-base-multilingual-cased-sentiments-student) (M2, usado na plataforma). A lista de palavras (M3) e o método híbrido (limiar de confiança 0,65) estão em `backend/src/services/aiService.js`.

---

## Publicar na AWS

```bash
bash infra/tourmap.sh up       # cria o que faltar e liga
bash infra/tourmap.sh down     # desliga, sem apagar nada
bash infra/tourmap.sh deploy   # publica o código atual
```

`bash infra/tourmap.sh` sem argumentos lista todos os comandos.

---

## Estrutura

```
tourmap/
├── backend/
│   ├── server.js                 Express + Socket.IO
│   ├── scripts/                  seeds, catálogo de pontos turísticos, smoke test e avaliação dos modelos
│   └── src/
│       ├── config/               constantes, banco, syncDb, catálogo de pontos turísticos (pontos-turisticos.lista.js)
│       ├── middleware/           auth, csrf, rateLimit, validate, errorHandler
│       ├── models/               User, Place, Review, Post, PostLike, Alert, EventAttendee, OrganizerReview, VerificationCode
│       ├── routes/               auth, places, reviews, attendees, posts, alerts, users, ai
│       ├── services/             aiService (sentimento), alertService, recommendationService, authService, emailService
│       ├── utils/                sanitize, geocoding, blockedZones
│       └── tests/                auth, places, reviews, security, ai, recommendation
├── frontend/src/
│   ├── pages/                    Home, Explore, PlaceDetail, Feed, Events, CreateEvent, EditEvent,
│   │                             Profile, Login, Register, VerifyEmail, AIDemo, Terms, Privacy
│   ├── components/  context/  hooks/  services/
├── infra/
│   ├── tourmap.sh                operação na AWS (up / down / deploy / seed / logs)
│   └── terraform/                infraestrutura como código
└── docker-compose.yml            MySQL + backend + Caddy (frontend e HTTPS)
```
