import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import type { Tarefa, TarefasStore } from "../tarefas-store";
import { MAXIMO_DE_CARROSSEIS, blocoDoPerfil, linhaDoReel, type MaterialDoPlano, type PautaDoPlano } from "./plano";
import { FORMATOS_DO_POST, postsDoPlano, type ItensDoPlano, type PlanoDoDia, type PlanosStore } from "./plano-store";

/**
 * O complemento do dia (10/11/2026). O plano era um tiro só: aprovado e
 * produzido, ele fechava, e quando o dono reprovava ou cancelava posts o dia
 * ficava com 2 ou 3, abaixo do mínimo de 5, sem caminho para pedir mais. A
 * Bruna chegou a planejar outra data (09/11) porque os planos de 07 e 08 não
 * aceitavam pauta nova.
 *
 * O complemento abre sobre um plano já aprovado, em qualquer etapa: o Claude
 * escolhe mais pautas do mesmo pool da triagem (ou de uma triagem nova, quando
 * o pool secou), e elas entram como extras: post, matéria e, se couber,
 * newsletter. Não passa de novo pela aprovação do plano, por decisão do dono:
 * cada peça continua esperando aprovação no painel.
 */

export const TIPO_DO_COMPLEMENTO = "propor_complemento" as const;

/** Quantos complementos o diretor abre sozinho por dia; pelo `complementar_o_dia` o dono pede além disso. */
export const COMPLEMENTOS_AUTOMATICOS = 2;
export const COMPLEMENTOS_POR_DIA = 6;

export const ComplementoSchema = z.object({
  posts: z.array(z.string()).default([]),
  reels: z.array(z.string()).default([]),
  formatos: z.record(z.string(), z.enum(FORMATOS_DO_POST)).default({}),
  cenas: z.record(z.string(), z.object({ consulta: z.string().min(2), objeto: z.string().default("") })).default({}),
  porque: z.record(z.string(), z.string()).default({}),
});

export type Complemento = z.infer<typeof ComplementoSchema>;

const ESQUEMA = z.toJSONSchema(ComplementoSchema, { io: "input" }) as Record<string, unknown>;

export type MaterialDoComplemento = {
  data: string;
  planoId: string;
  rodada: number;
  /** Quantas peças do Instagram faltam para o alvo do dia. */
  faltam: number;
  pautas: PautaDoPlano[];
  reels: MaterialDoPlano["reels"];
  /** O que o dia já tem: o complemento não repete. */
  noDia: string[];
  jaUsadasNoInstagram: string[];
  noPerfil?: string[];
  pedido?: string;
};

function normalizarTitulo(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "").trim();
}

/** Pura: as regras do complemento. Vazio é aceito (não havia pauta boa), e encerra a rodada. */
export function conferirComplemento(c: Complemento, m: MaterialDoComplemento): string[] {
  const motivos: string[] = [];
  const pool = new Map(m.pautas.map((p) => [p.storyId, p]));
  const reels = new Set(m.reels.map((r) => r.id));
  const total = c.posts.length + c.reels.length;
  if (total > m.faltam) motivos.push(`o complemento leva até ${m.faltam} peça(s) (posts e Reels juntos), veio com ${total}`);
  if (new Set(c.posts).size !== c.posts.length) motivos.push("posts: a mesma pauta duas vezes");
  const titulos = new Map<string, string>();
  for (const id of c.posts) {
    const p = pool.get(id);
    if (!p) motivos.push(`posts: ${id} não está entre as pautas do complemento`);
    else if (m.noDia.includes(id)) motivos.push(`posts: ${id} já está no dia`);
    else if (m.jaUsadasNoInstagram.includes(id)) motivos.push(`posts: ${id} já saiu no Instagram nos últimos 30 dias`);
    const t = normalizarTitulo(p?.titulo ?? "");
    if (t && titulos.has(t)) motivos.push(`posts: ${id} repete a pauta ${titulos.get(t)} (mesmo título)`);
    else if (t) titulos.set(t, id);
  }
  for (const id of c.reels) if (!reels.has(id)) motivos.push(`reels: ${id} não está entre os vídeos sugeridos`);
  for (const id of c.posts) if (!c.formatos[id]) motivos.push(`formatos: falta o formato do post ${id} ("reel" ou "carrossel")`);
  for (const id of c.posts) {
    if (c.formatos[id] === "estatico") motivos.push(`formatos: ${id} está em "estatico"; o perfil não publica mais imagem estática, use "reel" ou "carrossel"`);
  }
  if (c.posts.filter((id) => c.formatos[id] === "carrossel").length > MAXIMO_DE_CARROSSEIS) {
    motivos.push(`formatos: no máximo ${MAXIMO_DE_CARROSSEIS} carrosséis no complemento`);
  }
  for (const id of c.posts) if (!c.cenas[id]?.consulta) motivos.push(`cenas: falta a busca da foto de contexto de ${id}`);
  for (const id of [...c.posts, ...c.reels]) if (!c.porque[id]) motivos.push(`porque: falta a frase de ${id}`);
  return motivos;
}

/** Pura: o plano com o complemento dentro. Os posts entram como extras (post, matéria e newsletter). */
export function itensComComplemento(itens: ItensDoPlano, c: Complemento): ItensDoPlano {
  const posts = c.posts.filter((id) => !postsDoPlano(itens).includes(id));
  return {
    ...itens,
    extras: [...(itens.extras ?? []), ...posts],
    reels: [...new Set([...itens.reels, ...c.reels])],
    formatos: { ...(itens.formatos ?? {}), ...Object.fromEntries(posts.map((id) => [id, c.formatos[id]])) },
    cenas: { ...itens.cenas, ...Object.fromEntries(posts.map((id) => [id, c.cenas[id]])) },
    porque: { ...itens.porque, ...c.porque },
  };
}

const SYSTEM = [
  "Você é o editor-chefe do eua.journal. O plano do dia já foi aprovado e produzido, e o Instagram ficou abaixo do alvo: algumas peças foram reprovadas, canceladas ou não fecharam.",
  "Escolha MAIS pautas para completar o dia, das listadas, com os mesmos critérios do plano: o que está mais QUENTE (mais veículos contando o mesmo fato), narrativas com gente ou marca conhecida no centro, variedade de editorias, nada de imigração.",
  "Não repita assunto que o dia já tem (a lista JÁ NO DIA): a mesma história por outra fonte não conta como pauta nova.",
  "Havendo vídeo sugerido que conte notícia, um Reel de vídeo em `reels` vale como uma das peças.",
  "Cada post escolhido vira também matéria do blog e entra na newsletter, se ainda couber: escolha pauta com material para isso.",
  "Formato de cada post em `formatos`: \"carrossel\" para a pauta com mais material (números, quem disse o quê, desdobramento; até dois) e \"reel\" para o resto. Imagem estática não sai mais. Para cada post, a busca em inglês de uma foto de contexto em `cenas` e uma frase em `porque`.",
  "Se nenhuma pauta da lista vale um post, devolva as listas vazias: é melhor que encher o dia.",
].join("\n");

function userDoComplemento(m: MaterialDoComplemento, noDia: Array<{ id: string; titulo: string }>): string {
  const pautas = m.pautas
    .map((p) => `- ${p.storyId} | ${p.titulo} | ${p.fonte ?? "?"} | ${p.eixo ?? "?"}/${p.pais ?? "?"} | relevância ${p.relevancia ?? "?"} | ${p.veiculos} veículo(s)${p.quente ? " | QUENTE" : ""}\n  ${p.resumo}`)
    .join("\n");
  const reels = m.reels.map(linhaDoReel).join("\n");
  return [
    `DATA: ${m.data}. COMPLEMENTO ${m.rodada}: faltam ${m.faltam} peça(s) no Instagram (posts e Reels juntos).`,
    m.pedido ? `PEDIDO DO DONO: ${m.pedido}` : "",
    blocoDoPerfil(m.noPerfil),
    `JÁ NO DIA (não repita o assunto):\n${noDia.map((x) => `- ${x.id} | ${x.titulo}`).join("\n") || "(nada)"}`,
    `PAUTAS DISPONÍVEIS (${m.pautas.length}):\n${pautas || "(nenhuma)"}`,
    `VÍDEOS SUGERIDOS PARA REEL (${m.reels.length}):\n${reels || "(nenhum)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function abrirComplemento(
  projeto: Project,
  plano: PlanoDoDia,
  material: MaterialDoComplemento,
  noDia: Array<{ id: string; titulo: string }>,
  tarefas: TarefasStore,
): Promise<Tarefa> {
  return tarefas.abrir({
    projectId: projeto.id,
    editionDate: plano.data,
    tipo: TIPO_DO_COMPLEMENTO,
    chave: `complemento-${material.rodada}`,
    instrucao: { system: SYSTEM, user: userDoComplemento(material, noDia), orientacao: "Responda SÓ com o JSON do esquema.", reparos: 0 },
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA,
  });
}

export async function entregarComplemento(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: { tarefas: TarefasStore; planos: PlanosStore },
): Promise<
  | { ok: true; desfecho: "complemento_no_dia"; posts: string[]; reels: string[] }
  | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }
> {
  const material = tarefa.material as unknown as MaterialDoComplemento;
  const lido = ComplementoSchema.safeParse(resultado);
  const motivos = lido.success ? conferirComplemento(lido.data, material) : [`a resposta não cabe no esquema do complemento: ${lido.error.issues[0]?.message ?? ""}`];
  if (!lido.success || motivos.length) {
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  const plano = await deps.planos.porId(material.planoId);
  if (!plano) throw new Error(`o plano ${material.planoId} não existe mais`);
  const vazio = lido.data.posts.length + lido.data.reels.length === 0;
  if (!vazio) {
    // De volta ao preparo: as fotos e os fatos das pautas novas; o que já estava feito é pulado.
    await deps.planos.atualizar(plano.id, { itens: itensComComplemento(plano.itens, lido.data), etapa: "preparo" });
  }
  return { ok: true, desfecho: "complemento_no_dia", posts: lido.data.posts, reels: lido.data.reels };
}
