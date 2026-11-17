/**
 * Conjuntos de avaliação da pesquisa (60 frases PT-BR rotuladas à mão).
 * Fonte única usada por evaluate-sentiment.js e export-chart-data.js.
 * Cada item: [texto, rótulo] com rótulo em positive | neutral | negative.
 */

// ── Conjunto A — desenvolvimento (30 frases, rotulação manual do autor) ───────
const SET_A = [
  // POSITIVO
  ['Lugar maravilhoso, família adorou, voltaremos com certeza. Atendimento impecável e preço justo.', 'positive'],
  ['Experiência incrível! A vista é deslumbrante e o guia muito atencioso. Recomendo muito.', 'positive'],
  ['Evento bem organizado, música excelente e segurança presente. Sai satisfeito.', 'positive'],
  ['Comida deliciosa, ambiente limpo e acolhedor. Um dos melhores restaurantes de São Paulo.', 'positive'],
  ['Parque muito bonito, trilha sinalizada e equipe simpática. Valeu cada centavo.', 'positive'],
  ['Atendentes educados, fila organizada, show fantástico. Perfeito!', 'positive'],
  ['A feira tinha produtos regionais autênticos e preços acessíveis. Adorei cada estande.', 'positive'],
  ['Museu incrível, curadoria impecável e visita guiada muito enriquecedora.', 'positive'],
  ['Passamos o dia inteiro e foi ótimo! Crianças se divertiram muito e adultos também.', 'positive'],
  ['Estrutura excelente, banheiros limpos, estacionamento fácil. Experiência top!', 'positive'],
  // NEGATIVO
  ['Péssimo! Nos assaltaram na saída. Segurança inexistente. Evitem a todo custo.', 'negative'],
  ['Lugar horrível, sujo, com cheiro ruim e atendimento desrespeitoso. Nunca mais.', 'negative'],
  ['Golpe completo! Pagamos caro e não entregaram o que prometeram. Fraude!', 'negative'],
  ['Evento perigoso. Brigas na entrada, segurança sumiu. Registrei boletim de ocorrência.', 'negative'],
  ['Terrível experiência. Fila enorme, estrutura precária e comida horrível.', 'negative'],
  ['Decepcionante. Propaganda enganosa, local abandonado e preço abusivo.', 'negative'],
  ['Cuidado! Roubaram minha carteira lá dentro e a segurança não fez nada.', 'negative'],
  ['Lamentável. Prometeram show de qualidade e foi uma vergonha. Revoltante.', 'negative'],
  ['Ambiente hostil, pessoas agressivas e sem controle de lotação. Descaso total.', 'negative'],
  ['Serviço péssimo, esperamos 2 horas e a comida chegou fria e sem sabor. Inadmissível.', 'negative'],
  // NEUTRO
  ['Fui no fim de semana. Estava cheio mas ok. Preço médio, nada especial.', 'neutral'],
  ['Local razoável. Algumas partes boas, outras precisam de manutenção.', 'neutral'],
  ['Evento comum, não foi nem bom nem ruim. Cumpriu o que prometeu.', 'neutral'],
  ['Visitei na terça de manhã. Pouco movimento, tranquilo, mas sem nada marcante.', 'neutral'],
  ['Estive lá uma vez. Tudo funcionou normalmente, sem maiores problemas ou destaques.', 'neutral'],
  ['O lugar existe há muitos anos e mantém o padrão de sempre. Nem melhorou nem piorou.', 'neutral'],
  ['Fui com amigos. Foi ok. Alguns gostaram mais, outros menos. Experiência dividida.', 'neutral'],
  ['Estrutura básica, serviço dentro do esperado. Nada impressionante.', 'neutral'],
  ['Entrada fácil, ambiente simples, saída tranquila. Cumprimento padrão.', 'neutral'],
  ['Fomos em grupo. A maioria achou mediano. Não recomendaria especialmente.', 'neutral'],
];

// ── Conjunto B — validação (30 frases novas) ──────────────────────────────────
// Escritas depois do léxico e do θ estarem fixados, com vocabulário que o léxico
// não cobre de propósito: gírias, negação, ironia, elogio/crítica sem adjetivo forte.
// Rótulos finais por maioria entre o rótulo inicial e dois anotadores humanos que
// rotularam às cegas (concordância entre os anotadores 88,3%, kappa 0,823;
// ver scripts/rotulagem_cega.py e dados-graficos/rotulagem/).
const SET_B = [
  // POSITIVO
  ['Que lugar gostoso de passar a tarde, saímos de lá com vontade de voltar.', 'positive'],
  ['O pôr do sol visto do mirante vale a viagem inteira, sem exagero.', 'positive'],
  ['Show de primeira, banda afinadíssima e o público cantando junto o tempo todo.', 'positive'],
  ['Restaurante caprichado, porção generosa e o garçom super gente boa.', 'positive'],
  ['Não esperava muito, mas me surpreendeu demais. Já quero ir de novo.', 'positive'],
  ['As crianças não queriam ir embora, programa certeiro para a família.', 'positive'],
  ['Trilha bem cuidada, sinalização clara e uma cachoeira de tirar o fôlego.', 'positive'],
  ['Melhor pastel da cidade, massa sequinha e recheio farto. Nota mil.', 'positive'],
  ['Organização impecável do começo ao fim, dá gosto ver evento assim.', 'positive'],
  ['Atendimento nota dez, resolveram nosso problema na hora com muita educação.', 'positive'],
  // NEGATIVO
  ['Levaram meu celular na fila e ninguém da organização apareceu para ajudar.', 'negative'],
  ['Pagamos ingresso VIP e ficamos espremidos lá atrás sem enxergar o palco.', 'negative'],
  ['Banheiro imundo, sem papel e com fila de quarenta minutos.', 'negative'],
  ['Nunca mais piso lá, fomos tratados com total grosseria na entrada.', 'negative'],
  ['A comida veio crua por dentro e ainda cobraram taxa de serviço.', 'negative'],
  ['Rua escura, sem policiamento, ficamos com medo de voltar para o carro.', 'negative'],
  ['Cobraram o dobro do preço da placa e se recusaram a dar nota fiscal.', 'negative'],
  ['Que furada, o passeio anunciado de três horas durou quarenta minutos.', 'negative'],
  ['Brinquedos quebrados e monitores mexendo no celular em vez de olhar as crianças.', 'negative'],
  ['Esperamos uma hora pela mesa e o lugar estava vazio. Desorganização total.', 'negative'],
  // NEUTRO
  ['O museu fica perto do metrô e a entrada custa vinte reais.', 'neutral'],
  ['Comida normal, preço dentro da média da região.', 'neutral'],
  ['Dá para conhecer em uma hora, não precisa reservar o dia inteiro.', 'neutral'],
  ['Tinha bastante gente no domingo, durante a semana deve ser mais vazio.', 'neutral'],
  // Rotuladas inicialmente como neutras; os dois anotadores humanos marcaram
  // positivo e negativo, respectivamente, e o rótulo final segue a maioria (2 × 1).
  ['O parque é grande, tem lanchonete e aluguel de bicicleta.', 'positive'],
  ['Não é ruim, mas também não achei que vale tanto o hype.', 'neutral'],
  ['O show começou com meia hora de atraso e terminou no horário previsto.', 'negative'],
  ['Algumas atrações estavam fechadas para reforma, as outras funcionando.', 'neutral'],
  ['É um restaurante simples, sem grandes surpresas para o bem ou para o mal.', 'neutral'],
  ['Achei parecido com outros mirantes da cidade, nada muito diferente.', 'neutral'],
];

module.exports = { SET_A, SET_B };
