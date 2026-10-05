"use client";

import { useEffect, useState } from "react";
import type { ProjetoDoPainel } from "./tipos";

/**
 * Os logs de UM dia do projeto, com o porquê de cada recusa (05/10/2026).
 *
 * "Toda recusa é explicável" já era verdade no banco desde setembro, e não era
 * verdade para quem abre o painel: o motivo de cada pauta recusada estava em
 * `news_candidates.decision_reason`, o do Instagram em `platform_events`, e
 * nenhum dos dois aparecia em tela nenhuma. Aqui os três aparecem juntos,
 * contados pelo código do motivo.
 */

type Run = {
  id: string;
  started_at: string;
  status: string;
  dry_run: boolean;
  idempotency_key: string | null;
  error_message: string | null;
  candidates_found: number;
  stories_selected: number;
};

type Candidata = {
  id: string;
  title: string;
  source_name: string;
  status: string;
  decision_reason: string | null;
  editorial_axis: string | null;
  country: string | null;
  url: string;
};

type Resposta = {
  ok: boolean;
  error?: string;
  dia: string;
  erros: string[];
  runs: Run[];
  candidatas: {
    total: number;
    porStatus: Record<string, number>;
    motivosDaRecusa: Array<{ codigo: string; total: number }>;
    lista: Candidata[];
  };
  social: {
    recusas: Array<{ etapa: string; motivo: string; titulo: string; codigo: string }>;
    motivos: Array<{ codigo: string; total: number }>;
    posts: Array<{
      id: string;
      title: string;
      status: string;
      scheduled_at: string | null;
      social_guard_status: string | null;
      social_guard_reasons: unknown;
      error_message: string | null;
    }>;
  };
  eventos: Array<{ id: string; event_type: string; created_at: string }>;
};

const COR_DO_RUN: Record<string, string> = {
  success: "text-emerald-700",
  cancelled: "text-amber-700",
  failed: "text-rose-700",
  running: "text-sky-700",
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function hojeLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function LogsDoDia({ projeto }: { projeto: ProjetoDoPainel }) {
  const [dia, setDia] = useState(hojeLocal());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/admin/projetos/${projeto.id}/logs?dia=${dia}`)
      .then(async (r) => {
        const corpo = (await r.json()) as Resposta;
        if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
        if (!Array.isArray(corpo.runs)) throw new Error("Resposta inesperada do servidor.");
        if (ativo) {
          setDados(corpo);
          setErro("");
        }
      })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => {
      ativo = false;
    };
  }, [projeto.id, dia]);

  const recusadas = (dados?.candidatas.lista ?? []).filter(
    (c) => (c.status === "rejected" || c.status === "capped") && (!filtro || (c.decision_reason ?? "").startsWith(filtro)),
  );

  return (
    <div className="space-y-6">
      <div className="admin-glass flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-[15px] text-slate-900">O dia, com o porquê</h3>
          <p className="mt-1 text-[12px] text-slate-500">
            Execuções, pautas recusadas pela linha editorial e recusas do Instagram, pelo código do motivo.
          </p>
        </div>
        <input
          type="date"
          value={dia}
          onChange={(e) => {
            setFiltro(null);
            setDia(e.target.value);
          }}
          className="admin-campo w-auto"
        />
      </div>

      {erro ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">{erro}</div>
      ) : null}
      {dados && dados.erros.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          Parte do dia não foi lida: {dados.erros.join(" · ")}
        </div>
      ) : null}

      {dados ? (
        <>
          <section className="admin-glass p-5">
            <h4 className="text-[13px] font-semibold text-slate-900">Execuções ({dados.runs.length})</h4>
            {dados.runs.length === 0 ? (
              <p className="mt-2 text-[12px] text-rose-600">
                Nenhuma linha em newsroom_runs neste dia. Em dia de produção isso significa que a chamada não chegou
                à aplicação.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-200">
                {dados.runs.map((r) => (
                  <li key={r.id} className="py-2 text-[12px]">
                    <span className="text-slate-400">{hora(r.started_at)}</span>{" "}
                    <span className={`font-semibold ${COR_DO_RUN[r.status] ?? "text-slate-700"}`}>{r.status}</span>
                    {r.dry_run ? <span className="ml-1 text-slate-400">(ensaio)</span> : null}{" "}
                    <span className="text-slate-500">{r.idempotency_key}</span>{" "}
                    <span className="text-slate-500">
                      · {r.candidates_found} candidatas, {r.stories_selected} pautas
                    </span>
                    {r.error_message ? (
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[11px] text-slate-700">
                        {r.error_message}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-glass p-5">
            <h4 className="text-[13px] font-semibold text-slate-900">
              Linha editorial: {dados.candidatas.total} candidatas
            </h4>
            <p className="mt-1 text-[12px] text-slate-500">
              {Object.entries(dados.candidatas.porStatus)
                .map(([s, n]) => `${n} ${s}`)
                .join(" · ") || "nenhuma candidata neste dia"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dados.candidatas.motivosDaRecusa.map((m) => (
                <button
                  key={m.codigo}
                  onClick={() => setFiltro(filtro === m.codigo ? null : m.codigo)}
                  className={`rounded-full border px-3 py-1 text-[11px] ${
                    filtro === m.codigo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"
                  }`}
                >
                  {m.codigo} · {m.total}
                </button>
              ))}
            </div>
            {recusadas.length > 0 ? (
              <ul className="mt-3 max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {recusadas.slice(0, 300).map((c) => (
                  <li key={c.id} className="py-2 text-[12px]">
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-slate-900 hover:underline">
                      {c.title}
                    </a>
                    <span className="block text-[11px] text-slate-500">
                      {c.source_name} · {c.editorial_axis ?? "sem eixo"} · {c.country ?? "?"} ·{" "}
                      <span className="font-semibold text-rose-700">{c.decision_reason ?? "sem motivo gravado"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="admin-glass p-5">
            <h4 className="text-[13px] font-semibold text-slate-900">Instagram</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {dados.social.motivos.map((m) => (
                <span key={m.codigo} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-700">
                  {m.codigo} · {m.total}
                </span>
              ))}
            </div>
            {dados.social.recusas.length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {dados.social.recusas.map((r, i) => (
                  <li key={`${r.titulo}-${i}`} className="py-2 text-[12px]">
                    <span className="text-slate-900">{r.titulo || "(sem título)"}</span>
                    <span className="block text-[11px] text-slate-500">
                      {r.etapa} · <span className="text-rose-700">{r.motivo}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-slate-500">Nenhuma recusa gravada pelo ciclo social neste dia.</p>
            )}
            {dados.social.posts.length > 0 ? (
              <>
                <h5 className="mt-4 text-[12px] font-semibold text-slate-700">Posts com data deste dia</h5>
                <ul className="mt-2 divide-y divide-slate-100">
                  {dados.social.posts.map((p) => (
                    <li key={p.id} className="py-2 text-[12px]">
                      <span className="text-slate-400">{p.scheduled_at ? hora(p.scheduled_at) : "--:--"}</span>{" "}
                      <span className="font-semibold text-slate-700">{p.status}</span>{" "}
                      <span className="text-slate-900">{p.title}</span>
                      {p.social_guard_status && p.social_guard_status !== "passed" ? (
                        <span className="block text-[11px] text-rose-700">
                          guarda: {p.social_guard_status} {JSON.stringify(p.social_guard_reasons)}
                        </span>
                      ) : null}
                      {p.error_message ? (
                        <span className="block text-[11px] text-rose-700">{p.error_message}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
