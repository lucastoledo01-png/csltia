import Link from "next/link";
import { AdminArticleForm } from "@/components/AdminArticleForm";

const dashboardCards = [
  {
    title: "artigos",
    body: "criar rascunho novo, editar SEO, AEO, AGE, fontes e status de publicação.",
  },
  {
    title: "revisão humana",
    body: "a automação pode preparar o texto, mas o painel segura publicação quando faltar fonte, contexto ou clareza.",
  },
  {
    title: "Listmonk",
    body: "leads que entram pela home seguem para Supabase e depois para a lista configurada no Listmonk.",
  },
];

function AdminDashboard() {
  return (
    <main className="the-news-shell">
      <section className="mx-auto min-h-screen max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#ff4a1c]">/admin</p>
            <h1 className="mt-4 text-[clamp(3rem,8vw,5.5rem)] font-black leading-[0.92] tracking-[-0.08em] text-black">gestao de artigos</h1>
          </div>
          <Link className="rounded-full border border-black px-5 py-3 text-sm font-black" href="/">ver site</Link>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {dashboardCards.map((card) => (
            <article className="rounded-[28px] border border-[#d0d5dd] bg-white p-6" key={card.title}>
              <h2 className="text-2xl font-black tracking-[-0.05em]">{card.title}</h2>
              <p className="mt-4 leading-7 text-[#667085]">{card.body}</p>
            </article>
          ))}
        </div>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ff4a1c]">rascunho novo</p>
              <h2 className="mt-2 text-4xl font-black tracking-[-0.06em] text-black">editor simples</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#667085]">Base inspirada no fluxo de CMS do mx-space/core, sem copiar código: rascunho, revisão, SEO, AEO, AGE e publicação manual.</p>
          </div>
          <AdminArticleForm />
        </section>
      </section>
    </main>
  );
}

export default async function AdminPage() {
  return <AdminDashboard />;
}
