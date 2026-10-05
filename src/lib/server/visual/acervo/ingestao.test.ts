import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ALTURA_DO_DERIVADO, LARGURA_DO_DERIVADO, orientacaoDe, produzirDerivado, tomDe } from "./medida";
import {
  ampliacaoNecessaria,
  caminhoNoBucket,
  linhaDoAcervo,
  listarPasta,
  planejarArquivo,
  recusarDuplicatas,
  type ArquivoPlanejado,
} from "./ingestao";

/**
 * A ingestão mede de verdade: as imagens aqui são geradas pelo sharp, com cor
 * e tamanho conhecidos, e o teste confere o que sai dos pixels. Tom e
 * orientação nunca vêm do nome (decisão de 29/09/2026).
 */

const PROJETO = "00000000-0000-4000-8000-000000000001";
let pasta = "";

async function imagem(nome: string, largura: number, altura: number, cor: string) {
  const buffer = await sharp({ create: { width: largura, height: altura, channels: 3, background: cor } })
    .jpeg()
    .toBuffer();
  await fs.writeFile(path.join(pasta, nome), buffer);
  return path.join(pasta, nome);
}

beforeAll(async () => {
  pasta = await fs.mkdtemp(path.join(os.tmpdir(), "acervo-"));
});

afterAll(async () => {
  await fs.rm(pasta, { recursive: true, force: true });
});

describe("medida nos pixels", () => {
  it("orientação e tom pelas regras", () => {
    expect(orientacaoDe(4000, 3000)).toBe("paisagem");
    expect(orientacaoDe(3000, 4000)).toBe("retrato");
    expect(orientacaoDe(3000, 3050)).toBe("quadrada");
    expect(tomDe(0.8)).toBe("claro");
    expect(tomDe(0.2)).toBe("escuro");
  });

  it("foto clara deitada: paisagem, claro, e o derivado sai 2160x2880", async () => {
    const d = await produzirDerivado(
      await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#f0f0f0" } }).png().toBuffer(),
    );
    const meta = await sharp(d.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([LARGURA_DO_DERIVADO, ALTURA_DO_DERIVADO]);
    expect(meta.format).toBe("jpeg");
    expect(d.medida.orientacao).toBe("paisagem");
    expect(d.medida.tom).toBe("claro");
    expect(d.medida.luminancia).toBeGreaterThan(0.9);
  });

  it("foto escura em pé: retrato, escuro", async () => {
    const d = await produzirDerivado(
      await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "#101018" } }).png().toBuffer(),
    );
    expect(d.medida.orientacao).toBe("retrato");
    expect(d.medida.tom).toBe("escuro");
  });
});

describe("planejar a ingestão", () => {
  it("arquivo bem nomeado vira plano, com tag, país e caminho no bucket", async () => {
    const origem = await imagem("moradia-eua-rua_residencial-outono-01.jpg", 2400, 3200, "#808080");
    const plano = await planejarArquivo(PROJETO, origem);

    expect(plano.ok).toBe(true);
    const p = plano as ArquivoPlanejado;
    expect(p.nome.tag).toBe("moradia/rua_residencial");
    expect(p.caminho).toBe(`${PROJETO}/moradia/moradia-eua-rua_residencial-outono-01.jpg`);
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);

    const linha = linhaDoAcervo(PROJETO, p, "https://x/acervo/a.jpg", { originalRef: "drive://pasta" });
    expect(linha).toMatchObject({
      project_id: PROJETO,
      tag: "moradia/rua_residencial",
      pais: "eua",
      repositorio: "supabase_storage",
      bucket: "acervo",
      original_repositorio: "drive",
      original_ref: "drive://pasta",
      largura: 2160,
      altura: 2880,
    });
    expect(["claro", "escuro"]).toContain(linha.tom);
  });

  it("original pequeno demais é recusado: ampliar mais de 2x deixa a foto mole na peça", async () => {
    const origem = await imagem("moradia-eua-rua_residencial-pequena-02.jpg", 800, 1000, "#808080");
    const plano = await planejarArquivo(PROJETO, origem);
    expect(plano.ok).toBe(false);
    expect(!plano.ok && plano.motivo).toContain("ampliado");
    expect(ampliacaoNecessaria(800, 1000)).toBeGreaterThan(2);
  });

  it("nome fora do formato é recusado antes de abrir o arquivo", async () => {
    const origem = await imagem("foto da casa.jpg", 2400, 3200, "#808080");
    const plano = await planejarArquivo(PROJETO, origem);
    expect(plano.ok).toBe(false);
  });

  it("cena de terceiro país é recusada na porta", async () => {
    const origem = await imagem("moradia-mx-rua_residencial-centro-01.jpg", 2400, 3200, "#808080");
    const plano = await planejarArquivo(PROJETO, origem);
    expect(plano.ok).toBe(false);
    expect(!plano.ok && plano.motivo).toContain("terceiro país");
  });

  it("o mesmo arquivo com dois nomes entra uma vez só", async () => {
    const buffer = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "#336699" } })
      .jpeg()
      .toBuffer();
    const a = path.join(pasta, "transporte-eua-trem-estacao-01.jpg");
    const b = path.join(pasta, "transporte-eua-metro-estacao-01.jpg");
    await fs.writeFile(a, buffer);
    await fs.writeFile(b, buffer);

    const planos = recusarDuplicatas([await planejarArquivo(PROJETO, a), await planejarArquivo(PROJETO, b)]);
    expect(planos.map((p) => p.ok)).toEqual([true, false]);
  });

  it("lista só imagens, em ordem, ignorando arquivo oculto", async () => {
    await fs.writeFile(path.join(pasta, ".DS_Store"), "");
    await fs.writeFile(path.join(pasta, "leia-me.txt"), "");
    const arquivos = await listarPasta(pasta);
    expect(arquivos.every((a) => /\.jpe?g$/.test(a))).toBe(true);
    expect([...arquivos].sort()).toEqual(arquivos);
  });

  it("o caminho do derivado é sempre .jpg, mesmo vindo de PNG", () => {
    const caminho = caminhoNoBucket(PROJETO, {
      arquivo: "clima-eua-furacao-costa-01.png",
      grupo: "clima",
      pais: "eua",
      assunto: "furacao",
      detalhe: "costa",
      numero: 1,
      tag: "clima/furacao",
      noCatalogo: true,
    });
    expect(caminho.endsWith("clima-eua-furacao-costa-01.jpg")).toBe(true);
  });
});
