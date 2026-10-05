"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { EDITORIAS, hrefDaEditoria } from "@/lib/editorias";

/**
 * O menu do celular: um botão de verdade que abre as editorias.
 *
 * O desenho de referência tinha o ícone de três traços sem nada por trás, e
 * ícone de menu que não abre menu é pior que nenhum. Este fecha sozinho ao
 * escolher um destino e com Esc, porque as editorias são âncoras da própria
 * home e a página não troca: sem isso o painel ficaria aberto por cima do
 * bloco que a pessoa acabou de pedir.
 *
 * Desde 05/10/2026 as editorias são páginas próprias e a página troca, mas
 * fechar ao escolher continua certo: a navegação do cliente preserva o estado
 * do componente, e o painel abriria por cima da página nova.
 */
export function PortalMenuMovel() {
  const [aberto, setAberto] = useState(false);
  const painelId = useId();

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        onClick={() => setAberto((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-white"
      >
        <span className="sr-only">{aberto ? "Fechar menu" : "Abrir menu de editorias"}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {aberto ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      <div
        id={painelId}
        hidden={!aberto}
        className="absolute left-0 right-0 top-full border-t border-white/10 bg-black px-5 pb-6 pt-2 shadow-xl"
      >
        <nav aria-label="Menu de editorias">
          <ul>
            {EDITORIAS.map((e) => (
              <li key={e.id} className="border-b border-white/10">
                <a
                  href={hrefDaEditoria(e.id)}
                  onClick={() => setAberto(false)}
                  className="block py-3.5 text-[15px] font-semibold text-white"
                >
                  {e.nome}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/artigos"
                onClick={() => setAberto(false)}
                className="block py-3.5 text-[15px] font-semibold text-white/80"
              >
                Todas as edições
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
