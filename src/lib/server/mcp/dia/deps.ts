import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { comInstrucoesDoProjeto } from "@/lib/server/instrucoes";
import { criarCandidatosStore, type CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { buscarTextoDaFonte } from "@/lib/server/editorial/enriquecimento";
import { horariosDoPortal, horariosDosArtigos } from "@/lib/server/ramos/portal";
import { vozesDosRamosComMemoria } from "@/lib/server/ramos/vozes";
import { candidatosSupabase } from "@/lib/server/social/reels/candidatos";
import { gravarImagemDaPauta, lerImagemDaPauta } from "@/lib/server/visual/acervo/imagem-da-pauta";
import type { PautaParaImagem } from "@/lib/server/visual/resolver";
import { agendarPost } from "../post/agendar";
import { depsDoPost, projetoDaFonte } from "../post/deps";
import { iniciarPost } from "../post/fluxo";
import { tarefasSupabase, type TarefasStore } from "../tarefas-store";
import { gravarMateriaDoClaude, iniciarArtigo, type DepsDoArtigo } from "../artigo/fluxo";
import { avancarNewsletter, gravarNewsletterDoClaude, type DepsDaNewsletter } from "../newsletter/fluxo";
import type { DepsDoDiretor } from "./diretor";
import { abrirFoto, candidatasDaFoto } from "./fotos";
import { abrirPacote } from "./pacotes";
import { abrirComplemento as abrirTarefaDoComplemento, type MaterialDoComplemento } from "./complemento";
import { abrirPlano, pautaDoPlano, reelsDoPlano, veiculosLexicos, volumesDoProjeto, type MaterialDoPlano } from "./plano";
import { artigosDoPlano, formatoDoPost, newsletterDoPlano, planosSupabase, postsDoPlano, type PlanoDoDia } from "./plano-store";
import { abrirTriagem, preFiltrar, type Coletada } from "./triagem";
import { ehPrioritaria, fontesPrioritarias } from "./fontes-prioritarias";
import { rodarRadar } from "@/lib/server/newsroom/radar";
import { EVENTO_DA_RODADA_DE_REELS, modoDosReels, rodarDescoberta } from "@/lib/server/social/reels/descoberta";
import { depsDeProducao } from "@/lib/server/social/reels/producao";

/** O teto da busca de vídeos dentro do "faça o dia": passou disso, a triagem segue e a busca termina sozinha. */
export const PRAZO_DA_BUSCA_DE_VIDEOS_MS = 60_000;

/**
 * A busca de vídeos do dia (10/11/2026, decisão do dono): o "faça o dia" lê os
 * canais do YouTube e os perfis do Instagram junto com as notícias, em vez de
 * depender de um cron de hora em hora. É o que enche `reels_sugeridos` antes
 * do plano, e sem ela a regra "vídeo primeiro" nunca disparava. Falha ou
 * demora não trava o dia: o plano segue com o que já está no banco.
 */
export async function buscarVideosDoDia(
  client: SupabaseClient,
  projeto: Project,
  rodar: typeof rodarDescoberta = rodarDescoberta,
  prazoMs = PRAZO_DA_BUSCA_DE_VIDEOS_MS,
): Promise<"ok" | "desligada" | "prazo" | "falhou"> {
  if (modoDosReels(projeto) === "off") return "desligada";
  const busca = (async () => {
    const desfecho = await rodar(projeto, depsDeProducao(client, projeto.id));
    await client.from("platform_events").insert({
      event_type: EVENTO_DA_RODADA_DE_REELS,
      project_id: projeto.id,
      payload: { ...desfecho, origem: "fazer_o_dia" },
    });
    return "ok" as const;
  })().catch((e: unknown) => {
    console.error("[MCP DIA] busca de vídeos:", e instanceof Error ? e.message : e);
    return "falhou" as const;
  });
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<"prazo">((r) => {
    relogio = setTimeout(() => r("prazo"), prazoMs);
  });
  try {
    return await Promise.race([busca, prazo]);
  } finally {
    clearTimeout(relogio);
  }
}

/** As matérias do dia na coleta do projeto de onde vêm as pautas. */
async function coletadas(client: SupabaseClient, projectIdDaFonte: string, desdeIso: string): Promise<Coletada[]> {
  const linhas: Coletada[] = [];
  for (let de = 0; de < 3000; de += 1000) {
    const { data, error } = await client
      .from("news_candidates")
      .select("story_id, url, title, summary, source_domain, status, published_at")
      .eq("project_id", projectIdDaFonte)
      .gte("published_at", desdeIso)
      .order("published_at", { ascending: false })
      .range(de, de + 999);
    if (error) throw new Error(`coleta ilegível: ${error.message}`);
    const pagina = (data ?? []) as Array<Record<string, unknown>>;
    for (const l of pagina) {
      linhas.push({
        storyId: String(l.story_id),
        url: String(l.url),
        title: String(l.title ?? ""),
        summary: String(l.summary ?? ""),
        sourceDomain: (l.source_domain as string | null) ?? null,
        status: l.status as Coletada["status"],
        publishedAt: String(l.published_at ?? ""),
      });
    }
    if (pagina.length < 1000) break;
  }
  return linhas;
}

export function paraImagemDaCandidata(c: CandidataPersistida): PautaParaImagem {
  const k = c.classificacao;
  return {
    storyId: c.storyId,
    titulo: c.title,
    resumo: c.summary,
    categoria: String(k?.eixo ?? ""),
    classificacao: { atores: k?.atores ?? [], lugares: k?.lugares ?? [], acontecimento: k?.acontecimento ?? [], pais: k?.pais },
  };
}

export function depsDoArtigo(client: SupabaseClient, tarefas: TarefasStore): DepsDoArtigo {
  return {
    tarefas,
    comInstrucoes: (projeto, fn) => comInstrucoesDoProjeto(projeto, fn),
    marca: async (projeto) => {
      const v = await vozesDosRamosComMemoria(projeto);
      return { nome: projeto.brand.displayName || projeto.name, nicho: projeto.niche, briefing: projeto.editorialPromptExtra ?? "", voz: v.artigo };
    },
    gravar: (projeto, conteudo, avisos) => gravarMateriaDoClaude(client, projeto, conteudo, avisos),
    buscarRelacionadas: async (projeto, alvo) => (await import("@/lib/server/materias-relacionadas")).buscarRelacionadas(client, projeto.id, alvo),
  };
}

export function depsDaNewsletter(client: SupabaseClient, tarefas: TarefasStore): DepsDaNewsletter {
  const candidatos = criarCandidatosStore(client);
  const planos = planosSupabase(client);
  return {
    tarefas,
    async pautas(projeto, data) {
      const plano = await planos.doDia(projeto.id, data);
      // Todo post do dia entra na newsletter até o teto (10/11/2026); o que passa fica de fora.
      const ids = newsletterDoPlano(plano.itens, volumesDoProjeto(projeto).newsletter.maximo);
      const mapa = await candidatos.buscarPorStoryIds(projeto.id, ids);
      const saida = [];
      for (const id of ids) {
        const c = mapa.get(id);
        if (c) saida.push({ candidata: c, foto: await lerImagemDaPauta(client, projeto.id, id) });
      }
      return saida;
    },
    reescrever: async (e, modelo) => (await import("@/lib/server/aprovacao/refazer-newsletter")).reescreverNewsletter(e, process.env, modelo),
    gravar: (projeto, data, r, contexto) => gravarNewsletterDoClaude(client, projeto, data, r, contexto),
  };
}

export function depsDoDiretor(client: SupabaseClient): DepsDoDiretor {
  const tarefas = tarefasSupabase(client);
  const planos = planosSupabase(client);
  const candidatos = criarCandidatosStore(client);
  const reels = candidatosSupabase(client);
  const post = depsDoPost(client);
  const artigo = depsDoArtigo(client, tarefas);
  const newsletter = depsDaNewsletter(client, tarefas);

  return {
    tarefas,
    planos,
    async abrirTriagem(projeto, data, rodada) {
      const fonte = (await projetoDaFonte(projeto)) ?? projeto;
      /*
       * A coleta na hora (29/10/2026). No motor Claude o ciclo das 06:03 não
       * roda, e era ele que lia os feeds; sem isso a triagem abria vazia. O
       * "faça o dia" lê todas as fontes antes de triar (uns 7 s para as 76),
       * e o dia parte das notícias daquela hora. Falha na coleta não trava o
       * dia: a triagem segue com o que já está no banco.
       */
      // As notícias e os vídeos ao mesmo tempo (10/11/2026): os vídeos achados viram `reels_sugeridos` do plano.
      const [coleta, videos] = await Promise.all([rodarRadar(fonte, { client }), buscarVideosDoDia(client, projeto)]);
      if (videos !== "ok" && videos !== "desligada") console.error("[MCP DIA] busca de vídeos antes da triagem:", videos);
      if (!coleta.ok) console.error("[MCP DIA] coleta antes da triagem:", coleta.erros.join("; "));
      const agora = Date.now();
      const lista = await coletadas(client, fonte.id, new Date(agora - 24 * 3_600_000).toISOString());
      /*
       * Só o que já tem classificação sai do pré-filtro (29/10/2026). Quando o
       * projeto lê a própria coleta (o eua.journal no motor Claude), toda
       * coletada já existe no projeto como `collected`, sem classificação; a
       * triagem completa essa linha em `gravarNovas`.
       */
      const janela = await candidatos.buscarDaJanela(projeto.id, 3);
      const jaClassificadas = new Set([...janela].filter(([, c]) => c.classificationStatus === "done").map(([url]) => url));
      const prioritarias = fontesPrioritarias(projeto);
      const prioritaria = (d: string | null) => ehPrioritaria(d, prioritarias);
      // A ordem é a do calor (09/11/2026): o fato que mais veículos contam entra primeiro.
      const doDia = lista.map((c) => ({ titulo: c.title, dominio: c.sourceDomain ?? "" }));
      const calores = new Map(lista.map((c) => [c.storyId, veiculosLexicos(c.title, doDia)]));
      const calor = (c: { storyId: string }) => calores.get(c.storyId) ?? 0;
      return abrirTriagem(projeto, data, preFiltrar(lista, jaClassificadas, { agoraMs: agora, prioritaria, calor }), {
        tarefas,
        candidatos,
        comInstrucoes: (p, fn) => comInstrucoesDoProjeto(p, fn),
      }, rodada);
    },
    async abrirPlano(projeto, plano: PlanoDoDia) {
      const fonte = (await projetoDaFonte(projeto)) ?? projeto;
      const agora = Date.now();
      const doDia = (await coletadas(client, fonte.id, new Date(agora - 24 * 3_600_000).toISOString())).map((c) => ({
        titulo: c.title,
        dominio: c.sourceDomain ?? "",
      }));
      const janela = [...(await candidatos.buscarDaJanela(projeto.id, 2)).values()].filter((c) => c.status === "approved");
      const prioritarias = fontesPrioritarias(projeto);
      const desde = new Date(agora - 30 * 86_400_000).toISOString().slice(0, 10);
      const aprovados = (await planos.aprovadosDesde(projeto.id, desde)).filter((p) => p.id !== plano.id);
      // As mais quentes primeiro (09/11/2026), e entre as de calor parecido a de nota maior.
      const material: MaterialDoPlano = {
        data: plano.data,
        volumes: volumesDoProjeto(projeto),
        pautas: janela
          .map((c) => pautaDoPlano(c, doDia, null, ehPrioritaria(c.sourceDomain, prioritarias)))
          .sort(
            (a, b) =>
              Number(Boolean(b.prioritaria)) - Number(Boolean(a.prioritaria)) ||
              Math.min(b.veiculos, 6) - Math.min(a.veiculos, 6) ||
              (b.relevancia ?? 0) - (a.relevancia ?? 0),
          )
          .slice(0, 40),
        reels: reelsDoPlano(await reels.sugeridos(projeto.id, 10)),
        jaUsadas: {
          newsletter: aprovados.flatMap((p) => p.itens.newsletter),
          artigos: aprovados.flatMap((p) => artigosDoPlano(p.itens)),
          instagram: aprovados.flatMap((p) => postsDoPlano(p.itens)),
        },
      };
      return abrirPlano(projeto, plano, material, tarefas);
    },
    async abrirComplemento(projeto, plano, rodada, faltam, pedido) {
      const fonte = (await projetoDaFonte(projeto)) ?? projeto;
      const agora = Date.now();
      const doDia = (await coletadas(client, fonte.id, new Date(agora - 24 * 3_600_000).toISOString())).map((c) => ({
        titulo: c.title,
        dominio: c.sourceDomain ?? "",
      }));
      const noDia = postsDoPlano(plano.itens);
      const desde = new Date(agora - 30 * 86_400_000).toISOString().slice(0, 10);
      const jaUsadas = (await planos.aprovadosDesde(projeto.id, desde)).filter((p) => p.id !== plano.id).flatMap((p) => postsDoPlano(p.itens));
      const janela = [...(await candidatos.buscarDaJanela(projeto.id, 2)).values()].filter(
        (c) => c.status === "approved" && !noDia.includes(c.storyId) && !jaUsadas.includes(c.storyId),
      );
      const prioritarias = fontesPrioritarias(projeto);
      const pautas = janela
        .map((c) => pautaDoPlano(c, doDia, null, ehPrioritaria(c.sourceDomain, prioritarias)))
        .sort((a, b) => Math.min(b.veiculos, 6) - Math.min(a.veiculos, 6) || (b.relevancia ?? 0) - (a.relevancia ?? 0))
        .slice(0, 30);
      const sugeridos = reelsDoPlano(await reels.sugeridos(projeto.id, 10)).filter((r) => !plano.itens.reels.includes(r.id));
      if (pautas.length === 0 && sugeridos.length === 0) return null;
      const titulos = await candidatos.buscarPorStoryIds(projeto.id, noDia);
      const material: MaterialDoComplemento = {
        data: plano.data,
        planoId: plano.id,
        rodada,
        faltam,
        pautas,
        reels: sugeridos,
        noDia,
        jaUsadasNoInstagram: jaUsadas,
        ...(pedido ? { pedido } : {}),
      };
      return abrirTarefaDoComplemento(projeto, plano, material, noDia.map((id) => ({ id, titulo: titulos.get(id)?.title ?? id })), tarefas);
    },
    async pecasDoInstagram(projeto, data, ids) {
      const { data: linhas, error } = await client
        .from("social_posts")
        .select("status")
        .eq("project_id", projeto.id)
        .eq("edition_date", data)
        .eq("platform", "instagram");
      if (error) throw new Error(`os posts do dia não puderam ser lidos: ${error.message}`);
      const posts = (linhas ?? []).filter((l) => !["cancelled", "failed"].includes(String(l.status))).length;
      const comOWorker = (await Promise.all(ids.map((id) => reels.porId(id)))).filter((r) => r && (r.estado === "escolhida" || r.estado === "renderizando")).length;
      return posts + comOWorker;
    },
    candidatas: (projeto, ids) => candidatos.buscarPorStoryIds(projeto.id, ids),
    foto: (projeto, id) => lerImagemDaPauta(client, projeto.id, id),
    async abrirFoto(projeto, plano, c) {
      const cena = plano.itens.cenas[c.storyId];
      const lista = await candidatasDaFoto(
        paraImagemDaCandidata(c),
        { consulta: cena?.consulta ?? "", objeto: cena?.objeto ?? "", falhou: !cena, motivo: cena ? "cena do Claude, no plano" : "sem cena no plano", custoUsd: 0 },
        { env: process.env, client, bancosOficiais: true },
      );
      // Sem candidata, a tarefa abre assim mesmo: o Claude acha a foto na web (06/11/2026).
      return abrirFoto(
        projeto,
        plano.data,
        {
          storyId: c.storyId,
          titulo: c.title,
          resumo: c.summary.slice(0, 800),
          categoria: String(c.classificacao?.eixo ?? ""),
          candidatas: lista.map(({ asset: _a, ...resto }) => resto),
          assets: lista.map((x) => x.asset),
          // O post em carrossel pede as fotos dos slides junto com a da capa (09/11/2026).
          ...(postsDoPlano(plano.itens).includes(c.storyId) && formatoDoPost(plano.itens, c.storyId) === "carrossel" ? { fotosDoCarrossel: 4 } : {}),
        },
        tarefas,
      );
    },
    async abrirPacote(projeto, data, c) {
      // Sem leitura, o Claude lê pela web (06/11/2026): antes a pauta saía do plano em silêncio.
      const texto = await buscarTextoDaFonte(c.canonicalUrl || c.url).catch(() => null);
      return abrirPacote(projeto, data, { storyId: c.storyId, titulo: c.title, url: c.canonicalUrl || c.url, texto: texto?.texto ?? "" }, tarefas);
    },
    reels: async (_projeto, ids) => (await Promise.all(ids.map((id) => reels.porId(id)))).filter((r): r is NonNullable<typeof r> => r !== null),
    escolherReel: (id) => reels.escolher(id),
    async verificarPeloPlano(projeto, storyIds) {
      const mapa = await candidatos.buscarPorStoryIds(projeto.id, storyIds);
      for (const c of mapa.values()) {
        if (c.verificacao?.status === "confirm") continue;
        await candidatos.gravarVerificacao(c.id, {
          status: "confirm",
          motivo: "aprovada pelo dono no plano do dia",
          divergencias: [],
          verificadoEm: new Date().toISOString(),
          canal: "plano",
          inputHash: "plano-do-dia",
        });
      }
    },
    async postAgendado(projeto, data, storyId) {
      const { data: linhas } = await client
        .from("social_posts")
        .select("id")
        .eq("project_id", projeto.id)
        .eq("edition_date", data)
        .eq("story_id", storyId)
        .limit(1);
      return (linhas ?? []).length > 0;
    },
    async iniciarPost(projeto, data, storyId) {
      const plano = await planos.doDia(projeto.id, data);
      const carrossel = postsDoPlano(plano.itens).includes(storyId) && formatoDoPost(plano.itens, storyId) === "carrossel";
      const r = await iniciarPost(projeto, { storyId, data, carrossel }, post);
      return r.ok ? r.tarefa : { erro: r.error };
    },
    async agendarPost(projeto, data, storyId) {
      // O formato que o plano aprovado deu ao post (09/11/2026): Reel de foto ou estático.
      const plano = await planos.doDia(projeto.id, data);
      const formato = formatoDoPost(plano.itens, storyId);
      const r = await agendarPost(projeto, { storyId, data, formato }, post);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async artigoGravado(projeto, data, storyId) {
      const t = (await tarefas.doDia(projeto.id, data)).find((x) => x.tipo === "escrever_artigo" && x.chave === storyId);
      return Boolean((t?.resultado as { pronto?: unknown } | null)?.pronto);
    },
    async iniciarArtigo(projeto, plano, storyId) {
      const c = (await candidatos.buscarPorStoryIds(projeto.id, [storyId])).get(storyId);
      if (!c?.factualPackage) return { erro: "sem pacote factual" };
      const lista = artigosDoPlano(plano.itens);
      const indice = Math.max(0, lista.indexOf(storyId));
      const horarios = horariosDosArtigos(lista.length, plano.data, projeto.timezone, horariosDoPortal(projeto));
      return iniciarArtigo(
        projeto,
        { storyId, data: plano.data, publicarEm: horarios[indice] ?? horarios[0], candidata: c, foto: await lerImagemDaPauta(client, projeto.id, storyId) },
        artigo,
      );
    },
    async newsletterGravada(projeto, data) {
      const { data: linhas } = await client.from("news_editions").select("id").eq("project_id", projeto.id).eq("edition_date", data).limit(1);
      return (linhas ?? []).length > 0;
    },
    async avancarNewsletter(projeto: Project, data: string) {
      const r = await avancarNewsletter(projeto, data, newsletter);
      if (r.desfecho === "tarefa") return { tarefa: r.tarefa };
      if (r.desfecho === "pronto") return { pronta: true };
      return { motivo: r.motivos.join("; ") };
    },
  };
}
