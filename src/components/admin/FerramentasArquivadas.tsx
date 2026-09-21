"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * O que saiu do menu e não saiu do sistema.
 *
 * Cinco telas eram da vertical anterior do projeto, de tutoriais e prompts, e
 * continuavam ocupando metade da barra lateral de um jornal diário sobre os
 * EUA. Arquivar é a decisão explícita do dono, de 21/09/2026: elas somem de
 * vista, o código fica, e voltar é reabrir a dobra.
 *
 * O carregamento é sob demanda, e isso não é economia de estilo: as quatro
 * somam cerca de 2.700 linhas de componente que ninguém abre numa semana
 * normal, e elas viajavam no mesmo pacote que a tela de aprovar post.
 */

const carregando = () => (
  <p className="p-4 text-[12px] text-slate-500">Carregando ferramenta...</p>
);

const AdminCarouselDesignManager = dynamic(
  () => import("@/components/AdminCarouselDesignManager").then((m) => m.AdminCarouselDesignManager),
  { ssr: false, loading: carregando },
);
const AdminLayoutEditor = dynamic(
  () => import("@/components/AdminLayoutEditor").then((m) => m.AdminLayoutEditor),
  { ssr: false, loading: carregando },
);
const AdminCMSManager = dynamic(
  () => import("@/components/AdminCMSManager").then((m) => m.AdminCMSManager),
  { ssr: false, loading: carregando },
);
const AdminPromptTrendsManager = dynamic(
  () => import("@/components/AdminPromptTrendsManager").then((m) => m.AdminPromptTrendsManager),
  { ssr: false, loading: carregando },
);
const AdminPromptSystemManager = dynamic(
  () => import("@/components/AdminPromptSystemManager").then((m) => m.AdminPromptSystemManager),
  { ssr: false, loading: carregando },
);

type Chave = "carrossel" | "layout" | "cms" | "prompt";

const ARQUIVADAS: Array<{ id: Chave; rotulo: string; porque: string }> = [
  {
    id: "carrossel",
    rotulo: "Design de carrossel",
    porque: "Tema e variantes dos três formatos. A edição diária usa só a capa de notícia.",
  },
  {
    id: "layout",
    rotulo: "Editor de layout",
    porque: "Desenho manual por tipo de slide, acima da variante de código.",
  },
  {
    id: "cms",
    rotulo: "CMS de artigos",
    porque: "Artigos escritos à mão. A edição do dia cria o artigo sozinha.",
  },
  {
    id: "prompt",
    rotulo: "Sistema PROMPT",
    porque: "Tendências, conceitos e campanhas da vertical de prompts.",
  },
];

export function FerramentasArquivadas() {
  const [aberta, setAberta] = useState<Chave | null>(null);

  return (
    <div className="admin-glass p-6">
      <h3 className="text-[15px] text-slate-900">Ferramentas arquivadas</h3>
      <p className="mt-1 text-[13px] text-slate-500">
        Fora do menu porque não fazem parte da operação diária. Continuam funcionando.
      </p>

      <div className="mt-5 space-y-2">
        {ARQUIVADAS.map((f) => {
          const estaAberta = aberta === f.id;
          return (
            <div key={f.id} className="rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setAberta(estaAberta ? null : f.id)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-slate-900">{f.rotulo}</span>
                  <span className="mt-0.5 block text-[12px] text-slate-500">{f.porque}</span>
                </span>
                <span className="shrink-0 text-[12px] text-slate-500">
                  {estaAberta ? "Fechar" : "Abrir"}
                </span>
              </button>

              {estaAberta ? (
                <div className="border-t border-slate-200 p-4">
                  {f.id === "carrossel" ? <AdminCarouselDesignManager /> : null}
                  {f.id === "layout" ? <AdminLayoutEditor /> : null}
                  {f.id === "cms" ? <AdminCMSManager /> : null}
                  {f.id === "prompt" ? (
                    <div className="space-y-8">
                      <AdminPromptTrendsManager />
                      <AdminPromptSystemManager />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
