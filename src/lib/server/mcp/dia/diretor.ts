import type { Project } from "@/lib/server/projects";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { CandidatoDeReel } from "@/lib/server/social/reels/candidatos";
import type { ResultadoVisual } from "@/lib/server/visual/tipos";
import type { Tarefa, TarefasStore } from "../tarefas-store";
import { COMPLEMENTOS_AUTOMATICOS, COMPLEMENTOS_POR_DIA, TIPO_DO_COMPLEMENTO } from "./complemento";
import { volumesDoProjeto } from "./plano";
import {
  artigosDoPlano,
  newsletterDoPlano,
  pautasDoPlano,
  postsDoPlano,
  type EtapaDoDia,
  type PlanoDoDia,
  type PlanosStore,
} from "./plano-store";

/**
 * O diretor do dia (29/10/2026): a máquina que leva o "faça o dia" do Claude
 * até o fim, uma etapa por vez, e retoma de onde parou.
 *
 *   triagem ─► plano ─► aguardando_aprovacao ─► preparo ─► producao ─► pronto
 *                                                   ▲                    │
 *                                                   └──── complemento ◄──┘
 *
 * A cada chamada ele olha o que está gravado (o plano do dia, as tarefas, as
 * fotos, os pacotes, os posts e as matérias) e devolve UMA coisa: a próxima
 * tarefa para o Claude, um "aguarde" (o plano espera o dono), ou "pronto".
 * Nada aqui chama modelo: as etapas abrem tarefas, e quem pensa é o Claude.
 *
 * Desde 10/11/2026 o dia não fecha mais: "pronto" é relido a cada chamada, e
 * quando o Instagram do dia fica abaixo do alvo (peça reprovada, cancelada ou
 * que não fechou) o diretor abre o complemento, com uma triagem nova se o pool
 * secou. Os extras (o complemento e o link que o dono mandou) viram post,
 * matéria e newsletter, e o link é produzido mesmo antes de o plano existir.
 */

/**
 * `avisos` (06/11/2026): toda pauta do plano que ficou sem post, sem matéria
 * ou fora da newsletter, com o motivo. Antes ela sumia em silêncio, e o Claude
 * da Bruna não tinha como explicar nem destravar.
 */
export type PassoDoDia =
  | { tipo: "tarefa"; etapa: EtapaDoDia; tarefa: Tarefa; resumo: string; avisos?: string[] }
  | { tipo: "aguardar"; etapa: EtapaDoDia; motivo: string; avisos?: string[] }
  | { tipo: "pronto"; etapa: "pronto"; resumo: string; avisos?: string[] };

const erroEmTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type DepsDoDiretor = {
  tarefas: TarefasStore;
  planos: PlanosStore;
  /** `rodada` separa a triagem do complemento (chaves `triagem-c1-1`...) da triagem da manhã. */
  abrirTriagem: (projeto: Project, data: string, rodada?: string) => Promise<Tarefa[]>;
  abrirPlano: (projeto: Project, plano: PlanoDoDia) => Promise<Tarefa>;
  /** Abre `propor_complemento`; sem pauta nova no pool, devolve null. */
  abrirComplemento: (projeto: Project, plano: PlanoDoDia, rodada: number, faltam: number, pedido?: string) => Promise<Tarefa | null>;
  /** Peças do Instagram do dia que contam para o alvo: posts não cancelados e Reels do plano ainda com o worker. */
  pecasDoInstagram: (projeto: Project, data: string, reels: string[]) => Promise<number>;
  candidatas: (projeto: Project, storyIds: string[]) => Promise<Map<string, CandidataPersistida>>;
  foto: (projeto: Project, storyId: string) => Promise<ResultadoVisual | null>;
  /** Abre `escolher_foto`; sem candidata nenhuma, grava a pauta sem foto e devolve null. */
  abrirFoto: (projeto: Project, plano: PlanoDoDia, candidata: CandidataPersistida) => Promise<Tarefa | null>;
  /** Abre `extrair_pacote`; matéria ilegível devolve null (a pauta sai do plano). */
  abrirPacote: (projeto: Project, data: string, candidata: CandidataPersistida) => Promise<Tarefa | null>;
  reels: (projeto: Project, ids: string[]) => Promise<CandidatoDeReel[]>;
  escolherReel: (id: string) => Promise<boolean>;
  /**
   * A aprovação do plano pelo dono é a verificação de finalista do Instagram
   * (29/10/2026): grava `verificacao: confirm` nas pautas de post do plano.
   * Idempotente. Sem isso o Social Guard recusava todo post do Claude como
   * `SOCIAL_REJECT_UNVERIFIED`, porque a verificação da esteira é da OpenAI.
   * O link que o dono mandou vale como a mesma verificação (10/11/2026).
   */
  verificarPeloPlano: (projeto: Project, storyIds: string[]) => Promise<void>;
  /** O post desta pauta já está gravado na fila? */
  postAgendado: (projeto: Project, data: string, storyId: string) => Promise<boolean>;
  iniciarPost: (projeto: Project, data: string, storyId: string) => Promise<Tarefa | { erro: string }>;
  agendarPost: (projeto: Project, data: string, storyId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  artigoGravado: (projeto: Project, data: string, storyId: string) => Promise<boolean>;
  iniciarArtigo: (projeto: Project, plano: PlanoDoDia, storyId: string) => Promise<Tarefa | { erro: string }>;
  newsletterGravada: (projeto: Project, data: string) => Promise<boolean>;
  avancarNewsletter: (projeto: Project, data: string) => Promise<{ tarefa?: Tarefa; pronta?: boolean; motivo?: string }>;
};

export type OpcoesDoDiretor = {
  /**
   * Só o `fazer_o_dia` começa um dia que não começou (10/11/2026). A entrega
   * de uma tarefa avulsa (o post do link) não puxa a triagem do dia inteiro.
   */
  comecarODia?: boolean;
};

/** Tarefa que a escrita marcou como pronta (o post passou na guarda). */
function postPronto(t: Tarefa | undefined): boolean {
  return Boolean(t && t.estado === "entregue" && (t.resultado as { pronto?: unknown } | null)?.pronto);
}

function semPendencia(t: Tarefa | undefined): boolean {
  return !t || t.estado === "entregue" || t.estado === "cancelada";
}

type Alvos = { posts: string[]; artigos: string[]; newsletter: string[] };

export async function proximoPassoDoDia(projeto: Project, data: string, deps: DepsDoDiretor, opcoes: OpcoesDoDiretor = {}): Promise<PassoDoDia> {
  const comecarODia = opcoes.comecarODia ?? true;
  let plano = await deps.planos.doDia(projeto.id, data);
  const doDia = await deps.tarefas.doDia(projeto.id, data);
  const aberta = (tipo?: string) =>
    doDia
      .filter((t) => (t.estado === "aberta" || t.estado === "reparar") && (!tipo || t.tipo === tipo))
      .sort((a, b) => (a.estado === "reparar" ? -1 : 0) - (b.estado === "reparar" ? -1 : 0) || a.criadaEm.localeCompare(b.criadaEm))[0];
  const tarefa = (t: Tarefa, resumo: string): PassoDoDia => ({ tipo: "tarefa", etapa: plano.etapa, tarefa: t, resumo });
  const avisos: string[] = [];
  const comAvisos = (p: PassoDoDia): PassoDoDia => (avisos.length ? { ...p, avisos: [...(p.avisos ?? []), ...avisos] } : p);
  const extras = plano.itens.extras ?? [];

  // A verificação vem antes de tudo: o post aberto agora é conferido na entrega, e precisa dela.
  if (plano.estado === "aprovado") await deps.verificarPeloPlano(projeto, postsDoPlano(plano.itens));
  else if (extras.length) await deps.verificarPeloPlano(projeto, extras);

  // Trabalho começado vem antes de trabalho novo, em qualquer etapa.
  const pendente = aberta();
  if (pendente) return tarefa(pendente, `continuando: ${pendente.tipo}`);

  /**
   * A produção de um conjunto de pautas: o pacote de fatos, a foto, o post, a
   * matéria e a newsletter. Devolve a próxima tarefa, ou null quando não há
   * nada a abrir; o que ficou de fora vira aviso.
   */
  async function produzir(alvos: Alvos): Promise<PassoDoDia | null> {
    const pautas = [...new Set([...alvos.newsletter, ...alvos.artigos, ...alvos.posts])];
    const candidatas = await deps.candidatas(projeto, pautas);
    const nome = (id: string) => candidatas.get(id)?.title.slice(0, 80) ?? id;
    const fotoOk = async (id: string) => (await deps.foto(projeto, id))?.status === "SELECTED";
    const pacoteOk = (id: string) => Boolean(candidatas.get(id)?.factualPackage);

    for (const id of pautas) if (!candidatas.get(id)) avisos.push(`${id}: a pauta não está mais entre as candidatas do projeto (sem post, matéria nem newsletter)`);

    /*
     * Pauta sem pacote: a matéria não foi lida, ou a tarefa nunca abriu. Abre
     * de novo para o Claude ler pela web, uma vez (06/11/2026).
     */
    for (const id of pautas) {
      const c = candidatas.get(id);
      if (!c || pacoteOk(id)) continue;
      const tarefasDoPacote = doDia.filter((t) => t.tipo === "extrair_pacote" && t.chave === id);
      if (tarefasDoPacote.length === 0) {
        try {
          const t = await deps.abrirPacote(projeto, data, c);
          if (t) return tarefa(t, `fatos da pauta: ${nome(id)}`);
        } catch (e) {
          avisos.push(`${nome(id)}: o pacote de fatos não abriu (${erroEmTexto(e)})`);
          continue;
        }
      }
      avisos.push(`${nome(id)}: sem pacote de fatos, então sem post e sem matéria`);
    }

    for (const id of alvos.posts) {
      try {
        if (!candidatas.get(id) || !pacoteOk(id) || (await deps.postAgendado(projeto, data, id))) continue;
        if (!(await fotoOk(id))) {
          /*
           * Recusar todas as candidatas derrubava o post (06/11/2026). A
           * tarefa da foto volta ao Claude UMA vez, pedindo que ele ache a
           * foto na web; recusada de novo, a pauta fica sem post, com aviso.
           */
          const daFoto = doDia
            .filter((t) => t.tipo === "escolher_foto" && t.chave === id)
            .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))[0];
          if (daFoto && daFoto.estado === "entregue" && daFoto.tentativas <= 1) {
            const devolvida = await deps.tarefas.pedirReparo(
              daFoto.id,
              daFoto.resultado,
              [
                "O post desta pauta precisa de foto. Procure na web (site ou sala de imprensa, agência, Wikipedia, Flickr) ou com buscar_imagens, " +
                  "confira com ver_imagem e entregue escolha null com imagem_url, autor e fonte (ou imagem_id). Uma cena real aceitável é melhor que nenhuma.",
              ],
              "plataforma",
            );
            return tarefa(devolvida, `foto para o post: ${nome(id)}`);
          }
          if (!daFoto) {
            const c = candidatas.get(id);
            const t = c ? await deps.abrirFoto(projeto, plano, c) : null;
            if (t) return tarefa(t, `foto para o post: ${nome(id)}`);
          }
          avisos.push(`${nome(id)}: sem foto aprovada, então sem post (use trocar_imagem ou peça de novo a foto)`);
          continue;
        }
        const escrita = doDia.find((t) => t.tipo === "escrever_post" && t.chave === id);
        // O post descartado só por falta da verificação volta ao Claude, agora que o plano a gravou.
        if (escrita?.estado === "cancelada" && escrita.motivos.some((m) => m.includes("SOCIAL_REJECT_UNVERIFIED"))) {
          const devolvida = await deps.tarefas.pedirReparo(
            escrita.id,
            escrita.resultado,
            ["A pauta foi verificada pela aprovação do plano. Entregue de novo a mesma copy (o JSON do esquema)."],
            "plataforma",
          );
          return tarefa(devolvida, `post de volta: ${nome(id)}`);
        }
        if (escrita?.estado === "cancelada") {
          avisos.push(`${nome(id)}: o post foi descartado pela guarda (${escrita.motivos.slice(-2).join("; ") || "sem motivo"})`);
          continue;
        }
        if (!escrita) {
          const t = await deps.iniciarPost(projeto, data, id);
          if ("erro" in t) {
            avisos.push(`${nome(id)}: o post não abriu (${t.erro})`);
            continue;
          }
          return tarefa(t, `post: ${nome(id)}`);
        }
        if (postPronto(escrita)) {
          const r = await deps.agendarPost(projeto, data, id);
          if (!r.ok) avisos.push(`${nome(id)}: o post ficou pronto mas não entrou na fila (${r.error})`);
        }
      } catch (e) {
        avisos.push(`${nome(id)}: o post falhou (${erroEmTexto(e)})`);
      }
    }

    for (const id of alvos.artigos) {
      try {
        if (!candidatas.get(id) || !pacoteOk(id) || (await deps.artigoGravado(projeto, data, id))) continue;
        // A matéria espera a foto do post da mesma pauta: as duas usam a mesma foto.
        if (alvos.posts.includes(id) && !(await fotoOk(id))) continue;
        const escrita = doDia.find((t) => t.tipo === "escrever_artigo" && t.chave === id);
        if (escrita) {
          if (escrita.estado === "cancelada") avisos.push(`${nome(id)}: a matéria foi descartada (${escrita.motivos.slice(-2).join("; ") || "sem motivo"})`);
          continue;
        }
        const t = await deps.iniciarArtigo(projeto, plano, id);
        if ("erro" in t) avisos.push(`${nome(id)}: a matéria não abriu (${t.erro})`);
        else return tarefa(t, `matéria: ${nome(id)}`);
      } catch (e) {
        avisos.push(`${nome(id)}: a matéria falhou (${erroEmTexto(e)})`);
      }
    }

    // A newsletter que não fecha NÃO para o resto do dia (06/11/2026): vira aviso.
    if (alvos.newsletter.length) {
      try {
        if (!(await deps.newsletterGravada(projeto, data))) {
          const r = await deps.avancarNewsletter(projeto, data);
          if (r.tarefa) return tarefa(r.tarefa, "newsletter");
          if (r.motivo) avisos.push(`newsletter: ${r.motivo}`);
        }
      } catch (e) {
        avisos.push(`newsletter não saiu: ${erroEmTexto(e)}`);
      }
    }
    return null;
  }

  /*
   * O link que o dono mandou antes de o plano do dia ser aprovado (10/11/2026)
   * é produzido já: post e matéria. A newsletter espera o dia, senão sairia
   * uma edição só com ele.
   */
  if (plano.estado !== "aprovado" && extras.length) {
    const p = await produzir({ posts: extras, artigos: extras, newsletter: [] });
    if (p) return comAvisos(p);
  }

  if (plano.etapa === "triagem") {
    const triagens = doDia.filter((t) => t.tipo === "classificar");
    if (triagens.length === 0) {
      if (!comecarODia) {
        return comAvisos({ tipo: "pronto", etapa: "pronto", resumo: "as pautas avulsas estão na fila de aprovação do painel; para produzir o dia inteiro, chame fazer_o_dia" });
      }
      const novas = await deps.abrirTriagem(projeto, data);
      if (novas.length) return tarefa(novas[0], `triagem: ${novas.length} lote(s) de notícias para classificar`);
    }
    plano = await deps.planos.atualizar(plano.id, { etapa: "plano" });
  }

  if (plano.etapa === "plano") {
    const t = await deps.abrirPlano(projeto, plano);
    if (t.estado === "aberta" || t.estado === "reparar") return comAvisos(tarefa(t, "plano do dia: escolha o que produzir"));
    // Entregue: a entrega já pôs o plano na fila e mudou a etapa; relê.
    plano = (await deps.planos.porId(plano.id)) ?? plano;
  }

  if (plano.etapa === "aguardando_aprovacao" || plano.estado === "aguardando") {
    return comAvisos({ tipo: "aguardar", etapa: "aguardando_aprovacao", motivo: "o plano está na fila de aprovação do painel: espere o dono aprovar" });
  }
  if (plano.estado === "reprovado") {
    return comAvisos({ tipo: "aguardar", etapa: plano.etapa, motivo: `o plano foi reprovado: ${plano.motivo ?? "sem motivo"}` });
  }

  const itens = plano.itens;
  const pautas = pautasDoPlano(itens);

  if (plano.etapa === "preparo") {
    const candidatas = await deps.candidatas(projeto, pautas);
    for (const id of pautas) {
      const c = candidatas.get(id);
      if (!c) continue; // vira aviso na produção
      const jaTemFoto = doDia.some((t) => t.tipo === "escolher_foto" && t.chave === id) || (await deps.foto(projeto, id)) !== null;
      if (!jaTemFoto) {
        const t = await deps.abrirFoto(projeto, plano, c);
        if (t) return tarefa(t, `foto da pauta: ${c.title.slice(0, 80)}`);
      }
      const jaTemPacote = Boolean(c.factualPackage) || doDia.some((t) => t.tipo === "extrair_pacote" && t.chave === id);
      if (!jaTemPacote) {
        const t = await deps.abrirPacote(projeto, data, c);
        if (t) return tarefa(t, `fatos da pauta: ${c.title.slice(0, 80)}`);
      }
    }
    for (const r of await deps.reels(projeto, itens.reels)) if (r.estado === "nova") await deps.escolherReel(r.id);
    plano = await deps.planos.atualizar(plano.id, { etapa: "producao" });
  }

  // "pronto" é relido (10/11/2026): o dia que ganhou extra ou perdeu peça volta a produzir.
  const maximoDaNewsletter = volumesDoProjeto(projeto).newsletter.maximo;
  const p = await produzir({ posts: postsDoPlano(itens), artigos: artigosDoPlano(itens), newsletter: newsletterDoPlano(itens, maximoDaNewsletter) });
  if (p) return comAvisos(p);

  // Reels: o worker baixa e abre a tarefa de texto; aqui só se espera o que ainda está andando.
  const reels = await deps.reels(projeto, itens.reels);
  const andando = reels.filter((r) => r.estado === "escolhida" || r.estado === "renderizando");
  if (andando.length && !doDia.some((t) => t.tipo === "escrever_reel" && semPendencia(t) === false)) {
    return comAvisos({ tipo: "aguardar", etapa: "producao", motivo: `${andando.length} Reel(s) com o worker (download, corte ou render): espere um minuto` });
  }

  // O alvo do Instagram (10/11/2026): abaixo dele, o complemento abre sozinho, até duas vezes no dia.
  const alvo = volumesDoProjeto(projeto).instagram;
  const vivas = await deps.pecasDoInstagram(projeto, data, itens.reels);
  if (vivas < alvo) {
    const complementos = doDia.filter((t) => t.tipo === TIPO_DO_COMPLEMENTO).length;
    if (complementos < COMPLEMENTOS_AUTOMATICOS) {
      const c = await abrirOComplemento(projeto, plano, doDia, deps, complementos + 1, alvo - vivas);
      if (c) return comAvisos(c);
    }
    avisos.push(`o Instagram do dia tem ${vivas} de ${alvo} peças: chame complementar_o_dia para pedir mais pautas, ou pauta_do_link com uma notícia`);
  }

  if (plano.etapa !== "pronto") plano = await deps.planos.atualizar(plano.id, { etapa: "pronto" });
  return comAvisos({
    tipo: "pronto",
    etapa: "pronto",
    resumo:
      "o dia está produzido: tudo na fila de aprovação do painel. Se o dono reprovar ou cancelar peças, chame fazer_o_dia de novo: o dia completa o alvo" +
      (avisos.length ? "; veja os avisos do que ficou de fora e resolva o que der" : ""),
  });
}

/**
 * Abre o complemento da rodada; com o pool seco, uma triagem nova (uma vez por
 * rodada), e o complemento abre na volta. Null: nada novo a oferecer.
 */
async function abrirOComplemento(
  projeto: Project,
  plano: PlanoDoDia,
  doDia: Tarefa[],
  deps: DepsDoDiretor,
  rodada: number,
  faltam: number,
  pedido?: string,
): Promise<PassoDoDia | null> {
  const t = await deps.abrirComplemento(projeto, plano, rodada, faltam, pedido);
  if (t) return { tipo: "tarefa", etapa: plano.etapa, tarefa: t, resumo: `complemento do dia: faltam ${faltam} peça(s) no Instagram` };
  const prefixo = `c${rodada}`;
  if (doDia.some((x) => x.tipo === "classificar" && x.chave.startsWith(`triagem-${prefixo}-`))) return null;
  const novas = await deps.abrirTriagem(projeto, plano.data, prefixo);
  if (!novas.length) return null;
  return { tipo: "tarefa", etapa: plano.etapa, tarefa: novas[0], resumo: `triagem nova para o complemento: ${novas.length} lote(s) de notícias para classificar` };
}

/**
 * `complementar_o_dia` (10/11/2026): o dono pede mais pautas para um dia já
 * aprovado, inclusive um dia que já estava pronto e fechado.
 */
export async function pedirComplemento(
  projeto: Project,
  data: string,
  deps: DepsDoDiretor,
  pedido: { quantas?: number; texto?: string } = {},
): Promise<PassoDoDia | { erro: string }> {
  const plano = await deps.planos.doDia(projeto.id, data);
  if (plano.estado !== "aprovado") {
    return { erro: `o dia ${data} ainda não tem plano aprovado (está em "${plano.etapa}"): chame fazer_o_dia com essa data, ou mande uma notícia com pauta_do_link` };
  }
  const doDia = await deps.tarefas.doDia(projeto.id, data);
  const aberto = doDia.find((t) => t.tipo === TIPO_DO_COMPLEMENTO && (t.estado === "aberta" || t.estado === "reparar"));
  if (aberto) return { tipo: "tarefa", etapa: plano.etapa, tarefa: aberto, resumo: "complemento do dia já aberto: entregue este" };
  const rodadas = doDia.filter((t) => t.tipo === TIPO_DO_COMPLEMENTO).length;
  if (rodadas >= COMPLEMENTOS_POR_DIA) return { erro: `o dia ${data} já teve ${rodadas} complementos: mande a notícia com pauta_do_link` };
  const alvo = volumesDoProjeto(projeto).instagram;
  const vivas = await deps.pecasDoInstagram(projeto, data, plano.itens.reels);
  const faltam = Math.max(1, Math.min(alvo, pedido.quantas ?? alvo - vivas));
  const passo = await abrirOComplemento(projeto, plano, doDia, deps, rodadas + 1, faltam, pedido.texto);
  return passo ?? { erro: "não há pauta nova aprovada na triagem para este dia: mande a notícia com pauta_do_link, ou peça um vídeo com produzir_reel e o link" };
}
