/**
 * Que licença pode ser publicada, e como creditar.
 *
 * A regra que orienta tudo aqui: silêncio sobre direitos é recusa. Arquivo
 * hospedado em domínio governamental, arquivo bonito, arquivo que "todo mundo
 * usa", nada disso é licença. Se a origem não declara, não entra.
 */

export type LicencaAceita = {
  /** Como a licença aparece na origem, em minúsculas. */
  padrao: RegExp;
  /** Nome curto para registro. */
  nome: string;
  exigeAtribuicao: boolean;
  /** Permite guardar cópia própria do arquivo. */
  permiteCopia: boolean;
};

/**
 * Allowlist. Configurável por ambiente, e conservadora por padrão.
 *
 * Fica em lista de padrão e não em conjunto de strings porque a origem escreve
 * a mesma licença de cinco jeitos: "CC BY-SA 4.0", "Creative Commons
 * Attribution-Share Alike 4.0", "cc-by-sa-4.0".
 */
const ACEITAS: LicencaAceita[] = [
  { padrao: /(^|[^a-z])cc0([^a-z]|$)|creative commons zero/i, nome: "CC0", exigeAtribuicao: false, permiteCopia: true },
  { padrao: /public domain|pd-|dom[íi]nio p[úu]blico/i, nome: "Public Domain", exigeAtribuicao: false, permiteCopia: true },
  { padrao: /pd-usgov|work of the united states federal government/i, nome: "PD-USGov", exigeAtribuicao: false, permiteCopia: true },
  { padrao: /cc[ -]by[ -]sa/i, nome: "CC BY-SA", exigeAtribuicao: true, permiteCopia: true },
  { padrao: /cc[ -]by(?![ -]sa)(?![ -]nc)(?![ -]nd)/i, nome: "CC BY", exigeAtribuicao: true, permiteCopia: true },
];

/**
 * Recusa explícita, mesmo quando o texto contém "CC".
 *
 * NC proíbe uso comercial e a newsletter tem CTA de produto; ND proíbe obra
 * derivada, e recorte para o formato do e-mail é derivada. Melhor recusar do
 * que discutir depois.
 */
const RECUSADAS = /cc[ -]by[ -]nc|non[- ]commercial|cc[ -]by[ -]nd|no derivatives|fair use|all rights reserved|todos os direitos reservados/i;

export type VeredictoDeLicenca = {
  aceita: boolean;
  nome: string;
  exigeAtribuicao: boolean;
  permiteCopia: boolean;
  motivo: string;
};

export function avaliarLicenca(
  textoDaLicenca: string,
  env: Record<string, string | undefined> = process.env
): VeredictoDeLicenca {
  const texto = (textoDaLicenca || "").trim();

  if (!texto) {
    return {
      aceita: false,
      nome: "",
      exigeAtribuicao: false,
      permiteCopia: false,
      motivo: "origem não declara licença",
    };
  }

  if (RECUSADAS.test(texto)) {
    return {
      aceita: false,
      nome: texto.slice(0, 60),
      exigeAtribuicao: false,
      permiteCopia: false,
      motivo: "licença proíbe uso comercial, obra derivada, ou reserva todos os direitos",
    };
  }

  // A allowlist pode ser restringida por ambiente. Só restringida: acrescentar
  // licença nova exige mudar o código, que é onde a decisão deve ser tomada.
  const permitidas = (env.VISUAL_LICENCAS_ACEITAS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  for (const l of ACEITAS) {
    if (!l.padrao.test(texto)) continue;
    if (permitidas.length > 0 && !permitidas.includes(l.nome.toLowerCase())) continue;
    return {
      aceita: true,
      nome: l.nome,
      exigeAtribuicao: l.exigeAtribuicao,
      permiteCopia: l.permiteCopia,
      motivo: `licença reconhecida: ${l.nome}`,
    };
  }

  return {
    aceita: false,
    nome: texto.slice(0, 60),
    exigeAtribuicao: false,
    permiteCopia: false,
    motivo: `licença não está na allowlist: "${texto.slice(0, 40)}"`,
  };
}

/**
 * Linha de crédito.
 *
 * Quando a licença exige atribuição, ela é obrigação, não enfeite: sai embaixo
 * da foto mesmo que atrapalhe o layout. Quando não exige, devolve vazio, e o
 * template não desenha nada.
 */
export function montarAtribuicao(dados: {
  autor: string;
  fonte: string;
  licenca: string;
  exigeAtribuicao: boolean;
}): string {
  if (!dados.exigeAtribuicao) return "";
  const autor = limparAutor(dados.autor) || "autor não identificado";
  return [`Foto: ${autor}`, dados.fonte, dados.licenca].filter(Boolean).join(" / ");
}

/** O campo de autor do Commons vem com HTML dentro. */
export function limparAutor(bruto: string): string {
  return (bruto || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
