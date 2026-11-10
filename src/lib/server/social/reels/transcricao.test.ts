import { describe, expect, it } from "vitest";
import { segmentosAte, segmentosDoVtt, segmentosDoWhisper, segundosDoTempo } from "./transcricao";

/** O começo real de uma legenda automática da CNBC (Powell em Harvard, baixada em 09/11/2026). */
const AUTOMATICA = `WEBVTT
Kind: captions
Language: en

00:00:01.480 --> 00:00:04.190 align:start position:0%

Chair<00:00:01.720><c> Powell's</c><00:00:02.240><c> path</c><00:00:03.080><c> to</c><00:00:03.200><c> the</c><00:00:03.320><c> pinnacle</c><00:00:04.080><c> of</c>

00:00:04.190 --> 00:00:04.200 align:start position:0%
Chair Powell's path to the pinnacle of


00:00:04.200 --> 00:00:07.430 align:start position:0%
Chair Powell's path to the pinnacle of
economic<00:00:04.680><c> policy.</c>

00:00:07.430 --> 00:00:07.440 align:start position:0%
economic policy.


00:00:09.640 --> 00:00:11.630 align:start position:0%
economic policy.
Raised<00:00:10.000><c> in</c><00:00:10.200><c> Washington,</c><00:00:11.000><c> D.C.,</c>

00:00:11.630 --> 00:00:11.640 align:start position:0%
Raised in Washington, D.C.,

`;

const MANUAL = `WEBVTT

1
00:00:00.000 --> 00:00:02.500
We are going to hold rates.

2
00:00:02.500 --> 00:00:05.000
We are going to hold rates.

3
00:00:05.000 --> 00:00:07.250
<i>And watch the data.</i>
`;

describe("a fala do vídeo", () => {
  it("lê o tempo do VTT", () => {
    expect(segundosDoTempo("00:01:02.500")).toBe(62.5);
    expect(segundosDoTempo("01:02.5")).toBe(62.5);
    expect(segundosDoTempo("x")).toBeNull();
  });

  it("legenda automática: cada palavra uma vez, segmentos pela pausa e pelo fim de frase", () => {
    const s = segmentosDoVtt(AUTOMATICA);
    expect(s.map((x) => x.texto)).toEqual(["Chair Powell's path to the pinnacle of economic policy.", "Raised in Washington, D.C.,"]);
    expect(s[0].inicio).toBe(1.48);
    expect(s[1].inicio).toBe(9.64);
    expect(s[1].fim).toBe(11.64);
    expect(s[0].fim).toBeLessThanOrEqual(s[1].inicio);
  });

  it("legenda manual: sem a repetição do bloco anterior e sem as marcas", () => {
    const s = segmentosDoVtt(MANUAL);
    expect(s).toEqual([
      { inicio: 0, fim: 5, texto: "We are going to hold rates." },
      { inicio: 5, fim: 7.25, texto: "And watch the data." },
    ]);
  });

  it("corta no tempo do vídeo guardado", () => {
    expect(segmentosAte(segmentosDoVtt(MANUAL), 6)).toEqual([
      { inicio: 0, fim: 5, texto: "We are going to hold rates." },
      { inicio: 5, fim: 6, texto: "And watch the data." },
    ]);
    expect(segmentosDoVtt("WEBVTT\n\n")).toEqual([]);
  });
});

describe("a fala transcrita pelo whisper.cpp (10/11/2026)", () => {
  it("lê o JSON do whisper-cli: idioma detectado, tempo em segundos, ruído fora", () => {
    // Trecho real do vídeo da ABC no X (Trump defendendo Hegseth), transcrito pelo whisper-cli com o modelo base.
    const r = segmentosDoWhisper({
      result: { language: "en" },
      transcription: [
        { offsets: { from: 0, to: 6100 }, text: " Now, he's after Pete Hexath, he doesn't like Hexath, but really, what is Hexath then?" },
        { offsets: { from: 6100, to: 7100 }, text: " He won the war." },
        { offsets: { from: 7100, to: 8000 }, text: " [Music]" },
        { offsets: { from: 9000, to: 9000 }, text: " vazio" },
      ],
    });
    expect(r.idioma).toBe("en");
    expect(r.segmentos).toEqual([
      { inicio: 0, fim: 6.1, texto: "Now, he's after Pete Hexath, he doesn't like Hexath, but really, what is Hexath then?" },
      { inicio: 6.1, fim: 7.1, texto: "He won the war." },
    ]);
  });

  it("sem fala, sem segmento", () => {
    expect(segmentosDoWhisper({ result: { language: "pt" }, transcription: [] })).toEqual({ idioma: "pt", segmentos: [] });
    expect(segmentosDoWhisper({})).toEqual({ idioma: null, segmentos: [] });
  });
});
