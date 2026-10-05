"use client";

import { useEffect, useState } from "react";
import type { ProjetoDoPainel } from "./tipos";

/**
 * O calendário de conteúdo, SÓ LEITURA (PRD de 05/10/2026).
 *
 * Uma semana por vez: o que a cadência do projeto planeja para cada canal, o
 * que existe no banco para cada dia e com qual status, e as datas do
 * calendário editorial. Não há botão de editar de propósito: o plano muda na
 * cadência do projeto, e a peça muda na fila de aprovação.
 */

type Canal = "newsletter" | "portal" | "instagram";

type Dia = {
  data: string;
  diaDaSemana: number;
  planejado: Record<Canal, string[]>;
  itens: Array<{ canal: Canal; hora: string | null; titulo: string; status: string; id: string }>;
  datas: Array<{ nome: string; pais: string; tipo: string; peso: number }>;
};

type Resposta = {
  ok: boolean;
  error?: string;
  hoje: string;
  segunda: string;
  domingo: string;
  erros: string[];
  avisosDaCadencia: string[];
  cadencia: {
    producao: { dias: number[]; horario: string };
    aprovacao: { dias: number[]; inicio: string; fim: string };
  };
  dias: Dia[];
};

const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const CANAIS: Array<{ id: Canal; rotulo: string }> = [
  { id: "newsletter", rotulo: "Newsletter" },
  { id: "portal", rotulo: "Portal" },
  { id: "instagram", rotulo: "Instagram" },
];

const COR_DO_STATUS: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-sky-50 text-sky-700 border-sky-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diaCurto(dataIso: string): string {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

export function CalendarioDeConteudo({ projeto }: { projeto: ProjetoDoPainel }) {
  const [semana, setSemana] = useState<string | null>(null);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const q = semana ? `?semana=${semana}` : "";
    fetch(`/api/admin/projetos/${projeto.id}/calendario${q}`)
      .then(async (r) => {
        const corpo = (await r.json()) as Resposta;
        if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
        if (!Array.isArray(corpo.dias)) throw new Error("Resposta inesperada do servidor.");
        if (ativo) {
          setDados(corpo);
          setErro("");
        }
      })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Falha ao carregar."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [projeto.id, semana]);

  return (
    <div className="space-y-6">
      <div className="admin-glass flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-[15px] text-slate-900">
            {dados ? `Semana de ${diaCurto(dados.segunda)} a ${diaCurto(dados.domingo)}` : "Semana"}
          </h3>
          <p className="mt-1 text-[12px] text-slate-500">
            Só leitura. O plano vem da cadência do projeto; o que aparece em cada dia é o que existe no banco.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="admin-botao-secundario"
            disabled={!dados}
            onClick={() => dados && setSemana(somarDias(dados.segunda, -7))}
          >
            Anterior
          </button>
          <button className="admin-botao-secundario" onClick={() => setSemana(null)}>
            Hoje
          </button>
          <button
            className="admin-botao-secundario"
            disabled={!dados}
            onClick={() => dados && setSemana(somarDias(dados.segunda, 7))}
          >
            Próxima
          </button>
        </div>
      </div>

      {erro ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">{erro}</div>
      ) : null}

      {dados && (dados.avisosDaCadencia.length > 0 || dados.erros.length > 0) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          {[...dados.avisosDaCadencia, ...dados.erros].map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      ) : null}

      {carregando && !dados ? <p className="text-xs text-slate-500">Carregando...</p> : null}

      {dados ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {dados.dias.map((dia) => {
            const produz = dados.cadencia.producao.dias.includes(dia.diaDaSemana);
            const ehHoje = dia.data === dados.hoje;
            return (
              <div
                key={dia.data}
                className={`admin-glass min-w-0 p-4 ${ehHoje ? "ring-2 ring-slate-900" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-900">{NOMES[dia.diaDaSemana]}</span>
                  <span className="text-[11px] text-slate-400">{diaCurto(dia.data)}</span>
                </div>

                {produz ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Produção {dados.cadencia.producao.horario} · aprovação {dados.cadencia.aprovacao.inicio}
                  </p>
                ) : null}

                {dia.datas.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {dia.datas.map((d) => (
                      <li key={d.nome} className="text-[11px] text-violet-700">
                        {d.nome} <span className="text-violet-400">({d.pais})</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 space-y-3">
                  {CANAIS.map(({ id, rotulo }) => {
                    const planejado = dia.planejado[id];
                    const itens = dia.itens.filter((i) => i.canal === id);
                    if (planejado.length === 0 && itens.length === 0) return null;
                    return (
                      <div key={id}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {rotulo}
                          {planejado.length > 0 ? (
                            <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                              {planejado.join(", ")}
                            </span>
                          ) : null}
                        </p>
                        {itens.length === 0 ? (
                          <p className="mt-1 text-[11px] text-slate-400">nada no banco ainda</p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {itens.map((i) => (
                              <li key={i.id} className="text-[12px] leading-snug text-slate-700">
                                <span className="text-slate-400">{i.hora ?? "--:--"}</span>{" "}
                                <span
                                  className={`rounded border px-1 text-[10px] ${COR_DO_STATUS[i.status] ?? "border-slate-200 text-slate-500"}`}
                                >
                                  {i.status}
                                </span>{" "}
                                <span className="break-words">{i.titulo}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
