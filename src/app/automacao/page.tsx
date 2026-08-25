import Link from "next/link";
import { automationPrinciples, automationStages, safeSources } from "@/lib/automation";

export default function AutomationPage() {
  return (
    <main className="editorial-shell">
      <div className="editorial-container">
        <header className="mb-16 text-center md:mb-24">
          <div className="mb-10 flex items-center justify-between text-sm text-[var(--casaloti-secondary)]">
            <Link className="font-semibold text-[var(--casaloti-primary)]" href="/">desbuguei.ia</Link>
            <Link className="smooth-link hover:text-[var(--casaloti-primary)]" href="/artigos">Blog</Link>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--casaloti-meta)]">Sistema editorial</p>
          <h1 className="journal-title mt-4">Esteira autônoma desbuguei.ia</h1>
          <div className="mx-auto mt-6 h-1 w-20 bg-[var(--casaloti-primary)]" />
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-[var(--casaloti-secondary)]">
            Busca notícias de IA, escreve artigos, transforma em newsletter, cria publicação para Instagram e mede o resultado do ciclo.
          </p>
        </header>

        <section className="grid gap-12 md:grid-cols-[0.85fr_1.15fr]">
          <aside>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--casaloti-meta)]">Fontes confiáveis iniciais</p>
            <div className="mt-6 space-y-6">
              {safeSources.map((source) => (
                <article className="border-b border-[var(--casaloti-line)] pb-6" key={source.name}>
                  <h2 className="text-xl font-medium tracking-[-0.025em]">{source.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--casaloti-meta)]">{source.type} · risco {source.risk}</p>
                  <p className="mt-3 leading-7 text-[var(--casaloti-secondary)]">{source.purpose}</p>
                </article>
              ))}
            </div>
          </aside>

          <section aria-label="Etapas da automação" className="divide-y divide-[var(--casaloti-line)] border-y border-[var(--casaloti-line)]">
            {automationStages.map((stage, index) => (
              <article className="grid gap-4 py-8 md:grid-cols-[56px_1fr]" key={stage.name}>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--casaloti-meta)]">0{index + 1}</span>
                <div>
                  <h2 className="text-2xl font-medium tracking-[-0.025em]">{stage.name}</h2>
                  <p className="mt-3 leading-7 text-[var(--casaloti-secondary)]">Saída: {stage.output}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--casaloti-meta)]">Guardrail: {stage.guardrail}</p>
                </div>
              </article>
            ))}
          </section>
        </section>

        <section className="mt-20 border border-[var(--casaloti-border)] p-8">
          <h2 className="text-2xl font-medium tracking-[-0.025em]">Princípios de segurança</h2>
          <ul className="mt-6 grid gap-3 leading-7 text-[var(--casaloti-secondary)] md:grid-cols-2">
            {automationPrinciples.map((principle) => <li key={principle}>• {principle}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
