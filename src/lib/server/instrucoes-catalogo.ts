import { LEITOR, REGRA_RELEVANCIA } from "./editorial/linha-editorial";
import { INSTRUCAO_PADRAO_ASSUNTO, INSTRUCAO_PADRAO_NEWSLETTER } from "./newsroom/pipeline";
import { INSTRUCAO_PADRAO_CARROSSEL } from "./social/carrossel/copy";
import { INSTRUCAO_PADRAO_SOCIAL_COPY } from "./social/copy";
import { MODELO_DA_REGRA_DA_MANCHETE } from "./social/manchete";
import { VOZ_SOCIAL } from "./social/voz";
import type { EtapaEditorial } from "./instrucoes";

/**
 * O que o painel mostra de cada etapa editável.
 *
 * Separado de `instrucoes.ts` porque este arquivo importa os prompts, e os
 * prompts importam `instrucoes.ts`: juntos, seria um ciclo de importação.
 */

export type DescricaoDaEtapa = {
  etapa: EtapaEditorial;
  rotulo: string;
  /** Onde o texto entra, em linguagem de quem opera. */
  usadaEm: string;
  /** O texto do código, que vale enquanto não houver versão ativa. */
  padrao: string;
  /** O que NÃO está aqui, para ninguém procurar no lugar errado. */
  foraDoEditavel: string;
};

export const CATALOGO_DE_ETAPAS: DescricaoDaEtapa[] = [
  {
    etapa: "linha_editorial_leitor",
    rotulo: "Linha editorial: o leitor",
    usadaEm: "Classificador da coleta e verificador do Instagram, os dois com o mesmo texto.",
    padrao: LEITOR,
    foraDoEditavel: "Os valores de país, leitura e eixo, que o schema da classificação confere.",
  },
  {
    etapa: "linha_editorial_relevancia",
    rotulo: "Linha editorial: régua de relevância",
    usadaEm: "Classificador e verificador. Mudar invalida as classificações em cache, de propósito.",
    padrao: REGRA_RELEVANCIA,
    foraDoEditavel: "A escala de 0 a 10 é lida pelo código como número; mantenha-a.",
  },
  {
    etapa: "newsletter_redacao",
    rotulo: "Newsletter: redação",
    usadaEm: "Redator da edição (newsletter e portal).",
    padrao: INSTRUCAO_PADRAO_NEWSLETTER,
    foraDoEditavel: "Nome, nicho e briefing do projeto, a assinatura final e a estrutura do JSON.",
  },
  {
    etapa: "newsletter_assunto",
    rotulo: "Newsletter: assunto do e-mail",
    usadaEm: "Redator da edição, ao escrever subject e subject_options.",
    padrao: INSTRUCAO_PADRAO_ASSUNTO,
    foraDoEditavel: "A estrutura do JSON de saída.",
  },
  {
    etapa: "manchete",
    rotulo: "Instagram: manchete da capa",
    usadaEm: "Post de imagem única e carrossel.",
    padrao: MODELO_DA_REGRA_DA_MANCHETE,
    foraDoEditavel:
      "Os tetos de palavras e caracteres. Os marcadores {{minimo_de_palavras}} e afins são preenchidos pelo código com os números que a guarda confere.",
  },
  {
    etapa: "social_copy",
    rotulo: "Instagram: post de imagem única",
    usadaEm: "Copy do post de imagem única.",
    padrao: INSTRUCAO_PADRAO_SOCIAL_COPY,
    foraDoEditavel: "O canal, a regra do pacote factual, a ordem da legenda e o JSON.",
  },
  {
    etapa: "carrossel_copy",
    rotulo: "Instagram: carrossel",
    usadaEm: "Copy do carrossel.",
    padrao: INSTRUCAO_PADRAO_CARROSSEL,
    foraDoEditavel: "Os papéis dos slides, os tetos de caractere e o JSON.",
  },
  {
    etapa: "voz_social",
    rotulo: "Instagram: voz de rede social",
    usadaEm: "Post de imagem única e carrossel, com o mesmo texto.",
    padrao: VOZ_SOCIAL,
    foraDoEditavel: "Nada além do próprio bloco.",
  },
];

export function descricaoDaEtapa(etapa: string): DescricaoDaEtapa | null {
  return CATALOGO_DE_ETAPAS.find((d) => d.etapa === etapa) ?? null;
}
