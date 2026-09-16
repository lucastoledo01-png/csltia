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

function corpoDosTemplates(fonte: string): Array<{ nome: string; texto: string }> {
  /*
   * Só os literais que começam depois de `= ` na abertura de uma constante em
   * caixa alta. Interessa o bloco grande de estilo ou de script, e não toda
   * interpolação do arquivo, que usa crase legitimamente para montar HTML.
   *
   * O FIM do bloco tem duas formas, e a segunda custou caro. Em 16/09/2026 uma
   * crase entrou num comentário de `SCRIPT_DE_AJUSTE` e derrubou 27 arquivos
   * de teste. Esta varredura não pegou, porque procurava só o fechamento em
   * "\n`;" e aquele bloco fecha em "\n`.trim();": o literal onde o erro
   * aconteceu simplesmente não era conferido.
   *
   * Teste com cobertura furada é pior que teste ausente, porque quem lê o
   * verde acha que está protegido.
   */
  const blocos: Array<{ nome: string; texto: string }> = [];
  const abre = /export const ([A-Z_]+)(?:: string)? = `/g;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(fonte))) {
    const inicio = m.index + m[0].length;
    const candidatos = ["\n`;", "\n`.trim();"]
      .map((fecho) => fonte.indexOf(fecho, inicio))
      .filter((i) => i > inicio);
    if (candidatos.length === 0) continue;
    blocos.push({ nome: m[1], texto: fonte.slice(inicio, Math.min(...candidatos)) });
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

        expect(comCrase, `crase dentro de ${bloco.nome}, em ${arquivo}`).toEqual([]);
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

  it("pega também o literal que fecha com trim, que é onde o erro passou", () => {
    const fonteFalsa = [
      "export const Y = `",
      "(function(){ /* comenta a classe `.c` */ })();",
      "`.trim();",
    ].join("\n");
    const blocos = corpoDosTemplates(fonteFalsa);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].texto).toContain("`.c`");
  });

  /**
   * A cobertura é afirmada por nome, e não deduzida do verde.
   *
   * Se alguém renomear o script ou trocar a forma de fechar o literal, este
   * teste cai, e é isso que se quer: a varredura precisa dizer em voz alta
   * quando deixa de olhar para o bloco que já causou o problema.
   */
  it("confere de fato os blocos grandes que existem hoje", () => {
    const lidos = new Map<string, string[]>();
    for (const arquivo of ARQUIVOS) {
      const caminho = path.join(process.cwd(), "src/lib/carousel-templates", arquivo);
      if (!fs.existsSync(caminho)) continue;
      lidos.set(
        arquivo,
        corpoDosTemplates(fs.readFileSync(caminho, "utf-8")).map((b) => b.nome),
      );
    }

    expect(lidos.get("base-css.ts")).toContain("BASE_CSS");
    expect(lidos.get("layout-render.ts")).toContain("CSS_DO_LAYOUT");
    expect(lidos.get("layout-render.ts")).toContain("SCRIPT_DE_AJUSTE");
  });
});
