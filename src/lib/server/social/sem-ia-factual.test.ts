import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Notícia factual não recebe imagem inventada.
 *
 * A regra não pode viver só na intenção de quem escreve, porque o caminho já
 * existiu e era o padrão: `generateCoverImageWithAI` gerava uma fotografia
 * documental realista por IA, e quando falhava caía numa lista de sete fotos
 * fixas do Pexels. Foi assim que agentes do ICE que não existem e um médico
 * fictício ilustraram notícia real.
 *
 * Este arquivo não testa comportamento, testa ALCANCE: nenhum módulo do
 * pipeline social V2 pode sequer importar esses caminhos. É um teste de
 * estrutura, e ele quebra no dia em que alguém religar o atalho.
 */

const RAIZ = path.resolve(__dirname, "../../../..");

/** Os módulos que compõem o caminho factual do social V2. */
const MODULOS_DO_V2 = [
  "src/lib/server/social/copy.ts",
  "src/lib/server/social/gerador.ts",
  "src/lib/server/social/social-guard.ts",
  "src/lib/server/social/selecao.ts",
  "src/lib/server/social/agenda.ts",
  "src/lib/server/social/legenda.ts",
  "src/lib/server/social/modo.ts",
  "src/lib/server/social/arte.ts",
  "src/lib/server/editorial/finalistas.ts",
  "src/lib/server/editorial/verificador.ts",
];

const PROIBIDOS = [
  "generateCoverImageWithAI",
  "getContextualBrandImage",
  "images.pexels.com",
  "pexels-photo",
  "/v1/images/generations",
];

function ler(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), "utf-8");
}

describe("o caminho factual do social V2 não alcança geração de imagem por IA", () => {
  it("nenhum módulo do V2 menciona os atalhos proibidos", () => {
    const achados: string[] = [];

    for (const modulo of MODULOS_DO_V2) {
      const fonte = ler(modulo);
      for (const proibido of PROIBIDOS) {
        // Comentário explicando por que não se usa é permitido; código não.
        const linhas = fonte.split("\n").filter((l) => l.includes(proibido));
        const emCodigo = linhas.filter((l) => {
          const t = l.trim();
          return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
        });
        if (emCodigo.length > 0) achados.push(`${modulo}: ${proibido}`);
      }
    }

    expect(achados).toEqual([]);
  });

  it("nenhum módulo do V2 importa o renderizador que carrega esses caminhos", () => {
    const importam = MODULOS_DO_V2.filter((m) => ler(m).includes("opendesign-renderer"));
    expect(importam).toEqual([]);
  });

  it("a lista fixa de fotos do Pexels segue existindo só no renderizador antigo", () => {
    // Confirma que o teste acima tem valor: os atalhos existem no repositório,
    // e o que se garante é que o V2 não chega neles.
    const renderizador = ler("src/lib/server/social/instagram/opendesign-renderer.ts");
    expect(renderizador).toContain("generateCoverImageWithAI");
    expect(renderizador).toContain("images.pexels.com");
  });

  it("a arte do V2 tem uma única origem possível de imagem", () => {
    /*
     * O ponto mais fácil de reabrir o atalho é o render, porque é lá que a
     * ausência de foto aparece como problema visual: o renderizador antigo
     * atribui `bg_image_url` em quatro lugares, e três deles inventam a
     * imagem.
     *
     * Aqui existem duas atribuições, e as duas carregam o mesmo asset: a
     * primeira pega a URL aprovada, a segunda troca essa URL pelo conteúdo
     * dela embutido. Uma terceira, vinda de qualquer outra coisa, é o bug que
     * este teste existe para pegar.
     */
    const fonte = ler("src/lib/server/social/arte.ts");
    const emCodigo = fonte
      .split("\n")
      .filter((l) => /bg_image_url\s*[:=]/.test(l))
      .map((l) => l.trim())
      .filter((t) => !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*"));

    expect(emCodigo).toHaveLength(2);
    expect(emCodigo[0]).toContain("asset");
    expect(emCodigo[1]).toContain("dataUrl");
    // E `dataUrl` é o download da própria URL aprovada, não de outra.
    expect(fonte).toContain("baixarComoDataUrl(capa.slide.bg_image_url");
  });

  it("a arte do V2 não consulta banco de imagem", () => {
    const fonte = ler("src/lib/server/social/arte.ts");
    for (const proibido of ["buscarFotoDeBanco", "bancoConfigurado", "consultaDaCapa", "prompt-system/stock"]) {
      expect(fonte.includes(proibido), proibido).toBe(false);
    }
  });

  it("o resolvedor visual da fase 2 também não gera imagem", () => {
    const resolver = ler("src/lib/server/visual/resolver.ts");
    for (const proibido of ["generateCoverImageWithAI", "/v1/images/generations"]) {
      expect(resolver.includes(proibido), proibido).toBe(false);
    }
  });
});
