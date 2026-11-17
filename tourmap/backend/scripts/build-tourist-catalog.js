#!/usr/bin/env node
/**
 * Gera o catálogo de pontos turísticos a partir do de-para curado
 * (src/config/pontos-turisticos.lista.js), consultando a Wikidata.
 *
 * Para cada item traz: coordenada oficial (P625), foto principal (P18) com autor
 * e licença (Wikimedia Commons) e uma descrição curta. A coordenada só é aceita
 * se cair dentro da cidade (bbox), para evitar homônimos ("Museu do Futebol"
 * também existe no Rio, em Curitiba e no Paraguai).
 *
 * Usa o serviço SPARQL da Wikidata (uma consulta por cidade) e a API da Commons
 * em lotes de 50 fotos: ~20 requisições no total, sem esbarrar nos limites.
 * Só lê da internet e grava arquivos; não toca no banco.
 *
 * Uso:   node scripts/build-tourist-catalog.js
 * Saída: src/config/pontos-turisticos.json   (usado pela importação)
 *        scripts/pontos-turisticos-revisao.csv (para revisar no Excel)
 */
const fs = require('fs');
const path = require('path');
const CITIES = require('../src/config/pontos-turisticos.lista');

const UA = 'TourMap/1.0 (projeto academico)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Verbetes internos da Wikimedia que às vezes têm coordenada e não são o lugar em si
const NOT_A_PLACE = /\b(glam|wikiprojeto|wikiproject|categoria|category|lista de|list of)\b/i;
const NOT_A_PLACE_TYPES = new Set(['Q4167836', 'Q14204246', 'Q13406463', 'Q4167410', 'Q17362920']);

async function fetchRetry(url, opts = {}) {
  for (let t = 0; t < 6; t++) {
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (res.status !== 429 && res.status < 500) return res;
    const wait = Number(res.headers.get('retry-after')) || 10 * (t + 1);
    console.log(`  (servidor ocupado, HTTP ${res.status}: aguardando ${wait}s)`);
    await sleep((wait + 1) * 1000);
  }
  throw new Error(`falhou após várias tentativas: ${url.slice(0, 80)}`);
}

function inside([s, w, n, e], lat, lng, margin = 0.05) {
  return lat >= s - margin && lat <= n + margin && lng >= w - margin && lng <= e + margin;
}

/** Busca, numa só consulta, os candidatos de todos os termos de uma cidade. */
async function sparqlCandidates(terms) {
  const values = terms.map((t) => JSON.stringify(t)).join(' ');
  const query = `
SELECT ?term ?item ?itemLabel ?itemDescription ?coord ?img ?sl ?type WHERE {
  VALUES ?term { ${values} }
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch"; wikibase:endpoint "www.wikidata.org";
                    mwapi:search ?term; mwapi:language "pt".
    ?item wikibase:apiOutputItem mwapi:item.
  }
  ?item wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P31 ?type }
  ?item wikibase:sitelinks ?sl.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}`;
  const res = await fetchRetry('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }),
  });
  const rows = (await res.json()).results.bindings;

  // Agrupa por (termo, item): uma linha por tipo (P31)
  const byKey = new Map();
  for (const b of rows) {
    const id = b.item.value.split('/').pop();
    const key = `${b.term.value}|${id}`;
    if (!byKey.has(key)) {
      const [lng, lat] = b.coord.value.replace(/^Point\(|\)$/g, '').split(' ').map(Number);
      byKey.set(key, {
        term: b.term.value, id, label: b.itemLabel?.value || id, description: b.itemDescription?.value || null,
        lat, lng, img: b.img ? decodeURIComponent(b.img.value.split('FilePath/').pop()) : null,
        sitelinks: Number(b.sl.value), types: new Set(),
      });
    }
    if (b.type) byKey.get(key).types.add(b.type.value.split('/').pop());
  }
  return [...byKey.values()];
}

function choose(item, city, cands) {
  const [nome, categoria, busca] = item;
  const valid = cands
    .filter((c) => c.term === busca || c.term === nome)
    .filter((c) => inside(city.bbox, c.lat, c.lng))
    .filter((c) => !NOT_A_PLACE.test(c.label) && ![...c.types].some((t) => NOT_A_PLACE_TYPES.has(t)))
    .map((c) => ({ ...c, exact: [nome, busca].some((q) => norm(q) === norm(c.label)) }))
    // Rótulo igual ao buscado primeiro; depois o mais conhecido (presente em mais Wikipédias)
    .sort((a, b) => (b.exact - a.exact) || (b.sitelinks - a.sitelinks));
  if (!valid.length) return { nome, categoria, status: 'não encontrado na cidade' };
  const c = valid[0];
  return {
    nome, categoria, wikidata: c.id, rotulo_wikidata: c.label,
    latitude: Number(c.lat.toFixed(6)), longitude: Number(c.lng.toFixed(6)),
    imagem_arquivo: c.img, sitelinks: c.sitelinks, wikidata_descricao: c.description, status: 'ok',
  };
}

/** Autor, licença e miniatura das fotos, em lotes de 50 (API da Commons). */
async function commonsInfo(files) {
  const info = {};
  const toKey = (s) => s.replace(/^File:/, '').replace(/_/g, ' ');
  for (let i = 0; i < files.length; i += 25) {
    const batch = files.slice(i, i + 25);
    // A API devolve os metadados em partes (campo "continue"): segue até o fim
    let cont = {};
    do {
      const res = await fetchRetry('https://commons.wikimedia.org/w/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          format: 'json', action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: 960,
          titles: batch.map((f) => 'File:' + f).join('|'), ...cont,
        }),
      });
      const j = await res.json();
      for (const p of Object.values(j.query?.pages || {})) {
        const ii = p.imageinfo?.[0];
        if (!ii || info[toKey(p.title)]) continue;
        const m = ii.extmetadata || {};
        info[toKey(p.title)] = {
          url: ii.thumburl || ii.url,
          autor: strip(m.Artist?.value).slice(0, 120) || 'autor desconhecido',
          licenca: m.LicenseShortName?.value || '?',
        };
      }
      cont = j.continue || null;
      await sleep(1000);
    } while (cont);
  }
  return info;
}

function describe(r, city) {
  // Descrição curta da Wikidata ("museu de arte em São Paulo") como texto inicial
  if (!r.wikidata_descricao) return null;
  const d = r.wikidata_descricao.trim();
  return `${d.charAt(0).toUpperCase()}${d.slice(1)}${/[.!?]$/.test(d) ? '' : '.'}`;
}

(async () => {
  const out = [];
  for (const city of CITIES) {
    const terms = [...new Set(city.items.flatMap(([nome, , busca]) => [busca, nome]))];
    const cands = await sparqlCandidates(terms);
    for (const item of city.items) out.push({ city: city.city, state: city.state, ...choose(item, city, cands) });
    const ok = out.filter((r) => r.city === city.city && r.status === 'ok').length;
    console.log(`${city.city.padEnd(15)} ${ok}/${city.items.length} encontrados`);
    await sleep(1500);
  }

  const files = [...new Set(out.filter((r) => r.imagem_arquivo).map((r) => r.imagem_arquivo))];
  console.log(`\nBuscando autor e licença de ${files.length} fotos...`);
  const info = await commonsInfo(files);
  for (const r of out) {
    const f = r.imagem_arquivo && info[r.imagem_arquivo.replace(/_/g, ' ')];
    if (f) Object.assign(r, {
      image_url: f.url, foto_autor: f.autor, foto_licenca: f.licenca,
      image_credit: `${f.autor} / Wikimedia Commons (${f.licenca})`.slice(0, 300),
    });
    if (r.status === 'ok') r.description = describe(r);
  }

  const ok = out.filter((r) => r.status === 'ok');
  fs.writeFileSync(path.join(__dirname, '../src/config/pontos-turisticos.json'), JSON.stringify(ok, null, 2));

  const esc = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['cidade', 'nome', 'categoria', 'status', 'wikidata', 'rotulo_wikidata', 'latitude', 'longitude', 'tem_foto', 'foto_autor', 'foto_licenca', 'image_url', 'descricao'];
  const rows = out.map((r) => [r.city, r.nome, r.categoria, r.status, r.wikidata, r.rotulo_wikidata, r.latitude, r.longitude,
    r.image_url ? 'sim' : 'não', r.foto_autor, r.foto_licenca, r.image_url, r.description]);
  fs.writeFileSync(path.join(__dirname, 'pontos-turisticos-revisao.csv'), '﻿' + [head, ...rows].map((x) => x.map(esc).join(';')).join('\n') + '\n');

  console.log(`\n${ok.length} de ${out.length} encontrados · ${ok.filter((r) => r.image_url).length} com foto`);
  out.filter((r) => r.status !== 'ok').forEach((r) => console.log(`  ⚠ ${r.city}: ${r.nome} (${r.status})`));
  ok.filter((r) => !r.image_url).forEach((r) => console.log(`  sem foto: ${r.city}: ${r.nome}`));
  ok.filter((r) => norm(r.rotulo_wikidata) !== norm(r.nome)).forEach((r) => console.log(`  conferir: ${r.city}: "${r.nome}" → "${r.rotulo_wikidata}"`));
})().catch((err) => { console.error(err); process.exit(1); });
