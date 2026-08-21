"use client";

import { FormEvent, useState } from "react";

export function AdminArticleForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "review" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");

    const form = new FormData(event.currentTarget);
    const sections = [
      {
        heading: String(form.get("sectionHeading") ?? "").trim(),
        paragraphs: String(form.get("body") ?? "")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    ];

    const response = await fetch("/api/admin/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title") ?? "").trim(),
        slug: String(form.get("slug") ?? "").trim(),
        description: String(form.get("description") ?? "").trim(),
        excerpt: String(form.get("excerpt") ?? "").trim(),
        status: form.get("status"),
        category: String(form.get("category") ?? "ia"),
        tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        sourceUrls: String(form.get("sourceUrls") ?? "").split("\n").map((url) => url.trim()).filter(Boolean),
        seoTitle: String(form.get("seoTitle") ?? "").trim(),
        seoDescription: String(form.get("seoDescription") ?? "").trim(),
        aeoQuestions: [
          {
            question: String(form.get("aeoQuestion") ?? "").trim(),
            answer: String(form.get("aeoAnswer") ?? "").trim(),
          },
        ],
        ageSummary: String(form.get("ageSummary") ?? "").trim(),
        sections,
      }),
    });

    if (response.status === 422) {
      setStatus("review");
      return;
    }

    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <form className="mt-8 grid gap-4 rounded-[28px] border border-[#d0d5dd] bg-white p-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Titulo
          <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="title" placeholder="IA no trabalho sem palestra chata" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Slug
          <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="slug" placeholder="ia-no-trabalho" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Categoria
          <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" defaultValue="Radar" name="category" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Status
          <select className="rounded-2xl border border-[#d0d5dd] px-4 py-3" defaultValue="draft" name="status">
            <option value="draft">rascunho novo</option>
            <option value="scheduled">agendado</option>
            <option value="published">publicado</option>
            <option value="archived">arquivado</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Descricao
        <textarea className="min-h-20 rounded-2xl border border-[#d0d5dd] px-4 py-3" name="description" required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Resumo curto
        <textarea className="min-h-20 rounded-2xl border border-[#d0d5dd] px-4 py-3" name="excerpt" required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        SEO title
        <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="seoTitle" required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        SEO description
        <textarea className="min-h-20 rounded-2xl border border-[#d0d5dd] px-4 py-3" name="seoDescription" required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Resumo AGE
        <textarea className="min-h-24 rounded-2xl border border-[#d0d5dd] px-4 py-3" name="ageSummary" required />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Pergunta AEO
          <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="aeoQuestion" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Resposta AEO
          <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="aeoAnswer" />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Fontes, uma por linha
        <textarea className="min-h-20 rounded-2xl border border-[#d0d5dd] px-4 py-3" name="sourceUrls" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Tags separadas por virgula
        <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="tags" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Titulo da secao
        <input className="rounded-2xl border border-[#d0d5dd] px-4 py-3" name="sectionHeading" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Corpo do artigo
        <textarea className="min-h-40 rounded-2xl border border-[#d0d5dd] px-4 py-3" name="body" />
      </label>
      <button className="cta-gradient rounded-full px-6 py-3 font-black text-white disabled:opacity-70" disabled={status === "saving"} type="submit">
        {status === "saving" ? "salvando" : "salvar artigo"}
      </button>
      <p className="text-sm text-[#667085]" role="status">
        {status === "saved" ? "artigo salvo no Supabase" : null}
        {status === "review" ? "artigo salvo como revisão: faltam checks antes de publicar" : null}
        {status === "error" ? "nao consegui salvar agora" : null}
      </p>
    </form>
  );
}
