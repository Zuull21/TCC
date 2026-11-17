require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET ausente ou com menos de 32 caracteres. Defina no .env.');
  process.exit(1);
}

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const helmet  = require('helmet');
const cors    = require('cors');
const xss     = require('xss-clean');
const jwt     = require('jsonwebtoken');

const { globalRateLimit } = require('./src/middleware/rateLimit');
const { csrfProtection }  = require('./src/middleware/csrf');
const errorHandler        = require('./src/middleware/errorHandler');
const { sequelize }       = require('./src/config/db');
const { runMigrations }   = require('./src/config/migrations');
const { warmupModels }    = require('./src/services/aiService');
const { expireOutdatedAlerts } = require('./src/services/alertService');

require('./src/models/index');

// ── Rotas ─────────────────────────────────────────────────────────────────────
const authRoutes      = require('./src/routes/auth');
const placesRoutes    = require('./src/routes/places');
const reviewsRoutes   = require('./src/routes/reviews');
const attendeesRoutes = require('./src/routes/attendees');
const postsRoutes     = require('./src/routes/posts');
const alertsRoutes    = require('./src/routes/alerts');
const usersRoutes     = require('./src/routes/users');
const aiRoutes        = require('./src/routes/ai');

// ── App ───────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) { socket.user = null; return next(); }
  try   { socket.user = jwt.verify(token, process.env.JWT_SECRET); }
  catch { socket.user = null; }
  next();
});

io.on('connection', (socket) => {
  const who = socket.user ? `${socket.user.name}#${socket.user.id}` : 'anônimo';
  console.log(`[Socket.IO] conectado: ${socket.id} — ${who}`);

  // Sala pessoal — usada para alertas direcionados
  if (socket.user?.id) {
    socket.join(`user:${socket.user.id}`);
  }

  socket.on('join:place',  (id) => { socket.join(`place:${id}`);  });
  socket.on('leave:place', (id) => { socket.leave(`place:${id}`); });
  socket.on('ping:client', ()  => { socket.emit('pong:server', { ts: Date.now() }); });
  socket.on('disconnect',  (r) => { console.log(`[Socket.IO] desconectado: ${socket.id} — ${r}`); });
});

app.set('io', io);

// ── Middlewares ───────────────────────────────────────────────────────────────

// Em produção o backend fica atrás do nginx: confia no 1º proxy para que
// req.ip (usado no rate limit) seja o IP real do cliente, não o do nginx.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      connectSrc:  ["'self'"],
    },
  },
  referrerPolicy:          { policy: 'no-referrer' },
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
  xContentTypeOptions:     true,
  xFrameOptions:           { action: 'deny' },
}));

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

app.use(globalRateLimit);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(xss());
app.use(csrfProtection);

app.use('/api/auth',                          authRoutes);
app.use('/api/places/:placeId/reviews',       reviewsRoutes);   // antes de /api/places
app.use('/api/places/:placeId/attendees',     attendeesRoutes); // antes de /api/places
app.use('/api/places',                        placesRoutes);
app.use('/api/posts',                         postsRoutes);
app.use('/api/alerts',                        alertsRoutes);
app.use('/api/users',                         usersRoutes);
app.use('/api/ai',                            aiRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

app.use(errorHandler);

// ── Inicialização ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('[DB] Conexão com MySQL estabelecida.');
    await runMigrations(sequelize);
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('[DB] Modelos sincronizados.');
    server.listen(PORT, () => {
      console.log(`[Server] TourMap na porta ${PORT} (${process.env.NODE_ENV})`);
    });
    warmupModels(); // carrega o modelo de sentimento em background

    // Alertas com mais de 7 dias saem do ar (no boot e a cada 6 h)
    const expire = () => expireOutdatedAlerts().catch((e) => console.error('[Alerts] expiração falhou:', e.message));
    expire();
    setInterval(expire, 6 * 60 * 60 * 1000).unref();
  } catch (err) {
    console.error('[Server] Falha ao inicializar:', err);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = { app, server, io, start };
