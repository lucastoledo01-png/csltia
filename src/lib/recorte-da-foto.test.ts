import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recorteDaFoto } from "./imagem-da-capa";

describe("recorteDaFoto: o excesso sai do pé, nunca do alto (06/10/2026)", () => {
  it("foto de gente, em pé ou deitada, corta pelo pé", () => {
    const caiado =
      "https://upload.wikimedia.org/wikipedia/commons/f/f5/Foto_oficial_do_governador_de_Goi%C3%A1s%2C_Ronaldo_Caiado_em_2023_%28ombros%29.jpg";
    expect(recorteDaFoto(caiado)).toEqual({ classe: "object-top", css: "object-position:center top;" });
    expect(recorteDaFoto("https://images.pexels.com/photos/1/a.jpeg?w=600").classe).toBe("object-top");
    expect(recorteDaFoto(null).classe).toBe("object-top");
  });

  it("o cartão do logotipo, desenhado para o corte central, fica no centro", () => {
    const cartao = "https://casaloti.ia.br/api/visual/cartao-da-marca?arquivo=Meta%20Platforms%20Inc.%20logo.svg";
    expect(recorteDaFoto(cartao).classe).toBe("object-center");
  });
});

/*
 * A regra vale para TODA capa do portal e da newsletter. Quem desenhar uma foto
 * nova com `object-cover` sem passar por `recorteDaFoto` volta a cortar a cara.
 * Ficam de fora o que não é foto de matéria: avatar redondo, telas do admin
 * (a arte do post já vem montada) e as páginas do ultraprompts.
 */
const FORA_DA_REGRA = [/rounded-full/, /\/admin\//, /Admin[A-Z]\w+\.tsx$/, /\/ultraprompts\//];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("toda capa com object-cover passa pelo recorte", () => {
  it("nenhum object-cover de foto de matéria sem recorteDaFoto", () => {
    const raiz = join(__dirname, "..");
    const faltando: string[] = [];
    for (const arquivo of [...arquivos(join(raiz, "components")), ...arquivos(join(raiz, "app"))]) {
      if (FORA_DA_REGRA.some((r) => r.test(arquivo))) continue;
      readFileSync(arquivo, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (/object-cover/.test(linha) && !/recorteDaFoto/.test(linha) && !FORA_DA_REGRA.some((r) => r.test(linha))) {
            faltando.push(`${arquivo.slice(raiz.length + 1)}:${i + 1}`);
          }
        });
    }
    expect(faltando).toEqual([]);
  });

  it("o e-mail da newsletter leva a posição do recorte em cada foto", () => {
    const servico = readFileSync(join(__dirname, "server/newsroom/newsroom-service.ts"), "utf8");
    const fotos = servico.match(/style="\$\{ESTILO_DA_FOTO\}[^"]*"/g) ?? [];
    expect(fotos.length).toBeGreaterThan(0);
    for (const f of fotos) expect(f).toContain("recorteDaFoto(");
  });
});
