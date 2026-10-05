import type { PautaAvaliada } from "../editorial/guarda";
import type { ConfigEditorial } from "../editorial/config";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import type { RegistroHistorico } from "../editorial/history";
import type { LivroDeCustos } from "./custos";
import { montarPeca } from "./peca";
import type { PecaPronta } from "./peca";
import { selecionarParaPortal } from "./selecao";
import type { SelecaoDoRamo } from "./selecao";
import { categoriaDoArtigo, escreverArtigoDaPauta, renderizarArtigoHtml } from "./artigo";
import type { MarcaDoArtigo, ResultadoDoArtigo } from "./artigo";
import { horariosDosArtigos, slugDoArtigo } from "./portal";
import type { ConteudoDoArtigo } from "./portal";

/**
 * O pacote factual é da camada comum, e é montado UMA vez por pauta.
 *
 * Newsletter e portal podem escolher a mesma pauta. Sem o cache, cada ramo
 * pagaria a extração de novo e, pior, receberia uma extração DIFERENTE do mesmo
 * texto, porque o extrator é um modelo. Dois canais escrevendo sobre o mesmo
 * fato a partir de duas listas de fatos é o começo de uma contradição pública.
 */
export async function garantirPacotes(
  pautas: PautaAvaliada[],
  cache: Map<string, PacoteFactual>,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; livro?: LivroDeCustos } = {},
): Promise<{ montados: number; falhas: string[] }> {
  const faltam = pautas.filter((p) => !cache.has(p.grupo.primary.url));
  if (faltam.length === 0) return { montados: 0, falhas: [] };

  const r = await montarPacotesDasPautas(
    faltam.map((p) => ({
      url: p.grupo.primary.url,
      titulo: p.grupo.primary.title,
      texto: p.enriquecimento.texto,
      urls: [p.grupo.primary.url, ...p.grupo.secondary_urls],
    })),
    opcoes.env ?? process.env,
    opcoes.fetcher ?? fetch,
  );
  for (const [url, pacote] of r.pacotes) cache.set(url, pacote);
  opcoes.livro?.lancar("pacote_factual", "comum", r.custoUsd, r.tokens);
  return { montados: r.pacotes.size, falhas: r.falhas };
}

export type EntradaDoRamoDoPortal = {
  pool: PautaAvaliada[];
  pacotes: Map<string, PacoteFactual>;
  historico: RegistroHistorico[];
  config: ConfigEditorial;
  marca: MarcaDoArtigo;
  data: string;
  timezone: string;
  horarios: string[];
  livro?: LivroDeCustos;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** A capa vem da resolução de imagem, que é camada comum. Ausente: sem capa. */
  resolverCapa?: (pauta: PautaAvaliada) => Promise<string | null>;
  /** Trocado em teste, para não chamar o modelo. */
  escrever?: typeof escreverArtigoDaPauta;
};

export type ResultadoDoRamoDoPortal = {
  selecao: SelecaoDoRamo;
  pecas: Array<PecaPronta<ConteudoDoArtigo>>;
  linhasDeLog: string[];
};

/**
 * Seleciona, escreve e audita as matérias do dia. NÃO grava nada.
 *
 * Gravar é decisão de quem chama, pelo modo: em `dry_run` o resultado vira
 * diagnóstico, em `enforce` vira linha `scheduled` em `articles`. Separar as
 * duas coisas é o que permite o ensaio rodar exatamente o caminho de produção.
 */
export async function rodarRamoDoPortal(e: EntradaDoRamoDoPortal): Promise<ResultadoDoRamoDoPortal> {
  const escrever = e.escrever ?? escreverArtigoDaPauta;
  const selecao = selecionarParaPortal(e.pool, e.pacotes, e.historico, e.config);
  const linhas = [...selecao.linhasDeLog];
  const horarios = horariosDosArtigos(selecao.escolhidas.length, e.data, e.timezone, e.horarios);

  const pecas: Array<PecaPronta<ConteudoDoArtigo>> = [];

  for (const [i, pauta] of selecao.escolhidas.entries()) {
    const pacote = e.pacotes.get(pauta.grupo.primary.url);
    // A seleção já exige pacote. Isto é o cinto: sem pacote, não se escreve.
    if (!pacote) continue;

    let r: ResultadoDoArtigo;
    try {
      r = await escrever(pauta, pacote, e.marca, { env: e.env, fetcher: e.fetcher, livro: e.livro });
    } catch (erro) {
      linhas.push(`[RAMO artigo] falha técnica, a matéria não sai: ${(erro as Error).message} :: ${pauta.grupo.primary.title.slice(0, 60)}`);
      continue;
    }
    if (!r.artigo) {
      linhas.push(`[RAMO artigo] não escrita: ${r.erro} :: ${pauta.grupo.primary.title.slice(0, 60)}`);
      continue;
    }

    let capa: string | null = null;
    if (e.resolverCapa) {
      try {
        capa = await e.resolverCapa(pauta);
      } catch (erro) {
        linhas.push(`[RAMO artigo] capa não resolvida: ${(erro as Error).message}`);
      }
    }

    const fonte = { nome: pauta.grupo.primary.source_name, url: pauta.grupo.primary.url };
    const slug = slugDoArtigo(r.artigo.titulo, e.data);
    const conteudo: ConteudoDoArtigo = {
      artigo: r.artigo,
      html: renderizarArtigoHtml(r.artigo, fonte),
      categoria: categoriaDoArtigo(pauta, r.artigo.titulo),
      fonte,
      sourceUrls: pacote.source_urls,
      capa,
      publicarEm: horarios[i],
      slug,
    };

    pecas.push(
      montarPeca({
        ramo: "artigo",
        referenciaId: slug,
        storyIds: [pauta.storyId],
        titulo: r.artigo.titulo,
        conteudo,
        avisos: r.veredicto.avisos,
        aprovadaPeloAuditor: r.veredicto.aprovado,
        bloqueios: r.veredicto.bloqueios,
      }),
    );
    linhas.push(
      `[RAMO artigo] ${r.veredicto.aprovado ? "aprovada" : "BLOQUEADA"} em ${r.tentativas} tentativa(s) :: ${r.artigo.titulo.slice(0, 70)}` +
        (r.veredicto.bloqueios.length ? ` :: ${r.veredicto.bloqueios.join(" | ")}` : ""),
    );
  }

  return { selecao, pecas, linhasDeLog: linhas };
}
