import { z } from "zod";
import type { Project } from "@/lib/server/projects";
import type { CenaDaPauta } from "@/lib/server/visual/cena-da-pauta";
import { SISTEMA_DA_CONFERENCIA, paraConferir } from "@/lib/server/visual/conferencia-visual";
import { resolveVisualAsset, type Conferente, type OpcoesDeResolucao, type PautaParaImagem } from "@/lib/server/visual/resolver";
import type { AssetVisual, ResultadoVisual } from "@/lib/server/visual/tipos";
import type { Tarefa, TarefasStore } from "../tarefas-store";

/**
 * A foto da pauta pelo Claude (29/10/2026).
 *
 * O resolvedor da esteira roda inteiro (acervo, bancos oficiais, Commons,
 * Pexels, a escada da cena), mas com um conferente que NÃO chama modelo: ele
 * anota cada foto que a esteira mandaria abrir e responde "ainda não". As
 * anotadas, até seis, viram a tarefa `escolher_foto`, que o Claude vê como
 * imagem, com o critério da conferência visual da esteira
 * (`SISTEMA_DA_CONFERENCIA`). A escolha vira o `ResultadoVisual` da pauta, em
 * `imagem_da_pauta`, de onde todos os canais leem.
 *
 * A cena (o que fotografar quando não há pessoa nem órgão) vem do Claude, no
 * plano do dia: a pergunta ao modelo também não sai.
 */

export const TIPO_DA_FOTO = "escolher_foto" as const;
export const MAXIMO_DE_CANDIDATAS = 6;
const PISO_DE_CONFIANCA = 70;

export type CandidataDeFoto = {
  indice: number;
  papel: string;
  imageUrl: string;
  /** A versão leve, que o MCP baixa para mostrar ao Claude. */
  previa: string;
  fonte: string;
  credito: string;
  asset: AssetVisual;
};

/** O conferente que anota e não decide. */
export function conferenteQueAnota(): { conferente: Conferente; anotadas: Array<{ asset: AssetVisual; papel: string }> } {
  const anotadas: Array<{ asset: AssetVisual; papel: string }> = [];
  const vistas = new Set<string>();
  return {
    anotadas,
    conferente: async (asset, contexto) => {
      if (asset.imageUrl && !vistas.has(asset.imageUrl)) {
        vistas.add(asset.imageUrl);
        anotadas.push({ asset, papel: contexto.papel ?? "assunto" });
      }
      return { aprovada: false, descricao: "", motivo: "aguardando a escolha do Claude", paisAparente: null, confianca: 0, falhou: false };
    },
  };
}

export async function candidatasDaFoto(
  pauta: PautaParaImagem,
  cena: CenaDaPauta,
  opcoes: Omit<OpcoesDeResolucao, "conferenciaVisual" | "cenaPronta" | "somenteLeitura">,
  resolver: typeof resolveVisualAsset = resolveVisualAsset,
): Promise<CandidataDeFoto[]> {
  const { conferente, anotadas } = conferenteQueAnota();
  await resolver(pauta, { ...opcoes, conferenciaVisual: conferente, cenaPronta: cena, somenteLeitura: true });
  return anotadas.slice(0, MAXIMO_DE_CANDIDATAS).map(({ asset, papel }, i) => ({
    indice: i,
    papel,
    imageUrl: asset.imageUrl,
    previa: paraConferir(asset.imageUrl),
    fonte: String(asset.source),
    credito: asset.attribution ?? "",
    asset,
  }));
}

export const EscolhaDaFotoSchema = z.object({
  escolha: z.number().int().min(0).nullable().describe("O índice da foto escolhida, ou null se nenhuma serve."),
  descricao: z.string().describe("O que se vê na foto escolhida (ou por que nenhuma serve)."),
  confianca: z.number().min(0).max(100),
  motivo: z.string().default(""),
  /*
   * Autonomia do Claude (06/11/2026): nenhuma candidata serve? Ele acha a foto
   * na web pelo chat (imagem_url com autor e fonte) ou com buscar_imagens
   * (imagem_id). Recusar todas derrubava o post da pauta.
   */
  imagem_url: z.string().optional().describe("Link DIRETO do arquivo de uma foto que você achou na web, quando nenhuma candidata serve."),
  imagem_id: z.string().optional().describe("Ou o id de uma candidata de buscar_imagens."),
  autor: z.string().optional().describe("Com imagem_url: quem fotografou, ou a instituição dona da foto."),
  fonte: z.string().optional().describe("Com imagem_url: o site ou a agência de onde ela veio."),
  pagina: z.string().optional().describe("Com imagem_url: a página onde a foto está publicada."),
  /*
   * O Reel corta a foto em 9:16 (09/11/2026). Sem detector de rosto no motor
   * Claude, quem diz onde está o assunto é quem olhou a foto.
   */
  foco: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional()
    .describe("Onde está o rosto ou o assunto na foto escolhida, em fração da largura (x) e da altura (y), 0 a 1. O Reel corta a foto em 9:16 em volta deste ponto."),
  /*
   * O carrossel de notícia (09/11/2026): cada slide é foto, e foto diferente da
   * capa. Slide sem foto sai do carrossel.
   */
  extras: z
    .array(
      z.object({
        escolha: z.number().int().min(0).nullable().optional().describe("O índice de uma candidata, ou null com imagem_url/imagem_id."),
        imagem_url: z.string().optional(),
        imagem_id: z.string().optional(),
        autor: z.string().optional(),
        fonte: z.string().optional(),
        pagina: z.string().optional(),
        descricao: z.string().default(""),
      }),
    )
    .max(4)
    .optional()
    .describe("Só quando a tarefa pede fotos para o carrossel: as fotos dos slides, na ordem, todas diferentes da capa."),
});

/** Uma foto de slide já resolvida: o que a arte do carrossel desenha e o crédito da legenda. */
export type FotoDoSlide = { imageUrl: string; attribution: string };

const ESQUEMA = z.toJSONSchema(EscolhaDaFotoSchema, { io: "input" }) as Record<string, unknown>;

export type MaterialDaFoto = {
  storyId: string;
  titulo: string;
  resumo: string;
  categoria: string;
  candidatas: Array<Omit<CandidataDeFoto, "asset">>;
  /** Os assets inteiros, para a entrega montar o resultado sem resolver de novo. */
  assets: AssetVisual[];
  /** O post desta pauta é carrossel: quantas fotos de slide pedir além da capa. */
  fotosDoCarrossel?: number;
};

export async function abrirFoto(projeto: Project, data: string, material: MaterialDaFoto, tarefas: TarefasStore): Promise<Tarefa> {
  const lista = material.candidatas
    .map((c) => `[${c.indice}] ${c.papel === "cena" ? "CONTEXTO" : "ASSUNTO"} · ${c.fonte} · ${c.credito || "sem crédito"}`)
    .join("\n");
  return tarefas.abrir({
    projectId: projeto.id,
    editionDate: data,
    tipo: TIPO_DA_FOTO,
    chave: material.storyId,
    instrucao: {
      system: SISTEMA_DA_CONFERENCIA,
      user:
        `MANCHETE: ${material.titulo}\nRESUMO: ${material.resumo}\nEDITORIA: ${material.categoria}\n\n` +
        `As fotos candidatas vêm como imagens, na ordem dos índices:\n${lista}\n\n` +
        (material.candidatas.length
          ? "Escolha UMA que sustenta a manchete pelo critério acima (foto de CONTEXTO só precisa ambientar o assunto). "
          : "A busca automática não achou candidata. ") +
        "Se nenhuma serve, NÃO deixe a pauta sem foto: procure você mesmo na web (site ou sala de imprensa da empresa, agência, Wikipedia, Flickr) " +
        "ou com a ferramenta buscar_imagens, confira com ver_imagem, e entregue escolha null com imagem_url (link direto do arquivo), autor e fonte, " +
        "ou com imagem_id de buscar_imagens. Pauta sem foto não vira post. " +
        "O post sai em Reel vertical (9:16): prefira foto em que o assunto caiba num recorte vertical, e diga em `foco` onde está o rosto ou o assunto (x e y de 0 a 1). " +
        (material.fotosDoCarrossel
          ? `ESTE POST É CARROSSEL: além da foto da capa, entregue em \`extras\` ${material.fotosDoCarrossel} fotos DIFERENTES para os slides, na ordem ` +
            "(outro ângulo, outra pessoa citada, o lugar, o produto, o número em contexto), pelo índice de uma candidata ou com imagem_url, autor e fonte. Slide sem foto sai do carrossel. "
          : "") +
        `Confiança abaixo de ${PISO_DE_CONFIANCA} é recusa.`,
      orientacao: "Olhe as imagens anexadas e responda SÓ com o JSON do esquema.",
    },
    material: material as unknown as Record<string, unknown>,
    esquema: ESQUEMA,
  });
}

/** Pura: a escolha vira o resultado da pauta, ou a recusa. */
export function resultadoDaEscolha(material: MaterialDaFoto, bruto: unknown): { ok: true; resultado: ResultadoVisual } | { ok: false; motivo: string } {
  const lido = EscolhaDaFotoSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivo: `a resposta não cabe no esquema: ${lido.error.issues[0]?.message ?? ""}` };
  const e = lido.data;
  const asset = e.escolha === null ? null : material.assets[e.escolha];
  const papel = e.escolha === null ? null : material.candidatas[e.escolha]?.papel;
  const aprovada = Boolean(asset) && e.confianca >= PISO_DE_CONFIANCA;
  return {
    ok: true,
    resultado: {
      storyId: material.storyId,
      entidade: null,
      asset:
        aprovada && asset
          ? { ...asset, conferenciaVisual: { descricao: e.descricao, motivo: `conferida pelo Claude${e.motivo ? `: ${e.motivo}` : ""}`, paisAparente: null, confianca: e.confianca } }
          : null,
      assetSecundario: null,
      status: aprovada ? "SELECTED" : "NO_VALID_IMAGE",
      motivo: aprovada ? null : "VISUAL_CHECK_FAILED",
      fontesConsultadas: [{ fonte: "biblioteca_interna", encontrados: material.candidatas.length, nota: `conferida pelo Claude: ${e.descricao.slice(0, 200)}` }],
      recusados: [],
      legenda: "",
      caminho: papel === "cena" ? "cena" : "entidade",
    },
  };
}

/** A foto que o Claude achou fora das candidatas vira asset (Storage, crédito); string é o motivo da recusa. */
export type FotoDaWeb = (escolha: { imagem_url?: string; imagem_id?: string; autor?: string; fonte?: string; pagina?: string }) => Promise<AssetVisual | string>;

async function comFotoDaWeb(
  material: MaterialDaFoto,
  bruto: unknown,
  fotoDaWeb: FotoDaWeb,
): Promise<{ ok: true; resultado: ResultadoVisual } | { ok: false; motivo: string }> {
  const lido = EscolhaDaFotoSchema.safeParse(bruto);
  if (!lido.success || (!lido.data.imagem_url && !lido.data.imagem_id) || lido.data.escolha !== null) return resultadoDaEscolha(material, bruto);
  const asset = await fotoDaWeb(lido.data);
  if (typeof asset === "string") return { ok: false, motivo: `a foto indicada não serviu: ${asset}` };
  return {
    ok: true,
    resultado: {
      storyId: material.storyId,
      entidade: null,
      asset: { ...asset, conferenciaVisual: { descricao: lido.data.descricao, motivo: "escolhida pelo Claude fora das candidatas", paisAparente: null, confianca: lido.data.confianca } },
      assetSecundario: null,
      status: "SELECTED",
      motivo: null,
      fontesConsultadas: [{ fonte: "biblioteca_interna", encontrados: 1, nota: `foto achada pelo Claude: ${lido.data.descricao.slice(0, 200)}` }],
      recusados: [],
      legenda: "",
      caminho: "entidade",
    },
  };
}

/** As fotos dos slides do carrossel, resolvidas na entrega. Foto que não serve vira recusa, sem derrubar a capa. */
export async function fotosDosSlides(
  material: MaterialDaFoto,
  bruto: unknown,
  capa: string,
  fotoDaWeb?: FotoDaWeb,
): Promise<{ fotos: FotoDoSlide[]; recusas: string[] }> {
  const lido = EscolhaDaFotoSchema.safeParse(bruto);
  const pedidos = lido.success ? (lido.data.extras ?? []) : [];
  const fotos: FotoDoSlide[] = [];
  const recusas: string[] = [];
  const vistas = new Set([capa]);
  for (const [i, e] of pedidos.entries()) {
    let asset: AssetVisual | string | null = null;
    if (typeof e.escolha === "number") asset = material.assets[e.escolha] ?? `a candidata ${e.escolha} não existe`;
    else if ((e.imagem_url || e.imagem_id) && fotoDaWeb) asset = await fotoDaWeb(e);
    else asset = "sem escolha, imagem_url nem imagem_id";
    if (typeof asset === "string") {
      recusas.push(`foto ${i + 1} do carrossel: ${asset}`);
      continue;
    }
    if (!asset?.imageUrl || vistas.has(asset.imageUrl)) {
      recusas.push(`foto ${i + 1} do carrossel: repete outra foto do post`);
      continue;
    }
    vistas.add(asset.imageUrl);
    fotos.push({ imageUrl: asset.imageUrl, attribution: asset.attribution ?? "" });
  }
  return { fotos, recusas };
}

export type DepsDaFoto = {
  fotoDaWeb?: FotoDaWeb;
  tarefas: TarefasStore;
  gravarFoto: (projectId: string, resultado: ResultadoVisual) => Promise<void>;
};

export async function entregarFoto(
  tarefa: Tarefa,
  resultado: unknown,
  quem: string,
  deps: DepsDaFoto,
): Promise<{ ok: true; desfecho: "foto"; storyId: string; comFoto: boolean } | { ok: true; desfecho: "reparar"; tarefa: Tarefa; motivos: string[] }> {
  const material = tarefa.material as unknown as MaterialDaFoto;
  const r = deps.fotoDaWeb ? await comFotoDaWeb(material, resultado, deps.fotoDaWeb) : resultadoDaEscolha(material, resultado);
  if (!r.ok) {
    return { ok: true, desfecho: "reparar", motivos: [r.motivo], tarefa: await deps.tarefas.pedirReparo(tarefa.id, resultado, [r.motivo], quem) };
  }
  await deps.gravarFoto(tarefa.projectId, r.resultado);
  const extras = await fotosDosSlides(material, resultado, r.resultado.asset?.imageUrl ?? "", deps.fotoDaWeb);
  const entregue =
    extras.fotos.length || extras.recusas.length
      ? { ...(resultado as Record<string, unknown>), extras_resolvidas: extras.fotos, extras_recusadas: extras.recusas }
      : resultado;
  await deps.tarefas.entregar(tarefa.id, entregue, quem);
  return { ok: true, desfecho: "foto", storyId: material.storyId, comFoto: r.resultado.status === "SELECTED" };
}
