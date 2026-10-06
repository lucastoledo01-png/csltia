import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalHome, type DadosDaHome } from "./PortalHome";
import { dataDeHoje } from "./PortalChrome";
import { enderecoDaFoto, miniaturaDoCommons, textoCorrido } from "./PortalPecas";
import type { PautaDoPortal } from "@/lib/server/portal";
import { MARCA } from "@/lib/marca";

function pauta(i: number, extra: Partial<PautaDoPortal> = {}): PautaDoPortal {
  return {
    id: `edicao-2026-10-0${(i % 5) + 1}#${i}`,
    titulo: `Manchete de teste número ${i}`,
    resumo: `Resumo da pauta ${i} com **número** em negrito.`,
    rotulo: "Economia",
    editoria: "economia",
    imagem: `https://images.pexels.com/photos/${i}/foto.jpeg?a=1&amp;amp;w=600`,
    fonte: "CNBC",
    data: "2026-10-04",
    href: "/artigos/edicao-2026-10-04",
    ...extra,
  };
}

function dados(): DadosDaHome {
  const lista = Array.from({ length: 22 }, (_, i) => pauta(i));
  return {
    destaque: lista[0],
    chamadas: lista.slice(1, 7),
    secundarias: lista.slice(7, 10),
    ultimas: lista.slice(10, 20),
    porEditoria: [{ editoria: "economia", itens: lista.slice(1, 5) }],
    // Desde 05/10/2026 o índice só recebe pauta que não está em outro bloco.
    maisNovaPorEditoria: [{ editoria: "economia", pauta: lista[20] }],
    secoes: [
      { editoria: "economia", imagem: "https://images.pexels.com/photos/9/economia.jpeg", total: 4 },
      { editoria: "trabalho", imagem: null, total: 0 },
      { editoria: "tecnologia", imagem: null, total: 0 },
      { editoria: "custo-de-vida", imagem: null, total: 0 },
      { editoria: "governo", imagem: null, total: 0 },
      { editoria: "brasil", imagem: null, total: 0 },
    ],
  };
}

describe("home do portal (redesenho Sora)", () => {
  it("abre pela manchete como h1 e lista os destaques", () => {
    render(<PortalHome dados={dados()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Manchete de teste número 0" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Destaques" })).toBeInTheDocument();
  });

  it("não inventa 'Mais lidas' nem assinatura paga", () => {
    render(<PortalHome dados={dados()} />);

    expect(screen.queryByText(/mais lidas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/premium/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/entrar/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /o mais novo de cada editoria/i })).toBeInTheDocument();
  });

  it("tem UMA caixa de assinatura, ligada ao fluxo real da newsletter", () => {
    const { container } = render(<PortalHome dados={dados()} />);

    expect(container.querySelectorAll("#newsletter")).toHaveLength(1);
    expect(screen.getAllByLabelText(/email para newsletter/i)).toHaveLength(1);
  });

  it("usa o logotipo de fundo claro no cabeçalho branco e o de fundo escuro no preto", () => {
    const { container } = render(<PortalHome dados={dados()} />);
    const header = container.querySelector("header")!;
    const fontes = Array.from(header.querySelectorAll("img")).map((i) => i.getAttribute("src"));

    expect(fontes).toContain("/marca/eua-journal-fundo-claro.png");
    expect(fontes).toContain("/marca/eua-journal-fundo-escuro.png");
    expect(within(header).getAllByAltText(MARCA.nome).length).toBe(2);
  });

  it("Seções em foco é UMA fileira de cards de tema, um por editoria, cada um levando à página dela", () => {
    const { container } = render(<PortalHome dados={dados()} />);
    const secao = screen.getByRole("heading", { name: "Seções em foco" }).closest("section")!;
    const trilho = within(secao).getByRole("list", { name: "Uma seção por editoria" });
    const cards = within(trilho).getAllByRole("listitem");

    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.querySelector("a")?.getAttribute("href"))).toEqual([
      "/editoria/economia",
      "/editoria/trabalho",
      "/editoria/tecnologia",
      "/editoria/custo-de-vida",
      "/editoria/governo",
      "/editoria/brasil",
    ]);
    // Nome e descrição no card; nenhuma pauta empilhada por editoria.
    expect(within(cards[0]).getByRole("heading", { name: "Economia" })).toBeInTheDocument();
    expect(within(cards[0]).getByText(/economia americana/)).toBeInTheDocument();
    expect(within(secao).queryByText(/Manchete de teste/)).not.toBeInTheDocument();
    // O trilho rola pelo teclado, e "Ver tudo" leva ao arquivo.
    expect(trilho).toHaveAttribute("tabindex", "0");
    expect(within(secao).getByRole("link", { name: "Ver tudo" })).toHaveAttribute("href", "/artigos");
    // A âncora antiga cai no card certo.
    expect(container.querySelector("#editoria-economia")).toBe(cards[0]);
  });

  it("a editoria sem foto ganha a peça tipográfica, e a com foto usa a mais recente", () => {
    render(<PortalHome dados={dados()} />);
    const trilho = screen.getByRole("list", { name: "Uma seção por editoria" });
    const [economia, trabalho] = within(trilho).getAllByRole("listitem");

    expect(economia.querySelector("img")?.getAttribute("src")).toContain("economia.jpeg");
    expect(trabalho.querySelector("img")).toBeNull();
  });

  it("o menu, o rodapé e a barra lateral apontam para as páginas de editoria", () => {
    render(<PortalHome dados={dados()} />);

    expect(screen.getByLabelText("Editorias").querySelector('a[href="/editoria/economia"]')).not.toBeNull();
    expect(screen.getByLabelText("Editorias no rodapé").querySelector('a[href="/editoria/brasil"]')).not.toBeNull();
    expect(screen.getByLabelText("Por editoria").querySelector('a[href="/editoria/economia"]')).not.toBeNull();
    expect(document.querySelector('a[href^="/#editoria-"]')).toBeNull();
  });

  it("pauta sem foto vira peça tipográfica, e não imagem quebrada", () => {
    const d = dados();
    d.destaque = pauta(0, { imagem: null, rotulo: "Tecnologia", editoria: "tecnologia" });
    const { container } = render(<PortalHome dados={d} />);
    const manchete = screen.getByRole("heading", { level: 1 }).closest("a")!;

    expect(manchete.querySelector("img")).toBeNull();
    expect(within(manchete).getAllByText("Tecnologia").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('img[src=""]')).toHaveLength(0);
  });
});

describe("peças do portal", () => {
  it("desfaz o &amp; que vem do HTML da edição", () => {
    expect(enderecoDaFoto("https://x.com/a.jpg?a=1&amp;amp;w=600&amp;h=2")).toBe("https://x.com/a.jpg?a=1&w=600&h=2");
  });

  it("troca o original do Commons pela miniatura e deixa os outros hosts em paz", () => {
    expect(
      miniaturaDoCommons("https://upload.wikimedia.org/wikipedia/commons/9/9b/Close_up_of_Flock_camera.jpg?utm_source=x", 960),
    ).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Close_up_of_Flock_camera.jpg/960px-Close_up_of_Flock_camera.jpg");
    expect(miniaturaDoCommons("https://upload.wikimedia.org/wikipedia/commons/a/ab/Mapa.svg", 960)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/a/ab/Mapa.svg",
    );
    expect(miniaturaDoCommons("https://images.pexels.com/photos/1/a.jpeg", 960)).toBe("https://images.pexels.com/photos/1/a.jpeg");
  });

  it("tira os asteriscos de negrito do resumo", () => {
    expect(textoCorrido("subiu **4,20%** em **setembro**")).toBe("subiu 4,20% em setembro");
  });

  it("a data da barra é a de Brasília, não a do servidor em UTC", () => {
    // 01:30 UTC do dia 6 ainda é 22:30 do dia 5 em Brasília.
    const d = dataDeHoje(new Date("2026-10-06T01:30:00Z"));

    expect(d.iso).toBe("2026-10-05");
    expect(d.longa).toBe("Segunda-feira, 5 de outubro de 2026");
  });
});
