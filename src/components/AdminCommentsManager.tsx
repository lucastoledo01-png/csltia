"use client";

import { useEffect, useState } from "react";

type CommentRecord = {
  id: string;
  article_slug: string;
  user_name: string;
  user_email: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export function AdminCommentsManager() {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "approved" | "rejected">("all");

  async function loadComments() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/comments");
      const json = await res.json();
      if (json.ok && Array.isArray(json.comments)) {
        setComments(json.comments);
      }
    } catch (err) {
      console.error("Erro ao carregar comentarios admin:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComments();
  }, []);

  async function updateStatus(id: string, newStatus: "approved" | "rejected") {
    try {
      const res = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setComments((prev) => prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item)));
      }
    } catch (err) {
      console.error("Erro ao atualizar status do comentario:", err);
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("Tem certeza que deseja excluir este comentário permanentemente?")) return;

    try {
      const res = await fetch(`/api/admin/comments?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setComments((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error("Erro ao deletar comentario:", err);
    }
  }

  const filteredComments = comments.filter((c) => (filter === "all" ? true : c.status === filter));

  if (loading) {
    return <div className="py-12 text-center text-sm text-[#667085]">Carregando comentários para moderação...</div>;
  }

  return (
    <div className="rounded-[28px] border border-[#d0d5dd] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black tracking-[-0.05em] text-black">Moderação de Comentários</h3>
          <p className="mt-1 text-sm text-[#667085]">Gerencie mensagens enviadas pelos leitores nos artigos.</p>
        </div>

        <div className="flex rounded-full border border-[#d0d5dd] bg-[#fafafa] p-1 text-xs font-bold">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-4 py-1.5 ${filter === "all" ? "bg-[#ff4a1c] text-white" : "text-[#667085]"}`}
          >
            Todos ({comments.length})
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`rounded-full px-4 py-1.5 ${filter === "approved" ? "bg-[#ff4a1c] text-white" : "text-[#667085]"}`}
          >
            Aprovados ({comments.filter((c) => c.status === "approved").length})
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`rounded-full px-4 py-1.5 ${filter === "rejected" ? "bg-[#ff4a1c] text-white" : "text-[#667085]"}`}
          >
            Recusados ({comments.filter((c) => c.status === "rejected").length})
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {filteredComments.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#667085]">Nenhum comentário encontrado neste filtro.</p>
        ) : (
          filteredComments.map((comment) => (
            <div key={comment.id} className="rounded-2xl border border-[#eaecf0] p-5 hover:border-[#d0d5dd]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-black">{comment.user_name}</span>
                  <span className="ml-2 text-xs text-[#667085]">({comment.user_email})</span>
                  <span className="ml-3 rounded-md bg-[#f2f4f7] px-2 py-0.5 font-mono text-xs text-[#344054]">
                    artigo: /{comment.article_slug}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    comment.status === "approved" ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#fce8e6] text-[#c5221f]"
                  }`}
                >
                  {comment.status}
                </span>
              </div>

              <p className="mt-3 text-sm text-[#344054]">{comment.content}</p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#f2f4f7] pt-3 text-xs">
                <span className="text-[#98a2b3]">
                  {new Date(comment.created_at).toLocaleString("pt-BR")}
                </span>

                <div className="flex items-center gap-2">
                  {comment.status !== "approved" ? (
                    <button
                      onClick={() => updateStatus(comment.id, "approved")}
                      className="rounded-lg bg-[#e6f4ea] px-3 py-1 font-bold text-[#137333] hover:bg-[#ceead6]"
                    >
                      Aprovar
                    </button>
                  ) : null}

                  {comment.status !== "rejected" ? (
                    <button
                      onClick={() => updateStatus(comment.id, "rejected")}
                      className="rounded-lg bg-[#fce8e6] px-3 py-1 font-bold text-[#c5221f] hover:bg-[#fad2cf]"
                    >
                      Rejeitar
                    </button>
                  ) : null}

                  <button
                    onClick={() => deleteComment(comment.id)}
                    className="rounded-lg border border-[#d0d5dd] px-3 py-1 font-bold text-[#667085] hover:bg-[#f9fafb]"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
