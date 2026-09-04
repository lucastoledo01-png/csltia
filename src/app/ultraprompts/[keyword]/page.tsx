import Link from "next/link";
import { notFound } from "next/navigation";
import { UltraPromptLeadForm } from "@/components/UltraPromptLeadForm";
import { loadLandingCampaign, recordFunnelEvent } from "@/lib/server/prompt-system/landing";
import { validateKeyword } from "@/lib/prompt-system/keyword";
import { MARCA } from "@/lib/marca";

/**
 * Landing da etapa 10 — uma rota, todas as campanhas.
 *
 * O conteúdo vem do registro da campanha, então publicar um post novo não
 * exige deploy. Campanha não publicada devolve 404: a keyword é curta e
 * memorável de propósito, e servir a landing de um rascunho vazaria conteúdo
 * que ainda não foi ao ar para quem chutasse a palavra.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ keyword: string }> };

export async function generateMetadata({ params }: Props) {
  const { keyword } = await params;
  const campanha = await loadLandingCampaign(keyword);
  if (!campanha) return { title: `UltraPrompts · ${MARCA.nome}` };

  const titulo = campanha.concept?.hook || campanha.theme || "Os prompts deste post";
  return {
    title: `${titulo} · ${MARCA.nome}`,
    description: campanha.concept?.concept || "Receba os prompts exatos usados no post.",
    // A landing é destino de link de Direct, não de busca — indexá-la só
    // espalharia páginas de campanhas encerradas.
    robots: { index: false, follow: false },
  };
}

export default async function UltraPromptLanding({ params }: Props) {
  const { keyword: keywordCrua } = await params;
  const validation = validateKeyword(keywordCrua);
  if (!validation.ok) notFound();

  const campanha = await loadLandingCampaign(validation.keyword);
  if (!campanha) notFound();

  await recordFunnelEvent(campanha.id, "lp_view", { keyword: campanha.keyword });

  const hook = campanha.concept?.hook?.trim();
  const titulo = hook || campanha.theme || "Os prompts deste post";
  const descricao =
    campanha.concept?.concept?.trim() ||
    "Preencha abaixo e receba na hora os prompts exatos que geraram os resultados do post — com as instruções do que trocar para adaptar ao seu caso.";
  const aplicacoes = campanha.concept?.applications ?? [];
  const previas = campanha.assets.filter((a) => a.imageUrl).slice(0, 3);

  return (
    <main className="the-news-shell">
      <div className="mx-auto min-h-screen max-w-3xl px-5 py-16">
        <div className="mb-14 flex items-center justify-between text-sm">
          <Link className="font-sans text-xl font-bold tracking-[-0.03em] text-black" href="/">
            {MARCA.nome}
          </Link>
          <span className="rounded-full bg-black px-3 py-1 font-mono text-[11px] font-bold tracking-[0.14em] text-white">
            {campanha.keyword}
          </span>
        </div>

        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff4a1c]">
            Você comentou {campanha.keyword}
          </p>
          <h1 className="mt-4 text-[clamp(2.6rem,7vw,4.5rem)] font-black leading-[0.95] tracking-[-0.06em] text-black">
            {titulo}
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg leading-8 text-[#667085]">{descricao}</p>
        </header>

        {previas.length > 0 ? (
          <section className="mt-12 grid grid-cols-3 gap-3">
            {previas.map((asset) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={asset.label}
                src={asset.imageUrl ?? ""}
                alt={asset.label}
                className="aspect-[3/4] w-full rounded-2xl border border-black/10 object-cover"
              />
            ))}
          </section>
        ) : null}

        <section className="mt-12">
          <UltraPromptLeadForm keyword={campanha.keyword} />
        </section>

        {aplicacoes.length > 0 ? (
          <section className="mt-16 border-y border-black py-8">
            <h2 className="text-2xl font-black tracking-[-0.04em] text-black">o que dá pra fazer com isso</h2>
            <ul className="mt-5 space-y-3 leading-7 text-[#667085]">
              {aplicacoes.slice(0, 6).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
