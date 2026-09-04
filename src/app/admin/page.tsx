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
import { AdminPromptSystemManager } from "@/components/AdminPromptSystemManager";

type Tab = "newsroom" | "social" | "carousel" | "prompt-system" | "sources" | "cms" | "analytics" | "logs" | "comments";

const NAV_ITEMS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "newsroom", label: "Redação (IA)", icon: "⚡" },
  { id: "social", label: "Publicações", icon: "📸" },
  { id: "carousel", label: "Carrossel", icon: "🎨" },
  { id: "prompt-system", label: "Sistema PROMPT", icon: "🎯" },
  { id: "sources", label: "Fontes", icon: "🛰️" },
  { id: "cms", label: "CMS Artigos", icon: "📝" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "logs", label: "Logs & Auditoria", icon: "📋" },
  { id: "comments", label: "Comentários", icon: "💬" },
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
        <div className="w-full max-w-sm admin-glass rounded-[32px] p-8 shadow-xl shadow-indigo-200/50">
          <div className="text-center">
            <span className="inline-block rounded-full bg-indigo-600 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
              Acesso Restrito
            </span>
            <h1 className="mt-3 text-2xl text-slate-900">Painel de Controle</h1>
            <p className="mt-1 text-xs text-slate-500">
              Digite a senha de administrador para acessar o CMS e métricas.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            {errorMsg ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
                {errorMsg}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Senha
              </label>
              <input
                type="password"
                required
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-300/50 transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar no Painel"}
            </button>
          </form>

          <div className="mt-6 border-t border-white/60 pt-4 text-center">
            <Link href="/" className="text-xs font-medium text-slate-500 hover:text-indigo-600">
              ← Voltar para o site público
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="admin-shell flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col border-r border-white/50 bg-white/90 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-black text-white">
            b.
          </span>
          <span className="text-[20px] text-slate-900">desbuguei.ia</span>
        </div>

        <nav className="flex-1 space-y-2 px-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              data-active={activeTab === item.id}
              className="admin-sidebar-link flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm text-slate-600"
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
              {item.id === "social" && stats && stats.postsFailedToday > 0 ? (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {stats.postsFailedToday}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="m-4 rounded-2xl bg-indigo-50 p-4">
          <p className="text-xs font-bold text-indigo-900">Conta Admin</p>
          <p className="mt-0.5 text-[11px] text-indigo-500">casaloti.ia.br</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-indigo-200 bg-white py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100"
          >
            Sair 🔒
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top toolbar */}
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between gap-4 border-b border-white/40 bg-white/40 px-6 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Painel</span>
            <span>›</span>
            <span className="font-bold text-slate-900">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="flex h-[42px] items-center rounded-xl border border-white/60 bg-white/70 px-4 text-xs font-semibold text-slate-700 hover:bg-white"
            >
              Ver Site ↗
            </Link>
            <button
              onClick={handleLogout}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-white/60 bg-white/70 text-slate-600 hover:bg-white lg:hidden"
              aria-label="Sair"
            >
              🔒
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-8 px-6 py-8 lg:px-8">
          {/* Hero */}
          <section className="admin-hero relative overflow-hidden rounded-[2.5rem] p-10 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/20 blur-[60px]" />
            <div className="pointer-events-none absolute -bottom-16 left-1/3 h-56 w-56 rounded-full bg-purple-300/30 blur-[60px]" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur-md">
                  Bem-vindo de volta
                </span>
                <h2 className="mt-3 text-[40px] leading-tight text-white sm:text-[48px]">
                  Central Desbuguei.ia
                </h2>
                <p className="mt-2 max-w-md text-sm text-indigo-100">
                  Redação automática, carrosséis do Instagram e newsletter, tudo num só lugar.
                </p>
              </div>
              <button
                onClick={handleQuickTest}
                disabled={runningQuick}
                className="rounded-full bg-white px-6 py-3 text-sm font-bold text-indigo-700 shadow-xl hover:bg-indigo-50 disabled:opacity-60"
              >
                {runningQuick ? "Testando..." : "⚡ Testar Redação Agora"}
              </button>
            </div>
          </section>

          {/* Stats grid */}
          <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Publicações IG hoje" value={stats?.postsToday ?? "—"} color="indigo" />
            <StatCard
              label="Falharam hoje"
              value={stats?.postsFailedToday ?? "—"}
              color={stats && stats.postsFailedToday > 0 ? "rose" : "emerald"}
            />
            <StatCard label="Inscritos newsletter" value={stats?.totalLeads ?? "—"} color="amber" />
            <StatCard label="Pageviews" value={stats?.totalPageviews ?? "—"} color="emerald" />
          </section>

          {/* Conteúdo da aba selecionada */}
          <section>
            {activeTab === "newsroom" ? <AdminNewsroomManager /> : null}
            {activeTab === "social" ? <AdminSocialPostsManager /> : null}
            {activeTab === "carousel" ? <AdminCarouselDesignManager /> : null}
            {activeTab === "prompt-system" ? <AdminPromptSystemManager /> : null}
            {activeTab === "sources" ? <AdminNewsSourcesManager /> : null}
            {activeTab === "cms" ? <AdminCMSManager /> : null}
            {activeTab === "analytics" ? <AdminAnalyticsDashboard /> : null}
            {activeTab === "logs" ? <AdminLogsManager /> : null}
            {activeTab === "comments" ? <AdminCommentsManager /> : null}
          </section>
        </main>
      </div>

      {/* Floating AI trigger */}
      <button
        onClick={handleQuickTest}
        disabled={runningQuick}
        title="Testar a redação (dry run)"
        className="admin-fab fixed bottom-8 right-8 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-[0_20px_25px_-5px_rgba(99,102,241,0.5)] disabled:opacity-60"
      >
        <span className="text-2xl">⚡</span>
        {stats && stats.postsFailedToday > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {stats.postsFailedToday}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "indigo" | "rose" | "emerald" | "amber";
}) {
  const colorMap = {
    indigo: "text-indigo-600",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  };

  return (
    <div className="admin-glass rounded-3xl p-6">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <p className={`mt-2 text-2xl font-black ${colorMap[color]}`}>{value}</p>
    </div>
  );
}
