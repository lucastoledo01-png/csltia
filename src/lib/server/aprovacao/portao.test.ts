import { describe, expect, it } from "vitest";
import { hashDaPeca, hashDoPostDaLinha } from "./hash";
import {
  decidirPublicacao,
  ehMensagemDoPortao,
  mensagemDoPortao,
  MOTIVOS_DO_PORTAO,
  redacaoDisparaNewsletter,
  statusDeEntradaDoArtigo,
  statusDeEntradaDoPost,
  type EntradaDoPortao,
} from "./portao";

const HASH = "a".repeat(64);
const OUTRO = "b".repeat(64);

function aprovada(over: Partial<NonNullable<EntradaDoPortao["aprovacao"]>> = {}) {
  return { ramo: "post" as const, estado: "aprovada" as const, hashArtefato: HASH, publicarEm: null, ...over };
}

describe("o portão de publicação", () => {
  it("com a fila desligada, libera sem olhar nada: é o comportamento de antes", () => {
    const d = decidirPublicacao({ modo: "off", ramo: "post", aprovacao: null, hashAtual: "" });
    expect(d.libera).toBe(true);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.FILA_DESLIGADA);
  });

  it("em ensaio libera, mas diz que seguraria em enforce", () => {
    const d = decidirPublicacao({ modo: "dry_run", ramo: "post", aprovacao: null, hashAtual: HASH });
    expect(d.libera).toBe(true);
    expect(d.liberariaEmEnforce).toBe(false);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.SEM_APROVACAO);
  });

  it("em enforce, sem aprovação registrada, diz não", () => {
    const d = decidirPublicacao({ modo: "enforce", ramo: "post", aprovacao: null, hashAtual: HASH });
    expect(d.libera).toBe(false);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.SEM_APROVACAO);
  });

  it.each([
    ["aguardando", MOTIVOS_DO_PORTAO.AGUARDANDO],
    ["refazendo", MOTIVOS_DO_PORTAO.REFAZENDO],
    ["reprovada", MOTIVOS_DO_PORTAO.REPROVADA],
    ["descartada", MOTIVOS_DO_PORTAO.DESCARTADA],
    ["cancelada", MOTIVOS_DO_PORTAO.CANCELADA],
  ] as const)("estado %s não sai", (estado, motivo) => {
    const d = decidirPublicacao({ modo: "enforce", ramo: "post", aprovacao: aprovada({ estado }), hashAtual: HASH });
    expect(d.libera).toBe(false);
    expect(d.motivo).toBe(motivo);
  });

  it("aprovada e com a mesma versão, sai", () => {
    const d = decidirPublicacao({ modo: "enforce", ramo: "post", aprovacao: aprovada(), hashAtual: HASH });
    expect(d.libera).toBe(true);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.LIBERADA);
  });

  it("aprovada, mas a versão mudou depois: recusa pelo hash (cenário 3)", () => {
    const d = decidirPublicacao({ modo: "enforce", ramo: "post", aprovacao: aprovada(), hashAtual: OUTRO });
    expect(d.libera).toBe(false);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.HASH_DIVERGENTE);
  });

  it("aprovação de outro ramo não serve", () => {
    const d = decidirPublicacao({
      modo: "enforce",
      ramo: "newsletter",
      aprovacao: aprovada({ ramo: "post" }),
      hashAtual: HASH,
    });
    expect(d.libera).toBe(false);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.RAMO_DIVERGENTE);
  });

  it("peça sem versão congelada não é aprovável nem publicável", () => {
    const d = decidirPublicacao({ modo: "enforce", ramo: "post", aprovacao: aprovada({ hashArtefato: "" }), hashAtual: "" });
    expect(d.libera).toBe(false);
    expect(d.motivo).toBe(MOTIVOS_DO_PORTAO.SEM_ARTEFATO);
  });

  it("respeita o horário só quando pedido", () => {
    const publicarEm = "2026-10-09T09:07:00.000Z";
    const antes = Date.parse("2026-10-09T08:00:00.000Z");
    const depois = Date.parse("2026-10-09T10:30:00.000Z");
    const base = { modo: "enforce" as const, ramo: "newsletter" as const, hashAtual: HASH };
    const a = aprovada({ ramo: "newsletter", publicarEm });

    expect(decidirPublicacao({ ...base, aprovacao: a, agoraMs: antes, respeitarHorario: true }).motivo).toBe(
      MOTIVOS_DO_PORTAO.ANTES_DO_HORARIO,
    );
    expect(decidirPublicacao({ ...base, aprovacao: a, agoraMs: depois, respeitarHorario: true }).libera).toBe(true);
    expect(decidirPublicacao({ ...base, aprovacao: a, agoraMs: antes }).libera).toBe(true);
  });

  it("a mensagem do portão é reconhecível pelo worker, e outra mensagem não é", () => {
    const d = decidirPublicacao({ modo: "enforce", ramo: "post", aprovacao: null, hashAtual: HASH });
    expect(ehMensagemDoPortao(mensagemDoPortao(d))).toBe(true);
    expect(ehMensagemDoPortao("SOCIAL_ARTIFACT_HASH_MISMATCH: x")).toBe(false);
  });
});

describe("quem grava o status de entrada pergunta ao portão", () => {
  it("post: scheduled fora de enforce, draft em enforce", () => {
    expect(statusDeEntradaDoPost("off")).toBe("scheduled");
    expect(statusDeEntradaDoPost("dry_run")).toBe("scheduled");
    expect(statusDeEntradaDoPost("enforce")).toBe("draft");
  });

  it("artigo: published fora de enforce, draft em enforce", () => {
    expect(statusDeEntradaDoArtigo("off")).toBe("published");
    expect(statusDeEntradaDoArtigo("enforce")).toBe("draft");
  });

  it("newsletter: a redação só dispara fora de enforce", () => {
    expect(redacaoDisparaNewsletter("off")).toBe(true);
    expect(redacaoDisparaNewsletter("dry_run")).toBe(true);
    expect(redacaoDisparaNewsletter("enforce")).toBe(false);
  });
});

describe("o hash da peça", () => {
  it("não depende da ordem das chaves", () => {
    const a = hashDaPeca({ ramo: "newsletter", conteudo: { assunto: "x", html: "<p>y</p>" } });
    const b = hashDaPeca({ ramo: "newsletter", conteudo: { html: "<p>y</p>", assunto: "x" } });
    expect(a).toBe(b);
  });

  it("o post lê os arquivos na ordem de publicação, não na ordem do manifesto", () => {
    const m1 = [
      { index: 2, sha256: "2".repeat(64) },
      { index: 1, sha256: "1".repeat(64) },
    ];
    const m2 = [m1[1], m1[0]];
    expect(hashDoPostDaLinha({ caption: "c", slides_manifest: m1 })).toBe(
      hashDoPostDaLinha({ caption: "c", slides_manifest: m2 }),
    );
  });

  it("legenda trocada muda o hash", () => {
    const m = [{ index: 1, sha256: "1".repeat(64) }];
    expect(hashDoPostDaLinha({ caption: "c", slides_manifest: m })).not.toBe(
      hashDoPostDaLinha({ caption: "c.", slides_manifest: m }),
    );
  });

  it("post sem arquivo congelado não tem hash: não há versão para aprovar", () => {
    expect(hashDoPostDaLinha({ caption: "c", slides_manifest: [] })).toBe("");
    expect(hashDoPostDaLinha({ caption: "c" })).toBe("");
  });
});
