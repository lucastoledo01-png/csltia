import { z } from "zod";
import { callOpenAIJSON } from "../newsroom/ai-provider";
import type { ConfigEditorial } from "./config";
import { MOTIVOS } from "./config";
import type { Motivo } from "./config";
import type { Entidades } from "./fingerprint";

/**
 * Classificação editorial da pauta, antes de escrever.
 *
 * A ordem aqui é deliberada: classificar primeiro, escrever depois. Filtrar
 * durante a redação levaria o modelo a maquiar uma pauta ruim para ela caber
 * na linha editorial, e a linha é de seleção, não de maquiagem. Notícia
 * negativa sobre os EUA não entra; ela não é reescrita para parecer boa.
 *
 * A classificação sai do modelo, não de lista de palavras. Uma lista diria que
 * "deportação" é negativo e erraria a matéria sobre uma decisão que barra
 * deportação. O que a lista faz bem é outra coisa: nada.
 *
 * Entidades saem na mesma chamada porque são a mesma leitura do texto, e
 * porque a camada de repetição por ator e acontecimento depende delas.
 */

export const ClassificacaoSchema = z.object({
  id: z.string(),
  /** EUA, Brasil ou outro. "outro" cobre terceiro país e assunto sem país. */
  pais: z.enum(["EUA", "Brasil", "outro"]),
  /** A pauta trata de imigração, visto, status ou vida do imigrante? */
  imigracao: z.boolean(),
  /**
   * Como a notícia chega a quem quer se mudar para os EUA. Não é o tom do
   * texto: é o efeito do fato sobre o projeto de vida do leitor.
   */
  leitura: z.enum(["oportunidade", "neutra", "desfavoravel"]),
  eixo: z.enum([
    "oportunidade",
    "processo",
    "decisao_judicial",
    "custo_de_vida",
    "deterioracao_brasil",
    "outro",
  ]),
  /** 0 a 10, o quanto muda a vida de quem planeja a mudança. */
  relevancia: z.number().min(0).max(10),
  atores: z.array(z.string()).default([]),
  lugares: z.array(z.string()).default([]),
  acontecimento: z.array(z.string()).default([]),
  justificativa: z.string().default(""),
});

export type Classificacao = z.infer<typeof ClassificacaoSchema>;

export const RespostaDoClassificadorSchema = z.object({
  pautas: z.array(ClassificacaoSchema),
});

export type PautaClassificavel = {
  id: string;
  titulo: string;
  descricao: string;
  fonte: string;
  url: string;
};

export function montarSystemDoClassificador(): string {
  return `
Você classifica notícias para uma publicação brasileira sobre imigração para os Estados Unidos.
O leitor é brasileiro e quer se mudar para os EUA legalmente.

Para cada notícia, devolva:

pais: "EUA" se o fato acontece nos Estados Unidos ou é decidido por autoridade americana. "Brasil" se acontece no Brasil ou é decidido por autoridade brasileira. "outro" nos demais casos.

imigracao: true quando a notícia trata de visto, green card, cidadania, asilo, fronteira, USCIS, consulado, status migratório, trabalho de estrangeiro ou vida de imigrante nos EUA.

leitura: como o FATO afeta o projeto de mudança do leitor, não o tom do texto.
- "oportunidade": abre, amplia, acelera, barateia ou protege um caminho. Exemplos: prazo estendido, nova categoria de visto, decisão que impede deportação, mais vagas, processo mais rápido.
- "neutra": informa sem mudar o caminho em nenhuma direção. Consulta pública, nomeação, dado estatístico, mudança de formulário.
- "desfavoravel": fecha, encarece, atrasa ou ameaça um caminho, ou retrata os EUA como lugar hostil, perigoso ou arbitrário. Exemplos: taxa maior, prazo maior, batida policial, prisão de imigrante, agente acusado de crime, corte de cota.

eixo: o assunto central.
- "oportunidade": abertura de caminho, programa, vaga, benefício.
- "processo": trâmite, formulário, prazo, taxa, consulado.
- "decisao_judicial": corte, juiz, liminar, processo criminal.
- "custo_de_vida": moradia, salário, imposto, câmbio.
- "deterioracao_brasil": instituições, tributação, economia, segurança jurídica ou insegurança no Brasil.
- "outro": o que não couber acima.

relevancia: 0 a 10. Quanto o fato muda, na prática, o plano de quem quer morar nos EUA. Nomeação de cargo sem efeito prático é 1. Mudança de prazo de um formulário que milhares usam é 8.

atores: órgãos, empresas, tribunais e pessoas citados. Nomes curtos, como aparecem ("USCIS", "ICE", "Suprema Corte", "STF").
lugares: cidades, estados e países citados.
acontecimento: 1 a 3 substantivos do que aconteceu ("prorrogação", "liminar", "prisão", "aumento de taxa").

justificativa: uma frase curta explicando a leitura escolhida.

Classifique o que está escrito. Não deduza intenção, não suavize e não agrave. Devolva JSON: {"pautas": [...]} com um objeto por notícia, preservando o "id" recebido.
`.trim();
}

export function montarUserDoClassificador(pautas: PautaClassificavel[]): string {
  const lista = pautas
    .map(
      (p) =>
        `id: ${p.id}\ntitulo: ${p.titulo}\nfonte: ${p.fonte}\nurl: ${p.url}\nresumo: ${p.descricao.slice(0, 600)}`
    )
    .join("\n\n---\n\n");

  return `Classifique as ${pautas.length} notícias abaixo.\n\n${lista}`;
}

/**
 * Classifica em uma chamada só.
 *
 * Falha aqui interrompe. A alternativa seria seguir sem classificação, e
 * seguir sem classificação é publicar sem o filtro editorial, que é o
 * contrário do que este módulo existe para fazer.
 */
export async function classificarPautas(
  pautas: PautaClassificavel[],
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ classificacoes: Map<string, Classificacao>; custoUsd: number }> {
  if (pautas.length === 0) return { classificacoes: new Map(), custoUsd: 0 };

  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoClassificador() },
      { role: "user", content: montarUserDoClassificador(pautas) },
    ],
    modelo,
    env,
    fetcher
  );

  const parsed = RespostaDoClassificadorSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Classificador devolveu formato inválido: ${parsed.error.message}`);
  }

  const mapa = new Map<string, Classificacao>();
  for (const c of parsed.data.pautas) mapa.set(c.id, c);

  return { classificacoes: mapa, custoUsd: usage.estimatedCostUsd };
}

export function entidadesDaClassificacao(c: Classificacao): Entidades {
  return { atores: c.atores, lugares: c.lugares, acontecimento: c.acontecimento };
}

export type DecisaoEditorial = {
  aprovada: boolean;
  motivo: Motivo;
  explicacao: string;
};

/**
 * A regra de seleção.
 *
 * Notícia desfavorável sobre os EUA não entra. Isso é decisão do dono da
 * publicação, tomada depois de eu levantar o custo de o leitor ficar sem
 * informação relevante para decidir a mudança, e reafirmada. Fica registrada
 * aqui como regra explícita, com código próprio no log, para que o efeito
 * dela seja auditável e reversível numa linha, em vez de virar um viés
 * espalhado pelos prompts.
 *
 * Sobre o Brasil, o negativo entra: é o outro lado da mesma comparação.
 */
export function decidirPauta(c: Classificacao, config: ConfigEditorial): DecisaoEditorial {
  if (c.pais === "EUA" && c.leitura === "desfavoravel") {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_EUA_NEGATIVO,
      explicacao: `EUA com leitura desfavorável: ${c.justificativa || "sem justificativa"}`,
    };
  }

  const piso = config.relevanciaMinima;
  if (c.relevancia < piso) {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_RELEVANCIA,
      explicacao: `relevância ${c.relevancia} abaixo do piso ${piso}`,
    };
  }

  if (c.pais === "Brasil") {
    // Assunto brasileiro só entra pelo eixo que interessa ao leitor que
    // pensa em sair: instituição, tributo, economia, segurança. Notícia
    // brasileira qualquer não é pauta desta publicação.
    const noEixo = c.eixo === "deterioracao_brasil" || c.eixo === "custo_de_vida" || c.imigracao;
    if (!noEixo) {
      return {
        aprovada: false,
        motivo: MOTIVOS.REJEITADO_RELEVANCIA,
        explicacao: `Brasil fora do eixo editorial (eixo ${c.eixo})`,
      };
    }
    return {
      aprovada: true,
      motivo: MOTIVOS.APROVADO_DESAFIO_BRASIL,
      explicacao: `Brasil, eixo ${c.eixo}, relevância ${c.relevancia}`,
    };
  }

  if (c.pais === "outro" && !c.imigracao) {
    return {
      aprovada: false,
      motivo: MOTIVOS.REJEITADO_SEM_CLASSIFICACAO,
      explicacao: "fora de EUA e Brasil e sem relação com imigração",
    };
  }

  if (c.imigracao) {
    return {
      aprovada: true,
      motivo: MOTIVOS.APROVADO_IMIGRACAO,
      explicacao: `imigração, leitura ${c.leitura}, relevância ${c.relevancia}`,
    };
  }

  return {
    aprovada: true,
    motivo: MOTIVOS.APROVADO_OPORTUNIDADE_EUA,
    explicacao: `EUA, leitura ${c.leitura}, eixo ${c.eixo}, relevância ${c.relevancia}`,
  };
}
