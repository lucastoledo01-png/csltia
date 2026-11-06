import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creditoDoAsset, htmlDoCredito, legendaNeutra } from "@/lib/credito-da-capa";
import { enderecoLimpoDaImagem } from "@/lib/imagem-da-capa";
import { htmlDaLegenda } from "@/lib/server/legenda-da-capa";
import { depsDaFila } from "@/lib/server/aprovacao/integracao";
import { gravarComAFila } from "@/lib/server/aprovacao/manutencao";
import { comoProjetoDaFila } from "@/lib/server/aprovacao/rotas";
import type { Aprovacao } from "@/lib/server/aprovacao/contrato";
import { criarGanchosDeProducao, mundoDeProducao } from "@/lib/server/aprovacao/ganchos-de-producao";
import { paraConferir } from "@/lib/server/visual/conferencia-visual";
import { arquivoDoCommons, buscarNoCommons, candidatoParaAsset } from "@/lib/server/visual/wikimedia";
import { assetDoBanco } from "@/lib/server/visual/resolver";
import { buscarFotosDeBanco } from "@/lib/server/prompt-system/stock";
import type { AssetVisual, EntidadeVisual, ResultadoVisual } from "@/lib/server/visual/tipos";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { linkDoPainel } from "./dia";
import type { AcessoDoMcp } from "./tokens";

/**
 * O Claude troca a foto de uma peça na fila (06/11/2026).
 *
 * O caso que motivou: a matéria da XP saiu sem capa, a Bruna reprovou a
 * imagem no painel, o resolvedor do servidor respondeu "não achou outra foto"
 * e a peça voltou como estava. O Claude dela, no chat, disse que não tinha
 * como mexer. No motor Claude quem conserta é o Claude: ele busca, VÊ as
 * candidatas e escolhe, como na tarefa `escolher_foto`.
 *
 * O que fica com a plataforma, para a escolha não virar porta aberta:
 *
 * - a busca é só em fonte de licença conferida (Commons pela allowlist de
 *   `avaliarLicenca`, Pexels e Unsplash pelo provedor); endereço solto da web
 *   não entra;
 * - o crédito é relido da origem na troca (Commons) ou vem assinado pela
 *   própria busca (banco), nunca escrito pelo Claude;
 * - a troca passa pela fila como qualquer manutenção (`gravarComAFila`): peça
 *   aguardando reentra com o hash novo e continua esperando o dono; peça em
 *   refação ou aprovada e não liberada não é tocada.
 *
 * A arte do post é recongelada pelo mesmo gancho da refação da fila.
 */

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; error: string; status: number };
type Imagem = { mime: string; base64: string };

const recusa = (status: number, error: string): Resposta => ({ ok: false, error, status });

const MAXIMO_DA_BUSCA = 8;

function segredo(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || "";
  if (!s) throw new Error("sem segredo para assinar a candidata de foto");
  return s;
}

function assinar(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url").slice(0, 32);
}

/** O id da candidata do banco carrega o asset e uma assinatura: o Claude devolve o id, e não o crédito. */
export function idDoBanco(asset: AssetVisual): string {
  const corpo = Buffer.from(
    JSON.stringify({ u: asset.imageUrl, p: asset.sourcePageUrl, a: asset.author, l: asset.license, t: asset.attribution, v: (asset.metadata?.provedor as string) ?? "" }),
  ).toString("base64url");
  return `b:${corpo}.${assinar(corpo)}`;
}

export function assetDoId(id: string): { tipo: "commons"; arquivo: string } | { tipo: "banco"; asset: AssetVisual } | null {
  if (id.startsWith("c:")) {
    const arquivo = id.slice(2).trim();
    return arquivo ? { tipo: "commons", arquivo } : null;
  }
  if (!id.startsWith("b:")) return null;
  const [corpo, assinatura] = id.slice(2).split(".");
  if (!corpo || !assinatura) return null;
  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Record<string, string>;
    const entidade = entidadeDaBusca("foto escolhida pelo Claude");
    const asset = assetDoBanco(
      { imagemUrl: d.u, credito: { provedor: d.v === "unsplash" ? "unsplash" : "pexels", fotografo: d.a, fotoUrl: d.p, atribuicao: d.t } } as never,
      entidade,
      process.env,
    );
    return { tipo: "banco", asset };
  } catch {
    return null;
  }
}

function entidadeDaBusca(consulta: string): EntidadeVisual {
  return {
    nome: consulta,
    normalizado: consulta.toLowerCase(),
    tipo: "conceptual",
    qid: null,
    imagemPrincipal: null,
    categoriaCommons: null,
    siteOficial: null,
    origem: "escolha do Claude no MCP",
    confianca: 100,
    evidencias: ["escolhida pelo Claude, vendo a imagem"],
  } as EntidadeVisual;
}

async function baixarPrevia(url: string): Promise<Imagem | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "eua.journal/1.0" } });
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.byteLength > 4_500_000) return null;
    return { mime: r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", base64: buffer.toString("base64") };
  } catch {
    return null;
  }
}

/** Prévia leve: 640 px no Commons, e o corte pequeno do Pexels e do Unsplash. */
function previaLeve(url: string): string {
  const commons = paraConferir(url);
  if (commons !== url) return commons.replace(/\/1280px-/, "/640px-");
  if (/images\.pexels\.com/.test(url)) return `${url.split("?")[0]}?auto=compress&cs=tinysrgb&w=640`;
  if (/images\.unsplash\.com/.test(url)) return `${url.split("?")[0]}?w=640&q=70`;
  return url;
}

export async function buscarImagens(
  _acesso: AcessoDoMcp,
  args: { consulta?: unknown; fonte?: unknown; quantas?: unknown },
): Promise<Resposta> {
  const consulta = typeof args.consulta === "string" ? args.consulta.trim() : "";
  if (consulta.length < 2) return recusa(400, "informe a consulta (em inglês costuma render mais no Commons e no Pexels)");
  const fonte = args.fonte === "commons" || args.fonte === "banco" ? args.fonte : "todas";
  const quantas = Math.min(MAXIMO_DA_BUSCA, Math.max(1, Number(args.quantas ?? 6) || 6));

  const candidatas: Array<{ id: string; fonte: string; autor: string; licenca: string; pagina: string; descricao: string; previa: string }> = [];
  const avisos: string[] = [];

  if (fonte !== "banco") {
    try {
      const { candidatos } = await buscarNoCommons(entidadeDaBusca(consulta), { limite: 20 });
      for (const c of candidatos) {
        if (candidatas.length >= quantas) break;
        const conv = candidatoParaAsset(c, entidadeDaBusca(consulta));
        if (!conv.ok) continue;
        if (c.largura && c.largura < 800) continue;
        candidatas.push({
          id: `c:${c.arquivo}`,
          fonte: "Wikimedia Commons",
          autor: conv.asset.author ?? "",
          licenca: conv.asset.license ?? "",
          pagina: c.paginaUrl,
          descricao: (c.descricao ?? "").replace(/<[^>]+>/g, "").slice(0, 160),
          previa: previaLeve(c.imageUrl),
        });
      }
    } catch (e) {
      avisos.push(`Commons falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (fonte !== "commons" && candidatas.length < quantas) {
    try {
      const fotos = await buscarFotosDeBanco(consulta, quantas - candidatas.length);
      for (const f of fotos) {
        const asset = assetDoBanco(f, entidadeDaBusca(consulta), process.env);
        candidatas.push({
          id: idDoBanco(asset),
          fonte: f.credito.provedor === "unsplash" ? "Unsplash" : "Pexels",
          autor: f.credito.fotografo ?? "",
          licenca: asset.license,
          pagina: f.credito.fotoUrl ?? "",
          descricao: "",
          previa: previaLeve(f.imagemUrl),
        });
      }
    } catch (e) {
      avisos.push(`Pexels/Unsplash falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const imagens: Imagem[] = [];
  const lista = [];
  for (const c of candidatas) {
    const img = await baixarPrevia(c.previa);
    if (!img) continue;
    imagens.push(img);
    lista.push({ indice: lista.length, id: c.id, fonte: c.fonte, autor: c.autor, licenca: c.licenca, pagina: c.pagina, descricao: c.descricao });
  }
  return {
    ok: true,
    consulta,
    candidatas: lista,
    ...(avisos.length ? { avisos } : {}),
    orientacao:
      lista.length === 0
        ? "Nada servível. Tente outra consulta: nome completo da pessoa ou empresa, o prédio, o produto, ou a cena em inglês."
        : "As imagens anexadas seguem a ordem dos índices. Escolha a que mostra o assunto da manchete (pessoa certa, marca legível, sem logotipo de terceiro, sem texto competindo) e chame trocar_imagem com o id dela.",
    imagens,
  };
}

/**
 * Foto achada pelo Claude na web, pelo chat (06/11/2026, pedido do dono: "dar
 * autonomia para o Claude buscar na web livremente"). A plataforma baixa,
 * normaliza em JPEG e guarda no nosso Storage: o endereço de terceiro some
 * (hotlink bloqueado, host fora da lista do `next/image`, arquivo apagado), e
 * a peça aprovada não muda depois de aprovada. O crédito é o que o Claude
 * informa, e é obrigatório: a regra do dono é crédito em toda foto.
 */
const MIMES_DA_WEB = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const LARGURA_MINIMA_DA_WEB = 600;

async function baixarDaWeb(url: string, pagina: string): Promise<{ buffer: Buffer; mime: string } | string> {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return "imagem_url inválida";
  }
  if (alvo.protocol !== "https:" && alvo.protocol !== "http:") return "imagem_url precisa ser http ou https";
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(alvo.hostname)) return "endereço interno não é aceito";
  const tentar = async (headers: Record<string, string>) => {
    const r = await fetch(alvo, { headers, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return `o site respondeu ${r.status}`;
    const mime = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!MIMES_DA_WEB.has(mime)) return `o endereço não é uma imagem (${mime || "sem tipo"}): passe o link DIRETO do arquivo da foto, e não o da página`;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.byteLength > 25_000_000) return "a imagem passa de 25 MB";
    return { buffer, mime };
  };
  const honesto = { "User-Agent": "eua.journal/1.0 (+https://euajournal.com)", Accept: "image/*" };
  const primeira = await tentar(honesto);
  if (typeof primeira !== "string") return primeira;
  // Muito site recusa imagem sem a página de origem no Referer (proteção de hotlink).
  if (pagina) {
    const segunda = await tentar({ ...honesto, Referer: pagina });
    if (typeof segunda !== "string") return segunda;
  }
  return primeira;
}

async function assetDaWeb(
  projectId: string,
  args: { url: string; autor: string; fonte: string; pagina: string; licenca: string },
): Promise<AssetVisual | string> {
  const baixada = await baixarDaWeb(args.url, args.pagina);
  if (typeof baixada === "string") return baixada;
  const sharp = (await import("sharp")).default;
  let jpeg: Buffer;
  let largura = 0;
  let altura = 0;
  try {
    const meta = await sharp(baixada.buffer).metadata();
    largura = meta.width ?? 0;
    altura = meta.height ?? 0;
    if (largura < LARGURA_MINIMA_DA_WEB) return `a imagem tem ${largura}px de largura; o mínimo é ${LARGURA_MINIMA_DA_WEB}px (procure uma versão maior)`;
    const out = await sharp(baixada.buffer).rotate().resize({ width: 2160, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    jpeg = out.data;
    largura = out.info.width;
    altura = out.info.height;
  } catch (e) {
    return `não consegui ler a imagem: ${e instanceof Error ? e.message : String(e)}`;
  }
  const { createHash } = await import("node:crypto");
  const nome = createHash("sha256").update(jpeg).digest("hex").slice(0, 20);
  // O motivo do Storage vai inteiro na resposta (06/11/2026): o "não consegui guardar" sem porquê não deixava ninguém agir.
  const caminho = `mcp-imagens/${projectId}/${nome}.jpg`;
  let publica = "";
  try {
    const storage = getSupabaseAdminClient().storage.from("public_assets");
    const { error } = await storage.upload(caminho, jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) return `não consegui guardar a imagem no Storage (${jpeg.byteLength} bytes): ${error.message}`;
    publica = storage.getPublicUrl(caminho).data.publicUrl;
  } catch (e) {
    return `não consegui guardar a imagem no Storage (${jpeg.byteLength} bytes): ${e instanceof Error ? e.message : String(e)}`;
  }
  if (!publica) return "o Storage não devolveu o endereço público da imagem";
  const agora = new Date().toISOString();
  const pagina = args.pagina || args.url;
  return {
    entityName: args.fonte,
    entityNormalized: args.fonte.toLowerCase(),
    entityType: "conceptual",
    source: "fonte_oficial",
    sourceAssetId: args.url,
    imageUrl: publica,
    sourcePageUrl: pagina,
    author: args.autor,
    license: args.licenca || "uso editorial",
    licenseUrl: pagina,
    attribution: args.autor,
    rightsStatement: `escolhida pelo Claude na web; crédito informado: ${args.autor} (${args.fonte})`,
    rightsStatus: "verified",
    rightsCheckedAt: agora,
    sourceLastCheckedAt: agora,
    width: largura,
    height: altura,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0,
    imageContextType: "conceptual",
    metadata: { web: true, origem_web: args.url, fonte_web: args.fonte },
  } as AssetVisual;
}

/** Baixa e reduz uma imagem para o Claude ver; string é o motivo de não servir. */
async function previaDaWeb(url: string, pagina: string): Promise<{ largura: number; altura: number; imagem: Imagem } | string> {
  const baixada = await baixarDaWeb(url, pagina);
  if (typeof baixada === "string") return baixada;
  const sharp = (await import("sharp")).default;
  try {
    const meta = await sharp(baixada.buffer).metadata();
    const previa = await sharp(baixada.buffer).rotate().resize({ width: 700, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return { largura: meta.width ?? 0, altura: meta.height ?? 0, imagem: { mime: "image/jpeg", base64: previa.toString("base64") } };
  } catch (e) {
    return `não consegui ler a imagem: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * O Claude olha imagens da web antes de escolher, uma ou várias lado a lado
 * (06/11/2026): o chat nem sempre mostra a imagem de um link, e é assim que
 * ele compara opções para quem pediu escolher.
 */
export async function verImagem(_acesso: AcessoDoMcp, args: { url?: unknown; urls?: unknown; pagina?: unknown }): Promise<Resposta> {
  const pagina = typeof args.pagina === "string" ? args.pagina.trim() : "";
  const lista = [
    ...(typeof args.url === "string" && args.url.trim() ? [args.url.trim()] : []),
    ...(Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim()) : []),
  ].slice(0, 8);
  if (lista.length === 0) return recusa(400, "informe url (ou urls), o link direto do arquivo da imagem");
  const imagens: Imagem[] = [];
  const resultado: Array<Record<string, unknown>> = [];
  for (const url of lista) {
    const p = await previaDaWeb(url, pagina);
    if (typeof p === "string") {
      resultado.push({ url, erro: p });
      continue;
    }
    resultado.push({ indice: imagens.length, url, largura: p.largura, altura: p.altura, serve: p.largura >= LARGURA_MINIMA_DA_WEB });
    imagens.push(p.imagem);
  }
  if (imagens.length === 0) return recusa(422, resultado.map((r) => `${r.url}: ${r.erro}`).join("; "));
  return { ok: true, imagens_vistas: resultado, imagens };
}

/**
 * As fotos de uma página da web (06/11/2026). O Claude acha a página pelo
 * chat (sala de imprensa, notícia, perfil, Wikipedia) e a plataforma tira
 * dela as fotos grandes: a de compartilhamento (og:image), as do corpo e as
 * do srcset. O Claude vê, escolhe, e troca com o link direto que volta aqui.
 */
export async function imagensDaPagina(_acesso: AcessoDoMcp, args: { url?: unknown; quantas?: unknown }): Promise<Resposta> {
  const url = typeof args.url === "string" ? args.url.trim() : "";
  if (!/^https?:\/\//.test(url)) return recusa(400, "informe url, o endereço da página");
  const quantas = Math.min(8, Math.max(1, Number(args.quantas ?? 6) || 6));
  let html = "";
  let base: URL;
  try {
    base = new URL(url);
    const r = await fetch(base, {
      headers: { "User-Agent": "eua.journal/1.0 (+https://euajournal.com)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return recusa(422, `a página respondeu ${r.status}: tente outra página ou passe o link direto da foto para ver_imagem`);
    html = (await r.text()).slice(0, 3_000_000);
  } catch (e) {
    return recusa(422, `não consegui abrir a página: ${e instanceof Error ? e.message : String(e)}`);
  }
  const achados = new Set<string>();
  const add = (bruto: string | undefined) => {
    if (!bruto) return;
    const limpo = bruto.replace(/&amp;/g, "&").trim();
    if (!limpo || limpo.startsWith("data:")) return;
    try {
      const abs = new URL(limpo, base).toString();
      if (/\.(svg|gif|ico)(\?|$)/i.test(abs) || /(logo|icon|sprite|avatar|favicon|pixel|tracking)/i.test(abs)) return;
      achados.add(abs);
    } catch {
      /* endereço torto: ignora */
    }
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]*>/gi)) add(m[0].match(/content=["']([^"']+)["']/i)?.[1]);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/\b(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      const maior = srcset
        .split(",")
        .map((p) => p.trim().split(/\s+/))
        .sort((a, b) => (parseInt(b[1] ?? "0") || 0) - (parseInt(a[1] ?? "0") || 0))[0]?.[0];
      add(maior);
    }
    add(tag.match(/\b(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1]);
  }
  const titulo = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const site = html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? base.hostname.replace(/^www\./, "");
  const imagens: Imagem[] = [];
  const lista: Array<Record<string, unknown>> = [];
  for (const u of [...achados].slice(0, 30)) {
    if (imagens.length >= quantas) break;
    const p = await previaDaWeb(u, url);
    if (typeof p === "string" || p.largura < LARGURA_MINIMA_DA_WEB) continue;
    lista.push({ indice: imagens.length, imagem_url: u, largura: p.largura, altura: p.altura });
    imagens.push(p.imagem);
  }
  return {
    ok: true,
    pagina: url,
    titulo,
    fonte_sugerida: site,
    candidatas: lista,
    orientacao: lista.length
      ? "As imagens anexadas seguem a ordem dos índices. Para usar uma, chame trocar_imagem com imagem_url, pagina (esta), fonte e autor (o fotógrafo, se a página disser; senão a instituição ou o site)."
      : "A página não tem foto grande legível pela plataforma. Tente outra página do mesmo assunto, ou passe o link direto do arquivo para ver_imagem.",
    imagens,
  };
}

/**
 * O nome do arquivo do Commons num link do Commons (06/11/2026): o original,
 * a miniatura (`/thumb/.../1280px-X`) ou a página `File:X`. Foto do Commons
 * não passa pelo nosso Storage: o arquivo de lá serve, e o crédito e a
 * licença são lidos da página dele, e não do que o Claude digitou. Foi o caso
 * das três tentativas da Bruna, todas recusadas pelo Storage.
 */
export function arquivoDoCommonsNoLink(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (/(^|\.)wikimedia\.org$|(^|\.)wikipedia\.org$/.test(u.hostname)) {
    const pagina = u.pathname.match(/\/wiki\/(?:File|Arquivo|Ficheiro):(.+)$/i);
    if (pagina) return decodeURIComponent(pagina[1]).replace(/_/g, " ");
  }
  if (u.hostname !== "upload.wikimedia.org") return null;
  const partes = u.pathname.split("/").filter(Boolean);
  const i = partes.indexOf("thumb");
  const nome = i >= 0 ? partes[i + 3] : partes[partes.length - 1];
  return nome ? decodeURIComponent(nome).replace(/_/g, " ") : null;
}

/** A foto que o Claude indicou fora das candidatas, na tarefa `escolher_foto`. */
export function fotoIndicadaPeloClaude(projectId: string) {
  return async (e: { imagem_url?: string; imagem_id?: string; autor?: string; fonte?: string; pagina?: string }): Promise<AssetVisual | string> => {
    if (e.imagem_id) return assetEscolhido(e.imagem_id.trim());
    const doCommons = arquivoDoCommonsNoLink((e.imagem_url ?? "").trim()) ?? arquivoDoCommonsNoLink((e.pagina ?? "").trim());
    if (doCommons) return assetEscolhido(`c:${doCommons}`);
    const url = (e.imagem_url ?? "").trim();
    const autor = (e.autor ?? "").trim();
    const fonte = (e.fonte ?? "").trim();
    if (!url) return "sem imagem_url";
    if (!autor || !fonte) return "foto da web precisa de autor e fonte para o crédito";
    return assetDaWeb(projectId, { url, autor, fonte, pagina: (e.pagina ?? "").trim(), licenca: "" });
  };
}

async function assetEscolhido(id: string): Promise<AssetVisual | string> {
  const lido = assetDoId(id);
  if (!lido) return "id de imagem inválido: use um id que buscar_imagens devolveu, sem alterar";
  if (lido.tipo === "banco") return lido.asset;
  const c = await arquivoDoCommons(lido.arquivo, { tempoLimiteMs: 15_000 });
  if (!c) return `o arquivo "${lido.arquivo}" não foi encontrado no Commons`;
  const conv = candidatoParaAsset(c, entidadeDaBusca(lido.arquivo));
  if (!conv.ok) return `o arquivo do Commons não pode ser publicado: ${conv.motivo}`;
  return conv.asset;
}

function resultadoFixo(storyId: string, asset: AssetVisual): ResultadoVisual {
  return {
    storyId,
    entidade: null,
    asset: { ...asset, conferenciaVisual: { descricao: "escolhida pelo Claude no MCP", motivo: "conferida pelo Claude", paisAparente: null, confianca: 100 } },
    assetSecundario: null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas: [{ fonte: "biblioteca_interna", encontrados: 1, nota: "foto escolhida pelo Claude no MCP" }],
    recusados: [],
    legenda: "",
    caminho: "entidade",
  } as ResultadoVisual;
}

async function trocarNoArtigo(client: SupabaseClient, a: Aprovacao, asset: AssetVisual, legenda: string): Promise<string | null> {
  const { data: linha, error: erroDeLeitura } = await client
    .from("articles")
    .select("id, cover_image, content_html, tags, category, status")
    .eq("id", a.pecaId)
    .eq("project_id", a.projectId)
    .maybeSingle();
  if (erroDeLeitura) return `não consegui ler a matéria: ${erroDeLeitura.message}`;
  if (!linha) return "a matéria não existe mais";
  const nova = enderecoLimpoDaImagem(asset.imageUrl);
  if (!nova) return "a foto escolhida não tem endereço publicável";
  // A legenda e o crédito da foto velha saem do corpo; entram os da nova.
  const htmlAtual = typeof linha.content_html === "string" ? linha.content_html : "";
  const semCabeca = htmlAtual
    .replace(/<p[^>]*class="legenda-da-capa"[^>]*>[\s\S]*?<\/p>/gi, "")
    .replace(/<p[^>]*class="credito-da-foto"[^>]*>[\s\S]*?<\/p>/gi, "");
  const tags = Array.isArray(linha.tags) ? (linha.tags as unknown[]).map(String) : [];
  const assunto = tags.find((t) => t.startsWith("assunto:"))?.slice("assunto:".length) ?? (typeof linha.category === "string" ? linha.category : "");
  const credito = creditoDoAsset(asset);
  const content_html = `${htmlDaLegenda(legenda || legendaNeutra(assunto))}${credito ? htmlDoCredito(credito) : ""}${semCabeca}`;
  const { data, error } = await client
    .from("articles")
    .update({ cover_image: nova, content_html, updated_at: new Date().toISOString() })
    .eq("id", a.pecaId)
    .eq("project_id", a.projectId)
    .select("id");
  if (error) return `a capa nova não foi gravada: ${error.message}`;
  if (!data || data.length === 0) return "a matéria não foi atualizada";
  return null;
}

async function trocarNoPost(a: Aprovacao, asset: AssetVisual, client: SupabaseClient): Promise<string | null> {
  const { data: linha } = await client.from("social_posts").select("story_id").eq("id", a.pecaId).maybeSingle();
  const storyId = typeof linha?.story_id === "string" && linha.story_id ? linha.story_id : a.pecaId;
  const ganchos = criarGanchosDeProducao({ ...mundoDeProducao(), imagem: async () => resultadoFixo(storyId, asset) });
  const motivo = "foto trocada pelo Claude no MCP";
  const imagem = await ganchos.post?.imagem?.({ aprovacao: a, etapa: "imagem", naoRepetir: "", motivo, culpada: "imagem" });
  if (!imagem) return "o post não tem troca de imagem";
  if (!imagem.ok) return imagem.motivo;
  const arte = await ganchos.post?.arte?.({ aprovacao: a, etapa: "arte", naoRepetir: "", motivo, culpada: "imagem" });
  if (!arte) return "o post não tem refação de arte";
  if (!arte.ok) return `a foto foi gravada, mas a arte não recongelou: ${arte.motivo}`;
  return null;
}

export async function trocarImagem(
  acesso: AcessoDoMcp,
  args: {
    aprovacao_id?: unknown;
    imagem_id?: unknown;
    imagem_url?: unknown;
    autor?: unknown;
    fonte?: unknown;
    pagina?: unknown;
    licenca?: unknown;
    legenda?: unknown;
  },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Resposta> {
  const txt = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const aprovacaoId = txt(args.aprovacao_id);
  const imagemId = txt(args.imagem_id, 4000);
  const imagemUrl = txt(args.imagem_url, 2000);
  const legenda = txt(args.legenda, 220);
  if (!aprovacaoId || (!imagemId && !imagemUrl)) {
    return recusa(400, "informe aprovacao_id (de ver_fila) e imagem_id (de buscar_imagens) ou imagem_url (achada na web)");
  }
  const autor = txt(args.autor, 120);
  const fonteDaWeb = txt(args.fonte, 120);
  const doCommons = imagemId ? null : arquivoDoCommonsNoLink(imagemUrl) ?? arquivoDoCommonsNoLink(txt(args.pagina, 2000));
  if (imagemUrl && !imagemId && !doCommons && (!autor || !fonteDaWeb)) {
    return recusa(400, "foto da web precisa de crédito: informe autor (quem fotografou, ou a instituição) e fonte (o site ou a agência)");
  }

  const projeto = comoProjetoDaFila(acesso.projeto);
  const deps = depsDaFila(client, projeto);
  const a = await deps.store.porId(aprovacaoId);
  if (!a || a.projectId !== acesso.projeto.id) return recusa(404, "peça não encontrada na fila deste projeto");
  if (a.ramo !== "artigo" && a.ramo !== "post") return recusa(422, `a troca de foto vale para matéria e post; esta peça é "${a.ramo}"`);

  const asset = imagemId
    ? await assetEscolhido(imagemId)
    : doCommons
      ? await assetEscolhido(`c:${doCommons}`)
      : await assetDaWeb(acesso.projeto.id, { url: imagemUrl, autor, fonte: fonteDaWeb, pagina: txt(args.pagina, 2000), licenca: txt(args.licenca, 120) });
  if (typeof asset === "string") return recusa(422, asset);

  const gravar = () => (a.ramo === "artigo" ? trocarNoArtigo(client, a, asset, legenda) : trocarNoPost(a, asset, client));
  /*
   * Foto reprovada pelo dono no motor Claude (06/11/2026): a peça espera em
   * `refazendo` com a refação `com_o_claude`. A troca é a versão nova que ela
   * espera: grava e reentra pela fila, que a devolve a `aguardando`.
   */
  const esperaOClaude = a.estado === "refazendo" && a.resumo?.refacao?.estado === "com_o_claude";
  const desfecho = esperaOClaude
    ? await (async () => {
        const erro = await gravar();
        if (erro) return { gravou: false as const, motivo: `NÃO GRAVOU: ${erro}` };
        const peca = await deps.pecas.ler(a.ramo, a.pecaId);
        if (!peca) return { gravou: true as const, filaAtualizada: false, motivo: "gravou, mas a peça não foi relida para a fila" };
        const { enfileirar } = await import("@/lib/server/aprovacao/fila");
        const linha = await enfileirar(projeto, { ramo: a.ramo, pecaId: a.pecaId, hash: peca.hashAtual, publicarEm: a.publicarEm, avisos: a.avisos, resumo: {} }, deps);
        return { gravou: true as const, filaAtualizada: Boolean(linha), motivo: linha ? `de volta à fila (${linha.estado})` : "gravou, mas a fila não devolveu a linha" };
      })()
    : await gravarComAFila({ projeto, ramo: a.ramo, pecaId: a.pecaId, deps, gravar });
  if (!desfecho.gravou) return recusa(422, desfecho.motivo);

  // O Claude confere o resultado vendo: a capa nova da matéria, ou a arte recongelada do post.
  let previa: string | null = previaLeve(asset.imageUrl);
  if (a.ramo === "post") {
    const { data } = await client.from("social_posts").select("asset_paths").eq("id", a.pecaId).maybeSingle();
    const caminhos = Array.isArray(data?.asset_paths) ? (data.asset_paths as string[]) : [];
    previa = caminhos[0] ?? previa;
  }
  const img = previa ? await baixarPrevia(previa) : null;
  return {
    ok: true,
    trocada: true,
    peca: { ramo: a.ramo, titulo: a.resumo?.titulo ?? null },
    credito: asset.attribution || asset.author || "",
    fila: desfecho.filaAtualizada ? "continua aguardando a aprovação do dono, com a versão nova" : desfecho.motivo,
    painel: linkDoPainel(acesso.projeto.slug),
    imagens: img ? [img] : [],
  };
}
