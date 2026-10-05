import type { Metadata } from "next";
import { MARCA, TITULO_DO_SITE } from "@/lib/marca";
import { Archivo_Black, Inter, Sora, Space_Mono } from "next/font/google";
import "./globals.css";

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/*
 * Sora é a letra do portal, desde o redesenho de 05/10/2026.
 *
 * Variável e não pesos soltos: a página usa de 400 a 700, e um arquivo de eixo
 * contínuo custa menos que quatro arquivos. O `next/font` baixa no build e
 * serve da nossa origem, então o leitor não faz pedido nenhum ao Google, e
 * não há `@import` de folha externa no CSS.
 *
 * O nome da variável é `--fonte-sora`, e não `--font-sora`, porque o tema do
 * Tailwind declara `--font-portal` apontando para ela: com o mesmo nome dos
 * dois lados a variável apontaria para si mesma.
 *
 * Ela fica declarada no `html` para o site todo, mas só o cromo e as páginas
 * do portal a usam (classe `portal`). O painel continua em Inter.
 */
const sora = Sora({
  variable: "--fonte-sora",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: TITULO_DO_SITE,
  description:
    MARCA.descricao,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${archivoBlack.variable} ${spaceMono.variable} ${inter.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
