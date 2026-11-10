import { describe, expect, it } from "vitest";
import { horarioSemColar } from "./espacamento";

const t = (iso: string) => Date.parse(iso);
const min = 60_000;

describe("horarioSemColar", () => {
  it("horário planejado livre fica como está", () => {
    expect(horarioSemColar({ planejadoMs: t("2026-11-10T21:07:00Z"), agoraMs: t("2026-11-10T19:00:00Z"), ocupadosMs: [t("2026-11-10T17:45:00Z")] })).toBe(
      t("2026-11-10T21:07:00Z"),
    );
  });

  it("dois Reels aprovados para as 18:07 de 10/11: o segundo sai 45 minutos depois", () => {
    expect(horarioSemColar({ planejadoMs: t("2026-11-10T21:07:00Z"), agoraMs: t("2026-11-10T19:09:00Z"), ocupadosMs: [t("2026-11-10T21:07:00Z")] })).toBe(
      t("2026-11-10T21:07:00Z") + 45 * min,
    );
  });

  it("aprovado atrasado às 23:04 de 09/11, com outro às 23:15: sai depois do outro, nunca colado", () => {
    const r = horarioSemColar({
      planejadoMs: t("2026-11-09T22:00:00Z"),
      agoraMs: t("2026-11-09T23:04:00Z"),
      ocupadosMs: [t("2026-11-09T22:30:00Z"), t("2026-11-09T23:15:00Z"), t("2026-11-09T23:45:00Z")],
    });
    for (const o of [t("2026-11-09T22:30:00Z"), t("2026-11-09T23:15:00Z"), t("2026-11-09T23:45:00Z")]) {
      expect(Math.abs(r - o)).toBeGreaterThanOrEqual(45 * min);
    }
    expect(r).toBe(t("2026-11-09T23:45:00Z") + 45 * min);
  });

  it("aprovado atrasado sem ninguém por perto sai agora", () => {
    expect(horarioSemColar({ planejadoMs: t("2026-11-09T11:00:00Z"), agoraMs: t("2026-11-09T13:15:00Z"), ocupadosMs: [t("2026-11-09T14:22:00Z")] })).toBe(
      t("2026-11-09T13:15:00Z"),
    );
  });

  it("sem horário planejado, vale agora com a mesma régua", () => {
    expect(horarioSemColar({ planejadoMs: null, agoraMs: t("2026-11-10T12:00:00Z"), ocupadosMs: [t("2026-11-10T12:10:00Z")] })).toBe(
      t("2026-11-10T12:55:00Z"),
    );
  });
});
