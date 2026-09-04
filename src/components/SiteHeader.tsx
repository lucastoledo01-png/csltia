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
    <Link aria-label={MARCA.nome} className="group flex items-center" href="/">
      {/*
        Duas versões do arquivo, escolhidas pelo fundo. A clara tem o "imigra"
        em azul-marinho, que some sobre fundo escuro.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dark ? "/marca/imigra-us-escuro.png" : "/marca/imigra-us-claro.png"}
        alt={MARCA.nome}
        className="h-8 w-auto transition-transform group-hover:scale-[1.03]"
      />
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
