"use client";

import { useEffect, useState } from "react";

type CommentItem = {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
};

export function ArticleComments({ articleSlug }: { articleSlug: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    async function loadComments() {
      try {
        const res = await fetch(`/api/comments?slug=${encodeURIComponent(articleSlug)}`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.comments)) {
          setComments(json.comments);
        }
      } catch (err) {
        console.error("Erro ao carregar comentarios:", err);
      }
    }

    loadComments();
  }, [articleSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !content.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleSlug,
          userName: name,
          userEmail: email,
          content,
        }),
      });

      const json = await res.json();

      if (json.ok && json.comment) {
        setMessage({ text: "Comentário publicado com sucesso!", type: "success" });
        setComments((prev) => [json.comment, ...prev]);
        setContent("");
      } else {
        setMessage({ text: json.error || "Erro ao publicar comentário.", type: "error" });
      }
    } catch (err) {
      setMessage({ text: "Falha na conexão ao enviar comentário.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-16 border-t border-[#e5e7eb] pt-10">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-black tracking-[-0.04em] text-black">
          comentários <span className="ml-2 font-mono text-base font-normal text-[#ff4a1c]">({comments.length})</span>
        </h3>
      </div>

      {/* Formulário de Envio */}
      <form onSubmit={handleSubmit} className="mt-6 rounded-[28px] border border-[#d0d5dd] bg-[#fafafa] p-6 shadow-sm">
        <h4 className="text-lg font-bold text-black">Deixe seu comentário</h4>
        <p className="mt-1 text-sm text-[#667085]">Participe da conversa ou compartilhe seu teste sobre este tema.</p>

        {message ? (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${message.type === "success" ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#fce8e6] text-[#c5221f]"}`}>
            {message.text}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Seu Nome</label>
            <input
              type="text"
              required
              placeholder="ex: Maria Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm focus:border-[#ff4a1c] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Seu E-mail</label>
            <input
              type="email"
              required
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm focus:border-[#ff4a1c] focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#344054]">Comentário</label>
          <textarea
            required
            rows={3}
            placeholder="O que você achou desta notícia ou como aplicou isso na sua rotina?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm focus:border-[#ff4a1c] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-full bg-[#ff4a1c] px-6 py-2.5 text-sm font-black text-white hover:bg-[#e03e13] disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Publicar Comentário"}
        </button>
      </form>

      {/* Lista de Comentários */}
      <div className="mt-8 space-y-4">
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#667085]">Nenhum comentário publicado ainda. Seja o primeiro a comentar!</p>
        ) : (
          comments.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[#eaecf0] bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-black">{item.user_name}</span>
                <span className="text-xs text-[#98a2b3]">
                  {new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-3 text-base leading-relaxed text-[#344054]">{item.content}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
