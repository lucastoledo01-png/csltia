import { describe, expect, it } from "vitest";
import { identidadeDaImagem, semImagemDaCapaNoCorpo, usoDasCapas } from "./imagem-da-capa";

const WALL_STREET =
  "https://upload.wikimedia.org/wikipedia/commons/d/db/New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg";

describe("identidadeDaImagem", () => {
  it("ignora tamanho, consulta e &amp; do Pexels", () => {
    const a = "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=1200";
    const b = "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&amp;cs=tinysrgb&amp;w=600";
    expect(identidadeDaImagem(a)).toBe(identidadeDaImagem(b));
  });

  it("a miniatura do Commons é a mesma foto que o original", () => {
    const miniatura =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg/1280px-New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg";
    expect(identidadeDaImagem(miniatura)).toBe(identidadeDaImagem(WALL_STREET));
  });

  it("o endereço do otimizador do Next é a foto original", () => {
    const otimizada = `/_next/image?url=${encodeURIComponent(WALL_STREET)}&w=1920&q=75`;
    expect(identidadeDaImagem(otimizada)).toBe(identidadeDaImagem(WALL_STREET));
  });

  it("fotos diferentes continuam diferentes", () => {
    expect(identidadeDaImagem(WALL_STREET)).not.toBe(
      identidadeDaImagem("https://upload.wikimedia.org/wikipedia/commons/9/9b/Close_up_of_Flock_camera.jpg"),
    );
  });

  it("vazio para endereço vazio", () => {
    expect(identidadeDaImagem(null)).toBe("");
    expect(identidadeDaImagem("  ")).toBe("");
  });
});

describe("semImagemDaCapaNoCorpo: a capa não aparece de novo embaixo dela", () => {
  // O caso real: a edição de 04/10 publicada como artigo, com a foto da
  // primeira pauta no corpo e o crédito do Commons logo depois.
  const corpoDaEdicao =
    `<h2>Hollywood nos EUA atrai capital privado</h2>` +
    `<img src="${WALL_STREET}" alt="" width="600" height="360" style="width:100%" />` +
    `<p style="font-size:12px">Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons</p>` +
    `<p>Investidores privados estão entrando no financiamento de Hollywood.</p>` +
    `<img src="https://casaloti.ia.br/marca/whatsapp.png" alt="WhatsApp" />`;

  it("tira a foto igual à capa, mesmo com outro endereço", () => {
    const capaComTamanho = WALL_STREET.replace("/commons/d/db/", "/commons/thumb/d/db/") + "/1280px-x.jpg";
    const { html, removidas } = semImagemDaCapaNoCorpo(corpoDaEdicao, capaComTamanho);
    expect(removidas).toBe(1);
    expect(html).not.toContain("Wall_Street");
    expect(html).toContain("Investidores privados");
    // Ícone de marca não é a capa e fica.
    expect(html).toContain("whatsapp.png");
  });

  it("o crédito da foto sai do corpo e volta como crédito da capa", () => {
    const { html, creditoDaCapa } = semImagemDaCapaNoCorpo(corpoDaEdicao, WALL_STREET);
    expect(creditoDaCapa).toBe("Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons");
    expect(html).not.toContain("Dietmar Rabich");
  });

  it("parágrafo comum depois da foto não é confundido com crédito", () => {
    const corpo = `<img src="${WALL_STREET}" /><p>O Fed manteve os juros.</p>`;
    const { html, creditoDaCapa } = semImagemDaCapaNoCorpo(corpo, WALL_STREET);
    expect(creditoDaCapa).toBeNull();
    expect(html).toBe("<p>O Fed manteve os juros.</p>");
  });

  it("foto com &amp; no src também é reconhecida", () => {
    const capa = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&w=1200";
    const corpo = `<figure><img src="https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&amp;w=600"><figcaption>Foto: Fulano / Pexels</figcaption></figure><p>texto</p>`;
    const r = semImagemDaCapaNoCorpo(corpo, capa);
    expect(r.html).toBe("<p>texto</p>");
    expect(r.creditoDaCapa).toBe("Foto: Fulano / Pexels");
  });

  it("sem capa, o corpo fica como está", () => {
    expect(semImagemDaCapaNoCorpo(corpoDaEdicao, null).html).toBe(corpoDaEdicao);
  });

  it("lê o crédito marcado pelo desmonte das edições", () => {
    const r = semImagemDaCapaNoCorpo(`<p class="credito-da-foto">Fulano, CC BY 4.0</p><section><p>a</p></section>`, WALL_STREET);
    expect(r.creditoDaCapa).toBe("Fulano, CC BY 4.0");
    expect(r.html).toBe("<section><p>a</p></section>");
  });
});

describe("usoDasCapas", () => {
  it("conta a mesma foto em tamanhos diferentes como uma só", () => {
    const uso = usoDasCapas([WALL_STREET, `${WALL_STREET}?w=600`, null, "https://images.pexels.com/photos/2/a.jpeg"]);
    expect(uso.get(identidadeDaImagem(WALL_STREET))).toBe(2);
    expect(uso.size).toBe(2);
  });
});
