import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
// Montado pelo código para o próprio teste não conter o caractere que procura.
const TRAVESSAO = String.fromCharCode(0x2014);

/**
 * A ligação dos ramos no ciclo do dia, conferida no fonte.
 *
 * O `runNewsroom` não roda em teste sem meio banco falso, e o que importa aqui
 * é uma propriedade de forma: TODA mudança de comportamento está atrás de
 * `ramosNoComando`, e com os ramos em `off` o ciclo é o de antes. Se alguém
 * mover uma dessas condições, este teste acusa antes do cron.
 */
const RAIZ = path.resolve(__dirname, "../../../..");
const servico = fs.readFileSync(path.join(RAIZ, "src/lib/server/newsroom/newsroom-service.ts"), "utf-8");

describe("os ramos no ciclo do dia", () => {
  it("o piso de QA só sai do portão com os ramos no comando", () => {
    expect(servico).toContain("ramosNoComando ? 0 : configEditorial.notaMinimaDeQA,");
    expect(servico).toContain("ramosNoComando ? { notaDeAviso: configEditorial.notaMinimaDeQA } : {},");
  });

  it("o portal só deixa de regravar o e-mail com os ramos no comando", () => {
    expect(servico).toContain("if (publishToPortal && !ramosNoComando) {");
  });

  it("o agendador legado do Instagram cede aos ramos", () => {
    expect(servico).toContain('const legadoCede = modoSocialV2 === "enforce" || ramosNoComando;');
  });

  it("teto de cinco, extras, pacote obrigatório e evergreen desligado só com os ramos no comando", () => {
    const i = servico.indexOf("tetoDoDia: TETO_DO_INSTAGRAM");
    expect(i).toBeGreaterThan(0);
    expect(servico.slice(i - 200, i)).toContain("const opcoesDoRamoNoSocial = ramosNoComando");
  });

  it("a seleção própria da newsletter só substitui a da guarda com os ramos no comando", () => {
    const i = servico.indexOf("selecionadasDaNewsletter = daNewsletter.escolhidas;");
    expect(i).toBeGreaterThan(0);
    expect(servico.slice(i - 120, i)).toContain("if (ramosNoComando) {");
  });

  it("ramo em enforce com a guarda em observação desce para dry_run", () => {
    expect(servico).toContain('modo === "dry_run" && modoRamosDeclarado === "enforce" ? "dry_run"');
  });

  it("a fila só recebe peça com os ramos no comando e fora de ensaio", () => {
    const ocorrencias = servico.split("options.aoProduzirPeca)").length - 1;
    expect(ocorrencias).toBe(2);
    expect(servico).toContain("if (ramosNoComando && !dryRun && options.aoProduzirPeca) {");
  });

  it("nenhum travessão entrou no código dos ramos", () => {
    const dir = path.join(RAIZ, "src/lib/server/ramos");
    for (const f of fs.readdirSync(dir)) {
      expect(fs.readFileSync(path.join(dir, f), "utf-8"), f).not.toContain(TRAVESSAO);
    }
  });
});
