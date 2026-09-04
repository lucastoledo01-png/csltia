import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CopiarPrompt } from "@/components/CopiarPrompt";
import { getAdminSessionSecret } from "@/lib/server/env";
import { loadLandingCampaign, recordFunnelEvent } from "@/lib/server/prompt-system/landing";
import { materialCookieName, verifyMaterialAccess } from "@/lib/server/prompt-system/material-gate";
import { validateKeyword } from "@/lib/prompt-system/keyword";
import { MARCA } from "@/lib/marca";

/**
 * Entrega da etapa 12, atrás do cookie assinado emitido na captura.
 *
 * Quem chega sem acesso vai para a landing em vez de ver um erro: a pessoa
 * provavelmente salvou o link do Direct e abriu noutro aparelho, e o caminho
 * dela é se cadastrar, não entender um 403.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ keyword: string }> };

export const metadata = {
  title: `Seu material · ${MARCA.nome}`,
  robots: { index: false, follow: false },
};

export default async function MaterialPage({ params }: Props) {
  const { keyword: keywordCrua } = await params;
  const validation = validateKeyword(keywordCrua);
  if (!validation.ok) notFound();
  const keyword = validation.keyword;

  const campanha = await loadLandingCampaign(keyword);
  if (!campanha) notFound();

  let liberado = false;
  try {
    const jar = await cookies();
    liberado = verifyMaterialAccess(
      getAdminSessionSecret(),
      jar.get(materialCookieName(keyword))?.value,
      keyword,
    );
  } catch {
    // Segredo ausente é falha de configuração: fecha, não abre.
    liberado = false;
  }

  if (!liberado) redirect(`/ultraprompts/${keyword}`);

  await recordFunnelEvent(campanha.id, "delivery", { keyword });

  return (
    <main className="the-news-shell">
      <div className="mx-auto min-h-screen max-w-3xl px-5 py-16">
        <div className="mb-14 flex items-center justify-between text-sm">
          <Link className="font-sans text-xl font-bold tracking-[-0.03em] text-black" href="/">
            {MARCA.nome}
          </Link>
          <span className="rounded-full bg-black px-3 py-1 font-mono text-[11px] font-bold tracking-[0.14em] text-white">
            {keyword}
          </span>
        </div>

        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ff4a1c]">Liberado</p>
          <h1 className="mt-4 text-[clamp(2.4rem,6vw,3.8rem)] font-black leading-[0.95] tracking-[-0.06em] text-black">
            {campanha.theme || "Seus prompts"}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#667085]">
            Estes são os prompts exatos que geraram os resultados do post. Copie, troque o que está
            indicado e rode.
          </p>
        </header>

        {campanha.assets.length === 0 ? (
          <p className="mt-14 rounded-2xl border border-black/10 bg-white px-6 py-8 text-center text-[#667085]">
            O material desta campanha ainda está sendo preparado. Você já está na lista — assim que
            sair, chega no seu e-mail.
          </p>
        ) : (
          <section className="mt-14 space-y-10">
            {campanha.assets.map((asset) => (
              <article key={asset.label} className="border-t border-black pt-8">
                <h2 className="font-mono text-sm font-bold uppercase tracking-[0.16em] text-black">
                  {asset.label}
                </h2>

                {asset.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.imageUrl}
                    alt={asset.label}
                    className="mt-5 w-full rounded-2xl border border-black/10 object-cover"
                  />
                ) : null}

                {/*
                  Crédito da foto de base. Aparece só quando o provedor exige —
                  hoje o Unsplash, cujas API Guidelines pedem o nome do
                  fotógrafo e o link de volta ao perfil. O post não credita; a
                  entrega credita, e é aqui que a foto de base interessa a quem
                  vai reproduzir.
                */}
                {asset.credito ? (
                  <p className="mt-2 text-xs text-[#98a2b3]">
                    {asset.credito.fotografoUrl ? (
                      <a
                        className="underline decoration-black/20 hover:text-black"
                        href={asset.credito.fotografoUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {asset.credito.texto}
                      </a>
                    ) : (
                      asset.credito.texto
                    )}
                  </p>
                ) : null}

                <CopiarPrompt texto={asset.promptText} />

                {asset.substitutionNotes ? (
                  <p className="mt-4 text-sm leading-6 text-[#667085]">
                    <strong className="font-bold text-black">O que trocar:</strong>{" "}
                    {asset.substitutionNotes}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
