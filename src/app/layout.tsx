import type { Metadata } from "next";
import { MARCA, TITULO_DO_SITE } from "@/lib/marca";
import { Archivo_Black, Inter, Sora, Space_Mono } from "next/font/google";
import "./globals.css";

/*
 * Sem `preload` (auditoria de SEO, 05/10/2026): nenhuma página usa
 * `--font-archivo-black` nem `--font-space-mono` hoje, e os três arquivos
 * eram pré-carregados em toda página do portal, disputando banda com a capa,
 * que é o LCP da matéria. Declarados continuam; o navegador só baixa se alguém
 * voltar a usar.
 */
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

/*
 * Inter é a letra do painel, e o portal não a desenha em lugar nenhum (o
 * `.portal` troca tudo por Sora). Sem `preload` desde 06/10/2026: ela era
 * pré-carregada em toda página do portal, contra a capa. No painel o arquivo
 * vem quando a página pede, um instante depois.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
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
  /*
   * Só `latin` é pré-carregado (06/10/2026). O português inteiro está nele;
   * `latin-ext` era um segundo arquivo baixado em toda página para letra que
   * quase nunca aparece. O `subsets` do `next/font` decide o que é
   * pré-carregado; a conferência do CSS gerado está no PR.
   */
  subsets: ["latin"],
});

export const metadata: Metadata = {
  /*
   * A base dos endereços relativos, e a prévia grande de imagem para o Google
   * (auditoria de SEO, 05/10/2026). Sem `max-image-preview:large` o Google
   * Discover e as notícias principais mostram a miniatura pequena, e é a foto
   * grande que decide o clique ali.
   */
  metadataBase: new URL(MARCA.site),
  title: TITULO_DO_SITE,
  description:
    MARCA.descricao,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
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
