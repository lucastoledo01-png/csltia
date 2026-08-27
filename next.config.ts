import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empacota o servidor com apenas as dependências que ele realmente usa.
  // A imagem final não precisa de node_modules inteiro nem do código-fonte.
  output: "standalone",
};

export default nextConfig;
