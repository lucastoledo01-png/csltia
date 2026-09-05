"use client";

import { useEffect, useState } from "react";

type CommentItem = {
  id: string;
  user_name: string;
  content: string;
  created_at: string;
  likes: number;
  dislikes: number;
};

export function ArticleComments({ articleSlug }: { articleSlug: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

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

  useEffect(() => {
    loadComments();
  }, [articleSlug]);

  async function handleVote(commentId: string, type: "like" | "dislike") {
    try {
      const res = await fetch("/api/comments/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, type }),
      });
      const json = await res.json();

      if (json.ok) {
        setComments((prev) =>
          prev
            .map((item) =>
              item.id === commentId ? { ...item, likes: json.likes, dislikes: json.dislikes } : item
            )
            .sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes))
        );
      }
    } catch (err) {
      console.error("Erro ao computar voto:", err);
    }
  }

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
          comentários dos leitores <span className="ml-2 font-mono text-base font-normal text-[#E4344A]">({comments.length})</span>
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
              className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm focus:border-[#E4344A] focus:outline-none"
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
              className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm focus:border-[#E4344A] focus:outline-none"
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
            className="mt-1.5 w-full rounded-xl border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm focus:border-[#E4344A] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-full bg-[#E4344A] px-6 py-2.5 text-sm font-black text-white hover:bg-[#e03e13] disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Publicar Comentário"}
        </button>
      </form>

      {/* Lista de Comentários Ranqueados */}
      <div className="mt-8 space-y-4">
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#667085]">Nenhum comentário publicado ainda. Seja o primeiro a comentar!</p>
        ) : (
          comments.map((item) => {
            const score = (item.likes || 0) - (item.dislikes || 0);

            return (
              <article key={item.id} className="rounded-2xl border border-[#eaecf0] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-black">{item.user_name}</span>
                    {score >= 3 ? (
                      <span className="rounded-md bg-[#fffde7] px-2 py-0.5 text-[10px] font-black uppercase text-[#854d0e] border border-[#fef08a]">
                        🔥 Em Destaque
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-[#98a2b3]">
                    {new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="mt-3 text-base leading-relaxed text-[#344054]">{item.content}</p>

                {/* Votação Like e Dislike */}
                <div className="mt-4 flex items-center justify-between border-t border-[#f2f4f7] pt-3 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleVote(item.id, "like")}
                      className="flex items-center gap-1.5 rounded-full border border-[#d0d5dd] bg-[#fafafa] px-3 py-1 font-bold text-[#344054] hover:bg-[#e6f4ea] hover:text-[#137333] transition-colors"
                    >
                      👍 {item.likes || 0}
                    </button>
                    <button
                      onClick={() => handleVote(item.id, "dislike")}
                      className="flex items-center gap-1.5 rounded-full border border-[#d0d5dd] bg-[#fafafa] px-3 py-1 font-bold text-[#344054] hover:bg-[#fce8e6] hover:text-[#c5221f] transition-colors"
                    >
                      👎 {item.dislikes || 0}
                    </button>
                  </div>

                  <span className="font-mono text-xs font-semibold text-[#667085]">
                    Saldo: <strong className={score > 0 ? "text-[#12b76a]" : score < 0 ? "text-[#b42318]" : "text-black"}>{score > 0 ? `+${score}` : score}</strong>
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
