/**
 * Etapa 3 — guardrail de propriedade intelectual.
 *
 * O Sistema PROMPT vive de pegar carona em tendência cultural, e tendência
 * cultural quase sempre pertence a alguém: um jogo, um filme, um artista, uma
 * marca. A linha que não pode ser cruzada é estreita e vale escrever:
 *
 * **Pode** — inspirar-se em características visuais gerais: paleta, tipo de
 * iluminação, gênero de composição, atmosfera, época. "Retrato com paleta neon
 * e grão de filme dos anos 80" não pertence a ninguém.
 *
 * **Não pode** — reproduzir logo, key art, pôster, personagem ou qualquer peça
 * protegida; nem enquadrar a imagem gerada como material oficial, vazamento,
 * anúncio ou colaboração. O segundo é pior que o primeiro: uma imagem parecida
 * é discutível, mas dizer que é oficial é afirmação falsa sobre a marca de
 * outro, e é o que o doc de incidentes já registra como risco de parecer
 * afiliação não autorizada.
 *
 * O veredito é gravado em `prompt_concepts.ip_check` junto do conceito que ele
 * aprovou — mesmo princípio do QA do newsroom: a decisão fica ao lado do
 * conteúdo, não num log que ninguém acha depois.
 */

/** Termos que, no texto do conceito, indicam reprodução em vez de inspiração. */
const REPRODUCAO = [
  "logo",
  "logotipo",
  "key art",
  "keyart",
  "poster oficial",
  "pôster oficial",
  "capa oficial",
  "arte oficial",
  "marca registrada",
  "trademark",
];

/**
 * Termos que afirmam ser material oficial — o risco mais grave.
 *
 * Alguns são radicais em vez de palavras inteiras, porque o português flexiona:
 * "licenciada" não casaria com "licenciado", e o guardrail passaria batido
 * justamente na variação mais natural de escrever.
 */
const FALSA_OFICIALIDADE = [
  "material oficial",
  "arte oficial",
  "anuncio oficial",
  "vazamento",
  "leak",
  "em parceria com",
  "colaboracao oficial",
  "patrocinad", // patrocinado, patrocinada
  "autorizad", // autorizado, autorizada
  "licenciad", // licenciado, licenciada, licenciados
];

export type VeredictoPI = {
  aprovado: boolean;
  motivos: string[];
  /** O que precisa mudar para passar. Vazio quando aprovado. */
  correcoes: string[];
  verificadoEm: string;
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Checagem determinística sobre o texto do conceito.
 *
 * É de propósito **anterior** a qualquer chamada de modelo: um termo explícito
 * de reprodução ou de falsa oficialidade é reprovação objetiva, e gastar uma
 * chamada de LLM para confirmar o obvio só adiciona latência e a chance de o
 * modelo relativizar o que não é relativizável.
 *
 * Não substitui julgamento humano nem cobre tudo — imagem pode copiar uma peça
 * protegida sem que o texto diga isso. É um piso, não um teto.
 */
export function checarPropriedadeIntelectual(entrada: {
  conceito: string;
  hook?: string;
  aplicacoes?: string[];
  direcaoVisual?: Record<string, unknown>;
}): VeredictoPI {
  const alvo = normalizar(
    [
      entrada.conceito,
      entrada.hook ?? "",
      ...(entrada.aplicacoes ?? []),
      JSON.stringify(entrada.direcaoVisual ?? {}),
    ].join(" \n "),
  );

  const motivos: string[] = [];
  const correcoes: string[] = [];

  const reproduz = REPRODUCAO.filter((t) => alvo.includes(normalizar(t)));
  if (reproduz.length) {
    motivos.push(`Pede reprodução de peça protegida: ${reproduz.join(", ")}.`);
    correcoes.push(
      "Troque a referência à peça por características visuais gerais — paleta, " +
        "iluminação, gênero de composição, atmosfera, época.",
    );
  }

  const finge = FALSA_OFICIALIDADE.filter((t) => alvo.includes(normalizar(t)));
  if (finge.length) {
    motivos.push(`Enquadra o resultado como oficial ou autorizado: ${finge.join(", ")}.`);
    correcoes.push(
      "Remova qualquer afirmação de oficialidade, parceria, licença ou vazamento. " +
        "O conteúdo é uma recriação autoral inspirada numa estética, e precisa se " +
        "apresentar como tal.",
    );
  }

  return {
    aprovado: motivos.length === 0,
    motivos,
    correcoes,
    verificadoEm: new Date().toISOString(),
  };
}

/**
 * Instrução que entra no prompt da etapa 2, para o modelo já produzir conceito
 * dentro da linha em vez de produzir fora e ser reprovado depois.
 *
 * Reprovar depois funciona, mas custa uma chamada e devolve o operador ao
 * início. Instruir antes é mais barato e produz conceito melhor.
 */
export const INSTRUCAO_PI = `
LIMITE DE PROPRIEDADE INTELECTUAL — obrigatório:
- Você pode se inspirar em características visuais GERAIS de uma obra ou marca:
  paleta, tipo de iluminação, gênero de composição, atmosfera, época, textura.
- Você NÃO pode pedir reprodução de logo, logotipo, key art, pôster, capa,
  personagem reconhecível ou qualquer peça protegida.
- Você NÃO pode enquadrar o resultado como material oficial, arte oficial,
  vazamento, anúncio, parceria, licença ou colaboração. O conteúdo é recriação
  autoral inspirada numa estética, e tem que se apresentar como tal.
- Quando a tendência envolver franquia, artista ou marca, descreva a ESTÉTICA,
  nunca a peça. "Retrato com paleta neon saturada e grão de filme dos anos 80"
  serve; "no estilo do pôster do filme X" não serve.
`.trim();
