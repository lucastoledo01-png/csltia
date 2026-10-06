import type { PautaAvaliada } from "../editorial/guarda";
import type { ConfigSocial } from "../social/selecao";
import type { ConfigEditorial } from "../editorial/config";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { RegistroHistorico } from "../editorial/history";
import type { PautaOrdenavel } from "../editorial/pontuacao";
import { comporEdicao } from "../editorial/pontuacao";
import { cosseno } from "../editorial/embeddings";
import { dominioDe } from "../editorial/url-canonica";
import { verificarRepeticao } from "../editorial/repeticao";
import { entidadesDaClassificacao } from "../editorial/classificador";

/**
 * A seleção de cada ramo, sobre o MESMO pool aprovado.
 *
 * O pool é a camada comum: tudo que passou pela linha editorial, pela fonte
 * resolvida, pelo enriquecimento e pela repetição. Daqui para baixo cada canal
 * escolhe com a própria régua, e a mesma pauta pode sair nos três. O que não
 * pode é repetir DENTRO do canal: duas matérias da edição sobre o mesmo fato,
 * ou o mesmo artigo publicado duas vezes no portal.
 *
 * E nenhum ramo escolhe pauta sem pacote factual (RF-05). O pacote é a única
 * matéria-prima de redação; pauta sem ele chegaria ao redator como texto cru,
 * que é como a edição de validação inventou uma operação policial.
 */

/** Teto de matérias do portal por dia (RF-12). */
export const TETO_DO_PORTAL = 3;
/** Teto de posts do Instagram por dia no ramo próprio (RF-15). */
export const TETO_DO_INSTAGRAM = 5;

function ordenavel(p: PautaAvaliada): PautaOrdenavel<PautaAvaliada> {
  return {
    item: p,
    pontuacao: p.pontuacao,
    classificacao: p.classificacao,
    dominio: dominioDe(p.grupo.primary.url),
    vetor: p.vetor,
  };
}

/**
 * O par mais parecido da seleção, quando passa do limiar.
 *
 * `comporEdicao` já agrupa por vetor ao compor. Esta é a conferência
 * INDEPENDENTE da saída: se a composição mudar amanhã, ou uma pauta entrar
 * por outro caminho, a seleção que repete o acontecimento é pega aqui, e não
 * pelo leitor.
 */
export function eventoRepetido(
  pautas: PautaAvaliada[],
  limiar: number,
): { a: string; b: string; score: number } | null {
  if (!(limiar > 0)) return null;
  let pior: { a: string; b: string; score: number } | null = null;
  for (let i = 0; i < pautas.length; i += 1) {
    for (let j = i + 1; j < pautas.length; j += 1) {
      const va = pautas[i].vetor;
      const vb = pautas[j].vetor;
      if (!va?.length || !vb?.length) continue;
      const score = cosseno(va, vb);
      if (score >= limiar && (pior === null || score > pior.score)) {
        pior = { a: pautas[i].grupo.primary.title, b: pautas[j].grupo.primary.title, score };
      }
    }
  }
  return pior;
}

export type SelecaoDoRamo = {
  escolhidas: PautaAvaliada[];
  /** Saíram por não ter pacote factual. */
  semPacote: string[];
  /** Saíram por já terem sido publicadas NESTE canal. */
  repetidasNoCanal: Array<{ titulo: string; motivo: string }>;
  /** Saíram por contar o mesmo acontecimento de outra já escolhida. */
  mesmoAcontecimento: number;
  linhasDeLog: string[];
};

type OpcoesDaComposicao = {
  maximo: number;
  /** Ausente: não filtra por pacote. É o modo de PRÉ-seleção. */
  pacotes?: Map<string, PacoteFactual>;
  /** Canal cujo histórico proíbe repetir. Ausente: não confere. */
  canalDoHistorico?: RegistroHistorico["canal"];
  historico?: RegistroHistorico[];
  /**
   * Pautas proibidas neste canal, por `storyId`. Hoje são as que ficaram sem
   * foto (`sem-foto.ts`, 05/10/2026): elas saem ANTES da composição, para a
   * vaga ir para a próxima elegível em vez de o canal encolher.
   */
  excluir?: ReadonlySet<string>;
};

function comporRamo(
  pool: PautaAvaliada[],
  config: ConfigEditorial,
  opcoes: OpcoesDaComposicao,
  rotulo: string,
): SelecaoDoRamo {
  const semPacote: string[] = [];
  const repetidasNoCanal: Array<{ titulo: string; motivo: string }> = [];
  const linhas: string[] = [];

  const elegiveis = pool.filter((p) => {
    if (opcoes.excluir?.has(p.storyId)) return false;
    if (opcoes.pacotes && !opcoes.pacotes.has(p.grupo.primary.url)) {
      semPacote.push(p.grupo.primary.title);
      return false;
    }
    if (opcoes.canalDoHistorico && opcoes.historico && opcoes.historico.length > 0) {
      const veredito = verificarRepeticao(
        {
          titulo: p.grupo.primary.title,
          url: p.grupo.primary.url,
          resumo: p.enriquecimento?.texto,
          publicadoEm: p.grupo.primary.published_at,
          entidades: entidadesDaClassificacao(p.classificacao),
          vetor: p.vetor,
        },
        opcoes.historico,
        opcoes.canalDoHistorico,
        config,
      );
      if (veredito.repetida) {
        repetidasNoCanal.push({ titulo: p.grupo.primary.title, motivo: veredito.explicacao });
        return false;
      }
    }
    return true;
  });

  const composicao = comporEdicao(
    elegiveis.map(ordenavel),
    { ...config, maximoDePautas: opcoes.maximo },
  );
  let escolhidas = composicao.escolhidas.map((e) => e.item);

  // A conferência independente. Ver `eventoRepetido`.
  let repetido = eventoRepetido(escolhidas, config.limiarDeAgrupamento);
  while (repetido) {
    const fora = repetido.b;
    linhas.push(
      `[RAMO ${rotulo}] conferência pegou o mesmo acontecimento (${repetido.score.toFixed(3)}), sai: ${fora.slice(0, 60)}`,
    );
    escolhidas = escolhidas.filter((p) => p.grupo.primary.title !== fora);
    repetido = eventoRepetido(escolhidas, config.limiarDeAgrupamento);
  }

  linhas.push(
    `[RAMO ${rotulo}] ${escolhidas.length} escolhida(s) de ${pool.length} no pool, teto ${opcoes.maximo}` +
      (semPacote.length ? `, ${semPacote.length} sem pacote factual` : "") +
      (repetidasNoCanal.length ? `, ${repetidasNoCanal.length} já publicada(s) no canal` : "") +
      (composicao.absorvidas.length ? `, ${composicao.absorvidas.length} pelo mesmo acontecimento` : ""),
  );

  return {
    escolhidas,
    semPacote,
    repetidasNoCanal,
    mesmoAcontecimento: composicao.absorvidas.length,
    linhasDeLog: linhas,
  };
}

/**
 * Quais pautas merecem pacote factual hoje, antes de ele existir.
 *
 * O pacote custa uma chamada por pauta, e o pool passa de vinte. Montar para
 * todas pagaria pacote de pauta que nenhum canal vai usar. A pré-seleção
 * compõe cada ramo com folga (o pacote pode falhar), e só a união delas recebe
 * pacote. A seleção FINAL de cada ramo vem depois, já exigindo o pacote.
 */
export function preSelecaoParaPacote(
  pool: PautaAvaliada[],
  config: ConfigEditorial,
  historico: RegistroHistorico[],
  folga = 2,
  excluir?: ReadonlySet<string>,
): PautaAvaliada[] {
  const daNewsletter = comporRamo(
    pool,
    config,
    { maximo: config.maximoDePautas + folga, excluir },
    "newsletter",
  ).escolhidas;
  const doPortal = comporRamo(
    pool,
    config,
    { maximo: TETO_DO_PORTAL + folga, canalDoHistorico: "article", historico, excluir },
    "artigo",
  ).escolhidas;

  const porUrl = new Map<string, PautaAvaliada>();
  for (const p of [...daNewsletter, ...doPortal]) porUrl.set(p.grupo.primary.url, p);
  return [...porUrl.values()];
}

/**
 * A edição da newsletter (RF-07): de 2 a 4 pautas, nenhum acontecimento
 * repetido, todas com pacote factual.
 *
 * O piso é o maior entre o mínimo configurado e dois, pelo mesmo motivo do
 * pipeline: o schema da edição recusa uma pauta só.
 */
export function selecionarParaNewsletter(
  pool: PautaAvaliada[],
  pacotes: Map<string, PacoteFactual>,
  config: ConfigEditorial,
  excluir?: ReadonlySet<string>,
): SelecaoDoRamo & { viavel: boolean; motivo: string } {
  const r = comporRamo(pool, config, { maximo: config.maximoDePautas, pacotes, excluir }, "newsletter");
  const piso = Math.max(config.minimoDePautas, 2);
  const viavel = r.escolhidas.length >= piso;
  return {
    ...r,
    viavel,
    motivo: viavel
      ? `${r.escolhidas.length} pauta(s) com pacote factual`
      : `${r.escolhidas.length} pauta(s) com pacote factual, mínimo ${piso}` +
        (r.semPacote.length ? ` (${r.semPacote.length} sem pacote)` : ""),
  };
}

/**
 * As matérias do portal (RF-12): até três por dia, de qualquer pauta aprovada
 * com pacote, inclusive as que a newsletter não levou. O que já saiu no portal
 * nos últimos trinta dias não sai de novo.
 */
export function selecionarParaPortal(
  pool: PautaAvaliada[],
  pacotes: Map<string, PacoteFactual>,
  historico: RegistroHistorico[],
  config: ConfigEditorial,
  teto: number = TETO_DO_PORTAL,
  excluir?: ReadonlySet<string>,
): SelecaoDoRamo {
  return comporRamo(
    pool,
    config,
    {
      maximo: Math.max(0, Math.min(teto, TETO_DO_PORTAL)),
      pacotes,
      canalDoHistorico: "article",
      historico,
      excluir,
    },
    "artigo",
  );
}

/**
 * A composição da newsletter pela guarda, sem algumas pautas.
 *
 * Quando os ramos não mandam, a edição é a `selecionadas` de `avaliarPautas`,
 * que é `comporEdicao` sobre o pool aprovado. Para a pauta sem foto ceder a
 * vaga à próxima (05/10/2026), a mesma composição é refeita sem as proibidas.
 * Sem proibidas, devolve a seleção original intacta: nenhuma mudança de
 * comportamento quando todas têm foto.
 */
export function recomporNewsletterDaGuarda(
  pool: PautaAvaliada[],
  selecionadasOriginais: PautaAvaliada[],
  config: ConfigEditorial,
  excluir: ReadonlySet<string>,
): { escolhidas: PautaAvaliada[]; viavel: boolean; motivo: string } {
  const escolhidas =
    excluir.size === 0
      ? selecionadasOriginais
      : comporEdicao(pool.filter((p) => !excluir.has(p.storyId)).map(ordenavel), config).escolhidas.map((e) => e.item);
  const viavel = escolhidas.length >= config.minimoDePautas;
  return {
    escolhidas,
    viavel,
    motivo: viavel
      ? `${escolhidas.length} pauta(s) com foto`
      : `${escolhidas.length} pauta(s) aprovada(s) com foto, mínimo ${config.minimoDePautas}`,
  };
}

/**
 * O pool do Instagram (RF-15): o aprovado do dia mais as candidatas extras.
 *
 * As extras são a porta para os perfis de referência e as fontes do feed, que
 * estão sendo construídos em paralelo (05/10/2026). Elas entram como pauta
 * avaliada, ou seja já classificadas e com pontuação, e atravessam a MESMA
 * verificação e composição do feed: chegar por outra porta não dispensa régua.
 * A mesma pauta pelas duas portas conta uma vez.
 */
export function poolDoInstagram(pool: PautaAvaliada[], extras: PautaAvaliada[] = []): PautaAvaliada[] {
  const vistos = new Set<string>();
  const saida: PautaAvaliada[] = [];
  for (const p of [...pool, ...extras]) {
    const chaves = [p.storyId, p.grupo.primary.url].filter(Boolean);
    if (chaves.some((c) => vistos.has(c))) continue;
    for (const c of chaves) vistos.add(c);
    saida.push(p);
  }
  return saida;
}

/**
 * O teto do ramo só BAIXA o teto do ambiente, nunca sobe.
 *
 * O ramo pede cinco. Um ambiente que já pede três continua pedindo três: quem
 * baixou o volume no painel da hospedagem tinha um motivo, e o ramo não sabe
 * qual é. Sem teto, a configuração volta intacta.
 */
export function limitarTetoDoDia(config: ConfigSocial, teto?: number): ConfigSocial {
  if (teto === undefined || !Number.isFinite(teto) || teto < 0) return config;
  return {
    ...config,
    maximoPorDia: Math.min(config.maximoPorDia, teto),
    alvoPorDia: Math.min(config.alvoPorDia, teto),
  };
}
