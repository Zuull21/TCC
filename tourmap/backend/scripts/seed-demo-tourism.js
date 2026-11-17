#!/usr/bin/env node
/**
 * Popula 8 pontos turísticos de São Paulo para demonstração:
 * foto (com crédito), descrição e avaliações de visitantes.
 *
 * O sentimento de cada avaliação é classificado pelo MODELO REAL (analyzeSentiment,
 * o mesmo pipeline de produção), não escrito à mão. Assim a demonstração mostra a
 * ferramenta funcionando de verdade, inclusive onde ela erra.
 *
 * Idempotente: pode rodar de novo sem duplicar nada (atualiza fotos, pula
 * avaliações que o usuário já fez).
 *
 * Uso: node scripts/seed-demo-tourism.js
 * Fotos: frontend/public/fotos/ (Wikimedia Commons; licenças nos créditos abaixo)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { sequelize } = require('../src/config/db');
const { runMigrations } = require('../src/config/migrations');
const { User, Place, Review, Post } = require('../src/models/index');
const { analyzeSentiment } = require('../src/services/aiService');
const { checkAndUpdateAlerts } = require('../src/services/alertService');

const PASSWORD = process.env.SEED_PASSWORD || require('crypto').randomBytes(9).toString('base64url');

// Visitantes de demonstração (os 5 primeiros já existem no seed de eventos)
const VISITORS = [
  { key: 'ana',    name: 'Ana Lima',      email: 'ana.lima.seed@tourmap.dev',      city: 'São Paulo' },
  { key: 'bruno',  name: 'Bruno Melo',    email: 'bruno.melo.seed@tourmap.dev',    city: 'Campinas' },
  { key: 'carla',  name: 'Carla Dias',    email: 'carla.dias.seed@tourmap.dev',    city: 'São Paulo' },
  { key: 'diego',  name: 'Diego Ramos',   email: 'diego.ramos.seed@tourmap.dev',   city: 'Rio de Janeiro' },
  { key: 'elisa',  name: 'Elisa Nunes',   email: 'elisa.nunes.seed@tourmap.dev',   city: 'Belo Horizonte' },
  { key: 'lucas',  name: 'Lucas Prado',   email: 'lucas.prado.seed@tourmap.dev',   city: 'São Paulo' },
  { key: 'marina', name: 'Marina Souza',  email: 'marina.souza.seed@tourmap.dev',  city: 'Curitiba' },
  { key: 'paulo',  name: 'Paulo Henrique', email: 'paulo.henrique.seed@tourmap.dev', city: 'Salvador' },
];

const commons = (author, license) => `${author} / Wikimedia Commons (${license})`;

const PLACES = [
  {
    name: 'MASP',
    match: ['MASP', 'Museu de Arte de São Paulo'],
    category: 'arte', is_free: false,
    latitude: -23.5614, longitude: -46.6559,
    address: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP',
    description: 'Museu de Arte de São Paulo Assis Chateaubriand. O prédio de Lina Bo Bardi, suspenso sobre um vão livre de 74 metros, abriga o mais importante acervo de arte europeia do hemisfério sul.',
    image_url: '/fotos/masp.jpg',
    image_credit: commons('JCGbr', 'CC BY-SA 4.0'),
    reviews: [
      ['ana', 5, 'Acervo incrível! Ver Van Gogh e Renoir nos cavaletes de vidro é uma experiência única. Vale cada minuto.'],
      ['lucas', 5, 'Programa obrigatório em São Paulo. Fui na terça, que é gratuita, e saí encantado com a exposição.'],
      ['diego', 4, 'Museu lindo, mas a fila no fim de semana estava enorme. Recomendo comprar o ingresso antes.'],
      ['marina', 3, 'O acervo é bom, mas achei o ingresso caro e algumas salas estavam fechadas para montagem.'],
      ['paulo', 5, 'O vão livre com a feira de antiguidades no domingo é sensacional. Dá pra passar a tarde toda.'],
    ],
  },
  {
    name: 'Parque Ibirapuera',
    match: ['Parque Ibirapuera', 'Parque do Ibirapuera'],
    category: 'natureza', is_free: true,
    latitude: -23.5874, longitude: -46.6576,
    address: 'Av. Pedro Álvares Cabral - Vila Mariana, São Paulo - SP',
    description: 'O parque urbano mais famoso de São Paulo, com lagos, ciclovias, a marquise e museus projetados por Oscar Niemeyer.',
    image_url: '/fotos/parque-ibirapuera.jpg',
    image_credit: commons('Fernando Stankuns', 'CC BY-SA 4.0'),
    reviews: [
      ['carla', 5, 'Meu lugar preferido da cidade. Parque bem cuidado, ótimo para correr de manhã e fazer piquenique.'],
      ['bruno', 4, 'Muito bonito e cheio de opções, mas no domingo fica lotado e é difícil achar lugar para sentar.'],
      ['elisa', 5, 'Alugamos bicicleta e demos a volta no lago. As crianças amaram, programa perfeito para família.'],
      ['ana', 3, 'É grande e agradável, porém os banheiros estavam sujos e faltava papel.'],
      ['paulo', 5, 'Que lugar gostoso! Pôr do sol perto do lago é de tirar o fôlego.'],
    ],
  },
  {
    name: 'Pinacoteca do Estado',
    match: ['Pinacoteca do Estado', 'Pinacoteca'],
    category: 'arte', is_free: false,
    latitude: -23.5343, longitude: -46.6339,
    address: 'Praça da Luz, 2 - Luz, São Paulo - SP',
    description: 'O museu de arte mais antigo da cidade, com grande acervo de arte brasileira do século XIX ao contemporâneo, num prédio restaurado por Paulo Mendes da Rocha.',
    image_url: '/fotos/pinacoteca.jpg',
    image_credit: commons('Wilfredor', 'CC BY-SA 4.0'),
    reviews: [
      ['marina', 5, 'Prédio lindíssimo e acervo de arte brasileira impecável. A luz natural nas salas é um espetáculo.'],
      ['lucas', 4, 'Gostei muito da exposição permanente. O café do museu também é ótimo.'],
      ['diego', 3, 'Museu interessante, mas a região em volta é meio vazia à noite. Fui de dia e foi tranquilo.'],
      ['elisa', 5, 'Saímos de lá com vontade de voltar. Programa cultural de primeira!'],
    ],
  },
  {
    name: 'Bairro da Liberdade',
    match: ['Bairro da Liberdade', 'Liberdade'],
    category: 'cultura', is_free: true,
    latitude: -23.5597, longitude: -46.6336,
    address: 'Rua Galvão Bueno - Liberdade, São Paulo - SP',
    description: 'O bairro da maior comunidade japonesa fora do Japão, com as lanternas vermelhas da Rua Galvão Bueno, restaurantes, lojas e a feira de domingo.',
    image_url: '/fotos/liberdade.jpg',
    image_credit: commons('Wilfredor', 'CC0'),
    reviews: [
      ['bruno', 5, 'Comida deliciosa e a feira de domingo é imperdível. Experimentei taiyaki e lamen, tudo top.'],
      ['carla', 4, 'Ambiente muito legal, mas no fim de semana a rua fica espremida de tanta gente.'],
      ['paulo', 2, 'Esperamos uma hora pra comer e o atendimento foi grosseiro. Não volto nesse restaurante.'],
      ['marina', 5, 'As lanternas à noite deixam a rua linda. Adorei as lojinhas de papelaria japonesa.'],
      ['ana', 3, 'Legal para conhecer, mas não achei que vale tanto o hype. Os preços subiram bastante.'],
    ],
  },
  {
    name: 'Museu do Futebol',
    match: ['Museu do Futebol'],
    category: 'esporte', is_free: false,
    latitude: -23.5474, longitude: -46.6655,
    address: 'Praça Charles Miller, s/n - Pacaembu, São Paulo - SP',
    description: 'Museu interativo dedicado à história do futebol brasileiro, instalado sob as arquibancadas do Estádio do Pacaembu.',
    image_url: '/fotos/museu-do-futebol.jpg',
    image_credit: commons('Boaventuravinicius', 'CC BY-SA 4.0'),
    reviews: [
      ['diego', 5, 'Mesmo pra quem não é fanático, o museu é muito interativo e emocionante. Show de primeira!'],
      ['lucas', 5, 'Sala das Copas e a dos gols narrados são sensacionais. Passei três horas lá e nem vi.'],
      ['elisa', 4, 'Bem montado e divertido. Só achei que algumas telas interativas estavam com defeito.'],
      ['bruno', 3, 'O museu é ok, dá para conhecer em uma hora. Nada que me surpreendeu muito.'],
    ],
  },
  {
    name: 'Mercado Municipal de São Paulo',
    match: ['Mercado Municipal', 'Mercadão'],
    category: 'gastronomia', is_free: true,
    latitude: -23.5418, longitude: -46.6292,
    address: 'Rua da Cantareira, 306 - Centro Histórico, São Paulo - SP',
    description: 'O Mercadão, de 1933, famoso pelos vitrais, pelo sanduíche de mortadela e pelo pastel de bacalhau.',
    image_url: '/fotos/mercado-municipal.jpg',
    image_credit: commons('Júlia Storch', 'CC BY-SA 4.0'),
    reviews: [
      ['paulo', 5, 'O sanduíche de mortadela é gigante e o pastel de bacalhau é o melhor que já comi. Nota mil.'],
      ['carla', 4, 'Os vitrais são lindos e as frutas são incríveis, mas tudo é bem caro para turista.'],
      ['marina', 2, 'Que furada: me ofereceram degustação de frutas e depois cobraram uma fortuna pelo pacote.'],
      ['ana', 5, 'Prédio histórico maravilhoso, ótimo para almoçar e comprar temperos.'],
      ['diego', 3, 'Fui num sábado, estava muito cheio. Comida boa, mas não tive paciência para as filas.'],
    ],
  },
  {
    name: 'Beco do Batman',
    match: ['Beco do Batman'],
    category: 'arte', is_free: true,
    latitude: -23.5562, longitude: -46.6866,
    address: 'Rua Gonçalo Afonso - Vila Madalena, São Paulo - SP',
    description: 'Galeria de arte urbana a céu aberto na Vila Madalena, com grafites que se renovam a cada temporada.',
    image_url: '/fotos/beco-do-batman.jpg',
    image_credit: commons('Diego Bravo (Somente Coisas Legais)', 'CC BY-SA 4.0'),
    reviews: [
      ['elisa', 5, 'Os grafites são espetaculares, cada parede é uma obra. Ótimo para fotos!'],
      ['bruno', 4, 'Lugar bonito e cheio de vida, mas é pequeno: em meia hora você vê tudo.'],
      ['lucas', 5, 'Depois dá pra emendar nos bares da Vila Madalena. Programa certeiro de sábado.'],
      ['carla', 3, 'Achei parecido com outros murais da cidade, nada muito diferente. Mas vale a passada.'],
    ],
  },
  {
    name: 'Theatro Municipal de São Paulo',
    match: ['Theatro Municipal'],
    category: 'musica', is_free: false,
    latitude: -23.5451, longitude: -46.6385,
    address: 'Praça Ramos de Azevedo, s/n - República, São Paulo - SP',
    description: 'Inaugurado em 1911, palco da Semana de Arte Moderna de 1922. Oferece óperas, concertos e visitas guiadas gratuitas.',
    image_url: '/fotos/theatro-municipal.jpg',
    image_credit: commons('Wilfredor', 'CC0'),
    reviews: [
      ['marina', 5, 'Assistir a uma ópera ali dentro é emocionante. O teatro é deslumbrante e a acústica é perfeita.'],
      ['paulo', 5, 'Fiz a visita guiada gratuita e a guia foi muito atenciosa. Recomendo muito!'],
      ['ana', 4, 'Lindo por dentro e por fora. Só achei os ingressos dos espetáculos um pouco salgados.'],
      ['diego', 3, 'Prédio bonito, mas a praça em volta precisa de manutenção.'],
    ],
  },
];

// Posts do feed: [visitante, nome do lugar, título, texto]
const POSTS = [
  ['paulo', 'MASP', 'Domingo de feira no vão do MASP',
    'Passei a manhã na feira de antiguidades e depois subi para ver o acervo. Os cavaletes de vidro da Lina Bo Bardi continuam impressionantes.'],
  ['elisa', 'Parque Ibirapuera', 'Pôr do sol no lago do Ibirapuera',
    'Dica: chegue umas 17h, alugue uma bicicleta e termine a volta perto do lago. A luz do fim de tarde é linda para fotos.'],
  ['bruno', 'Bairro da Liberdade', 'Roteiro de comida na Liberdade',
    'Taiyaki na feira de domingo, lamen numa travessa da Galvão Bueno e mochi de sobremesa. Chegue cedo, depois das 13h fica lotado.'],
  ['marina', 'Theatro Municipal de São Paulo', 'Visita guiada gratuita no Theatro',
    'A visita guiada é gratuita e conta a história da Semana de 22. Precisa reservar pelo site com alguns dias de antecedência.'],
];

async function upsertVisitor(v) {
  let user = await User.findOne({ where: { email: v.email } });
  if (!user) {
    user = await User.create({
      name: v.name, email: v.email, city: v.city, age: 25 + (v.name.length % 20),
      password_hash: await bcrypt.hash(PASSWORD, 10), email_verified: true, role: 'tourist',
    });
    console.log(`  Visitante criado: ${v.name}`);
  } else if (!user.email_verified) {
    await user.update({ email_verified: true });
  }
  return user;
}

async function findOrCreatePlace(p, adminId) {
  // Só em São Paulo: "Mercado Municipal" também existe em outras cidades
  const place = await Place.findOne({
    where: {
      type: 'tourist',
      city: 'São Paulo',
      [Op.or]: p.match.map((m) => ({ name: { [Op.like]: `%${m}%` } })),
    },
    order: [['id', 'ASC']],
  });
  const data = {
    image_url: p.image_url, image_credit: p.image_credit, description: p.description,
    address: p.address, category: p.category, is_free: p.is_free,
  };
  if (place) {
    await place.update(data);
    return { place, created: false };
  }
  const created = await Place.create({
    ...data, name: p.name, latitude: p.latitude, longitude: p.longitude,
    city: 'São Paulo', state: 'SP', type: 'tourist', created_by: adminId,
  });
  return { place: created, created: true };
}

async function main() {
  await sequelize.authenticate();
  await runMigrations(sequelize);

  const admin = await User.findOne({ where: { role: 'admin' } });
  if (!admin) throw new Error('Nenhum admin no banco. Rode antes: node src/config/syncDb.js');

  console.log('Visitantes...');
  const users = {};
  for (const v of VISITORS) users[v.key] = await upsertVisitor(v);

  console.log('Pontos turísticos (o modelo classifica cada avaliação)...');
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const p of PLACES) {
    const { place, created } = await findOrCreatePlace(p, admin.id);
    let added = 0;
    for (const [key, rating, comment] of p.reviews) {
      const user = users[key];
      if (await Review.findOne({ where: { user_id: user.id, place_id: place.id } })) continue;
      const { sentiment, score } = await analyzeSentiment(comment);
      await Review.create({ user_id: user.id, place_id: place.id, rating, comment, sentiment, sentiment_score: score });
      counts[sentiment] = (counts[sentiment] || 0) + 1;
      added++;
    }
    const revs = await Review.findAll({ where: { place_id: place.id } });
    if (revs.length) {
      const avg = revs.reduce((s, r) => s + r.rating, 0) / revs.length;
      await place.update({ avg_rating: avg.toFixed(1), review_count: revs.length });
    }
    await checkAndUpdateAlerts(place.id, null);
    await place.reload();
    console.log(`  ${created ? 'Criado ' : 'Atualizado'} ${place.name.padEnd(32)} id=${String(place.id).padEnd(4)} ` +
      `${revs.length} avaliações (+${added}) · nota ${place.avg_rating} · alerta: ${place.alert_level}`);
  }
  console.log('Posts do feed...');
  let postsAdded = 0;
  for (const [key, placeName, title, content] of POSTS) {
    if (await Post.findOne({ where: { user_id: users[key].id, title } })) continue;
    const place = await Place.findOne({ where: { name: placeName, city: 'São Paulo', type: 'tourist' } });
    await Post.create({ user_id: users[key].id, place_id: place?.id || null, title, content });
    postsAdded++;
  }
  console.log(`  ${postsAdded} posts novos (${POSTS.length} no total)`);

  console.log(`\nSentimento das avaliações novas: ${JSON.stringify(counts)}`);
  console.log(process.env.SEED_PASSWORD
    ? 'Login de qualquer visitante: <nome>.seed@tourmap.dev / senha definida em SEED_PASSWORD'
    : `Login dos visitantes novos: <nome>.seed@tourmap.dev / ${PASSWORD} (gerada; defina SEED_PASSWORD para fixar)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
