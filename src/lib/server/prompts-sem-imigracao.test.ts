import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INSTRUCAO_PADRAO_ASSUNTO, INSTRUCAO_PADRAO_NEWSLETTER, montarSystemEditorial } from "./newsroom/pipeline";
import { INSTRUCAO_PADRAO_SOCIAL_COPY, montarSystemDaCopy } from "./social/copy";
import { INSTRUCAO_PADRAO_CARROSSEL, montarSystemDoCarrossel } from "./social/carrossel/copy";
import { ESTRUTURAS } from "./social/carrossel/estrutura";
import { MODELO_DA_REGRA_DA_MANCHETE, REGRA_DA_MANCHETE } from "./social/manchete";
import { VOZ_SOCIAL } from "./social/voz";
import { montarSystemDoArtigo } from "./ramos/artigo";
import { VOZ_PADRAO_DA_NEWSLETTER, VOZ_PADRAO_DO_ARTIGO, VOZ_PADRAO_DO_POST } from "./ramos/vozes";
import { CATALOGO_DE_ETAPAS } from "./instrucoes-catalogo";
import type { EstruturaDoCarrossel } from "./social/carrossel/estrutura";
import { LEITOR } from "./editorial/linha-editorial";

/**
 * Os exemplos dos prompts de REDAÇÃO saíram da imigração (decisão do dono,
 * 05/10/2026: "pode trocar agora os exemplos").
 *
 * A publicação deixou de falar de imigração, mas os exemplos que ensinam a
 * forma do título ainda eram de visto: I-864, EB-2 NIW, O-1B, F-1, DS-160. O
 * modelo imita exemplo mais do que obedece regra, e um prompt cheio de visto
 * puxa a pauta de economia para o vocabulário de escritório de imigração.
 * Cada exemplo foi trocado mantendo o que ele ensinava (jurisdição no fim,
 * sigla nunca sozinha, quem é afetado aparece, fato antes da ressalva,
 * nacionalidade de terceiro país fora).
 *
 * Fica de fora, de propósito: o classificador e o verificador, que PRECISAM
 * reconhecer pauta de visto para recusá-la (`REJECT_IMMIGRATION_OFF_LINE`), as
 * listas de detecção de `leitor.ts`, que são régua e não exemplo, e a frase da
 * LINHA EDITORIAL que diz o que fica fora ("visto, green card, processo
 * migratório..."), que as vozes dos ramos repetem: ela é a regra que exclui o
 * assunto, não um exemplo de título.
 */

/** O texto sem a linha editorial, que nomeia o assunto excluído de propósito. */
const semLinhaEditorial = (t: string) => t.split(LEITOR).join("");

const TERMOS_DE_IMIGRACAO = /\b(?:I-864|I-765|I-485|NIW|EB-2|EB-5|O-1[AB]?|USCIS|DS-160|F-1|H-1B)\b|green\s?card|visto liberado|duration of status/i;

const marca = { nome: "eua.journal", nicho: "EUA", extra: "Briefing.", assinatura: "Até amanhã." };
const marcaSocial = { nome: "eua.journal", nicho: "EUA", extra: "Briefing.", keyword: "NEWS" };

/** O prompt de reparo da newsletter é montado dentro do laço; lido do fonte. */
function promptDeReparoNoFonte(): string {
  const fonte = readFileSync(path.join(__dirname, "newsroom/pipeline.ts"), "utf8");
  const inicio = fonte.indexOf("const promptDeReparo = `");
  expect(inicio).toBeGreaterThan(0);
  return fonte.slice(inicio, fonte.indexOf("`;", inicio));
}

describe("nenhum prompt de redação traz exemplo de imigração", () => {
  const prompts: Array<[string, string]> = [
    ["newsletter (sistema)", montarSystemEditorial(marca)],
    ["newsletter (padrão editável)", INSTRUCAO_PADRAO_NEWSLETTER],
    ["assunto do e-mail", INSTRUCAO_PADRAO_ASSUNTO],
    ["reparo da newsletter", promptDeReparoNoFonte()],
    ["post de imagem única", montarSystemDaCopy(marcaSocial as never)],
    ["post (padrão editável)", INSTRUCAO_PADRAO_SOCIAL_COPY],
    ["carrossel (padrão editável)", INSTRUCAO_PADRAO_CARROSSEL],
    ...(Object.keys(ESTRUTURAS) as EstruturaDoCarrossel[]).map(
      (e) => [`carrossel ${e}`, montarSystemDoCarrossel(marcaSocial as never, e, ESTRUTURAS[e])] as [string, string],
    ),
    ["regra da manchete", REGRA_DA_MANCHETE],
    ["regra da manchete (modelo)", MODELO_DA_REGRA_DA_MANCHETE],
    ["voz social", VOZ_SOCIAL],
    ["matéria do portal", montarSystemDoArtigo({ nome: "eua.journal", nicho: "EUA", briefing: "", voz: VOZ_PADRAO_DO_ARTIGO })],
    ["voz da newsletter", VOZ_PADRAO_DA_NEWSLETTER],
    ["voz do artigo", VOZ_PADRAO_DO_ARTIGO],
    ["voz do post", VOZ_PADRAO_DO_POST],
  ];

  for (const [nome, texto] of prompts) {
    it(nome, () => {
      expect(texto.length).toBeGreaterThan(40);
      expect(semLinhaEditorial(texto).match(TERMOS_DE_IMIGRACAO)?.[0] ?? null).toBeNull();
    });
  }

  /*
   * Os padrões do painel são os textos do código (RF-26): trocar o exemplo no
   * código troca o padrão que o dono vê e que vale enquanto não houver versão
   * ativa. Esta conferência prende os dois juntos.
   */
  it("os padrões editáveis do painel também", () => {
    const deRedacao = CATALOGO_DE_ETAPAS.filter((e) => !e.etapa.startsWith("linha_editorial"));
    expect(deRedacao.length).toBeGreaterThanOrEqual(5);
    for (const e of deRedacao) {
      expect(semLinhaEditorial(e.padrao).match(TERMOS_DE_IMIGRACAO)?.[0] ?? null, e.etapa).toBeNull();
    }
  });

  it("a conferência acusaria o exemplo antigo", () => {
    expect(TERMOS_DE_IMIGRACAO.test('Errado: "Na Califórnia, acordos nupciais geralmente não encerram o I-864"')).toBe(true);
    expect(TERMOS_DE_IMIGRACAO.test('"quem estuda com visto de estudante (F-1)"')).toBe(true);
    expect(TERMOS_DE_IMIGRACAO.test('"Emprego nos EUA muda pouco e taxa de desemprego fica em 4,2%"')).toBe(false);
  });

  it("os exemplos que vieram do banco dizem a data, e os inventados dizem que são ilustrativos", () => {
    const texto = montarSystemEditorial(marca) + REGRA_DA_MANCHETE;
    expect(texto).toContain("(edição de 23/09/2026)");
    expect(texto).toContain("(post real de 05/10/2026)");
    expect(texto).toContain("(construção ilustrativa)");
  });
});
