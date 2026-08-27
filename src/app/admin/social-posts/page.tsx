"use client";
import { useEffect, useState } from "react";

type Post = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "published" | "failed";
  error_message: string | null;
  slide_count: number;
};

export default function SocialPostsCalendar() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/admin/social-posts");
      if (res.ok) {
        setPosts(await res.json());
      }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-4">Carregando...</div>;

  const statusColor = {
    scheduled: "bg-blue-100 text-blue-800",
    published: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  const statusLabel = {
    scheduled: "Agendado",
    published: "Publicado",
    failed: "Falhou",
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Posts do Instagram</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {posts.map((post) => (
          <div key={post.id} className="border rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div className="text-sm text-gray-500">
                {new Date(post.scheduled_at).toLocaleString("pt-BR")}
              </div>
              <span
                className={`px-2 py-1 rounded text-sm font-medium ${
                  statusColor[post.status]
                }`}
              >
                {statusLabel[post.status]}
              </span>
            </div>
            <div className="text-xs text-gray-500">{post.slide_count} slides</div>
            {post.error_message && (
              <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                {post.error_message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
