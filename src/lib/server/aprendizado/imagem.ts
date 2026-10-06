import type { Reprovacao } from "../aprovacao/fila-store";
import { identidadeDaFoto } from "../prompt-system/stock";
import { temFotoDaPauta, type FotosDoDia } from "../ramos/sem-foto";
import type { ResultadoVisual } from "../visual/tipos";

/**
 * O resolvedor de imagem de cada canal aprende com as fotos recusadas NAQUELE
 * canal (06/10/2026).
 *
 * Duas coisas, e as duas sem tocar nos outros canais:
 *
 *   1. A foto recusada no canal nunca mais é escolhida nele. A identidade é a
 *      do arquivo, sem os parâmetros de entrega (`identidadeDaFoto`), porque a
 *      mesma foto chega com URLs diferentes conforme o tamanho.
 *   2. O motivo do editor vai para a pergunta da cena (`cena-da-pauta.ts`),
 *      para a busca mudar de assunto e não só de arquivo: "skyline genérico"
 *      recusado três vezes pede outra cena, não outro skyline.
 *
 * A foto de uma pauta é resolvida UMA vez para os três canais. Por isso o
 * bloqueio de um canal não entra na resolução compartilhada: entraria nos
 * outros dois. Ele entra DEPOIS, em `fotosDoCanal`: quando a foto
 * compartilhada é uma que este canal recusou, só este canal resolve outra.
 */

/** Quantos motivos de imagem vão para a pergunta da cena. Mais que isso vira ruído. */
const MOTIVOS_PARA_A_CENA = 4;

export type AprendizadoDaImagem = {
  /** Identidades (`identidadeDaFoto`) que este canal recusou. */
  evitar: string[];
  /** Os motivos das recusas de imagem deste canal, mais recentes primeiro. */
  motivos: string[];
};

export function aprendizadoDaImagemVazio(): AprendizadoDaImagem {
  return { evitar: [], motivos: [] };
}

/** Lê das reprovações de IMAGEM de um canal. Outra etapa não conta. */
export function aprendizadoDaImagem(reprovacoes: Pick<Reprovacao, "etapa" | "motivo" | "detalhes">[]): AprendizadoDaImagem {
  const evitar = new Set<string>();
  const motivos: string[] = [];
  for (const r of reprovacoes) {
    if (r.etapa !== "imagem") continue;
    for (const f of r.detalhes?.fotos ?? []) {
      const id = identidadeDaFoto(f);
      if (id) evitar.add(id);
    }
    const m = r.motivo.replace(/\s+/g, " ").trim();
    if (m && motivos.length < MOTIVOS_PARA_A_CENA && !motivos.includes(m)) motivos.push(m.slice(0, 160));
  }
  return { evitar: [...evitar], motivos };
}

/**
 * O que a refação de imagem passa ao resolvedor: a foto de agora, todas as
 * recusadas no canal, e os motivos (o desta reprovação primeiro) para a cena.
 */
export function imagemNaRefacao(
  atuais: string[],
  motivo: string,
  ap?: AprendizadoDaImagem | null,
): { evitar: string[]; recusas: string[] } {
  const evitar = [...new Set([...atuais.filter(Boolean), ...(ap?.evitar ?? [])])];
  const recusas = [...new Set([motivo.trim(), ...(ap?.motivos ?? [])].filter(Boolean))].slice(0, MOTIVOS_PARA_A_CENA);
  return { evitar, recusas };
}

/** A foto nova serve? Não pode ser a de agora nem uma que o canal já recusou. */
export function fotoNovaServe(nova: string, atuais: string[], evitar: string[]): boolean {
  if (!nova) return false;
  const id = identidadeDaFoto(nova);
  // `evitar` mistura URL e identidade; `identidadeDaFoto` de uma identidade devolve ela mesma.
  return ![...atuais, ...evitar].some((a) => a && identidadeDaFoto(a) === id);
}

export function fotoRecusadaNoCanal(url: string | null | undefined, ap: AprendizadoDaImagem): boolean {
  if (!url || ap.evitar.length === 0) return false;
  return ap.evitar.includes(identidadeDaFoto(url));
}

/**
 * Um resultado do resolvedor, visto por UM canal: a foto que o canal recusou é
 * trocada por outra resolução (só para este canal), e se a outra também for
 * recusada a pauta fica sem foto aqui, com o motivo `RECENTLY_USED`, que é o
 * que ela é para este canal. Pauta sem foto não vira conteúdo (05/10/2026).
 */
export async function comFotoDoCanal(
  resultado: ResultadoVisual,
  ap: AprendizadoDaImagem,
  reresolver: () => Promise<ResultadoVisual>,
): Promise<ResultadoVisual> {
  if (!fotoRecusadaNoCanal(resultado.asset?.imageUrl, ap)) return resultado;
  const novo = await reresolver();
  if (!fotoRecusadaNoCanal(novo.asset?.imageUrl, ap)) return novo;
  return { ...novo, asset: null, assetSecundario: null, status: "NO_VALID_IMAGE", motivo: "RECENTLY_USED", legenda: "" };
}

/**
 * A memória de fotos do dia, vista por UM canal.
 *
 * Sem nada a evitar devolve a mesma memória: o canal sem recusa de imagem
 * lê a foto compartilhada como antes. Com algo a evitar, a foto compartilhada
 * que este canal recusou é trocada, só aqui, pelo `reresolver` (que resolve
 * ignorando o reuso e com a identidade recusada fora).
 */
export function fotosDoCanal<P>(
  base: FotosDoDia<P>,
  chave: (p: P) => string,
  ap: AprendizadoDaImagem,
  reresolver: (p: P) => Promise<ResultadoVisual | null>,
): FotosDoDia<P> {
  if (ap.evitar.length === 0) return base;
  const proprias = new Map<string, Promise<{ visual: ResultadoVisual | null; erro?: string }>>();
  const prontas = new Map<string, ResultadoVisual | null>();

  const resultado = async (p: P) => {
    const r = await base.resultado(p);
    if (!fotoRecusadaNoCanal(r.visual?.asset?.imageUrl, ap)) return r;
    const k = chave(p);
    let promessa = proprias.get(k);
    if (!promessa) {
      promessa = (async () => {
        try {
          const visual = await reresolver(p);
          // A nova também não pode ser uma recusada: resolvedor sem saída devolve "sem foto".
          const limpa = fotoRecusadaNoCanal(visual?.asset?.imageUrl, ap) ? null : visual;
          prontas.set(k, limpa);
          return limpa ? { visual: limpa } : { visual: null, erro: "a única foto achada já foi recusada neste canal" };
        } catch (erro) {
          prontas.set(k, null);
          return { visual: null, erro: erro instanceof Error ? erro.message : String(erro) };
        }
      })();
      proprias.set(k, promessa);
    }
    return promessa;
  };

  return {
    resultado,
    temFoto: async (p) => temFotoDaPauta((await resultado(p)).visual),
    jaResolvido: (storyId) => {
      if (prontas.has(storyId)) return prontas.get(storyId);
      const r = base.jaResolvido(storyId);
      // A compartilhada recusada aqui não serve como "já resolvida": quem pergunta tem de chamar `resultado`.
      return r && fotoRecusadaNoCanal(r.asset?.imageUrl, ap) ? undefined : r;
    },
  };
}
