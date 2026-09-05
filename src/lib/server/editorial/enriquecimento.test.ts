import { describe, expect, it, vi } from "vitest";
import {
  ehAgregador,
  enriquecerPauta,
  extrairTextoDeHtml,
  precisaEnriquecer,
  temFatosSuficientes,
} from "./enriquecimento";

const corpoLongo = (
  "O United States Citizenship and Immigration Services informou nesta quinta-feira que o prazo " +
  "de renovação automática da permissão de trabalho passa de 180 para 540 dias. A mudança vale " +
  "para pedidos protocolados a partir de 1º de outubro e alcança as categorias de asilo, " +
  "ajuste de status e renovação por casamento. O órgão afirmou que a fila atual soma 1,2 milhão " +
  "de pedidos e que a medida busca evitar a interrupção do vínculo de trabalho enquanto a " +
  "renovação é analisada. A publicação oficial saiu no Federal Register."
).repeat(1);

describe("precisaEnriquecer", () => {
  it("pede enriquecimento quando o feed manda só a manchete", () => {
    expect(precisaEnriquecer("USCIS amplia prazo do EAD", "")).toBe(true);
  });

  it("pede enriquecimento quando a descrição é o título de novo", () => {
    expect(precisaEnriquecer("USCIS amplia prazo do EAD", "USCIS amplia prazo do EAD Reuters")).toBe(true);
  });

  it("pede enriquecimento quando o texto não tem uma frase inteira", () => {
    const rotulo = "USCIS EAD renovação prazo permissão trabalho imigração Estados Unidos ".repeat(8);
    expect(precisaEnriquecer("Outro título", rotulo)).toBe(true);
  });

  it("aceita o feed quando ele já traz corpo", () => {
    expect(precisaEnriquecer("USCIS amplia prazo do EAD", corpoLongo)).toBe(false);
  });
});

describe("extrairTextoDeHtml", () => {
  it("pega os parágrafos e descarta menu, rodapé e legenda", () => {
    const html = `
      <html><head><style>.a{color:red}</style></head><body>
      <nav><p>Assine a newsletter e receba tudo</p></nav>
      <header><p>Menu principal do site com todas as editorias</p></header>
      <article>
        <figcaption>Foto: divulgação do órgão federal americano</figcaption>
        <p>${corpoLongo}</p>
        <p>curto</p>
      </article>
      <footer><p>Todos os direitos reservados para este veículo de imprensa</p></footer>
      </body></html>`;

    const texto = extrairTextoDeHtml(html);
    expect(texto).toContain("540 dias");
    expect(texto).not.toContain("Assine a newsletter");
    expect(texto).not.toContain("direitos reservados");
    expect(texto).not.toContain("Foto: divulgação");
  });

  it("desfaz entidades no texto extraído", () => {
    const html = `<p>${"a".repeat(70)} &amp; &quot;aspas&quot; &#39;simples&#39;</p>`;
    const texto = extrairTextoDeHtml(html);
    expect(texto).toContain('"aspas"');
    expect(texto).not.toContain("&quot;");
  });
});

describe("enriquecerPauta", () => {
  const pagina = `<html><body><article><p>${corpoLongo}</p></article></body></html>`;

  it("não busca nada quando o feed já basta", async () => {
    const fetcher = vi.fn();
    const r = await enriquecerPauta(
      { titulo: "t", descricao: corpoLongo, url: "https://veiculo.com/a" },
      fetcher as unknown as typeof fetch
    );
    expect(r.enrichmentStatus).toBe("nao_precisou");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("busca a página original e registra de onde veio o texto", async () => {
    const fetcher = vi.fn(async () =>
      new Response(pagina, { status: 200, headers: { "content-type": "text/html" } })
    );
    const r = await enriquecerPauta(
      { titulo: "USCIS amplia prazo", descricao: "", url: "https://veiculo.com/materia" },
      fetcher as unknown as typeof fetch
    );

    expect(r.enrichmentStatus).toBe("enriquecida");
    expect(r.contentSource).toBe("pagina_original");
    expect(r.contentLength).toBeGreaterThan(400);
    expect(r.enrichmentSources).toEqual(["https://veiculo.com/materia"]);
    expect(temFatosSuficientes(r)).toBe(true);
  });

  it("não tenta buscar link de agregador, que não é o da matéria", async () => {
    const fetcher = vi.fn();
    const r = await enriquecerPauta(
      { titulo: "t", descricao: "", url: "https://news.google.com/rss/articles/ABC?oc=5" },
      fetcher as unknown as typeof fetch
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(r.enrichmentStatus).toBe("agregador_sem_link_direto");
    expect(temFatosSuficientes(r)).toBe(false);
  });

  it("cai para outra fonte do mesmo acontecimento quando a primeira falha", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes("primeira")) return new Response("erro", { status: 503 });
      return new Response(pagina, { status: 200, headers: { "content-type": "text/html" } });
    });

    const r = await enriquecerPauta(
      {
        titulo: "t",
        descricao: "",
        url: "https://primeira.com/a",
        urlsSecundarias: ["https://segunda.com/b"],
      },
      fetcher as unknown as typeof fetch
    );

    expect(r.contentSource).toBe("fonte_secundaria");
    expect(r.enrichmentSources).toEqual(["https://primeira.com/a", "https://segunda.com/b"]);
    expect(r.notas.some((n) => n.includes("HTTP 503"))).toBe(true);
  });

  it("relata origem inacessível em vez de fingir que tem texto", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 403 }));
    const r = await enriquecerPauta(
      { titulo: "t", descricao: "", url: "https://bloqueado.com/a" },
      fetcher as unknown as typeof fetch
    );
    expect(r.enrichmentStatus).toBe("origem_inacessivel");
    expect(temFatosSuficientes(r)).toBe(false);
  });

  it("identifica o robô em vez de se passar por navegador", async () => {
    const fetcher = vi.fn(async () =>
      new Response(pagina, { status: 200, headers: { "content-type": "text/html" } })
    );
    await enriquecerPauta(
      { titulo: "t", descricao: "", url: "https://veiculo.com/a" },
      fetcher as unknown as typeof fetch
    );
    const chamada = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const ua = (chamada[1].headers as Record<string, string>)["User-Agent"];
    expect(ua).toContain("imigra-us-newsroom");
    expect(ua).not.toContain("Mozilla");
  });
});

describe("ehAgregador", () => {
  it("reconhece o Google News e não confunde com veículo", () => {
    expect(ehAgregador("https://news.google.com/rss/articles/x")).toBe(true);
    expect(ehAgregador("https://www.kptv.com/2026/09/05/materia")).toBe(false);
  });
});
