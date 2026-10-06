import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Outfit } from "next/font/google";
import "./admin.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/*
 * O painel fora do índice (auditoria de SEO, 05/10/2026). O `robots.txt` só
 * pede para não rastrear; página bloqueada ali ainda pode entrar no índice
 * pelo link de alguém. O `noindex` aqui e o `X-Robots-Tag` do `next.config.ts`
 * fecham isso.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${outfit.variable}`}>{children}</div>;
}
