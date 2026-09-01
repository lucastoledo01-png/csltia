"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  keyword: string;
  campaignType: "newsletter" | "prompt";
  theme: string;
  format: "noticia" | "tutorial" | "prompt";
  status: "draft" | "ready" | "published" | "blocked" | "archived";
  igMediaId: string | null;
  openreplyAutomationId: string | null;
  lpUrl: string | null;
  source: "manual" | "automated";
  createdAt: string;
  publishedAt: string | null;
};

const STATUS_STYLE: Record<Campaign["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  ready: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  blocked: "bg-rose-100 text-rose-700",
  archived: "bg-slate-100 text-slate-400",
};

const STATUS_LABEL: Record<Campaign["status"], string> = {
  draft: "Rascunho",
  ready: "Pronta",
  published: "Publicada",
  blocked: "Bloqueada (veto)",
  archived: "Arquivada",
};

const emptyDraft = {
  keyword: "",
  campaignType: "prompt" as Campaign["campaignType"],
  format: "prompt" as Campaign["format"],
  theme: "",
  concept: "",
};

export function AdminPromptSystemManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prompt-system/campaigns");
      if (res.ok) setCampaigns(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/prompt-system/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erro ao criar campanha.");
        return;
      }
      setDraft(emptyDraft);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando campanhas...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="admin-glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <h3 className="text-2xl text-slate-900">Sistema PROMPT — Campanhas</h3>
          <p className="mt-1 text-sm text-slate-500">
            Fase 0: registro manual de campanha. Trend intelligence, geração visual e a automação no
            OpenReply ainda não estão plugadas — isso testa o funil de ponta a ponta com conteúdo feito à
            mão. Ver <code className="text-xs">docs/sistema-prompt-arquitetura.md</code>.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
        >
          {showForm ? "Cancelar" : "+ Nova Campanha"}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="admin-glass space-y-4 rounded-3xl p-6">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Keyword (única, maiúsculas, sem acento)
              </label>
              <input
                required
                value={draft.keyword}
                onChange={(e) => setDraft({ ...draft, keyword: e.target.value.toUpperCase() })}
                placeholder="ex: GTA26"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Tipo de campanha
              </label>
              <select
                value={draft.campaignType}
                onChange={(e) => setDraft({ ...draft, campaignType: e.target.value as Campaign["campaignType"] })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="prompt">Prompt/Tutorial (landing dinâmica por campanha)</option>
                <option value="newsletter">Newsletter (landing evergreen fixa)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Formato do carrossel
              </label>
              <select
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value as Campaign["format"] })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="prompt">Prompt</option>
                <option value="tutorial">Tutorial</option>
                <option value="noticia">Notícia</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Tema</label>
              <input
                required
                value={draft.theme}
                onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
                placeholder="ex: Fotos com a estética de GTA 6"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Conceito (opcional, anotação livre por enquanto)
            </label>
            <textarea
              value={draft.concept}
              onChange={(e) => setDraft({ ...draft, concept: e.target.value })}
              rows={3}
              placeholder="Aplicações, hook, direção visual — vira prompt_concepts estruturado na Fase 4."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Registrar Campanha"}
          </button>
        </form>
      ) : null}

      <div className="admin-glass overflow-hidden rounded-3xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200/60 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Keyword</th>
              <th className="px-5 py-3">Tema</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Origem</th>
              <th className="px-5 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-white/40">
                <td className="px-5 py-4 font-mono font-bold text-slate-900">{c.keyword}</td>
                <td className="px-5 py-4 text-slate-600">{c.theme}</td>
                <td className="px-5 py-4 text-xs font-semibold text-indigo-600">
                  {c.campaignType === "newsletter" ? "Newsletter" : "Prompt/Tutorial"}
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500">{c.source === "manual" ? "Manual" : "Automática"}</td>
                <td className="px-5 py-4 text-xs text-slate-400">
                  {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                  Nenhuma campanha registrada ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
