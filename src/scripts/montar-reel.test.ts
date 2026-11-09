import { describe, expect, it } from "vitest";
import { cadeiaDoVideoB, filtroDoMoldeB, filtroDosTrechos, filtroDoVideo, lerCorte, lerTrechos, linhasDoTexto, TOPO_DA_LEGENDA } from "./montar-reel";

describe("montar-reel", () => {
  it("o corte é x:y:largura:altura, e torto é recusado", () => {
    expect(lerCorte("0:385:720:390")).toEqual({ x: 0, y: 385, largura: 720, altura: 390 });
    expect(lerCorte(undefined)).toBeNull();
    expect(() => lerCorte("1:2:3")).toThrow();
    expect(() => lerCorte("a:b:c:d")).toThrow();
  });

  it("a linha entre asteriscos é a do destaque", () => {
    expect(linhasDoTexto("UM| *DOIS* |TRÊS")).toEqual([
      { texto: "UM", destaque: false },
      { texto: "DOIS", destaque: true },
      { texto: "TRÊS", destaque: false },
    ]);
  });

  it("o filtro corta antes e depois preenche o quadro sem distorcer", () => {
    expect(filtroDoVideo({ x: 0, y: 385, largura: 720, altura: 390 }, 992, 537)).toBe(
      "crop=720:390:0:385,scale=992:537:force_original_aspect_ratio=increase,crop=992:537,setsar=1",
    );
    expect(filtroDoVideo(null, 1080, 1920)).toBe("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1");
  });

  it("os trechos são cortados e colados em ordem, com o áudio de cada um", () => {
    expect(filtroDosTrechos([{ inicio: 12.5, fim: 30 }, { inicio: 41, fim: 55.25 }], true)).toBe(
      "[0:v]trim=start=12.5:end=30,setpts=PTS-STARTPTS[v0];[0:a]atrim=start=12.5:end=30,asetpts=PTS-STARTPTS[a0];" +
        "[0:v]trim=start=41:end=55.25,setpts=PTS-STARTPTS[v1];[0:a]atrim=start=41:end=55.25,asetpts=PTS-STARTPTS[a1];" +
        "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
    );
    expect(filtroDosTrechos([{ inicio: 0, fim: 20 }], false)).toBe("[0:v]trim=start=0:end=20,setpts=PTS-STARTPTS[v0];[v0]concat=n=1:v=1:a=0[v]");
    expect(lerTrechos("12.5-30,41-55")).toEqual([{ inicio: 12.5, fim: 30 }, { inicio: 41, fim: 55 }]);
    expect(lerTrechos(undefined)).toBeUndefined();
    expect(() => lerTrechos("30-12")).toThrow();
  });

  it("o quadrado é o vídeo 1:1 em y 300 sobre ele mesmo desfocado", () => {
    const c = cadeiaDoVideoB({ x: 460, y: 120, largura: 400, altura: 400 }, "quadrado");
    expect(c.startsWith("[0:v]crop=400:400:460:120,split=2[f0][q0];")).toBe(true);
    expect(c).toContain("gblur=");
    expect(c).toContain("scale=1080:1080");
    expect(c.endsWith("[f][q]overlay=0:300[v]")).toBe(true);
    expect(cadeiaDoVideoB(null)).toBe(`[0:v]${filtroDoVideo(null, 1080, 1920)}[v]`);
  });

  it("cada legenda entra no seu tempo, abaixo da manchete e depois mais alta", () => {
    const f = filtroDoMoldeB({
      corte: null,
      segundosDaManchete: 4,
      legendas: [
        { inicio: 0, fim: 1.9, texto: "Criado em Washington," },
        { inicio: 2.4, fim: 6.2, texto: "ele estudou em Princeton." },
      ],
    });
    expect(TOPO_DA_LEGENDA).toEqual({ comManchete: 1395, depois: 1300 });
    expect(f).toContain("fade=t=out:st=3.5:d=0.5:alpha=1");
    expect(f).toContain("[s0][3:v]overlay=x=0:y='if(lt(t,4),1395,1300)':eval=frame:enable='between(t,0,1.9)':shortest=1[s1]");
    expect(f).toContain("[s1][4:v]overlay=x=0:y='if(lt(t,4),1395,1300)':eval=frame:enable='between(t,2.4,6.2)':shortest=1[s2]");
    expect(f.endsWith("[s2]null[s]")).toBe(true);
    // Sem legenda, o molde B de sempre.
    expect(filtroDoMoldeB({ corte: null, segundosDaManchete: 4 }).endsWith("[b][m]overlay=0:0:shortest=1[s0];[s0]null[s]")).toBe(true);
  });
});
