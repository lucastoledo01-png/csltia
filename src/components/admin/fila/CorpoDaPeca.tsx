"use client";

import Image from "next/image";
import { useState } from "react";
import type { Aprovacao } from "@/lib/server/aprovacao/contrato";
import type { PreviaDaNewsletter, PreviaDoArtigo, PreviaDoPlano, PreviaDoPost } from "@/lib/server/aprovacao/previa";
import { MolduraDePrevia } from "./MolduraDePrevia";

/**
 * O corpo de cada cartão: a peça como vai ao ar, por canal (06/10/2026).
 *
 * A newsletter é a linha da caixa de entrada e o e-mail de verdade; a matéria
 * é a página do portal; o post é a arte em telas e a legenda como o Instagram
 * a mostra, com as quebras de linha. O pacote factual vem depois, recolhido:
 * é a matéria-prima, e não o que o leitor lê.
 */

export type Edicao = {
  /** O texto que o dono pode trocar à mão: assunto, título ou legenda. */
  rotulo: string;
  valor: string;
  pode: boolean;
  salvar: (novo: string) => Promise<boolean>;
  ocupado: boolean;
};

/** Editar no lugar, sem sair da peça. A edição volta como versão nova e fica registrada. */
export function TextoEditavel({
  edicao,
  children,
  multilinha = false,
}: {
  edicao: Edicao;
  /** Sem filhos, só o botão: o texto já aparece no cabeçalho do cartão (05/11/2026). */
  children?: React.ReactNode;
  multilinha?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(edicao.valor);

  if (!editando) {
    if (!children && !edicao.pode) return null;
    return (
      <div className="group relative">
        {children}
        {edicao.pode ? (
          <button
            type="button"
            className={`${children ? "mt-1 " : ""}text-[12px] font-semibold text-slate-800 underline decoration-slate-400 underline-offset-4 hover:text-black`}
            onClick={() => {
              setTexto(edicao.valor);
              setEditando(true);
            }}
          >
            Editar {edicao.rotulo.toLowerCase()}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{edicao.rotulo}</label>
      {multilinha ? (
        <textarea className="admin-campo min-h-56 w-full text-[14px] leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} />
      ) : (
        <textarea className="admin-campo min-h-20 w-full text-[15px]" value={texto} onChange={(e) => setTexto(e.target.value)} />
      )}
      <p className="text-[12px] text-slate-500">
        O texto passa pela mesma conferência da máquina (número sem fonte, travessão, forma) e volta como versão nova,
        aguardando a sua aprovação. A edição fica registrada e ensina o canal.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="admin-botao flex-1"
          disabled={edicao.ocupado || !texto.trim() || texto === edicao.valor}
          onClick={async () => {
            if (await edicao.salvar(texto)) setEditando(false);
          }}
        >
          Salvar {edicao.rotulo.toLowerCase()}
        </button>
        <button type="button" className="admin-botao-secundario" onClick={() => setEditando(false)}>
          Desistir
        </button>
      </div>
    </div>
  );
}

function PacoteFactual({ a }: { a: Aprovacao }) {
  const fatos = a.resumo.pacoteFactual ?? [];
  if (fatos.length === 0) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-slate-700">
        Fatos de origem ({fatos.length}), a matéria-prima que o redator recebeu
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {fatos.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </details>
  );
}

export function CorpoDaNewsletter({
  a,
  previa,
  slug,
  edicao,
}: {
  a: Aprovacao;
  previa: PreviaDaNewsletter;
  slug: string;
  edicao: Edicao;
}) {
  const [celular, setCelular] = useState(true);
  return (
    <div className="space-y-4">
      {/*
        O assunto e o pré-cabeçalho estão no cabeçalho do cartão (05/11/2026).
        Aqui ficam a largura da prévia e a edição do assunto, na mesma linha.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Ver no tamanho do celular, que é onde a maioria lê, ou na largura toda. */}
        <div className="flex shrink-0 gap-1.5 text-[12px]" role="group" aria-label="Largura da prévia">
          {[
            { rotulo: "Celular", valor: true },
            { rotulo: "Computador", valor: false },
          ].map((o) => (
            <button
              key={o.rotulo}
              type="button"
              aria-pressed={celular === o.valor}
              className={`rounded-lg border px-3 py-1.5 font-medium ${celular === o.valor ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
              onClick={() => setCelular(o.valor)}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        <div className="[&:has(textarea)]:basis-full">
          <TextoEditavel edicao={edicao} />
        </div>
      </div>
      <MolduraDePrevia
        src={`/api/admin/aprovacao/previa?projeto=${encodeURIComponent(slug)}&id=${encodeURIComponent(a.id)}`}
        titulo={`E-mail: ${previa.assunto}`}
        largura={celular ? 390 : undefined}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        rotuloDeAbrir="Ver o e-mail inteiro"
      />
      <PacoteFactual a={a} />
    </div>
  );
}

export function CorpoDoArtigo({
  a,
  previa,
  slug,
  edicao,
}: {
  a: Aprovacao;
  previa: PreviaDoArtigo;
  slug: string;
  edicao: Edicao;
}) {
  const enderecoDaPrevia = `/admin/${encodeURIComponent(slug)}/aprovacao/previa/${encodeURIComponent(a.id)}`;
  return (
    <div className="space-y-4">
      {/* O título e os números da matéria estão no cabeçalho do cartão (05/11/2026). */}
      {previa.assuntos.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {previa.assuntos.map((t) => (
            <span key={t} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-700">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="[&:has(textarea)]:basis-full">
          <TextoEditavel edicao={edicao} />
        </div>
        <div className="flex gap-3 text-[12px] font-medium">
          <a href={enderecoDaPrevia} target="_blank" rel="noreferrer" className="text-slate-700 underline underline-offset-2">
            Abrir prévia em tela cheia
          </a>
          {previa.noAr && previa.slug ? (
            <a href={`/artigos/${previa.slug}`} target="_blank" rel="noreferrer" className="text-slate-700 underline underline-offset-2">
              Ver no portal
            </a>
          ) : null}
        </div>
      </div>
      <MolduraDePrevia
        src={`${enderecoDaPrevia}?moldura=0`}
        titulo={`Matéria: ${previa.titulo}`}
        alturaRecolhida={900}
        rotuloDeAbrir="Ler a matéria inteira"
      />
      <PacoteFactual a={a} />
    </div>
  );
}

/** Só o host do Storage passa pelo otimizador; outro host derrubaria a página (`next.config.ts`). */
function ehDoStorage(url: string): boolean {
  return /^https:\/\/azqpdesusdzqndvsqmko\.supabase\.co\//.test(url);
}

export function TelasDoPost({ telas, titulo }: { telas: string[]; titulo: string }) {
  const [atual, setAtual] = useState(0);
  if (telas.length === 0) {
    return <p className="rounded-lg bg-slate-100 p-6 text-center text-[13px] text-slate-500">Sem arte congelada.</p>;
  }
  return (
    <div>
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const passo = el.scrollWidth / telas.length;
          setAtual(Math.min(telas.length - 1, Math.round(el.scrollLeft / passo)));
        }}
      >
        {telas.map((url, i) => (
          <div key={url} className="relative aspect-[3/4] w-[88%] shrink-0 snap-center overflow-hidden rounded-lg bg-slate-100 sm:w-[340px]">
            {ehDoStorage(url) ? (
              <Image src={url} alt={`${titulo}, tela ${i + 1}`} fill sizes="(max-width: 640px) 88vw, 340px" className="object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`${titulo}, tela ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            )}
            {telas.length > 1 ? (
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                {i + 1}/{telas.length}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {telas.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {telas.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === atual ? "bg-slate-900" : "bg-slate-300"}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** O MP4 aprovado, o mesmo arquivo que vai para a Meta, em 9:16. */
function VideoDoReel({ url }: { url?: string }) {
  if (!url) {
    return <p className="rounded-lg bg-slate-100 p-6 text-center text-[13px] text-slate-500">Sem vídeo congelado.</p>;
  }
  return (
    <div className="aspect-[9/16] w-[88%] overflow-hidden rounded-lg bg-black sm:w-[300px]">
      <video src={url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
    </div>
  );
}

export function CorpoDoPost({ a, previa, edicao }: { a: Aprovacao; previa: PreviaDoPost; edicao: Edicao }) {
  return (
    <div className="space-y-3">
      {previa.formato === "reel" ? (
        <VideoDoReel url={previa.telas[0]} />
      ) : (
        <TelasDoPost telas={previa.telas} titulo={previa.manchete} />
      )}
      {/* A legenda como o Instagram a mostra: o perfil, e o texto com as quebras de linha. */}
      <TextoEditavel edicao={edicao} multilinha>
        <div className="text-[14px] leading-relaxed text-slate-900">
          <span className="mr-1.5 font-semibold">eua.journal</span>
          <span className="whitespace-pre-line">{previa.legenda}</span>
        </div>
      </TextoEditavel>
      <PacoteFactual a={a} />
    </div>
  );
}

const NOME_NO_PLANO = { newsletter: "Newsletter", artigos: "Matérias do portal", posts: "Posts", reels: "Reels" } as const;

/**
 * O plano do dia (29/10/2026): o que o Claude quer produzir, por canal, com o
 * porquê de cada item. Aprovar libera a produção; "tirar" grava o plano sem o
 * item (pela mesma edição da fila, que gera hash novo); reprovar devolve ao
 * Claude com o motivo.
 */
export function CorpoDoPlano({ previa, edicao }: { previa: PreviaDoPlano; edicao: Edicao }) {
  const tirar = (canal: string, id: string) => {
    const itens = { ...previa.itens } as Record<string, unknown>;
    itens[canal] = ((itens[canal] as string[]) ?? []).filter((x) => x !== id);
    void edicao.salvar(JSON.stringify(itens));
  };
  return (
    <div className="space-y-4">
      {previa.canais.map(({ canal, itens }) => (
        <section key={canal}>
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            {NOME_NO_PLANO[canal]} ({itens.length})
          </h4>
          {itens.length === 0 ? (
            <p className="text-[13px] text-slate-500">Nada neste canal.</p>
          ) : (
            <ul className="space-y-2">
              {itens.map((i) => (
                <li key={i.id} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-slate-900">
                      {i.link ? (
                        <a href={i.link} target="_blank" rel="noreferrer" className="hover:underline">
                          {i.titulo}
                        </a>
                      ) : (
                        i.titulo
                      )}
                    </p>
                    {i.porque ? <p className="mt-0.5 text-[13px] text-slate-600">{i.porque}</p> : null}
                  </div>
                  {edicao.pode ? (
                    <button
                      type="button"
                      disabled={edicao.ocupado}
                      onClick={() => tirar(canal, i.id)}
                      className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-[12px] text-slate-700 hover:bg-white disabled:opacity-50"
                    >
                      Tirar
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
