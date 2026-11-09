import type { SupabaseClient } from "@supabase/supabase-js";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { visaoDaFila } from "@/lib/server/aprovacao/painel";
import { comoProjetoDaFila } from "@/lib/server/aprovacao/rotas";
import { projectToday } from "@/lib/server/projects";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { linkDoPainel, pecasDaFila, resumoDoDia } from "./dia";
import { agendarPost, montarPost, type FormatoDaPeca, type PedidoDoPost } from "./post/agendar";
import { formatoDoPost, planosSupabase } from "./dia/plano-store";
import { depsDoPost, projetoDaFonte } from "./post/deps";
import { entregarTarefaDoPost, iniciarPost } from "./post/fluxo";
import { pautasDisponiveis } from "./post/material";
import { ehTipoDeTarefa, tarefasSupabase } from "./tarefas-store";
import { entregarDoDia, proximoSeHouverDia, tarefaParaOClaude } from "./dia/servico";
import type { AcessoDoMcp } from "./tokens";

/**
 * O que cada ferramenta do MCP faz, num lugar só (27/10/2026).
 *
 * As ferramentas chegam por dois caminhos: as rotas `/api/mcp/<ferramenta>`,
 * que o servidor local (stdio) chama por HTTP, e o MCP online em `/api/mcp`,
 * que o Claude do usuário acessa direto, de Mac ou Windows, sem instalar nada.
 * Os dois chamam estas funções, então a regra é uma só.
 *
 * Toda função recebe o acesso já conferido (`requireTokenDoMcp`) e devolve o
 * corpo da resposta: `{ ok: true, ... }` ou `{ ok: false, error, status }`.
 * Nenhuma aprova, reprova ou cancela peça: isso é só do painel.
 */

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; error: string; status: number };

function recusa(status: number, error: string): Resposta {
  return { ok: false, error, status };
}

function dataOuHoje(data: unknown, acesso: AcessoDoMcp): string | null {
  if (data === undefined || data === null || data === "") return projectToday(acesso.projeto);
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

function pedidoDePost(args: Record<string, unknown>, acesso: AcessoDoMcp): { storyId: string; data: string } | null {
  const storyId = typeof args.story_id === "string" ? args.story_id.trim() : "";
  const data = dataOuHoje(args.data, acesso);
  return storyId && data ? { storyId, data } : null;
}

const DATA_INVALIDA = "data inválida: use AAAA-MM-DD";
const POST_INVALIDO = "informe story_id e, se quiser, data (AAAA-MM-DD)";

export async function estadoDoDia(acesso: AcessoDoMcp, args: { data?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const data = dataOuHoje(args.data, acesso);
  if (!data) return recusa(400, DATA_INVALIDA);
  const p = comoProjetoDaFila(acesso.projeto);
  const [visao, tarefas] = await Promise.all([
    visaoDaFila(p, depsDaFila(client, p)),
    tarefasSupabase(client).doDia(acesso.projeto.id, data),
  ]);
  return {
    ok: true,
    projeto: { slug: acesso.projeto.slug, nome: acesso.projeto.name },
    ...resumoDoDia({ data, modoDaFila: modoDaFila(p), fila: visao.fila, tarefas }),
  };
}

export async function verFila(acesso: AcessoDoMcp, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const p = comoProjetoDaFila(acesso.projeto);
  const visao = await visaoDaFila(p, depsDaFila(client, p));
  return { ok: true, modo: visao.modo, painel: linkDoPainel(acesso.projeto.slug), pecas: pecasDaFila(visao.fila, acesso.projeto.slug) };
}

/**
 * As pautas com pacote factual e foto. No passo 2 do plano elas vêm dos posts
 * que a esteira produziu (`settings.mcp.pautas_de`), só lidas. A janela é de
 * 30 dias, de 1 a 60: os posts feitos à mão não guardam o pacote factual, e
 * numa semana só deles a janela curta voltava vazia.
 */
export async function pautas(acesso: AcessoDoMcp, args: { dias?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const fonte = await projetoDaFonte(acesso.projeto);
  if (!fonte) return recusa(404, "o projeto de pautas declarado não existe");
  // Dois dias por padrão (29/10/2026): com 30, o Claude oferecia pauta de semanas atrás como se fosse do dia.
  const pedidos = Number(args.dias ?? 2);
  const dias = Number.isFinite(pedidos) ? Math.min(60, Math.max(1, Math.round(pedidos))) : 2;
  const desdeIso = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const lista = await pautasDisponiveis(client, { projectIdDaFonte: fonte.id, projectIdDoClaude: acesso.projeto.id, desdeIso });
  return { ok: true, fonte: fonte.slug, dias, pautas: lista };
}

export async function iniciar(acesso: AcessoDoMcp, args: Record<string, unknown>, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const pedido = pedidoDePost(args, acesso);
  if (!pedido) return recusa(400, POST_INVALIDO);
  const r = await iniciarPost(acesso.projeto, pedido, depsDoPost(client));
  return r.ok ? { ok: true, tarefa: r.tarefa } : recusa(422, r.error);
}

export async function proximaTarefa(acesso: AcessoDoMcp, args: { tipo?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const tipo = args.tipo;
  if (tipo !== undefined && tipo !== null && tipo !== "" && !ehTipoDeTarefa(tipo)) {
    return recusa(400, `tipo de tarefa desconhecido: ${String(tipo)}`);
  }
  const tarefa = await tarefasSupabase(client).proxima(acesso.projeto.id, ehTipoDeTarefa(tipo) ? tipo : undefined);
  if (!tarefa) return { ok: true, tarefa: null };
  // A foto vai como imagem, e o material pesado fica na plataforma (29/10/2026).
  const { tarefa: compacta, imagens } = await tarefaParaOClaude(tarefa);
  return { ok: true, tarefa: compacta, imagens };
}

export async function entregar(acesso: AcessoDoMcp, args: { id?: unknown; resultado?: unknown }, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const id = typeof args.id === "string" ? args.id : "";
  if (!id || args.resultado === undefined) return recusa(400, "informe id e resultado");
  const tarefas = tarefasSupabase(client);
  const tarefa = await tarefas.porId(id);
  if (tarefa && tarefa.tipo !== "escrever_post" && tarefa.tipo !== "auditar_post") {
    if (tarefa.projectId !== acesso.projeto.id) return recusa(422, "tarefa não encontrada neste projeto");
    if (tarefa.estado !== "aberta" && tarefa.estado !== "reparar") return recusa(422, `a tarefa está "${tarefa.estado}" e não aceita entrega`);
    // As tarefas do dia (29/10/2026): triagem, plano, fotos, pacotes, matéria, newsletter e Reel.
    const r = await entregarDoDia(acesso, tarefa, args.resultado, client);
    if (r) return r;
    return recusa(422, `a entrega de "${tarefa.tipo}" ainda não existe`);
  }
  const r = await entregarTarefaDoPost(acesso.projeto, { id, resultado: args.resultado, quem: acesso.quem }, depsDoPost(client));
  if (!r.ok) return recusa(422, r.error);
  const proximo = tarefa ? await proximoSeHouverDia(acesso, tarefa.editionDate, client) : null;
  return { ...r, ...(proximo ? { proximo } : {}) };
}

/**
 * O formato e o foco do post avulso (09/11/2026). Sem `formato`, vale o do
 * plano aprovado; fora do plano, o Reel de foto, que é o padrão desde 30/10.
 */
async function pedidoDeMontagem(args: Record<string, unknown>, acesso: AcessoDoMcp, client: SupabaseClient): Promise<PedidoDoPost | null> {
  const base = pedidoDePost(args, acesso);
  if (!base) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined);
  const focoBruto = (args.foco ?? null) as { x?: unknown; y?: unknown } | null;
  const foco = focoBruto && typeof focoBruto === "object" ? { x: num(focoBruto.x), y: num(focoBruto.y) } : undefined;
  let formato: FormatoDaPeca;
  if (args.formato === "reel" || args.formato === "estatico") formato = args.formato;
  else {
    const plano = await planosSupabase(client).doDia(acesso.projeto.id, base.data);
    formato = plano.itens.posts.includes(base.storyId) ? formatoDoPost(plano.itens, base.storyId) : "reel";
  }
  return { ...base, formato, ...(foco && (foco.x !== undefined || foco.y !== undefined) ? { foco } : {}) };
}

export async function montar(acesso: AcessoDoMcp, args: Record<string, unknown>, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const pedido = await pedidoDeMontagem(args, acesso, client);
  if (!pedido) return recusa(400, POST_INVALIDO);
  const r = await montarPost(acesso.projeto, pedido, depsDoPost(client));
  if (!r.ok) return recusa(422, r.error);
  return {
    ok: true,
    formato: r.formato,
    manchete: r.manchete,
    legenda: r.legenda,
    ...(r.formato === "reel" ? { nota: "Reel de foto: a imagem é o primeiro quadro do vídeo de 10 s (zoom lento e trilha). Rosto cortado? Agende com foco {x, y} onde está o rosto." } : {}),
    imagem: { mime: "image/jpeg", base64: r.png.toString("base64") },
  };
}

export async function agendar(acesso: AcessoDoMcp, args: Record<string, unknown>, client: SupabaseClient = getSupabaseAdminClient()): Promise<Resposta> {
  const pedido = await pedidoDeMontagem(args, acesso, client);
  if (!pedido) return recusa(400, POST_INVALIDO);
  const r = await agendarPost(acesso.projeto, pedido, depsDoPost(client));
  if (!r.ok) return recusa(422, r.error);
  const { quadro, ...resto } = r;
  return {
    ...resto,
    painel: linkDoPainel(acesso.projeto.slug),
    aguardando: "aprovação no painel",
    ...(quadro ? { imagens: [{ mime: "image/jpeg", base64: quadro.toString("base64") }] } : {}),
  };
}
