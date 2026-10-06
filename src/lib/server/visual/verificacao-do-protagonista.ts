import { callOpenAIVisionJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { normalizarEntidade } from "./tipos";
import { paraConferir, type VeredictoVisual } from "./conferencia-visual";

/**
 * A conferência de IDENTIDADE e de MARCA (06/10/2026, "imagem certeira").
 *
 * A conferência visual de sempre pergunta se a foto pode acompanhar a
 * manchete. Para o protagonista nomeado isso é pouco: ela olha UMA foto e
 * julga plausibilidade, e uma foto de "homem de terno num palco" é plausível
 * para qualquer CEO. O dono pediu certeza, então a pergunta muda:
 *
 *   pessoa   a candidata vai junto com um RETRATO DE REFERÊNCIA da pessoa, de
 *            fonte confiável (o P18 do Wikidata), e o modelo responde se é a
 *            MESMA pessoa, e se ela está em destaque. Na dúvida, não.
 *   marca    o modelo transcreve o texto da marca que LÊ na foto, e o código
 *            confere que o nome da empresa está nesse texto. A transcrição é
 *            conferida por nós, e não pelo modelo: "sim, é a marca" sem ler o
 *            nome é o tipo de aprovação que esta régua existe para recusar.
 *
 * Falha de conferência é recusa, como em toda a régua visual (17/09/2026).
 */

const TEMPO_LIMITE_MS = 45_000;

/** O piso da identidade é mais alto que o da conferência comum (70): errar a pessoa é o erro mais caro. */
export const PISO_DA_IDENTIDADE = 85;
export const PISO_DA_MARCA = 80;

export type VeredictoDeIdentidade = VeredictoVisual & {
  /** O que o modelo respondeu, separado, para o registro em `content_json.visual`. */
  mesmaPessoa?: boolean;
  emDestaque?: boolean;
};

export type VeredictoDeMarca = VeredictoVisual & {
  textoLido?: string;
  marcaLegivel?: boolean;
  sedeReconhecivel?: boolean;
};

type Opcoes = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  modelo?: string;
};

function falhou(motivo: string): VeredictoVisual {
  return { aprovada: false, descricao: "", motivo, paisAparente: null, confianca: 0, falhou: true };
}

async function chamar<T>(
  sistema: string,
  conteudo: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>,
  opcoes: Opcoes,
): Promise<T> {
  const env = opcoes.env ?? process.env;
  const config = getAIProviderConfig(env);
  const modelo = opcoes.modelo || env.OPENAI_MODEL_VISUAL || config.triageModel;
  const mensagens = [
    { role: "system" as const, content: sistema },
    { role: "user" as const, content: conteudo },
  ];
  const ir = (amostragem: { temperature?: number }) =>
    callOpenAIVisionJSON<T>(mensagens, modelo, env, opcoes.fetcher ?? fetch, amostragem, TEMPO_LIMITE_MS);
  try {
    return (await ir({ temperature: 0 })).data;
  } catch (erro) {
    // O modelo de produção recusa `temperature: 0` (ver conferencia-visual.ts).
    if (!/temperature/i.test((erro as Error).message)) throw erro;
    return (await ir({})).data;
  }
}

const SISTEMA_DA_IDENTIDADE = `Você confere a IDENTIDADE de uma pessoa numa foto de notícia.

Você recebe duas imagens. A IMAGEM 1 é um retrato de referência, de fonte
confiável, de uma pessoa cujo nome é informado. A IMAGEM 2 é a candidata a foto
da notícia.

Responda:
- se a pessoa EM DESTAQUE na imagem 2 (a maior, a mais central, o assunto da
  foto) é a MESMA pessoa da imagem 1. Compare traços do rosto (formato, olhos,
  nariz, boca, orelhas, linha do cabelo), não roupa, cenário nem pose. A idade
  pode ser outra: a referência pode ser de anos antes.
- se ela está em destaque: rosto visível e reconhecível, ocupando parte
  relevante da foto. Pessoa pequena ao fundo, de costas, de perfil escondido,
  ou uma entre várias do mesmo tamanho NÃO está em destaque.

RECUSE (mesmaPessoa false) quando não tiver certeza. Parecida não basta. Se o
rosto da imagem 2 não dá para comparar, a resposta é false.
RECUSE também (aprovada false) se a imagem 2 é montagem, caricatura, desenho,
captura de tela, tem texto dominando a imagem, ou é de baixa qualidade.

Responda só com JSON:
{
  "descricao": "o que você vê na imagem 2, em uma frase, em português",
  "mesmaPessoa": true ou false,
  "emDestaque": true ou false,
  "aprovada": true ou false,
  "motivo": "uma frase em português dizendo por quê",
  "confianca": número de 0 a 100
}`;

export async function conferirIdentidade(
  candidata: { imageUrl: string },
  referencia: { nome: string; url: string },
  opcoes: Opcoes = {},
): Promise<VeredictoDeIdentidade> {
  const env = opcoes.env ?? process.env;
  if (!getAIProviderConfig(env).isConfigured) return falhou("sem credencial de modelo para conferir a identidade");
  if (!candidata.imageUrl?.startsWith("http") || !referencia.url?.startsWith("http")) {
    return falhou("sem endereço público da candidata ou da referência");
  }
  type R = { descricao?: unknown; mesmaPessoa?: unknown; emDestaque?: unknown; aprovada?: unknown; motivo?: unknown; confianca?: unknown };
  let r: R;
  try {
    r = await chamar<R>(
      SISTEMA_DA_IDENTIDADE,
      [
        { type: "text", text: `PESSOA: ${referencia.nome}\nIMAGEM 1: retrato de referência de ${referencia.nome}.\nIMAGEM 2: candidata.` },
        { type: "image_url", image_url: { url: paraConferir(referencia.url) } },
        { type: "image_url", image_url: { url: paraConferir(candidata.imageUrl) } },
      ],
      opcoes,
    );
  } catch (erro) {
    return falhou(`conferência de identidade falhou: ${(erro as Error).message}`);
  }
  const confianca = Number(r.confianca);
  if (typeof r.mesmaPessoa !== "boolean" || typeof r.emDestaque !== "boolean" || !Number.isFinite(confianca)) {
    return falhou("conferência de identidade devolveu resposta em formato inesperado");
  }
  const descricao = typeof r.descricao === "string" ? r.descricao.trim() : "";
  const motivo = typeof r.motivo === "string" ? r.motivo.trim() : "sem motivo declarado";
  /*
   * As três têm de dizer sim: a mesma pessoa, em destaque, e a foto utilizável.
   * O modelo às vezes devolve `aprovada: true` com `mesmaPessoa: false`; quem
   * decide é a combinação, não o campo de cima.
   */
  const aprovada = r.mesmaPessoa === true && r.emDestaque === true && r.aprovada !== false && confianca >= PISO_DA_IDENTIDADE;
  return {
    aprovada,
    descricao,
    motivo: aprovada
      ? `identidade conferida contra o retrato de referência de ${referencia.nome}: ${motivo}`
      : `identidade NÃO conferida (mesma pessoa: ${r.mesmaPessoa ? "sim" : "não"}, em destaque: ${r.emDestaque ? "sim" : "não"}, confiança ${Math.round(confianca)}): ${motivo}`,
    paisAparente: null,
    confianca: Math.max(0, Math.min(100, Math.round(confianca))),
    falhou: false,
    mesmaPessoa: r.mesmaPessoa,
    emDestaque: r.emDestaque,
  };
}

const SISTEMA_DA_MARCA = `Você confere se uma imagem mostra a MARCA de uma empresa ou organização.

Você recebe o nome da organização e uma imagem. Ela pode ser uma FOTO (fachada,
sede, loja, produto, veículo, evento) ou um LOGOTIPO.

Faça duas coisas:
1. Transcreva, letra por letra, o texto de marca que você LÊ na imagem (o nome
   no letreiro, no produto, no logotipo). Só o que está escrito e legível. Se
   nada é legível, escreva "".
2. Diga se a marca da organização informada está na imagem, LEGÍVEL e EM
   DESTAQUE (não minúscula, não cortada, não ao fundo), e se a imagem pode ser
   capa de notícia sobre ela.
3. Diga se a imagem mostra a SEDE oficial dessa organização, reconhecível por
   si só, mesmo sem texto (o Capitólio para o Congresso americano, o prédio do
   Supremo Tribunal Federal em Brasília, a Casa Branca). Prédio parecido,
   genérico ou que você não reconhece com certeza é false.

RECUSE quando: a marca não aparece ou não dá para ler; aparece cortada, pela
metade ou distorcida; a marca em destaque é de OUTRA empresa; a imagem tem uma
pessoa identificável em primeiro plano que não é o assunto; é montagem,
captura de tela de site, anúncio ou imagem de baixa qualidade.
EXCEÇÃO: se a organização é ÓRGÃO PÚBLICO ou INSTITUIÇÃO e a foto mostra a sede
dela, reconhecível com certeza, "aprovada" pode ser true sem texto legível.

Responda só com JSON:
{
  "descricao": "o que você vê, em uma frase, em português",
  "textoLido": "o texto de marca que você lê, exatamente",
  "marcaLegivel": true ou false,
  "sedeReconhecivel": true ou false,
  "aprovada": true ou false,
  "motivo": "uma frase em português dizendo por quê",
  "confianca": número de 0 a 100
}`;

/** O nome da marca está no texto que o modelo leu? Por palavra forte, sem acento nem caixa. */
export function textoLidoTemAMarca(textoLido: string, nome: string, apelidos: string[] = []): boolean {
  const lido = ` ${normalizarEntidade(textoLido)} `;
  const compacto = lido.replace(/\s+/g, "");
  if (!lido.trim()) return false;
  const nomes = [nome, ...apelidos].map(normalizarEntidade).filter(Boolean);
  const fracas = new Set(["inc", "corp", "corporation", "company", "group", "industries", "technologies", "platforms", "the", "de", "do", "da"]);
  return nomes.some((n) => {
    if (lido.includes(` ${n} `)) return true;
    /*
     * "SPACE X" lido para "SpaceX": junta as letras. Só para nome de seis
     * letras ou mais, porque "meta" caberia dentro de "metaverse" e "x" dentro
     * de qualquer coisa.
     */
    const junto = n.replace(/\s+/g, "");
    if (junto.length >= 6 && compacto.includes(junto)) return true;
    // "Anduril Industries" lido como "ANDURIL": a palavra forte do nome basta.
    const fortes = n.split(" ").filter((p) => p.length >= 3 && !fracas.has(p));
    return fortes.length > 0 && lido.includes(` ${fortes[0]} `);
  });
}

export async function conferirMarca(
  candidata: { imageUrl: string },
  marca: {
    nome: string;
    apelidos?: string[];
    tipo: "foto" | "logotipo";
    /**
     * Órgão público e instituição têm sede que É a identidade deles (o
     * Capitólio, o prédio do STF), e a foto da sede reconhecida vale sem texto.
     * Empresa não: a régua dela é o nome lido na imagem.
     */
    instituicao?: boolean;
  },
  opcoes: Opcoes = {},
): Promise<VeredictoDeMarca> {
  const env = opcoes.env ?? process.env;
  if (!getAIProviderConfig(env).isConfigured) return falhou("sem credencial de modelo para conferir a marca");
  // O cartão do logotipo vai como `data:` (06/10/2026): é a peça composta aqui, antes de a rota existir no ar.
  if (!/^(https?:|data:image\/)/.test(candidata.imageUrl ?? "")) return falhou("sem endereço público da imagem");
  type R = {
    descricao?: unknown;
    textoLido?: unknown;
    marcaLegivel?: unknown;
    sedeReconhecivel?: unknown;
    aprovada?: unknown;
    motivo?: unknown;
    confianca?: unknown;
  };
  let r: R;
  try {
    r = await chamar<R>(
      SISTEMA_DA_MARCA,
      [
        {
          type: "text",
          text:
            `ORGANIZAÇÃO: ${marca.nome}\nTIPO DE ORGANIZAÇÃO: ${marca.instituicao ? "órgão público ou instituição" : "empresa"}\n` +
            `TIPO DA IMAGEM: ${marca.tipo === "logotipo" ? "logotipo" : "foto"}`,
        },
        { type: "image_url", image_url: { url: paraConferir(candidata.imageUrl) } },
      ],
      opcoes,
    );
  } catch (erro) {
    return falhou(`conferência de marca falhou: ${(erro as Error).message}`);
  }
  const confianca = Number(r.confianca);
  if (typeof r.aprovada !== "boolean" || !Number.isFinite(confianca)) {
    return falhou("conferência de marca devolveu resposta em formato inesperado");
  }
  const textoLido = typeof r.textoLido === "string" ? r.textoLido.trim() : "";
  const descricao = typeof r.descricao === "string" ? r.descricao.trim() : "";
  const motivo = typeof r.motivo === "string" ? r.motivo.trim() : "sem motivo declarado";
  const leuONome = textoLidoTemAMarca(textoLido, marca.nome, marca.apelidos);
  const pelaMarca = r.marcaLegivel === true && leuONome;
  const pelaSede = Boolean(marca.instituicao) && marca.tipo === "foto" && r.sedeReconhecivel === true && confianca >= PISO_DA_IDENTIDADE;
  const aprovada = r.aprovada === true && (pelaMarca || pelaSede) && confianca >= PISO_DA_MARCA;
  return {
    aprovada,
    descricao,
    motivo: aprovada
      ? pelaMarca
        ? `marca conferida: o modelo leu "${textoLido}" na imagem. ${motivo}`
        : `sede de ${marca.nome} reconhecida na foto. ${motivo}`
      : `marca NÃO conferida (leu "${textoLido || "nada"}"${leuONome ? "" : `, sem o nome "${marca.nome}"`}, confiança ${Math.round(confianca)}): ${motivo}`,
    paisAparente: null,
    confianca: Math.max(0, Math.min(100, Math.round(confianca))),
    falhou: false,
    textoLido,
    marcaLegivel: r.marcaLegivel === true,
    sedeReconhecivel: r.sedeReconhecivel === true,
  };
}
