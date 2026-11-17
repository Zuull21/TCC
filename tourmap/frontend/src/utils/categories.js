// Nome de exibição das categorias (o banco guarda sem acento: "musica")
export const CATEGORY_LABELS = {
  musica: 'Música',
  cultura: 'Cultura',
  esporte: 'Esporte',
  gastronomia: 'Gastronomia',
  natureza: 'Natureza',
  arte: 'Arte',
};

export const categoryLabel = (c) => CATEGORY_LABELS[c] || c;
