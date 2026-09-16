"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminAnalyticsDashboard } from "@/components/AdminAnalyticsDashboard";
import { AdminCMSManager } from "@/components/AdminCMSManager";
import { AdminCommentsManager } from "@/components/AdminCommentsManager";
import { AdminLogsManager } from "@/components/AdminLogsManager";
import { AdminNewsroomManager } from "@/components/AdminNewsroomManager";
import { AdminSocialPostsManager } from "@/components/AdminSocialPostsManager";
import { AdminNewsSourcesManager } from "@/components/AdminNewsSourcesManager";
import { AdminCarouselDesignManager } from "@/components/AdminCarouselDesignManager";
import { AdminLayoutEditor } from "@/components/AdminLayoutEditor";
import { AdminPromptSystemManager } from "@/components/AdminPromptSystemManager";
import { AdminPromptTrendsManager } from "@/components/AdminPromptTrendsManager";
import { MARCA } from "@/lib/marca";

type Tab = "newsroom" | "social" | "carousel" | "layout" | "prompt-system" | "sources" | "cms" | "analytics" | "logs" | "comments";

/*
 * Sem ícone. Emoji como sistema de ícones muda de desenho por sistema
 * operacional, não tem peso nem alinhamento previsível, e aqui ele era
 * decoração: "Redação", "Fontes" e "Logs" já dizem o que são. A aba ativa se
 * marca por um traço à esquerda, no CSS.
 */
const NAV_ITEMS: Array<{ id: Tab; label: string }> = [
  { id: "newsroom", label: "Redação" },
  { id: "social", label: "Publicações" },
  { id: "carousel", label: "Carrossel" },
  { id: "layout", label: "Layout" },
  { id: "prompt-system", label: "Sistema PROMPT" },
  { id: "sources", label: "Fontes" },
  { id: "cms", label: "CMS Artigos" },
  { id: "analytics", label: "Analytics" },
  { id: "logs", label: "Logs" },
  { id: "comments", label: "Comentários" },
];

type QuickStats = {
  totalLeads: number;
  totalPageviews: number;
  postsToday: number;
  postsFailedToday: number;
};

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("newsroom");
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [runningQuick, setRunningQuick] = useState(false);

  useEffect(() => {
    const authStatus = sessionStorage.getItem("casaloti_admin_authed");
    setIsAuthenticated(authStatus === "true");
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadStats() {
      try {
        const [analyticsRes, socialRes] = await Promise.all([
          fetch("/api/admin/analytics"),
          fetch("/api/admin/social-posts"),
        ]);
        const analyticsJson = await analyticsRes.json().catch(() => null);
        const socialJson = await socialRes.json().catch(() => []);
        const posts = Array.isArray(socialJson) ? socialJson : [];

        setStats({
          totalLeads: analyticsJson?.analytics?.totalLeads ?? 0,
          totalPageviews: analyticsJson?.analytics?.totalPageviews ?? 0,
          postsToday: posts.length,
          postsFailedToday: posts.filter((p: { status: string }) => p.status === "failed").length,
        });
      } catch {
        // Stats são só um resumo visual; falha aqui não deve travar o painel.
      }
    }

    loadStats();
  }, [isAuthenticated]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.ok) {
        sessionStorage.setItem("casaloti_admin_authed", "true");
        setIsAuthenticated(true);
        setPassword("");
      } else {
        setErrorMsg("Senha incorreta. Verifique suas credenciais.");
      }
    } catch {
      setErrorMsg("Erro de conexão ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("casaloti_admin_authed");
    setIsAuthenticated(false);
  }

  async function handleQuickTest() {
    setRunningQuick(true);
    try {
      await fetch("/api/admin/newsroom/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, publishToPortal: false, createNewsletterCampaign: false }),
      });
      setActiveTab("newsroom");
    } finally {
      setRunningQuick(false);
    }
  }

  if (isAuthenticated === null) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center">
        <p className="text-xs font-semibold text-slate-500">Verificando acesso...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center p-4">
        <div className="w-full max-w-sm admin-glass p-8">
          <div>
            <h1 className="text-[22px] text-slate-900">{MARCA.nome}</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Painel de operação. Acesso restrito.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            {errorMsg ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
                {errorMsg}
              </div>
            ) : null}

            <div>
              {/* `htmlFor` estava faltando: o rótulo existia e não apontava
                  para campo nenhum, o que deixa leitor de tela sem nome para
                  o input e quebra o clique no texto. */}
              <label htmlFor="admin-senha" className="block text-[12px] text-slate-600">
                Senha
              </label>
              <input
                id="admin-senha"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="admin-campo mt-1.5"
              />
            </div>

            <button type="submit" disabled={loading} className="admin-botao w-full">
              {loading ? "Entrando" : "Entrar"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
              Voltar para o site
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="admin-shell flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-6 py-7">
          {/*
            O logotipo "b." e o domínio fixo saíram: eram da vertical anterior,
            e o painel passa a mostrar o nome do projeto que está operando.
          */}
          <span className="text-[15px] font-medium text-slate-900">{MARCA.nome}</span>
          <span className="mt-0.5 block text-[11px] text-slate-400">Painel de operação</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              data-active={activeTab === item.id}
              className="admin-sidebar-link flex w-full items-center px-4 py-2.5 text-left text-[13px]"
            >
              {item.label}
              {item.id === "social" && stats && stats.postsFailedToday > 0 ? (
                <span className="ml-auto text-[11px] font-semibold text-rose-600">
                  {stats.postsFailedToday}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button onClick={handleLogout} className="admin-botao-secundario w-full">
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top toolbar */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 lg:px-8">
          <span className="text-[13px] font-medium text-slate-900">
            {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
          </span>

          <div className="flex items-center gap-2">
            <Link href="/" target="_blank" className="admin-botao-secundario">
              Ver site
            </Link>
            <button onClick={handleLogout} className="admin-botao-secundario lg:hidden">
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-8 px-6 py-8 lg:px-8">
          {/*
            O banner de boas-vindas saiu.
            Ele ocupava a primeira dobra inteira em toda visita, com texto que
            so' se le uma vez. Quem abre o painel vem operar, e o que interessa
            e' o numero do dia e o botao de acao, que agora aparecem sem
            rolagem.

            O botao de teste da redacao continua: ele era a unica parte util do
            bloco. Foi para a barra de acoes junto das metricas.
          */}
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[20px] text-slate-900">Hoje</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">
                Redação, carrosséis e newsletter do dia.
              </p>
            </div>
            <button onClick={handleQuickTest} disabled={runningQuick} className="admin-botao">
              {runningQuick ? "Testando" : "Testar redação"}
            </button>
          </section>

          {/* Stats grid */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Publicações hoje" value={stats?.postsToday ?? "—"} />
            <StatCard
              label="Falharam hoje"
              value={stats?.postsFailedToday ?? "—"}
              alerta={Boolean(stats && stats.postsFailedToday > 0)}
            />
            <StatCard label="Inscritos" value={stats?.totalLeads ?? "—"} />
            <StatCard label="Pageviews" value={stats?.totalPageviews ?? "—"} />
          </section>

          {/* Conteúdo da aba selecionada */}
          <section>
            {activeTab === "newsroom" ? <AdminNewsroomManager /> : null}
            {activeTab === "social" ? <AdminSocialPostsManager /> : null}
            {activeTab === "carousel" ? <AdminCarouselDesignManager /> : null}
            {activeTab === "layout" ? <AdminLayoutEditor /> : null}
            {activeTab === "prompt-system" ? (
              // Na ordem do funil: tendência → conceito → campanha.
              <div className="space-y-8">
                <AdminPromptTrendsManager />
                <AdminPromptSystemManager />
              </div>
            ) : null}
            {activeTab === "sources" ? <AdminNewsSourcesManager /> : null}
            {activeTab === "cms" ? <AdminCMSManager /> : null}
            {activeTab === "analytics" ? <AdminAnalyticsDashboard /> : null}
            {activeTab === "logs" ? <AdminLogsManager /> : null}
            {activeTab === "comments" ? <AdminCommentsManager /> : null}
          </section>
        </main>
      </div>

      {/*
        O botão flutuante saiu. Ele repetia, por cima do conteúdo, a mesma ação
        que já existe no topo da área principal, e cobria a tabela justamente
        no canto onde as linhas mais recentes aparecem.
      */}
    </div>
  );
}

/**
 * Número do dia.
 *
 * Antes cada card tinha a própria cor, o que dava quatro acentos lado a lado
 * dizendo a mesma coisa: "sou um número". Agora todos são pretos, e a cor só
 * aparece quando há falha. Achar o vermelho num painel cinza é instantâneo;
 * achar o vermelho entre quatro cores é procurar.
 */
function StatCard({
  label,
  value,
  alerta = false,
}: {
  label: string;
  value: number | string;
  alerta?: boolean;
}) {
  return (
    <div className="admin-glass p-5">
      <span className="text-[11px] text-slate-500">{label}</span>
      <p className={`mt-1.5 text-[26px] font-medium ${alerta ? "text-rose-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
