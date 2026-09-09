import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  conferirArte,
  congelarArtefato,
  escolherArquivo,
  LIMITE_INTERNO_DE_BYTES,
  sha256De,
  TETO_DA_META,
} from "./artefato";
import { DIAGNOSTICOS_DE_LAYOUT } from "./arte";
import type { ArteRenderizada } from "./arte";

/**
 * Congelar a peça aprovada num arquivo.
 *
 * O que se testa aqui é a fronteira entre "a peça foi aprovada" e "existe um
 * arquivo que é aquela peça". Tudo que pode reprovar acontece ANTES do upload,
 * porque arquivo no Storage que não pode publicar é lixo com URL.
 */

const PNG_PEQUENO = Buffer.from("png-pequeno");
const JPEG_PEQUENO = Buffer.from("jpeg-pequeno");

/**
 * A arte renderizada, no formato que `conferirArte` e `escolherArquivo` leem.
 *
 * O tipo é explícito porque `diagnosticoDoLayout` é uma união fechada: sem
 * anotar, o literal vira `string` e o dublê deixa de casar com o tipo real,
 * escondendo justamente a diferença que o tipo existe para pegar.
 */
function arte(over: Partial<ArteRenderizada> = {}): ArteRenderizada {
  return {
    capa: { comFoto: false, motivoSemFoto: "NO_VALID_IMAGE" },
    html: "",
    png: PNG_PEQUENO,
    jpeg: Buffer.from("jpeg-preview"),
    jpegPublicavel: JPEG_PEQUENO,
    largura: 2160,
    altura: 2880,
    fontesQueFaltaram: [],
    temaDegradado: "",
    usouLayoutDesenhado: false,
    diagnosticoDoLayout: DIAGNOSTICOS_DE_LAYOUT.SEM_FOTO,
    ...over,
  } as ArteRenderizada;
}

describe("o que reprova a peça antes de virar arquivo", () => {
  it("peça sadia passa", () => {
    expect(conferirArte(arte(), false)).toBeNull();
  });

  it("tema que não veio do banco reprova: canvas e paleta sairiam diferentes", () => {
    const r = conferirArte(arte({ temaDegradado: "banco inacessível" }), false);
    expect(r).toContain("tema não veio do banco");
  });

  it("fonte que não carregou reprova: o corpo do texto é medido com a fonte real", () => {
    const r = conferirArte(arte({ fontesQueFaltaram: ["Playfair Display"] }), false);
    expect(r).toContain("Playfair Display");
  });

  it("pauta com foto e arte sem foto reprova", () => {
    const semFoto = { ...arte().capa, comFoto: false, motivoSemFoto: "ASSET_DOWNLOAD_FAILED" };
    const r = conferirArte(arte({ capa: semFoto }), true);
    expect(r).toContain("foto aprovada");
  });

  it("pauta sem foto e arte sem foto é o caso normal do brand card", () => {
    expect(conferirArte(arte(), false)).toBeNull();
  });

  it("dimensão zerada reprova", () => {
    expect(conferirArte(arte({ largura: 0 }), false)).toContain("dimensão inválida");
  });
});

describe("qual arquivo publica", () => {
  it("PNG quando ele cabe, porque é sem perda", () => {
    const r = escolherArquivo({ png: PNG_PEQUENO, jpegPublicavel: JPEG_PEQUENO });
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) {
      expect(r.mime).toBe("image/png");
      expect(r.otimizado).toBe(false);
    }
  });

  it("JPEG quando o PNG estoura o limite interno", () => {
    /*
     * A peça com fotografia deu 5,5 MB de PNG numa medição real, a uma foto
     * mais detalhada de passar do limite. Os dois arquivos saem do MESMO
     * desenho, então a troca não muda o que se vê.
     */
    const r = escolherArquivo({
      png: Buffer.alloc(LIMITE_INTERNO_DE_BYTES + 1),
      jpegPublicavel: JPEG_PEQUENO,
    });
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) {
      expect(r.mime).toBe("image/jpeg");
      expect(r.extensao).toBe("jpg");
      expect(r.otimizado).toBe(true);
    }
  });

  it("nenhum dos dois cabendo, não publica: reduzir resolução seria outra peça", () => {
    const r = escolherArquivo({
      png: Buffer.alloc(LIMITE_INTERNO_DE_BYTES + 1),
      jpegPublicavel: Buffer.alloc(LIMITE_INTERNO_DE_BYTES + 1),
    });
    expect("erro" in r).toBe(true);
  });

  it("o limite interno fica abaixo do teto da Meta, com margem", () => {
    // A margem existe porque o teto deles não é o único número em jogo.
    expect(LIMITE_INTERNO_DE_BYTES).toBeLessThan(TETO_DA_META);
    expect(TETO_DA_META - LIMITE_INTERNO_DE_BYTES).toBeGreaterThanOrEqual(1024 * 1024);
  });
});

describe("congelar de ponta a ponta", () => {
  const capa = { headline: "USCIS muda prazo do I-765", eixo: "processo", asset: null };

  it("sobe o arquivo e sela com o hash dos bytes que subiram", async () => {
    const subidos: Array<{ caminho: string; bytes: Buffer }> = [];
    const r = await congelarArtefato({
      capa,
      path: "imigra-us/2026-09-06/social-v2-2026-09-06-s1",
      renderizar: (async () => [arte()]) as never,
      subir: async (bytes, caminho) => {
        subidos.push({ caminho, bytes });
        return `https://storage.exemplo/${caminho}`;
      },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(subidos).toHaveLength(1);
    // O hash é dos bytes que efetivamente subiram, não do que se pretendia subir.
    expect(r.artefato.sha256).toBe(sha256De(subidos[0].bytes));
    expect(r.artefato.sha256).toBe(crypto.createHash("sha256").update(PNG_PEQUENO).digest("hex"));
    expect(r.artefato.bytes).toBe(PNG_PEQUENO.byteLength);
    expect(r.artefato.path).toBe("imigra-us/2026-09-06/social-v2-2026-09-06-s1/social-v2.png");
    expect(r.artefato.url).toContain("social-v2.png");
  });

  it("peça reprovada não sobe nada", async () => {
    const subir = vi.fn();
    const r = await congelarArtefato({
      capa,
      path: "p",
      renderizar: (async () => [arte({ fontesQueFaltaram: ["Epilogue"] })]) as never,
      subir: subir as never,
    });

    expect(r.ok).toBe(false);
    expect(subir).not.toHaveBeenCalled();
  });

  it("arquivo grande demais não sobe nada", async () => {
    const subir = vi.fn();
    const r = await congelarArtefato({
      capa,
      path: "p",
      renderizar: (async () => [
        arte({
          png: Buffer.alloc(LIMITE_INTERNO_DE_BYTES + 1),
          jpegPublicavel: Buffer.alloc(LIMITE_INTERNO_DE_BYTES + 1),
        }),
      ]) as never,
      subir: subir as never,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("limite interno");
    expect(subir).not.toHaveBeenCalled();
  });

  it("otimização troca o formato e o hash é o do arquivo otimizado", async () => {
    const grande = Buffer.alloc(LIMITE_INTERNO_DE_BYTES + 1, 7);
    const r = await congelarArtefato({
      capa,
      path: "p",
      renderizar: (async () => [arte({ png: grande, jpegPublicavel: JPEG_PEQUENO })]) as never,
      subir: async (_b, caminho) => `https://storage.exemplo/${caminho}`,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.artefato.otimizado).toBe(true);
    expect(r.artefato.filename).toBe("social-v2.jpg");
    // Persiste SOMENTE a versão efetivamente aprovada: o hash é do JPEG.
    expect(r.artefato.sha256).toBe(sha256De(JPEG_PEQUENO));
    expect(r.artefato.bytes).toBe(JPEG_PEQUENO.byteLength);
  });

  it("falha no upload não vira artefato", async () => {
    const r = await congelarArtefato({
      capa,
      path: "p",
      renderizar: (async () => [arte()]) as never,
      subir: async () => null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("falha ao subir");
  });

  it("o mesmo desenho dá o mesmo hash", async () => {
    const congelar = () =>
      congelarArtefato({
        capa,
        path: "p",
        renderizar: (async () => [arte()]) as never,
        subir: async (_b, c) => `https://storage.exemplo/${c}`,
      });

    const a = await congelar();
    const b = await congelar();
    expect(a.ok && b.ok && a.artefato.sha256).toBe(b.ok ? b.artefato.sha256 : "");
  });
});
