import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID } from "../projects";
import {
  bancoConfigurado,
  buscarFotoDeBanco,
  consultaDeBusca,
  type CreditoDaFoto,
} from "./stock";

/**
 * Etapas 4 e 5 — geração visual e prompt como asset.
 *
 * O invariante que desenha este módulo é o da etapa 5: **o prompt exato de
 * cada imagem é persistido no mesmo ato da geração, nunca reconstruído
 * depois.** Se o material entregue não corresponder ao método real, quem
 * comentou a keyword recebe um prompt que não reproduz o resultado do post —
 * e o funil inteiro perde a razão de existir.
 *
 * A garantia aqui é estrutural, não uma promessa em comentário: `montarPrompt`
 * é chamada **uma vez** por imagem, o resultado vai para uma constante, e essa
 * mesma constante é o que segue para a API e para o banco. Não existe caminho
 * em que os dois divirjam.
 */

const MODELO_IMAGEM = "gpt-image-1";
const TAMANHO = "1024x1536"; // retrato 2:3, próximo do 3:4 dos slides

/**
 * Direção visual fixada por conceito (etapa 4). Toda imagem da campanha herda
 * a mesma direção — é o que faz o carrossel parecer uma série e não seis
 * imagens soltas.
 *
 * Campos opcionais porque a IA da etapa 2 pode não preencher todos, e a
 * ausência de um não invalida a direção.
 */
export type DirecaoVisual = {
  composicao?: string;
  enquadramento?: string;
  iluminacao?: string;
  cenario?: string;
  tratamento?: string;
  textura?: string;
  atmosfera?: string;
  elementos_recorrentes?: string;
};

/** Ordem fixa dos atributos no prompt. */
const ORDEM: Array<keyof DirecaoVisual> = [
  "composicao",
  "enquadramento",
  "cenario",
  "iluminacao",
  "tratamento",
  "textura",
  "atmosfera",
  "elementos_recorrentes",
];

/**
 * Monta o prompt de uma aplicação do conceito.
 *
 * Determinística de propósito: a mesma direção e a mesma aplicação produzem
 * sempre a mesma string. É o que permite conferir depois que o prompt gravado
 * é o que gerou a imagem, e o que impede o texto entregue de mudar entre a
 * geração e a leitura.
 *
 * A instrução final contra texto na imagem não é estética: o slide recebe a
 * tipografia do template por cima, e palavra gerada pelo modelo aparece torta,
 * em inglês, e briga com a arte.
 */
export function montarPrompt(
  conceito: string,
  aplicacao: string,
  direcao: DirecaoVisual = {},
): string {
  const atributos = ORDEM.map((chave) => direcao[chave]?.trim())
    .filter((v): v is string => Boolean(v))
    .join(", ");

  const partes = [
    `${conceito.trim()} — ${aplicacao.trim()}.`,
    atributos ? `Visual direction: ${atributos}.` : "",
    "Photorealistic, high detail, editorial quality, vertical composition.",
    "ABSOLUTELY NO TEXT, NO WORDS, NO TYPOGRAPHY, NO LOGOS, NO WATERMARKS.",
  ];

  return partes.filter(Boolean).join(" ");
}

/**
 * Rótulo do asset a partir da aplicação: `PROMPT RETRATO`, `PROMPT CASAL`.
 *
 * O rótulo é chave única por campanha (`prompt_assets_campaign_label_key`), o
 * que impede duas aplicações homônimas virarem dois assets ambíguos na entrega
 * — "PROMPT RETRATO" qual?
 */
export function rotuloDoAsset(aplicacao: string): string {
  const limpo = aplicacao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

  return limpo ? `PROMPT ${limpo}` : "PROMPT BASE";
}

/**
 * O que a pessoa troca para adaptar ao caso dela.
 *
 * Texto curto e concreto: um prompt entregue sem dizer o que substituir é um
 * prompt que só serve para reproduzir o exemplo.
 */
export function notaDeSubstituicao(aplicacao: string, credito?: CreditoDaFoto | null): string {
  const base =
    `Troque "${aplicacao.trim()}" pelo seu caso — pessoa, produto, cidade ou ` +
    `profissão. O resto do prompt mantém a direção visual e não deve mudar.`;

  if (!credito) return base;

  // Sem o nome do fotógrafo: a licença do Pexels não exige atribuição, e a
  // decisão editorial é não creditar no post.
  //
  // O *método*, porém, continua declarado, e isso não é a mesma coisa que
  // crédito. Quem recebe o prompt e gera do zero não chega nesta imagem —
  // ela partiu de uma foto. Omitir isso entregaria um prompt que não
  // reproduz o post, que é justamente o que este módulo existe para impedir.
  return (
    `${base} Esta imagem partiu de uma foto real transformada pelo prompt — ` +
    `use uma foto sua como base para o mesmo efeito.`
  );
}

export type AssetGerado = {
  label: string;
  promptText: string;
  imageUrl: string | null;
  /** Preenchido só quando a imagem partiu de uma foto de banco. */
  credito?: CreditoDaFoto | null;
  erro?: string;
};

type GerarOpts = {
  fetcher?: typeof fetch;
  env?: Record<string, string | undefined>;
};

/**
 * Transforma uma foto de banco com o prompt, via `/v1/images/edits`.
 *
 * Partir de uma foto real produz cena crível; gerar do zero produz cena
 * inventada, e para conceito ancorado em lugar — uma rua, uma fachada — a
 * diferença é visível.
 *
 * Falha aqui não é erro: quem chama cai na geração do zero, que continua sendo
 * o caminho padrão.
 */
async function transformarFoto(
  prompt: string,
  fotoUrl: string,
  { fetcher = fetch, env = process.env }: GerarOpts,
): Promise<Buffer | null> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const baixada = await fetcher(fotoUrl);
    if (!baixada.ok) {
      console.warn(`[VISUAL] Não consegui baixar a foto de base (${baixada.status}).`);
      return null;
    }

    const bytes = new Uint8Array(await baixada.arrayBuffer());
    const form = new FormData();
    form.append("model", MODELO_IMAGEM);
    form.append("prompt", prompt);
    form.append("size", TAMANHO);
    form.append("quality", "high");
    form.append("n", "1");
    form.append("image", new Blob([bytes], { type: "image/jpeg" }), "base.jpg");

    // Sem Content-Type manual: o boundary do multipart é gerado pelo fetch.
    const res = await fetcher("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      console.warn(`[VISUAL] Transformação falhou (${res.status})`);
      return null;
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch (err) {
    console.warn("[VISUAL] Exceção na transformação:", err);
    return null;
  }
}

/** Gera a imagem e devolve o PNG. `null` quando não há chave ou a API falha. */
async function gerarImagem(
  prompt: string,
  { fetcher = fetch, env = process.env }: GerarOpts,
): Promise<Buffer | null> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetcher("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO_IMAGEM,
        prompt,
        n: 1,
        size: TAMANHO,
        quality: "high",
      }),
    });

    if (!res.ok) {
      console.warn(`[VISUAL] Geração falhou (${res.status})`);
      return null;
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch (err) {
    console.warn("[VISUAL] Exceção na geração:", err);
    return null;
  }
}

async function subirImagem(png: Buffer, caminho: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.storage
      .from("public_assets")
      .upload(caminho, png, { contentType: "image/png", upsert: true });

    if (error) {
      console.warn("[VISUAL] Upload falhou:", error.message);
      return null;
    }

    return supabase.storage.from("public_assets").getPublicUrl(caminho).data.publicUrl;
  } catch (err) {
    console.warn("[VISUAL] Exceção no upload:", err);
    return null;
  }
}

/**
 * Gera as imagens de uma campanha e grava cada prompt junto da sua imagem.
 *
 * Uma aplicação que falha não derruba as outras: a campanha com quatro imagens
 * de cinco é publicável, e o asset ausente aparece na entrega como pendente.
 * Abortar tudo por causa de uma recusa do modelo custaria o post do dia.
 *
 * O asset é gravado **mesmo quando a imagem falha**, com `image_url` nulo. O
 * prompt é o produto entregue; a imagem é a demonstração dele. Perder o prompt
 * porque a ilustração não saiu seria perder a parte que importa.
 */
export async function gerarAssetsDaCampanha(
  campaignId: string,
  opts: GerarOpts = {},
): Promise<{ campaignId: string; assets: AssetGerado[] }> {
  const supabase = getSupabaseAdminClient();

  const { data: campanha, error: erroCampanha } = await supabase
    .from("prompt_campaigns")
    .select("id, keyword, theme, concept_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (erroCampanha || !campanha) {
    throw new Error(`Campanha ${campaignId} não encontrada.`);
  }

  if (!campanha.concept_id) {
    throw new Error(
      "A campanha não tem conceito vinculado. As imagens saem das aplicações do " +
        "conceito (etapa 2) — sem ele não há o que gerar.",
    );
  }

  const { data: conceito } = await supabase
    .from("prompt_concepts")
    .select("concept, applications, visual_direction")
    .eq("id", campanha.concept_id)
    .maybeSingle();

  if (!conceito) throw new Error("Conceito vinculado não existe mais.");

  const aplicacoes = (Array.isArray(conceito.applications) ? conceito.applications : [])
    .map((a) => (typeof a === "string" ? a : String(a ?? "")))
    .map((a) => a.trim())
    .filter(Boolean);

  if (aplicacoes.length === 0) {
    throw new Error("O conceito não tem aplicações. Sem elas não há imagem para gerar.");
  }

  const direcao = (conceito.visual_direction ?? {}) as DirecaoVisual;
  const conceitoTexto = String(conceito.concept ?? campanha.theme ?? "").trim();
  const gerados: AssetGerado[] = [];

  for (const [i, aplicacao] of aplicacoes.entries()) {
    // O prompt é montado UMA vez. Esta constante é o que vai para a API e para
    // o banco — não há como divergirem.
    const promptText = montarPrompt(conceitoTexto, aplicacao, direcao);
    const label = rotuloDoAsset(aplicacao);

    // Foto de base, quando há banco configurado. A transformação vem antes da
    // geração do zero, e a geração do zero continua sendo o fallback: nenhuma
    // imagem deixa de existir porque o Pexels respondeu 429.
    const foto = bancoConfigurado(opts.env ?? process.env)
      ? await buscarFotoDeBanco(consultaDeBusca(aplicacao, conceitoTexto), opts)
      : null;

    const png = foto
      ? ((await transformarFoto(promptText, foto.imagemUrl, opts)) ??
        (await gerarImagem(promptText, opts)))
      : await gerarImagem(promptText, opts);

    const imageUrl = png
      ? await subirImagem(png, `prompt-system/${campanha.keyword}/${i + 1}-${Date.now()}.png`)
      : null;

    // O crédito só vale se a foto virou ESTA imagem. Quando a transformação
    // falha e o fallback gera do zero, creditar o fotógrafo seria atribuir a
    // ele uma imagem em que a foto dele não entrou.
    const credito = foto && png && imageUrl ? foto.credito : null;

    const { error } = await supabase.from("prompt_assets").upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        campaign_id: campaignId,
        label,
        prompt_text: promptText,
        model: MODELO_IMAGEM,
        image_url: imageUrl,
        substitution_notes: notaDeSubstituicao(aplicacao, credito),
        // Só entra no payload quando existe: assim o gerador continua rodando
        // em banco onde a coluna `stock_credit` ainda não foi criada, que é o
        // estado normal enquanto o banco de imagens está desligado.
        ...(credito ? { stock_credit: credito } : {}),
      },
      { onConflict: "campaign_id,label" },
    );

    gerados.push({
      label,
      promptText,
      imageUrl,
      credito,
      erro: error ? error.message : png ? undefined : "imagem não gerada",
    });
  }

  return { campaignId, assets: gerados };
}
