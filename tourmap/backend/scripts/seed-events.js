#!/usr/bin/env node
/**
 * Cria 2 eventos para hoje com organizadores distintos e avaliações realistas.
 * Evento 1 (Feira Gastronômica) — organizado por Fernanda Costa — muito bem avaliado.
 * Evento 2 (Club Noturno)       — organizado por Rafael Barbosa  — perigoso, alertas.
 *
 * Idempotente: pode ser re-executado sem duplicar dados.
 * Uso: node scripts/seed-events.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const { fn, col } = require('sequelize');
const { sequelize }  = require('../src/config/db');
const { User, Place, Review, Alert, EventAttendee, OrganizerReview } = require('../src/models/index');

const SEED_PASSWORD = process.env.SEED_PASSWORD || require('crypto').randomBytes(9).toString('base64url');

const TODAY = new Date().toISOString().split('T')[0];

// ── Organizadores ──────────────────────────────────────────────────────────────
const ORGANIZERS = [
  {
    name: 'Fernanda Costa',
    email: 'fernanda.costa.seed@tourmap.dev',
    password: SEED_PASSWORD,
    role: 'guide',
    bio: 'Produtora de eventos gastronômicos há 8 anos. Especialista em feiras regionais.',
    city: 'São Paulo',
  },
  {
    name: 'Rafael Barbosa',
    email: 'rafael.barbosa.seed@tourmap.dev',
    password: SEED_PASSWORD,
    role: 'guide',
    bio: 'Promoter de eventos noturnos.',
    city: 'São Paulo',
  },
];

// ── Participantes / avaliadores ────────────────────────────────────────────────
const REVIEWERS = [
  { name: 'Ana Lima',    email: 'ana.lima.seed@tourmap.dev',    password: SEED_PASSWORD, role: 'tourist' },
  { name: 'Bruno Melo',  email: 'bruno.melo.seed@tourmap.dev',  password: SEED_PASSWORD, role: 'tourist' },
  { name: 'Carla Dias',  email: 'carla.dias.seed@tourmap.dev',  password: SEED_PASSWORD, role: 'tourist' },
  { name: 'Diego Ramos', email: 'diego.ramos.seed@tourmap.dev', password: SEED_PASSWORD, role: 'tourist' },
  { name: 'Elisa Nunes', email: 'elisa.nunes.seed@tourmap.dev', password: SEED_PASSWORD, role: 'tourist' },
];

// ── Reviews do evento positivo ─────────────────────────────────────────────────
const GOOD_REVIEWS = [
  { idx: 0, rating: 5, sentiment: 'positive', score: 0.95,
    comment: 'Experiência incrível! A variedade de pratos era enorme e todos muito saborosos. Atendimento excelente, preços justos e ambiente familiar. Recomendo muito, com certeza voltarei no próximo mês!' },
  { idx: 1, rating: 5, sentiment: 'positive', score: 0.92,
    comment: 'Melhor feira gastronômica de São Paulo. Fui com minha família e todo mundo adorou. Tem opções para vegetarianos também. Organização impecável, muito limpo e bem sinalizado.' },
  { idx: 2, rating: 4, sentiment: 'positive', score: 0.82,
    comment: 'Muito bom! Deu um pouco de fila na entrada mas valeu cada minuto. A comida regional é autêntica e saborosa. O espaço ao ar livre é ótimo. Tiro uma estrela só porque o estacionamento é longe.' },
  { idx: 3, rating: 5, sentiment: 'positive', score: 0.97,
    comment: 'Perfeito para passar o dia com amigos. Tem música ao vivo, comidas maravilhosas e drinques regionais. Lugar seguro, movimento controlado. Saí de lá super feliz, adorei cada detalhe!' },
  { idx: 4, rating: 4, sentiment: 'positive', score: 0.79,
    comment: 'Evento muito bem organizado, equipe educada e prestativa. Boa diversidade de opções, desde salgados até sobremesas. Preço acessível para o que é oferecido. Vale muito a pena conferir.' },
];

// ── Reviews do evento perigoso ─────────────────────────────────────────────────
const BAD_REVIEWS = [
  { idx: 0, rating: 1, sentiment: 'negative', score: -0.94,
    comment: 'PERIGO! Fui assaltado na saída do evento. Segurança completamente ausente. O estacionamento é escuro e perigoso. Brigas dentro do local durante a noite. EVITEM esse lugar a qualquer custo!' },
  { idx: 1, rating: 1, sentiment: 'negative', score: -0.91,
    comment: 'Absurdo. Copo com substância estranha, minha amiga passou mal e tivemos que chamar o SAMU. Organização zero, seguranças despreparados. Já registramos boletim de ocorrência. Estabelecimento irresponsável e perigoso.' },
  { idx: 2, rating: 2, sentiment: 'negative', score: -0.78,
    comment: 'Saída às 2h da manhã foi um caos total. Vi duas brigas no estacionamento. Seguranças sumiram quando mais precisavam. A música altíssima cobre os gritos. Não volto e aviso a todos que conheço.' },
  { idx: 3, rating: 1, sentiment: 'negative', score: -0.96,
    comment: 'Lugar violento e inseguro. Testemunhei agressão física dentro do local. Equipe de segurança completamente omissa. Relatei ao responsável e fui ignorada. Vou acionar a prefeitura para fechar esse antro.' },
  { idx: 4, rating: 2, sentiment: 'negative', score: -0.71,
    comment: 'Entrada bagunçada, lotado além da capacidade, saída sem iluminação. Ambiente de risco. Ouvi relatos de furtos no banheiro. A administração precisa ser responsabilizada. Não é um lugar seguro para ninguém.' },
];

async function upsertUser(data) {
  const existing = await User.findOne({ where: { email: data.email } });
  if (existing) {
    // Contas de demonstração precisam conseguir logar mesmo com a verificação de e-mail ligada
    if (!existing.email_verified) await existing.update({ email_verified: true });
    return { user: existing, created: false };
  }
  const hash = await bcrypt.hash(data.password, 10);
  const user = await User.create({ ...data, password_hash: hash, email_verified: true });
  return { user, created: true };
}

async function recalcAvgRating(place) {
  const revs = await Review.findAll({ where: { place_id: place.id } });
  if (!revs.length) return;
  const avg = revs.reduce((s, r) => s + r.rating, 0) / revs.length;
  await place.update({ avg_rating: avg.toFixed(1), review_count: revs.length });
  return avg;
}

async function recalcOrganizerRating(organizerId) {
  const stats = await OrganizerReview.findOne({
    where: { organizer_id: organizerId },
    attributes: [[fn('AVG', col('rating')), 'avg'], [fn('COUNT', col('id')), 'total']],
    raw: true,
  });
  if (!stats || !stats.total) return;
  const avg   = Math.round(parseFloat(stats.avg) * 10) / 10;
  const total = parseInt(stats.total, 10);
  await User.update({ avg_organizer_rating: avg, organizer_review_count: total }, { where: { id: organizerId } });
  return { avg, total };
}

async function run() {
  await sequelize.authenticate();
  console.log('Conectado ao banco de dados.');
  await Place.sync({ alter: true });
  console.log('Schema sincronizado.\n');

  // ── 1. Organizers ────────────────────────────────────────────────────────────
  console.log('Criando organizadores...');
  const organizers = [];
  for (const data of ORGANIZERS) {
    const { user, created } = await upsertUser(data);
    organizers.push(user);
    console.log(`  ${created ? 'Criado' : 'Existente'}: ${user.name} (id=${user.id}, ${user.role})`);
  }
  const [org1, org2] = organizers;

  // ── 2. Reviewers ─────────────────────────────────────────────────────────────
  console.log('\nCriando participantes/avaliadores...');
  const reviewers = [];
  for (const data of REVIEWERS) {
    const { user, created } = await upsertUser(data);
    reviewers.push(user);
    console.log(`  ${created ? 'Criado' : 'Existente'}: ${user.name} (id=${user.id})`);
  }

  // ── 3. Evento 1: Feira Gastronômica (org1) ───────────────────────────────────
  console.log('\nEvento 1: Feira Gastronômica do Parque...');
  let [event1, e1Created] = await Place.findOrCreate({
    where: { name: 'Feira Gastronômica do Parque' },
    defaults: {
      description:      'Feira gastronômica com produtos regionais, música ao vivo e ambiente familiar. Mais de 50 expositores com culinária brasileira autêntica.',
      address:          'Parque do Ibirapuera, São Paulo, SP',
      latitude:         -23.5874,
      longitude:        -46.6576,
      category:         'gastronomia',
      type:             'event',
      event_date:       TODAY,
      event_start_time: '10:00',
      event_end_time:   '20:00',
      is_free:          true,
      city:             'São Paulo',
      state:            'SP',
      max_attendees:    500,
      created_by:       org1.id,
    },
  });
  // Re-executar no dia da apresentação traz o evento para "hoje" de novo
  if (!e1Created && event1.event_date !== TODAY) await event1.update({ event_date: TODAY });
  if (!e1Created && event1.created_by !== org1.id) {
    await event1.update({ created_by: org1.id });
    console.log(`  Transferido para ${org1.name}`);
  }
  console.log(`  ${e1Created ? 'Criado' : 'Existente'}: ${event1.name} (id=${event1.id}, org: ${org1.name})`);

  // ── 4. Reviews positivas ──────────────────────────────────────────────────────
  let added = 0;
  for (const rev of GOOD_REVIEWS) {
    const user = reviewers[rev.idx];
    const exists = await Review.findOne({ where: { user_id: user.id, place_id: event1.id } });
    if (!exists) {
      await Review.create({ user_id: user.id, place_id: event1.id, rating: rev.rating, comment: rev.comment, sentiment: rev.sentiment, sentiment_score: rev.score });
      added++;
    }
  }
  const avgGood = await recalcAvgRating(event1);
  console.log(`  Reviews: ${added} novas | média ${avgGood?.toFixed(1) ?? 'já calculada'}`);

  // ── 5. Evento 2: Club Noturno (org2) ─────────────────────────────────────────
  console.log('\nEvento 2: Club Noturno Zona Norte...');
  let [event2, e2Created] = await Place.findOrCreate({
    where: { name: 'Club Noturno Zona Norte' },
    defaults: {
      description:      'Balada noturna com DJ e open bar na Zona Norte de São Paulo.',
      address:          'Av. Zaki Narchi, 500, Carandiru, São Paulo, SP',
      latitude:         -23.5192,
      longitude:        -46.6239,
      category:         'musica',
      type:             'event',
      event_date:       TODAY,
      event_start_time: '22:00',
      event_end_time:   '04:00',
      is_free:          false,
      city:             'São Paulo',
      state:            'SP',
      max_attendees:    300,
      created_by:       org2.id,
    },
  });
  // Re-executar no dia da apresentação traz o evento para "hoje" de novo
  if (!e2Created && event2.event_date !== TODAY) await event2.update({ event_date: TODAY });
  if (!e2Created && event2.created_by !== org2.id) {
    await event2.update({ created_by: org2.id });
    console.log(`  Transferido para ${org2.name}`);
  }
  console.log(`  ${e2Created ? 'Criado' : 'Existente'}: ${event2.name} (id=${event2.id}, org: ${org2.name})`);

  // ── 6. Reviews negativas ──────────────────────────────────────────────────────
  added = 0;
  for (const rev of BAD_REVIEWS) {
    const user = reviewers[rev.idx];
    const exists = await Review.findOne({ where: { user_id: user.id, place_id: event2.id } });
    if (!exists) {
      await Review.create({ user_id: user.id, place_id: event2.id, rating: rev.rating, comment: rev.comment, sentiment: rev.sentiment, sentiment_score: rev.score });
      added++;
    }
  }
  const avgBad = await recalcAvgRating(event2);
  console.log(`  Reviews: ${added} novas | média ${avgBad?.toFixed(1) ?? 'já calculada'}`);

  // ── 7. Alerta de risco no evento 2 ───────────────────────────────────────────
  const existingAlert = await Alert.findOne({ where: { place_id: event2.id, is_active: true } });
  if (!existingAlert) {
    await Alert.create({
      place_id:     event2.id,
      level:        'high',
      message:      'Múltiplos relatos de assaltos, agressões e adulteração de bebidas. Evite este local.',
      trigger_type: 'manual',
      is_active:    true,
    });
    await event2.update({ alert_level: 'high' });
    console.log('  Alerta HIGH criado.');
  }

  // ── 8. Participantes (EventAttendee) ─────────────────────────────────────────
  console.log('\nRegistrando confirmações de presença...');
  for (const [event, label] of [[event1, 'Feira'], [event2, 'Club']]) {
    let newCount = 0;
    for (const user of reviewers) {
      const [, created] = await EventAttendee.findOrCreate({
        where: { event_id: event.id, user_id: user.id },
        defaults: { status: 'going' },
      });
      if (created) newCount++;
    }
    const total = await EventAttendee.count({ where: { event_id: event.id, status: 'going' } });
    await event.update({ attendee_count: total });
    console.log(`  ${label}: ${total} confirmados (${newCount} novos)`);
  }

  // ── 9. Avaliações de organizador ──────────────────────────────────────────────
  console.log('\nAvaliações de organizador...');

  // Corrige organizer_id em reviews existentes (caso o admin fosse o dono antes)
  await OrganizerReview.update({ organizer_id: org1.id }, { where: { event_id: event1.id } });
  await OrganizerReview.update({ organizer_id: org2.id }, { where: { event_id: event2.id } });

  // org1 (Fernanda) — notas altas pelos participantes da Feira
  const org1Reviews = [
    { idx: 0, rating: 5, comment: 'Fernanda é uma organizadora incrível. Evento impecável do início ao fim!' },
    { idx: 1, rating: 5, comment: 'Parabéns à organizadora. Comunicação excelente antes e durante o evento.' },
    { idx: 2, rating: 4, comment: 'Muito organizado. A Fernanda foi super atenciosa com todos os expositores e visitantes.' },
  ];
  for (const or of org1Reviews) {
    const user = reviewers[or.idx];
    const exists = await OrganizerReview.findOne({ where: { reviewer_id: user.id, event_id: event1.id } });
    if (!exists) {
      await OrganizerReview.create({ reviewer_id: user.id, organizer_id: org1.id, event_id: event1.id, rating: or.rating, comment: or.comment });
    }
  }
  const r1 = await recalcOrganizerRating(org1.id);
  console.log(`  ${org1.name}: ${r1?.avg ?? '?'} estrelas (${r1?.total ?? '?'} avaliações)`);

  // org2 (Rafael) — notas baixas pelos participantes do Club
  const org2Reviews = [
    { idx: 3, rating: 1, comment: 'Rafael sumiu quando precisávamos reportar os incidentes. Irresponsável.' },
    { idx: 4, rating: 1, comment: 'Organizador ausente durante toda a noite. Segurança inexistente. Péssimo.' },
  ];
  for (const or of org2Reviews) {
    const user = reviewers[or.idx];
    const exists = await OrganizerReview.findOne({ where: { reviewer_id: user.id, event_id: event2.id } });
    if (!exists) {
      await OrganizerReview.create({ reviewer_id: user.id, organizer_id: org2.id, event_id: event2.id, rating: or.rating, comment: or.comment });
    }
  }
  const r2 = await recalcOrganizerRating(org2.id);
  console.log(`  ${org2.name}: ${r2?.avg ?? '?'} estrelas (${r2?.total ?? '?'} avaliações)`);

  // ── Resumo ────────────────────────────────────────────────────────────────────
  console.log('\n--- Seed concluído ---');
  console.log(`Evento positivo : /places/${event1.id}  (${event1.name})`);
  console.log(`  Organizador   : ${org1.name} — ${org1.email}`);
  console.log(`Evento perigoso : /places/${event2.id}  (${event2.name})`);
  console.log(`  Organizador   : ${org2.name} — ${org2.email}`);
  console.log(process.env.SEED_PASSWORD
    ? 'Senha das contas novas: a definida em SEED_PASSWORD'
    : `Senha das contas novas: ${SEED_PASSWORD} (gerada; defina SEED_PASSWORD para fixar)`);

  process.exit(0);
}

run().catch((err) => {
  console.error('Erro no seed:', err.message);
  process.exit(1);
});
