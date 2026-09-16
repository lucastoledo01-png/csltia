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
    return <div className="py-12 text-center text-xs font-semibold text-[#71717a]">Carregando dados do banco de dados...</div>;
  }

  if (!data) {
    return <div className="py-12 text-center text-xs font-semibold text-[#c0322f]">Erro ao carregar métricas.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Indicadores Principais em Tempo Real */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="admin-glass rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#71717a]">Visualizações de Páginas</p>
          <p className="mt-2 text-3xl font-bold text-[#18181b]">{data.totalPageviews.toLocaleString("pt-BR")}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#71717a]">Métrica em tempo real</span>
        </div>

        <div className="admin-glass rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#71717a]">Visitantes Estimados</p>
          <p className="mt-2 text-3xl font-bold text-[#18181b]">{data.uniqueVisitors.toLocaleString("pt-BR")}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#71717a]">Com base em pageviews</span>
        </div>

        <div className="admin-glass rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#71717a]">Inscrições na Newsletter</p>
          <p className="mt-2 text-3xl font-bold text-[#18181b]">{data.totalLeads.toLocaleString("pt-BR")}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#71717a]">Leads no banco Supabase</span>
        </div>

        <div className="admin-glass rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#71717a]">Comentários Publicados</p>
          <p className="mt-2 text-3xl font-bold text-[#18181b]">{data.totalComments}</p>
          <span className="mt-1 inline-block text-[11px] font-medium text-[#71717a]">Média leitura: {data.avgReadingTime} min</span>
        </div>
      </div>

      {/* Tabela de Artigos e Desempenho */}
      <div className="admin-glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#18181b]">Desempenho de Leitura por Artigo</h3>
            <p className="mt-0.5 text-xs text-[#71717a]">Relatório ordenado por visualizações registradas.</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#f4f4f5] text-[11px] font-semibold text-[#71717a]">
              <tr>
                <th className="py-2.5 px-3">Título do Artigo</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Visualizações</th>
                <th className="py-2.5 px-3">Tempo Est.</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4f4f5]">
              {data.topArticles.map((art) => (
                <tr key={art.slug} className="hover:bg-[#fafafa]">
                  <td className="py-3 px-3 font-semibold text-[#18181b]">{art.title}</td>
                  <td className="py-3 px-3 text-[#71717a]">{art.category}</td>
                  <td className="py-3 px-3 font-mono font-bold text-[#18181b]">{art.views}</td>
                  <td className="py-3 px-3 text-[#71717a]">{art.readTime}</td>
                  <td className="py-3 px-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${art.status === "published" ? "bg-[#fafafa] text-[#3f3f46]" : "bg-[#fafafa] text-[#3f3f46]"}`}>
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
      <div className="admin-glass rounded-2xl p-6">
        <h3 className="text-sm font-bold text-[#18181b]">Log de Acessos Recentes</h3>
        <p className="mt-0.5 text-xs text-[#71717a]">Últimas requisições gravadas na tabela pageviews.</p>
        <div className="mt-4 space-y-1.5 font-mono text-[11px]">
          {data.recentPageviews.length === 0 ? (
            <p className="py-4 text-center text-[#71717a]">Nenhum acesso registrado no banco ainda.</p>
          ) : (
            data.recentPageviews.map((pv) => (
              <div key={pv.id} className="flex items-center justify-between rounded-md bg-[#fafafa] px-3 py-2 border border-[#f4f4f5]">
                <span className="font-semibold text-[#18181b]">{pv.path}</span>
                <span className="text-[#71717a]">
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
