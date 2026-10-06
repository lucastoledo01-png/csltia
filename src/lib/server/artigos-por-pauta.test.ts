import { describe, expect, it } from "vitest";
import {
  dataDaEdicao,
  destinoDaEdicao,
  fotosPorPauta,
  motivoDeImigracao,
  planejarEdicao,
  slugsDaEdicao,
  type EdicaoComoArtigo,
  type HistoriaDaEdicao,
} from "./artigos-por-pauta";

/**
 * As edições antigas desmontadas em matéria por pauta, sem modelo nenhum.
 *
 * O HTML de teste tem a forma do e-mail de verdade: título num cabeçalho, a
 * foto logo abaixo, e o ícone do WhatsApp (arquivo da marca) depois. A edição
 * de 16/09 tinha pauta sem foto no meio, e é esse o caso que o pareamento por
 * ordem errava.
 */

function historia(titulo: string, extra: Partial<HistoriaDaEdicao> = {}): HistoriaDaEdicao {
  return {
    rank: 1,
    title: titulo,
    summary: `Resumo de ${titulo} com **3%** de alta.\n\nSegundo parágrafo.`,
    context: "",
    category: "Economia",
    humor_line: "uma piada do e-mail",
    source_url: `https://fonte.com/${encodeURIComponent(titulo)}`,
    source_name: "Fonte",
    secondary_urls: [],
    why_it_matters: "",
    practical_impact: "",
    ...extra,
  };
}

function bloco(titulo: string, foto?: string): string {
  return (
    `<h2 style="font-weight:800">\n  ${titulo.replace(/&/g, "&amp;")}\n</h2>` +
    (foto ? `<img src="${foto}" width="600" />` : "") +
    `<p>texto</p><img src="https://casaloti.ia.br/marca/whatsapp.png" />`
  );
}

function edicao(historias: HistoriaDaEdicao[], html: string, extra: Partial<EdicaoComoArtigo> = {}): EdicaoComoArtigo {
  return {
    slug: "edicao-2026-10-04",
    project_id: "p",
    published_at: "2026-10-04T09:25:00.000Z",
    cover_image: "https://x/capa-da-edicao.jpg",
    content: historias,
    content_html: html,
    ...extra,
  };
}

describe("a foto de cada pauta", () => {
  it("é pareada pela POSIÇÃO no HTML, e a pauta sem foto não rouba a da seguinte", () => {
    const titulos = ["Primeira", "Segunda sem foto", "Terceira & cia"];
    const html = bloco("Primeira", "https://x/1.jpg?a=1&amp;amp;b=2") + bloco("Segunda sem foto") + bloco("Terceira & cia", "https://x/3.jpg");

    expect(fotosPorPauta(html, titulos)).toEqual(["https://x/1.jpg?a=1&b=2", null, "https://x/3.jpg"]);
  });

  it("título que não está em cabeçalho nenhum fica sem foto, e não com a do vizinho", () => {
    expect(fotosPorPauta(bloco("Outro", "https://x/1.jpg"), ["Primeira"])).toEqual([null]);
    expect(fotosPorPauta(null, ["Primeira"])).toEqual([null]);
  });
});

describe("imigração", () => {
  it("sai pelo rótulo ou pelo título", () => {
    expect(motivoDeImigracao("Imigração", "EUA admitem refugiados")).toMatch(/imigração/);
    expect(motivoDeImigracao("Política", "Juíza manda trazer de volta solicitante de asilo")).toMatch(/asilo/);
    expect(motivoDeImigracao("Trabalho nos EUA", "Empregadores enfrentam sorteio de pedidos H1B")).toMatch(/H-1B/);
    expect(motivoDeImigracao("Fiscalização", "Agente do ICE é solto sob fiança")).toMatch(/ICE/);
  });

  it("não confunde palavra comum com sigla, nem pauta que só cita imigrante de passagem", () => {
    expect(motivoDeImigracao("Política", "Los Angeles pode eleger uma urbanista para prefeita")).toBeNull();
    expect(motivoDeImigracao("Economia", "Justice Department e police service")).toBeNull();
    expect(motivoDeImigracao("Economia", "Vagas de IA em bancos dos EUA sobem 49%")).toBeNull();
  });
});

describe("o plano de uma edição", () => {
  const historias = [
    historia("Fed corta juros", { context: "O Fed vinha segurando.", why_it_matters: "Juro menor barateia crédito." }),
    historia("EUA admitem refugiados", { category: "Imigração" }),
    historia("Chip novo da AMD", { category: "Tecnologia", practical_impact: "Preço cai em **2027**.", secondary_urls: ["https://outra.com/a"] }),
  ];
  const html =
    bloco("Fed corta juros", "https://x/fed.jpg") +
    bloco("EUA admitem refugiados", "https://x/ref.jpg") +
    bloco("Chip novo da AMD", "https://x/amd.jpg");
  const plano = planejarEdicao(edicao(historias, html))!;

  it("uma matéria por pauta, e a de imigração vai para a lista de puladas", () => {
    expect(plano.artigos.map((a) => a.slug)).toEqual(["fed-corta-juros-2026-10-04", "chip-novo-da-amd-2026-10-04"]);
    expect(plano.puladas).toEqual([
      { posicao: 1, titulo: "EUA admitem refugiados", categoria: "Imigração", motivo: "imigração (imigração)" },
    ]);
  });

  it("o corpo é o molde do artigo: abertura, e só as seções que têm texto", () => {
    const [fed, chip] = plano.artigos;
    expect(fed.content.map((s) => s.heading)).toEqual(["", "Contexto", "Por que importa"]);
    expect(chip.content.map((s) => s.heading)).toEqual(["", "Na prática"]);
    expect(fed.content_html).toContain("<h2>Contexto</h2>");
    expect(fed.content_html).not.toContain("Na prática");
    // Negrito convertido, linha de humor fora, fonte creditada.
    expect(fed.content_html).toContain("<strong>3%</strong>");
    expect(fed.content_html).not.toContain("**");
    expect(fed.content_html).not.toContain("piada");
    expect(fed.content_html).toContain('class="fonte"');
    expect(chip.content_html).toContain("Leia também");
    expect(chip.source_urls).toEqual(["https://fonte.com/Chip%20novo%20da%20AMD", "https://outra.com/a"]);
  });

  it("publicada, aprovada, com editoria do portal e SEO tirado do resumo", () => {
    const [fed, chip] = plano.artigos;
    expect(fed).toMatchObject({ status: "published", manual_review_status: "approved", category: "Economia" });
    expect(chip.category).toBe("Tecnologia");
    expect(fed.seo_description).toBe("Resumo de Fed corta juros com 3% de alta.");
    expect(fed.seo_description.length).toBeLessThanOrEqual(160);
    expect(fed.tags).toContain("origem:edicao-2026-10-04");
    expect(fed.canonical_url).toBe("https://casaloti.ia.br/artigos/fed-corta-juros-2026-10-04");
  });

  it("a ordem da edição se mantém na lista mais recente primeiro", () => {
    const [fed, chip] = plano.artigos;
    expect(Date.parse(fed.published_at)).toBeGreaterThan(Date.parse(chip.published_at));
    expect(Date.parse(chip.published_at)).toBeGreaterThan(Date.parse("2026-10-04T09:25:00.000Z"));
  });

  it("a capa é a foto da pauta, pareada pela posição", () => {
    expect(plano.artigos.map((a) => a.cover_image)).toEqual(["https://x/fed.jpg", "https://x/amd.jpg"]);
    expect(plano.semFoto).toEqual([]);
  });

  /*
   * Pauta sem foto não vira conteúdo (decisão do dono, 05/10/2026). Até essa
   * data ela virava matéria com a peça tipográfica; agora é pulada com motivo,
   * e a seguinte, que tem foto, segue normalmente.
   */
  it("pauta sem foto NÃO vira matéria: vai para as puladas com REJECT_NO_PHOTO, e a seguinte entra", () => {
    const tres = [historia("Fed corta juros"), historia("Chip novo da AMD"), historia("Aluguel sobe em Miami")];
    const p = planejarEdicao(
      edicao(tres, bloco("Fed corta juros", "https://x/fed.jpg") + bloco("Chip novo da AMD") + bloco("Aluguel sobe em Miami", "https://x/miami.jpg")),
    )!;
    expect(p.artigos.map((a) => a.slug)).toEqual(["fed-corta-juros-2026-10-04", "aluguel-sobe-em-miami-2026-10-04"]);
    expect(p.semFoto).toEqual(["chip-novo-da-amd-2026-10-04"]);
    expect(p.puladas).toEqual([
      { posicao: 1, titulo: "Chip novo da AMD", categoria: "Economia", motivo: "REJECT_NO_PHOTO: sem foto da pauta na edição" },
    ]);
  });

  it("a bandeira de último recurso não conta como foto, nem em miniatura do Commons", () => {
    const bandeira =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/New_York_Stock_Exchange_Building_2010.jpg/1280px-New_York_Stock_Exchange_Building_2010.jpg";
    const p = planejarEdicao(edicao([historia("Fed corta juros"), historia("Chip novo da AMD")], bloco("Fed corta juros", bandeira) + bloco("Chip novo da AMD", "https://x/amd.jpg")))!;
    expect(p.artigos.map((a) => a.slug)).toEqual(["chip-novo-da-amd-2026-10-04"]);
    expect(p.puladas[0].motivo).toBe("REJECT_NO_PHOTO: só a bandeira de último recurso");
  });

  it("edição sem nenhuma foto recuperável: a capa dela vai só para a primeira pauta, e as outras não viram matéria", () => {
    const sem = planejarEdicao(edicao([historia("Um"), historia("Dois")], "<p>sem cabeçalho</p>"))!;
    expect(sem.artigos.map((a) => a.cover_image)).toEqual(["https://x/capa-da-edicao.jpg"]);
    expect(sem.semFoto).toEqual(["dois-2026-10-04"]);
  });

  it("a capa nunca entra no corpo, e o crédito dela vai marcado para a página imprimir embaixo da capa", () => {
    const comCredito =
      `<h2>Fed corta juros</h2><img src="https://x/fed.jpg?w=600" /><p style="font-size:12px">Fulano, CC BY-SA 4.0, via Wikimedia Commons</p><p>texto</p>`;
    const [fed] = planejarEdicao(edicao([historia("Fed corta juros")], comCredito))!.artigos;
    expect(fed.cover_image).toBe("https://x/fed.jpg?w=600");
    expect(fed.content_html).not.toContain("<img");
    expect(fed.content_html.startsWith('<p class="credito-da-foto">Fulano, CC BY-SA 4.0, via Wikimedia Commons</p>')).toBe(true);
    // Parágrafo comum depois da foto não é crédito.
    const [semCredito] = planejarEdicao(edicao([historia("Fed corta juros")], bloco("Fed corta juros", "https://x/fed.jpg")))!.artigos;
    expect(semCredito.content_html).not.toContain("credito-da-foto");
  });

  it("updated_at é o da publicação: desmontar não é modificar o texto", () => {
    for (const a of plano.artigos) expect(a.updated_at).toBe(a.published_at);
  });

  it("é determinístico: o mesmo plano duas vezes, para o upsert não duplicar", () => {
    expect(planejarEdicao(edicao(historias, html))).toEqual(plano);
  });
});

describe("slugs e destino do link antigo", () => {
  it("dois títulos iguais na mesma edição não colidem", () => {
    expect(slugsDaEdicao(["Fed corta", "Fed corta"], "2026-10-04")).toEqual(["fed-corta-2026-10-04", "fed-corta-2026-10-04-2"]);
  });

  it("o link da edição vai para a primeira matéria, pulando a de imigração", () => {
    const e = edicao(
      [historia("EUA admitem refugiados", { category: "Imigração" }), historia("Fed corta juros")],
      bloco("EUA admitem refugiados", "https://x/ref.jpg") + bloco("Fed corta juros", "https://x/fed.jpg"),
    );
    expect(destinoDaEdicao(e)).toBe("fed-corta-juros-2026-10-04");
  });

  it("edição só de imigração não tem destino, e o slug que não é de edição não tem plano", () => {
    expect(destinoDaEdicao(edicao([historia("Visto novo", { category: "Vistos" })], ""))).toBeNull();
    expect(planejarEdicao(edicao([], "", { slug: "fed-corta-juros-2026-10-04" }))).toBeNull();
    expect(dataDaEdicao("edicao-2026-09-16")).toBe("2026-09-16");
    expect(dataDaEdicao("edicao-2026-09-16-x")).toBeNull();
  });
});
