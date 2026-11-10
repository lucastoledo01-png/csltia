import { z } from "zod";
import type { PacoteFactual } from "@/lib/server/editorial/pacote-factual";
import { validarAncoragem } from "@/lib/server/editorial/pacote-factual";
import { REGRA_DO_DOLAR } from "@/lib/server/editorial/dolar-em-portugues";
import { limparVicios } from "@/lib/server/newsroom/anti-vicios";
import { conferirFormaDaLegenda } from "@/lib/server/social/forma-da-legenda";
import { maximoDeReparos } from "@/lib/server/social/gerador";
import { canalDoCandidato } from "@/lib/server/social/reels/canais";
import type { CandidatoDeReel, CandidatosDeReel, PreparoDoReel, TextoDoReel } from "@/lib/server/social/reels/candidatos";
import type { Segmento } from "@/lib/server/social/reels/transcricao";
import { ajustarAosCortesDeCena } from "@/lib/server/social/reels/corte";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A escrita do Reel pelo Claude (28/10/2026).
 *
 * O Reel não tem pauta nem pacote factual da esteira: o material é o próprio
 * vídeo (título, legenda e autor de quem publicou), a história do termômetro
 * com que ele casou, e a folha de quadros com o corte proposto. A âncora é
 * esse material: número e nome que não estão nele não entram (`validarAncoragem`,
 * a mesma conferência do post).
 *
 * O laço é o do post: entrega, guardas, reparo até o teto de
 * `maximoDeReparos`, e depois descarte. Aceita a escrita, o texto vai para o
 * candidato e o worker renderiza. A reprovação no painel reabre esta tarefa
 * com o motivo (`reabrirEscritaDoReel`).
 */

export const TIPO_DA_ESCRITA_DO_REEL = "escrever_reel" as const;

const CorteSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  largura: z.number().int().min(32),
  altura: z.number().int().min(32),
});

export const TextoDoReelSchema = z.object({
  molde: z.enum(["a", "b"]).describe("a: o vídeo na moldura do template; b: tela cheia com caixas brancas."),
  rotulo: z.string().min(1).max(24).describe("Molde A: a palavra da faixa vermelha, em caixa alta (ex.: TARIFAS)."),
  categoria: z
    .string()
    .min(1)
    .max(24)
    .describe("Molde B: a editoria ou o tema da etiqueta (ex.: POLÍTICA, ECONOMIA, TECNOLOGIA). Nunca o crédito nem o nome do veículo: o crédito vai na legenda do post."),
  linhas: z.array(z.string().min(1).max(30)).min(2).max(3).describe("A manchete em 2 ou 3 linhas curtas, em caixa alta no molde A."),
  destaque: z.number().int().min(0).max(2).default(1).describe("Qual linha sai em vermelho no molde A (0, 1 ou 2)."),
  legenda: z.object({
    gancho: z.string().min(1).describe("O lide: ator, verbo, fato e quando, em uma ou duas frases."),
    paragrafos: z.array(z.string().min(1)).max(4).default([]),
  }),
  corte: CorteSchema.nullable().optional().describe("Só se quiser trocar o corte proposto: em pixels do vídeo original."),
  trechos: z
    .array(z.object({ inicio: z.number().min(0), fim: z.number().positive() }))
    .max(4)
    .optional()
    .describe("Os trechos da FALA que entram no Reel, em segundos do vídeo, em ordem e sem sobreposição; somados, de 15 a 45 s."),
  legendas: z
    .array(z.object({ inicio: z.number().min(0), fim: z.number().positive(), texto: z.string() }))
    .max(80)
    .optional()
    .describe("A fala traduzida para o português, em pedaços curtos (até 7 palavras), em segundos do Reel montado: o 0 é o começo do primeiro trecho, e os trechos ficam colados."),
  enquadramento: z
    .enum(["cheio", "quadrado"])
    .optional()
    .describe('"cheio" (o padrão): o vídeo cortado em 9:16 na tela toda. "quadrado": o vídeo 1:1 no meio, sobre ele mesmo desfocado, para o close fechado demais no 9:16.'),
});

export type TextoEntregue = z.infer<typeof TextoDoReelSchema>;

export const ESQUEMA_DO_REEL = z.toJSONSchema(TextoDoReelSchema, { io: "input" }) as Record<string, unknown>;

export type MaterialDoReel = {
  candidatoId: string;
  fonte: string;
  autor: string | null;
  permalink: string | null;
  titulo: string;
  legendaDeOrigem: string;
  historia: string | null;
  metricas: Record<string, unknown>;
  folhaUrl: string | null;
  original: PreparoDoReel["original"];
  corteProposto: PreparoDoReel["corte"];
  /** A fala do vídeo com tempo, quando o vídeo veio de canal (09/11/2026). */
  transcricao?: Segmento[] | null;
  /** O idioma da fala do canal: "en" exige trechos e legenda em português. */
  idioma?: "en" | "pt" | null;
  /** O crédito curto do canal ("Bloomberg"), que vai na legenda do post, nunca no vídeo. */
  credito?: string | null;
  /** Os cortes de cena do vídeo, em segundos (09/11/2026): o trecho começa e termina dentro da cena de quem fala. */
  cenas?: number[] | null;
  /** Da reprovação no painel, quando é uma reescrita. */
  reprovacao?: string;
};

export type DepsDaEscritaDoReel = {
  tarefas: TarefasStore;
  candidatos: CandidatosDeReel;
  env?: Record<string, string | undefined>;
};

const SYSTEM = [
  "Você escreve o texto de um Reel do eua.journal, publicação sobre os Estados Unidos para brasileiros.",
  "O vídeo é de outro perfil e vai ser recortado e posto no molde da marca; você escreve o que vai por cima dele e a legenda.",
  "Regras: português do Brasil, registro de jornal, zero emoji, zero hashtag, zero link, zero travessão.",
  "Só afirme o que o material diz: nome, número, data e lugar que não estão no material não entram.",
  "Linhas da manchete: curtas (até 30 caracteres cada), a do meio é a que muda tudo, sem ponto final.",
  "Legenda: o gancho é o lide (quem fez o quê, e quando); depois até 4 parágrafos curtos com o que o material sustenta. Não repita a manchete palavra por palavra.",
  "Molde: vídeo VERTICAL (mais alto que largo) é SEMPRE o molde B, tela cheia com a manchete simples; a moldura do A cortaria quase tudo. Molde A só para vídeo horizontal.",
  REGRA_DO_DOLAR,
].join("\n");

/*
 * O vídeo de canal com a fala transcrita (09/11/2026). Sempre o molde B, com a
 * manchete por 4 segundos e a legenda em português embaixo dela.
 */
const SYSTEM_DA_FALA = [
  "ESTE VÍDEO VEM DE UM CANAL DE NOTÍCIA, COM A FALA TRANSCRITA COM TEMPO (abaixo, em TRANSCRIÇÃO).",
  "Molde: sempre B.",
  "trechos: escolha o pedaço da FALA da pessoa que conta a notícia, 15 a 45 segundos somados; pode ser mais de um trecho (até 4), em ordem e sem sobreposição. Corte no começo e no fim de frase, pelos tempos da transcrição. Nada de vinheta, apresentador chamando o intervalo, ou plano sem ninguém falando.",
  "Só a pessoa da fala aparece: nada de apresentador, repórter, entrevistador, quem responde depois, nem imagem de apoio com narração por cima. Use os CORTES DE CENA: cada trecho começa depois de um corte e termina antes do corte seguinte quando a próxima cena mostra outra coisa; confira na folha de quadros quem aparece em cada cena. Pergunta do repórter fora de quadro pode ficar, legendada com \"Repórter:\".",
  "categoria (a etiqueta vermelha): a editoria ou o tema (POLÍTICA, ECONOMIA, TECNOLOGIA...). Nunca \"VÍDEO: BLOOMBERG\" nem o nome do veículo: crédito de vídeo e de imagem vai SÓ na legenda do post.",
  "legendas: a fala dos trechos traduzida para o português do Brasil, fiel ao que a pessoa disse (não resuma, não acrescente, não melhore), em pedaços de até 7 palavras, cada um com início e fim em segundos do Reel MONTADO: o 0 é o começo do primeiro trecho, e o segundo trecho começa onde o primeiro acaba. Sem sobreposição entre pedaços, sem travessão.",
  "A manchete e a legenda do post se apoiam na transcrição: nome, número e data que não estão nela, no título ou na descrição não entram.",
  'Marca de terceiro não aparece no vídeo: o corte proposto tira logotipo do canal, faixa de manchete, "LIVE" e relógio. Se o corte em 9:16 ficar fechado demais (só um pedaço do rosto), use enquadramento "quadrado". O crédito do canal vai na legenda do post, que a plataforma escreve sozinha; não escreva crédito na legenda.',
].join("\n");

const SEGUNDOS_MINIMOS_DO_TRECHO = 15;
const SEGUNDOS_MAXIMOS_DO_TRECHO = 45;
const PALAVRAS_POR_LEGENDA = 8;

function linhaDaTranscricao(s: Segmento): string {
  return `[${s.inicio.toFixed(1)}-${s.fim.toFixed(1)}] ${s.texto}`;
}

/** A transcrição para o prompt, com teto de tamanho: o vídeo de canal tem até 4 minutos. */
function transcricaoDoPrompt(segmentos: Segmento[], teto = 14_000): string {
  const linhas: string[] = [];
  let total = 0;
  for (const s of segmentos) {
    const l = linhaDaTranscricao(s);
    if (total + l.length > teto) {
      linhas.push("[...]");
      break;
    }
    linhas.push(l);
    total += l.length + 1;
  }
  return linhas.join("\n");
}

function systemDoMaterial(m: MaterialDoReel): string {
  return m.transcricao?.length ? `${SYSTEM}\n\n${SYSTEM_DA_FALA}` : SYSTEM;
}

function userDoReel(m: MaterialDoReel): string {
  return [
    `VÍDEO (${m.fonte}, de ${m.autor ?? "autor desconhecido"}): ${m.permalink ?? ""}`,
    `TÍTULO DE ORIGEM: ${m.titulo}`,
    `LEGENDA DE ORIGEM:\n${m.legendaDeOrigem || "(vazia)"}`,
    m.historia ? `A HISTÓRIA DO DIA COM QUE ELE CASOU (termômetro): ${m.historia}` : "",
    `VÍDEO ORIGINAL: ${m.original.largura}x${m.original.altura}, ${Math.round(m.original.segundos)} s.`,
    `CORTE PROPOSTO (tira logotipo e legenda gravada de quem publicou): molde A ${JSON.stringify(m.corteProposto.a)}, molde B ${JSON.stringify(m.corteProposto.b)}.`,
    m.corteProposto.q ? `CORTE QUADRADO PROPOSTO (enquadramento "quadrado"): ${JSON.stringify(m.corteProposto.q)}.` : "",
    m.folhaUrl ? `A folha de quadros com o corte desenhado em amarelo está em ver_reel(${m.candidatoId}).` : "",
    m.credito ? `CANAL: ${m.credito} (o crédito "Vídeo: ${m.credito}" entra sozinho na legenda do post).` : "",
    m.cenas?.length ? `CORTES DE CENA (segundos do vídeo): ${m.cenas.map((c) => c.toFixed(2)).join(", ")}.` : "",
    m.transcricao?.length
      ? `TRANSCRIÇÃO (${m.idioma === "en" ? "inglês" : "português"}, transcrição automática, [início-fim] em segundos do vídeo):\n${transcricaoDoPrompt(m.transcricao)}`
      : "",
    m.reprovacao ? `\nO DONO REPROVOU A VERSÃO ANTERIOR NO PAINEL. Corrija isto: ${m.reprovacao}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function materialDoCandidato(c: CandidatoDeReel, preparo: PreparoDoReel): MaterialDoReel {
  const canal = canalDoCandidato(c.metricas);
  return {
    candidatoId: c.id,
    fonte: c.fonte,
    autor: c.autor,
    permalink: c.permalink,
    titulo: c.titulo ?? "",
    legendaDeOrigem: (c.legenda ?? "").slice(0, 3000),
    historia: typeof c.metricas.historia === "string" ? c.metricas.historia : null,
    metricas: c.metricas,
    folhaUrl: preparo.folhaUrl,
    original: preparo.original,
    corteProposto: preparo.corte,
    ...(preparo.transcricao?.length ? { transcricao: preparo.transcricao } : {}),
    ...(preparo.idioma ? { idioma: preparo.idioma } : {}),
    ...(canal ? { credito: canal.credito } : {}),
    ...(preparo.cenas?.length ? { cenas: preparo.cenas } : {}),
  };
}

/** O material vira o pacote da ancoragem: o texto de origem é tudo o que o vídeo diz. */
export function pacoteDoMaterial(m: MaterialDoReel): PacoteFactual {
  return {
    verified_facts: [],
    people: m.autor ? [m.autor] : [],
    organizations: ["eua.journal"],
    places: [],
    dates: [],
    numbers: [],
    gaps: [],
    source_urls: m.permalink ? [m.permalink] : [],
    // A fala transcrita entra: no vídeo de canal, é ela que diz o fato.
    texto_de_origem: [m.titulo, m.legendaDeOrigem, m.historia ?? "", ...(m.transcricao ?? []).map((s) => s.texto)].join("\n"),
  };
}

export async function abrirEscritaDoReel(
  projectId: string,
  data: string,
  material: MaterialDoReel,
  tarefas: TarefasStore,
): Promise<Tarefa> {
  return tarefas.abrir({
    projectId,
    editionDate: data,
    tipo: TIPO_DA_ESCRITA_DO_REEL,
    chave: material.candidatoId,
    instrucao: { system: systemDoMaterial(material), user: userDoReel(material), orientacao: "Responda SÓ com o JSON do esquema." },
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA_DO_REEL,
  });
}

const arred = (n: number) => Math.round(n * 100) / 100;

/**
 * Pura: os trechos e as legendas da fala (09/11/2026). Devolve os motivos do
 * reparo, vazio quando está tudo certo. O vídeo em inglês exige os dois: sem
 * legenda, o leitor brasileiro não entende a fala.
 */
export function conferirTrechosELegendas(
  t: { trechos?: Array<{ inicio: number; fim: number }>; legendas?: Array<{ inicio: number; fim: number; texto: string }> },
  material: Pick<MaterialDoReel, "original" | "transcricao" | "idioma"> & Partial<Pick<MaterialDoReel, "cenas">>,
): string[] {
  const motivos: string[] = [];
  const trechos = t.trechos ?? [];
  const legendas = t.legendas ?? [];
  const duracao = material.original.segundos;

  if (material.idioma === "en") {
    if (!trechos.length) motivos.push("[TRECHO] o vídeo é em inglês: escolha os trechos da fala (trechos), de 15 a 45 s somados");
    if (!legendas.length) motivos.push("[LEGENDA_PT] o vídeo é em inglês: a fala precisa da legenda em português (legendas)");
  }

  let total = duracao;
  if (trechos.length) {
    total = 0;
    trechos.forEach((x, i) => {
      if (x.fim <= x.inicio) motivos.push(`[TRECHO] o trecho ${i + 1} termina antes de começar (${x.inicio} a ${x.fim})`);
      if (x.fim > duracao + 0.05) motivos.push(`[TRECHO] o trecho ${i + 1} passa do fim do vídeo (${Math.round(duracao)} s)`);
      if (x.fim - x.inicio < 1.5) motivos.push(`[TRECHO] o trecho ${i + 1} tem menos de 1,5 s`);
      const anterior = trechos[i - 1];
      if (anterior && x.inicio < anterior.fim - 0.01) motivos.push(`[TRECHO] o trecho ${i + 1} começa antes do fim do anterior: em ordem e sem sobreposição`);
      total += Math.max(0, Math.min(x.fim, duracao) - x.inicio);
    });
    if (total < SEGUNDOS_MINIMOS_DO_TRECHO - 0.5 || total > SEGUNDOS_MAXIMOS_DO_TRECHO + 0.5) {
      motivos.push(`[TRECHO] os trechos somam ${total.toFixed(1)} s; o Reel da fala tem de ${SEGUNDOS_MINIMOS_DO_TRECHO} a ${SEGUNDOS_MAXIMOS_DO_TRECHO} s`);
    }
    /*
     * Só a cena de quem fala (09/11/2026): troca de cena a menos de 0,7 s da
     * borda do trecho quer dizer um pedaço da cena vizinha (apresentador,
     * entrevistador, quem responde). Volta ao Claude com o tempo certo, em vez
     * de ajustar sozinho, porque mexer na borda desloca as legendas.
     */
    const cenas = material.cenas ?? [];
    if (cenas.length) {
      const ajustados = ajustarAosCortesDeCena(trechos, cenas);
      trechos.forEach((x, i) => {
        const a = ajustados[i];
        if (a.inicio !== x.inicio) {
          motivos.push(`[CENA] o trecho ${i + 1} começa em ${x.inicio} s, e a cena muda em ${(a.inicio - 0.04).toFixed(2)} s: comece em ${a.inicio} s e refaça os tempos das legendas`);
        }
        if (a.fim !== x.fim) {
          motivos.push(`[CENA] o trecho ${i + 1} termina em ${x.fim} s, e a cena muda em ${(a.fim + 0.04).toFixed(2)} s: termine em ${a.fim} s`);
        }
      });
    }
    // Só a FALA: pelo menos metade de cada trecho tem de cair em segmento da transcrição.
    const falas = material.transcricao ?? [];
    if (falas.length) {
      trechos.forEach((x, i) => {
        const coberto = falas.reduce((s, f) => s + Math.max(0, Math.min(f.fim, x.fim) - Math.max(f.inicio, x.inicio)), 0);
        if (x.fim > x.inicio && coberto / (x.fim - x.inicio) < 0.5) {
          motivos.push(`[TRECHO] o trecho ${i + 1} (${x.inicio} a ${x.fim}) quase não tem fala na transcrição`);
        }
      });
    }
  }

  legendas.forEach((l, i) => {
    const n = i + 1;
    const texto = l.texto.trim();
    if (!texto) motivos.push(`[LEGENDA_PT] a legenda ${n} está vazia`);
    if (/[\u2014\u2013]/.test(texto)) motivos.push(`[TRAVESSAO] a legenda ${n} tem travessão`);
    if (texto.split(/\s+/).filter(Boolean).length > PALAVRAS_POR_LEGENDA) {
      motivos.push(`[LEGENDA_PT] a legenda ${n} passa de ${PALAVRAS_POR_LEGENDA - 1} palavras: divida em pedaços menores`);
    }
    if (l.fim <= l.inicio) motivos.push(`[LEGENDA_PT] a legenda ${n} termina antes de começar`);
    if (l.fim > total + 0.25) motivos.push(`[LEGENDA_PT] a legenda ${n} termina em ${l.fim} s, depois do fim do Reel (${total.toFixed(1)} s): os tempos são do Reel montado`);
    const anterior = legendas[i - 1];
    if (anterior && l.inicio < anterior.fim - 0.05) motivos.push(`[LEGENDA_PT] a legenda ${n} começa antes de a ${n - 1} terminar`);
  });
  return motivos;
}

/*
 * A etiqueta vermelha é a editoria ou o tema, nunca o crédito (09/11/2026,
 * regra do dono depois de dois Reels do Trump com "VÍDEO: CBS NEWS" e "VÍDEO:
 * BLOOMBERG" na etiqueta). Crédito de vídeo e de imagem mora só na legenda.
 */
const VEICULOS_NA_ETIQUETA =
  /\b(v[ií]deo|foto|imagem|cr[eé]dito|bloomberg|cbs|cnbc|cnn|fox|nbc|abc|c-span|reuters|ap|afp|getty|youtube|globonews|jovem pan|60 minutes)\b/i;

export function conferirEtiqueta(categoria: string, credito?: string | null): string[] {
  const c = categoria.trim();
  const temCredito = Boolean(credito?.trim()) && c.toLowerCase().includes(credito!.trim().toLowerCase());
  if (VEICULOS_NA_ETIQUETA.test(c) || temCredito) {
    return [`[ETIQUETA] "${c}" é crédito ou nome de veículo: a etiqueta é a editoria ou o tema (POLÍTICA, ECONOMIA, TECNOLOGIA); o crédito vai só na legenda do post`];
  }
  return [];
}

/** Pura: as guardas do texto. Devolve o texto pronto ou os motivos do reparo. */
export function conferirTextoDoReel(
  bruto: unknown,
  material: MaterialDoReel,
): { ok: true; texto: Omit<TextoDoReel, "tarefaId"> } | { ok: false; motivos: string[] } {
  const lido = TextoDoReelSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivos: [`a resposta não cabe no esquema: ${lido.error.message.slice(0, 500)}`] };
  const lidoLimpo = limparVicios(lido.data);
  /*
   * Vídeo vertical é sempre o molde B (decisão do dono, 29/10/2026): na
   * moldura do A, um 9:16 vira um recorte do meio, e o Reel do Trump saiu só
   * com metade do rosto. É regra de formato, então é aplicada aqui, e não
   * devolvida ao Claude como reparo.
   *
   * A exceção é o vertical que só embrulha um vídeo horizontal (30/10/2026):
   * o perfil de notícia põe o vídeo deitado no meio, com o próprio logotipo e
   * título em cima. O corte do A já acha esse retângulo; no B, tela cheia, a
   * marca do outro perfil ia junto.
   */
  const vertical = material.original.altura > material.original.largura;
  const a = material.corteProposto.a;
  const embrulhaHorizontal = Boolean(a && a.largura > a.altura);
  // O vídeo de canal é sempre o molde B (09/11/2026): a regra do Reel de vídeo, e a legenda da fala é desenhada nele.
  const deCanal = Boolean(material.idioma);
  const t =
    (deCanal || (vertical && !embrulhaHorizontal)) && lidoLimpo.molde === "a" ? { ...lidoLimpo, molde: "b" as const, corte: null } : lidoLimpo;

  const manchete = t.linhas.join(" ").replace(/\s+/g, " ").trim();
  const corpo = [t.legenda.gancho, ...t.legenda.paragrafos].map((p) => p.trim()).filter(Boolean).join("\n\n");
  const motivos: string[] = [];

  if (/[—–]/.test(`${manchete} ${corpo} ${t.rotulo} ${t.categoria}`)) motivos.push("[TRAVESSAO] travessão não entra; use vírgula, dois-pontos ou frase nova");
  if (t.destaque >= t.linhas.length) motivos.push(`[DESTAQUE] a linha ${t.destaque} não existe`);

  const ancoragem = validarAncoragem(`${manchete}\n${corpo}`, pacoteDoMaterial(material));
  for (const c of ancoragem.naoSustentadas.filter((x) => x.severidade === "bloqueio")) {
    motivos.push(`[SEM_LASTRO] "${c.valor}" (${c.onde}) não está no material do vídeo`);
  }
  for (const p of conferirFormaDaLegenda(corpo, manchete)) motivos.push(`[LEGENDA] ${p.detalhe}`);
  motivos.push(...conferirTrechosELegendas(t, material));
  motivos.push(...conferirEtiqueta(t.categoria, material.credito));

  if (t.corte) {
    const o = material.original;
    if (t.corte.x + t.corte.largura > o.largura || t.corte.y + t.corte.altura > o.altura) {
      motivos.push(`[CORTE] o corte passa do vídeo (${o.largura}x${o.altura})`);
    }
  }
  if (motivos.length) return { ok: false, motivos };

  return {
    ok: true,
    texto: {
      molde: t.molde,
      rotulo: t.rotulo.toUpperCase(),
      linhas: t.linhas,
      destaque: t.destaque,
      categoria: t.categoria.toUpperCase(),
      manchete,
      legenda: corpo,
      corte: t.corte ?? (t.enquadramento === "quadrado" ? (material.corteProposto.q ?? null) : material.corteProposto[t.molde]),
      ...(t.trechos?.length ? { trechos: t.trechos.map((x) => ({ inicio: arred(x.inicio), fim: arred(x.fim) })) } : {}),
      ...(t.legendas?.length
        ? { legendas: t.legendas.map((l) => ({ inicio: arred(l.inicio), fim: arred(l.fim), texto: l.texto.trim() })) }
        : {}),
      ...(t.enquadramento ? { enquadramento: t.enquadramento } : {}),
    },
  };
}

export type DesfechoDoReel =
  | { ok: true; desfecho: "pronto"; candidatoId: string; aviso: string }
  | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }
  | { ok: true; desfecho: "descartado"; candidatoId: string; motivos: string[] };

export async function entregarEscritaDoReel(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDaEscritaDoReel,
): Promise<DesfechoDoReel> {
  const material = tarefa.material as unknown as MaterialDoReel;
  const conferido = conferirTextoDoReel(resultado, material);
  if (conferido.ok) {
    await deps.tarefas.entregar(tarefa.id, resultado, quem);
    await deps.candidatos.salvarTexto(material.candidatoId, { ...conferido.texto, tarefaId: tarefa.id });
    return {
      ok: true,
      desfecho: "pronto",
      candidatoId: material.candidatoId,
      aviso: "Texto aceito. O worker renderiza o Reel em alguns minutos e o põe na fila; acompanhe com ver_reel.",
    };
  }

  /*
   * O teto conta as entregas recusadas DESTA rodada, guardado na instrução: a
   * reprovação no painel zera, e `tentativas` (que conta tudo, desde a primeira
   * versão) descartaria a reescrita na primeira recusa.
   */
  const reparos = Number((tarefa.instrucao as { reparos?: unknown }).reparos ?? 0);
  if (reparos < maximoDeReparos(deps.env ?? process.env)) {
    const pedido = await deps.tarefas.pedirReparo(tarefa.id, resultado, conferido.motivos, quem, {
      ...tarefa.instrucao,
      reparos: reparos + 1,
    });
    return { ok: true, desfecho: "reparar", tarefa: pedido, motivos: conferido.motivos };
  }
  await deps.tarefas.cancelar(tarefa.id, conferido.motivos);
  await deps.candidatos.encerrar(material.candidatoId, "descartada", `texto recusado depois dos reparos: ${conferido.motivos.join("; ")}`);
  return { ok: true, desfecho: "descartado", candidatoId: material.candidatoId, motivos: conferido.motivos };
}

/**
 * A reprovação do Reel no painel volta para o Claude (fase 4): a mesma tarefa
 * reaberta em `reparar`, com o motivo do dono no pedido. A terceira reprovação
 * descarta, pela regra da fila.
 */
export async function reabrirEscritaDoReel(
  candidato: CandidatoDeReel,
  motivo: string,
  deps: Pick<DepsDaEscritaDoReel, "tarefas" | "candidatos">,
): Promise<Tarefa | null> {
  const tarefaId = candidato.texto?.tarefaId;
  const tarefa = tarefaId ? await deps.tarefas.porId(tarefaId) : null;
  if (!tarefa || !candidato.preparo) return null;
  const material: MaterialDoReel = { ...materialDoCandidato(candidato, candidato.preparo), reprovacao: motivo };
  await deps.candidatos.reabrir(candidato.id, `reprovado no painel: ${motivo}`);
  return deps.tarefas.pedirReparo(tarefa.id, tarefa.resultado, [`[PAINEL] ${motivo}`], "painel", {
    system: systemDoMaterial(material),
    user: userDoReel(material),
    orientacao: "Responda SÓ com o JSON do esquema.",
    reparos: 0,
  });
}
