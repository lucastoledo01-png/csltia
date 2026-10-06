import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { detectarRostos, esquecerRostos, lerRostos, recortarComoNaPeca } from "./rostos-na-foto";

/** Uma foto deitada, 400x200: metade esquerda vermelha, metade direita azul. */
async function fotoDeitada(): Promise<Buffer> {
  const vermelho = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer();
  return sharp({ create: { width: 400, height: 200, channels: 3, background: "#0000ff" } })
    .composite([{ input: vermelho, left: 0, top: 0 }])
    .jpeg()
    .toBuffer();
}

function respostaDoModelo(conteudo: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(conteudo) } }],
      usage: { prompt_tokens: 1200, completion_tokens: 60, total_tokens: 1260 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function fetcherFalso(conteudo: unknown, foto: Buffer) {
  const corpos: Array<Record<string, unknown>> = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const alvo = String(url);
    if (alvo.includes("api.openai.com")) {
      corpos.push(JSON.parse(String(init?.body)));
      return respostaDoModelo(conteudo);
    }
    return new Response(foto, { status: 200, headers: { "content-type": "image/jpeg" } });
  }) as unknown as typeof fetch;
  return { fetcher, corpos };
}

const ENV = { OPENAI_API_KEY: "chave" };

beforeEach(() => esquecerRostos());

describe("a resposta do modelo, conferida", () => {
  it("caixas em fração passam, e o que vaza da borda é aparado", () => {
    expect(lerRostos({ rostos: [{ x: 0.9, y: -0.02, largura: 0.2, altura: 0.3 }] })).toEqual([
      { x: 0.9, y: 0, largura: expect.closeTo(0.1, 6), altura: expect.closeTo(0.28, 6) },
    ]);
  });

  it("lista vazia é foto sem rosto, e é resposta válida", () => {
    expect(lerRostos({ rostos: [] })).toEqual([]);
  });

  it("coordenada em pixel no lugar de fração é recusa, e não conserto", () => {
    expect(lerRostos({ rostos: [{ x: 300, y: 120, largura: 200, altura: 240 }] })).toMatch(/fora da escala/);
  });

  it("forma errada é recusa", () => {
    expect(lerRostos({})).toMatch(/sem a lista/);
    expect(lerRostos({ rostos: [{ x: "meio", y: 0, largura: 0.1, altura: 0.1 }] })).toMatch(/não é número/);
    expect(lerRostos({ rostos: [{ x: 0.1, y: 0.1, largura: 0, altura: 0.1 }] })).toMatch(/sem área/);
  });
});

describe("o recorte que vai ao modelo é o que a peça mostra", () => {
  it("foto deitada perde as laterais, e sai em 3:4", async () => {
    const recorte = await recortarComoNaPeca(await fotoDeitada(), { width: 1080, height: 1440 });
    const meta = await sharp(recorte).metadata();
    expect([meta.width, meta.height]).toEqual([768, 1024]);

    // O cover centraliza: de 400 de largura sobram 150, de 125 a 275. A borda
    // esquerda do recorte ainda é vermelha e a direita é azul, e a fronteira
    // (o x 200 do arquivo) cai no meio do recorte.
    const { data, info } = await sharp(recorte).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    expect(pixel(10, 500)[0]).toBeGreaterThan(200);
    expect(pixel(758, 500)[2]).toBeGreaterThan(200);
    expect(pixel(Math.round(768 * 0.4), 500)[0]).toBeGreaterThan(200);
    expect(pixel(Math.round(768 * 0.6), 500)[2]).toBeGreaterThan(200);
  });
});

describe("a detecção", () => {
  it("sem chave não pergunta, e não finge que não há rosto", async () => {
    const r = await detectarRostos("https://x/foto.jpg", { env: {}, fetcher: vi.fn() as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/sem credencial/) });
  });

  it("pede resposta com esquema estrito, e devolve as caixas com o custo", async () => {
    const { fetcher, corpos } = fetcherFalso({ rostos: [{ x: 0.3, y: 0.1, largura: 0.4, altura: 0.45 }] }, await fotoDeitada());
    const r = await detectarRostos("https://x/foto.jpg", { env: ENV, fetcher });
    expect(r).toMatchObject({
      ok: true,
      emCache: false,
      rostos: [{ x: 0.3, y: 0.1, largura: expect.closeTo(0.4, 6), altura: expect.closeTo(0.45, 6) }],
    });
    if (r.ok) expect(r.custoUsd).toBeGreaterThan(0);

    const formato = corpos[0].response_format as { type: string; json_schema: { strict: boolean } };
    expect(formato.type).toBe("json_schema");
    expect(formato.json_schema.strict).toBe(true);
    // A imagem vai embutida, já recortada, e não como o endereço do arquivo inteiro.
    const partes = (corpos[0].messages as Array<{ content: unknown }>)[1].content as Array<{ image_url?: { url: string } }>;
    expect(partes[1].image_url?.url.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("a mesma foto não é perguntada duas vezes, e a segunda não paga", async () => {
    const { fetcher, corpos } = fetcherFalso({ rostos: [] }, await fotoDeitada());
    await detectarRostos("https://x/foto.jpg", { env: ENV, fetcher });
    const segunda = await detectarRostos("https://x/foto.jpg", { env: ENV, fetcher });
    expect(corpos).toHaveLength(1);
    expect(segunda).toMatchObject({ ok: true, emCache: true, custoUsd: 0, tokens: 0 });
  });

  it("falha não fica guardada: a próxima chamada tenta de novo", async () => {
    const { fetcher, corpos } = fetcherFalso({ rostos: [{ x: 500, y: 0, largura: 1, altura: 1 }] }, await fotoDeitada());
    const primeira = await detectarRostos("https://x/foto.jpg", { env: ENV, fetcher });
    expect(primeira).toMatchObject({ ok: false, motivo: expect.stringMatching(/fora da escala/) });
    await detectarRostos("https://x/foto.jpg", { env: ENV, fetcher });
    expect(corpos).toHaveLength(2);
  });

  it("foto que não abre é falha, com o motivo", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const r = await detectarRostos("https://x/sumiu.jpg", { env: ENV, fetcher });
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/não deu para abrir a foto: foto respondeu 404/) });
  });

  it("o modelo que recusa temperature 0 é chamado de novo sem o parâmetro", async () => {
    const foto = await fotoDeitada();
    let chamadas = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (!String(url).includes("api.openai.com")) return new Response(foto, { status: 200, headers: { "content-type": "image/jpeg" } });
      chamadas += 1;
      if (chamadas === 1) return new Response("Unsupported value: 'temperature'", { status: 400 });
      return respostaDoModelo({ rostos: [] });
    }) as unknown as typeof fetch;
    const r = await detectarRostos("https://x/foto.jpg", { env: ENV, fetcher });
    expect(r.ok).toBe(true);
    expect(chamadas).toBe(2);
  });
});
