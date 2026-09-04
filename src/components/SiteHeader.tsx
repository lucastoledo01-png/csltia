import Link from "next/link";
import { MARCA } from "@/lib/marca";

/**
 * Menu do site.
 *
 * Só notícias e artigos. UltraPrompts e Formações saíram: eram funil e oferta
 * da vertical de IA, e item de menu que leva a uma página de outro assunto
 * custa mais confiança do que o clique que traria.
 */
const navItems = [{ href: "/artigos", label: "Artigos" }];

export function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link aria-label={MARCA.nome} className="flex items-center gap-2.5 group" href="/">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl font-mono text-sm font-black text-white shadow-sm transition-transform group-hover:scale-105"
        style={{ background: MARCA.cor }}
      >
        us
      </span>
      <span className={`font-sans text-xl font-bold tracking-tight ${dark ? "text-white" : "text-[#111827]"}`}>
        {MARCA.nomeBase}
        <span style={{ color: MARCA.cor }}>{MARCA.nomeSufixo}</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ ctaHref = "#inscrever" }: { ctaHref?: string }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 text-sm sm:px-5 md:px-8 md:py-7 md:text-base">
      <BrandMark />
      <nav aria-label="Navegação principal" className="hidden items-center gap-10 md:flex">
        {navItems.map((item) => (
          <Link className="font-medium text-black transition-colors hover:text-[#E4344A]" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className="cta-gradient rounded-full px-4 py-3 font-semibold text-white shadow-[0_12px_24px_rgba(228,52,74,0.28)] transition-transform hover:-translate-y-0.5 sm:px-6" href={ctaHref}>
        inscreva-se
      </Link>
    </header>
  );
}

export function FooterBrandMark() {
  return <BrandMark dark />;
}
