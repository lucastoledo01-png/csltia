import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Um endereço só para cada página (auditoria de SEO, 05/10/2026).
   * `www.casaloti.ia.br` respondia 200 com o mesmo conteúdo, e o
   * rastreador via duas cópias do portal. O `www` vai para o domínio sem ele,
   * de forma permanente, com o mesmo caminho.
   */
  async redirects() {
    return [
      {
        source: "/:caminho*",
        has: [{ type: "host", value: "www.casaloti.ia.br" }],
        destination: "https://casaloti.ia.br/:caminho*",
        permanent: true,
      },
    ];
  },

  /*
   * O arquivo da chave do IndexNow (06/10/2026). O protocolo procura a chave
   * em `/<chave>.txt` na raiz do site, e o nome do arquivo É a chave, que mora
   * no ambiente (`INDEXNOW_KEY`) e não no repositório. A reescrita leva só
   * nome de 8 a 128 letras e números para a rota, que devolve a chave quando
   * bate e 404 quando não bate. `llms.txt` e `robots.txt` têm nome curto e não
   * passam por aqui, e as rotas de arquivo vêm antes das reescritas.
   */
  async rewrites() {
    return [{ source: "/:chave([A-Za-z0-9]{8,128})\\.txt", destination: "/api/indexnow/chave/:chave" }];
  },

  /*
   * Painel e API fora do índice por cabeçalho, que vale até para resposta
   * que não é HTML (JSON da API). O `robots.txt` só pede para não rastrear.
   */
  async headers() {
    return [
      { source: "/admin/:caminho*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:caminho*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },

  // Empacota o servidor com apenas as dependências que ele realmente usa.
  // A imagem final não precisa de node_modules inteiro nem do código-fonte.
  output: "standalone",

  images: {
    /*
     * Domínios de onde as capas podem vir.
     *
     * Sem esta lista o `next/image` recusa qualquer host externo, e o efeito
     * é uma página sem imagem nenhuma, sem erro visível para quem navega. Foi
     * o que aconteceu no portal: as capas existiam no banco, apontavam para
     * URLs válidas, e não apareciam.
     *
     * A lista é dos hosts que o próprio sistema escolhe. Capa de feed RSS
     * pode vir de qualquer domínio, e permitir "qualquer https" faria o
     * otimizador buscar URL arbitrária vinda de fonte externa. O pipeline já
     * prefere banco de imagem e geração própria; capa de host não listado
     * simplesmente não é usada.
     */
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "azqpdesusdzqndvsqmko.supabase.co" },
      { protocol: "https", hostname: "casaloti.ia.br" },
      /*
       * O Commons entrou depois, junto com o resolvedor visual da fase 2.
       *
       * Ele é a fonte de foto de pessoa e de lugar com licença verificada, e
       * é o host que o resolvedor devolve quando a pauta tem entidade real.
       * Ficou de fora desta lista quando o resolvedor foi ligado, e o efeito
       * não foi capa ausente: foi a PÁGINA inteira quebrando, porque
       * `next/image` lança em vez de degradar.
       */
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // O Openverse indexa o Flickr, e a imagem dele é servida por este host.
      // Host que falta aqui faz `next/image` LANÇAR e derrubar a página
      // inteira do artigo, não apenas esconder a capa.
      { protocol: "https", hostname: "live.staticflickr.com" },
    ],
  },
};

export default nextConfig;
