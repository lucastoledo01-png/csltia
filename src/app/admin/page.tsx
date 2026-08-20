const adminCards = [
  {
    title: "fila de artigos",
    body: "rascunhos, publicados, removidos e reaproveitados para Instagram. Aqui o Casaloti consegue editar antes de soltar no mundo.",
  },
  {
    title: "campanhas de email",
    body: "listas, segmentos, edição do disparo das 06:06, descadastro e histórico de entregas. Listmonk fica como candidato forte.",
  },
  {
    title: "dashboard de dados",
    body: "abertura, clique, artigo que virou lead, prompt que vendeu e pauta que merece voltar. Nada de voar no escuro.",
  },
];

export default function AdminPage() {
  return (
    <main className="the-news-shell">
      <section className="mx-auto min-h-screen max-w-6xl px-5 py-16">
        <p className="font-mono text-sm font-black uppercase tracking-[0.18em] text-[#ff4a1c]">/admin</p>
        <h1 className="mt-6 max-w-3xl text-[clamp(3.5rem,8vw,6rem)] font-black leading-[0.92] tracking-[-0.08em] text-black">admin casaloti</h1>
        <p className="mt-8 max-w-2xl text-2xl leading-9 text-[#667085]">
          O painel interno vai controlar artigos, emails, automação e números. A primeira versão pode usar Supabase para auth, banco e permissões.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {adminCards.map((card) => (
            <article className="rounded-[28px] border border-[#d0d5dd] bg-white p-7" key={card.title}>
              <h2 className="text-2xl font-black tracking-[-0.05em]">{card.title}</h2>
              <p className="mt-5 leading-7 text-[#667085]">{card.body}</p>
            </article>
          ))}
        </div>

        <section className="mt-12 rounded-[32px] bg-[#101010] p-8 text-white">
          <h2 className="text-3xl font-black tracking-[-0.05em]">stack sugerida</h2>
          <ul className="mt-6 grid gap-4 text-white/80 md:grid-cols-2">
            <li>Supabase para login admin, posts, fontes e métricas.</li>
            <li>Listmonk para listas, templates, segmentos e descadastro.</li>
            <li>Amazon SES para envio quando o domínio estiver aquecido.</li>
            <li>Turnstile ou hCaptcha no formulário público antes de aceitar lead real.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
