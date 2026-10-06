import type { SupabaseClient } from "@supabase/supabase-js";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { conferirImagem } from "../visual/conferencia-visual";
import type { LivroDeCustos } from "./custos";
import { reunirFontesDaMateria, type CandidataIrma } from "./fontes-da-materia";

/**
 * As ligações do ramo do portal com o mundo, para a matéria profunda
 * (06/10/2026): as fontes irmãs lidas de `news_candidates` e a descrição da
 * foto da capa. O ramo recebe as duas como funções, e o teste troca por
 * funções de mentira.
 */

/** O que o ampliador precisa da pauta: a URL, o título, o veículo, o vetor e o grupo da deduplicação. */
export type PautaParaAmpliar = {
  storyId: string;
  vetor: number[] | null;
  grupo: { primary: { url: string; title: string; source_name: string }; secondary_urls?: string[] };
};

export type AmpliadorDePacote = (pauta: PautaParaAmpliar, pacote: PacoteFactual) => Promise<{ pacote: PacoteFactual; linhasDeLog: string[] }>;

/** Quantos dias de candidatas procurar o mesmo fato: o de hoje e os dois anteriores. */
export const DIAS_DE_IRMAS = 3;

type LinhaDeCandidata = {
  url: string | null;
  canonical_url: string | null;
  title: string | null;
  source_domain: string | null;
  embedding: number[] | string | null;
  is_immigration: boolean | null;
  editorial_axis: string | null;
};

function vetorDaLinha(e: LinhaDeCandidata["embedding"]): number[] | null {
  if (Array.isArray(e)) return e;
  // O PostgREST pode devolver o `vector` como texto "[0.1,...]", conforme a versão.
  if (typeof e === "string" && e.startsWith("[")) {
    try {
      const v = JSON.parse(e) as unknown;
      return Array.isArray(v) ? (v as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * As candidatas com vetor entre duas datas de publicação, só com as colunas
 * que a busca do mesmo fato usa. Leitura própria, e não `buscarDaJanela`, que
 * traz a linha inteira: o vetor tem 1536 números e a janela passa de mil
 * linhas. Falha é lista vazia.
 */
export async function candidatasComVetor(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  desde: Date,
  ate: Date,
): Promise<CandidataIrma[]> {
  const saida: CandidataIrma[] = [];
  const PAGINA = 500;
  try {
    for (let inicio = 0; inicio < 5000; inicio += PAGINA) {
      const { data, error } = await client
        .from("news_candidates")
        .select("url, canonical_url, title, source_domain, embedding, is_immigration, editorial_axis")
        .eq("project_id", projectId)
        .not("embedding", "is", null)
        .gte("published_at", desde.toISOString())
        .lte("published_at", ate.toISOString())
        .order("published_at", { ascending: false })
        .range(inicio, inicio + PAGINA - 1);
      if (error) break;
      const linhas = (data ?? []) as LinhaDeCandidata[];
      for (const l of linhas) {
        const vetor = vetorDaLinha(l.embedding);
        const url = l.canonical_url || l.url;
        if (!vetor || !url) continue;
        saida.push({
          url,
          titulo: l.title ?? "",
          nome: l.source_domain ?? undefined,
          vetor,
          imigracao: l.is_immigration === true || l.editorial_axis === "imigracao",
        });
      }
      if (linhas.length < PAGINA) break;
    }
  } catch {
    // Sem a janela, a matéria segue com o grupo e com a fonte primária citada.
  }
  return saida;
}

/**
 * O ampliador de produção: lê a janela de candidatas UMA vez por ciclo (o
 * ramo escreve até três matérias) e junta as fontes de cada pauta. Falha de
 * leitura da janela não é falha da matéria: ela segue com o grupo e com a
 * fonte primária citada.
 */
export function criarAmpliadorDePacote(opcoes: {
  client: SupabaseClient;
  projectId: string;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  livro?: LivroDeCustos;
  limiar?: number;
  /** A janela das candidatas; ausente, os últimos `DIAS_DE_IRMAS` dias até agora. */
  janela?: { desde: Date; ate: Date };
}): AmpliadorDePacote {
  let janela: Promise<CandidataIrma[]> | null = null;
  const lerJanela = () => {
    const ate = opcoes.janela?.ate ?? new Date();
    const desde = opcoes.janela?.desde ?? new Date(ate.getTime() - DIAS_DE_IRMAS * 86_400_000);
    janela ??= candidatasComVetor(opcoes.client, opcoes.projectId, desde, ate);
    return janela;
  };
  return async (pauta, pacote) => {
    const candidatas = await lerJanela();
    const r = await reunirFontesDaMateria({
      principal: {
        url: pauta.grupo.primary.url,
        titulo: pauta.grupo.primary.title,
        nome: pauta.grupo.primary.source_name,
        vetor: pauta.vetor,
        pacote,
      },
      urlsDoGrupo: pauta.grupo.secondary_urls ?? [],
      candidatas,
      limiar: opcoes.limiar,
      env: opcoes.env,
      fetcher: opcoes.fetcher,
      livro: opcoes.livro,
    });
    return { pacote: r.pacote, linhasDeLog: r.linhasDeLog };
  };
}

/**
 * A descrição da foto da capa, pela conferência visual chamada SEM a
 * manchete (regra de 06/10/2026: com a manchete, o modelo "via" Chicago numa
 * foto qualquer de prédios). Quem chama passa a descrição pela ancoragem
 * (`legendaDaFoto`) antes de usar. Falha é `null`, e a legenda vira neutra.
 */
export async function descreverCapaSemManchete(url: string, env: Record<string, string | undefined> = process.env): Promise<string | null> {
  try {
    const v = await conferirImagem(
      { imageUrl: url, sourceAssetId: "", imageContextType: "conceptual" },
      { titulo: "Descreva apenas o que a foto mostra, sem supor lugar, pessoa ou data que ela não deixe evidente." },
      { env },
    );
    return v.falhou ? null : v.descricao || null;
  } catch {
    return null;
  }
}
