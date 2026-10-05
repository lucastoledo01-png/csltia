"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * O trilho de "Seções em foco": uma fileira só, que rola para o lado.
 *
 * Quem rola é o CSS (`overflow-x` com `scroll-snap`), não uma biblioteca de
 * carrossel: funciona sem JavaScript, com o dedo, com o trackpad e com as
 * setas do teclado quando o trilho tem foco. Este componente só acrescenta as
 * duas setas de "anterior" e "próximo", que somem do teclado quando não há para
 * onde ir (`disabled`), e a barra de rolagem fica visível de propósito: é ela
 * que diz, no computador, que há mais cards do que cabem.
 *
 * Com seis editorias, o computador mostra quatro e o celular mostra um e o
 * pedaço do seguinte. O pedaço é o convite, sem texto pedindo para arrastar.
 */
export function TrilhoDeSecoes({
  titulo,
  acao,
  rotulo,
  children,
}: {
  titulo: React.ReactNode;
  acao?: React.ReactNode;
  rotulo: string;
  children: React.ReactNode;
}) {
  const trilho = useRef<HTMLUListElement>(null);
  const id = useId();
  const [pode, setPode] = useState({ voltar: false, avancar: false });

  const medir = useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    setPode({ voltar: el.scrollLeft > 4, avancar: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    medir();
    const el = trilho.current;
    if (!el) return;
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      el.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const rolar = (sentido: 1 | -1) => {
    const el = trilho.current;
    if (!el) return;
    const card = el.querySelector("li");
    const vao = parseFloat(getComputedStyle(el).columnGap) || 0;
    const passo = card ? card.getBoundingClientRect().width + vao : el.clientWidth * 0.8;
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: sentido * passo, behavior: semMovimento ? "auto" : "smooth" });
  };

  const seta =
    "flex h-10 w-10 items-center justify-center rounded-full border border-[#D4D4D8] bg-white text-[#0A0A0A] transition-colors hover:border-[#0A0A0A] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#D4D4D8]";

  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-4 md:mb-10">
        {titulo}
        <div className="flex items-center gap-5">
          <div className="hidden items-center gap-2 md:flex">
            <button type="button" className={seta} onClick={() => rolar(-1)} disabled={!pode.voltar} aria-controls={id}>
              <span className="sr-only">Seções anteriores</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button type="button" className={seta} onClick={() => rolar(1)} disabled={!pode.avancar} aria-controls={id}>
              <span className="sr-only">Próximas seções</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          {acao}
        </div>
      </div>

      <ul
        ref={trilho}
        id={id}
        role="list"
        aria-label={rotulo}
        tabIndex={0}
        className="trilho -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-5 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:gap-6"
      >
        {children}
      </ul>
    </>
  );
}
