import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Nenhum arquivo do repositório aponta para um caminho da máquina de quem
 * escreveu.
 *
 * Em 17/09/2026 o build do serviço web quebrou por isto, e o defeito ficou
 * escondido por horas porque `npm run build` passa LOCALMENTE: o caminho
 * `/Users/lucastoledo/...` existe na máquina de origem, o import resolve, e o
 * Next compila sem reclamar. Dentro do contêiner o caminho não existe, o
 * import falha e o build morre em `next build`.
 *
 * O efeito foi pior do que um build vermelho: dois deploys foram disparados,
 * o painel respondeu "Deploying...", o serviço antigo continuou no ar e
 * ninguém viu erro nenhum. A correção do portão de QA ficou fora de produção
 * numa noite em que a edição da manhã dependia dela.
 *
 * A causa raiz é banal: um script escrito em /tmp precisa de caminho absoluto
 * para o `tsx` resolver, e ao ser copiado para dentro do repositório o caminho
 * absoluto veio junto.
 *
 * Esta varredura é mecânica e não depende de ninguém lembrar.
 */

const RAIZ = path.join(process.cwd(), "src");

/** Padrões de caminho que só existem na máquina de alguém. */
const CAMINHOS_DE_MAQUINA = [
  /["'`]\/Users\//,
  /["'`]\/home\/[a-z]/,
  /["'`][A-Z]:\\\\/,
  /["'`]\/private\/tmp\//,
  /["'`]\/var\/folders\//,
];

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "node_modules" || item.name === ".next") continue;
      arquivosDeCodigo(completo, achados);
      continue;
    }
    if (/\.(ts|tsx|mts|cts)$/.test(item.name)) achados.push(completo);
  }
  return achados;
}

describe("nada em src aponta para a máquina de quem escreveu", () => {
  const arquivos = arquivosDeCodigo(RAIZ);

  it("encontra arquivos para varrer", () => {
    // Varredura que não olha nada é indistinguível de varredura que passa.
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("nenhum import ou string usa caminho absoluto de máquina", () => {
    const culpados: string[] = [];

    for (const arquivo of arquivos) {
      // O próprio teste cita os padrões, e citar não é usar.
      if (arquivo.endsWith("importacoes-portateis.test.ts")) continue;

      const linhas = fs.readFileSync(arquivo, "utf-8").split("\n");
      linhas.forEach((linha, i) => {
        if (CAMINHOS_DE_MAQUINA.some((p) => p.test(linha))) {
          culpados.push(`${path.relative(process.cwd(), arquivo)}:${i + 1}`);
        }
      });
    }

    expect(culpados, "caminho de máquina em arquivo versionado").toEqual([]);
  });

  it("a varredura pegaria o erro de verdade", () => {
    const linhaRuim = 'import { X } from "/Users/alguem/projeto/src/lib/x";';
    expect(CAMINHOS_DE_MAQUINA.some((p) => p.test(linhaRuim))).toBe(true);

    const linhaBoa = 'import { X } from "@/lib/x";';
    expect(CAMINHOS_DE_MAQUINA.some((p) => p.test(linhaBoa))).toBe(false);

    // Caminho de destino em tempo de execução, escrito em variável, continua
    // valendo: o que não pode é o repositório depender dele para compilar.
    const scratch = 'const SAIDA = "/private/tmp/claude-501/preview";';
    expect(CAMINHOS_DE_MAQUINA.some((p) => p.test(scratch))).toBe(true);
  });
});
