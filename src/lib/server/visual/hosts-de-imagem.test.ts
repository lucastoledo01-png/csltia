import { describe, expect, it } from "vitest";
import nextConfig from "../../../../next.config";

/**
 * Todo host que o resolvedor visual escolhe precisa estar liberado no next/image.
 *
 * O resolvedor da fase 2 passou a devolver foto do Wikimedia Commons, e
 * `upload.wikimedia.org` não entrou na lista do `next.config.ts`. O efeito não
 * foi capa ausente, que seria degradação aceitável: `next/image` LANÇA quando o
 * host não está liberado, então a página inteira do portal quebrava em toda
 * matéria cuja capa viesse do Commons. Uma das cinco matérias já gravadas está
 * nessa situação.
 *
 * As duas listas vivem em arquivos distantes, uma em `visual/` e outra na raiz,
 * e nada as ligava. Este teste é essa ligação.
 */

/** Hosts que o pipeline pode gravar como capa. */
const HOSTS_DO_PIPELINE = [
  "images.pexels.com",
  "images.unsplash.com",
  "upload.wikimedia.org",
  // Openverse indexa o Flickr e devolve a imagem servida por este host.
  "live.staticflickr.com",
  "azqpdesusdzqndvsqmko.supabase.co",
];

describe("hosts de imagem", () => {
  it("todo host que o pipeline escolhe está liberado no next/image", () => {
    const liberados = (nextConfig.images?.remotePatterns ?? []).map((p) =>
      typeof p === "string" ? p : String(p.hostname),
    );

    for (const host of HOSTS_DO_PIPELINE) {
      expect(liberados).toContain(host);
    }
  });

  it("a lista não é um curinga", () => {
    const liberados = (nextConfig.images?.remotePatterns ?? []).map((p) =>
      typeof p === "string" ? p : String(p.hostname),
    );

    // Liberar "**" faria o otimizador buscar URL arbitrária vinda de fonte
    // externa, que é o motivo de a lista existir.
    for (const host of liberados) {
      expect(host).not.toBe("**");
      expect(host).not.toBe("*");
    }
  });
});
