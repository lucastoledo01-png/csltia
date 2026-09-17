import { describe, expect, it, vi } from "vitest";
import { resolveVisualAsset } from "./resolver";
import type { Conferente } from "./resolver";
import { ehUltimoRecurso } from "./bandeira";
import { MOTIVOS_DE_RECUSA } from "./tipos";

/**
 * A escolha da imagem virou laço, e não carimbo.
 *
 * Antes de 17/09/2026 o resolvedor pegava a primeira colocada da pontuação e
 * seguia. Como nenhuma barreira abria a imagem, a primeira colocada podia ser
 * a Escola Superior de Economia de Perm, na Rússia, numa pauta sobre o programa
 * PERM do Departamento do Trabalho americano.
 *
 * Agora a primeira colocada é conferida. Se reprovar, a vez passa para a
 * seguinte. Se todas reprovarem, a pauta cai na bandeira, que é peça
 * publicável e nunca está errada.
 */

/** Commons com DUAS fotos, para haver uma seguinte a quem passar a vez. */
function commonsComDuasFotos() {
  return vi.fn(async (entrada: string | URL) => {
    const url = String(entrada);

    if (url.includes("wikidata.org") && url.includes("wbsearchentities")) {
      return new Response(
        JSON.stringify({ search: [{ id: "Q1", label: "Departamento do Trabalho", description: "agência" }] }),
        { status: 200 },
      );
    }

    if (url.includes("wikidata.org") && url.includes("wbgetentities")) {
      return new Response(
        JSON.stringify({
          entities: {
            Q1: {
              claims: {
                P31: [{ mainsnak: { datavalue: { value: { id: "Q327333" } } } }],
                P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }],
                P373: [{ mainsnak: { datavalue: { value: "Department of Labor" } } }],
              },
            },
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes("commons.wikimedia.org")) {
      const foto = (nome: string, descricao: string) => ({
        title: `File:${nome}`,
        imageinfo: [
          {
            url: `https://upload.wikimedia.org/${nome}`,
            descriptionurl: `https://commons.wikimedia.org/wiki/File:${nome}`,
            width: 2400,
            height: 1600,
            mime: "image/jpeg",
            extmetadata: {
              LicenseShortName: { value: "Public domain" },
              Artist: { value: "<a href='#'>Autor</a>" },
              ImageDescription: { value: descricao },
            },
          },
        ],
      });

      return new Response(
        JSON.stringify({
          query: {
            pages: {
              "1": foto("Perm.jpg", "Department of Labor perm"),
              "2": foto("Washington.jpg", "Department of Labor headquarters Washington"),
            },
          },
        }),
        { status: 200 },
      );
    }

    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

const PAUTA = {
  storyId: "perm",
  titulo: "Quem busca contratação permanente depende da prova da empresa no PERM",
  resumo: "Na certificação permanente de trabalho, o empregador envia a solicitação ao DOL.",
  categoria: "imigracao",
  classificacao: {
    atores: ["Departamento do Trabalho"],
    lugares: ["Estados Unidos"],
    acontecimento: ["processo"],
  },
};

/** Reprova tudo que tiver `marca` no identificador. */
function conferenteQueReprova(marca: string): Conferente {
  return async (asset) => {
    const ruim = `${asset.sourceAssetId} ${asset.imageUrl}`.toLowerCase().includes(marca);
    return {
      aprovada: !ruim,
      descricao: ruim ? "prédio com letreiro em cirílico" : "fachada do órgão em Washington",
      motivo: ruim ? "a cena é de outro país" : "é o órgão da manchete",
      paisAparente: ruim ? "Rússia" : "Estados Unidos",
      confianca: 95,
      falhou: false,
    };
  };
}

describe("o laço de conferência visual", () => {
  it("passa a vez para a seguinte quando a primeira reprova", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
      conferenciaVisual: conferenteQueReprova("perm"),
    });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.imageUrl).toContain("Washington");
    expect(r.asset?.imageUrl).not.toContain("Perm");
  });

  it("registra a recusa com o que foi visto, para o relatório não mentir", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
      conferenciaVisual: conferenteQueReprova("perm"),
    });

    const recusa = r.recusados.find(
      (c) => c.motivo === MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_REPROVOU,
    );
    expect(recusa).toBeTruthy();
    expect(recusa?.detalhe).toContain("cirílico");
  });

  it("guarda no asset aprovado o que a conferência viu", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
      conferenciaVisual: conferenteQueReprova("perm"),
    });

    expect(r.asset?.conferenciaVisual?.paisAparente).toBe("Estados Unidos");
    expect(r.asset?.conferenciaVisual?.confianca).toBe(95);
  });

  /**
   * O ponto da regra do dono, de 17/09/2026: nenhuma peça fica sem foto, e
   * nenhuma peça sai com foto errada. As duas coisas ao mesmo tempo só fecham
   * porque existe a bandeira.
   */
  it("todas reprovadas cai na bandeira, e não em peça de texto", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
      conferenciaVisual: async () => ({
        aprovada: false,
        descricao: "uma paisagem sem relação",
        motivo: "não tem relação reconhecível com o assunto",
        paisAparente: null,
        confianca: 90,
        falhou: false,
      }),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(r.asset).toBeTruthy();
    expect(ehUltimoRecurso(r.asset!)).toBe(true);
  });

  /**
   * Falha de conferência não é passe livre.
   *
   * Sem chave ou com a rede fora, a saída é a bandeira. O motivo gravado
   * separa "estava errada" de "não deu para conferir", que exigem providências
   * diferentes de quem lê o relatório.
   */
  it("conferência indisponível recusa, e diz que foi indisponibilidade", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
      conferenciaVisual: async () => ({
        aprovada: false,
        descricao: "",
        motivo: "conferência visual falhou: timeout",
        paisAparente: null,
        confianca: 0,
        falhou: true,
      }),
    });

    expect(r.status).toBe("NO_VALID_IMAGE");
    expect(
      r.recusados.some(
        (c) => c.motivo === MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL,
      ),
    ).toBe(true);
  });

  /**
   * Sem conferente o comportamento é o antigo, e isso é o que mantém o dry-run
   * e a medição de capacidade rodando sem gastar chamada de modelo.
   */
  it("desligada, escolhe a primeira colocada como antes", async () => {
    const r = await resolveVisualAsset(PAUTA, {
      fetcher: commonsComDuasFotos(),
      somenteLeitura: true,
      conferenciaVisual: false,
    });

    expect(r.status).toBe("SELECTED");
    expect(r.asset?.conferenciaVisual).toBeUndefined();
  });
});
