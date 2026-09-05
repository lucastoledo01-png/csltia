import { describe, expect, it } from "vitest";
import { limparVicios, semTravessao } from "./anti-vicios";

describe("travessão", () => {
  it("vira vírgula quando é pausa no meio da frase", () => {
    expect(semTravessao("O prazo caiu — e isso muda o planejamento.")).toBe(
      "O prazo caiu, e isso muda o planejamento.",
    );
  });

  it("vira vírgula nos dois lados quando cerca um aposto", () => {
    const r = semTravessao("O USCIS — órgão que analisa os pedidos — abriu consulta.");
    expect(r).not.toMatch(/[—–]/);
    expect(r).toContain("O USCIS, órgão que analisa os pedidos, abriu consulta.");
  });

  it("vira hífen quando está colado, como em intervalo", () => {
    expect(semTravessao("O período 2020—2024 teve fila maior.")).toBe(
      "O período 2020-2024 teve fila maior.",
    );
  });

  it("some quando abre a linha", () => {
    expect(semTravessao("— Isso é um aparte")).toBe("Isso é um aparte");
  });

  it("não deixa pontuação dobrada", () => {
    // A troca por vírgula pode encostar em outra vírgula ou num ponto.
    expect(semTravessao("Ele foi solto — , sob fiança.")).not.toContain(", ,");
    expect(semTravessao("Sem alteração — .")).not.toContain(", .");
  });

  it("não toca no hífen comum", () => {
    expect(semTravessao("visto H-1B e green card")).toBe("visto H-1B e green card");
  });
});

describe("limpeza em profundidade", () => {
  it("alcança string dentro de objeto e de lista", () => {
    // A edição é um objeto aninhado. Limpar só o topo deixaria o travessão em
    // toda pauta, que é onde ele mais aparece.
    const antes = {
      headline: "Fila cai — e o prazo muda",
      stories: [{ title: "USCIS — novo aviso", pontos: ["um — dois"] }],
      numero: 5,
      nulo: null,
    };

    const depois = limparVicios(antes);

    expect(JSON.stringify(depois)).not.toMatch(/[—–]/);
    expect(depois.numero).toBe(5);
    expect(depois.nulo).toBeNull();
  });
});

describe("assinatura", () => {
  it("não deixa ponto seguido de vírgula quando o travessão vinha depois do ponto", () => {
    expect(semTravessao("Até amanhã. — imigra.us")).toBe("Até amanhã. imigra.us");
  });
});
