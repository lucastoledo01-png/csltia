import { describe, expect, it } from "vitest";
import { linkDaNewsletter, linkDoDirect, linkDoVisaMatch } from "./visamatch";

describe("linkDoVisaMatch", () => {
  it("carrega afiliado e UTM da origem", () => {
    const url = new URL(
      linkDoVisaMatch({ fonte: "newsletter", meio: "email", conteudo: "teste" }, {})
    );
    expect(url.searchParams.get("affiliatetype")).toBe("external");
    expect(url.searchParams.get("affiliatename")).toBe("imigra-us");
    expect(url.searchParams.get("utm_source")).toBe("newsletter");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("imigra-us");
    expect(url.searchParams.get("utm_content")).toBe("teste");
  });

  it("aceita destino e afiliado vindos do ambiente", () => {
    const url = new URL(
      linkDoVisaMatch(
        { fonte: "a", meio: "b", conteudo: "c" },
        { VISAMATCH_URL: "https://outro.exemplo/", VISAMATCH_AFFILIATE_NAME: "parceiro" }
      )
    );
    expect(url.origin).toBe("https://outro.exemplo");
    expect(url.searchParams.get("affiliatename")).toBe("parceiro");
  });

  it("separa o desempenho por edição no utm_content", () => {
    const url = new URL(linkDaNewsletter("2026-09-05", {}));
    expect(url.searchParams.get("utm_content")).toBe("edicao-2026-09-05");
  });

  it("mantém o conteúdo combinado para a automação de direct", () => {
    const url = new URL(linkDoDirect({}));
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_content")).toBe("direct-automacao-posts");
  });
});
