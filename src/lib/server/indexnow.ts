import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { MARCA } from "@/lib/marca";
import { editoriaPeloNome, hrefDaEditoria } from "@/lib/editorias";

/**
 * O IndexNow (06/10/2026): avisar Bing e Yandex, e pelo Bing a busca do
 * ChatGPT e do Copilot, que uma matéria foi publicada, mudou ou saiu.
 *
 * Sem o aviso, o portal espera o rastreador passar, e uma matéria de notícia
 * perde valor em horas. O protocolo é um POST com a lista de endereços e uma
 * chave que o próprio site serve em `/<chave>.txt`, a prova de que quem avisa
 * é dono do domínio. O Google não participa e ignora ping de sitemap desde
 * 2023, então não há ping para ele.
 *
 * As regras, e por quê:
 * - **Sem `INDEXNOW_KEY`, nada acontece**, e o log diz isso UMA vez por
 *   processo. O recurso nasce desligado até o dono pôr a chave no EasyPanel.
 * - **Nunca segura a publicação.** Quem publica chama `avisarSemEsperar`, que
 *   roda depois da resposta (`after`) e engole qualquer erro. Prazo curto.
 * - **Falha vai para o banco**, `platform_events` do tipo `indexnow_falhou`,
 *   com o status e os endereços: log de contêiner é inalcançável aqui.
 * - **Avisa a matéria, a página da editoria e a home**, porque as três mudam
 *   quando uma matéria entra ou sai.
 */

export const ENDPOINT_DO_INDEXNOW = "https://api.indexnow.org/indexnow";
const TEMPO_LIMITE_MS = 5000;

/*
 * Só letra e número: o protocolo aceita também hífen, mas a chave vira o nome
 * de um arquivo na raiz do site (`/<chave>.txt`, pela reescrita do
 * `next.config.ts`), e uma regra estreita não engole caminho nenhum por
 * acidente. `openssl rand -hex 32` gera uma chave que cabe aqui.
 */
const FORMATO_DA_CHAVE = /^[A-Za-z0-9]{8,128}$/;

let jaAvisouSemChave = false;

/** A chave do ambiente, ou `null` quando ausente ou fora do formato. */
export function chaveDoIndexNow(env: Record<string, string | undefined> = process.env): string | null {
  const chave = (env.INDEXNOW_KEY ?? "").trim();
  return FORMATO_DA_CHAVE.test(chave) ? chave : null;
}

/** O endereço do arquivo da chave, que o protocolo chama de `keyLocation`. */
export function enderecoDaChave(chave: string, site: string = MARCA.site): string {
  return `${site.replace(/\/+$/, "")}/${chave}.txt`;
}

/** Os endereços que mudam quando estas matérias entram ou saem: cada uma, a editoria dela e a home. */
export function enderecosDoAviso(materias: Array<{ slug: string; category?: string | null }>, site: string = MARCA.site): string[] {
  const base = site.replace(/\/+$/, "");
  const urls: string[] = [];
  for (const m of materias) {
    if (!m.slug) continue;
    urls.push(`${base}/artigos/${encodeURIComponent(m.slug)}`);
    const editoria = editoriaPeloNome(m.category ?? "");
    if (editoria) urls.push(`${base}${hrefDaEditoria(editoria.id)}`);
  }
  if (urls.length > 0) urls.push(base);
  return [...new Set(urls)];
}

export type ResultadoDoAviso = {
  situacao: "enviado" | "sem_chave" | "nada_a_avisar" | "falhou";
  status?: number;
  urls: string[];
  detalhe?: string;
};

/**
 * O POST do protocolo. Devolve o que aconteceu e nunca lança. 200 e 202 são
 * aceite (o 202 quer dizer que a chave ainda vai ser conferida).
 */
export async function enviarAoIndexNow(
  urls: string[],
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; site?: string; tempoLimiteMs?: number } = {},
): Promise<ResultadoDoAviso> {
  const chave = chaveDoIndexNow(opcoes.env ?? process.env);
  if (!chave) {
    if (!jaAvisouSemChave) {
      jaAvisouSemChave = true;
      console.log("[INDEXNOW] sem INDEXNOW_KEY válida no ambiente: os buscadores não são avisados (o resto segue igual).");
    }
    return { situacao: "sem_chave", urls };
  }
  if (urls.length === 0) return { situacao: "nada_a_avisar", urls };
  const site = (opcoes.site ?? MARCA.site).replace(/\/+$/, "");
  try {
    const r = await (opcoes.fetcher ?? fetch)(ENDPOINT_DO_INDEXNOW, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(site).host, key: chave, keyLocation: enderecoDaChave(chave, site), urlList: urls }),
      signal: AbortSignal.timeout(opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS),
    });
    if (r.status === 200 || r.status === 202) return { situacao: "enviado", status: r.status, urls };
    const corpo = await r.text().catch(() => "");
    return { situacao: "falhou", status: r.status, urls, detalhe: corpo.slice(0, 300) };
  } catch (erro) {
    return { situacao: "falhou", urls, detalhe: erro instanceof Error ? erro.message : String(erro) };
  }
}

/**
 * Avisa os buscadores sobre estas matérias, lendo a editoria de cada uma no
 * banco, e grava a falha em `platform_events`. Nunca lança. Sem chave, não lê
 * nem escreve nada.
 */
export async function avisarBuscadores(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  slugs: string[],
  motivo: string,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): Promise<ResultadoDoAviso> {
  const env = opcoes.env ?? process.env;
  const unicos = [...new Set(slugs.filter(Boolean))];
  if (!chaveDoIndexNow(env)) return enviarAoIndexNow([], { env });
  if (unicos.length === 0) return { situacao: "nada_a_avisar", urls: [] };

  let materias: Array<{ slug: string; category?: string | null }> = unicos.map((slug) => ({ slug }));
  try {
    const { data } = await client.from("articles").select("slug, category").eq("project_id", projectId).in("slug", unicos);
    const porSlug = new Map(((data ?? []) as Array<{ slug: string; category: string | null }>).map((m) => [m.slug, m.category]));
    materias = unicos.map((slug) => ({ slug, category: porSlug.get(slug) ?? null }));
  } catch {
    // Sem a editoria, avisa a matéria e a home: é melhor que não avisar.
  }

  const r = await enviarAoIndexNow(enderecosDoAviso(materias), { env, fetcher: opcoes.fetcher });
  if (r.situacao === "falhou") {
    console.warn(`[INDEXNOW] aviso falhou (${motivo}): ${r.status ?? "sem resposta"} ${r.detalhe ?? ""}`);
    try {
      await client.from("platform_events").insert({
        project_id: projectId,
        event_type: "indexnow_falhou",
        payload: { motivo, status: r.status ?? null, detalhe: r.detalhe ?? "", urls: r.urls },
      });
    } catch {
      // O registro da falha não pode virar falha de quem publicou.
    }
  }
  return r;
}

/**
 * O aviso SEM esperar, para quem publica. Dentro de uma requisição roda no
 * `after` (o processo não o mata ao responder, que é o suspeito registrado no
 * incidente do Telegram); fora dela (script, teste) vira promessa solta. Em
 * nenhum caso lança nem atrasa a publicação.
 */
export function avisarSemEsperar(
  client: Pick<SupabaseClient, "from">,
  projectId: string,
  slugs: string[],
  motivo: string,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {},
): void {
  if (slugs.length === 0 || !chaveDoIndexNow(opcoes.env ?? process.env)) {
    // Sem chave: o aviso único do log sai daqui mesmo, sem agendar nada.
    if (slugs.length > 0) void enviarAoIndexNow([], opcoes);
    return;
  }
  const tarefa = async () => {
    await avisarBuscadores(client, projectId, slugs, motivo, opcoes).catch(() => undefined);
  };
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

/** Só para os testes: o aviso de "sem chave" volta a valer. */
export function _reiniciarAvisoSemChave(): void {
  jaAvisouSemChave = false;
}
