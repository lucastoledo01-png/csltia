"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type NewsletterRendererProps = {
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
};

export function NewsletterRenderer({
  title,
  subtitle,
  date = "QUINTA-FEIRA, 25 DE AGOSTO DE 2026",
  category = "Radar",
  readTime = "5 min",
  coverImage,
  contentHtml,
  sections,
  quote,
  quoteBy = "desbuguei.ia",
}: NewsletterRendererProps) {
  const [pollVoted, setPollVoted] = useState<string | null>(null);

  const whatsappShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `Confira esta edição da desbuguei.ia: ${title}`
  )}`;

  return (
    <article className="mx-auto max-w-2xl bg-white px-4 py-8 text-black sm:px-6 md:py-12 shadow-[0_4px_30px_rgba(0,0,0,0.03)] rounded-[32px] border border-[#eaecf0]">
      {/* 1. Header estilo desbuguei.ia */}
      <header className="border-b border-[#eaecf0] pb-8 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[#fef3c7] px-4 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#92400e]">
          <span>{category}</span> • <span>{readTime} DE LEITURA</span>
        </div>

        {/* Brand Logo Header */}
        <div className="mt-6 flex justify-center">
          <div className="rounded-2xl bg-[#ff4a1c] px-6 py-2 shadow-lg shadow-[#ff4a1c]/20">
            <span className="font-mono text-3xl font-black lowercase tracking-tighter text-white sm:text-4xl">
              b. <span className="text-[#fef08a]">/ desbuguei.ia</span>
            </span>
          </div>
        </div>

        <h1 className="mt-6 text-[clamp(2rem,7vw,3.5rem)] font-black leading-[0.95] tracking-[-0.07em] text-black">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-4 text-base leading-relaxed text-[#4b5563] sm:text-lg">{subtitle}</p>
        ) : null}

        {/* Banner de Data em Caixa Alta */}
        <div className="mt-6 inline-block rounded-xl border border-[#d0d5dd] bg-[#fafafa] px-5 py-2 font-mono text-xs font-black tracking-widest text-[#344054]">
          {date.toUpperCase()}
        </div>
      </header>

      {/* 2. Bloco EM 60 SEGUNDOS */}
      <section className="my-8 rounded-[24px] border border-[#fef08a] bg-[#fffde7] p-6 shadow-sm">
        <h2 className="font-mono text-xs font-black uppercase tracking-[0.18em] text-[#854d0e]">
          ⚡ EM 60 SEGUNDOS
        </h2>
        <div className="mt-3 space-y-2 text-sm font-medium text-[#344054]">
          <p>
            <mark className="bg-[#fef08a] px-1 font-bold text-black">O radar desbugado de IA</mark>: As principais novidades de modelos, ferramentas e automação filtradas para você testar no mesmo dia.
          </p>
        </div>
      </section>

      {/* Capa Principal da Edição */}
      {coverImage ? (
        <div className="my-8 overflow-hidden rounded-[28px] border border-[#eaecf0]">
          <Image
            alt={title}
            src={coverImage}
            width={1200}
            height={720}
            priority
            className="aspect-[5/3] h-auto w-full object-cover"
          />
        </div>
      ) : null}

      {/* Citação Destacada */}
      {quote ? (
        <blockquote className="my-8 rounded-2xl border-l-4 border-[#ff4a1c] bg-[#fafafa] p-6 text-xl font-black italic text-black">
          <p>{`"${quote}"`}</p>
          <footer className="mt-3 font-mono text-xs font-bold uppercase tracking-wider text-[#667085]">
            — {quoteBy}
          </footer>
        </blockquote>
      ) : null}

      {/* 3. Conteúdo Principal da Edição */}
      {contentHtml && contentHtml.trim().length > 0 ? (
        <div
          className="prose prose-lg max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-[#ff4a1c] prose-[#344054] my-8 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      ) : (
        <div className="my-8 space-y-8">
          {sections?.map((sec, idx) => (
            <section key={idx} className="space-y-4">
              <h2 className="text-2xl font-black text-black tracking-tight">{sec.heading}</h2>
              <div className="space-y-4 text-base md:text-lg leading-relaxed text-[#344054]">
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{p}</p>
                ))}
              </div>

              <div className="pt-2">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#25d366]/40 bg-[#f0fdf4] px-4 py-2 text-xs font-bold text-[#166534] hover:bg-[#dcfce7] transition-colors"
                >
                  <span>📲 Compartilhe essa notícia no WhatsApp</span>
                </a>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Botão de Compartilhamento no WhatsApp Geral */}
      <div className="my-10 text-center">
        <a
          href={whatsappShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-8 py-3.5 text-sm font-black text-white shadow-lg shadow-[#25d366]/25 hover:bg-[#20bd5a] transition-all"
        >
          <span>Compartilhe essa edição no WhatsApp 📲</span>
        </a>
      </div>

      {/* 4. Termômetro de Opinião */}
      <section className="my-10 rounded-[28px] border border-[#d0d5dd] bg-[#fafafa] p-6 text-center shadow-sm">
        <p className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#ff4a1c]">
          TERMÔMETRO DE AVALIAÇÃO
        </p>
        <h3 className="mt-2 text-xl font-black text-black">
          Na sua opinião, esta edição ajudou você a desbugar a IA?
        </h3>

        {pollVoted ? (
          <div className="mt-4 rounded-xl bg-[#e6f4ea] p-4 text-sm font-bold text-[#137333]">
            Obrigado pelo seu voto! ({pollVoted})
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-3 text-xs font-bold">
            <button
              onClick={() => setPollVoted("Sim, muito útil")}
              className="rounded-xl border border-[#d0d5dd] bg-white p-3 hover:border-[#ff4a1c] hover:bg-[#fff5f2] transition-colors"
            >
              🟢 Sim, muito útil
            </button>
            <button
              onClick={() => setPollVoted("Interessante")}
              className="rounded-xl border border-[#d0d5dd] bg-white p-3 hover:border-[#ff4a1c] hover:bg-[#fff5f2] transition-colors"
            >
              🟡 Interessante
            </button>
            <button
              onClick={() => setPollVoted("Pode melhorar")}
              className="rounded-xl border border-[#d0d5dd] bg-white p-3 hover:border-[#ff4a1c] hover:bg-[#fff5f2] transition-colors"
            >
              🔵 Pode melhorar
            </button>
          </div>
        )}
      </section>

      {/* 5. Footer da Edição */}
      <footer className="mt-12 border-t border-[#eaecf0] pt-8 text-center text-xs text-[#667085]">
        <p className="font-bold text-black">desbuguei.ia — Publicação sobre Inteligência Artificial, automação e ferramentas úteis.</p>
        <p className="mt-2">Direto na sua caixa de entrada e no portal todos os dias.</p>
      </footer>
    </article>
  );
}
