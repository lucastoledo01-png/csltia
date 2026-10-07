import { getImageProps } from "next/image";
import type { EditoriaId } from "@/lib/editorias";
import { enderecoLimpoDaImagem, fotoNaLargura, hostOtimizavel, miniaturaDoCommons, recorteDaFoto } from "@/lib/imagem-da-capa";

/**
 * As peças pequenas que a home, a lista de edições e o artigo dividem.
 */

/**
 * Cor da faixa de cada editoria, usada só na peça SEM foto.
 *
 * A pauta sem foto não pode virar caixa cinza vazia, que lê como imagem que
 * não carregou. Ela vira uma peça tipográfica com a faixa da editoria, e a cor
 * é o que faz duas peças sem foto lado a lado não parecerem a mesma.
 */
const FAIXA: Record<EditoriaId, string> = {
  economia: "#0F766E",
  trabalho: "#B45309",
  tecnologia: "#1D4ED8",
  "custo-de-vida": "#7E22CE",
  governo: "var(--portal-vermelho)",
  brasil: "#15803D",
};

export function corDaEditoria(editoria: EditoriaId | undefined): string {
  return (editoria && FAIXA[editoria]) || "var(--portal-vermelho)";
}

/**
 * A foto de uma pauta dentro de uma caixa de proporção fixa.
 *
 * A caixa (`proporcao`, como `aspect-[16/9]`) existe ANTES da imagem, e a
 * imagem só a preenche. É a correção do incidente "Medida relativa contra pai
 * sem altura": com `h-full` num pai de altura automática, uma foto de
 * 3909x5863 virou uma manchete de 1061px.
 *
 * `<img>` e não `next/image`, como já era na home: a foto vem do HTML da
 * edição e pode ser de qualquer host, e `next/image` LANÇA com host fora da
 * lista do `next.config.ts`, derrubando a página inteira em vez de uma foto.
 *
 * O `alt` é vazio de propósito: a foto está dentro do mesmo link que a
 * manchete, e repetir o título no `alt` faz o leitor de tela ler tudo duas
 * vezes. Não temos descrição da foto para dizer outra coisa.
 */
export function FotoDaPauta({
  src,
  proporcao,
  className = "",
  rotulo,
  editoria,
  prioridade = false,
  arredondado = "rounded-xl",
  tamanhos = "(min-width: 768px) 33vw, 100vw",
}: {
  src: string | null;
  proporcao: string;
  className?: string;
  rotulo: string;
  editoria?: EditoriaId;
  prioridade?: boolean;
  arredondado?: string;
  /** O `sizes` da foto: a largura que a caixa ocupa em cada tela. */
  tamanhos?: string;
}) {
  const classe = `absolute inset-0 h-full w-full object-cover ${recorteDaFoto(src).classe} transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100`;
  const fonte = src ? fotoNaLargura(enderecoDaFoto(src), prioridade ? 1280 : 960) : "";

  /*
   * Host conhecido passa pelo otimizador do Next (06/10/2026): WebP na largura
   * da tela, pela lista de `sizes`, em vez do arquivo do banco de imagem
   * inteiro. Antes a manchete da home baixava a foto do jeito que estava
   * gravada, e cada card da grade baixava a miniatura de 960 do Commons para
   * uma caixa de 96px no celular. Só a manchete carrega com prioridade, porque
   * é ela o LCP da home.
   */
  const otimizada = fonte && hostOtimizavel(fonte)
    ? getImageProps({
        src: fonte,
        alt: "",
        fill: true,
        sizes: tamanhos,
        loading: prioridade ? "eager" : "lazy",
        fetchPriority: prioridade ? "high" : undefined,
      }).props
    : null;

  return (
    <div className={`relative overflow-hidden ${arredondado} ${proporcao} ${className}`}>
      {/*
        A peça tipográfica fica SEMPRE por baixo. Com foto, ela é o que aparece
        enquanto o arquivo chega (as fotos do Commons são o original, de
        vários megabytes) e se o endereço quebrar: com `alt` vazio o navegador
        não desenha ícone de imagem quebrada, e sobra a peça, não um buraco.
      */}
      <SemFoto rotulo={rotulo} editoria={editoria} />
      {otimizada ? (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img {...otimizada} className={classe} />
      ) : fonte ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fonte}
          alt=""
          loading={prioridade ? "eager" : "lazy"}
          fetchPriority={prioridade ? "high" : undefined}
          decoding="async"
          className={classe}
        />
      ) : null}
    </div>
  );
}

/**
 * O endereço da foto como o navegador precisa dele.
 *
 * A foto é extraída do `content_html` da edição, onde o `&` da query string
 * está escrito como `&amp;`, às vezes duas vezes. Sem desfazer isso, o React
 * escapa de novo e o pedido sai com `&amp;amp;` no meio dos parâmetros de
 * tamanho, que o banco de imagem ignora e devolve o arquivo cheio.
 */
export function enderecoDaFoto(src: string): string {
  // Também desfaz o `&amp%3B` que 15 capas do Pexels gravaram (05/10/2026).
  return enderecoLimpoDaImagem(src);
}

/**
 * A foto do Wikimedia Commons na largura que a página usa, e não o original.
 *
 * O resolvedor grava o endereço do ORIGINAL, que no Commons passa fácil de
 * 5 MB (uma das fotos da home tem 3909x5863). Num card de 224px isso é peso
 * à toa, e o Commons limita quem pede original demais: em 05/10/2026, ao
 * capturar as telas deste redesenho, o endereço passou a responder 429 para
 * o original e 200 para a miniatura.
 *
 * O caminho da miniatura é o do próprio Commons:
 * `/commons/thumb/a/ab/Arquivo.jpg/1280px-Arquivo.jpg`. Se o original for
 * menor que a largura pedida o Commons devolve 400, e a peça tipográfica que
 * fica por baixo de toda foto aparece no lugar. SVG e TIFF ficam como estão,
 * porque a miniatura deles muda de extensão.
 */
export { miniaturaDoCommons };

/**
 * O resumo da pauta como texto corrido.
 *
 * A redação marca número e prazo com dois asteriscos, e quem converte em
 * negrito é o template do e-mail. No card do portal o resumo é cortado em
 * duas linhas, e negrito no meio de um trecho cortado não ajuda: os
 * asteriscos saem e o texto fica.
 */
export function textoCorrido(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*\*/g, "");
}

/** A peça tipográfica de quem não tem foto. */
function SemFoto({ rotulo, editoria }: { rotulo: string; editoria?: EditoriaId }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end bg-[#18181B] p-[8%]" aria-hidden="true">
      <span className="absolute left-0 top-0 h-full w-1.5" style={{ background: corDaEditoria(editoria) }} />
      <span className="mb-3 block h-px w-10" style={{ background: corDaEditoria(editoria) }} />
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">{rotulo}</span>
    </div>
  );
}

/** O selo vermelho sobre a foto da manchete. */
export function Selo({ texto }: { texto: string }) {
  return (
    <span className="inline-block rounded-sm bg-[var(--portal-vermelho)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
      {texto}
    </span>
  );
}

/** O chapéu de editoria em texto, acima da manchete do card. */
export function Chapeu({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <span className={`block text-[10px] font-bold uppercase tracking-[0.16em] text-marca-texto ${className}`}>
      {texto}
    </span>
  );
}

/**
 * "2026-10-04" vira "04/10/2026". A data da pauta é a da edição.
 *
 * Aceita também o instante completo ("2026-09-24T09:19:54.472+00:00"): a
 * manchete fixada (05/10/2026) traz o `published_at` da matéria, e o corte por
 * hífen sozinho imprimia "24T09:19:54.472+00:00/09/2026" na home.
 */
export function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
