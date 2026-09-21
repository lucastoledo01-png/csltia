/**
 * O projeto como o painel o enxerga.
 *
 * É a forma exata que `/api/admin/projetos` devolve, e mora aqui porque três
 * telas precisam dela: a home, que desenha os cards, a área do projeto, que
 * resolve o slug da URL, e o bloco de capacidades.
 */

export const ESTADOS_DE_CAPACIDADE = ["off", "dry_run", "enforce"] as const;
export type EstadoDeCapacidade = (typeof ESTADOS_DE_CAPACIDADE)[number];

export type ProjetoDoPainel = {
  id: string;
  slug: string;
  nome: string;
  status: string;
  nicho: string;
  timezone: string;
  siteUrl: string | null;
  marca: { nome: string; cor: string; logoUrl: string | null };
  /** Só o que o projeto declara. Ausente quer dizer "herda do servidor". */
  capacidades: Partial<Record<string, EstadoDeCapacidade>>;
};

export type RespostaDeProjetos = {
  ok: boolean;
  error?: string;
  capacidades?: string[];
  projetos?: ProjetoDoPainel[];
};

export const ROTULO_DA_CAPACIDADE: Record<string, string> = {
  coleta: "Coleta de notícias",
  newsletter: "Newsletter",
  social: "Posts no Instagram",
  evergreen: "Conteúdo permanente",
  visual: "Imagem com licença",
  keyword: "Funil de keyword",
  landing: "Landing page",
};

export const ROTULO_DO_ESTADO: Record<EstadoDeCapacidade, string> = {
  off: "Desligado",
  dry_run: "Ensaio",
  enforce: "No ar",
};
