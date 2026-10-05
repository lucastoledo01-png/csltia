import {
  descreverDescartes,
  entidadesPresentesNoTexto,
  indexacaoDasTags,
  tagsDeIndexacao,
  tagsSemIndexacao,
  textoDoHtml,
  validarAssuntos,
  type EntidadeDaMateria,
} from "@/lib/indexacao-do-artigo";
import { regrarEssencialNoHtml, type EssencialNoHtml } from "./ramos/essencial";

/**
 * O ajuste DETERMINISTA de uma matéria já gravada (06/10/2026): as regras do
 * "O que você precisa saber" sobre o HTML que está no banco, e os assuntos e
 * entidades recalculados pelo validador a partir do que as tags já têm.
 *
 * Existe porque a reescrita chama o modelo, e o modelo dá outro texto a cada
 * rodada: a matéria de Chicago foi lida pelo dono numa versão, e é ESSA que
 * recebe as regras novas. Nada aqui chama modelo nem rede, e nenhuma frase é
 * reescrita: tópico sai inteiro, tag sai inteira.
 */

export type MateriaGravada = {
  title: string;
  category?: string | null;
  content_html: string | null;
  tags?: string[] | null;
};

export type AjusteDaMateria = {
  essencial: EssencialNoHtml;
  antes: { assuntos: string[]; entidades: EntidadeDaMateria[] };
  depois: { assuntos: string[]; entidades: EntidadeDaMateria[] };
  log: string[];
  /** Só o que muda; quem grava acrescenta `updated_at`. */
  patch: { content_html: string; tags: string[] };
};

/** O texto que conta como "a matéria nomeia": título e corpo, sem "Leia também" e "Fontes". */
export function textoParaPresenca(title: string, html: string): string {
  const corpo = html.replace(/<section class="(?:leia-tambem|fontes)">[\s\S]*?<\/section>/g, " ");
  return `${title}\n${textoDoHtml(corpo)}`;
}

export function ajustarMateriaGravada(m: MateriaGravada): AjusteDaMateria {
  const essencial = regrarEssencialNoHtml(m.content_html ?? "");
  const html = essencial.html;
  const antes = indexacaoDasTags(m.tags);
  const texto = textoParaPresenca(m.title, html);

  const entidades = entidadesPresentesNoTexto(antes.entidades, texto);
  const { assuntos, descartados } = validarAssuntos(antes.assuntos, { entidades, texto, editoria: m.category ?? null });

  const log = [
    ...essencial.removidos.map((r) => `TÓPICO APAGADO essencial.${r.indice}: ${r.motivo}`),
    ...antes.entidades.filter((e) => !entidades.includes(e)).map((e) => `ENTIDADE FORA (o texto não nomeia): ${e.papel}:${e.tipo}:${e.nome}`),
    ...descreverDescartes(descartados),
  ];

  return {
    essencial,
    antes,
    depois: { assuntos, entidades },
    log,
    patch: { content_html: html, tags: [...tagsSemIndexacao(m.tags), ...tagsDeIndexacao({ assuntos, entidades })] },
  };
}
