"use client";

import { useState } from "react";
import {
  ESTADOS_DE_CAPACIDADE,
  ROTULO_DA_CAPACIDADE,
  ROTULO_DO_ESTADO,
  type EstadoDeCapacidade,
  type ProjetoDoPainel,
} from "./tipos";

/**
 * O que o projeto liga, por etapa da esteira.
 *
 * Veio da tela `/admin/projetos`, que era a única porta para isto e não tinha
 * link de lugar nenhum: para chegar lá era preciso digitar a URL. Agora mora
 * dentro do projeto, em Avançado, que é onde alguém procuraria.
 *
 * O interruptor grava em `projects.settings.capacidades`. Antes disso a mesma
 * decisão vivia em variável de ambiente, o que significava editar o painel da
 * hospedagem, esperar o contêiner reiniciar, e atingir todos os projetos de uma
 * vez.
 */
export function CapacidadesDoProjeto({
  projeto,
  capacidades,
  aoGravar,
}: {
  projeto: ProjetoDoPainel;
  capacidades: string[];
  aoGravar: (capacidades: ProjetoDoPainel["capacidades"]) => void;
}) {
  const [gravando, setGravando] = useState("");
  const [erro, setErro] = useState("");

  async function alternar(capacidade: string, estado: EstadoDeCapacidade) {
    setGravando(capacidade);
    try {
      const r = await fetch(`/api/admin/projetos/${projeto.id}/capacidades`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacidade, estado }),
      });
      const corpo = await r.json();
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);

      /*
       * O estado vem da resposta, nunca do que foi pedido. Pintar o botão com o
       * valor enviado mostra o clique como se ele tivesse valido, inclusive
       * quando a gravação falhou.
       */
      aoGravar(corpo.capacidades);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar.");
    } finally {
      setGravando("");
    }
  }

  return (
    <div className="admin-glass p-6">
      <h3 className="text-[15px] text-slate-900">Etapas ligadas</h3>
      <p className="mt-1 text-[13px] text-slate-500">
        O que não estiver declarado aqui segue a configuração do servidor.
      </p>

      {erro ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
          {erro}
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
        {capacidades.map((c) => {
          const atual = projeto.capacidades?.[c];
          return (
            <div
              key={c}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="text-[13px] text-slate-700">{ROTULO_DA_CAPACIDADE[c] ?? c}</span>
              <span className="flex items-center gap-3">
                {atual === undefined ? (
                  <span className="text-[11px] text-slate-400">herda do servidor</span>
                ) : null}
                <span className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                  {ESTADOS_DE_CAPACIDADE.map((e) => (
                    <button
                      key={e}
                      type="button"
                      disabled={gravando === c}
                      onClick={() => alternar(c, e)}
                      className={`px-3 py-1.5 text-[12px] ${
                        atual === e
                          ? "bg-slate-900 font-semibold text-white"
                          : "bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {ROTULO_DO_ESTADO[e]}
                    </button>
                  ))}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
