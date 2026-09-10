import { identidadeDoItem, todosOsItens, topicoDoItem } from "./tipos";
import type { ItemEvergreen, TopicoEvergreen, UsoAnterior } from "./tipos";

/**
 * Quais assuntos permanentes entram no feed de hoje.
 *
 * O risco do evergreen não é falta de assunto, é repetição. Um catálogo de cem
 * combinações com seleção ingênua produz, em duas semanas, três posts sobre
 * EB-2 NIW com títulos diferentes — e para quem acompanha o perfil isso não é
 * conteúdo, é o mesmo conteúdo de novo.
 *
 * Daí as quatro réguas abaixo, que resolvem quatro problemas diferentes:
 *
 *   cooldown do par tópico+ângulo  impede o MESMO post voltar
 *   janela do tópico               impede o mesmo assunto dominar a semana
 *   teto por programa no dia       impede o feed do dia virar monotema
 *   teto por família no dia        impede seis glossários seguidos
 *
 * A quarta é a que mais muda a cara do perfil. Sem ela, o catálogo tende ao
 * glossário: ele tem mais termos que qualquer outra família, e por isso ganharia
 * sempre no desempate.
 */

export type ConfigDoEvergreen = {
  /** Dias em que o mesmo tópico+ângulo não volta. */
  cooldownDoParEmDias: number;
  /** Dias em que o mesmo tópico não volta, mesmo por outro ângulo. */
  janelaDoTopicoEmDias: number;
  /** Quantos posts do mesmo programa (EB-2, H-1B) o dia aceita. */
  maximoPorProgramaNoDia: number;
  /** Quantos posts da mesma família o dia aceita. */
  maximoPorFamiliaNoDia: number;
  /**
   * Quantos posts permanentes o dia aceita, independentemente de vaga.
   *
   * Esta régua não existia, e a primeira simulação de sete dias mostrou por que
   * ela é obrigatória: sem ela o evergreen ocupou TODAS as vagas todos os dias,
   * sete dias fechando em dez, e queimou 64 das 180 combinações do catálogo em
   * uma semana. No vigésimo dia não haveria mais nada elegível, e o feed cairia
   * de dez para zero de um dia para o outro.
   *
   * A conta que fixa o teto: com cooldown de 30 dias por par, o regime
   * permanente é `combinações / 30`. Com 180 combinações isso dá 6 por dia
   * ocupando o catálogo inteiro, sem margem para a janela do tópico nem para os
   * tetos de diversidade. Quatro deixa folga e ainda tira o feed do zero.
   *
   * E é o que cumpre "nunca forçar 10": o teto do dia é um limite, não uma
   * meta. Dia com duas notícias sai com seis posts, não com dez.
   */
  maximoNoDia: number;
  /**
   * Varia o formato entre itens de mérito igual. É desempate, não quota.
   *
   * Ligada por padrão porque a medição de sete dias fechou dias inteiros com
   * quatro carrosséis seguidos, e nenhuma reordenação posterior resolve isso:
   * se os quatro escolhidos são carrossel, não há estático para intercalar.
   *
   * Existe como chave para poder ser DESLIGADA numa medição, e é assim que se
   * responde "quanto disto é a régua e quanto é o catálogo" sem discutir.
   */
  alternarFormato: boolean;
};

export const CONFIG_PADRAO: ConfigDoEvergreen = {
  cooldownDoParEmDias: 30,
  janelaDoTopicoEmDias: 7,
  maximoPorProgramaNoDia: 2,
  maximoPorFamiliaNoDia: 2,
  maximoNoDia: 4,
  alternarFormato: true,
};

export function carregarConfigDoEvergreen(
  env: Record<string, string | undefined> = process.env,
): ConfigDoEvergreen {
  const n = (chave: string, padrao: number) => {
    const v = Number(env[chave]);
    return Number.isFinite(v) && v > 0 ? v : padrao;
  };
  return {
    cooldownDoParEmDias: n("EVERGREEN_COOLDOWN_DIAS", CONFIG_PADRAO.cooldownDoParEmDias),
    janelaDoTopicoEmDias: n("EVERGREEN_JANELA_TOPICO_DIAS", CONFIG_PADRAO.janelaDoTopicoEmDias),
    maximoPorProgramaNoDia: n("EVERGREEN_MAX_POR_PROGRAMA", CONFIG_PADRAO.maximoPorProgramaNoDia),
    maximoPorFamiliaNoDia: n("EVERGREEN_MAX_POR_FAMILIA", CONFIG_PADRAO.maximoPorFamiliaNoDia),
    maximoNoDia: n("EVERGREEN_MAX_POR_DIA", CONFIG_PADRAO.maximoNoDia),
    /* Só um "false" explícito desliga: valor ausente ou irreconhecível mantém. */
    alternarFormato: String(env.EVERGREEN_ALTERNAR_FORMATO ?? "").trim().toLowerCase() !== "false",
  };
}

export type MotivoDoCorte =
  | "TETO_DO_DIA"
  | "TOPICO_JA_NO_DIA"
  | "COOLDOWN_DO_PAR"
  | "TOPICO_NA_JANELA"
  | "PROGRAMA_JA_NO_DIA"
  | "FAMILIA_JA_NO_DIA"
  | "SEM_VAGA";

export type CortadoDoEvergreen = {
  item: ItemEvergreen;
  motivo: MotivoDoCorte;
  detalhe: string;
};

export type OcupacaoDoDia = {
  /** Programas que a notícia já trouxe hoje, para o evergreen não repetir. */
  programas: string[];
};

export type SelecaoDoEvergreen = {
  escolhidos: ItemEvergreen[];
  cortados: CortadoDoEvergreen[];
  /** Quantos itens do catálogo estavam elegíveis antes das vagas limitarem. */
  elegiveis: number;
};

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * Ordena para variedade, e não por nota.
 *
 * Não existe "melhor" post evergreen: os itens do catálogo são todos
 * publicáveis. O que existe é mais ou menos repetido, e é isso que ordena —
 * quem não sai há mais tempo vem primeiro, e quem nunca saiu vem antes de
 * todos. O efeito é o catálogo girar inteiro em vez de orbitar os primeiros.
 */
function porDistanciaDoUltimoUso(
  itens: ItemEvergreen[],
  ultimoUso: Map<string, number>,
): ItemEvergreen[] {
  return [...itens].sort((a, b) => {
    const ua = ultimoUso.get(identidadeDoItem(a)) ?? 0;
    const ub = ultimoUso.get(identidadeDoItem(b)) ?? 0;
    if (ua !== ub) return ua - ub;
    // Empate entre nunca usados: ordem estável pelo id, para a simulação ser
    // reproduzível em vez de depender da ordem do catálogo.
    return identidadeDoItem(a).localeCompare(identidadeDoItem(b));
  });
}

/**
 * Os programas que um tópico ocupa, como o leitor os percebe.
 *
 * Duas coisas que a contagem por string exata errava:
 *
 * Primeira: "EB-2 NIW", "EB-2" e "EB-2 PERM" são três rótulos e um assunto só
 * para quem abre o feed. Contando exato, o teto de dois por programa deixava
 * passar três posts de EB-2 no mesmo dia, cada um sob um nome diferente.
 *
 * Segunda, e é a que só apareceu no teste: tópico de comparação declara DOIS
 * programas, como "EB-1A x EB-2 NIW". Ele é um post de EB-1A e também um post
 * de EB-2, e contar apenas o primeiro deixava o segundo teto sem defesa.
 *
 * Por isso a função devolve lista, e não string. O sufixo continua no catálogo
 * e no texto; ele só não conta duas vezes na diversidade.
 */
export function programasDoTopico(programa: string | undefined): string[] {
  const bruto = (programa ?? "").trim().toUpperCase();
  if (!bruto) return [];

  const siglas = [...bruto.matchAll(/\b([A-Z]{1,3}-\d{1,2}[A-Z]?)/g)].map((m) => m[1]);
  if (siglas.length > 0) return [...new Set(siglas)];

  /* Programa sem forma de sigla, como "PERM" ou "OPT": vale o primeiro token. */
  return [bruto.split(/\s+/)[0]];
}

/**
 * O formato que a família deste item provavelmente vai pedir.
 *
 * Só a família, porque é o que se sabe antes do lastro. Glossário e FAQ são
 * estáticos por padrão; as outras cinco preferem carrossel. Quem decide de
 * verdade é `determinarFormatoEvergreen`, depois, com o pacote factual na mão.
 */
export function formatoPrevisto(item: ItemEvergreen): "static" | "carousel" {
  return item.topico.familia === "glossary" || item.topico.familia === "faq" ? "static" : "carousel";
}

/**
 * Reordena a fila para variar o formato, sem tirar ninguém do lugar na régua.
 *
 * A ordem original é a de mérito, por distância do último uso. Esta função só
 * troca a ordem DENTRO de cada bloco de itens com a mesma distância, e por isso
 * nunca promove um item de mérito menor sobre um de mérito maior.
 *
 * Dentro do bloco, alterna os dois formatos previstos. É determinística: mesma
 * entrada, mesma saída, o que o dry-run exige.
 */
export function intercalarPorFormato(
  fila: ItemEvergreen[],
  ultimoUsoDoPar: Map<string, number>,
): ItemEvergreen[] {
  const blocos = new Map<number, ItemEvergreen[]>();
  const ordemDosBlocos: number[] = [];

  for (const item of fila) {
    const distancia = ultimoUsoDoPar.get(identidadeDoItem(item)) ?? 0;
    if (!blocos.has(distancia)) {
      blocos.set(distancia, []);
      ordemDosBlocos.push(distancia);
    }
    blocos.get(distancia)!.push(item);
  }

  const saida: ItemEvergreen[] = [];

  for (const distancia of ordemDosBlocos) {
    const bloco = blocos.get(distancia)!;
    const estaticos = bloco.filter((i) => formatoPrevisto(i) === "static");
    const carrosseis = bloco.filter((i) => formatoPrevisto(i) === "carousel");

    /*
     * Um por vez, começando pelo formato mais numeroso do bloco.
     *
     * Começar pelo majoritário é o que faz a minoria ficar espalhada em vez de
     * empilhada no fim, que é o mesmo raciocínio de `alternarFormatos`.
     */
    const [maior, menor] = carrosseis.length >= estaticos.length ? [carrosseis, estaticos] : [estaticos, carrosseis];

    for (let i = 0; i < Math.max(maior.length, menor.length); i += 1) {
      if (maior[i]) saida.push(maior[i]);
      if (menor[i]) saida.push(menor[i]);
    }
  }

  return saida;
}

export function selecionarEvergreen(
  catalogo: TopicoEvergreen[],
  historico: UsoAnterior[],
  vagas: number,
  opcoes: {
    agoraMs: number;
    config?: ConfigDoEvergreen;
    ocupacaoDoDia?: OcupacaoDoDia;
  },
): SelecaoDoEvergreen {
  const config = opcoes.config ?? CONFIG_PADRAO;
  const cortados: CortadoDoEvergreen[] = [];

  /*
   * O teto do evergreen vale sobre as vagas, e não o contrário.
   *
   * Dez vagas livres não autorizam dez posts permanentes: o que limita é o que
   * o catálogo sustenta, e o dia sai menor de propósito.
   */
  const limite = Math.min(vagas, config.maximoNoDia);

  if (limite <= 0) {
    return { escolhidos: [], cortados, elegiveis: 0 };
  }

  /* Último uso por par e por tópico, em milissegundos. */
  const ultimoUsoDoPar = new Map<string, number>();
  const ultimoUsoDoTopico = new Map<string, number>();
  for (const uso of historico) {
    const t = Date.parse(uso.quandoIso);
    if (!Number.isFinite(t)) continue;
    if (t > (ultimoUsoDoPar.get(uso.storyId) ?? 0)) ultimoUsoDoPar.set(uso.storyId, t);
    if (t > (ultimoUsoDoTopico.get(uso.topicId) ?? 0)) ultimoUsoDoTopico.set(uso.topicId, t);
  }

  const elegiveis: ItemEvergreen[] = [];

  for (const item of todosOsItens(catalogo)) {
    const idade = (mapa: Map<string, number>, chave: string) => {
      const quando = mapa.get(chave);
      return quando === undefined ? Infinity : (opcoes.agoraMs - quando) / DIA_EM_MS;
    };

    const diasDoPar = idade(ultimoUsoDoPar, identidadeDoItem(item));
    if (diasDoPar < config.cooldownDoParEmDias) {
      cortados.push({
        item,
        motivo: "COOLDOWN_DO_PAR",
        detalhe: `saiu há ${diasDoPar.toFixed(0)} dia(s); o mesmo tópico e ângulo só volta depois de ${config.cooldownDoParEmDias}`,
      });
      continue;
    }

    const diasDoTopico = idade(ultimoUsoDoTopico, topicoDoItem(item));
    if (diasDoTopico < config.janelaDoTopicoEmDias) {
      cortados.push({
        item,
        motivo: "TOPICO_NA_JANELA",
        detalhe: `o tópico "${item.topico.nome}" saiu há ${diasDoTopico.toFixed(0)} dia(s); a janela é ${config.janelaDoTopicoEmDias}`,
      });
      continue;
    }

    elegiveis.push(item);
  }

  /*
   * A ocupação da notícia entra na conta da diversidade.
   *
   * Se o News já trouxe uma pauta de F-1 hoje, um evergreen de F-1 faz o dia
   * parecer monotema mesmo com dois posts diferentes. O feed é do leitor, e ele
   * não sabe qual dos dois nasceu de notícia.
   */
  const porPrograma: Record<string, number> = {};
  for (const p of opcoes.ocupacaoDoDia?.programas ?? []) {
    for (const base of programasDoTopico(p)) porPrograma[base] = (porPrograma[base] ?? 0) + 1;
  }
  const porFamilia: Record<string, number> = {};
  /*
   * Um tópico por dia, e esta régua faltava.
   *
   * A janela de sete dias olha o HISTÓRICO, e por isso não via dois ângulos do
   * mesmo tópico escolhidos na MESMA rodada: nenhum dos dois estava no
   * histórico ainda. O preview de três dias mostrou o resultado — dois posts
   * seguidos sobre comprovação de investimento, um sobre a origem do dinheiro e
   * outro sobre o caminho dele, no mesmo dia.
   *
   * Para o leitor que abre o feed, isso é o mesmo assunto duas vezes. É
   * exatamente o defeito que as réguas de repetição existem para impedir, e ele
   * escapou por estar do lado de dentro do dia.
   */
  const topicosDoDia = new Set<string>();

  const escolhidos: ItemEvergreen[] = [];

  /*
   * Desempate de formato, e só desempate.
   *
   * O benchmark deu dias fechando com quatro carrosséis seguidos, e nenhuma
   * reordenação depois da geração resolve isso: se os quatro escolhidos são
   * carrossel, não há estático para intercalar. Quem pode quebrar a sequência é
   * a SELEÇÃO, e só ela.
   *
   * A régua age exclusivamente entre itens IGUALMENTE BONS, que aqui tem
   * definição exata: mesmo tempo desde o último uso do par. A maioria dos
   * elegíveis nunca saiu, então empata em zero, e o desempate atual é
   * alfabético. Trocar "alfabético" por "o que varia o formato" não sacrifica
   * conteúdo nenhum: sacrificaria se olhasse itens de distâncias diferentes, e
   * é justamente isso que `mesmaDistancia` impede.
   *
   * O formato aqui é PREVISTO pela família, porque o formato real depende de
   * quantos fatos o lastro trouxe e o lastro ainda não foi buscado. Previsão
   * errada custa uma sequência não quebrada, não um post pior.
   */
  const naOrdem = porDistanciaDoUltimoUso(elegiveis, ultimoUsoDoPar);
  const fila = config.alternarFormato ? intercalarPorFormato(naOrdem, ultimoUsoDoPar) : naOrdem;

  for (const item of fila) {
    if (escolhidos.length >= limite) {
      const porTeto = limite < vagas;
      cortados.push({
        item,
        motivo: porTeto ? "TETO_DO_DIA" : "SEM_VAGA",
        detalhe: porTeto
          ? `o teto de ${config.maximoNoDia} post(s) permanente(s) por dia já foi atingido, com ${vagas} vaga(s) livre(s)`
          : `as ${vagas} vaga(s) do dia já foram ocupadas`,
      });
      continue;
    }

    if (topicosDoDia.has(item.topico.id)) {
      cortados.push({
        item,
        motivo: "TOPICO_JA_NO_DIA",
        detalhe: `o tópico "${item.topico.nome}" já tem um post hoje, por outro ângulo`,
      });
      continue;
    }

    const programas = programasDoTopico(item.topico.programa);
    const cheio = programas.find((p) => (porPrograma[p] ?? 0) >= config.maximoPorProgramaNoDia);
    if (cheio) {
      cortados.push({
        item,
        motivo: "PROGRAMA_JA_NO_DIA",
        detalhe: `${cheio} já tem ${porPrograma[cheio]} post(s) hoje, contando os de notícia`,
      });
      continue;
    }

    if ((porFamilia[item.topico.familia] ?? 0) >= config.maximoPorFamiliaNoDia) {
      cortados.push({
        item,
        motivo: "FAMILIA_JA_NO_DIA",
        detalhe: `a família ${item.topico.familia} já tem ${porFamilia[item.topico.familia]} post(s) hoje`,
      });
      continue;
    }

    escolhidos.push(item);
    topicosDoDia.add(item.topico.id);
    for (const p of programas) porPrograma[p] = (porPrograma[p] ?? 0) + 1;
    porFamilia[item.topico.familia] = (porFamilia[item.topico.familia] ?? 0) + 1;
  }

  return { escolhidos, cortados, elegiveis: elegiveis.length };
}
