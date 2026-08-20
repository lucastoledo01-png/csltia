import Image from "next/image";
import Link from "next/link";

const navItems = [
  { href: "/ultraprompts", label: "UltraPrompts" },
  { href: "/artigos", label: "Artigos" },
  { href: "/formacoes", label: "Formações" },
];

export function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <Link aria-label="Casaloti IA" className="flex items-center" href="/">
      <Image
        alt="Casaloti IA"
        className={dark ? "h-9 w-auto object-contain brightness-0 invert" : "h-9 w-auto object-contain"}
        height={72}
        priority
        src="/brand/casaloti-logo-original.png"
        width={210}
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
