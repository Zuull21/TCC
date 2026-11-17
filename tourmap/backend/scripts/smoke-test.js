#!/usr/bin/env node
/**
 * Teste de fumaça: percorre o site como um usuário real, pela mesma URL que o
 * navegador usa, e confere cada resposta. Cria um usuário descartável e apaga o
 * que criou no final (avaliação, post, evento).
 *
 * Uso:  node scripts/smoke-test.js [URL]
 *   URL padrão: http://localhost:5173  ·  AWS: https://<ip-com-hífens>.sslip.io
 * Requer EMAIL_VERIFICATION=off no servidor (o cadastro precisa devolver token).
 */
const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const API = `${BASE}/api`;
let token = null;
let csrf = null;
const results = [];

async function call(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (auth && csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  return { status: res.status, data };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, detail });
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push({ ok: false, name, detail: err.message });
    console.log(`  ✖ ${name} — ${err.message}`);
  }
}

function expect(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  console.log(`Teste de fumaça em ${BASE}\n`);
  const stamp = Date.now();
  const email = `smoke.${stamp}@teste.dev`;
  const ctx = {};

  console.log('Páginas e arquivos estáticos');
  for (const page of ['/', '/explore', '/feed', '/ai-demo', '/login', '/register', '/places/1', '/rota-que-nao-existe']) {
    await check(`GET ${page}`, async () => {
      const r = await fetch(BASE + page);
      expect(r.status === 200, `HTTP ${r.status}`);
      expect((await r.text()).includes('id="root"'), 'não devolveu o app React');
    });
  }
  await check('foto local /fotos/masp.jpg', async () => {
    const r = await fetch(`${BASE}/fotos/masp.jpg`);
    expect(r.status === 200 && r.headers.get('content-type')?.includes('image'), `HTTP ${r.status}`);
  });

  console.log('\nConta');
  await check('cadastro entra direto', async () => {
    const r = await call('POST', '/auth/register', { name: 'Teste Fumaça', email, password: 'Senha123!', age: 25 }, { auth: false });
    expect(r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    expect(r.data.token, 'cadastro não devolveu token (EMAIL_VERIFICATION está ligado?)');
    ({ token } = r.data); csrf = r.data.csrfToken;
    ctx.userId = r.data.user.id;
  });
  await check('e-mail repetido é recusado', async () => {
    const r = await call('POST', '/auth/register', { name: 'Teste Fumaça', email, password: 'Senha123!', age: 25 }, { auth: false });
    expect(r.status === 409, `HTTP ${r.status}`);
  });
  await check('login', async () => {
    const r = await call('POST', '/auth/login', { email, password: 'Senha123!' }, { auth: false });
    expect(r.status === 200 && r.data.token, `HTTP ${r.status}`);
    token = r.data.token; csrf = r.data.csrfToken;
  });
  await check('senha errada é recusada', async () => {
    const r = await call('POST', '/auth/login', { email, password: 'Errada123!' }, { auth: false });
    expect(r.status === 401, `HTTP ${r.status}`);
  });
  await check('/auth/me sem password_hash', async () => {
    const r = await call('GET', '/auth/me');
    expect(r.status === 200 && !('password_hash' in r.data.user), `HTTP ${r.status}`);
  });
  await check('editar perfil', async () => {
    const r = await call('PUT', '/users/me', { bio: 'Testando o TourMap', city: 'São Paulo' });
    expect(r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
  });

  console.log('\nMapa e lugares');
  await check('listar pontos turísticos', async () => {
    const r = await call('GET', '/places?type=tourist&limit=50');
    expect(r.status === 200 && r.data.items.length > 0, `HTTP ${r.status}`);
    const masp = r.data.items.find((p) => p.name === 'MASP');
    ctx.placeId = (masp || r.data.items[0]).id;
    return `${r.data.total} pontos, ${r.data.items.filter((p) => p.image_url).length} com foto na 1ª página`;
  });
  await check('busca por texto', async () => {
    const r = await call('GET', '/places?type=all&search=Parque');
    expect(r.status === 200, `HTTP ${r.status}`);
    return `${r.data.total} resultados para "Parque"`;
  });
  await check('busca por raio (GPS)', async () => {
    const r = await call('GET', '/places?type=all&lat=-23.5614&lng=-46.6559&radius=5');
    expect(r.status === 200 && r.data.items.every((p) => p.distance_km <= 5), `HTTP ${r.status}`);
    return `${r.data.total} a até 5 km do MASP`;
  });
  await check('detalhe do lugar', async () => {
    const r = await call('GET', `/places/${ctx.placeId}`);
    expect(r.status === 200, `HTTP ${r.status}`);
  });
  await check('insights de IA do lugar', async () => {
    const r = await call('GET', `/places/${ctx.placeId}/insights`);
    expect(r.status === 200 && r.data.sentiment_distribution, `HTTP ${r.status}`);
  });
  await check('ranking', async () => {
    const r = await call('GET', '/places/ranked?limit=5');
    expect(r.status === 200, `HTTP ${r.status}`);
  });
  await check('recomendações', async () => {
    const r = await call('GET', '/places/recommended');
    expect(r.status === 200 && Array.isArray(r.data.items), `HTTP ${r.status}`);
    return `${r.data.items.length} sugestões`;
  });
  await check('ID inválido → 400', async () => {
    const r = await call('GET', '/places/abc');
    expect(r.status === 400, `HTTP ${r.status}`);
  });
  for (const path of ['/places/abc/reviews', '/places/abc/attendees', '/posts/abc', '/users/abc']) {
    await check(`ID inválido em ${path} → 400`, async () => {
      const r = await call('GET', path);
      expect(r.status === 400, `HTTP ${r.status}`);
    });
  }
  await check('lugar inexistente → 404', async () => {
    const r = await call('GET', '/places/99999999');
    expect(r.status === 404, `HTTP ${r.status}`);
  });

  console.log('\nAvaliações e IA');
  await check('criar avaliação', async () => {
    const r = await call('POST', `/places/${ctx.placeId}/reviews`, { rating: 5, comment: 'Lugar maravilhoso, adorei a visita e voltaria com certeza.' });
    expect(r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    ctx.reviewId = r.data.review.id;
  });
  await check('sentimento calculado em segundo plano', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await call('GET', `/places/${ctx.placeId}/reviews?limit=50`);
      const mine = r.data.items.find((x) => x.id === ctx.reviewId);
      if (mine?.sentiment) return `${mine.sentiment} (${mine.sentiment_score})`;
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error('sentimento não apareceu em 30 s');
  });
  await check('avaliação duplicada é recusada', async () => {
    const r = await call('POST', `/places/${ctx.placeId}/reviews`, { rating: 4, comment: 'Segunda avaliação no mesmo lugar.' });
    expect(r.status === 409, `HTTP ${r.status}`);
  });
  await check('editar avaliação', async () => {
    const r = await call('PUT', `/places/${ctx.placeId}/reviews/${ctx.reviewId}`, { rating: 4, comment: 'Lugar bom, mas estava bem cheio no domingo.' });
    expect(r.status === 200, `HTTP ${r.status}`);
  });
  await check('demo de IA (/ai-demo)', async () => {
    const r = await call('POST', '/ai/compare', { text: 'Lugar bem ok, da pra passar a tarde, mas não é tudo aquilo que dizem' }, { auth: false });
    expect(r.status === 200, `HTTP ${r.status}`);
    expect(r.data.m2.sentiment !== 'unavailable', 'modelo M2 indisponível');
    return `M2 ${r.data.m2_raw.sentiment} ${r.data.m2_raw.score} → híbrido ${r.data.m2.sentiment} (${r.data.latency_ms} ms)`;
  });

  console.log('\nEventos');
  await check('criar evento', async () => {
    const d = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const r = await call('POST', '/places', {
      name: `Evento de teste ${stamp}`, description: 'Evento criado pelo teste automático.',
      latitude: -23.5614, longitude: -46.6559, category: 'musica', is_free: true,
      city: 'São Paulo', state: 'SP', event_date: d, max_attendees: 50, force_event: true,
    });
    expect(r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    ctx.eventId = r.data.place.id;
    expect(r.data.place.type === 'event', `criado como ${r.data.place.type}`);
  });
  await check('organizador não confirma presença no próprio evento', async () => {
    const r = await call('POST', `/places/${ctx.eventId}/attendees`, { status: 'going' });
    expect(r.status === 400, `HTTP ${r.status}`);
  });
  await check('confirmar presença em evento de outra pessoa', async () => {
    const list = await call('GET', '/places?type=event&limit=50');
    const today = new Date().toISOString().slice(0, 10);
    const other = list.data.items.find((p) => p.id !== ctx.eventId && (!p.event_date || p.event_date >= today));
    expect(other, 'nenhum evento futuro de outra pessoa para testar');
    ctx.otherEventId = other.id;
    const r = await call('POST', `/places/${other.id}/attendees`, { status: 'going' });
    expect(r.status === 200 || r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    return other.name;
  });
  await check('meus eventos', async () => {
    const r = await call('GET', '/users/me/places');
    expect(r.status === 200 && r.data.items.some((p) => p.id === ctx.eventId), `HTTP ${r.status}`);
  });
  await check('cancelar presença', async () => {
    const r = await call('DELETE', `/places/${ctx.otherEventId}/attendees`);
    expect(r.status === 200, `HTTP ${r.status}`);
  });

  console.log('\nFeed');
  await check('criar post', async () => {
    const r = await call('POST', '/posts', { title: 'Post de teste', content: 'Conteúdo criado pelo teste automático.', place_id: ctx.placeId });
    expect(r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.data)}`);
    ctx.postId = r.data.post.id;
  });
  await check('curtir post', async () => {
    const r = await call('POST', `/posts/${ctx.postId}/like`);
    expect(r.status === 200, `HTTP ${r.status}`);
  });
  await check('listar feed', async () => {
    const r = await call('GET', '/posts');
    expect(r.status === 200, `HTTP ${r.status}`);
  });

  console.log('\nSegurança');
  await check('escrita sem token → 401', async () => {
    const saved = token; token = null;
    const r = await call('POST', '/posts', { title: 'Sem login', content: 'Não deveria funcionar.' });
    token = saved;
    expect(r.status === 401, `HTTP ${r.status}`);
  });
  await check('escrita sem CSRF → 403', async () => {
    const saved = csrf; csrf = null;
    const r = await call('POST', '/posts', { title: 'Sem CSRF', content: 'Não deveria funcionar.' });
    csrf = saved;
    expect(r.status === 403, `HTTP ${r.status}`);
  });

  console.log('\nLimpeza (apaga o que o teste criou)');
  await check('apagar post', async () => { const r = await call('DELETE', `/posts/${ctx.postId}`); expect(r.status === 200, `HTTP ${r.status}`); });
  await check('apagar avaliação', async () => { const r = await call('DELETE', `/places/${ctx.placeId}/reviews/${ctx.reviewId}`); expect(r.status === 200, `HTTP ${r.status}`); });
  await check('apagar evento', async () => { const r = await call('DELETE', `/places/${ctx.eventId}`); expect(r.status === 200, `HTTP ${r.status}`); });

  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} verificações passaram`);
  console.log(`(usuário de teste ${email}: remova com node scripts/clear-smoke-users.js)`);
  process.exit(fail.length ? 1 : 0);
})();
