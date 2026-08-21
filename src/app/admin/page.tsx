"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminAnalyticsDashboard } from "@/components/AdminAnalyticsDashboard";
import { AdminCMSManager } from "@/components/AdminCMSManager";
import { AdminCommentsManager } from "@/components/AdminCommentsManager";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"cms" | "analytics" | "comments">("cms");

  useEffect(() => {
    // Verificar se já possui sessão autorizada no navegador
    const authStatus = sessionStorage.getItem("casaloti_admin_authed");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

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
    } catch (err) {
      setErrorMsg("Erro de conexão ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("casaloti_admin_authed");
    setIsAuthenticated(false);
  }

  // Estado inicial de carregamento da checagem de sessão
  if (isAuthenticated === null) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#fafafa]">
        <p className="text-xs font-semibold text-[#6b7280]">Verificando acesso...</p>
      </main>
    );
  }

  // Se NÃO estiver autenticado, exibe a tela de login protegida
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#fafafa] p-4 text-[#111827]">
        <div className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="text-center">
            <span className="inline-block rounded-full bg-[#ff4a1c] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
              Acesso Restrito
            </span>
            <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-[#111827]">
              Painel de Controle
            </h1>
            <p className="mt-1 text-xs text-[#6b7280]">
              Digite a senha de administrador para acessar o CMS e métricas.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            {errorMsg ? (
              <div className="rounded-lg bg-[#fef2f2] p-3 text-xs font-semibold text-[#dc2626] border border-[#fecaca]">
                {errorMsg}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#374151]">
                Senha
              </label>
              <input
                type="password"
                required
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-[#fafafa] px-4 py-2.5 text-sm text-[#111827] focus:border-[#ff4a1c] focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#ff4a1c] py-2.5 text-sm font-bold text-white hover:bg-[#e03e13] disabled:opacity-50 transition-colors"
            >
              {loading ? "Entrando..." : "Entrar no Painel"}
            </button>
          </form>

          <div className="mt-6 border-t border-[#f3f4f6] pt-4 text-center">
            <Link href="/" className="text-xs font-medium text-[#6b7280] hover:text-[#ff4a1c]">
              ← Voltar para o site público
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Se ESTIVER autenticado, exibe o painel de administração completo
  return (
    <main className="min-h-screen bg-[#fafafa] text-[#111827]">
      <header className="border-b border-[#e5e7eb] bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-[#ff4a1c] px-3 py-1 font-mono text-xs font-bold text-white">
              CASALOTI IA / ADMIN
            </span>
            <h1 className="text-lg font-bold tracking-tight text-[#111827]">Gestão & Analytics</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="rounded-full border border-[#d0d5dd] px-4 py-1.5 text-xs font-semibold text-[#374151] hover:bg-gray-50"
            >
              Ver Site Ao Vivo ↗
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-full border border-[#fecaca] bg-[#fef2f2] px-4 py-1.5 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2]"
            >
              Sair 🔒
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Navegação por Abas */}
        <div className="flex rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-sm max-w-md">
          <button
            onClick={() => setActiveTab("cms")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "cms" ? "bg-[#ff4a1c] text-white shadow-sm" : "text-[#6b7280] hover:text-[#111827]"
            }`}
          >
            📝 Gestão (CMS)
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "analytics" ? "bg-[#ff4a1c] text-white shadow-sm" : "text-[#6b7280] hover:text-[#111827]"
            }`}
          >
            📊 Analytics
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "comments" ? "bg-[#ff4a1c] text-white shadow-sm" : "text-[#6b7280] hover:text-[#111827]"
            }`}
          >
            💬 Comentários
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="mt-8">
          {activeTab === "cms" ? <AdminCMSManager /> : null}
          {activeTab === "analytics" ? <AdminAnalyticsDashboard /> : null}
          {activeTab === "comments" ? <AdminCommentsManager /> : null}
        </div>
      </div>
    </main>
  );
}
