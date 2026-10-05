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
/*
 * Robôs de IA, decisão do dono em 05/10/2026: os dois tipos LIBERADOS.
 *
 * Os de busca e citação leem a página quando alguém pergunta e citam o site
 * com link (é o GEO). Os de treino coletam texto para o próximo modelo, sem
 * link. Bloquear o treino só valeria daqui para frente, depende de o robô
 * obedecer, e não muda nada no Google. Para um portal que está construindo
 * audiência, ser conhecido pelo modelo vale mais que proteger notícia, que
 * perde valor em dias. Rever se surgir licenciamento ou conteúdo exclusivo.
 *
 * A regra `*` já liberava todos. A lista existe para a política ficar
 * escrita como decisão, e para bloquear um tipo ser trocar `allow` por
 * `disallow` num grupo só.
 */
export const ROBOS_DE_BUSCA_DE_IA = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
] as const;

export const ROBOS_DE_TREINO_DE_IA = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Applebot-Extended"] as const;

const FORA_DO_RASTREIO = ["/admin", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: FORA_DO_RASTREIO },
      { userAgent: [...ROBOS_DE_BUSCA_DE_IA], allow: "/", disallow: FORA_DO_RASTREIO },
      { userAgent: [...ROBOS_DE_TREINO_DE_IA], allow: "/", disallow: FORA_DO_RASTREIO },
    ],
    // O de notícias (05/10/2026) traz só as últimas 48 horas, no formato do Google News.
    sitemap: [`${MARCA.site}/sitemap.xml`, `${MARCA.site}/sitemap-noticias.xml`],
  };
}
