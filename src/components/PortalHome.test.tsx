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
  const lista = Array.from({ length: 20 }, (_, i) => pauta(i));
  return {
    destaque: lista[0],
    chamadas: lista.slice(1, 7),
    secundarias: lista.slice(7, 10),
    ultimas: lista.slice(10),
    porEditoria: [{ editoria: "economia", itens: lista.slice(1, 5) }],
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

  it("dá âncora a cada bloco de editoria, que é para onde o menu aponta", () => {
    const { container } = render(<PortalHome dados={dados()} />);

    expect(container.querySelector("#editoria-economia")).not.toBeNull();
    const menu = screen.getByLabelText("Editorias");
    expect(menu.querySelector('a[href="/#editoria-economia"]')).not.toBeNull();
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
