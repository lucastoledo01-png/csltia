import { describe, expect, it } from "vitest";
import { candidatosEmMemoria, type CandidatoDeReel, type PreparoDoReel } from "@/lib/server/social/reels/candidatos";
import { tarefasEmMemoria } from "../tarefas-store";
import {
  abrirEscritaDoReel,
  conferirTextoDoReel,
  conferirTrechosELegendas,
  entregarEscritaDoReel,
  materialDoCandidato,
  reabrirEscritaDoReel,
} from "./tarefa";

const PREPARO: PreparoDoReel = {
  videoUrl: "https://x/origem.mp4",
  videoPath: "p/c1/origem.mp4",
  folhaUrl: "https://x/folha.jpg",
  original: { largura: 1280, altura: 720, segundos: 32 },
  corte: { a: { x: 0, y: 20, largura: 1280, altura: 692 }, b: { x: 440, y: 0, largura: 404, altura: 720 } },
  tarefaId: null,
};

function candidato(): CandidatoDeReel {
  return {
    id: "c1",
    projectId: "p1",
    fonte: "instagram",
    origemId: "178",
    permalink: "https://www.instagram.com/reel/x/",
    urlVideo: "https://cdn/x.mp4",
    autor: "perfil",
    titulo: "Trump anuncia tarifa de 50% sobre aço importado",
    legenda: "Trump anunciou nesta terça, na Casa Branca, tarifa de 50% sobre o aço importado.",
    publicadoEm: "2026-10-28T10:00:00Z",
    metricas: { historia: "Trump anuncia tarifa de 50% sobre aço" },
    nota: 70,
    estado: "escolhida",
    motivo: null,
    preparo: { ...PREPARO },
    texto: null,
    socialPostId: null,
    criadaEm: "2026-10-28T10:00:00Z",
    atualizadaEm: "2026-10-28T10:00:00Z",
  };
}

const BOM = {
  molde: "a",
  rotulo: "Tarifas",
  categoria: "Economia",
  linhas: ["TRUMP", "TARIFA DE 50%", "SOBRE O AÇO"],
  destaque: 1,
  legenda: {
    gancho: "Trump anunciou nesta terça uma tarifa de 50% sobre o aço importado.",
    paragrafos: ["O anúncio foi feito na Casa Branca."],
  },
};

describe("o texto do Reel", () => {
  const material = materialDoCandidato(candidato(), PREPARO);

  it("aceita o texto ancorado no material, com o corte proposto do molde", () => {
    const r = conferirTextoDoReel(BOM, material);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto.rotulo).toBe("TARIFAS");
    expect(r.texto.corte).toEqual(PREPARO.corte.a);
    expect(r.texto.manchete).toBe("TRUMP TARIFA DE 50% SOBRE O AÇO");
  });

  it("recusa número que o material não tem", () => {
    const r = conferirTextoDoReel({ ...BOM, linhas: ["TRUMP", "TARIFA DE 75%", "SOBRE O AÇO"] }, material);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivos.join(" ")).toContain("SEM_LASTRO");
  });

  it("tira o travessão sozinho e recusa corte fora do vídeo", () => {
    const r = conferirTextoDoReel(
      { ...BOM, legenda: { gancho: "Trump anunciou nesta terça uma tarifa de 50% — sobre o aço importado.", paragrafos: [] }, corte: { x: 1000, y: 0, largura: 400, altura: 300 } },
      material,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // `limparVicios` já troca o travessão; a conferência é a rede de baixo.
    expect(r.motivos.some((m) => m.startsWith("[TRAVESSAO]"))).toBe(false);
    expect(r.motivos.some((m) => m.startsWith("[CORTE]"))).toBe(true);
  });
});

describe("o laço da tarefa", () => {
  it("aceita, grava o texto no candidato, e a reprovação do painel reabre com o motivo", async () => {
    const tarefas = tarefasEmMemoria();
    const candidatos = candidatosEmMemoria([candidato()]);
    const c = candidatos.todos[0];
    const t = await abrirEscritaDoReel("p1", "2026-10-28", materialDoCandidato(c, PREPARO), tarefas);
    c.preparo = { ...PREPARO, tarefaId: t.id };

    const r = await entregarEscritaDoReel(t, BOM, "claude", { tarefas, candidatos });
    expect(r.desfecho).toBe("pronto");
    expect(c.texto?.molde).toBe("a");

    c.estado = "pronta";
    c.socialPostId = "post-1";
    const reaberta = await reabrirEscritaDoReel(c, "a linha do meio está errada", { tarefas, candidatos });
    expect(reaberta?.estado).toBe("reparar");
    expect(String(reaberta?.instrucao.user)).toContain("a linha do meio está errada");
    expect(c.estado).toBe("escolhida");
    expect(c.texto).toBeNull();
    expect(c.socialPostId).toBe("post-1");
  });

  it("descarta depois do teto de reparos, e o candidato vai junto", async () => {
    const tarefas = tarefasEmMemoria();
    const candidatos = candidatosEmMemoria([candidato()]);
    let t = await abrirEscritaDoReel("p1", "2026-10-28", materialDoCandidato(candidatos.todos[0], PREPARO), tarefas);
    const ruim = { ...BOM, linhas: ["TRUMP", "TARIFA DE 75%", "AÇO"] };
    const env = { MAX_SOCIAL_REPAIR_ATTEMPTS: "2" };
    let r = await entregarEscritaDoReel(t, ruim, "claude", { tarefas, candidatos, env });
    expect(r.desfecho).toBe("reparar");
    t = (await tarefas.porId(t.id))!;
    r = await entregarEscritaDoReel(t, ruim, "claude", { tarefas, candidatos, env });
    expect(r.desfecho).toBe("reparar");
    t = (await tarefas.porId(t.id))!;
    r = await entregarEscritaDoReel(t, ruim, "claude", { tarefas, candidatos, env });
    expect(r.desfecho).toBe("descartado");
    expect(candidatos.todos[0].estado).toBe("descartada");
  });
});

describe("o molde do vídeo vertical", () => {
  it("vídeo vertical vai sempre para o molde B, com o corte do B", () => {
    const vertical = {
      ...PREPARO,
      original: { largura: 720, altura: 1280, segundos: 32 },
      corte: { a: { x: 0, y: 300, largura: 720, altura: 720 }, b: PREPARO.corte.b },
    };
    const material = materialDoCandidato(candidato(), vertical);
    const r = conferirTextoDoReel(BOM, material);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto.molde).toBe("b");
    expect(r.texto.corte).toEqual(PREPARO.corte.b);
  });

  it("vertical que embrulha um vídeo deitado fica no A, com o corte do meio", () => {
    const embrulho = {
      ...PREPARO,
      original: { largura: 720, altura: 1280, segundos: 28 },
      corte: { a: { x: 24, y: 540, largura: 672, altura: 358 }, b: null },
    };
    const r = conferirTextoDoReel(BOM, materialDoCandidato(candidato(), embrulho));
    expect(r.ok && r.texto.molde).toBe("a");
    expect(r.ok && r.texto.corte).toEqual(embrulho.corte.a);
  });

  it("vídeo horizontal pode ficar no A", () => {
    const r = conferirTextoDoReel(BOM, materialDoCandidato(candidato(), PREPARO));
    expect(r.ok && r.texto.molde).toBe("a");
  });
});

describe("o vídeo de canal em inglês, com a fala legendada", () => {
  const FALA = [
    { inicio: 10, fim: 14.5, texto: "We are not going to cut rates this year," },
    { inicio: 14.5, fim: 19, texto: "and inflation is still at 3%." },
    { inicio: 19, fim: 26, texto: "The labor market remains solid, President Trump said." },
    { inicio: 40, fim: 52, texto: "We will watch the data in December." },
  ];
  const PREPARO_DO_CANAL: PreparoDoReel = {
    ...PREPARO,
    original: { largura: 1920, altura: 1080, segundos: 240 },
    corte: { a: null, b: { x: 860, y: 150, largura: 360, altura: 640 }, q: { x: 700, y: 150, largura: 640, altura: 640 } },
    transcricao: FALA,
    idioma: "en",
  };
  function doCanal(): CandidatoDeReel {
    return {
      ...candidato(),
      fonte: "youtube",
      origemId: "abc",
      permalink: "https://www.youtube.com/watch?v=abc",
      autor: "Bloomberg Television",
      titulo: "Powell: no rate cut this year",
      legenda: "",
      metricas: { canal: { nome: "Bloomberg Television", idioma: "en", credito: "Bloomberg", id: null } },
      preparo: { ...PREPARO_DO_CANAL },
    };
  }
  const material = materialDoCandidato(doCanal(), PREPARO_DO_CANAL);
  const TEXTO = {
    molde: "b",
    rotulo: "Juros",
    categoria: "VÍDEO: BLOOMBERG",
    linhas: ["Powell descarta", "corte de juros"],
    destaque: 1,
    legenda: {
      gancho: "Powell disse que o Fed não vai cortar os juros neste ano e que a inflação ainda está em 3%.",
      paragrafos: [],
    },
    trechos: [
      { inicio: 10, fim: 26 },
      { inicio: 40, fim: 50 },
    ],
    legendas: [
      { inicio: 0, fim: 4.5, texto: "Não vamos cortar os juros este ano," },
      { inicio: 4.5, fim: 9, texto: "e a inflação ainda está em 3%." },
      { inicio: 16, fim: 26, texto: "Vamos olhar os dados em dezembro." },
    ],
  };

  it("o material leva a fala com tempo e o crédito do canal, e o prompt mostra os dois", async () => {
    expect(material.idioma).toBe("en");
    expect(material.credito).toBe("Bloomberg");
    const t = await abrirEscritaDoReel("p1", "2026-11-09", material, tarefasEmMemoria());
    expect(String(t.instrucao.user)).toContain("[10.0-14.5] We are not going to cut rates this year,");
    expect(String(t.instrucao.user)).toContain("Vídeo: Bloomberg");
    expect(String(t.instrucao.system)).toContain("trechos");
  });

  it("aceita trechos e legendas certos, no molde B, com o corte do quadrado quando pedido", () => {
    const r = conferirTextoDoReel({ ...TEXTO, enquadramento: "quadrado" }, material);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto.molde).toBe("b");
    expect(r.texto.trechos).toEqual(TEXTO.trechos);
    expect(r.texto.legendas).toHaveLength(3);
    expect(r.texto.enquadramento).toBe("quadrado");
    expect(r.texto.corte).toEqual(PREPARO_DO_CANAL.corte.q);
    // O número da manchete se ancora na fala transcrita.
    expect(r.texto.legenda).toContain("3%");
  });

  it("vídeo de canal pedido no molde A vai para o B", () => {
    const r = conferirTextoDoReel({ ...TEXTO, molde: "a" }, material);
    expect(r.ok && r.texto.molde).toBe("b");
    expect(r.ok && r.texto.corte).toEqual(PREPARO_DO_CANAL.corte.b);
  });

  it("em inglês, sem trechos ou sem legenda, pede reparo", () => {
    const r = conferirTextoDoReel({ ...TEXTO, trechos: undefined, legendas: undefined }, material);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivos.some((m) => m.startsWith("[TRECHO]"))).toBe(true);
    expect(r.motivos.some((m) => m.startsWith("[LEGENDA_PT]"))).toBe(true);
  });

  it("recusa trecho curto, longo, sobreposto, fora do vídeo ou sem fala", () => {
    const m = { original: material.original, transcricao: FALA, idioma: "en" as const };
    const legendas = TEXTO.legendas;
    expect(conferirTrechosELegendas({ trechos: [{ inicio: 10, fim: 19 }], legendas }, m).join(" ")).toContain("somam 9.0 s");
    expect(conferirTrechosELegendas({ trechos: [{ inicio: 10, fim: 60 }], legendas }, m).join(" ")).toContain("somam 50.0 s");
    expect(conferirTrechosELegendas({ trechos: [{ inicio: 10, fim: 26 }, { inicio: 20, fim: 30 }], legendas }, m).join(" ")).toContain("sem sobreposição");
    expect(conferirTrechosELegendas({ trechos: [{ inicio: 230, fim: 250 }], legendas }, m).join(" ")).toContain("passa do fim");
    expect(conferirTrechosELegendas({ trechos: [{ inicio: 26, fim: 40 }, { inicio: 40, fim: 46 }], legendas }, m).join(" ")).toContain("quase não tem fala");
    expect(conferirTrechosELegendas({ trechos: TEXTO.trechos, legendas }, m)).toEqual([]);
  });

  it("recusa legenda vazia, longa, sobreposta, com travessão ou depois do fim do Reel", () => {
    const m = { original: material.original, transcricao: FALA, idioma: "en" as const };
    const trechos = TEXTO.trechos;
    const motivos = (legendas: Array<{ inicio: number; fim: number; texto: string }>) => conferirTrechosELegendas({ trechos, legendas }, m).join(" ");
    expect(motivos([{ inicio: 0, fim: 2, texto: "  " }])).toContain("está vazia");
    expect(motivos([{ inicio: 0, fim: 2, texto: "um dois três quatro cinco seis sete oito nove" }])).toContain("palavras");
    expect(motivos([{ inicio: 0, fim: 3, texto: "um" }, { inicio: 2, fim: 4, texto: "dois" }])).toContain("antes de a 1 terminar");
    expect(motivos([{ inicio: 0, fim: 2, texto: "juros \u2014 inflação" }])).toContain("travessão");
    expect(motivos([{ inicio: 20, fim: 30, texto: "fim" }])).toContain("depois do fim do Reel");
  });

  it("o laço grava trechos e legendas no candidato", async () => {
    const tarefas = tarefasEmMemoria();
    const candidatos = candidatosEmMemoria([doCanal()]);
    const t = await abrirEscritaDoReel("p1", "2026-11-09", material, tarefas);
    const r = await entregarEscritaDoReel(t, TEXTO, "claude", { tarefas, candidatos });
    expect(r.desfecho).toBe("pronto");
    expect(candidatos.todos[0].texto?.trechos).toEqual(TEXTO.trechos);
    expect(candidatos.todos[0].texto?.legendas?.[0].texto).toBe("Não vamos cortar os juros este ano,");
  });
});
