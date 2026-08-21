"use client";

import { useEffect, useState } from "react";

type AnalyticsData = {
  totalPageviews: number;
  uniqueVisitors: number;
  totalLeads: number;
  totalComments: number;
  avgReadingTime: number;
  topArticles: Array<{
    slug: string;
    title: string;
    views: number;
    category: string;
    readTime: string;
    status: string;
  }>;
  recentPageviews: Array<{ id: string; path: string; created_at: string; referrer?: string }>;
};

export function AdminAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/admin/analytics");
        const json = await res.json();
        if (json.ok && json.analytics) {
          setData(json.analytics);
        }
      } catch (err) {
        console.error("Erro ao carregar analytics:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-xs font-semibold text-[#6b7280]">Carregando dados do banco de dados...</div>;
  }

  if (!data) {
    return <div className="py-12 text-center text-xs font-semibold text-[#ef4444]">Erro ao carregar métricas.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Indicadores Principais em Tempo Real */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-[#6b7280]">Visualizações de Páginas</p>
          <p className="mt-2 text-3xl font-bold text-[#111827]">{data.totalPageviews.toLocaleString("pt-BR")}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#6b7280]">Métrica em tempo real</span>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-[#6b7280]">Visitantes Estimados</p>
          <p className="mt-2 text-3xl font-bold text-[#111827]">{data.uniqueVisitors.toLocaleString("pt-BR")}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#6b7280]">Com base em pageviews</span>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-[#6b7280]">Inscrições na Newsletter</p>
          <p className="mt-2 text-3xl font-bold text-[#ff4a1c]">{data.totalLeads.toLocaleString("pt-BR")}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#6b7280]">Leads no banco Supabase</span>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-[#6b7280]">Comentários Publicados</p>
          <p className="mt-2 text-3xl font-bold text-[#111827]">{data.totalComments}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#6b7280]">Média leitura: {data.avgReadingTime} min</span>
        </div>
      </div>

      {/* Tabela de Artigos e Desempenho */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#111827]">Desempenho de Leitura por Artigo</h3>
            <p className="mt-0.5 text-xs text-[#6b7280]">Relatório ordenado por visualizações registradas.</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#f3f4f6] text-[11px] font-semibold text-[#6b7280]">
              <tr>
                <th className="py-2.5 px-3">Título do Artigo</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Visualizações</th>
                <th className="py-2.5 px-3">Tempo Est.</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {data.topArticles.map((art) => (
                <tr key={art.slug} className="hover:bg-[#fafafa]">
                  <td className="py-3 px-3 font-semibold text-[#111827]">{art.title}</td>
                  <td className="py-3 px-3 text-[#6b7280]">{art.category}</td>
                  <td className="py-3 px-3 font-mono font-bold text-[#ff4a1c]">{art.views}</td>
                  <td className="py-3 px-3 text-[#6b7280]">{art.readTime}</td>
                  <td className="py-3 px-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${art.status === "published" ? "bg-[#f0fdf4] text-[#166534]" : "bg-[#fefce8] text-[#854d0e]"}`}>
                      {art.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log de Acessos no Banco de Dados */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-[#111827]">Log de Acessos Recentes</h3>
        <p className="mt-0.5 text-xs text-[#6b7280]">Últimas requisições gravadas na tabela pageviews.</p>
        <div className="mt-4 space-y-1.5 font-mono text-[11px]">
          {data.recentPageviews.length === 0 ? (
            <p className="py-4 text-center text-[#9ca3af]">Nenhum acesso registrado no banco ainda.</p>
          ) : (
            data.recentPageviews.map((pv) => (
              <div key={pv.id} className="flex items-center justify-between rounded-md bg-[#fafafa] px-3 py-2 border border-[#f3f4f6]">
                <span className="font-semibold text-[#ff4a1c]">{pv.path}</span>
                <span className="text-[#9ca3af]">
                  {new Date(pv.created_at).toLocaleTimeString("pt-BR")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
