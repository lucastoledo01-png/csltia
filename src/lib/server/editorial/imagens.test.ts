import { describe, expect, it, vi } from "vitest";
import { paraRenderizacao, resolverImagens } from "./imagens";
import type { PautaComImagem } from "./imagens";
import type { RegistroHistorico } from "./history";
import type { FotoDeBanco } from "../prompt-system/stock";

const env = { PEXELS_API_KEY: "chave" };

function pauta(titulo: string, url: string, imagemDoFeed = ""): PautaComImagem {
  return { titulo, categoria: "imigracao", sourceUrl: url, imagemDoFeed };
}

function foto(url: string): FotoDeBanco {
  return {
    imagemUrl: url,
    credito: {
      provedor: "pexels",
      fotografo: "Alguém",
      fotografoUrl: "https://pexels.com/@alguem",
      fotoUrl: url,
      atribuicao: null,
    },
  };
}

describe("resolverImagens", () => {
  it("endereça a foto pela identidade da pauta, não pela posição", async () => {
    // `consultaDaNoticia` traduz o título num tema de busca, então o teste
    // reage ao tema, não ao título.
    const buscar = vi.fn(async (consulta: string) =>
      consulta.includes("paperwork") ? foto("https://img.com/ead.jpg") : null
    );

    const pautas = [pauta("Sem foto disponível", "https://a.com/1"), pauta("USCIS amplia prazo do EAD", "https://b.com/2")];
    const escolhas = await resolverImagens(pautas, { env, buscar: buscar as never });

    const primeira = [...escolhas.values()][0];
    const segunda = [...escolhas.values()][1];

    // Era exatamente aqui que a foto da segunda aparecia na primeira.
    expect(primeira.imagemUrl).toBe("");
    expect(primeira.imageSource).toBe("nenhuma");
    expect(segunda.imagemUrl).toBe("https://img.com/ead.jpg");
    expect(segunda.storyId).not.toBe(primeira.storyId);
  });

  it("pauta sem foto sai sem foto, e não com uma qualquer", async () => {
    const buscar = vi.fn(async () => null);
    const escolhas = await resolverImagens([pauta("Assunto sem foto", "https://a.com/1")], {
      env,
      buscar: buscar as never,
    });
    const e = [...escolhas.values()][0];
    expect(e.imagemUrl).toBe("");
    expect(e.motivo).toContain("não encontrou");
  });

  it("recusa foto que já saiu na janela e registra onde saiu", async () => {
    const historico: RegistroHistorico[] = [
      {
        projectId: "p",
        storyId: "antiga",
        canal: "newsletter",
        titulo: "Matéria de ontem",
        imagemUrl: "https://img.com/repetida.jpg?w=1200",
        publicadoEm: new Date().toISOString(),
      },
    ];

    const buscar = vi.fn(async () => foto("https://img.com/repetida.jpg?w=600"));
    const escolhas = await resolverImagens([pauta("Assunto novo", "https://a.com/1")], {
      env,
      historico,
      buscar: buscar as never,
    });

    const e = [...escolhas.values()][0];
    expect(e.imagemUrl).toBe("");
    expect(e.descartadaPorRepeticao).toContain("Matéria de ontem");
  });

  it("não repete a mesma foto em duas pautas da mesma edição", async () => {
    const buscar = vi.fn(async () => foto("https://img.com/mesma.jpg"));
    const escolhas = await resolverImagens(
      [pauta("Primeira", "https://a.com/1"), pauta("Segunda", "https://b.com/2")],
      { env, buscar: buscar as never }
    );

    const urls = [...escolhas.values()].map((e) => e.imagemUrl).filter(Boolean);
    expect(urls).toHaveLength(1);
  });

  it("não usa a foto do veículo por padrão, porque hotlink não é licença", async () => {
    const buscar = vi.fn(async () => null);
    const escolhas = await resolverImagens(
      [pauta("Assunto", "https://a.com/1", "https://veiculo.com/foto.jpg")],
      { env, buscar: buscar as never }
    );

    const e = [...escolhas.values()][0];
    expect(e.imagemUrl).toBe("");
    expect(e.motivo).toContain("hotlink");
  });

  it("usa a foto do veículo quando há autorização configurada", async () => {
    const buscar = vi.fn(async () => null);
    const escolhas = await resolverImagens(
      [pauta("Assunto", "https://a.com/1", "https://veiculo.com/foto.jpg")],
      { env: { ...env, PERMITIR_IMAGEM_DO_FEED: "true" }, buscar: buscar as never }
    );

    const e = [...escolhas.values()][0];
    expect(e.imageSource).toBe("feed_da_fonte");
    expect(e.imagemUrl).toBe("https://veiculo.com/foto.jpg");
  });

  it("banco fora do ar não vira foto errada", async () => {
    const buscar = vi.fn(async () => {
      throw new Error("timeout");
    });
    const escolhas = await resolverImagens([pauta("Assunto", "https://a.com/1")], {
      env,
      buscar: buscar as never,
    });

    const e = [...escolhas.values()][0];
    expect(e.imagemUrl).toBe("");
    expect(e.motivo).toContain("timeout");
  });

  it("sem banco configurado, não inventa foto", async () => {
    const escolhas = await resolverImagens([pauta("Assunto", "https://a.com/1")], { env: {} });
    expect([...escolhas.values()][0].imagemUrl).toBe("");
  });

  it("paraRenderizacao só entrega o que tem foto", async () => {
    const buscar = vi.fn(async (consulta: string) =>
      consulta.includes("paperwork") ? foto("https://img.com/ead.jpg") : null
    );
    const escolhas = await resolverImagens(
      [pauta("Sem foto", "https://a.com/1"), pauta("USCIS amplia prazo do EAD", "https://b.com/2")],
      { env, buscar: buscar as never }
    );

    expect(paraRenderizacao(escolhas).size).toBe(1);
  });
});
