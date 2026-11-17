/**
 * De-para curado dos pontos turísticos do TourMap.
 *
 * É a FONTE ÚNICA de pontos turísticos: só entra no mapa o que está aqui.
 * Cada item tem o nome exibido, a categoria do app e o termo usado para achar o
 * verbete na Wikidata (de onde vêm coordenada oficial, foto e licença).
 *
 * Para editar: mude esta lista e rode `node scripts/build-tourist-catalog.js`,
 * que gera pontos-turisticos.json (revisado e então importado).
 *
 * Categorias: arte · cultura · esporte · gastronomia · musica · natureza
 */

module.exports = [
  {
    city: 'São Paulo', state: 'SP', bbox: [-24.01, -46.83, -23.35, -46.36],
    items: [
      ['MASP', 'arte', 'Museu de Arte de São Paulo'],
      ['Parque Ibirapuera', 'natureza', 'Parque Ibirapuera'],
      ['Pinacoteca do Estado', 'arte', 'Pinacoteca do Estado de São Paulo'],
      ['Bairro da Liberdade', 'cultura', 'Liberdade'],
      ['Museu do Futebol', 'esporte', 'Museu do Futebol'],
      ['Mercado Municipal de São Paulo', 'gastronomia', 'Mercado Municipal de São Paulo'],
      ['Beco do Batman', 'arte', 'Beco do Batman'],
      ['Theatro Municipal de São Paulo', 'musica', 'Theatro Municipal de São Paulo'],
      ['Catedral da Sé', 'cultura', 'Catedral Metropolitana de São Paulo'],
      ['Museu do Ipiranga', 'cultura', 'Museu Paulista'],
    ],
  },
  {
    city: 'Rio de Janeiro', state: 'RJ', bbox: [-23.10, -43.80, -22.74, -43.09],
    items: [
      ['Cristo Redentor', 'cultura', 'Cristo Redentor'],
      ['Pão de Açúcar', 'natureza', 'Pão de Açúcar'],
      ['Praia de Copacabana', 'natureza', 'Praia de Copacabana'],
      ['Praia de Ipanema', 'natureza', 'Praia de Ipanema'],
      ['Escadaria Selarón', 'arte', 'Escadaria Selarón'],
      ['Arcos da Lapa', 'cultura', 'Arcos da Lapa'],
      ['Jardim Botânico do Rio de Janeiro', 'natureza', 'Jardim Botânico do Rio de Janeiro'],
      ['Estádio do Maracanã', 'esporte', 'Estádio do Maracanã'],
      ['Museu do Amanhã', 'arte', 'Museu do Amanhã'],
      ['Theatro Municipal do Rio de Janeiro', 'musica', 'Theatro Municipal do Rio de Janeiro'],
    ],
  },
  {
    city: 'Salvador', state: 'BA', bbox: [-13.02, -38.62, -12.87, -38.30],
    items: [
      ['Pelourinho', 'cultura', 'Pelourinho'],
      ['Elevador Lacerda', 'cultura', 'Elevador Lacerda'],
      ['Mercado Modelo', 'gastronomia', 'Mercado Modelo Salvador'],
      ['Farol da Barra', 'cultura', 'Forte de Santo Antônio da Barra'],
      ['Igreja e Convento de São Francisco', 'arte', 'Igreja e Convento de São Francisco Salvador'],
      ['Igreja do Bonfim', 'cultura', 'Basílica do Senhor do Bonfim'],
      ['Porto da Barra', 'natureza', 'Praia do Porto da Barra'],
      ['Museu de Arte Moderna da Bahia', 'arte', 'Museu de Arte Moderna da Bahia'],
      ['Arena Fonte Nova', 'esporte', 'Arena Fonte Nova'],
      ['Dique do Tororó', 'natureza', 'Dique do Tororó'],
    ],
  },
  {
    city: 'Fortaleza', state: 'CE', bbox: [-3.85, -38.63, -3.69, -38.41],
    items: [
      ['Praia de Iracema', 'natureza', 'Praia de Iracema'],
      ['Praia do Futuro', 'natureza', 'Praia do Futuro'],
      ['Mercado Central de Fortaleza', 'gastronomia', 'Mercado Central de Fortaleza'],
      ['Centro Dragão do Mar', 'arte', 'Centro Dragão do Mar de Arte e Cultura'],
      ['Catedral de Fortaleza', 'cultura', 'Catedral Metropolitana de Fortaleza'],
      ['Theatro José de Alencar', 'musica', 'Theatro José de Alencar'],
      ['Ponte dos Ingleses', 'cultura', 'Ponte dos Ingleses'],
      ['Arena Castelão', 'esporte', 'Arena Castelão'],
      ['Museu do Ceará', 'cultura', 'Museu do Ceará'],
      ['Beira-Mar de Fortaleza', 'natureza', 'Avenida Beira Mar'],
    ],
  },
  {
    city: 'Manaus', state: 'AM', bbox: [-3.22, -60.11, -2.97, -59.89],
    items: [
      ['Teatro Amazonas', 'musica', 'Teatro Amazonas'],
      ['Mercado Adolpho Lisboa', 'gastronomia', 'Mercado Municipal Adolpho Lisboa'],
      ['Palácio Rio Negro', 'cultura', 'Palácio Rio Negro'],
      ['Museu da Amazônia (MUSA)', 'natureza', 'Museu da Amazônia'],
      ['Praia da Ponta Negra', 'natureza', 'Ponta Negra Manaus'],
      ['Catedral de Manaus', 'cultura', 'Catedral Metropolitana de Manaus'],
      ['Arena da Amazônia', 'esporte', 'Arena da Amazônia'],
      ['Bosque da Ciência', 'natureza', 'Bosque da Ciência'],
      ['Palácio da Justiça', 'cultura', 'Palácio da Justiça Manaus'],
      ['Encontro das Águas', 'natureza', 'Encontro das Águas'],
    ],
  },
  {
    city: 'Brasília', state: 'DF', bbox: [-16.00, -48.28, -15.55, -47.31],
    items: [
      ['Catedral de Brasília', 'cultura', 'Catedral Metropolitana de Brasília'],
      ['Congresso Nacional', 'cultura', 'Palácio do Congresso Nacional'],
      ['Palácio da Alvorada', 'cultura', 'Palácio da Alvorada'],
      ['Praça dos Três Poderes', 'cultura', 'Praça dos Três Poderes'],
      ['Ponte JK', 'cultura', 'Ponte Juscelino Kubitschek'],
      ['Torre de TV de Brasília', 'cultura', 'Torre de TV de Brasília'],
      ['Palácio do Itamaraty', 'arte', 'Palácio do Itamaraty'],
      ['Memorial JK', 'cultura', 'Memorial JK'],
      ['Santuário Dom Bosco', 'cultura', 'Santuário Dom Bosco'],
      ['Parque da Cidade', 'natureza', 'Parque da Cidade Dona Sarah Kubitschek'],
    ],
  },
  {
    city: 'Recife', state: 'PE', bbox: [-8.18, -35.07, -7.95, -34.86],
    items: [
      ['Marco Zero', 'cultura', 'Praça Rio Branco Recife Marco Zero'],
      ['Instituto Ricardo Brennand', 'arte', 'Instituto Ricardo Brennand'],
      ['Oficina Francisco Brennand', 'arte', 'Oficina Cerâmica Francisco Brennand'],
      ['Praia de Boa Viagem', 'natureza', 'Praia de Boa Viagem'],
      ['Paço do Frevo', 'musica', 'Paço do Frevo'],
      ['Sinagoga Kahal Zur Israel', 'cultura', 'Sinagoga Kahal Zur Israel'],
      ['Teatro de Santa Isabel', 'musica', 'Teatro de Santa Isabel'],
      ['Casa da Cultura de Pernambuco', 'cultura', 'Casa da Cultura de Pernambuco'],
      ['Forte das Cinco Pontas', 'cultura', 'Forte das Cinco Pontas'],
    ],
  },
  {
    city: 'Porto Alegre', state: 'RS', bbox: [-30.25, -51.33, -29.95, -51.07],
    items: [
      ['Usina do Gasômetro', 'cultura', 'Usina do Gasômetro'],
      ['Mercado Público de Porto Alegre', 'gastronomia', 'Mercado Público de Porto Alegre'],
      ['Parque da Redenção', 'natureza', 'Parque Farroupilha'],
      ['Fundação Iberê Camargo', 'arte', 'Fundação Iberê Camargo'],
      ['Casa de Cultura Mario Quintana', 'cultura', 'Casa de Cultura Mario Quintana'],
      ['Catedral de Porto Alegre', 'cultura', 'Catedral Metropolitana de Porto Alegre'],
      ['Theatro São Pedro', 'musica', 'Theatro São Pedro Porto Alegre'],
      ['Parque Moinhos de Vento', 'natureza', 'Parque Moinhos de Vento'],
      ['Museu da PUCRS', 'cultura', 'Museu de Ciências e Tecnologia da PUCRS'],
      ['Estádio Beira-Rio', 'esporte', 'Estádio Beira-Rio'],
    ],
  },
  {
    city: 'Curitiba', state: 'PR', bbox: [-25.65, -49.40, -25.33, -49.18],
    items: [
      ['Jardim Botânico de Curitiba', 'natureza', 'Jardim Botânico de Curitiba'],
      ['Museu Oscar Niemeyer', 'arte', 'Museu Oscar Niemeyer'],
      ['Ópera de Arame', 'musica', 'Ópera de Arame'],
      ['Parque Barigui', 'natureza', 'Parque Barigui'],
      ['Rua XV de Novembro', 'cultura', 'Rua XV de Novembro Curitiba'],
      ['Parque Tanguá', 'natureza', 'Parque Tanguá'],
      ['Bosque Alemão', 'natureza', 'Bosque Alemão'],
      ['Largo da Ordem', 'cultura', 'Largo da Ordem'],
      ['Teatro Guaíra', 'musica', 'Teatro Guaíra'],
      ['Memorial Ucraniano', 'cultura', 'Memorial Ucraniano'],
    ],
  },
  {
    city: 'Belém', state: 'PA', bbox: [-1.55, -48.60, -1.32, -48.37],
    items: [
      ['Mercado Ver-o-Peso', 'gastronomia', 'Ver-o-Peso'],
      ['Estação das Docas', 'gastronomia', 'Estação das Docas'],
      ['Theatro da Paz', 'musica', 'Theatro da Paz'],
      ['Basílica de Nazaré', 'cultura', 'Basílica Santuário de Nossa Senhora de Nazaré'],
      ['Mangal das Garças', 'natureza', 'Mangal das Garças'],
      ['Museu Paraense Emílio Goeldi', 'natureza', 'Museu Paraense Emílio Goeldi'],
      ['Forte do Presépio', 'cultura', 'Forte do Presépio'],
      ['Catedral de Belém', 'cultura', 'Catedral Metropolitana de Belém'],
      ['Parque da Residência', 'natureza', 'Parque da Residência'],
      ['Bosque Rodrigues Alves', 'natureza', 'Bosque Rodrigues Alves'],
    ],
  },
  {
    city: 'Florianópolis', state: 'SC', bbox: [-27.83, -48.70, -27.41, -48.37],
    items: [
      ['Ponte Hercílio Luz', 'cultura', 'Ponte Hercílio Luz'],
      ['Lagoa da Conceição', 'natureza', 'Lagoa da Conceição'],
      ['Praia da Joaquina', 'natureza', 'Praia da Joaquina'],
      ['Mercado Público de Florianópolis', 'gastronomia', 'Mercado Público de Florianópolis'],
      ['Praia de Jurerê', 'natureza', 'Jurerê'],
      ['Catedral de Florianópolis', 'cultura', 'Catedral Metropolitana de Florianópolis'],
      ['Praia Mole', 'natureza', 'Praia Mole'],
      ['Santo Antônio de Lisboa', 'cultura', 'Santo Antônio de Lisboa Florianópolis'],
      ['Fortaleza de São José da Ponta Grossa', 'cultura', 'Fortaleza de São José da Ponta Grossa'],
      ['Praça XV de Novembro', 'cultura', 'Praça XV de Novembro Florianópolis'],
    ],
  },
  {
    city: 'Foz do Iguaçu', state: 'PR', bbox: [-25.74, -54.68, -25.38, -54.00], // inclui o Parque Nacional e Itaipu
    items: [
      ['Cataratas do Iguaçu', 'natureza', 'Cataratas do Iguaçu'],
      ['Parque Nacional do Iguaçu', 'natureza', 'Parque Nacional do Iguaçu'],
      ['Usina de Itaipu', 'cultura', 'Itaipu'],
      ['Marco das Três Fronteiras', 'cultura', 'Marco das Três Fronteiras'],
      ['Parque das Aves', 'natureza', 'Parque das Aves'],
      ['Ponte da Amizade', 'cultura', 'Ponte da Amizade'],
    ],
  },
  {
    city: 'Ouro Preto', state: 'MG', bbox: [-20.45, -43.58, -20.33, -43.46],
    items: [
      ['Igreja de São Francisco de Assis', 'arte', 'Igreja de São Francisco de Assis Ouro Preto'],
      ['Praça Tiradentes', 'cultura', 'Praça Tiradentes Ouro Preto'],
      ['Museu da Inconfidência', 'cultura', 'Museu da Inconfidência'],
      ['Igreja de Nossa Senhora do Pilar', 'arte', 'Matriz de Nossa Senhora do Pilar Ouro Preto'],
      ['Casa dos Contos', 'cultura', 'Casa dos Contos'],
      ['Museu de Ciência e Técnica', 'cultura', 'Museu de Ciência e Técnica da Escola de Minas'],
      ['Casa da Ópera', 'musica', 'Teatro Municipal de Ouro Preto'],
    ],
  },
  {
    city: 'Natal', state: 'RN', bbox: [-5.89, -35.28, -5.72, -35.15],
    items: [
      ['Forte dos Reis Magos', 'cultura', 'Forte dos Reis Magos'],
      ['Ponte Newton Navarro', 'cultura', 'Ponte Newton Navarro'],
      ['Praia de Ponta Negra', 'natureza', 'Praia de Ponta Negra Natal'],
      ['Morro do Careca', 'natureza', 'Morro do Careca'],
      ['Parque das Dunas', 'natureza', 'Parque Estadual Dunas de Natal'],
      ['Memorial Câmara Cascudo', 'cultura', 'Memorial Câmara Cascudo'],
      ['Catedral de Natal', 'cultura', 'Catedral Metropolitana de Natal'],
      ['Arena das Dunas', 'esporte', 'Arena das Dunas'],
    ],
  },
  {
    city: 'Gramado', state: 'RS', bbox: [-29.43, -50.95, -29.32, -50.82],
    items: [
      ['Lago Negro', 'natureza', 'Lago Negro Gramado'],
      ['Mini Mundo', 'cultura', 'Mini Mundo Gramado'],
      ['Igreja Matriz São Pedro', 'cultura', 'Igreja Matriz São Pedro Gramado'],
      ['Palácio dos Festivais', 'arte', 'Palácio dos Festivais'],
    ],
  },
];
