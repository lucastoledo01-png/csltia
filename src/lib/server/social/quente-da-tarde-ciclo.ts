import { getSupabaseAdminClient } from "../supabase-admin";
import { getProjectNewsSources, projectToday, requireActiveProject } from "../projects";
import { collectAllNews } from "../newsroom/collector";
import { deduplicateCandidates } from "../newsroom/deduplicator";
import { avaliarPautas, persistenciaParaOSocial } from "../editorial/guarda";
import { carregarConfigEditorial } from "../editorial/config";
import { criarProvedorOpenAI } from "../editorial/embeddings";
import { criarHistoricoStore } from "../editorial/history";
import { aquecerPool, calcularCalorDoDia, fontesPadraoDoCalor } from "../editorial/calor-do-dia";
import { limiarDeVeiculosDoCalor } from "../editorial/calor";
import { cadenciaDoProjeto } from "../cadencia";
import { modoDosRamos } from "../ramos/modo";
import { vozesDosRamosComMemoria } from "../ramos/vozes";
import { lerHistoricoDoFeed } from "./historico-do-feed";
import { rodarSocialDoDia } from "./ciclo-do-dia";
import {
  ambienteDaTarde,
  configDaTarde,
  escolherQuentes,
  gravarDesfechoDaTarde,
  instagramPublicaHoje,
  modoDaQuenteDaTarde,
  vagasDaTarde,
  type DesfechoDaTarde,
  type PostDoDia,
} from "./quente-da-tarde";

/**
 * O ciclo da tarde, ponta a ponta (06/10/2026). A regra mora em
 * `quente-da-tarde.ts`; aqui só o encadeamento com o banco e a rede.
 *
 * Nunca lança: todo desfecho, inclusive "desligado" e "nada quente", volta
 * como objeto e, fora de `off`, vai para `platform_events`. É a lição dos dias
 * sem edição de setembro: decisão de não publicar que não deixa linha é
 * indistinguível de cron morto.
 */
export async function rodarQuenteDaTarde(
  projectId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
  agora: Date = new Date(),
): Promise<DesfechoDaTarde> {
  const client = getSupabaseAdminClient();
  let data = "";
  let modo: DesfechoDaTarde["modo"] = "off";
  try {
    const projeto = await requireActiveProject(projectId);
    data = projectToday(projeto, agora);
    modo = modoDaQuenteDaTarde(projeto);
    if (modo === "off") {
      return { ok: true, modo, data, motivo: "OFF", explicacao: "settings.capacidades.quente_da_tarde está desligada" };
    }

    const registrar = async (d: DesfechoDaTarde): Promise<DesfechoDaTarde> => {
      const naoGravado = await gravarDesfechoDaTarde(client, projeto.id, d);
      if (naoGravado) console.warn(`[TARDE] desfecho não gravado: ${naoGravado}`);
      return d;
    };

    if (!instagramPublicaHoje(projeto, data)) {
      return registrar({ ok: true, modo, data, motivo: "INSTAGRAM_NAO_PUBLICA_HOJE", explicacao: `${data} não é dia de Instagram na cadência` });
    }

    const config = configDaTarde(projeto);
    const cadencia = cadenciaDoProjeto(projeto);
    const { data: linhas, error } = await client
      .from("social_posts")
      .select("status, scheduled_at, error_message, dry_run")
      .eq("project_id", projeto.id)
      .eq("edition_date", data)
      .eq("platform", "instagram");
    if (error) throw new Error(`social_posts do dia ilegível: ${error.message}`);

    const vagas = vagasDaTarde({
      horarios: cadencia.instagram.horarios,
      dataIso: data,
      timezone: projeto.timezone,
      agoraMs: agora.getTime(),
      postsDoDia: (linhas ?? []) as PostDoDia[],
      maximoDoDia: cadencia.instagram.volume.maximo,
      maximoDoCiclo: config.maximoDePosts,
    });
    console.log(`[TARDE] ${modo}: ${vagas.motivo}`);
    if (vagas.teto === 0) {
      return registrar({ ok: true, modo, data, motivo: "SEM_VAGA", explicacao: vagas.motivo, vagas });
    }

    /*
     * A mesma coleta, deduplicação e guarda da manhã. A classificação de quem
     * já foi lido de manhã vem do banco (assinatura igual); só o que é novo
     * paga modelo. As buscas dinâmicas do Google News ficam de fora: na semana
     * medida tiveram aprovação zero, e a tendência entra pelo calor.
     */
    const fontes = await getProjectNewsSources(projeto.id);
    const coleta = await collectAllNews(fontes, fetcher);
    const { uniqueGroups } = deduplicateCandidates(coleta.candidates);
    const configEditorial = carregarConfigEditorial(env, projeto);
    const historico = await criarHistoricoStore(client).janela(projeto.id, configEditorial.janelaDeDias);
    const guarda = await avaliarPautas(uniqueGroups, {
      canal: "instagram",
      historico,
      config: configEditorial,
      provedorDeVetor: criarProvedorOpenAI(env, fetcher),
      env,
      fetcher,
      candidatos: { client, projectId: projeto.id },
    });
    console.log(
      `[TARDE] ${coleta.candidates.length} candidatas, ${uniqueGroups.length} grupos, ${guarda.approvedEditorialPool.length} aprovadas na linha`,
    );

    const calor = await calcularCalorDoDia(guarda.approvedEditorialPool, {
      fontes: fontesPadraoDoCalor({ client, projectId: projeto.id, env, fetcher, agoraMs: agora.getTime() }),
      agoraMs: agora.getTime(),
      limiar: limiarDeVeiculosDoCalor(env),
    });
    // Margem de três por vaga: o verificador, a foto e a copy ainda cortam.
    const { escolhidas } = escolherQuentes(guarda.approvedEditorialPool, calor.porStory, {
      janelaHoras: config.janelaHoras,
      calorMinimo: config.calorMinimo,
      agoraMs: agora.getTime(),
      limite: vagas.teto * 3,
    });
    const quentes = escolhidas.map((e) => ({ titulo: e.pauta.grupo.primary.title.slice(0, 140), calor: e.calor, horas: e.horas }));
    if (escolhidas.length === 0) {
      return registrar({
        ok: true,
        modo,
        data,
        motivo: "NADA_QUENTE",
        explicacao: `nenhuma pauta aprovada das últimas ${config.janelaHoras} h com calor ${config.calorMinimo} ou mais`,
        vagas,
      });
    }

    /*
     * O feed de HOJE entra no histórico de repetição. O ciclo das 06:03 o
     * exclui (`excetoData`) para a reexecução do dia não trocar as próprias
     * pautas; à tarde é o contrário: o post da manhã é exatamente o que não
     * pode voltar com outra manchete.
     */
    const historicoDoFeed = await lerHistoricoDoFeed(client, projeto.id, configEditorial.janelaDeDias || 30, {
      agoraMs: agora.getTime(),
    });

    const ramosNoComando = modoDosRamos(env, projeto) === "enforce";
    const vozes = ramosNoComando ? await vozesDosRamosComMemoria(projeto) : null;
    const extra = [projeto.editorialPromptExtra ?? "", vozes?.post ?? ""].filter(Boolean).join("\n\n");

    /*
     * O calor já ordenou e já filtrou; o ciclo social não soma de novo. Em
     * `enforce` o calor do projeto aqueceria o pool uma segunda vez, então o
     * projeto vai ao ciclo com o calor em `off`, só nesta chamada.
     */
    const settings = (projeto.settings ?? {}) as Record<string, unknown>;
    const capacidades = (settings.capacidades ?? {}) as Record<string, unknown>;
    const projetoSemCalorDuplo = { ...projeto, settings: { ...settings, capacidades: { ...capacidades, calor: "off" } } };

    const social = await rodarSocialDoDia(aquecerPool(escolhidas.map((e) => e.pauta), calor.porStory), {
      ...(modo === "dry_run" ? { modoForcado: "dry_run" as const } : {}),
      projeto: projetoSemCalorDuplo,
      projectId: projeto.id,
      projectSlug: projeto.slug,
      editionDate: data,
      marca: {
        nome: projeto.brand.displayName || projeto.name,
        nicho: projeto.niche,
        extra,
        keyword: String(projeto.settings?.instagram_keyword ?? "").trim(),
      },
      historico,
      historicoDoFeed,
      config: configEditorial,
      client,
      // Só a leitura fecha o feed; a gravação falha avisando (06/10/2026).
      ...persistenciaParaOSocial(guarda.reuso),
      env: ambienteDaTarde(projeto, env, vagas),
      fetcher,
      tetoDoDia: vagas.teto,
      exigirPacoteFactual: true,
      evergreen: { modoForcado: "off" },
    });
    for (const l of social.ciclo?.linhasDeLog ?? []) console.log(l);

    return registrar({
      ok: true,
      modo,
      data,
      motivo: "RODOU",
      explicacao: `${social.diagnostico.selected} post(s) ${modo === "enforce" ? "gravado(s)" : "que sairiam"}, de ${escolhidas.length} quente(s)`,
      vagas,
      quentes,
      posts: {
        selecionados: social.diagnostico.selected,
        gravados: social.diagnostico.scheduled,
        titulos: (social.ciclo?.previews ?? []).map((p) => `${p.vaga.horaLocal} ${p.post.pauta.grupo.primary.title.slice(0, 130)}`),
      },
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const d: DesfechoDaTarde = { ok: false, modo, data, motivo: "FALHOU", explicacao: mensagem.slice(0, 300), erro: mensagem.slice(0, 1000) };
    if (modo !== "off") await gravarDesfechoDaTarde(client, projectId, d).catch(() => null);
    return d;
  }
}
