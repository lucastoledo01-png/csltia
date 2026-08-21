"use client";

import Image from "next/image";
import { useState } from "react";

type SubstackArticleRendererProps = {
  title: string;
  subtitle?: string;
  date?: string;
  category?: string;
  readTime?: string;
  coverImage?: string | null;
  contentHtml?: string;
  sections?: Array<{ heading: string; paragraphs: string[] }>;
  quote?: string;
  quoteBy?: string;
  author?: string;
};

export function SubstackArticleRenderer({
  title,
  subtitle,
  date = "20 de Agosto de 2026",
  category = "Radar",
  readTime = "5 min",
  coverImage,
  contentHtml,
  sections,
  quote,
  quoteBy = "Casaloti",
  author = "Casaloti Editorial",
}: SubstackArticleRendererProps) {
  const [pollVoted, setPollVoted] = useState<string | null>(null);

  const whatsappShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `Confira esta leitura no Casaloti IA: ${title}`
  )}`;

  return (
    <article className="mx-auto max-w-[680px] bg-white px-4 py-6 text-[#111827] sm:px-0">
      {/* 1. Header Estilo Substack */}
      <header className="border-b border-[#f3f4f6] pb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#ff4a1c]">
          <span>{category}</span>
          <span className="text-gray-300">•</span>
          <span className="text-[#6b7280] font-normal lowercase">{readTime} de leitura</span>
        </div>

        {/* Título Principal Clean */}
        <h1 className="mt-3 font-serif text-3xl font-bold leading-snug tracking-tight text-[#111827] sm:text-4xl">
          {title}
        </h1>

        {/* Subtítulo / Resumo */}
        {subtitle ? (
          <p className="mt-3 text-lg leading-relaxed text-[#4b5563] font-normal">{subtitle}</p>
        ) : null}

        {/* Avatar e Meta do Autor */}
        <div className="mt-6 flex items-center justify-between border-t border-[#f3f4f6] pt-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff4a1c] font-mono text-sm font-bold text-white shadow-sm">
              C
            </div>
            <div>
              <p className="font-semibold text-[#111827]">{author}</p>
              <p className="text-[#6b7280]">{date}</p>
            </div>
          </div>

          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-1.5 font-medium text-[#374151] transition-colors hover:bg-gray-100"
          >
            <span>Compartilhar</span>
          </a>
        </div>
      </header>

      {/* 2. Capa Principal Fotográfica */}
      {coverImage ? (
        <figure className="my-8">
          <div className="overflow-hidden rounded-2xl border border-[#eaecf0]">
            <Image
              alt={title}
              src={coverImage}
              width={1200}
              height={720}
              priority
              className="aspect-[16/9] h-auto w-full object-cover"
            />
          </div>
        </figure>
      ) : null}

      {/* 3. Destaque de Citação */}
      {quote ? (
        <blockquote className="my-8 rounded-r-xl border-l-4 border-[#ff4a1c] bg-[#fafafa] p-5 font-serif text-lg italic text-[#1f2937]">
          <p>{`"${quote}"`}</p>
          <footer className="mt-2 font-sans text-xs font-semibold not-italic text-[#6b7280]">
            — {quoteBy}
          </footer>
        </blockquote>
      ) : null}

      {/* 4. Corpo do Artigo em HTML Fluido ou Seções */}
      {contentHtml && contentHtml.trim().length > 0 ? (
        <div
          className="prose prose-neutral max-w-none text-base leading-relaxed text-[#374151] prose-headings:font-serif prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-[#111827] prose-a:text-[#ff4a1c] prose-a:no-underline hover:prose-a:underline my-6"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      ) : (
        <div className="my-6 space-y-8">
          {sections?.map((sec, idx) => (
            <section key={idx} className="space-y-3">
              <h2 className="font-serif text-2xl font-bold tracking-tight text-[#111827]">{sec.heading}</h2>
              <div className="space-y-4 text-base leading-relaxed text-[#374151]">
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 5. Módulo de Interação de Leitura */}
      <div className="my-10 border-t border-b border-[#f3f4f6] py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
          O que você achou desta edição?
        </p>

        {pollVoted ? (
          <div className="mt-3 rounded-lg bg-[#f0fdf4] p-3 text-xs font-semibold text-[#166534]">
            Obrigado pela sua opinião! ({pollVoted})
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-medium">
            <button
              onClick={() => setPollVoted("Excelente")}
              className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[#374151] hover:border-[#ff4a1c] hover:bg-[#fff5f2] transition-colors"
            >
              💡 Excelente
            </button>
            <button
              onClick={() => setPollVoted("Útil")}
              className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[#374151] hover:border-[#ff4a1c] hover:bg-[#fff5f2] transition-colors"
            >
              👍 Útil
            </button>
            <button
              onClick={() => setPollVoted("Pode melhorar")}
              className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[#374151] hover:border-[#ff4a1c] hover:bg-[#fff5f2] transition-colors"
            >
              🤔 Pode melhorar
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
