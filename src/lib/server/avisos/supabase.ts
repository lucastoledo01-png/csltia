import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarAlerta } from "../alerts";
import { linhaParaAprovacao } from "../aprovacao/fila-store";
import type {
  DadosDoDia,
  DepsDosAvisos,
  LeitorDosAvisos,
  LinhaDaFila,
  RegistroDosAvisos,
} from "./avisos";

/**
 * Os avisos contra o banco de verdade, e o envio pelo `alerts.ts`.
 *
 * Só leitura nas tabelas de conteúdo. A única escrita é a linha do próprio
 * aviso em `platform_events`, que não pede DDL: a tabela já tem `event_type`,
 * `payload` jsonb e `project_id`, como o diagnóstico do social.
 */

export const EVENTO_DO_AVISO = "aviso_operacional";

/**
 * Quantas tentativas de envio uma chave aceita antes de desistir.
 *
 * Um erro de rede passageiro merece outra tentativa no minuto seguinte. Um
 * canal quebrado não merece sessenta linhas de falha por hora: na terceira, o
 * aviso desiste e as três linhas ficam no banco dizendo por quê.
 */
export const TENTATIVAS_POR_AVISO = 3;

type Cliente = Pick<SupabaseClient, "from">;

function falhou(o: string, mensagem: string): never {
  throw new Error(`avisos: não consegui ${o}: ${mensagem}`);
}

export function criarRegistroDosAvisos(cliente: Cliente): RegistroDosAvisos {
  return {
    async jaFeito(projectId, chave) {
      const { data, error } = await cliente
        .from("platform_events")
        .select("payload")
        .eq("project_id", projectId)
        .eq("event_type", EVENTO_DO_AVISO)
        .eq("payload->>chave", chave)
        .limit(TENTATIVAS_POR_AVISO + 1);
      // Não conseguir olhar NÃO é "não foi feito": mandaria o aviso a cada minuto.
      if (error) falhou("ler o registro dos avisos", error.message);
      const linhas = (data ?? []) as Array<{ payload: { enviado?: unknown } | null }>;
      return linhas.some((l) => l.payload?.enviado === true) || linhas.length >= TENTATIVAS_POR_AVISO;
    },
    async gravar(projectId, registro) {
      const { error } = await cliente
        .from("platform_events")
        .insert({ event_type: EVENTO_DO_AVISO, project_id: projectId, payload: registro });
      if (error) console.error(`[AVISOS] registro não gravado (${registro.chave}): ${error.message}`);
    },
  };
}

function comoLinhaDaFila(l: Record<string, unknown>): LinhaDaFila {
  const a = linhaParaAprovacao(l);
  return {
    ramo: a.ramo,
    estado: a.estado,
    publicarEm: a.publicarEm,
    liberadoEm: a.liberadoEm,
    titulo: a.resumo.titulo ?? null,
  };
}

const NUMERO = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function criarLeitorDosAvisos(cliente: Cliente): LeitorDosAvisos {
  return {
    async filaEntre(projectId, inicioIso, fimIso) {
      const { data, error } = await cliente
        .from("aprovacoes")
        .select("*")
        .eq("project_id", projectId)
        .gte("publicar_em", inicioIso)
        .lt("publicar_em", fimIso)
        .limit(500);
      if (error) falhou("ler a fila", error.message);
      return ((data ?? []) as Array<Record<string, unknown>>).map(comoLinhaDaFila);
    },

    async producaoDeixouLinha(projectId, prefixos, desdeIso) {
      const filtro = prefixos.map((p) => `idempotency_key.like.${p}*`).join(",");
      const { count, error } = await cliente
        .from("newsroom_runs")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .gte("created_at", desdeIso)
        .or(filtro);
      // Leitura falha não é "não rodou": seria um alerta crítico falso.
      if (error) falhou("ler newsroom_runs", error.message);
      return (count ?? 0) > 0;
    },

    async dadosDoDia(projectId, dia, inicioIso, fimIso): Promise<DadosDoDia> {
      const [edicao, artigos, posts, falhos, social, fila, runs, custosDosPosts] = await Promise.all([
        cliente
          .from("news_editions")
          .select("subject, status")
          .eq("project_id", projectId)
          .eq("edition_date", dia)
          .eq("status", "published")
          .limit(1),
        cliente
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("status", "published")
          .gte("published_at", inicioIso)
          .lt("published_at", fimIso),
        cliente
          .from("social_posts")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("status", "published")
          .gte("published_at", inicioIso)
          .lt("published_at", fimIso),
        cliente
          .from("social_posts")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("status", "failed")
          .gte("scheduled_at", inicioIso)
          .lt("scheduled_at", fimIso),
        cliente
          .from("platform_events")
          .select("payload")
          .eq("project_id", projectId)
          .eq("event_type", "social_cycle_diagnostic")
          .eq("payload->>editionDate", dia)
          .order("created_at", { ascending: false })
          .limit(5),
        cliente
          .from("aprovacoes")
          .select("*")
          .eq("project_id", projectId)
          .gte("publicar_em", inicioIso)
          .lt("publicar_em", fimIso)
          .limit(500),
        cliente
          .from("newsroom_runs")
          .select("cost_estimate_usd")
          .eq("project_id", projectId)
          .gte("created_at", inicioIso)
          .lt("created_at", fimIso),
        cliente
          .from("social_posts")
          .select("cost_estimate_usd")
          .eq("project_id", projectId)
          .gte("created_at", inicioIso)
          .lt("created_at", fimIso),
      ]);

      for (const [nome, r] of Object.entries({ edicao, artigos, posts, falhos, social, fila, runs, custosDosPosts })) {
        if (r.error) falhou(`ler ${nome} do dia`, r.error.message);
      }

      // O diagnóstico do ciclo de verdade, e não o do ensaio.
      const diagnosticos = ((social.data ?? []) as Array<{ payload: Record<string, unknown> | null }>)
        .map((l) => l.payload ?? {})
        .filter((p) => p.dryRun !== true);
      const ultimo = diagnosticos[0] ?? {};
      const diagnostico = (ultimo.diagnostico ?? {}) as Record<string, unknown>;
      const visual = (diagnostico.visual ?? {}) as Record<string, unknown>;
      const motivos = new Map<string, number>();
      for (const [codigo, n] of Object.entries((diagnostico.skippedReasons ?? {}) as Record<string, unknown>)) {
        // O código genérico da verificação esconde o motivo; as recusas abaixo o trazem.
        if (codigo === "VERIFIED_REJECT") continue;
        if (NUMERO(n) > 0) motivos.set(codigo, (motivos.get(codigo) ?? 0) + NUMERO(n));
      }
      for (const r of (Array.isArray(ultimo.recusadas) ? ultimo.recusadas : []) as Array<{ motivo?: unknown }>) {
        const codigo = String(r.motivo ?? "").split(":")[0] || "recusada";
        motivos.set(codigo, (motivos.get(codigo) ?? 0) + 1);
      }

      const primeiraEdicao = ((edicao.data ?? []) as Array<{ subject?: string | null }>)[0];
      const custo =
        ((runs.data ?? []) as Array<{ cost_estimate_usd: unknown }>).reduce((s, r) => s + NUMERO(r.cost_estimate_usd), 0) +
        ((custosDosPosts.data ?? []) as Array<{ cost_estimate_usd: unknown }>).reduce(
          (s, r) => s + NUMERO(r.cost_estimate_usd),
          0,
        );

      return {
        newsletterPublicada: Boolean(primeiraEdicao),
        assuntoDaNewsletter: primeiraEdicao?.subject ?? null,
        materiasPublicadas: artigos.count ?? 0,
        postsPublicados: posts.count ?? 0,
        postsComFalha: falhos.count ?? 0,
        motivosDeCorte: [...motivos.entries()].map(([motivo, quantas]) => ({ motivo, quantas })),
        semFoto: NUMERO(visual.semFoto),
        fila: ((fila.data ?? []) as Array<Record<string, unknown>>).map(comoLinhaDaFila),
        custoUsd: custo,
      };
    },
  };
}

/** As dependências de verdade: banco do admin e o Telegram pelo `alerts.ts`. */
export function depsDosAvisos(cliente: Cliente): DepsDosAvisos {
  return {
    leitor: criarLeitorDosAvisos(cliente),
    registro: criarRegistroDosAvisos(cliente),
    enviar: async (nivel, texto) => {
      const r = await enviarAlerta(nivel, texto);
      return { enviado: r.enviado, motivo: r.motivo, descricao: r.descricao };
    },
  };
}
