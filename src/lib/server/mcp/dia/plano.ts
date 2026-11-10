import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import { cadenciaDoProjeto } from "@/lib/server/cadencia";
import { nomesDoTitulo } from "@/lib/server/editorial/termometro";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import type { CandidatoDeReel } from "@/lib/server/social/reels/candidatos";
import type { Tarefa, TarefasStore } from "../tarefas-store";
import { FORMATOS_DO_POST, type ItensDoPlano, type PlanoDoDia, type PlanosStore } from "./plano-store";

/**
 * O plano do dia (29/10/2026): o Claude propõe quais pautas viram newsletter,
 * matéria, post e Reel, a plataforma confere as regras que não dependem de
 * gosto, e o dono aprova no painel. Só o aprovado é produzido.
 *
 * O calor aqui é léxico, sem vetor (zero OpenAI no motor Claude): quantos
 * veículos diferentes publicaram, nas últimas 24 horas, título com dois nomes
 * próprios em comum com o da pauta. Mais grosso que o cosseno da esteira, e
 * suficiente para o Claude saber o que está todo mundo falando.
 */

export const TIPO_DO_PLANO = "propor_plano" as const;

export const ItensDoPlanoSchema = z.object({
  newsletter: z.array(z.string()).default([]),
  artigos: z.array(z.string()).default([]),
  posts: z.array(z.string()).default([]),
  reels: z.array(z.string()).default([]),
  porque: z.record(z.string(), z.string()).default({}),
  cenas: z
    .record(z.string(), z.object({ consulta: z.string().min(2), objeto: z.string().default("") }))
    .default({})
    .describe("Para cada storyId do plano: a busca em inglês de uma foto de contexto (sem pessoa identificável nem texto) e o objeto em português."),
  formatos: z
    .record(z.string(), z.enum(FORMATOS_DO_POST))
    .default({})
    .describe("Para cada storyId de `posts`: \"reel\" (Reel de foto de 10 s, o padrão), \"carrossel\" (notícia em slides com fotos, no máximo um por dia) ou \"estatico\" (a peça de imagem única)."),
});

const ESQUEMA = z.toJSONSchema(ItensDoPlanoSchema, { io: "input" }) as Record<string, unknown>;

export type PautaDoPlano = {
  storyId: string;
  titulo: string;
  fonte: string | null;
  publicadoEm: string | null;
  eixo: string | null;
  pais: string | null;
  relevancia: number | null;
  veiculos: number;
  /** Três veículos ou mais contando o mesmo fato: a pauta que está todo mundo falando. */
  quente?: boolean;
  resumo: string;
  /** De uma fonte que o dono pôs na frente (`settings.fontes_prioritarias`). */
  prioritaria?: boolean;
};

export type MaterialDoPlano = {
  data: string;
  volumes: { newsletter: { minimo: number; maximo: number }; artigos: number; instagram: number };
  pautas: PautaDoPlano[];
  reels: Array<{ id: string; fonte: string; autor: string | null; titulo: string | null; nota: number; link: string | null; publicado?: string | null }>;
  jaUsadas: { newsletter: string[]; artigos: string[]; instagram: string[] };
  /** O que já foi ao feed nos últimos dias (manchete ou primeira linha da legenda): nem pauta nem vídeo repete. */
  noPerfil?: string[];
  reprovacao?: string;
};

/** Pura: quantos veículos diferentes contam o mesmo fato, pelos nomes do título. */
export function veiculosLexicos(titulo: string, doDia: Array<{ titulo: string; dominio: string }>): number {
  const nomes = nomesDoTitulo(titulo);
  if (nomes.size === 0) return 0;
  const dominios = new Set<string>();
  for (const m of doDia) {
    const comuns = [...nomesDoTitulo(m.titulo)].filter((n) => nomes.has(n)).length;
    if (comuns >= Math.min(2, nomes.size) && m.dominio) dominios.add(m.dominio);
  }
  return dominios.size;
}

export const VEICULOS_DA_PAUTA_QUENTE = 3;
export const MAXIMO_DE_CARROSSEIS = 1;

/*
 * Vídeo primeiro (09/11/2026, pedido do dono): o Reel de vídeo, a fala da
 * pessoa legendada, é o formato que mais rende. Com vídeo sugerido, o plano
 * leva até 2 deles, sem passar dos vídeos que existem e deixando ao menos uma
 * vaga do Instagram para os posts.
 */
export const REELS_DE_VIDEO_POR_DIA = 2;

export function minimoDeReelsDeVideo(sugeridos: number, tetoDoInstagram: number): number {
  return Math.max(0, Math.min(REELS_DE_VIDEO_POR_DIA, sugeridos, tetoDoInstagram - 1));
}

/** Pura: quantos posts do plano precisam sair em Reel (a maioria, desde 09/11/2026). */
export function minimoDeReels(posts: number): number {
  return posts >= 2 ? Math.ceil(posts / 2) : 0;
}

export function pautaDoPlano(
  c: CandidataPersistida,
  doDia: Array<{ titulo: string; dominio: string }>,
  publicadoEm: string | null,
  prioritaria = false,
): PautaDoPlano {
  const v = veiculosLexicos(c.title, doDia);
  return {
    storyId: c.storyId,
    titulo: c.title,
    fonte: c.sourceDomain,
    publicadoEm,
    eixo: c.classificacao?.eixo ?? null,
    pais: c.classificacao?.pais ?? null,
    relevancia: c.classificacao?.relevancia ?? null,
    veiculos: v,
    ...(v >= VEICULOS_DA_PAUTA_QUENTE ? { quente: true } : {}),
    resumo: (c.summary ?? "").slice(0, 400),
    ...(prioritaria ? { prioritaria: true } : {}),
  };
}

export function volumesDoProjeto(projeto: Pick<Project, "settings" | "timezone">): MaterialDoPlano["volumes"] {
  const c = cadenciaDoProjeto(projeto);
  return { newsletter: c.newsletter.volume, artigos: c.portal.volume.maximo, instagram: c.instagram.volume.maximo };
}

/** Pura: as regras que não dependem de gosto. Devolve os motivos de recusa, vazio quando passa. */
export function conferirPlano(itens: ItensDoPlano, material: MaterialDoPlano): string[] {
  const motivos: string[] = [];
  const pool = new Set(material.pautas.map((p) => p.storyId));
  const reels = new Set(material.reels.map((r) => r.id));
  const v = material.volumes;

  if (itens.newsletter.length && (itens.newsletter.length < v.newsletter.minimo || itens.newsletter.length > v.newsletter.maximo)) {
    motivos.push(`a newsletter leva de ${v.newsletter.minimo} a ${v.newsletter.maximo} pautas, o plano tem ${itens.newsletter.length}`);
  }
  if (itens.artigos.length > v.artigos) motivos.push(`o portal leva até ${v.artigos} matérias, o plano tem ${itens.artigos.length}`);
  if (itens.posts.length + itens.reels.length > v.instagram) {
    motivos.push(`o Instagram leva até ${v.instagram} peças por dia (posts e Reels juntos), o plano tem ${itens.posts.length + itens.reels.length}`);
  }

  const canais: Array<[keyof Pick<ItensDoPlano, "newsletter" | "artigos" | "posts">, string[]]> = [
    ["newsletter", material.jaUsadas.newsletter],
    ["artigos", material.jaUsadas.artigos],
    ["posts", material.jaUsadas.instagram],
  ];
  for (const [canal, usadas] of canais) {
    const lista = itens[canal];
    if (new Set(lista).size !== lista.length) motivos.push(`${canal}: a mesma pauta duas vezes`);
    // A mesma notícia por duas fontes tem storyIds diferentes e o mesmo título (29/10/2026).
    const titulos = new Map<string, string>();
    for (const id of lista) {
      const t = (material.pautas.find((p) => p.storyId === id)?.titulo ?? "").toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "").trim();
      if (!t) continue;
      if (titulos.has(t)) motivos.push(`${canal}: ${id} repete a pauta ${titulos.get(t)} (mesmo título); escolha outra`);
      else titulos.set(t, id);
    }
    for (const id of lista) {
      if (!pool.has(id)) motivos.push(`${canal}: ${id} não está entre as pautas aprovadas na triagem`);
      else if (usadas.includes(id)) motivos.push(`${canal}: ${id} já saiu neste canal nos últimos 30 dias`);
    }
  }
  for (const id of itens.reels) if (!reels.has(id)) motivos.push(`reels: ${id} não está entre os vídeos sugeridos`);
  // Vídeo primeiro (09/11/2026): havendo vídeo sugerido, o dia leva Reel de vídeo.
  const minimoDeVideos = minimoDeReelsDeVideo(material.reels.length, v.instagram);
  // 10/11/2026: obrigar o vídeo fez o plano levar vídeo de 28/10 "porque a plataforma exige".
  // Menos vídeo vale quando o plano diz em `porque.reels` por que os sugeridos não servem.
  if (itens.reels.length < minimoDeVideos && (itens.porque?.reels ?? "").trim().length < 15) {
    motivos.push(
      `reels: há ${material.reels.length} vídeo(s) sugerido(s); o dia leva pelo menos ${minimoDeVideos} Reel(s) de vídeo, o plano tem ${itens.reels.length}. Se nenhum serve (velho, repetido, sem notícia), diga por quê em porque.reels`,
    );
  }

  const formatos = itens.formatos ?? {};
  for (const id of itens.posts) if (!formatos[id]) motivos.push(`formatos: falta o formato do post ${id} ("reel", "carrossel" ou "estatico")`);
  for (const id of Object.keys(formatos)) if (!itens.posts.includes(id)) motivos.push(`formatos: ${id} não está em posts`);
  const emReel = itens.posts.filter((id) => formatos[id] === "reel").length;
  const minimo = minimoDeReels(itens.posts.length);
  const emCarrossel = itens.posts.filter((id) => formatos[id] === "carrossel").length;
  if (emCarrossel > MAXIMO_DE_CARROSSEIS) motivos.push(`formatos: no máximo ${MAXIMO_DE_CARROSSEIS} carrossel por dia, o plano tem ${emCarrossel}`);
  if (emReel < minimo) motivos.push(`formatos: a maioria dos posts sai em Reel de foto; com ${itens.posts.length} posts, pelo menos ${minimo} em "reel" (o plano tem ${emReel})`);

  const comFoto = new Set([...itens.newsletter, ...itens.artigos, ...itens.posts]);
  for (const id of comFoto) if (!itens.cenas[id]?.consulta) motivos.push(`cenas: falta a busca da foto de contexto de ${id}`);
  for (const id of [...comFoto, ...itens.reels]) if (!itens.porque[id]) motivos.push(`porque: falta a frase de ${id}`);

  if (comFoto.size === 0 && itens.reels.length === 0) motivos.push("o plano está vazio");
  return motivos;
}

const SYSTEM = [
  "Você é o editor-chefe do eua.journal: notícias dos Estados Unidos para brasileiros que sonham em morar, trabalhar ou investir lá.",
  "Monte o plano de produção do dia a partir das pautas que a triagem aprovou e dos vídeos sugeridos para Reel.",
  "Critérios: o que está mais QUENTE (mais veículos contando o mesmo fato; as marcadas QUENTE têm 3 ou mais), o que mais importa para o leitor, gente conhecida no centro, variedade de editorias, nada de imigração.",
  "Prefira NARRATIVAS: a história que está andando e rende capítulo (personagem conhecido, conflito, virada, número que surpreende, decisão com consequência), e não o comunicado frio ou a matéria de serviço. Pauta fria só completa o dia.",
  "Newsletter: as pautas mais fortes do dia, a mais forte primeiro. Matérias do portal: pautas com material para um texto completo e que alguém procuraria no Google. Posts: as mais quentes e visuais, com gente ou marca conhecida no centro. Reels sugeridos (vídeos de terceiros): só vídeo que conte uma notícia, sem humor.",
  "Formato de cada post, em `formatos`: \"reel\" é o Reel de foto de 10 segundos (foto vertical com zoom lento, chapéu e manchete com destaque em vermelho, trilha) e é o padrão; \"estatico\" é a peça de imagem única, para quando a foto não aguenta um recorte vertical; \"carrossel\" é a notícia em slides (capa, de 1 a 4 passos com foto cada e o fechamento \"Siga @eua.journal\"), para UMA pauta do dia com mais material: números, quem disse o quê, desdobramento. Pelo menos metade dos posts em \"reel\", e no máximo um carrossel.",
  "SÓ O QUE ESTÁ QUENTE AGORA, de hoje ou de ontem: notícia que requenta fato de dias atrás (mesmo publicada hoje por outro veículo) não entra, vídeo publicado antes de ontem não entra, e nada que já saiu no perfil volta, nem como pauta nem como vídeo. Desdobramento só com fato NOVO de hoje. Sem vídeo novo que sirva, deixe `reels` vazio: não complete com vídeo velho.",
  "VÍDEO PRIMEIRO: os Reels de vídeo (a fala da pessoa, legendada em português) são o formato que mais rende. Havendo vídeo sugerido que conte notícia, ponha em `reels` até 2 por dia, os mais quentes primeiro (CEO, presidente, autoridade falando do assunto do dia). Se nenhum sugerido serve (velho, já saiu no perfil, não conta notícia), leve menos ou nenhum e diga por quê em `porque.reels`.",
  "A HISTÓRIA MAIS QUENTE DO DIA pode sair em dois formatos no Instagram: o carrossel dela em `posts` e um Reel de vídeo sobre ela em `reels` (a fala de quem está no centro da história). É variação, não repetição: cada peça conta um lado.",
  "A mesma pauta pode sair em mais de um canal. O Instagram tem um teto só para posts e Reels juntos.",
  "Para cada pauta, dê em `cenas` a busca em inglês de uma foto de contexto (o lugar, o objeto ou o ambiente do assunto, sem pessoa identificável e sem texto), e em `porque` uma frase dizendo por que ela entra.",
].join("\n");

/** Pura: a linha de um vídeo sugerido, com a data de publicação, para o Claude ver a idade. */
export function linhaDoReel(r: MaterialDoPlano["reels"][number]): string {
  const quando = r.publicado ? ` | publicado ${r.publicado.slice(0, 16).replace("T", " ")} UTC` : "";
  return `- ${r.id} | ${r.fonte} @${r.autor ?? "?"} | nota ${r.nota}${quando} | ${r.titulo ?? ""} | ${r.link ?? ""}`;
}

/** Pura: o bloco do que já saiu no perfil (10/11/2026: o plano repetia fato publicado). */
export function blocoDoPerfil(noPerfil: string[] | undefined): string {
  if (!noPerfil?.length) return "";
  return `JÁ SAIU NO PERFIL NOS ÚLTIMOS DIAS (nenhuma pauta nem vídeo pode repetir estes FATOS, nem com outra manchete ou outro ângulo; só entra desdobramento com fato NOVO de hoje):\n${noPerfil.map((t) => `- ${t}`).join("\n")}`;
}

function userDoPlano(m: MaterialDoPlano): string {
  const pautas = m.pautas
    .map((p) => `- ${p.storyId} | ${p.titulo} | ${p.fonte ?? "?"} | ${p.eixo ?? "?"}/${p.pais ?? "?"} | relevância ${p.relevancia ?? "?"} | ${p.veiculos} veículo(s)${p.quente ? " | QUENTE" : ""}${p.prioritaria ? " | FONTE PRIORITÁRIA" : ""}\n  ${p.resumo}`)
    .join("\n");
  const reels = m.reels.map(linhaDoReel).join("\n");
  return [
    `DATA: ${m.data}`,
    blocoDoPerfil(m.noPerfil),
    `VOLUMES: newsletter ${m.volumes.newsletter.minimo} a ${m.volumes.newsletter.maximo}; portal até ${m.volumes.artigos}; Instagram até ${m.volumes.instagram} (posts e Reels juntos).`,
    `PAUTAS APROVADAS NA TRIAGEM (${m.pautas.length}):\n${pautas || "(nenhuma)"}`,
    m.pautas.some((p) => p.prioritaria)
      ? "FONTE PRIORITÁRIA: o dono quer essas fontes na frente. Entre pautas de valor parecido, escolha a da fonte prioritária, e dê a ela pelo menos um canal quando a pauta se sustentar."
      : "",
    `VÍDEOS SUGERIDOS PARA REEL (${m.reels.length}):\n${reels || "(nenhum)"}`,
    m.reprovacao ? `O DONO REPROVOU O PLANO ANTERIOR. Corrija isto: ${m.reprovacao}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function abrirPlano(projeto: Project, plano: PlanoDoDia, material: MaterialDoPlano, tarefas: TarefasStore): Promise<Tarefa> {
  return tarefas.abrir({
    projectId: projeto.id,
    editionDate: plano.data,
    tipo: TIPO_DO_PLANO,
    chave: `plano-${plano.data}`,
    instrucao: { system: SYSTEM, user: userDoPlano(material), orientacao: "Responda SÓ com o JSON do esquema.", reparos: 0 },
    material: { ...material, planoId: plano.id } as unknown as Record<string, unknown>,
    esquema: ESQUEMA,
  });
}

/** Pura: o plano novo com os extras do anterior (formato, cena e frase de cada um). */
export function comExtrasDe(novo: ItensDoPlano, anterior: ItensDoPlano | undefined): ItensDoPlano {
  const extras = (anterior?.extras ?? []).filter((id) => !novo.posts.includes(id));
  if (!extras.length) return novo;
  const de = <T>(mapa: Record<string, T> | undefined) => Object.fromEntries(extras.filter((id) => mapa?.[id] !== undefined).map((id) => [id, mapa![id]]));
  return {
    ...novo,
    extras,
    formatos: { ...de(anterior?.formatos), ...(novo.formatos ?? {}) },
    cenas: { ...de(anterior?.cenas), ...novo.cenas },
    porque: { ...de(anterior?.porque), ...novo.porque },
  };
}

export type DepsDoPlano = {
  tarefas: TarefasStore;
  planos: PlanosStore;
  /** Põe o plano na fila de aprovação (ramo `plano`). */
  enfileirar: (plano: PlanoDoDia) => Promise<void>;
};

export async function entregarPlano(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDoPlano,
): Promise<{ ok: true; desfecho: "plano_na_fila"; planoId: string } | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }> {
  const material = tarefa.material as unknown as MaterialDoPlano & { planoId: string };
  const lido = ItensDoPlanoSchema.safeParse(resultado);
  const motivos = lido.success ? conferirPlano(lido.data, material) : [`a resposta não cabe no esquema do plano: ${lido.error.issues[0]?.message ?? ""}`];
  if (!lido.success || motivos.length) {
    return { ok: true, desfecho: "reparar", motivos, tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, motivos, quem) };
  }
  await deps.tarefas.entregar(tarefa.id, resultado, quem);
  // O link que o dono mandou antes do plano (10/11/2026) continua no dia: o plano proposto não o apaga.
  const anterior = await deps.planos.porId(material.planoId);
  const plano = await deps.planos.atualizar(material.planoId, {
    itens: comExtrasDe(lido.data, anterior?.itens),
    estado: "aguardando",
    etapa: "aguardando_aprovacao",
    motivo: null,
    tarefaId: tarefa.id,
  });
  await deps.enfileirar(plano);
  return { ok: true, desfecho: "plano_na_fila", planoId: plano.id };
}

/**
 * A reprovação do plano no painel: a mesma tarefa volta ao Claude com o motivo.
 * `renovar` relê os vídeos sugeridos e o feed (10/11/2026): sem isso o plano
 * refeito voltava com os mesmos vídeos de 28/10 que motivaram a reprovação.
 */
export async function reabrirPlano(
  plano: PlanoDoDia,
  motivo: string,
  deps: Pick<DepsDoPlano, "tarefas" | "planos"> & { renovar?: () => Promise<Pick<MaterialDoPlano, "reels" | "noPerfil">> },
): Promise<Tarefa | null> {
  const tarefa = plano.tarefaId ? await deps.tarefas.porId(plano.tarefaId) : null;
  if (!tarefa) return null;
  const novos = deps.renovar ? await deps.renovar() : {};
  const material = { ...(tarefa.material as unknown as MaterialDoPlano), ...novos, reprovacao: motivo };
  await deps.planos.atualizar(plano.id, { estado: "reprovado", etapa: "plano", motivo });
  return deps.tarefas.pedirReparo(
    tarefa.id,
    tarefa.resultado,
    [`[PAINEL] ${motivo}`],
    "painel",
    { system: SYSTEM, user: userDoPlano(material), orientacao: "Responda SÓ com o JSON do esquema." },
    deps.renovar ? (material as unknown as Record<string, unknown>) : undefined,
  );
}

export function reelsDoPlano(lista: CandidatoDeReel[]): MaterialDoPlano["reels"] {
  return lista.map((r) => ({ id: r.id, fonte: r.fonte, autor: r.autor, titulo: r.titulo, nota: r.nota, link: r.permalink, publicado: r.publicadoEm }));
}
