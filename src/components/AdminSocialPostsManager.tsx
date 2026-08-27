"use client";

import { useEffect, useState } from "react";

type Post = {
  id: string;
  scheduled_at: string;
  published_at: string | null;
  status: "scheduled" | "published" | "failed";
  error_message: string | null;
  title: string | null;
  caption: string | null;
  platform: string | null;
  post_type: string | null;
  slide_count: number;
  cover_url: string | null;
};

const STATUS_STYLE: Record<Post["status"], string> = {
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};

const STATUS_LABEL: Record<Post["status"], string> = {
  scheduled: "Agendado",
  published: "Publicado",
  failed: "Falhou",
};

export function AdminSocialPostsManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/admin/social-posts");
      if (res.ok) setPosts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando publicações de hoje...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="admin-glass rounded-3xl p-8 text-center text-sm text-slate-500">
        Nenhuma publicação agendada para hoje ainda. A redação roda todo dia às 06:03 (horário de Brasília).
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="admin-glass rounded-3xl p-6">
        <h3 className="text-2xl text-slate-900">Publicações do Instagram — Hoje</h3>
        <p className="mt-1 text-sm text-slate-500">
          {posts.filter((p) => p.status === "published").length} publicadas · {" "}
          {posts.filter((p) => p.status === "scheduled").length} agendadas · {" "}
          {posts.filter((p) => p.status === "failed").length} falharam
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => (
          <div key={post.id} className="admin-glass overflow-hidden rounded-3xl">
            <div className="relative aspect-[4/5] w-full bg-slate-100">
              {post.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover_url} alt={post.title ?? "Slide de capa"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-400">
                  Sem imagem gerada
                </div>
              )}
              <span
                className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold ${STATUS_STYLE[post.status]}`}
              >
                {STATUS_LABEL[post.status]}
              </span>
            </div>

            <div className="space-y-2 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                {post.slide_count} slides · {new Date(post.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <h4 className="line-clamp-2 text-base font-bold text-slate-900">
                {post.title || "(sem título ainda)"}
              </h4>
              {post.caption ? (
                <p className="line-clamp-3 text-sm text-slate-600">{post.caption}</p>
              ) : (
                <p className="text-sm italic text-slate-400">Legenda ainda não gerada.</p>
              )}
              {post.error_message ? (
                <div className="mt-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{post.error_message}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
