import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Alcance, não comportamento.
 *
 * A exigência é estrutural: no ramo social-v2 é PROIBIDO chegar a geração de
 * imagem por IA ou a banco de fotos. Um mock não afirma isso — ele afirma que
 * nesta execução não foi chamado, o que continua verdade no dia em que
 * alguém adiciona um fallback numa condição que o teste não exercita.
 *
 * O que se afirma aqui é mais forte: não existe caminho. A prova é o fecho
 * transitivo dos imports do módulo, lido do disco. Se um dia alguém importar
 * o renderizador antigo dentro do ramo V2, este teste falha antes de qualquer
 * discussão sobre se o fallback seria acionado.
 */

const RAIZ = path.resolve(__dirname, "../../../../..");
const SRC = path.join(RAIZ, "src");

/** Resolve o import como o bundler resolve: relativo, alias `@/`, e a extensão. */
function resolver(deQual: string, especificador: string): string | null {
  if (especificador.startsWith("node:")) return null;

  let base: string;
  if (especificador.startsWith("@/")) base = path.join(SRC, especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(deQual), especificador);
  else return null; // pacote do node_modules: fora do grafo do projeto

  for (const tentativa of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(tentativa) && fs.statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

/**
 * Pega import estático E dinâmico.
 *
 * `arte.ts` carrega o Playwright e os templates com `await import(...)`, para o
 * lado web não arrastar o Chromium. Um grafo que só lesse `import ... from`
 * declararia esse módulo como folha e não veria nada abaixo dele — justo onde
 * um fallback se esconderia.
 */
const IMPORTS = /(?:import|export)[\s\S]{0,400}?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function fecho(entrada: string): Set<string> {
  const vistos = new Set<string>();
  const fila = [entrada];

  while (fila.length > 0) {
    const arquivo = fila.pop()!;
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);

    const codigo = fs.readFileSync(arquivo, "utf-8");
    for (const m of codigo.matchAll(IMPORTS)) {
      const alvo = resolver(arquivo, m[1] ?? m[2]);
      if (alvo) fila.push(alvo);
    }
  }

  return vistos;
}

const relativo = (p: string) => path.relative(RAIZ, p);

/** Onde a IA de imagem e o banco de fotos moram de fato. */
const PROIBIDOS = [
  "src/lib/server/prompt-system/visual.ts", // gpt-image-1
  "src/lib/server/prompt-system/stock.ts", // banco de fotos
  "src/lib/server/social/instagram/opendesign-renderer.ts", // importa o banco de fotos
];

describe("o ramo V2 não alcança IA de imagem nem banco de fotos", () => {
  const grafoV2 = fecho(path.join(__dirname, "worker-v2.ts"));
  const nomes = [...grafoV2].map(relativo);

  it("nenhum módulo proibido está no fecho de imports do ramo V2", () => {
    for (const proibido of PROIBIDOS) {
      expect(nomes, `${proibido} alcançável a partir de worker-v2.ts`).not.toContain(proibido);
    }
  });

  it("nem o contrato de carga alcança", () => {
    const nomesDaCarga = [...fecho(path.join(__dirname, "carga-v2.ts"))].map(relativo);
    for (const proibido of PROIBIDOS) {
      expect(nomesDaCarga, `${proibido} alcançável a partir de carga-v2.ts`).not.toContain(proibido);
    }
  });

  it("nenhum identificador de IA de imagem aparece no fecho", () => {
    /*
     * Cinto e suspensório: a lista de módulos proibidos pode ficar
     * desatualizada se a IA de imagem mudar de casa. Isto pega pelo nome.
     *
     * A busca é no CÓDIGO, com os comentários removidos. Sem isso, um módulo
     * que documenta o que ele não faz — "não importa a IA de imagem
     * (gpt-image-1)" — se acusaria a si mesmo, e a saída seria apagar a
     * explicação para o teste passar.
     */
    const AGULHAS = ["generateCoverImageWithAI", "gpt-image", "images/edits", "images/generations", "pexels", "unsplash"];
    const semComentarios = (codigo: string) =>
      codigo
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");

    for (const arquivo of grafoV2) {
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf-8")).toLowerCase();
      for (const agulha of AGULHAS) {
        expect(codigo, `"${agulha}" em ${relativo(arquivo)}`).not.toContain(agulha.toLowerCase());
      }
    }
  });

  it("o instrumento acha as agulhas onde elas realmente estão", () => {
    // Controle do controle: remover comentários não pode ter cegado a busca.
    const visual = fs.readFileSync(path.join(SRC, "lib/server/prompt-system/visual.ts"), "utf-8");
    expect(visual.replace(/\/\*[\s\S]*?\*\//g, " ")).toContain("gpt-image");
  });

  it("o grafo do V2 chega no renderizador determinístico, e é por ele que renderiza", () => {
    // A ausência dos proibidos não valeria nada se o módulo não renderizasse
    // por lugar nenhum.
    expect(nomes).toContain("src/lib/server/social/arte.ts");
    expect(nomes).toContain("src/lib/carousel-templates/assemble.ts");
  });

  it("o grafo do legado ALCANÇA o renderizador antigo, senão o teste não vale nada", () => {
    /*
     * Controle. Se o leitor de grafo estivesse quebrado — regex que não casa,
     * resolvedor que devolve null — todo teste acima passaria por vacuidade.
     * O caminho legado tem que dar positivo no mesmo instrumento.
     */
    const nomesLegado = [...fecho(path.join(__dirname, "worker-service.ts"))].map(relativo);
    expect(nomesLegado).toContain("src/lib/server/social/instagram/opendesign-renderer.ts");
    expect(nomesLegado).toContain("src/lib/server/prompt-system/stock.ts");
  });
});
