import type { InstagramSlide } from "@/lib/server/social/instagram/schemas";

/**
 * Os moldes que o feed realmente usa, e só eles.
 *
 * A tela de design mostrava os três FORMATOS de carrossel do projeto anterior,
 * notícia, tutorial e prompt, com as cores e o chapéu daquela marca. Dois deles
 * não saem desde que isto virou um jornal diário sobre os EUA, e o terceiro sai
 * como post de imagem única. Abrir o painel e ver cartão laranja de tutorial é
 * o painel mentindo sobre o que a esteira produz.
 *
 * Aqui os moldes são as decisões que o ritmo do dia toma de verdade, e cada um
 * corresponde a uma variante que `varianteDaCapa` e a bolha podem escolher:
 *
 *   jornal        `capa_jornal` sem a segunda foto
 *   jornal_bolha  `capa_jornal` com a segunda foto em círculo
 *   recorte       `recorte_post`, o formato de post de rede social
 *   sem_foto      `noticia_sem_foto`, que é o dia em que a busca não achou nada
 *
 * O quarto não foi pedido e está aqui de propósito: ele é o que vai ao ar
 * quando nenhuma foto passa pelas barreiras, e em 18/09/2026 foi a edição
 * inteira. Um painel que só mostra os moldes do dia bom esconde exatamente o
 * molde que aparece no dia ruim.
 */

export type MoldeDePost = {
  id: "jornal" | "jornal_bolha" | "recorte" | "sem_foto";
  nome: string;
  explica: string;
  /** Quando o ritmo do dia escolhe este molde. */
  quando: string;
  variante: string;
  comFoto: boolean;
  comBolha: boolean;
};

export const MOLDES: MoldeDePost[] = [
  {
    id: "jornal",
    nome: "Jornal",
    explica: "Foto sangrando, degradê e manchete em caixa alta embaixo.",
    quando: "O padrão. Toda pauta com foto aprovada.",
    variante: "capa_jornal",
    comFoto: true,
    comBolha: false,
  },
  {
    id: "jornal_bolha",
    nome: "Jornal com bolha",
    explica: "O mesmo jornal, com a segunda foto em círculo sobre o degradê.",
    quando: "Quando o resolvedor aprova uma segunda foto para a mesma pauta.",
    variante: "capa_jornal",
    comFoto: true,
    comBolha: true,
  },
  {
    id: "recorte",
    nome: "Recorte",
    explica: "Fundo claro, texto corrido em caixa baixa, foto como cartão no meio da fala.",
    quando: "Pauta que pede leitura, e não só o fato. Exige foto.",
    variante: "recorte_post",
    comFoto: true,
    comBolha: false,
  },
  {
    id: "sem_foto",
    nome: "Sem foto",
    explica: "Capa tipográfica, com o chapéu de editoria no topo.",
    quando: "Reserva: nenhuma foto passou pelas barreiras do dia.",
    variante: "noticia_sem_foto",
    comFoto: false,
    comBolha: false,
  },
];

/**
 * A foto de exemplo, desenhada aqui dentro.
 *
 * Nem URL da rede nem arquivo em `public`: o preview precisa funcionar com o
 * painel aberto em qualquer lugar, inclusive antes de existir edição do dia, e
 * uma foto que não carrega deixa o molde do jornal parecendo um retângulo
 * cinza, que é justamente o que o dono viu e reclamou.
 */
function fotoDeExemplo(escura: boolean): string {
  const svg = escura
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 533"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7b8c"/><stop offset="0.55" stop-color="#3f4a56"/><stop offset="1" stop-color="#23292f"/></linearGradient></defs><rect width="400" height="533" fill="url(#g)"/><path d="M0 400 L120 300 L210 370 L300 290 L400 360 L400 533 L0 533 Z" fill="#1b2026" opacity="0.65"/><path d="M0 450 L90 390 L200 450 L310 380 L400 440 L400 533 L0 533 Z" fill="#12161a" opacity="0.8"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9d4de"/><stop offset="1" stop-color="#8d9aa6"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><rect x="40" y="150" width="90" height="110" fill="#6f7d8a"/><rect x="150" y="120" width="70" height="140" fill="#5c6975"/><rect x="240" y="170" width="110" height="90" fill="#7e8b97"/><circle cx="330" cy="70" r="30" fill="#eef2f5" opacity="0.6"/></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * O conteúdo de exemplo é uma manchete real de setembro, e não "lorem ipsum".
 *
 * Texto de mentira esconde o defeito que importa nesta tela: manchete curta e
 * manchete longa não cabem no mesmo corpo de letra, e é o desenho reagindo ao
 * tamanho real que diz se o molde está de pé.
 */
export function slideDeExemplo(molde: MoldeDePost): InstagramSlide {
  return {
    index: 1,
    type: "cover",
    eyebrow: "Custo de vida",
    title:
      "Compradores de imóveis ganham margem de negociação com vendas no menor nível em quase três anos",
    /*
     * O corpo só no recorte, e destaque em nenhum, porque é isso que
     * `montarCapaDoPost` monta para o post único: a capa de jornal recebe
     * manchete e foto, e `highlight_text` só é preenchido em carrossel. Um
     * exemplo mais generoso que a produção mostraria uma peça que não existe.
     */
    body:
      molde.id === "recorte"
        ? "As vendas de casas usadas caíram ao menor nível desde 2023. Quem continua procurando encontra mais espaço para negociar preço e prazo."
        : "",
    bullet_points: [],
    highlight_text: "",
    variant: molde.variante,
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: molde.comFoto ? fotoDeExemplo(molde.id !== "recorte") : "",
    inset_image_url: molde.comBolha ? fotoDeExemplo(false) : undefined,
    cta_text: "",
  };
}
