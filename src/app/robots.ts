import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";

/**
 * O portal não tinha robots.txt: `/robots.txt` respondia 404.
 *
 * Sem ele o rastreador não recebe nenhuma instrução e, principalmente, não
 * sabe onde está o sitemap. Num site de notícia isso é caro: as matérias são
 * muitas, mudam todo dia e ninguém as linka de fora no começo.
 *
 * O painel fica de fora do rastreio. Ele já exige sessão, então não é segredo
 * que se guarda aqui, mas página de administração em resultado de busca é
 * ruído para quem procura notícia e convite para quem procura formulário de
 * login.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${MARCA.site}/sitemap.xml`,
  };
}
