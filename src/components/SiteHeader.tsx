import Link from "next/link";

const navItems = [
  { href: "/ultraprompts", label: "UltraPrompts" },
  { href: "/artigos", label: "Artigos" },
  { href: "/formacoes", label: "Formações" },
];

export function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link aria-label="desbuguei.ia" className="flex items-center gap-2.5 group" href="/">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ff4a1c] font-mono text-sm font-black text-white shadow-sm transition-transform group-hover:scale-105">
        b.
      </span>
      <span className={`font-sans text-xl font-bold tracking-tight ${dark ? "text-white" : "text-[#111827]"}`}>
        desbuguei<span className="text-[#ff4a1c]">.ia</span>
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
          <Link className="font-medium text-black transition-colors hover:text-[#ff4a1c]" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className="cta-gradient rounded-full px-4 py-3 font-semibold text-white shadow-[0_12px_24px_rgba(255,74,28,0.28)] transition-transform hover:-translate-y-0.5 sm:px-6" href={ctaHref}>
        inscreva-se
      </Link>
    </header>
  );
}

export function FooterBrandMark() {
  return <BrandMark dark />;
}
