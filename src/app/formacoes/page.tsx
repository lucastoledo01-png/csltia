import Link from "next/link";

export default function FormacoesPage() {
  return (
    <main className="the-news-shell">
      <section className="mx-auto min-h-screen max-w-4xl px-5 py-16">
        <Link className="font-black tracking-[-0.05em]" href="/">Casaloti IA</Link>
        <h1 className="mt-20 text-[clamp(3.5rem,9vw,6rem)] font-black leading-[0.9] tracking-[-0.08em]">Formações</h1>
        <p className="mt-8 max-w-2xl text-2xl leading-9 text-[#667085]">
          Aulas para aprender IA com calma, humor e prática. Nada de guru, nada de palestra mofada.
        </p>
      </section>
    </main>
  );
}
