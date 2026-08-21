"use client";

import { useEffect, useState } from "react";

type ArticleRecord = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  cover_image?: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  category: string;
  author: string;
  reading_minutes: number;
  view_count: number;
  published_at?: string | null;
  content: Array<{ heading: string; paragraphs: string[] }>;
  seo_title?: string;
  seo_description?: string;
  age_summary?: string;
};

export function AdminCMSManager() {
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingArticle, setEditingArticle] = useState<ArticleRecord | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  async function loadArticles() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/articles");
      const json = await res.json();
      if (json.ok && Array.isArray(json.articles)) {
        setArticles(json.articles);
      }
    } catch (err) {
      console.error("Erro ao carregar artigos no CMS:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArticles();
  }, []);

  async function handleSaveArticle(e: React.FormEvent) {
    e.preventDefault();
    if (!editingArticle) return;

    try {
      const method = editingArticle.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/articles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingArticle),
      });

      const json = await res.json();
      if (json.ok) {
        alert("Artigo salvo com sucesso!");
        setEditingArticle(null);
        setIsCreatingNew(false);
        loadArticles();
      } else {
        alert(`Erro ao salvar: ${json.error || "Tente novamente."}`);
      }
    } catch (err) {
      alert("Falha na requisição ao salvar artigo.");
    }
  }

  async function toggleStatus(article: ArticleRecord) {
    const newStatus = article.status === "published" ? "draft" : "published";
    try {
      const res = await fetch("/api/admin/articles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: article.slug, status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setArticles((prev) => prev.map((a) => (a.slug === article.slug ? { ...a, status: newStatus } : a)));
      }
    } catch (err) {
      console.error("Erro ao alterar status:", err);
    }
  }

  async function handleDelete(article: ArticleRecord) {
    if (!confirm(`Tem certeza que deseja excluir o artigo "${article.title}"?`)) return;

    try {
      const res = await fetch(`/api/admin/articles?slug=${encodeURIComponent(article.slug)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setArticles((prev) => prev.filter((a) => a.slug !== article.slug));
      }
    } catch (err) {
      console.error("Erro ao deletar artigo:", err);
    }
  }

  function handleCreateNew() {
    const newArt: ArticleRecord = {
      slug: `novo-artigo-${Date.now()}`,
      title: "Título do Artigo com IA",
      excerpt: "Resumo explicativo do artigo...",
      description: "Descrição completa do artigo...",
      category: "Radar",
      author: "Casaloti IA",
      reading_minutes: 5,
      view_count: 0,
      status: "draft",
      content: [
        { heading: "Primeiro Tópico", paragraphs: ["Escreva o primeiro parágrafo aqui..."] },
      ],
      seo_title: "",
      seo_description: "",
      age_summary: "",
    };

    setEditingArticle(newArt);
    setIsCreatingNew(true);
  }

  const filtered = articles.filter((art) => {
    const matchesSearch = art.title.toLowerCase().includes(search.toLowerCase()) || art.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" ? true : art.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div className="py-12 text-center text-sm text-[#667085]">Carregando catálogo de artigos do CMS...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Barra de Ferramentas do CMS */}
      <div className="rounded-[28px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.05em] text-black">Gestão CMS de Artigos</h3>
            <p className="mt-1 text-sm text-[#667085]">Crie, edite, publique ou altere os artigos do portal.</p>
          </div>

          <button
            onClick={handleCreateNew}
            className="rounded-full bg-[#ff4a1c] px-6 py-2.5 text-sm font-black text-white hover:bg-[#e03e13]"
          >
            + Novo Artigo com IA
          </button>
        </div>

        {/* Filtros e Busca */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <input
            type="text"
            placeholder="Buscar por título ou slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-xl border border-[#d0d5dd] px-4 py-2 text-sm focus:border-[#ff4a1c] focus:outline-none"
          />

          <div className="flex rounded-full border border-[#d0d5dd] bg-[#fafafa] p-1 text-xs font-bold">
            <button
              onClick={() => setFilterStatus("all")}
              className={`rounded-full px-4 py-1.5 ${filterStatus === "all" ? "bg-[#ff4a1c] text-white" : "text-[#667085]"}`}
            >
              Todos ({articles.length})
            </button>
            <button
              onClick={() => setFilterStatus("published")}
              className={`rounded-full px-4 py-1.5 ${filterStatus === "published" ? "bg-[#ff4a1c] text-white" : "text-[#667085]"}`}
            >
              Publicados ({articles.filter((a) => a.status === "published").length})
            </button>
            <button
              onClick={() => setFilterStatus("draft")}
              className={`rounded-full px-4 py-1.5 ${filterStatus === "draft" ? "bg-[#ff4a1c] text-white" : "text-[#667085]"}`}
            >
              Rascunhos ({articles.filter((a) => a.status === "draft").length})
            </button>
          </div>
        </div>

        {/* Tabela dos Artigos */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#eaecf0] text-xs uppercase text-[#667085]">
              <tr>
                <th className="py-3 px-4">Artigo</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Views</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaecf0]">
              {filtered.map((art) => (
                <tr key={art.slug} className="hover:bg-[#fafafa]">
                  <td className="py-4 px-4 font-bold text-black">
                    {art.title}
                    <span className="block text-xs font-mono font-normal text-[#98a2b3]">/{art.slug}</span>
                  </td>
                  <td className="py-4 px-4 text-[#667085]">{art.category}</td>
                  <td className="py-4 px-4 font-mono font-bold text-[#ff4a1c]">{art.view_count || 0}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${art.status === "published" ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#feefc3] text-[#b06000]"}`}>
                      {art.status === "published" ? "Publicado" : "Rascunho"}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right space-x-2">
                    <button
                      onClick={() => { setEditingArticle({ ...art }); setIsCreatingNew(false); }}
                      className="rounded-lg border border-[#d0d5dd] px-3 py-1 text-xs font-bold text-black hover:bg-gray-100"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleStatus(art)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold ${art.status === "published" ? "bg-[#feefc3] text-[#b06000]" : "bg-[#e6f4ea] text-[#137333]"}`}
                    >
                      {art.status === "published" ? "Despublicar" : "Publicar"}
                    </button>
                    <button
                      onClick={() => handleDelete(art)}
                      className="rounded-lg bg-[#fce8e6] px-3 py-1 text-xs font-bold text-[#c5221f] hover:bg-[#fad2cf]"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edição Completa do Artigo */}
      {editingArticle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#eaecf0] pb-4">
              <h3 className="text-2xl font-black text-black">
                {isCreatingNew ? "Criar Novo Artigo" : `Editar: ${editingArticle.title}`}
              </h3>
              <button
                onClick={() => setEditingArticle(null)}
                className="text-sm font-bold text-[#667085] hover:text-black"
              >
                ✕ Fechar
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Título</label>
                  <input
                    type="text"
                    required
                    value={editingArticle.title}
                    onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#ff4a1c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Slug (URL)</label>
                  <input
                    type="text"
                    required
                    value={editingArticle.slug}
                    onChange={(e) => setEditingArticle({ ...editingArticle, slug: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm font-mono focus:outline-none focus:border-[#ff4a1c]"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Categoria</label>
                  <input
                    type="text"
                    required
                    value={editingArticle.category}
                    onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#ff4a1c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Tempo de Leitura (min)</label>
                  <input
                    type="number"
                    required
                    value={editingArticle.reading_minutes}
                    onChange={(e) => setEditingArticle({ ...editingArticle, reading_minutes: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#ff4a1c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Status</label>
                  <select
                    value={editingArticle.status}
                    onChange={(e) => setEditingArticle({ ...editingArticle, status: e.target.value as any })}
                    className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#ff4a1c]"
                  >
                    <option value="published">Publicado</option>
                    <option value="draft">Rascunho</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Resumo / Excerpt</label>
                <textarea
                  rows={2}
                  value={editingArticle.excerpt}
                  onChange={(e) => setEditingArticle({ ...editingArticle, excerpt: e.target.value, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#ff4a1c]"
                />
              </div>

              {/* Seção de Conteúdo */}
              <div className="border-t border-[#eaecf0] pt-4">
                <h4 className="text-sm font-bold text-black uppercase tracking-wider">Conteúdo (Seções)</h4>
                {editingArticle.content.map((sec, sIdx) => (
                  <div key={sIdx} className="mt-3 rounded-xl border border-[#eaecf0] p-4 bg-[#fafafa]">
                    <label className="block text-xs font-bold text-[#667085]">Título da Seção {sIdx + 1}</label>
                    <input
                      type="text"
                      value={sec.heading}
                      onChange={(e) => {
                        const newSecs = [...editingArticle.content];
                        newSecs[sIdx].heading = e.target.value;
                        setEditingArticle({ ...editingArticle, content: newSecs });
                      }}
                      className="mt-1 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-1.5 text-sm"
                    />

                    <label className="block mt-3 text-xs font-bold text-[#667085]">Parágrafo</label>
                    <textarea
                      rows={3}
                      value={sec.paragraphs[0] || ""}
                      onChange={(e) => {
                        const newSecs = [...editingArticle.content];
                        newSecs[sIdx].paragraphs = [e.target.value];
                        setEditingArticle({ ...editingArticle, content: newSecs });
                      }}
                      className="mt-1 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#eaecf0]">
                <button
                  type="button"
                  onClick={() => setEditingArticle(null)}
                  className="rounded-full border border-[#d0d5dd] px-6 py-2.5 text-sm font-bold text-[#667085] hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#ff4a1c] px-6 py-2.5 text-sm font-black text-white hover:bg-[#e03e13]"
                >
                  Salvar Artigo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
