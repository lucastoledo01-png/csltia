import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
};

export default nextConfig;
