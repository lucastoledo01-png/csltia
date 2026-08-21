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
    return <div className="py-12 text-center text-sm font-semibold text-[#667085]">Carregando analytics do site...</div>;
  }

  if (!data) {
    return <div className="py-12 text-center text-sm text-[#b42318]">Erro ao carregar métricas de acesso.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Cards de Métricas Principais */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[24px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-[#667085]">Acessos Totais (Pageviews)</p>
          <p className="mt-3 text-4xl font-black text-black">{data.totalPageviews.toLocaleString("pt-BR")}</p>
          <span className="mt-2 inline-block text-xs font-semibold text-[#12b76a]">↑ +18% esta semana</span>
        </div>

        <div className="rounded-[24px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-[#667085]">Visitantes Únicos</p>
          <p className="mt-3 text-4xl font-black text-black">{data.uniqueVisitors.toLocaleString("pt-BR")}</p>
          <span className="mt-2 inline-block text-xs font-semibold text-[#12b76a]">↑ Engajamento orgânico</span>
        </div>

        <div className="rounded-[24px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-[#667085]">Inscrições Newsletter</p>
          <p className="mt-3 text-4xl font-black text-[#ff4a1c]">{data.totalLeads.toLocaleString("pt-BR")}</p>
          <span className="mt-2 inline-block text-xs font-semibold text-[#667085]">Leads cadastrados</span>
        </div>

        <div className="rounded-[24px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-[#667085]">Total de Comentários</p>
          <p className="mt-3 text-4xl font-black text-black">{data.totalComments}</p>
          <span className="mt-2 inline-block text-xs font-semibold text-[#667085]">Média leitura: {data.avgReadingTime} min</span>
        </div>
      </div>

      {/* Tabela dos Artigos Mais Lidos */}
      <div className="rounded-[28px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-black tracking-[-0.05em] text-black">Artigos Mais Lidos & Desempenho</h3>
        <p className="mt-1 text-sm text-[#667085]">Ranking de leitura e métricas de acessos por artigo.</p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#eaecf0] text-xs uppercase text-[#667085]">
              <tr>
                <th className="py-3 px-4">Título do Artigo</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Visualizações</th>
                <th className="py-3 px-4">Tempo Leitura</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaecf0]">
              {data.topArticles.map((art) => (
                <tr key={art.slug} className="hover:bg-[#fafafa]">
                  <td className="py-4 px-4 font-bold text-black">{art.title}</td>
                  <td className="py-4 px-4 text-[#667085]">{art.category}</td>
                  <td className="py-4 px-4 font-mono font-bold text-[#ff4a1c]">{art.views.toLocaleString()} views</td>
                  <td className="py-4 px-4 text-[#667085]">{art.readTime}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${art.status === "published" ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#feefc3] text-[#b06000]"}`}>
                      {art.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log de Acessos Recentes */}
      <div className="rounded-[28px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-black">Log Recente de Acessos ao Vivo</h3>
        <div className="mt-4 space-y-2 font-mono text-xs">
          {data.recentPageviews.length === 0 ? (
            <p className="text-[#667085]">Nenhum acesso registrado no log recente.</p>
          ) : (
            data.recentPageviews.map((pv) => (
              <div key={pv.id} className="flex flex-wrap items-center justify-between rounded-lg bg-[#fafafa] p-2.5">
                <span className="font-bold text-[#ff4a1c]">{pv.path}</span>
                <span className="text-[#98a2b3]">
                  {new Date(pv.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
