import type { ProjetoComCapacidades } from "../capacidades";
import type { FilaStore } from "./fila-store";
import { hashDaNewsletter, hashDoArtigo } from "./hash";
import { modoDaFila } from "./modo";
import { decidirPublicacao, type DecisaoDoPortao } from "./portao";

/**
 * O portão único na frente do portal (integração de 05/10/2026).
 *
 * Até a integração, três caminhos punham um artigo no ar e só um perguntava à
 * fila: `/api/cron/portal` (ramos) exigia `manual_review_status = approved`,
 * `/api/cron/publicacao` (`publicacao-agendada.ts`) virava `scheduled` em
 * `published` sem perguntar nada, e a liberação da fila perguntava ao portão.
 * Com a fila em `enforce`, o segundo caminho publicaria às 06:07 a matéria que
 * ninguém aprovou. É a "mesma regra em três cópias" de 16/09/2026, outra vez.
 *
 * Aqui os dois relógios fazem a MESMA pergunta, com a mesma função
 * (`decidirPublicacao`) e o mesmo hash que a liberação da fila usa
 * (`hashDoArtigo` sobre título, HTML e capa, `hashDaNewsletter` sobre assunto e
 * HTML). Ler a aprovação é trabalho deste módulo; decidir continua sendo só do
 * portão.
 *
 * Com a fila em `off` nada aqui é lido: quem chama nem entra neste módulo, e o
 * caminho de publicação é o de antes, byte a byte.
 */

export type ArtigoCandidato = {
  id: string;
  slug: string;
  title: string | null;
  content_html: string | null;
  cover_image?: string | null;
};

export type EdicaoCandidata = {
  id: string;
  edition_date: string;
  subject: string | null;
  content_html: string | null;
};

export type Segurada = { id: string; rotulo: string; motivo: string };

export type FiltroDoPortao<T> = { liberadas: T[]; seguradas: Segurada[] };

type LeitorDaFila = Pick<FilaStore, "porPeca">;

/** Se o portão precisa ser consultado neste projeto. Fila em `off`: não precisa. */
export function portalPerguntaAFila(projeto: ProjetoComCapacidades | null | undefined): boolean {
  return modoDaFila(projeto) !== "off";
}

async function filtrar<T extends { id: string }>(
  projeto: ProjetoComCapacidades & { id: string },
  ramo: "artigo" | "newsletter",
  candidatas: T[],
  hashDe: (c: T) => string,
  rotuloDe: (c: T) => string,
  fila: LeitorDaFila,
): Promise<FiltroDoPortao<T>> {
  const modo = modoDaFila(projeto);
  if (modo === "off") return { liberadas: candidatas, seguradas: [] };

  const r: FiltroDoPortao<T> = { liberadas: [], seguradas: [] };
  for (const c of candidatas) {
    let decisao: DecisaoDoPortao;
    try {
      const aprovacao = await fila.porPeca(projeto.id, ramo, c.id);
      decisao = decidirPublicacao({ modo, ramo, aprovacao, hashAtual: hashDe(c) });
    } catch (erro) {
      /*
       * Não conseguir ler a fila não é aprovação (mesma regra do worker, em
       * `conferirPostNoWorker`). Em `enforce` segura; em `dry_run` publica
       * como antes e só registra.
       */
      const motivo = `não consegui ler a fila: ${erro instanceof Error ? erro.message : String(erro)}`;
      if (modo === "enforce") {
        r.seguradas.push({ id: c.id, rotulo: rotuloDe(c), motivo });
        continue;
      }
      console.warn(`[FILA] ensaio: ${ramo} ${rotuloDe(c)}: ${motivo}`);
      r.liberadas.push(c);
      continue;
    }

    if (modo === "dry_run" && !decisao.liberariaEmEnforce) {
      console.log(`[FILA] ensaio: ${ramo} ${rotuloDe(c)} seria SEGURADO em enforce (${decisao.motivo}: ${decisao.detalhe})`);
    }
    if (decisao.libera) r.liberadas.push(c);
    else r.seguradas.push({ id: c.id, rotulo: rotuloDe(c), motivo: `${decisao.motivo}: ${decisao.detalhe}` });
  }
  return r;
}

/** Quais artigos vencidos podem ir ao ar, pela aprovação DESTA versão. */
export function artigosLiberadosPeloPortao(
  projeto: ProjetoComCapacidades & { id: string },
  candidatos: ArtigoCandidato[],
  fila: LeitorDaFila,
): Promise<FiltroDoPortao<ArtigoCandidato>> {
  return filtrar(
    projeto,
    "artigo",
    candidatos,
    (a) => hashDoArtigo(a.title, a.content_html, a.cover_image),
    (a) => a.slug,
    fila,
  );
}

/**
 * Quais edições vencidas podem aparecer no portal.
 *
 * A edição no portal é o mesmo assunto e o mesmo HTML da newsletter, e a fila
 * aprova os dois como UMA peça (ramo `newsletter`, peça = id da edição). Edição
 * cuja newsletter não foi aprovada não vai ao portal: a página seria a versão
 * que o editor ainda não viu.
 */
export function edicoesLiberadasPeloPortao(
  projeto: ProjetoComCapacidades & { id: string },
  candidatas: EdicaoCandidata[],
  fila: LeitorDaFila,
): Promise<FiltroDoPortao<EdicaoCandidata>> {
  return filtrar(
    projeto,
    "newsletter",
    candidatas,
    (e) => hashDaNewsletter(e.subject, e.content_html),
    (e) => e.edition_date,
    fila,
  );
}
