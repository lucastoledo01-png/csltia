import sharp from "sharp";
import { recorteDoCover, type CaixaNormalizada } from "@/lib/carousel-templates/bolha";
import { callOpenAIVisionJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import type { DeteccaoDeRostos } from "../social/bolha-sem-rosto";

/**
 * Onde estão os rostos da foto de fundo, como a PEÇA a mostra.
 *
 * Existe para a bolha da capa não cobrir ninguém (pedido do dono, 06/10/2026).
 * A pergunta é feita sobre o pedaço da foto que aparece na peça, e não sobre o
 * arquivo inteiro: a foto quase nunca tem a proporção 3:4 do canvas, e com
 * `object-fit: cover` o rosto que está no meio do arquivo pode estar em outro
 * lugar da peça. Recortar ANTES de perguntar faz a resposta do modelo já vir
 * nas coordenadas do canvas, sem conversão no meio para errar.
 *
 * O recorte é o de `recorteDoCover`, a mesma conta que o script da marca usa
 * para medir o brilho atrás do logotipo.
 *
 * Falha não vira "sem rosto". Sem chave, com a rede fora, com resposta fora do
 * esquema ou com coordenada fora da escala, a resposta é `ok: false`, e quem
 * decide a bolha a trata como recusa: capa sem bolha.
 */

const TEMPO_LIMITE_MS = 45_000;

/**
 * O tamanho do recorte enviado: 768x1024, a proporção do canvas.
 *
 * Grande o bastante para um rosto de fundo, pequeno o bastante para a imagem
 * caber em poucos blocos de cobrança. A precisão que importa é a de um círculo
 * de 300 a 475 pixels, não a de um contorno.
 */
const LARGURA_DO_ENVIO = 768;

const SISTEMA = `Você localiza ROSTOS HUMANOS numa fotografia.

A foto vai virar fundo de uma capa, e um círculo com outra foto será posto por
cima. O círculo nunca pode cobrir um rosto. Sua resposta decide onde ele pode
ficar, então errar para menos é grave: um rosto que você não marcou pode ficar
coberto.

Para CADA rosto humano visível, de frente, de perfil ou parcialmente coberto,
grande ou pequeno, inclusive rostos ao fundo, em cartazes, telas e quadros,
devolva uma caixa que cubra a CABEÇA INTEIRA: do alto do cabelo ao queixo, de
uma orelha à outra. Na dúvida sobre os limites, aumente a caixa.

Coordenadas em FRAÇÃO da imagem que você recebeu, de 0 a 1: x e y são o canto
superior esquerdo da caixa, largura e altura são o tamanho dela. A borda
esquerda é x = 0, a direita é x = 1; o topo é y = 0, a base é y = 1.

Sem rosto humano na foto, devolva a lista vazia. Estátua, desenho de pessoa e
manequim contam como rosto.`;

const ESQUEMA = {
  nome: "rostos_na_foto",
  esquema: {
    type: "object",
    additionalProperties: false,
    required: ["rostos"],
    properties: {
      rostos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "largura", "altura"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            largura: { type: "number" },
            altura: { type: "number" },
          },
        },
      },
    },
  },
};

type RespostaDoModelo = { rostos?: unknown };

/**
 * A resposta do modelo, conferida campo a campo.
 *
 * O esquema estrito garante a forma, não o sentido. Coordenada maior que 1
 * quase sempre é pixel no lugar de fração, e "corrigir" isso dividindo por
 * alguma coisa seria adivinhar onde está o rosto. É recusa.
 */
export function lerRostos(resposta: RespostaDoModelo): CaixaNormalizada[] | string {
  if (!Array.isArray(resposta.rostos)) return "resposta sem a lista de rostos";
  if (resposta.rostos.length > 40) return `${resposta.rostos.length} rostos: multidão, sem lugar seguro`;

  const caixas: CaixaNormalizada[] = [];
  for (const bruto of resposta.rostos) {
    const r = bruto as Record<string, unknown>;
    const x = Number(r.x);
    const y = Number(r.y);
    const largura = Number(r.largura);
    const altura = Number(r.altura);
    if (![x, y, largura, altura].every(Number.isFinite)) return "coordenada que não é número";
    if (x < -0.05 || y < -0.05 || x > 1.05 || y > 1.05 || largura > 1.05 || altura > 1.05) {
      return `coordenada fora da escala de 0 a 1 (${x}, ${y}, ${largura}, ${altura})`;
    }
    if (largura <= 0 || altura <= 0) return "caixa sem área";

    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    caixas.push({
      x: x0,
      y: y0,
      largura: Math.min(1, x + largura) - x0,
      altura: Math.min(1, y + altura) - y0,
    });
  }
  return caixas;
}

/** O pedaço da foto que a peça mostra, em JPEG, pronto para mandar ao modelo. */
export async function recortarComoNaPeca(
  bytes: Buffer,
  canvas: { width: number; height: number },
): Promise<Buffer> {
  // `rotate()` sem argumento aplica a orientação do EXIF, como o navegador faz
  // com a foto de fundo. Sem isso, foto de celular deitada teria o rosto
  // procurado no lugar errado.
  const { data, info } = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true });
  const r = recorteDoCover(info.width, info.height, canvas.width, canvas.height);
  const left = Math.max(0, Math.round(r.sx));
  const top = Math.max(0, Math.round(r.sy));
  const width = Math.min(info.width - left, Math.round(r.sw));
  const height = Math.min(info.height - top, Math.round(r.sh));

  const alturaDoEnvio = Math.round((LARGURA_DO_ENVIO * canvas.height) / canvas.width);
  return sharp(data)
    .extract({ left, top, width, height })
    .resize(LARGURA_DO_ENVIO, alturaDoEnvio, { fit: "fill" })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export type OpcoesDaDeteccao = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  canvas?: { width: number; height: number };
  modelo?: string;
};

/**
 * A memória por URL.
 *
 * A mesma foto de fundo pode ser perguntada mais de uma vez no dia: uma leva
 * extra, uma refação de arte, o ensaio antes do valendo. A resposta não muda,
 * então só a primeira paga. Falha não fica guardada: a próxima tenta de novo.
 */
const memoria = new Map<string, Promise<DeteccaoDeRostos>>();

export function esquecerRostos(): void {
  memoria.clear();
}

function falhou(motivo: string, custoUsd = 0, tokens = 0): DeteccaoDeRostos {
  return { ok: false, motivo, custoUsd, tokens };
}

async function baixar(url: string, fetcher: typeof fetch): Promise<Buffer> {
  const r = await fetcher(url, {
    headers: { "User-Agent": "imigra.us/1.0 (contato@imigra.us)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`foto respondeu ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.byteLength === 0) throw new Error("foto vazia");
  return buf;
}

async function perguntar(url: string, opcoes: OpcoesDaDeteccao): Promise<DeteccaoDeRostos> {
  const env = opcoes.env ?? process.env;
  const config = getAIProviderConfig(env);
  if (!config.isConfigured) return falhou("sem credencial de modelo para localizar rostos");

  const canvas = opcoes.canvas ?? { width: 1080, height: 1440 };
  const fetcher = opcoes.fetcher ?? fetch;
  const modelo = opcoes.modelo || env.OPENAI_MODEL_VISUAL || config.triageModel;

  let recorte: Buffer;
  try {
    recorte = await recortarComoNaPeca(await baixar(url, fetcher), canvas);
  } catch (erro) {
    return falhou(`não deu para abrir a foto: ${(erro as Error).message}`);
  }

  const mensagens = [
    { role: "system" as const, content: SISTEMA },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "Localize os rostos desta foto." },
        {
          type: "image_url" as const,
          image_url: { url: `data:image/jpeg;base64,${recorte.toString("base64")}`, detail: "high" as const },
        },
      ],
    },
  ];

  const chamar = (amostragem: { temperature?: number }) =>
    callOpenAIVisionJSON<RespostaDoModelo>(mensagens, modelo, env, fetcher, amostragem, TEMPO_LIMITE_MS, ESQUEMA);

  try {
    // Mesma cautela da conferência visual: o modelo de produção recusa
    // `temperature: 0` com 400, e a chamada é refeita sem o parâmetro.
    let dados;
    try {
      dados = await chamar({ temperature: 0 });
    } catch (erro) {
      if (!/temperature/i.test((erro as Error).message)) throw erro;
      dados = await chamar({});
    }
    const lidos = lerRostos(dados.data);
    const custo = dados.usage.estimatedCostUsd;
    const tokens = dados.usage.totalTokens;
    if (typeof lidos === "string") return falhou(`resposta recusada: ${lidos}`, custo, tokens);
    return { ok: true, rostos: lidos, custoUsd: custo, tokens, emCache: false, modelo };
  } catch (erro) {
    return falhou(`localização de rostos falhou: ${(erro as Error).message.slice(0, 200)}`);
  }
}

export async function detectarRostos(url: string, opcoes: OpcoesDaDeteccao = {}): Promise<DeteccaoDeRostos> {
  const alvo = (url ?? "").trim();
  if (!alvo) return falhou("foto sem endereço");

  const canvas = opcoes.canvas ?? { width: 1080, height: 1440 };
  const chave = `${canvas.width}x${canvas.height}|${alvo}`;
  const guardada = memoria.get(chave);
  if (guardada) {
    const r = await guardada;
    // Da memória não se paga de novo, e o registro diz que veio dela.
    return r.ok ? { ...r, custoUsd: 0, tokens: 0, emCache: true } : r;
  }

  const promessa = perguntar(alvo, { ...opcoes, canvas });
  memoria.set(chave, promessa);
  const resultado = await promessa;
  if (!resultado.ok) memoria.delete(chave);
  return resultado;
}
