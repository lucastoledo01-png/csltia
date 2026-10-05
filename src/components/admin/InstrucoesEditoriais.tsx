"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { diffDeLinhas } from "@/lib/diff-de-linhas";
import { ROTULO_DO_ESTADO, type EstadoDeCapacidade, type ProjetoDoPainel } from "./tipos";

/**
 * As instruções editoriais de cada etapa, com versão e rollback (RF-26,
 * 05/10/2026).
 *
 * O que se edita aqui é só o JULGAMENTO de cada prompt: para quem se escreve,
 * a régua de relevância, a voz. O contrato de saída (campos do JSON, tetos que
 * a guarda confere, assinatura) fica no código e não aparece nesta tela, e a
 * API recusa texto que traga estrutura de JSON.
 *
 * Gravar cria a próxima versão já ativa; voltar é ativar uma anterior; "texto
 * do código" desativa todas. Nada é apagado. As versões só valem no ciclo com a
 * capacidade "Instruções editadas no painel" no ar, em Avançado.
 */

type Versao = {
  id: string;
  etapa: string;
  texto: string;
  versao: number;
  criado_por: string;
  criado_em: string;
  ativo: boolean;
};

type Etapa = {
  etapa: string;
  rotulo: string;
  usadaEm: string;
  padrao: string;
  foraDoEditavel: string;
  versoes: Versao[];
};

type Resposta = { ok: boolean; error?: string; capacidade: EstadoDeCapacidade; aviso: string | null; etapas: Etapa[] };

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function InstrucoesEditoriais({ projeto }: { projeto: ProjetoDoPainel }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [selecionada, setSelecionada] = useState<string>("");
  const [rascunho, setRascunho] = useState("");
  const [autor, setAutor] = useState("");
  const [comparar, setComparar] = useState<string>("vigente");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/admin/projetos/${projeto.id}/instrucoes`);
    const corpo = (await r.json()) as Resposta;
    if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
        if (!Array.isArray(corpo.etapas)) throw new Error("Resposta inesperada do servidor.");
    setDados(corpo);
    return corpo;
  }, [projeto.id]);

  useEffect(() => {
    carregar()
      .then((c) => setSelecionada((atual) => atual || c.etapas[0]?.etapa || ""))
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar."));
  }, [carregar]);

  const etapa = dados?.etapas.find((e) => e.etapa === selecionada) ?? null;
  const ativa = etapa?.versoes.find((v) => v.ativo) ?? null;
  const vigente = ativa?.texto ?? etapa?.padrao ?? "";

  // Ao trocar de etapa, o editor abre com o texto que está valendo.
  useEffect(() => {
    setRascunho(vigente);
    setComparar("vigente");
  }, [selecionada, vigente]);

  const base = useMemo(() => {
    if (!etapa) return "";
    if (comparar === "codigo") return etapa.padrao;
    if (comparar === "vigente") return vigente;
    return etapa.versoes.find((v) => v.id === comparar)?.texto ?? vigente;
  }, [comparar, etapa, vigente]);

  const diff = useMemo(() => diffDeLinhas(base, rascunho), [base, rascunho]);
  const mudou = diff.some((l) => l.tipo !== "igual");

  async function enviar(metodo: "POST" | "PATCH", corpo: Record<string, unknown>) {
    setOcupado(true);
    try {
      const r = await fetch(`/api/admin/projetos/${projeto.id}/instrucoes`, {
        method: metodo,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const resposta = await r.json();
      if (!r.ok || !resposta.ok) throw new Error(resposta.error ?? `HTTP ${r.status}`);
      await carregar();
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar.");
    } finally {
      setOcupado(false);
    }
  }

  if (!dados) {
    return erro ? (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">{erro}</div>
    ) : (
      <p className="text-xs text-slate-500">Carregando...</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="admin-glass p-5">
        <h3 className="text-[15px] text-slate-900">Instruções editoriais</h3>
        <p className="mt-1 text-[12px] text-slate-500">
          O julgamento de cada etapa é editável, com histórico e volta. O formato de saída não é: ele fica no código.
        </p>
        <p className="mt-2 text-[12px]">
          Capacidade neste projeto:{" "}
          <span className={dados.capacidade === "enforce" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
            {ROTULO_DO_ESTADO[dados.capacidade] ?? dados.capacidade}
          </span>
          {dados.capacidade !== "enforce" ? (
            <span className="text-slate-500">
              {" "}
              · as versões ficam gravadas, mas a esteira usa o texto do código até a capacidade ir para "No ar" em
              Avançado.
            </span>
          ) : null}
        </p>
        {dados.aviso ? (
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-800">
            As versões não puderam ser lidas: {dados.aviso}. Se a tabela ainda não existe, a migration
            20261005170000_instrucoes_editoriais.sql precisa rodar.
          </p>
        ) : null}
      </div>

      {erro ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">{erro}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="admin-glass h-fit p-2">
          {dados.etapas.map((e) => {
            const a = e.versoes.find((v) => v.ativo);
            return (
              <button
                key={e.etapa}
                onClick={() => setSelecionada(e.etapa)}
                data-active={selecionada === e.etapa}
                className="admin-sidebar-link flex w-full flex-col items-start px-3 py-2 text-left"
              >
                <span className="text-[13px]">{e.rotulo}</span>
                <span className="text-[11px] text-slate-400">{a ? `versão ${a.versao}` : "texto do código"}</span>
              </button>
            );
          })}
        </nav>

        {etapa ? (
          <div className="min-w-0 space-y-4">
            <div className="admin-glass p-5">
              <p className="text-[12px] text-slate-500">
                <strong className="text-slate-700">Usada em:</strong> {etapa.usadaEm}
              </p>
              <p className="mt-1 text-[12px] text-slate-500">
                <strong className="text-slate-700">Fora do editável:</strong> {etapa.foraDoEditavel}
              </p>

              <textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                rows={18}
                spellCheck={false}
                className="admin-campo mt-4 w-full font-mono text-[12px] leading-relaxed"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={autor}
                  onChange={(e) => setAutor(e.target.value)}
                  placeholder="Quem está editando"
                  className="admin-campo w-48"
                />
                <button
                  className="admin-botao"
                  disabled={ocupado || !mudou || rascunho.trim() === vigente.trim()}
                  onClick={() => enviar("POST", { etapa: etapa.etapa, texto: rascunho, autor })}
                >
                  Gravar como nova versão
                </button>
                <button className="admin-botao-secundario" disabled={ocupado} onClick={() => setRascunho(vigente)}>
                  Descartar edição
                </button>
                {ativa ? (
                  <button
                    className="admin-botao-secundario"
                    disabled={ocupado}
                    onClick={() => enviar("PATCH", { acao: "padrao", etapa: etapa.etapa })}
                  >
                    Voltar ao texto do código
                  </button>
                ) : null}
              </div>
            </div>

            <div className="admin-glass p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[13px] font-semibold text-slate-900">Diferença</h4>
                <span className="text-[12px] text-slate-500">do editor contra</span>
                <select value={comparar} onChange={(e) => setComparar(e.target.value)} className="admin-campo w-auto">
                  <option value="vigente">o que está valendo</option>
                  <option value="codigo">o texto do código</option>
                  {etapa.versoes.map((v) => (
                    <option key={v.id} value={v.id}>
                      versão {v.versao}
                    </option>
                  ))}
                </select>
              </div>
              {mudou ? (
                <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-50 p-3 text-[11px] leading-relaxed">
                  {diff.map((l, i) =>
                    l.tipo === "igual" ? null : (
                      <div
                        key={i}
                        className={`whitespace-pre-wrap break-words ${
                          l.tipo === "entrou" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800 line-through"
                        }`}
                      >
                        {l.tipo === "entrou" ? "+ " : "- "}
                        {l.texto}
                      </div>
                    ),
                  )}
                </pre>
              ) : (
                <p className="mt-2 text-[12px] text-slate-500">Nenhuma diferença.</p>
              )}
            </div>

            <div className="admin-glass p-5">
              <h4 className="text-[13px] font-semibold text-slate-900">Versões</h4>
              {etapa.versoes.length === 0 ? (
                <p className="mt-2 text-[12px] text-slate-500">Nenhuma versão gravada. Vale o texto do código.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-200">
                  {etapa.versoes.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]">
                      <span>
                        <strong>versão {v.versao}</strong>{" "}
                        <span className="text-slate-500">
                          {quando(v.criado_em)} · {v.criado_por}
                        </span>
                        {v.ativo ? <span className="ml-2 font-semibold text-emerald-700">valendo</span> : null}
                      </span>
                      <span className="flex gap-2">
                        <button className="admin-botao-secundario" onClick={() => setRascunho(v.texto)}>
                          Abrir no editor
                        </button>
                        {!v.ativo ? (
                          <button
                            className="admin-botao-secundario"
                            disabled={ocupado}
                            onClick={() => enviar("PATCH", { acao: "ativar", id: v.id })}
                          >
                            Voltar para esta
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
