import { describe, expect, it } from "vitest";
import { keywordDaCampanha, mesmaKeyword, normalizarKeyword } from "./keyword-canonica";
import { ctaDaPosicao } from "./copy";

/**
 * A palavra impressa no post e a palavra que o listener escuta.
 *
 * Eram três lugares para um valor só: `project.settings.instagram_keyword` com
 * padrão "VISA" no V2, a mesma coluna com padrão "NEWS" no worker legado, e
 * `prompt_campaigns.keyword` da campanha evergreen, que é o valor realmente
 * entregue ao OpenReply em `garantirFunilPermanente`.
 *
 * Em produção os três coincidem hoje. O defeito é latente, não ativo, e é
 * exatamente o tipo que aparece meses depois, quando alguém edita a campanha.
 */

describe("de onde vem a palavra", () => {
  it("da campanha, quando ela tem keyword e automação escutando", () => {
    const r = keywordDaCampanha({ keyword: "VISA", openreply_automation_id: "cmtod726" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keyword).toBe("VISA");
      expect(r.automacao).toBe("cmtod726");
    }
  });

  it("sem funil permanente não há palavra", () => {
    const r = keywordDaCampanha(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/funil permanente/);
  });

  it("keyword em branco não vira palavra", () => {
    for (const k of ["", "   ", null, undefined]) {
      expect(keywordDaCampanha({ keyword: k, openreply_automation_id: "a1" }).ok, String(k)).toBe(false);
    }
  });

  it("keyword sem automação no OpenReply não vale: ninguém escutaria", () => {
    /*
     * Este é o ponto do módulo. A palavra existir numa linha do banco não
     * significa que alguém está escutando por ela. Imprimir "Comente VISA" com
     * a automação inexistente é prometer uma resposta que não vem.
     */
    for (const a of ["", "   ", null, undefined]) {
      const r = keywordDaCampanha({ keyword: "VISA", openreply_automation_id: a });
      expect(r.ok, String(a)).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/ninguém escutaria|automação/i);
    }
  });

  it("a palavra é devolvida como está gravada, sem maquiagem", () => {
    // O que vai para a arte é o valor do banco. Normalizar na impressão criaria
    // uma quarta versão do mesmo valor.
    const r = keywordDaCampanha({ keyword: "  Visa2026 ", openreply_automation_id: "a1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.keyword).toBe("Visa2026");
  });
});

describe("comparar duas palavras", () => {
  it("caixa e espaço não distinguem", () => {
    expect(mesmaKeyword("VISA", " visa ")).toBe(true);
    expect(mesmaKeyword("Visa", "vIsA")).toBe(true);
  });

  it("palavras diferentes continuam diferentes", () => {
    expect(mesmaKeyword("VISA", "NEWS")).toBe(false);
  });

  it("vazio nunca é igual a coisa nenhuma, nem a outro vazio", () => {
    // Senão duas configurações ausentes "concordariam" e o CTA sairia mudo
    // achando que está certo.
    expect(mesmaKeyword("", "")).toBe(false);
    expect(mesmaKeyword("", "VISA")).toBe(false);
    expect(mesmaKeyword(null, undefined)).toBe(false);
  });

  it("a normalização é a mesma dos dois lados", () => {
    expect(normalizarKeyword(" visa ")).toBe(normalizarKeyword("VISA"));
  });
});

describe("o CTA que a copy imprime", () => {
  it("com palavra, pede a palavra exata", () => {
    const cta = ctaDaPosicao(1, "VISA");
    expect(cta).toContain("VISA");
    expect(cta).not.toContain("{K}");
  });

  it("sem palavra, não há CTA: nunca uma frase com o buraco no meio", () => {
    for (const k of ["", "   "]) {
      expect(ctaDaPosicao(1, k), JSON.stringify(k)).toBe("");
    }
  });

  it("a palavra impressa é idêntica à da campanha", () => {
    /*
     * O contrato ponta a ponta: campanha -> resolução -> CTA. Se qualquer
     * etapa maquiar o valor, o listener deixa de reconhecer o comentário.
     */
    const campanha = { keyword: "Visa2026", openreply_automation_id: "a1" };
    const r = keywordDaCampanha(campanha);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const cta = ctaDaPosicao(3, r.keyword);
    expect(cta).toContain("Visa2026");
    expect(mesmaKeyword(campanha.keyword, r.keyword)).toBe(true);
  });

  it("configuração antiga divergente não muda o que é impresso", () => {
    // `settings.instagram_keyword` podia dizer NEWS; quem manda é a campanha.
    const daCampanha = keywordDaCampanha({ keyword: "VISA", openreply_automation_id: "a1" });
    expect(daCampanha.ok && ctaDaPosicao(1, daCampanha.keyword)).toContain("VISA");
    expect(daCampanha.ok && ctaDaPosicao(1, daCampanha.keyword)).not.toContain("NEWS");
  });

  it("trocar a keyword da campanha troca o CTA junto", () => {
    const antes = keywordDaCampanha({ keyword: "VISA", openreply_automation_id: "a1" });
    const depois = keywordDaCampanha({ keyword: "GREENCARD", openreply_automation_id: "a1" });
    expect(antes.ok && ctaDaPosicao(1, antes.keyword)).toContain("VISA");
    expect(depois.ok && ctaDaPosicao(1, depois.keyword)).toContain("GREENCARD");
    expect(depois.ok && ctaDaPosicao(1, depois.keyword)).not.toContain("VISA");
  });
});
