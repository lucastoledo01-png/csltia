"use client";

import { useEffect, useState } from "react";

export function AdminLogsManager() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ newsroomRuns: any[]; socialPosts: any[] }>({
    newsroomRuns: [],
    socialPosts: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pipeline-logs");
      const json = await res.json();
      if (json.ok) {
        setData({
          newsroomRuns: json.newsroomRuns || [],
          socialPosts: json.socialPosts || [],
        });
      } else {
        setError(json.error || "Erro ao carregar logs.");
      }
    } catch (err: any) {
      setError(err?.message || "Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-[#eaecf0] bg-white p-6 shadow-sm">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#ff4a1c]">
            Auditoria & Observabilidade
          </span>
          <h3 className="mt-1 text-2xl font-black text-black">Central de Logs & Rota Completa</h3>
          <p className="mt-1 text-sm text-[#667085]">
            Acompanhe em tempo real o status de execução da Redação (E-mail / Portal) e do Gerador do Instagram.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="rounded-full bg-[#ff4a1c] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#e03e13] disabled:opacity-50 transition-colors"
        >
          {loading ? "Atualizando..." : "🔄 Atualizar Logs"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-xs font-bold text-[#dc2626]">
          ⚠️ {error}
        </div>
      ) : null}

      {/* Logs do Instagram & Carrosséis */}
      <div className="rounded-[28px] border border-[#eaecf0] bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#eaecf0] pb-4">
          <div>
            <h4 className="text-lg font-black text-black">📸 Histórico do Gerador de Instagram</h4>
            <p className="text-xs text-[#667085]">Postagens, roteiros em JSON e visualização de slides</p>
          </div>
          <span className="rounded-full bg-[#fff5f2] px-3 py-1 text-xs font-bold text-[#ff4a1c]">
            {data.socialPosts.length} registros
          </span>
        </div>

        {data.socialPosts.length === 0 && !loading ? (
          <p className="py-6 text-center text-xs font-semibold text-[#6b7280]">
            Nenhum registro de carrossel do Instagram encontrado ainda.
          </p>
        ) : (
          <div className="divide-y divide-[#eaecf0]">
            {data.socialPosts.map((post) => (
              <div key={post.id} className="py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        post.status === "published"
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : post.status === "failed"
                          ? "bg-[#fef2f2] text-[#dc2626]"
                          : "bg-[#fffbeb] text-[#b45309]"
                      }`}
                    >
                      {post.status.toUpperCase()}
                    </span>
                    <span className="text-xs font-bold text-black">{post.title}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#667085]">
                    <span>📅 {post.edition_date}</span>
                    <span>Tokens: {post.tokens_input + post.tokens_output}</span>
                    <button
                      onClick={() => setSelectedPost(selectedPost?.id === post.id ? null : post)}
                      className="font-bold text-[#ff4a1c] hover:underline"
                    >
                      {selectedPost?.id === post.id ? "Fechar Preview ▲" : "Ver Roteiro & Caption ▼"}
                    </button>
                  </div>
                </div>

                {/* Painel Expandido de Preview do Post */}
                {selectedPost?.id === post.id ? (
                  <div className="mt-3 rounded-2xl border border-[#eaecf0] bg-[#fafafa] p-4 space-y-4 text-xs">
                    <div>
                      <strong className="block font-bold text-black mb-1">Legenda (Caption):</strong>
                      <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-xs text-[#374151] border border-[#eaecf0]">
                        {post.caption}
                      </pre>
                    </div>

                    {post.slides_manifest && Array.isArray(post.slides_manifest) ? (
                      <div>
                        <strong className="block font-bold text-black mb-2">
                          Manifesto dos Slides ({post.slides_manifest.length} slides):
                        </strong>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          {post.slides_manifest.map((s: any, idx: number) => (
                            <div key={idx} className="rounded-xl border border-[#eaecf0] bg-white p-3 space-y-1">
                              <span className="font-bold text-[#ff4a1c]">Slide {s.index || idx + 1} ({s.type})</span>
                              <p className="font-bold text-black">{s.title}</p>
                              <p className="text-[#667085] leading-relaxed">{s.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logs da Redação automatizada (Newsletter / Listmonk / Portal) */}
      <div className="rounded-[28px] border border-[#eaecf0] bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#eaecf0] pb-4">
          <div>
            <h4 className="text-lg font-black text-black">⚡ Logs de Execução da Redação (E-mail & Portal)</h4>
            <p className="text-xs text-[#667085]">Disparos diários, coleta RSS e envio para Listmonk</p>
          </div>
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-bold text-[#374151]">
            {data.newsroomRuns.length} execuções
          </span>
        </div>

        {data.newsroomRuns.length === 0 && !loading ? (
          <p className="py-6 text-center text-xs font-semibold text-[#6b7280]">
            Nenhum histórico de execução da redação registrado ainda.
          </p>
        ) : (
          <div className="divide-y divide-[#eaecf0]">
            {data.newsroomRuns.map((run) => (
              <div key={run.id} className="py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold uppercase ${
                      run.status === "success"
                        ? "bg-[#dcfce7] text-[#15803d]"
                        : run.status === "failed"
                        ? "bg-[#fef2f2] text-[#dc2626]"
                        : "bg-[#fffbeb] text-[#b45309]"
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="font-medium text-black">
                    {new Date(run.started_at).toLocaleString("pt-BR")}
                  </span>
                  <span className="text-[#667085]">({run.dry_run ? "DRY RUN" : "OFICIAL"})</span>
                </div>

                <div className="flex items-center gap-4 text-[#667085]">
                  <span>Pautas: {run.stories_selected} / {run.candidates_found}</span>
                  <span>Tokens: {run.tokens_input + run.tokens_output}</span>
                  <span className="font-bold text-[#ff4a1c]">${Number(run.cost_estimate_usd || 0).toFixed(4)} USD</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
