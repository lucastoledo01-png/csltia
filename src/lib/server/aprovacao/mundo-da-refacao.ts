import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../projects";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { PautaParaImagem } from "../visual/resolver";
import type { PautaDoContexto } from "./contrato";
import type { MundoDaRefacao } from "./ganchos-por-etapa";
import { getSupabaseAdminClient } from "../supabase-admin";
import { carregarConfigEditorial } from "../editorial/config";

/**
 * As funções do ciclo, de verdade, para os ganchos de 06/10/2026.
 *
 * Tudo é importado na hora: este arquivo entra no grafo de `integracao.ts`,
 * que o worker do Instagram também importa, e a redação, o renderizador e o
 * ciclo social não têm o que fazer lá. A regra de cada gancho mora em
 * `ganchos-por-etapa.ts`; aqui só a ligação com as funções que o ciclo usa,
 * com os mesmos parâmetros que o ciclo passa a elas.
 */

type Linha = Record<string, unknown>;

function paraImagem(p: PautaAvaliada | PautaDoContexto): PautaParaImagem {
  if ("grupo" in p) {
    return {
      storyId: p.storyId,
      titulo: p.grupo.primary.title,
      resumo: p.enriquecimento?.texto ?? "",
      categoria: p.classificacao.eixo,
      classificacao: {
        atores: p.classificacao.atores,
        lugares: p.classificacao.lugares,
        acontecimento: p.classificacao.acontecimento,
        pais: p.classificacao.pais,
      },
    };
  }
  return {
    storyId: p.storyId,
    titulo: p.titulo,
    resumo: p.resumo,
    categoria: p.eixo || p.categoria,
    classificacao: { atores: p.atores, lugares: p.lugares, acontecimento: p.acontecimento, pais: p.pais || "EUA" },
  };
}

async function vozes(projectId: string) {
  return (await import("../ramos/vozes")).vozesDosRamos(projectId);
}

async function fotoEmLeitura(
  pauta: PautaParaImagem,
  client: SupabaseClient,
  projeto: Project,
  env: Record<string, string | undefined>,
) {
  const { imagemDaPauta } = await import("../visual/acervo/imagem-da-pauta");
  // Em leitura: decidir se a pauta PODE entrar não marca a foto como usada.
  return imagemDaPauta(pauta, { client, projeto, opcoes: { client, env, somenteLeitura: true } });
}

export function mundoDaRefacaoDeProducao(
  env: Record<string, string | undefined> = process.env,
): Omit<MundoDaRefacao, "client" | "projeto" | "imagem" | "agora"> {
  const client = getSupabaseAdminClient;

  return {
    candidatasPorStory: async (projectId, storyIds) =>
      (await import("../editorial/candidatos-store")).criarCandidatosStore(client()).buscarPorStoryIds(projectId, storyIds),

    candidatasPorUrl: async (projectId, urls) => {
      const store = (await import("../editorial/candidatos-store")).criarCandidatosStore(client());
      const mapa = await store.buscarPorUrls(projectId, urls);
      const faltam = urls.filter((u) => !mapa.has(u));
      if (faltam.length > 0) {
        // A URL publicada pode ser a canônica: casa pela janela, em memória.
        const janela = await store.buscarDaJanela(projectId, 45);
        for (const c of janela.values()) {
          for (const u of faltam) if (!mapa.has(u) && (c.canonicalUrl === u || c.url === u)) mapa.set(u, c);
        }
      }
      return mapa;
    },

    poolDoDia: async (projectId, data) => {
      // A peça antiga não guardou o pool: as aprovadas da janela em volta da data.
      const dias = Math.max(3, Math.ceil((Date.now() - Date.parse(`${data}T00:00:00Z`)) / 86_400_000) + 3);
      const janela = await (await import("../editorial/candidatos-store")).criarCandidatosStore(client()).buscarDaJanela(projectId, dias);
      return [...janela.values()].filter((c: CandidataPersistida) => c.status === "approved");
    },

    historico: async (projectId) => {
      const { criarHistoricoStore } = await import("../editorial/history");
      const { carregarConfigEditorial } = await import("../editorial/config");
      const { comHistoricoDoFeed, lerHistoricoDoFeed } = await import("../social/historico-do-feed");
      const dias = carregarConfigEditorial(env).janelaDeDias;
      /*
       * O canal `instagram` vem do feed, e não do histórico editorial
       * (06/10/2026): a troca de pauta do post perguntava `verificarRepeticao`
       * a um canal vazio, e podia escolher a pauta que o feed levou ontem. Ver
       * `historico-do-feed.ts`. Os outros canais seguem como eram.
       */
      const [editorial, doFeed] = await Promise.all([
        criarHistoricoStore(client()).janela(projectId, dias),
        lerHistoricoDoFeed(client(), projectId, dias),
      ]);
      return comHistoricoDoFeed(editorial, doFeed);
    },

    // O módulo de configuração não importa nada: entra pelo grafo estático sem peso.
    config: () => carregarConfigEditorial(env),

    montarPacote: async (pc) => {
      const { montarPacotesDasPautas } = await import("../editorial/pacote-factual");
      const r = await montarPacotesDasPautas(
        [{ url: pc.url, titulo: pc.titulo, texto: pc.resumo, urls: [pc.url, ...(pc.urlsSecundarias ?? [])] }],
        env,
      );
      return r.pacotes.get(pc.url) ?? null;
    },

    fotoDaPauta: (pauta, ctx) => fotoEmLeitura(pauta, ctx.client, ctx.projeto, env),

    marcaDoPost: async (projeto, instrucao) => {
      const { resolverKeywordCanonica } = await import("../social/keyword-canonica");
      const canonica = await resolverKeywordCanonica(projeto.id);
      const v = await vozes(projeto.id);
      return {
        nome: projeto.brand.displayName || projeto.name,
        nicho: projeto.niche,
        extra: [projeto.editorialPromptExtra ?? "", v.post, instrucao].filter(Boolean).join("\n\n"),
        keyword: canonica.ok ? canonica.keyword : "",
      };
    },

    gerarPost: async (pauta, posicao, o) => {
      const { gerarPostDaPauta } = await import("../social/gerador");
      const { verificadorDeClaims } = await import("../social/evergreen/ciclo");
      return gerarPostDaPauta(pauta, posicao, {
        marca: o.marca,
        pacotes: new Map([[pauta.storyId, o.pacote]]),
        candidatas: o.candidata ? new Map([[pauta.storyId, o.candidata]]) : undefined,
        env,
        // O carrossel volta na forma que tinha, com a mesma verificação semântica do ciclo.
        ...(o.carrossel ? { decidirCarrossel: () => o.carrossel, verificarClaims: verificadorDeClaims({ env }) } : {}),
      });
    },

    produzirPost: async ({ projeto, data, pool, publicarEm }) => {
      const { rodarSocialDoDia } = await import("../social/ciclo-do-dia");
      const { chaveDeIdempotencia } = await import("../social/social-posts-store");
      const { carregarConfigEditorial } = await import("../editorial/config");
      const { criarHistoricoStore } = await import("../editorial/history");
      const { vozesDosRamosComMemoria } = await import("../ramos/vozes");
      const config = carregarConfigEditorial(env, projeto as { settings?: Record<string, unknown> | null });
      const historico = await criarHistoricoStore(client()).janela(projeto.id, config.janelaDeDias);
      const v = await vozesDosRamosComMemoria(projeto);
      const r = await rodarSocialDoDia(pool, {
        projeto,
        projectId: projeto.id,
        projectSlug: projeto.slug,
        editionDate: data,
        marca: {
          nome: projeto.brand.displayName || projeto.name,
          nicho: projeto.niche,
          extra: [projeto.editorialPromptExtra ?? "", v.post].filter(Boolean).join("\n\n"),
          keyword: String(projeto.settings?.instagram_keyword ?? "").trim(),
        },
        historico,
        config,
        client: client(),
        env,
        // Um post, no lugar de um: o mesmo ramo do Instagram, sem evergreen.
        tetoDoDia: 1,
        exigirPacoteFactual: true,
        evergreen: { modoForcado: "off" as const },
      });
      if (r.diagnostico.mode !== "enforce") {
        return { ok: false, motivo: `o Social V2 está em ${r.diagnostico.mode}: a troca de pauta não grava post` };
      }
      for (const preview of r.ciclo?.previews ?? []) {
        const chave = chaveDeIdempotencia(data, preview.post.pauta.storyId);
        const { data: linha, error } = await client()
          .from("social_posts")
          .select("*")
          .eq("project_id", projeto.id)
          .eq("idempotency_key", chave)
          .maybeSingle();
        if (error) throw new Error(`não consegui ler o post novo: ${error.message}`);
        if (!linha) continue;
        const l = linha as Linha;
        // A substituta ocupa o horário da reprovada, e não o primeiro do dia.
        if (publicarEm && l.status === "draft") {
          await client().from("social_posts").update({ scheduled_at: publicarEm }).eq("id", String(l.id)).eq("status", "draft");
          l.scheduled_at = publicarEm;
        }
        return { ok: true, linha: l, storyId: preview.post.pauta.storyId };
      }
      const motivos = [
        ...(r.ciclo?.descartados ?? []).map((d) => `${d.titulo.slice(0, 40)}: ${d.motivo}`),
        ...(r.ciclo?.gravacao?.erros ?? []),
      ];
      return { ok: false, motivo: motivos.slice(0, 3).join(" | ") || "o ciclo social não gravou post" };
    },

    produzirArtigo: async ({ projeto, data, pauta, pacote, publicarEm }) => {
      const { rodarRamoDoPortal } = await import("../ramos/ramo-do-portal");
      const { gravarArtigosAgendados, horariosDoPortal } = await import("../ramos/portal");
      const { criarFotosDoDia } = await import("../ramos/sem-foto");
      const { carregarConfigEditorial } = await import("../editorial/config");
      const { criarHistoricoStore } = await import("../editorial/history");
      const { buscarRelacionadas } = await import("../materias-relacionadas");
      const { vozesDosRamosComMemoria } = await import("../ramos/vozes");
      const config = carregarConfigEditorial(env, projeto as { settings?: Record<string, unknown> | null });
      const historico = await criarHistoricoStore(client()).janela(projeto.id, config.janelaDeDias);
      const v = await vozesDosRamosComMemoria(projeto);
      const r = await rodarRamoDoPortal({
        pool: [pauta],
        pacotes: new Map([[pauta.grupo.primary.url, pacote]]),
        historico,
        config,
        marca: {
          nome: projeto.brand.displayName || projeto.name,
          nicho: projeto.niche,
          briefing: projeto.editorialPromptExtra ?? "",
          voz: v.artigo,
        },
        data,
        timezone: projeto.timezone,
        horarios: horariosDoPortal(projeto),
        env,
        buscarRelacionadas: (alvo) => buscarRelacionadas(client(), projeto.id, alvo),
        // A matéria substituta também junta as fontes do mesmo fato e descreve a capa (06/10/2026).
        ampliarPacote: (await import("../ramos/materia-profunda")).criarAmpliadorDePacote({ client: client(), projectId: projeto.id, env }),
        descreverCapa: async (url) => (await import("../ramos/materia-profunda")).descreverCapaSemManchete(url, env),
        fotos: criarFotosDoDia<PautaAvaliada>(
          (p) => p.storyId,
          (p) => fotoEmLeitura(paraImagem(p), client(), projeto, env),
        ),
      });
      const peca = r.pecas.find((p) => p.aprovadaPeloAuditor);
      if (!peca) {
        const motivo =
          r.semFoto.map((q) => q.motivo)[0] ??
          r.pecas.flatMap((p) => p.bloqueios)[0] ??
          r.linhasDeLog.filter((l) => /não escrita|falha|BLOQUEADA|repetid/.test(l)).pop() ??
          "o ramo do portal não escreveu a matéria";
        return { ok: false, motivo };
      }
      const g = await gravarArtigosAgendados(client(), projeto.id, [peca]);
      if (g.erros.length) return { ok: false, motivo: `a matéria não foi gravada: ${g.erros.join(" | ")}` };
      const slug = peca.conteudo.slug;
      if (publicarEm) {
        await client().from("articles").update({ published_at: publicarEm }).eq("project_id", projeto.id).eq("slug", slug);
        peca.conteudo.publicarEm = publicarEm;
      }
      const { data: linha, error } = await client()
        .from("articles")
        .select("id, slug, title, content_html, cover_image")
        .eq("project_id", projeto.id)
        .eq("slug", slug)
        .maybeSingle();
      if (error || !linha) return { ok: false, motivo: `a matéria nova não foi relida: ${error?.message ?? "sem linha"}` };
      return { ok: true, linha: linha as Linha, peca };
    },

    reescreverNewsletter: async (e) => (await import("./refazer-newsletter")).reescreverNewsletter(e, env),

    renderizarNewsletter: async (e) => (await import("./refazer-newsletter")).renderizarNewsletter(e),
  };
}
