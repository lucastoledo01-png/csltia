import type { Aprovacao, Ramo } from "../aprovacao/contrato";
import type { FilaStore } from "../aprovacao/fila-store";
import {
  EXEMPLOS_POR_TIPO,
  INICIO_SEM_IMIGRACAO,
  JANELA_DO_APRENDIZADO_DIAS,
  ORCAMENTO_DOS_EXEMPLOS,
  ROTULO_DO_RAMO,
  TIPOS_DE_EXEMPLO,
  type ExemploAprovado,
} from "./contrato";

/**
 * A aprovação vira exemplo (06/10/2026).
 *
 * O modelo imita exemplo mais do que obedece regra (é a lição de "Os exemplos
 * dos prompts saíram da imigração"). Então o que o editor aprovou DE PRIMEIRA,
 * sem refação e sem mexer no texto, é o melhor exemplo que existe da voz do
 * canal, e entra na instrução do redator daquele canal.
 *
 * As travas, cada uma com o motivo:
 *
 *   - por canal, sempre: o assunto de e-mail aprovado nunca vira exemplo de
 *     manchete de post, porque os canais comunicam de jeitos diferentes;
 *   - só o que o EDITOR aprovou: o modo automático fica de fora;
 *   - sem refação e sem edição: a peça editada à mão foi aprovada com o texto
 *     do editor, e o exemplo seria dele, não do redator;
 *   - trinta dias, e nada de antes de 05/10/2026, quando a imigração saiu da
 *     pauta; e mesmo depois disso, o texto que fala de visto não entra;
 *   - cinco por tipo e um orçamento em caracteres: o bloco é para mostrar a
 *     forma, não para encher a janela do modelo.
 */

/**
 * O que denuncia texto da era da imigração. A lista é a mesma de
 * `prompts-sem-imigracao.test.ts`, mais o vocabulário em português.
 */
const DA_IMIGRACAO =
  /\b(I-\d{3}|NIW|EB-?\d|O-1[AB]?|USCIS|DS-160|green ?card|F-1|H-1B|vistos?|imigra\w*|imigrante\w*|cidadania|asilo|deporta\w*)\b/i;

export function ehDaImigracao(texto: string): boolean {
  return DA_IMIGRACAO.test(texto);
}

function cortar(texto: string, teto: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= teto) return t;
  const corte = t.slice(0, teto);
  const ultimo = corte.lastIndexOf(" ");
  return `${(ultimo > teto * 0.6 ? corte.slice(0, ultimo) : corte).trim()}...`;
}

/** O primeiro parágrafo da legenda: é a abertura que o redator escreve, o resto é CTA e hashtag. */
function aberturaDaLegenda(legenda: string): string {
  return (legenda.split(/\n\s*\n/)[0] ?? "").trim();
}

/** Os textos de uma peça aprovada, por tipo, no vocabulário de `TIPOS_DE_EXEMPLO`. */
export function textosDaPeca(a: Aprovacao): Array<{ tipo: string; texto: string }> {
  const r = a.resumo;
  if (a.ramo === "newsletter") return [{ tipo: "assunto", texto: r.titulo ?? r.texto ?? "" }];
  if (a.ramo === "post") {
    return [
      { tipo: "manchete", texto: r.titulo ?? "" },
      { tipo: "legenda", texto: aberturaDaLegenda(r.texto ?? "") },
    ];
  }
  return [
    { tipo: "titulo", texto: r.titulo ?? "" },
    { tipo: "linha_fina", texto: r.linhaFina ?? "" },
  ];
}

export function inicioDaJanela(agora: number): string {
  const janela = new Date(agora - JANELA_DO_APRENDIZADO_DIAS * 24 * 60 * 60 * 1000).toISOString();
  return janela > INICIO_SEM_IMIGRACAO ? janela : INICIO_SEM_IMIGRACAO;
}

/**
 * Escolhe os exemplos de UM canal. Pura: recebe as aprovadas já lidas.
 *
 * Confere o canal de novo, além do filtro da leitura, porque um exemplo de
 * outro canal no prompt é exatamente o defeito que esta mudança existe para
 * impedir, e a conferência custa uma linha.
 */
export function escolherExemplos(
  ramo: Ramo,
  aprovadas: Aprovacao[],
  opcoes: { editadas?: ReadonlySet<string>; agora?: number } = {},
): ExemploAprovado[] {
  const desde = inicioDaJanela(opcoes.agora ?? Date.now());
  const editadas = opcoes.editadas ?? new Set<string>();
  const porTipo = new Map<string, ExemploAprovado[]>();
  const vistos = new Set<string>();

  const ordenadas = aprovadas
    .filter(
      (a) =>
        a.ramo === ramo &&
        a.estado === "aprovada" &&
        a.refazimentos === 0 &&
        !a.automatica &&
        (a.decididoEm ?? "") >= desde &&
        !editadas.has(a.pecaId) &&
        !/^texto editado/i.test(a.motivo ?? "") &&
        // A matéria que é a própria edição da newsletter não é texto do portal.
        !(a.ramo === "artigo" && /^edicao-/.test(a.resumo.slug ?? "")),
    )
    .sort((x, y) => (y.decididoEm ?? "").localeCompare(x.decididoEm ?? ""));

  const tipos = TIPOS_DE_EXEMPLO[ramo];
  for (const a of ordenadas) {
    const textos = textosDaPeca(a);
    // Uma peça com qualquer texto da era da imigração sai inteira.
    if (textos.some((t) => ehDaImigracao(t.texto))) continue;
    for (const { tipo, texto } of textos) {
      const def = tipos.find((t) => t.tipo === tipo);
      const limpo = texto.replace(/\s+/g, " ").trim();
      if (!def || limpo.length < 12) continue;
      const lista = porTipo.get(tipo) ?? [];
      const chave = `${tipo}:${limpo.toLowerCase()}`;
      if (lista.length >= EXEMPLOS_POR_TIPO || vistos.has(chave)) continue;
      vistos.add(chave);
      lista.push({ tipo, texto: cortar(limpo, def.teto), aprovadoEm: a.decididoEm ?? "" });
      porTipo.set(tipo, lista);
    }
  }
  return tipos.flatMap((t) => porTipo.get(t.tipo) ?? []);
}

/**
 * O bloco "exemplos aprovados pelo editor", dentro do orçamento.
 *
 * Vazio quando não há exemplo: bloco sem conteúdo no prompt é instrução sem
 * conteúdo. O orçamento corta exemplo inteiro, nunca no meio, e corta por
 * rodada (o mais recente de cada tipo primeiro), para um tipo não comer o
 * espaço do outro.
 */
export function montarBlocoDeExemplos(ramo: Ramo, exemplos: ExemploAprovado[], orcamento = ORCAMENTO_DOS_EXEMPLOS): string {
  const doCanal = exemplos.filter((e) => TIPOS_DE_EXEMPLO[ramo].some((t) => t.tipo === e.tipo));
  if (doCanal.length === 0) return "";
  const cabecalho =
    `EXEMPLOS APROVADOS PELO EDITOR neste canal (${ROTULO_DO_RAMO[ramo]}), de primeira, sem refação nem edição, nos últimos 30 dias. ` +
    "Imite a forma e o tom. Nunca copie o assunto nem os fatos: os fatos são só os do pacote factual.";
  let usado = cabecalho.length;
  const escolhidos = new Map<string, string[]>();
  const filas = TIPOS_DE_EXEMPLO[ramo].map((t) => ({
    tipo: t.tipo,
    rotulo: t.rotulo,
    itens: doCanal.filter((e) => e.tipo === t.tipo),
  }));
  for (let rodada = 0; rodada < EXEMPLOS_POR_TIPO; rodada += 1) {
    for (const f of filas) {
      const e = f.itens[rodada];
      if (!e) continue;
      const linha = `- ${e.texto}`;
      // O rótulo do tipo conta no orçamento na primeira vez que aparece.
      const custo = linha.length + 1 + (escolhidos.has(f.tipo) ? 0 : f.rotulo.length + 2);
      if (usado + custo > orcamento) continue;
      usado += custo;
      escolhidos.set(f.tipo, [...(escolhidos.get(f.tipo) ?? []), linha]);
    }
  }
  if (escolhidos.size === 0) return "";
  const linhas = [cabecalho];
  for (const t of TIPOS_DE_EXEMPLO[ramo]) {
    const itens = escolhidos.get(t.tipo);
    if (!itens?.length) continue;
    linhas.push(`${t.rotulo}:`, ...itens);
  }
  return linhas.join("\n");
}

/** Lê e monta. Falha de leitura devolve vazio: escrever sem exemplo é o comportamento de antes. */
export async function exemplosAprovadosDoCanal(
  store: Pick<FilaStore, "aprovadasSemRetrabalho" | "edicoesDesde">,
  projectId: string,
  ramo: Ramo,
  agora: number = Date.now(),
): Promise<string> {
  try {
    const desde = inicioDaJanela(agora);
    const [aprovadas, edicoes] = await Promise.all([
      store.aprovadasSemRetrabalho(projectId, ramo, desde, 40),
      // Sem a tabela das edições (migration não rodada), segue sem o filtro: as editadas já carregam o motivo.
      store.edicoesDesde(projectId, desde, 500, ramo).catch(() => []),
    ]);
    const exemplos = escolherExemplos(ramo, aprovadas, {
      editadas: new Set(edicoes.map((e) => e.pecaId)),
      agora,
    });
    return montarBlocoDeExemplos(ramo, exemplos);
  } catch (erro) {
    console.warn(`[APRENDIZADO] exemplos do canal ${ramo} indisponíveis: ${erro instanceof Error ? erro.message : String(erro)}`);
    return "";
  }
}
