import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { modoSocialParaOEnsaio } from "./newsroom-service";

/**
 * Rota que se chama dry-run não pode criar publicação de verdade.
 *
 * `dryRun` governava a newsletter, o portal e o Listmonk, e parava ali. Quem
 * decidia no social era só `SOCIAL_PIPELINE_V2`. Com a flag em `enforce`, um
 * dry-run da rota admin percorria o pipeline inteiro: gerava a copy, resolvia a
 * imagem, congelava o artefato no Storage e gravava linha `scheduled` em
 * `social_posts`. O worker publicaria aquilo no perfil, e ninguém teria pedido.
 *
 * É o caminho que a validação do rollout precisa usar, então a garantia não
 * pode depender de alguém lembrar de mexer numa variável de ambiente e de
 * lembrar de devolvê-la depois.
 */

describe("a redação em ensaio não grava post", () => {
  it("com o canal em enforce, o ensaio rebaixa para dry_run", () => {
    expect(modoSocialParaOEnsaio(true, { SOCIAL_PIPELINE_V2: "enforce" })).toBe("dry_run");
  });

  it("com o canal em dry_run, continua dry_run", () => {
    expect(modoSocialParaOEnsaio(true, { SOCIAL_PIPELINE_V2: "dry_run" })).toBe("dry_run");
  });

  it("com o canal em off, o ensaio NÃO liga o pipeline", () => {
    // Rebaixar só desce. Ensaiar não pode gastar token que o operador desligou.
    expect(modoSocialParaOEnsaio(true, { SOCIAL_PIPELINE_V2: "off" })).toBe("off");
    expect(modoSocialParaOEnsaio(true, {})).toBe("off");
  });

  it("valor irreconhecível cai em off, como o contrato da flag manda", () => {
    expect(modoSocialParaOEnsaio(true, { SOCIAL_PIPELINE_V2: "ENFORCE!" })).toBe("off");
  });

  it("fora do ensaio devolve undefined, e não um modo calculado", () => {
    // O caminho do cron precisa continuar lendo a flag. Devolver "enforce" aqui
    // faria o newsroom decidir por uma variável que não é dele.
    expect(modoSocialParaOEnsaio(false, { SOCIAL_PIPELINE_V2: "enforce" })).toBeUndefined();
    expect(modoSocialParaOEnsaio(false, { SOCIAL_PIPELINE_V2: "off" })).toBeUndefined();
  });

  it("a decisão está LIGADA à chamada do social, e não só exportada", () => {
    /*
     * Função de guarda escrita e não chamada é o padrão que este repositório
     * já pagou duas vezes (escolherUrlPublicavel, comporFeedDoDia). Aqui a
     * ligação é uma linha de opção, então a prova é sobre o arquivo.
     */
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "src/lib/server/newsroom/newsroom-service.ts"),
      "utf-8",
    );

    expect(fonte).toContain("const modoSocialDoEnsaio = modoSocialParaOEnsaio(dryRun, env);");

    const chamada = fonte.slice(fonte.indexOf("await rodarSocialDoDia("));
    const opcoes = chamada.slice(0, chamada.indexOf("});"));
    expect(opcoes).toContain("modoForcado: modoSocialDoEnsaio");
  });
});
