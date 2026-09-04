"use client";

import { useState } from "react";

/**
 * Botão COPIAR PROMPT da etapa 12.
 *
 * O texto fica visível num `<pre>` mesmo com o botão: o `navigator.clipboard`
 * exige contexto seguro e permissão, e falha em alguns navegadores dentro do
 * app do Instagram — que é justamente de onde essa pessoa chega. Poder
 * selecionar à mão é o caminho que nunca quebra.
 */
export function CopiarPrompt({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setFalhou(false);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setFalhou(true);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={copiar}
          className="rounded-xl bg-black px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-85"
        >
          {copiado ? "Copiado ✓" : "Copiar prompt"}
        </button>
        {falhou ? (
          <span className="text-xs text-[#98a2b3]">Seu navegador bloqueou — selecione o texto abaixo.</span>
        ) : null}
      </div>

      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-[#18181b] px-5 py-5 font-mono text-[13px] leading-6 text-[#e4e4e7]">
        {texto}
      </pre>
    </div>
  );
}
