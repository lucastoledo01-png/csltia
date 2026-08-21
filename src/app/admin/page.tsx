"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminAnalyticsDashboard } from "@/components/AdminAnalyticsDashboard";
import { AdminCMSManager } from "@/components/AdminCMSManager";
import { AdminCommentsManager } from "@/components/AdminCommentsManager";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"cms" | "analytics" | "comments">("cms");

  return (
    <main className="min-h-screen bg-[#f8f9fa] text-black">
      <header className="border-b border-[#e5e7eb] bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-[#ff4a1c] px-3 py-1 font-mono text-xs font-black text-white">
              CASALOTI IA / ADMIN
            </span>
            <h1 className="text-xl font-black tracking-tight text-black">Painel de Gestão & Analytics</h1>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              target="_blank"
              className="rounded-full border border-[#d0d5dd] px-4 py-2 text-xs font-bold text-black hover:bg-gray-50"
            >
              Ver Site Ao Vivo ↗
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Navegação por Abas */}
        <div className="flex rounded-2xl border border-[#d0d5dd] bg-white p-1.5 shadow-sm max-w-xl">
          <button
            onClick={() => setActiveTab("cms")}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
              activeTab === "cms" ? "bg-[#ff4a1c] text-white shadow-sm" : "text-[#667085] hover:text-black"
            }`}
          >
            📝 Gestão de Artigos (CMS)
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
              activeTab === "analytics" ? "bg-[#ff4a1c] text-white shadow-sm" : "text-[#667085] hover:text-black"
            }`}
          >
            📊 Analytics & Acessos
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
              activeTab === "comments" ? "bg-[#ff4a1c] text-white shadow-sm" : "text-[#667085] hover:text-black"
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
