"use client";

import { useEffect, useState } from "react";

type Source = {
  id: string;
  source_key: string;
  name: string;
  company_name: string | null;
  type: "rss" | "atom" | "html" | "api" | "instagram_profile";
  url: string;
  enabled: boolean;
  priority: 1 | 2;
  category: string;
  region: string;
  keywords: string[];
};

const TYPE_LABEL: Record<Source["type"], string> = {
  rss: "RSS",
  atom: "Atom",
  html: "HTML",
  api: "API",
  instagram_profile: "Perfil Instagram",
};

const emptyDraft = {
  source_key: "",
  name: "",
  company_name: "",
  type: "rss" as Source["type"],
  url: "",
  priority: 2 as 1 | 2,
  category: "general_ai",
  region: "global",
  keywords: "",
};

export function AdminNewsSourcesManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/news-sources");
      const json = await res.json();
      if (json.ok) setSources(json.sources);
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
      const res = await fetch("/api/admin/news-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          company_name: draft.company_name || undefined,
          keywords: draft.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Erro ao criar fonte.");
        return;
      }
      setDraft(emptyDraft);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(source: Source) {
    setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, enabled: !s.enabled } : s)));
    await fetch(`/api/admin/news-sources/${source.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !source.enabled }),
    });
  }

  async function handleDelete(source: Source) {
    if (!confirm(`Remover a fonte "${source.name}"?`)) return;
    await fetch(`/api/admin/news-sources/${source.id}`, { method: "DELETE" });
    setSources((prev) => prev.filter((s) => s.id !== source.id));
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando fontes...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="admin-glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <h3 className="text-2xl text-slate-900">Fontes de Conteúdo</h3>
          <p className="mt-1 text-sm text-slate-500">
            Sites de notícia (RSS) e perfis do Instagram que a redação lê para encontrar pautas.
            {" "}Palavras-chave são opcionais — quando definidas, só entram matérias que contêm pelo menos uma delas.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
        >
          {showForm ? "Cancelar" : "+ Nova Fonte"}
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
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Tipo</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as Source["type"] })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="rss">Site de notícias (RSS)</option>
                <option value="atom">Site de notícias (Atom)</option>
                <option value="instagram_profile">Perfil do Instagram</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Nome</label>
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex: TechCrunch AI"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Chave única (sem espaços)
              </label>
              <input
                required
                value={draft.source_key}
                onChange={(e) => setDraft({ ...draft, source_key: e.target.value })}
                placeholder="ex: techcrunch-ai"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                {draft.type === "instagram_profile" ? "@usuário do Instagram (sem @)" : "URL do feed"}
              </label>
              <input
                required
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder={draft.type === "instagram_profile" ? "nomedaconta" : "https://site.com/feed"}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Prioridade</label>
              <select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) as 1 | 2 })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={1}>1 — Alta</option>
                <option value={2}>2 — Normal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Categoria</label>
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="lab">Laboratório de IA</option>
                <option value="tech_media">Mídia de Tecnologia</option>
                <option value="br_media">Mídia Brasileira</option>
                <option value="general_ai">IA Geral</option>
                <option value="research">Pesquisa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Região</label>
              <select
                value={draft.region}
                onChange={(e) => setDraft({ ...draft, region: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="global">Global</option>
                <option value="br">Brasil</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Palavras-chave (opcional, separadas por vírgula)
            </label>
            <input
              value={draft.keywords}
              onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
              placeholder="ex: agente, automação, LLM"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Deixe em branco para aceitar tudo que a fonte publicar.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Adicionar Fonte"}
          </button>
        </form>
      ) : null}

      <div className="admin-glass overflow-hidden rounded-3xl">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200/60 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Fonte</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Palavras-chave</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {sources.map((s) => (
              <tr key={s.id} className="hover:bg-white/40">
                <td className="px-5 py-4">
                  <span className="font-bold text-slate-900">{s.name}</span>
                  <span className="block text-xs text-slate-400">
                    {s.type === "instagram_profile" ? `@${s.url}` : s.url}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-indigo-600">{TYPE_LABEL[s.type]}</td>
                <td className="px-5 py-4 text-xs text-slate-500">
                  {s.keywords.length > 0 ? s.keywords.join(", ") : <span className="italic text-slate-300">sem filtro</span>}
                </td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => toggleEnabled(s)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      s.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.enabled ? "Ativa" : "Pausada"}
                  </button>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => handleDelete(s)}
                    className="rounded-lg bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {sources.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                  Nenhuma fonte configurada ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
