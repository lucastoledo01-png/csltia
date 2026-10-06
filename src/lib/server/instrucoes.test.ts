import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  carregarInstrucoesAtivas,
  ETAPAS_EDITORIAIS,
  comInstrucoesDoProjeto,
  entrarNasInstrucoes,
  prepararInstrucoesDoProjeto,
  instrucaoDaEtapa,
  instrucaoVigente,
  motivoParaRecusarTexto,
  preencherMarcadores,
  versoesVigentes,
} from "./instrucoes";
import { CATALOGO_DE_ETAPAS } from "./instrucoes-catalogo";
import { INSTRUCAO_PADRAO_NEWSLETTER, montarSystemEditorial } from "./newsroom/pipeline";
import { INSTRUCAO_PADRAO_SOCIAL_COPY, montarSystemDaCopy } from "./social/copy";
import { montarSystemDoCarrossel } from "./social/carrossel/copy";
import { ESTRUTURAS } from "./social/carrossel/estrutura";
import { FORMA_DA_MANCHETE, REGRA_DA_MANCHETE, regraDaMancheteVigente } from "./social/manchete";
import { VOZ_SOCIAL } from "./social/voz";
import { montarSystemDoClassificador } from "./editorial/classificador";
import { montarSystemDoVerificador } from "./editorial/verificador";
import { LEITOR } from "./editorial/linha-editorial";

/*
 * RF-26: o trecho editorial é editável, o contrato não. Os testes provam os
 * dois lados, e provam o "não" de cada guarda com um caso que ela recusa.
 */

const PROJETO = "00000000-0000-4000-8000-000000000001";
const OUTRO = "00000000-0000-4000-8000-000000000002";
const marca = { nome: "eua.journal", nicho: "EUA", extra: "Briefing.", assinatura: "Até amanhã." };
const marcaSocial = { nome: "eua.journal", nicho: "EUA", extra: "Briefing.", keyword: "NEWS" };

const TEXTO_NOVO = "Escreva para quem quer abrir uma empresa nos Estados Unidos e ainda está no Brasil.";

/** Um cliente do Supabase de mentira, que devolve as linhas pedidas. */
function clienteCom(linhas: unknown[] | null, erro: string | null = null) {
  const resultado = { data: linhas, error: erro ? { message: erro } : null };
  const consulta: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) consulta[m] = vi.fn(() => consulta);
  consulta.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok);
  const from = vi.fn(() => consulta);
  return { from, consulta };
}

function projetoCom(estado?: string) {
  return { id: PROJETO, settings: estado ? { capacidades: { instrucoes: estado } } : {} };
}

describe("sem ciclo, ou com a capacidade desligada, o prompt é o do código byte a byte", () => {
  it("fora de ciclo o padrão vale", () => {
    expect(instrucaoVigente("newsletter_redacao", "padrão")).toBe("padrão");
    expect(instrucaoDaEtapa(PROJETO, "newsletter_redacao", "padrão")).toBe("padrão");
  });

  it("cada prompt contém o seu trecho editorial padrão", () => {
    expect(montarSystemEditorial(marca)).toContain(INSTRUCAO_PADRAO_NEWSLETTER);
    expect(montarSystemDaCopy(marcaSocial as never)).toContain(INSTRUCAO_PADRAO_SOCIAL_COPY);
    expect(montarSystemDaCopy(marcaSocial as never)).toContain(VOZ_SOCIAL);
    expect(montarSystemDoCarrossel(marcaSocial as never, "explainer", ESTRUTURAS.explainer)).toContain(VOZ_SOCIAL);
    expect(montarSystemDoClassificador()).toContain(LEITOR);
  });

  it("a regra da manchete do código já sai com os números da guarda", () => {
    // Desde 06/10/2026 o prompt pede o ALVO do método (10), e a guarda segue
    // recusando abaixo do piso (6): ver o comentário de FORMA_DA_MANCHETE.
    expect(REGRA_DA_MANCHETE).toContain(
      `de ${FORMA_DA_MANCHETE.alvoMinimoDePalavras} a ${FORMA_DA_MANCHETE.maximoDePalavras} palavras`,
    );
    expect(REGRA_DA_MANCHETE).not.toContain("{{");
    expect(regraDaMancheteVigente()).toBe(REGRA_DA_MANCHETE);
  });

  it("capacidade ausente não consulta o banco", async () => {
    const { from } = clienteCom([{ etapa: "newsletter_redacao", texto: TEXTO_NOVO, versao: 3 }]);
    const prompt = await comInstrucoesDoProjeto(projetoCom(), async () => montarSystemEditorial(marca), {
      cliente: () => ({ from }) as never,
    });
    expect(from).not.toHaveBeenCalled();
    expect(prompt).toContain(INSTRUCAO_PADRAO_NEWSLETTER);
    expect(prompt).not.toContain(TEXTO_NOVO);
  });

  it("em ensaio carrega e NÃO usa", async () => {
    const { from } = clienteCom([{ etapa: "newsletter_redacao", texto: TEXTO_NOVO, versao: 3 }]);
    const prompt = await comInstrucoesDoProjeto(projetoCom("dry_run"), async () => montarSystemEditorial(marca), {
      cliente: () => ({ from }) as never,
    });
    expect(from).toHaveBeenCalled();
    expect(prompt).not.toContain(TEXTO_NOVO);
  });
});

describe("com a capacidade no ar, a versão ativa entra e o contrato fica", () => {
  it("o trecho editorial é trocado e o JSON de saída continua no prompt", async () => {
    const { from } = clienteCom([{ etapa: "newsletter_redacao", texto: TEXTO_NOVO, versao: 3 }]);
    const prompt = await comInstrucoesDoProjeto(projetoCom("enforce"), async () => montarSystemEditorial(marca), {
      cliente: () => ({ from }) as never,
    });
    expect(prompt).toContain(TEXTO_NOVO);
    expect(prompt).not.toContain(INSTRUCAO_PADRAO_NEWSLETTER);
    // O contrato: assinatura e estrutura do JSON não são editáveis.
    expect(prompt).toContain('"Até amanhã."');
    expect(prompt).toContain("ESTRUTURA DO JSON DE SAÍDA");
    expect(prompt).toContain('"subject_options"');
  });

  it("a linha editorial muda nas DUAS leituras juntas", async () => {
    const leitor = "O leitor é o brasileiro que quer investir nos Estados Unidos sem sair do Brasil.";
    const { from } = clienteCom([{ etapa: "linha_editorial_leitor", texto: leitor, versao: 2 }]);
    const [c, v] = await comInstrucoesDoProjeto(
      projetoCom("enforce"),
      async () => [montarSystemDoClassificador(), montarSystemDoVerificador()],
      { cliente: () => ({ from }) as never },
    );
    expect(c).toContain(leitor);
    expect(v).toContain(leitor);
    expect(c).not.toContain(LEITOR);
  });

  it("a manchete editada recebe os números do código nos marcadores", async () => {
    const texto = "A manchete tem de {{minimo_de_palavras}} a {{maximo_de_palavras}} palavras e começa pelo fato.";
    const { from } = clienteCom([{ etapa: "manchete", texto, versao: 1 }]);
    const regra = await comInstrucoesDoProjeto(projetoCom("enforce"), async () => regraDaMancheteVigente(), {
      cliente: () => ({ from }) as never,
    });
    expect(regra).toBe(
      `A manchete tem de ${FORMA_DA_MANCHETE.minimoDePalavras} a ${FORMA_DA_MANCHETE.maximoDePalavras} palavras e começa pelo fato.`,
    );
  });

  it("o ciclo sabe qual versão estava valendo", async () => {
    const { from } = clienteCom([{ etapa: "voz_social", texto: TEXTO_NOVO, versao: 7 }]);
    const versoes = await comInstrucoesDoProjeto(projetoCom("enforce"), async () => versoesVigentes(), {
      cliente: () => ({ from }) as never,
    });
    expect(versoes).toEqual({ voz_social: 7 });
  });

  it("NÃO: a instrução de um projeto não vale para outro", async () => {
    const { from } = clienteCom([{ etapa: "newsletter_redacao", texto: TEXTO_NOVO, versao: 3 }]);
    const texto = await comInstrucoesDoProjeto(
      projetoCom("enforce"),
      async () => instrucaoDaEtapa(OUTRO, "newsletter_redacao", "padrão do outro"),
      { cliente: () => ({ from }) as never },
    );
    expect(texto).toBe("padrão do outro");
  });

  it("NÃO: leitura que falha vira texto do código, e não erro do dia", async () => {
    const { from } = clienteCom(null, "relation \"instrucoes_editoriais\" does not exist");
    const prompt = await comInstrucoesDoProjeto(projetoCom("enforce"), async () => montarSystemEditorial(marca), {
      cliente: () => ({ from }) as never,
    });
    expect(prompt).toContain(INSTRUCAO_PADRAO_NEWSLETTER);
  });
});

describe("a guarda do texto", () => {
  it("NÃO aceita texto curto demais", () => {
    expect(motivoParaRecusarTexto("curto")).toMatch(/mínimo/);
  });

  it("NÃO aceita estrutura de JSON, que é contrato", () => {
    expect(motivoParaRecusarTexto(`Responda com {"headline": "x", "gancho": "y"} e mais nada, sempre assim.`)).toMatch(
      /JSON/,
    );
  });

  it("NÃO aceita o que não é texto", () => {
    expect(motivoParaRecusarTexto(42)).not.toBeNull();
  });

  it.each(CATALOGO_DE_ETAPAS.map((d) => [d.etapa, d.padrao]))("aceita o padrão do código de %s", (_, padrao) => {
    expect(motivoParaRecusarTexto(padrao)).toBeNull();
  });

  it("linha gravada por fora que a guarda recusa não vale", async () => {
    const { from } = clienteCom([
      { etapa: "newsletter_redacao", texto: "curto", versao: 9 },
      { etapa: "etapa_que_nao_existe", texto: TEXTO_NOVO, versao: 1 },
    ]);
    const { instrucoes } = await carregarInstrucoesAtivas({ from } as never, PROJETO);
    expect(instrucoes.size).toBe(0);
  });
});

describe("entrar no contexto no meio do ciclo", () => {
  it("vale dali em diante na mesma função, e NÃO vaza para quem chamou", async () => {
    const { from } = clienteCom([{ etapa: "newsletter_redacao", texto: TEXTO_NOVO, versao: 3 }]);

    async function cicloDeMentira(): Promise<string> {
      const ctx = await prepararInstrucoesDoProjeto(projetoCom("enforce"), { cliente: () => ({ from }) as never });
      entrarNasInstrucoes(ctx);
      await new Promise((r) => setTimeout(r, 1));
      return instrucaoVigente("newsletter_redacao", "padrão");
    }

    expect(await cicloDeMentira()).toBe(TEXTO_NOVO);
    expect(instrucaoVigente("newsletter_redacao", "padrão")).toBe("padrão");
  });
});

describe("marcadores", () => {
  it("preenche os conhecidos e deixa o desconhecido à vista", () => {
    expect(preencherMarcadores("{{a}} e {{b}}", { a: 1 })).toBe("1 e {{b}}");
  });
});

describe("a lista de etapas é uma só", () => {
  it("o CHECK da migration aceita exatamente as etapas do código", () => {
    const sql = readFileSync("supabase/migrations/20261005170000_instrucoes_editoriais.sql", "utf8");
    const bloco = /etapa in \(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? "";
    const doSql = [...bloco.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(doSql).toEqual([...ETAPAS_EDITORIAIS]);
  });

  it("o catálogo do painel cobre todas as etapas, na mesma ordem", () => {
    expect(CATALOGO_DE_ETAPAS.map((d) => d.etapa)).toEqual([...ETAPAS_EDITORIAIS]);
  });
});
