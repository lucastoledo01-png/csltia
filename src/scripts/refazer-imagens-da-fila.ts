import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import { conferenteDeVerdade, resolveVisualAsset, type PautaParaImagem } from "../lib/server/visual/resolver";
import { calculateCost } from "../lib/server/newsroom/ai-provider";
import { temFotoDaPauta } from "../lib/server/ramos/sem-foto";
import { baixarLogotipo, comporCartaoDaMarca } from "../lib/server/visual/cartao-da-marca";
import { identidadeDaFoto } from "../lib/server/prompt-system/stock";
import type { ResultadoVisual, VerificacaoDoProtagonista } from "../lib/server/visual/tipos";
import type { Aprovacao, Ramo } from "../lib/server/aprovacao/contrato";
import type { ProjetoDaFila } from "../lib/server/aprovacao/fila";

/**
 * Refaz as fotos da fila de aprovação pela regra do protagonista da manchete
 * (06/10/2026, "imagem certeira").
 *
 * O dono reviu a fila de 07/10/2026 e reprovou as fotos: a pauta do Caiado com
 * um salão de casamento, a da Anthropic com racks de servidor, a da Anduril sem
 * a marca, a do Bret Taylor com um túnel de dados. O código novo decide a foto
 * pelo PROTAGONISTA que a manchete nomeia, com a identidade (pessoa) ou a marca
 * (organização) conferida. Este script passa as peças que esperam aprovação
 * pelo resolvedor novo.
 *
 * ENSAIO por padrão: resolve em leitura (sem biblioteca, sem acervo, sem gravar
 * nada), mostra antes e depois, e com `--folha=<pasta>` grava a folha de
 * contato e o `ensaio.json`. O custo das chamadas de modelo é contado pela
 * resposta da API e o script para no teto (`--custo`, US$ 3 por padrão).
 *
 * `--aplicar` refaz pela semântica da própria fila: a peça que está
 * AGUARDANDO passa pelo gancho de refação de imagem (e de arte, no post), que
 * grava a foto nova só nesta peça, e reentra na fila com o hash novo,
 * continuando `aguardando` (`enfileirar`, a regra da fila para versão nova).
 * Não conta como reprovação: a contagem de refações não sobe. Peça aprovada
 * fica de fora (aprovar de novo é decisão do dono), e peça refazendo também.
 * A peça cuja manchete nomeia alguém e que NÃO tem foto conferida não é
 * tocada: o script diz isso, e quem decide (cancelar) é o dono, no painel.
 *
 *   npx tsx src/scripts/refazer-imagens-da-fila.ts                 # ensaio, amanhã
 *   npx tsx src/scripts/refazer-imagens-da-fila.ts --data=2026-10-07 --folha=docs/design/imagem-certeira-2026-10-06
 *   npx tsx src/scripts/refazer-imagens-da-fila.ts --data=2026-10-07 --aplicar
 *
 * Outras opções: `--so=<id da peça>` (várias, separadas por vírgula),
 * `--incluir-aprovadas` (só no ensaio e na folha; o aplicar nunca toca peça
 * aprovada), `--projeto=<id>`.
 */

const PROJETO_PADRAO = "00000000-0000-4000-8000-000000000001";

function arg(nome: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : undefined;
}
const tem = (nome: string) => process.argv.includes(`--${nome}`);

/** O dia seguinte no fuso do projeto, no formato AAAA-MM-DD. */
function amanha(fuso: string): string {
  const agora = new Date(Date.now() + 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** O intervalo UTC de um dia no fuso de São Paulo (UTC-3, sem horário de verão desde 2019). */
function intervaloDoDia(data: string): { de: string; ate: string } {
  const de = new Date(`${data}T03:00:00.000Z`);
  return { de: de.toISOString(), ate: new Date(de.getTime() + 86_400_000).toISOString() };
}

let gasto = 0;
let teto = 3;
/** Conta o custo das chamadas de modelo pelo uso que a própria API devolve, e para no teto. */
const fetchContado: typeof fetch = async (entrada, init) => {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  const ehModelo = /api\.openai\.com/.test(url);
  if (ehModelo && gasto >= teto) throw new Error(`teto de custo do ensaio atingido (US$ ${gasto.toFixed(3)})`);
  const r = await fetch(entrada, init);
  if (ehModelo) {
    try {
      const corpo = (await r.clone().json()) as { model?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      gasto += calculateCost(corpo.model ?? "", corpo.usage?.prompt_tokens ?? 0, corpo.usage?.completion_tokens ?? 0);
    } catch {
      gasto += 0.01;
    }
  }
  return r;
};

type Linha = Record<string, unknown>;
type Peca = {
  aprovacao: Aprovacao;
  ramo: Ramo;
  manchete: string;
  fotoAtual: string;
  pauta: PautaParaImagem | null;
  visualAtual: Linha | null;
};

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pautaDoContexto(contexto: unknown, manchete: string): PautaParaImagem | null {
  const c = (contexto ?? {}) as Linha;
  const p = (Array.isArray(c.pautas) ? (c.pautas[0] as Linha | undefined) : undefined) ?? null;
  if (!p) return null;
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    storyId: texto(p.storyId),
    titulo: texto(p.titulo),
    manchete,
    resumo: texto(p.resumo),
    categoria: texto(p.eixo) || texto(p.categoria),
    classificacao: {
      atores: lista(p.atores),
      lugares: lista(p.lugares),
      acontecimento: lista(p.acontecimento),
      pais: texto(p.pais) || undefined,
    },
  };
}

function aprovacaoDaLinha(l: Linha): Aprovacao {
  return {
    id: texto(l.id),
    projectId: texto(l.project_id),
    ramo: l.ramo as Ramo,
    pecaId: texto(l.peca_id),
    hashArtefato: texto(l.hash_artefato),
    publicarEm: (l.publicar_em as string | null) ?? null,
    estado: l.estado as Aprovacao["estado"],
    automatica: Boolean(l.automatica),
    decididoPor: (l.decidido_por as string | null) ?? null,
    decididoEm: (l.decidido_em as string | null) ?? null,
    motivo: (l.motivo as string | null) ?? null,
    etapaCulpada: (l.etapa_culpada as Aprovacao["etapaCulpada"]) ?? null,
    refazimentos: Number(l.refazimentos ?? 0),
    avisos: (l.avisos as Aprovacao["avisos"]) ?? [],
    resumo: (l.resumo as Aprovacao["resumo"]) ?? {},
    avisadoEm: (l.avisado_em as string | null) ?? null,
    liberadoEm: (l.liberado_em as string | null) ?? null,
    createdAt: texto(l.created_at),
    updatedAt: texto(l.updated_at),
  };
}

async function lerPecas(client: ReturnType<typeof clienteDoBanco>, projectId: string, data: string): Promise<Peca[]> {
  const { de, ate } = intervaloDoDia(data);
  const { data: linhas, error } = await client
    .from("aprovacoes")
    .select("*")
    .eq("project_id", projectId)
    .in("ramo", ["post", "artigo"])
    .gte("publicar_em", de)
    .lt("publicar_em", ate)
    .order("publicar_em");
  if (error) throw new Error(`não consegui ler a fila: ${error.message}`);
  const so = (arg("so") ?? "").split(",").filter(Boolean);
  const pecas: Peca[] = [];
  for (const l of (linhas ?? []) as Linha[]) {
    const a = aprovacaoDaLinha(l);
    if (so.length && !so.includes(a.pecaId)) continue;
    if (a.ramo === "post") {
      const { data: p } = await client.from("social_posts").select("id, title, content_json").eq("id", a.pecaId).maybeSingle();
      const cj = ((p as Linha | null)?.content_json ?? {}) as Linha;
      const copy = (cj.copy ?? {}) as Linha;
      const visual = (cj.visual ?? null) as Linha | null;
      const manchete = texto(copy.headline) || texto((p as Linha | null)?.title);
      pecas.push({ aprovacao: a, ramo: "post", manchete, fotoAtual: texto(visual?.imageUrl), visualAtual: visual, pauta: pautaDoContexto(cj.contexto_da_refacao, manchete) });
    } else {
      const { data: art } = await client.from("articles").select("id, title, cover_image").eq("id", a.pecaId).maybeSingle();
      const manchete = texto((art as Linha | null)?.title);
      pecas.push({
        aprovacao: a,
        ramo: "artigo",
        manchete,
        fotoAtual: texto((art as Linha | null)?.cover_image),
        visualAtual: null,
        pauta: pautaDoContexto((a.resumo as Linha).contexto, manchete),
      });
    }
  }
  return pecas;
}

/** Baixa a imagem para a folha. O cartão do logotipo é composto aqui, porque a rota só existe depois do deploy. */
async function imagemParaAFolha(r: ResultadoVisual | null, url: string): Promise<Buffer | null> {
  try {
    const logotipo = r?.asset?.metadata?.tratamento === "cartao_do_logotipo" ? String(r.asset.metadata.logotipo) : null;
    if (logotipo) return (await comporCartaoDaMarca(await baixarLogotipo(logotipo))).png;
    if (!url) return null;
    const resposta = await fetch(url.replace(/\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?]+)(\?.*)?$/, "/wikipedia/commons/thumb/$1/$2/$3/1280px-$3"), {
      headers: { "User-Agent": "eua.journal/1.0 (ensaio da fila)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resposta.ok) return null;
    return Buffer.from(await resposta.arrayBuffer());
  } catch {
    return null;
  }
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function quebrar(s: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const p of s.split(/\s+/)) {
    if ((atual + " " + p).trim().length > largura) {
      if (atual) linhas.push(atual);
      atual = p;
    } else atual = (atual + " " + p).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function quadro(img: Buffer | null, rotulo: string[], lado: number): Promise<Buffer> {
  const base = sharp({ create: { width: lado, height: lado + 150, channels: 3, background: { r: 245, g: 245, b: 242 } } });
  const camadas: OverlayOptions[] = [];
  if (img) {
    const foto = await sharp(img).resize(lado, lado, { fit: "cover" }).jpeg().toBuffer().catch(() => null);
    if (foto) camadas.push({ input: foto, left: 0, top: 0 });
  }
  const svg = `<svg width="${lado}" height="150" xmlns="http://www.w3.org/2000/svg">${rotulo
    .slice(0, 6)
    .map((l, i) => `<text x="10" y="${24 + i * 22}" font-family="Helvetica, Arial" font-size="17" fill="${i === 0 ? "#111" : "#444"}" font-weight="${i === 0 ? 700 : 400}">${escapar(l)}</text>`)
    .join("")}</svg>`;
  camadas.push({ input: Buffer.from(svg), left: 0, top: lado });
  return base.composite(camadas).jpeg({ quality: 85 }).toBuffer();
}

function resumoDoResultado(r: ResultadoVisual | null): string {
  if (!r) return "sem pauta para resolver";
  const v = r.asset?.metadata?.verificacao as VerificacaoDoProtagonista | undefined;
  if (!temFotoDaPauta(r)) {
    return `SEM FOTO VERIFICADA (${r.motivo})${r.protagonista ? `: protagonista ${r.protagonista.nome}` : ""}`;
  }
  return `${v ? `${v.tipo}: ${v.como}` : `caminho ${r.caminho ?? "?"}${r.degrau ? `/${r.degrau}` : ""}`}`;
}

async function main() {
  carregarEnv();
  teto = Number(arg("custo")) || 3;
  const aplicar = tem("aplicar");
  const projectId = arg("projeto") ?? PROJETO_PADRAO;
  const client = clienteDoBanco();
  const { data: projetoLinha, error: erroDoProjeto } = await client.from("projects").select("id, timezone, settings").eq("id", projectId).single();
  if (erroDoProjeto || !projetoLinha) throw new Error(`projeto ${projectId} não lido: ${erroDoProjeto?.message}`);
  const projeto: ProjetoDaFila = {
    id: projetoLinha.id,
    timezone: projetoLinha.timezone || "America/Sao_Paulo",
    settings: projetoLinha.settings ?? null,
  };
  const data = arg("data") ?? amanha(projeto.timezone);
  const bancos = ((projeto.settings ?? {}) as { imagens?: { bancos_oficiais?: unknown } }).imagens?.bancos_oficiais === true;
  console.log(`${aplicar ? "MODO: APLICAR" : "MODO: ENSAIO (nada é gravado)"} | fila de ${data} | teto de custo US$ ${teto}`);

  const pecas = await lerPecas(client, projectId, data);
  const memoria = new Map<string, Promise<ResultadoVisual>>();
  // A foto de cada PAUTA do dia: a mesma pauta pode repetir a foto nos dois canais; pautas diferentes, não.
  const usadasPorPauta = new Map<string, string>();
  const relatorio: Array<Record<string, unknown>> = [];
  const quadros: Buffer[] = [];
  const pasta = arg("folha");
  if (pasta) fs.mkdirSync(pasta, { recursive: true });

  for (const p of pecas) {
    const a = p.aprovacao;
    console.log(`\n[${p.ramo}] ${p.manchete}\n  estado na fila: ${a.estado}; foto atual: ${p.fotoAtual || "(nenhuma)"}`);
    if (!p.pauta) {
      console.log("  PULADA: a linha não guarda a pauta (contexto da refação)");
      continue;
    }
    if (a.estado === "aprovada" && !tem("incluir-aprovadas")) {
      console.log("  PULADA: aprovada pelo dono; refazer desfaria a aprovação (use --incluir-aprovadas só para ver)");
      continue;
    }

    // A mesma pauta resolve uma vez, e as peças dela leem a mesma resposta (como `imagemDaPauta`).
    const chave = `${p.pauta.storyId}|${p.manchete}`;
    if (!memoria.has(chave)) {
      memoria.set(
        chave,
        resolveVisualAsset(p.pauta, {
          env: process.env,
          fetcher: fetchContado,
          somenteLeitura: true,
          bancosOficiais: bancos,
          jaUsadosNestaEdicao: new Set([...usadasPorPauta].filter(([sid]) => sid !== p.pauta!.storyId).map(([, url]) => url)),
          conferenciaVisual: conferenteDeVerdade({ env: process.env, fetcher: fetchContado }),
        }).catch((erro) => {
          console.log(`  resolução falhou: ${(erro as Error).message}`);
          return null as unknown as ResultadoVisual;
        }),
      );
    }
    const r = await memoria.get(chave)!;
    const nova = r && temFotoDaPauta(r) ? (r.asset?.imageUrl ?? "") : "";
    if (nova) usadasPorPauta.set(p.pauta.storyId, nova);
    const mesma = Boolean(nova) && identidadeDaFoto(nova) === identidadeDaFoto(p.fotoAtual);
    const v = r?.asset?.metadata?.verificacao as VerificacaoDoProtagonista | undefined;
    console.log(`  protagonista: ${r?.protagonista ? `${r.protagonista.nome} (${r.protagonista.tipo})` : "nenhum na manchete"}`);
    console.log(`  depois: ${nova || "(sem foto)"}\n  prova: ${resumoDoResultado(r)}`);
    console.log(`  custo acumulado: US$ ${gasto.toFixed(3)}`);

    relatorio.push({
      ramo: p.ramo,
      pecaId: a.pecaId,
      estado: a.estado,
      manchete: p.manchete,
      antes: { imageUrl: p.fotoAtual, caminho: p.visualAtual?.caminho ?? null, degrau: p.visualAtual?.degrau ?? null, source: p.visualAtual?.source ?? null },
      depois: r
        ? {
            status: r.status,
            motivo: r.motivo,
            imageUrl: nova || null,
            source: nova ? r.asset?.source : null,
            protagonista: r.protagonista ?? null,
            verificacao: v ?? null,
            conferenciaVisual: nova ? (r.asset?.conferenciaVisual ?? null) : null,
            recusados: r.recusados.slice(0, 12).map((x) => `${x.motivo}: ${x.identificacao} | ${x.detalhe.slice(0, 160)}`),
            fontesConsultadas: r.fontesConsultadas.map((f) => `${f.fonte}: ${f.nota.slice(0, 220)}`),
          }
        : null,
      mesmaFoto: mesma,
    });

    if (pasta) {
      const lado = 360;
      const antes = await quadro(await imagemParaAFolha(null, p.fotoAtual), ["ANTES", ...quebrar(p.manchete, 38).slice(0, 2), `fonte: ${String(p.visualAtual?.source ?? "capa da matéria")}`], lado);
      const depois = await quadro(
        await imagemParaAFolha(r, nova),
        ["DEPOIS", ...(r?.protagonista ? [`protagonista: ${r.protagonista.nome}`] : []), ...quebrar(resumoDoResultado(r), 40).slice(0, 4)],
        lado,
      );
      quadros.push(await sharp({ create: { width: lado * 2 + 30, height: lado + 150, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .composite([{ input: antes, left: 0, top: 0 }, { input: depois, left: lado + 30, top: 0 }])
        .jpeg()
        .toBuffer());
    }

    if (!aplicar) continue;
    if (a.estado !== "aguardando") {
      console.log(`  APLICAR: pulada, a peça está "${a.estado}" (só "aguardando" é refeita aqui)`);
      continue;
    }
    if (!nova) {
      console.log("  APLICAR: NÃO TOCADA. Sem foto verificada do protagonista: pela regra, a peça não vira conteúdo. Cancele no painel.");
      continue;
    }
    if (mesma) {
      console.log("  APLICAR: a foto atual já é a que a regra escolhe; nada a refazer");
      continue;
    }
    await aplicarNaPeca(client, projeto, a, p.ramo);
  }

  if (pasta) {
    fs.writeFileSync(path.join(pasta, "ensaio.json"), JSON.stringify({ data, custoUsd: Number(gasto.toFixed(4)), pecas: relatorio }, null, 2));
    if (quadros.length) {
      const larg = (await sharp(quadros[0]).metadata()).width ?? 750;
      const alt = (await sharp(quadros[0]).metadata()).height ?? 510;
      const folha = await sharp({ create: { width: larg, height: alt * quadros.length + 20 * quadros.length, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .composite(quadros.map((q, i) => ({ input: q, left: 0, top: i * (alt + 20) })))
        .jpeg({ quality: 82 })
        .toBuffer();
      fs.writeFileSync(path.join(pasta, "folha-antes-e-depois.jpg"), folha);
    }
    console.log(`\nfolha e ensaio gravados em ${pasta}`);
  }
  console.log(`\ncusto das chamadas de modelo: US$ ${gasto.toFixed(3)}`);
  if (!aplicar) console.log("ENSAIO: nada foi gravado. Rode com --aplicar para refazer as peças que aguardam aprovação.");
}

/**
 * A refação pela semântica da fila: o gancho de imagem (e o de arte, no post)
 * grava a foto nova SÓ nesta peça, e a peça reentra com o hash novo, ainda
 * aguardando. Os módulos de produção são importados aqui, para o ensaio não
 * carregar o renderizador.
 */
async function aplicarNaPeca(client: ReturnType<typeof clienteDoBanco>, projeto: ProjetoDaFila, a: Aprovacao, ramo: Ramo) {
  const { criarGanchosDeProducao, mundoDeProducao } = await import("../lib/server/aprovacao/ganchos-de-producao");
  const { criarFilaStore } = await import("../lib/server/aprovacao/fila-store");
  const { criarAdaptadorSupabase } = await import("../lib/server/aprovacao/pecas-supabase");
  const { decidirManutencaoNaFila } = await import("../lib/server/aprovacao/manutencao");
  const { enfileirar } = await import("../lib/server/aprovacao/fila");

  const store = criarFilaStore(client);
  const atual = await store.porPeca(projeto.id, ramo, a.pecaId);
  const decisao = decidirManutencaoNaFila(atual);
  if (decisao.acao === "pular" || !decisao.reentrar) {
    console.log(`  APLICAR: ${decisao.motivo}`);
    return;
  }
  const ganchos = criarGanchosDeProducao(mundoDeProducao(process.env));
  const ctx = {
    aprovacao: decisao.aprovacao,
    etapa: "imagem" as const,
    naoRepetir: "",
    motivo: "foto refeita pela regra do protagonista da manchete (06/10/2026): a foto mostra a pessoa ou a marca que a manchete nomeia, conferida",
    culpada: "imagem" as const,
  };
  const etapas = ramo === "post" ? [ganchos.post?.imagem, ganchos.post?.arte] : [ganchos.artigo?.imagem];
  const imagens: string[] = [];
  for (const etapa of etapas) {
    if (!etapa) {
      console.log("  APLICAR: o gancho desta etapa não existe; nada gravado");
      return;
    }
    const r = await etapa({ ...ctx, etapa: etapa === ganchos.post?.arte ? "arte" : "imagem" });
    if (!r.ok) {
      console.log(`  APLICAR: o gancho recusou (${r.motivo}).${imagens.length ? " A foto já foi gravada e a arte não: a peça fica como está; refaça a arte no painel." : ""}`);
      return;
    }
    imagens.push(...((r.resumo?.imagens as string[] | undefined) ?? []));
  }
  const pecas = criarAdaptadorSupabase(client, projeto);
  const peca = await pecas.ler(ramo, a.pecaId);
  if (!peca) {
    console.log("  APLICAR: GRAVOU, mas a peça não foi relida; a fila não foi atualizada");
    return;
  }
  const linha = await enfileirar(
    projeto,
    { ramo, pecaId: a.pecaId, hash: peca.hashAtual, publicarEm: a.publicarEm, avisos: a.avisos, resumo: imagens.length ? { imagens } : {} },
    { store, pecas } as never,
  );
  console.log(`  APLICAR: refeita; fila ${linha ? `"${linha.estado}" com o hash ${linha.hashArtefato.slice(0, 12)}` : "NÃO atualizada (fila desligada?)"}`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
