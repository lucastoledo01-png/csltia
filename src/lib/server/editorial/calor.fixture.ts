import type { PautaAvaliada } from "./guarda";

/** Pauta avaliada mínima para os testes do calor. */
let n = 0;
export function pautaDeTeste(e: {
  titulo: string;
  nota: number;
  atores?: string[];
  url?: string;
  secundarias?: string[];
  publicadoEm?: string;
  storyId?: string;
}): PautaAvaliada {
  n += 1;
  return {
    grupo: {
      primary: {
        id: `c${n}`,
        url: e.url ?? `https://veiculo${n}.com/materia`,
        title: e.titulo,
        source_name: "Fonte",
        priority: 1,
        published_at: e.publicadoEm ?? "2026-10-06T10:00:00Z",
        description: "",
        content: "",
        category: "geral",
        score: 0,
        dedupe_key: `k${n}`,
      },
      secondary_sources: [],
      secondary_urls: e.secundarias ?? [],
    } as never,
    storyId: e.storyId ?? `s${n}`,
    classificacao: {
      id: `c${n}`,
      pais: "EUA",
      imigracao: false,
      leitura: "oportunidade",
      eixo: "economia",
      natureza: "official_action",
      relevancia: 7,
      atores: e.atores ?? [],
      lugares: [],
      acontecimento: [],
      justificativa: "",
    },
    enriquecimento: { texto: "", origem: "feed", caracteres: 0 } as never,
    motivoDaAprovacao: "APPROVED_US_OPPORTUNITY" as never,
    veredito: { repetida: false } as never,
    pontuacao: { total: e.nota, partes: {} as never, explicacao: `${e.nota}` },
    vetor: null,
  };
}

