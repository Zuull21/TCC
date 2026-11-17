#!/usr/bin/env node
/**
 * Sincroniza os pontos turísticos do banco com o catálogo curado
 * (src/config/pontos-turisticos.json, gerado por build-tourist-catalog.js).
 *
 *   1. Cada ponto do catálogo é criado ou, se já existir (mesmo nome, ou a menos
 *      de 400 m com nome parecido), atualizado. O ID é mantido: avaliações e
 *      alertas continuam ligados ao lugar.
 *   2. Foto e descrição já existentes são preservadas (ex.: as fotos locais dos
 *      8 pontos de SP); só preenche o que está vazio.
 *   3. Pontos turísticos FORA do catálogo (academias, supermercados etc. vindos
 *      do OpenStreetMap) são removidos, MAS SÓ SE não tiverem nenhum conteúdo de
 *      usuário: avaliação, post, presença ou avaliação de organizador. Os que
 *      têm conteúdo ficam e são listados.
 *
 * Uso:
 *   node scripts/sync-tourist-catalog.js            # simulação: mostra o que faria
 *   node scripts/sync-tourist-catalog.js --aplicar  # grava no banco
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Op } = require('sequelize');
const { sequelize } = require('../src/config/db');
const { runMigrations } = require('../src/config/migrations');
const { User, Place, Review, Post, EventAttendee, OrganizerReview } = require('../src/models/index');
const CATALOG = require('../src/config/pontos-turisticos.json');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();


function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Só reaproveita um lugar existente com o MESMO nome (o exibido ou o oficial da
// Wikidata) na mesma cidade. Proximidade + palavra em comum não basta: casava
// "Museu Casa Guignard" com "Museu da Inconfidência", que ficam lado a lado.
function findExisting(entry, tourists, used) {
  const names = [norm(entry.nome), norm(entry.rotulo_wikidata || '')].filter(Boolean);
  return tourists.find((p) => !used.has(p.id) && p.city === entry.city && names.includes(norm(p.name))) || null;
}

async function syncCatalog({ apply = false, log = console.log } = {}) {
  const admin = await User.findOne({ where: { role: 'admin' }, order: [['id', 'ASC']] });
  if (!admin) throw new Error('Nenhum admin no banco.');

  const tourists = await Place.findAll({ where: { type: 'tourist' } });
  const used = new Set();
  const stats = { criados: 0, atualizados: 0, removidos: 0, mantidos_com_conteudo: [] };

  // 1–2. Cria ou atualiza os pontos do catálogo
  for (const e of CATALOG) {
    const existing = findExisting(e, tourists, used);
    const data = {
      name: e.nome, category: e.categoria, city: e.city, state: e.state,
      latitude: e.latitude, longitude: e.longitude, type: 'tourist',
    };
    if (existing) {
      used.add(existing.id);
      if (!existing.image_url && e.image_url) Object.assign(data, { image_url: e.image_url, image_credit: e.image_credit });
      if (!existing.description && e.description) data.description = e.description;
      // Mantém a coordenada atual se já estava a menos de 150 m (pode ser a entrada exata)
      if (distanceM(+existing.latitude, +existing.longitude, e.latitude, e.longitude) < 150) {
        delete data.latitude; delete data.longitude;
      }
      if (apply) await existing.update(data);
      stats.atualizados++;
      if (existing.name !== e.nome) log(`  renomeado: "${existing.name}" → "${e.nome}" (${e.city})`);
    } else {
      if (apply) {
        await Place.create({
          ...data, image_url: e.image_url || null, image_credit: e.image_credit || null,
          description: e.description || null, is_free: ['natureza', 'cultura'].includes(e.categoria),
          alert_level: 'none', created_by: admin.id,
        });
      }
      stats.criados++;
    }
  }

  // 3. Remove o que não está no catálogo e não tem conteúdo de usuário
  const leftovers = tourists.filter((p) => !used.has(p.id));
  for (const p of leftovers) {
    const [reviews, posts, attendees, orgReviews] = await Promise.all([
      Review.count({ where: { place_id: p.id } }),
      Post.count({ where: { place_id: p.id } }),
      EventAttendee.count({ where: { event_id: p.id } }),
      OrganizerReview.count({ where: { event_id: p.id } }),
    ]);
    if (reviews + posts + attendees + orgReviews > 0) {
      stats.mantidos_com_conteudo.push(`${p.name} (${p.city}) — ${reviews} aval., ${posts} posts`);
      continue;
    }
    if (apply) await p.destroy();
    stats.removidos++;
  }

  log(`\n${apply ? 'APLICADO' : 'SIMULAÇÃO (nada foi gravado)'}: catálogo com ${CATALOG.length} pontos`);
  log(`  ${stats.atualizados} já existiam e foram atualizados · ${stats.criados} novos`);
  log(`  ${stats.removidos} pontos fora do catálogo ${apply ? 'removidos' : 'seriam removidos'} (sem nenhum conteúdo de usuário)`);
  if (stats.mantidos_com_conteudo.length) {
    log(`  ${stats.mantidos_com_conteudo.length} fora do catálogo MANTIDOS por terem conteúdo de usuário:`);
    stats.mantidos_com_conteudo.forEach((s) => log(`    · ${s}`));
  }
  return stats;
}

module.exports = { syncCatalog };

if (require.main === module) {
  const apply = process.argv.includes('--aplicar');
  (async () => {
    await sequelize.authenticate();
    await runMigrations(sequelize);
    await syncCatalog({ apply });
    if (!apply) console.log('\nPara gravar: node scripts/sync-tourist-catalog.js --aplicar');
    process.exit(0);
  })().catch((err) => { console.error(err); process.exit(1); });
}
