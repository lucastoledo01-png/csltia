import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { DEFAULT_PROJECT_ID } from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";

/**
 * Etapa 1 — trend intelligence.
 *
 * Varre assuntos em alta e promove **só** os que têm associação visual
 * reproduzível. A pergunta que decide é uma: *dá pra fazer alguém querer
 * refazer isso?*
 *
 * Sem esse filtro o topo do funil enche de tendência que não vira imagem —
 * mudança de política, resultado de eleição, briga de bastidor. Assunto quente
 * que não produz "quero fazer igual" é ruído para este sistema, por mais
 * relevante que seja em outro contexto.
 *
 * O `visual_hook` é a resposta à pergunta, e é obrigatório para promover: uma
 * tendência sem ele passou pela triagem sem ser triada.
 */

/** Fontes aceitas pelo CHECK de `prompt_trends.source`. */
export type FonteDeTendencia = "manual" | "google_trends" | "reddit" | "catalogo_estreias";

export type TendenciaBruta = {
  titulo: string;
  url?: string;
  fonte: FonteDeTendencia;
  categoria?: string;
};

export type TriagemDaTendencia = {
  titulo: string;
  /** 0 a 100 — quanto essa tendência convida a refazer. */
  pontuacao: number;
  /** A associação visual reproduzível. Vazio significa reprovada. */
  visualHook: string;
  motivo: string;
};

/**
 * Google Trends publica RSS por país. É a única fonte pública que não exige
 * chave, o que a torna o padrão razoável — Reddit e catálogo de estreias
 * entram depois, com credencial própria.
 */
const GOOGLE_TRENDS_BR = "https://trends.google.com/trending/rss?geo=BR";

/** Extrai os títulos do RSS. Sem dependência: o formato é raso e estável. */
export function extrairTitulosDeRss(xml: string): string[] {
  const itens = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  return itens
    .map((item) => {
      const m = item.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
      return (m?.[1] ?? m?.[2] ?? "").trim();
    })
    .filter(Boolean);
}

export async function coletarGoogleTrends(
  fetcher: typeof fetch = fetch,
): Promise<TendenciaBruta[]> {
  try {
    const res = await fetcher(GOOGLE_TRENDS_BR, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; desbuguei.ia/1.0)" },
    });
    if (!res.ok) {
      console.warn(`[TRENDS] Google Trends respondeu ${res.status}`);
      return [];
    }

    return extrairTitulosDeRss(await res.text()).map((titulo) => ({
      titulo,
      fonte: "google_trends" as const,
      categoria: "cultura_pop",
    }));
  } catch (err) {
    console.warn("[TRENDS] Falha ao coletar Google Trends:", err);
    return [];
  }
}

const SYSTEM_TRIAGEM = `
Você tria tendências para uma conta que ensina a criar imagens com IA.

Sua única pergunta é: **essa tendência dá pra fazer alguém querer refazer com
uma imagem?** Não interessa se o assunto é importante, polêmico ou popular —
interessa se produz vontade de "quero fazer igual com a minha cara / meu bairro
/ meu pet / meu produto".

APROVE quando existir associação visual reproduzível: estética marcante, mundo
visual reconhecível, tipo de retrato, época, atmosfera.

REPROVE quando a tendência for só informação: política, economia, resultado
esportivo, tragédia, briga pública, morte, doença. Nenhuma delas produz "quero
fazer igual", e várias seriam de mau gosto como base de conteúdo divertido.

Para cada tendência, responda EXCLUSIVAMENTE com o JSON:
{
  "tendencias": [
    {
      "titulo": "exatamente como recebeu",
      "pontuacao": 0 a 100,
      "visual_hook": "a associação visual reproduzível, em uma frase — vazio se reprovada",
      "motivo": "uma frase dizendo por que aprovou ou reprovou"
    }
  ]
}
`.trim();

/**
 * Passa as tendências pela triagem por LLM.
 *
 * Em lote, numa chamada: são títulos curtos e a decisão de cada um não depende
 * dos outros, então N chamadas só multiplicariam custo e latência.
 */
export async function triarTendencias(
  brutas: TendenciaBruta[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<TriagemDaTendencia[]> {
  if (brutas.length === 0) return [];

  const { triageModel } = getAIProviderConfig(env);

  const { data } = await callOpenAIJSON<{ tendencias?: unknown[] }>(
    [
      { role: "system", content: SYSTEM_TRIAGEM },
      {
        role: "user",
        content: `Trie estas tendências:\n${brutas.map((t) => `- ${t.titulo}`).join("\n")}`,
      },
    ],
    triageModel,
    env,
    fetcher,
  );

  const lista = Array.isArray(data?.tendencias) ? data.tendencias : [];

  return lista
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        titulo: String(o.titulo ?? "").trim(),
        pontuacao: Math.max(0, Math.min(100, Number(o.pontuacao ?? 0) || 0)),
        visualHook: String(o.visual_hook ?? "").trim(),
        motivo: String(o.motivo ?? "").trim(),
      };
    })
    .filter((t) => t.titulo);
}

/**
 * Coleta, tria e grava.
 *
 * Grava **tudo**, aprovada ou não: `candidate` quando tem gancho visual,
 * `rejected` quando não tem. A reprovada é registro útil — evita reavaliar a
 * mesma tendência amanhã e deixa auditar a triagem, que é onde o critério pode
 * estar apertado ou frouxo demais.
 *
 * `minimoParaPromover` é o piso de pontuação. Gancho visual sem pontuação é
 * tendência que dá imagem mas não dá vontade.
 */
export async function coletarETriarTendencias(options: {
  extras?: TendenciaBruta[];
  minimoParaPromover?: number;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
} = {}): Promise<{ coletadas: number; candidatas: number; reprovadas: number }> {
  const { extras = [], minimoParaPromover = 50, env = process.env, fetcher = fetch } = options;

  const brutas = [...(await coletarGoogleTrends(fetcher)), ...extras];
  if (brutas.length === 0) return { coletadas: 0, candidatas: 0, reprovadas: 0 };

  const triadas = await triarTendencias(brutas, env, fetcher);
  const porTitulo = new Map(brutas.map((b) => [b.titulo.toLowerCase(), b]));

  const supabase = getSupabaseAdminClient();
  let candidatas = 0;
  let reprovadas = 0;

  for (const t of triadas) {
    const bruta = porTitulo.get(t.titulo.toLowerCase());
    const aprovada = Boolean(t.visualHook) && t.pontuacao >= minimoParaPromover;

    const { error } = await supabase.from("prompt_trends").insert({
      project_id: DEFAULT_PROJECT_ID,
      source: bruta?.fonte ?? "manual",
      raw_title: t.titulo,
      category: bruta?.categoria ?? "geral",
      opportunity_score: t.pontuacao,
      visual_hook: t.visualHook || null,
      status: aprovada ? "candidate" : "rejected",
      notes: t.motivo || null,
      raw_url: bruta?.url ?? null,
    });

    if (error) {
      console.warn(`[TRENDS] Falha ao gravar "${t.titulo}": ${error.message}`);
      continue;
    }

    if (aprovada) candidatas += 1;
    else reprovadas += 1;
  }

  return { coletadas: brutas.length, candidatas, reprovadas };
}
