"use client";

import { useEffect, useState } from "react";
import { NewsletterRenderer } from "./NewsletterRenderer";

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
  content_html?: string;
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
  const [modalTab, setModalTab] = useState<"edit" | "preview">("edit");

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
        alert("Edição salva com sucesso!");
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
    if (!confirm(`Tem certeza que deseja excluir a edição "${article.title}"?`)) return;

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
      slug: `edicao-${Date.now()}`,
      title: "Título da Nova Edição",
      excerpt: "Resumo em destaque para a edição...",
      description: "Descrição completa...",
      category: "Radar",
      author: "desbuguei.ia",
      reading_minutes: 5,
      view_count: 0,
      status: "draft",
      content: [],
      content_html: `<section class="mb-8">
  <h2 class="text-2xl font-black text-black tracking-tight mb-3">Primeira Pauta</h2>
  <p className="leading-relaxed">Escreva aqui a primeira pauta da edição. <mark class="bg-[#fef08a] px-1 font-bold text-black">Destaque uma frase importante aqui</mark>.</p>
</section>`,
      seo_title: "",
      seo_description: "",
      age_summary: "",
    };

    setEditingArticle(newArt);
    setIsCreatingNew(true);
    setModalTab("edit");
  }

  function insertTag(tagSnippet: string) {
    if (!editingArticle) return;
    const current = editingArticle.content_html || "";
    setEditingArticle({ ...editingArticle, content_html: current + "\n" + tagSnippet });
  }

  const filtered = articles.filter((art) => {
    const matchesSearch = art.title.toLowerCase().includes(search.toLowerCase()) || art.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" ? true : art.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div className="py-12 text-center text-sm text-[#667085]">Carregando edições e notícias do CMS...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Barra de Ferramentas do CMS */}
      <div className="admin-glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.05em] text-black">Gestão CMS de Edições & Notícias</h3>
            <p className="mt-1 text-sm text-[#667085]">Edite o conteúdo em texto livre/HTML com pré-visualização estilo The News.</p>
          </div>

          <button
            onClick={handleCreateNew}
            className="rounded-full bg-[#6366f1] px-6 py-2.5 text-sm font-black text-white hover:bg-[#4f46e5]"
          >
            + Nova Edição / Notícia
          </button>
        </div>

        {/* Filtros e Busca */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <input
            type="text"
            placeholder="Buscar por título ou slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-xl border border-[#d0d5dd] px-4 py-2 text-sm focus:border-[#6366f1] focus:outline-none"
          />

          <div className="flex rounded-full border border-[#d0d5dd] bg-[#fafafa] p-1 text-xs font-bold">
            <button
              onClick={() => setFilterStatus("all")}
              className={`rounded-full px-4 py-1.5 ${filterStatus === "all" ? "bg-[#6366f1] text-white" : "text-[#667085]"}`}
            >
              Todos ({articles.length})
            </button>
            <button
              onClick={() => setFilterStatus("published")}
              className={`rounded-full px-4 py-1.5 ${filterStatus === "published" ? "bg-[#6366f1] text-white" : "text-[#667085]"}`}
            >
              Publicados ({articles.filter((a) => a.status === "published").length})
            </button>
            <button
              onClick={() => setFilterStatus("draft")}
              className={`rounded-full px-4 py-1.5 ${filterStatus === "draft" ? "bg-[#6366f1] text-white" : "text-[#667085]"}`}
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
                <th className="py-3 px-4">Edição / Notícia</th>
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
                  <td className="py-4 px-4 font-mono font-bold text-[#6366f1]">{art.view_count || 0}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${art.status === "published" ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#feefc3] text-[#b06000]"}`}>
                      {art.status === "published" ? "Publicado" : "Rascunho"}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right space-x-2">
                    <button
                      onClick={() => { setEditingArticle({ ...art }); setIsCreatingNew(false); setModalTab("edit"); }}
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

      {/* Modal de Edição HTML e Preview */}
      {editingArticle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl admin-glass rounded-[32px] p-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between border-b border-[#eaecf0] pb-4 gap-4">
              <div>
                <h3 className="text-2xl font-black text-black">
                  {isCreatingNew ? "Criar Nova Edição / Notícia" : `Editar: ${editingArticle.title}`}
                </h3>
                <p className="text-xs text-[#667085]">Edite o conteúdo livremente e veja o preview ao vivo no padrão The News.</p>
              </div>

              {/* Botões de Alternar Aba (Editar / Preview) */}
              <div className="flex rounded-full border border-[#d0d5dd] bg-[#fafafa] p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setModalTab("edit")}
                  className={`rounded-full px-5 py-1.5 ${modalTab === "edit" ? "bg-[#6366f1] text-white" : "text-[#667085]"}`}
                >
                  ✏️ Editar Conteúdo
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("preview")}
                  className={`rounded-full px-5 py-1.5 ${modalTab === "preview" ? "bg-[#6366f1] text-white" : "text-[#667085]"}`}
                >
                  👁️ Preview ao Vivo
                </button>
              </div>
            </div>

            {modalTab === "edit" ? (
              <form onSubmit={handleSaveArticle} className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Título</label>
                    <input
                      type="text"
                      required
                      value={editingArticle.title}
                      onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Slug (URL)</label>
                    <input
                      type="text"
                      required
                      value={editingArticle.slug}
                      onChange={(e) => setEditingArticle({ ...editingArticle, slug: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm font-mono focus:outline-none focus:border-[#6366f1]"
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
                      className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Tempo de Leitura (min)</label>
                    <input
                      type="number"
                      required
                      value={editingArticle.reading_minutes}
                      onChange={(e) => setEditingArticle({ ...editingArticle, reading_minutes: Number(e.target.value) })}
                      className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Status</label>
                    <select
                      value={editingArticle.status}
                      onChange={(e) => setEditingArticle({ ...editingArticle, status: e.target.value as any })}
                      className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
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
                    className="mt-1 w-full rounded-xl border border-[#d0d5dd] px-3.5 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                  />
                </div>

                {/* Barra de Atalhos de Inserção Rápida no HTML */}
                <div className="rounded-2xl border border-[#eaecf0] bg-[#fafafa] p-4">
                  <span className="block text-xs font-bold uppercase tracking-wider text-[#667085] mb-2">
                    ⚡ Atalhos de Inserção Rápida (Formatação The News)
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => insertTag('<mark class="bg-[#fef08a] px-1 font-bold text-black">Texto Destacado em Amarelo</mark>')}
                      className="rounded-lg border border-[#fef08a] bg-[#fffde7] px-3 py-1.5 font-bold text-[#854d0e] hover:bg-[#fef08a]"
                    >
                      🟡 Marca-texto Amarelo
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTag('<blockquote class="my-6 rounded-2xl border-l-4 border-[#6366f1] bg-white p-5 font-black text-black italic"><p>"Sua citação marcante aqui."</p></blockquote>')}
                      className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-1.5 font-bold text-[#344054] hover:bg-gray-100"
                    >
                      💬 Citação Destacada
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTag('<div className="my-6"><a href="https://api.whatsapp.com/send?text=Confira" target="_blank" class="inline-flex items-center gap-2 rounded-full border border-[#25d366] bg-[#f0fdf4] px-4 py-2 text-xs font-bold text-[#166534]">📲 Compartilhe essa notícia no WhatsApp</a></div>')}
                      className="rounded-lg border border-[#25d366]/40 bg-[#f0fdf4] px-3 py-1.5 font-bold text-[#166534] hover:bg-[#dcfce7]"
                    >
                      📲 Botão WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => insertTag('<h2 class="text-2xl font-black text-black tracking-tight mt-6 mb-3">Título da Pauta</h2>')}
                      className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-1.5 font-bold text-[#344054] hover:bg-gray-100"
                    >
                      📌 Título de Pauta
                    </button>
                  </div>
                </div>

                {/* Editor HTML Livre */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#344054] mb-1">
                    Conteúdo em HTML Livre (Visual estilo Newsletter)
                  </label>
                  <textarea
                    rows={12}
                    value={editingArticle.content_html || ""}
                    onChange={(e) => setEditingArticle({ ...editingArticle, content_html: e.target.value })}
                    className="w-full rounded-xl border border-[#d0d5dd] p-4 text-sm font-mono leading-relaxed focus:outline-none focus:border-[#6366f1]"
                  />
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
                    className="rounded-full bg-[#6366f1] px-6 py-2.5 text-sm font-black text-white hover:bg-[#4f46e5]"
                  >
                    Salvar Edição
                  </button>
                </div>
              </form>
            ) : (
              /* Aba de Preview ao Vivo no formato The News */
              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-[#eaecf0] bg-[#f8f9fa] p-4">
                  <NewsletterRenderer
                    title={editingArticle.title}
                    subtitle={editingArticle.description}
                    category={editingArticle.category}
                    readTime={`${editingArticle.reading_minutes} min`}
                    contentHtml={editingArticle.content_html}
                    quote={editingArticle.age_summary}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setModalTab("edit")}
                    className="rounded-full bg-[#6366f1] px-6 py-2.5 text-sm font-black text-white hover:bg-[#4f46e5]"
                  >
                    Voltar para Edição
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
