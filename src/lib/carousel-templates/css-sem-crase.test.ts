import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Crase dentro do CSS encerra o template literal.
 *
 * `BASE_CSS` e `CSS_DO_LAYOUT` são template literals, e escrever o nome de uma
 * classe entre crases num comentário do CSS fecha a string ali. O erro é do
 * esbuild, a mensagem aponta para uma linha distante da causa, e já aconteceu
 * cinco vezes neste repositório, inclusive depois de duas entradas no arquivo
 * de incidentes descrevendo exatamente isto.
 *
 * Lição escrita não impediu a repetição. Este teste impede: a conferência é
 * mecânica e não depende de ninguém lembrar.
 */

const ARQUIVOS = ["base-css.ts", "layout-render.ts", "chrome.ts", "shell.ts", "variants.ts"];

function corpoDosTemplates(fonte: string): Array<{ inicio: number; texto: string }> {
  /*
   * Só os literais que começam depois de `= ` na abertura de uma constante de
   * CSS. Interessa o bloco grande de estilo, e não toda interpolação do
   * arquivo, que usa crase legitimamente para montar HTML.
   */
  const blocos: Array<{ inicio: number; texto: string }> = [];
  const abre = /export const [A-Z_]+(?:: string)? = `/g;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(fonte))) {
    const inicio = m.index + m[0].length;
    const fim = fonte.indexOf("\n`;", inicio);
    if (fim > inicio) blocos.push({ inicio, texto: fonte.slice(inicio, fim) });
  }
  return blocos;
}

describe("nenhuma crase solta dentro dos literais de CSS", () => {
  for (const arquivo of ARQUIVOS) {
    it(`${arquivo} não tem crase dentro do bloco de estilo`, () => {
      const caminho = path.join(process.cwd(), "src/lib/carousel-templates", arquivo);
      if (!fs.existsSync(caminho)) return;

      const fonte = fs.readFileSync(caminho, "utf-8");
      for (const bloco of corpoDosTemplates(fonte)) {
        const linhas = bloco.texto.split("\n");
        const comCrase = linhas
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => l.includes("`"))
          .map(({ l, i }) => `linha ${i + 1} do bloco: ${l.trim()}`);

        expect(comCrase, `crase dentro do CSS de ${arquivo}`).toEqual([]);
      }
    });
  }

  it("a varredura pegaria o erro de verdade", () => {
    // Sem isto, um teste que nunca acusa nada é indistinguível de um teste que
    // não confere nada. Foi essa a lição do auditor semântico com zero recusas.
    const fonteFalsa = ["export const X = `", ".a{color:red} /* usa a classe `.b` aqui */", "`;"].join("\n");
    const blocos = corpoDosTemplates(fonteFalsa);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].texto).toContain("`.b`");
  });
});
