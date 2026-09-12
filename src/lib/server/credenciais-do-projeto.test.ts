import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A credencial do canal vem do projeto, e o ambiente é o padrão.
 *
 * Sem isto, ligar o social em dois projetos publicaria os dois no MESMO perfil
 * do Instagram e na MESMA lista do Listmonk: `INSTAGRAM_ACCOUNT_ID` e a
 * configuração inteira do Listmonk são variáveis de ambiente, globais ao
 * deploy. É o bloqueio que sobrou depois da Fase 0.
 *
 * Como na Fase 0, a mudança é aditiva: projeto sem credencial cai no ambiente,
 * exatamente como antes.
 */

const getProjectCredentials = vi.fn();
const resolveInstagramToken = vi.fn();

vi.mock("./projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("./projects")>();
  return { ...real, getProjectCredentials: (...a: unknown[]) => getProjectCredentials(...a) };
});

vi.mock("./social/instagram/meta-token", async (importOriginal) => {
  const real = await importOriginal<typeof import("./social/instagram/meta-token")>();
  return { ...real, resolveInstagramToken: (...a: unknown[]) => resolveInstagramToken(...a) };
});

const { envDoInstagram, envDoListmonk } = await import("./credenciais-do-projeto");

const AMBIENTE = {
  INSTAGRAM_ACCESS_TOKEN: "token-do-ambiente",
  INSTAGRAM_ACCOUNT_ID: "conta-do-ambiente",
  LISTMONK_URL: "https://listmonk.exemplo",
  LISTMONK_API_TOKEN: "token-listmonk-do-ambiente",
  LISTMONK_DEFAULT_LIST_ID: "4,1",
};

beforeEach(() => {
  getProjectCredentials.mockReset().mockResolvedValue(null);
  resolveInstagramToken.mockReset().mockResolvedValue("token-do-ambiente");
});

describe("Instagram", () => {
  it("projeto sem credencial não muda nada", async () => {
    expect(await envDoInstagram("proj-1", AMBIENTE)).toEqual(AMBIENTE);
  });

  it("a conta do projeto vence a do ambiente", async () => {
    getProjectCredentials.mockResolvedValue({ account_id: "conta-do-projeto" });
    const env = await envDoInstagram("proj-1", AMBIENTE);
    expect(env.INSTAGRAM_ACCOUNT_ID).toBe("conta-do-projeto");
  });

  it("o token continua vindo de resolveInstagramToken, e não de leitura própria", async () => {
    // A garantia que já existia e que eu quase perdi: a pergunta à Meta vai com
    // o token efetivo, nunca com a semente vencida do ambiente.
    resolveInstagramToken.mockResolvedValue("token-renovado");
    getProjectCredentials.mockResolvedValue({ account_id: "conta-do-projeto" });

    const env = await envDoInstagram("proj-1", AMBIENTE);
    expect(resolveInstagramToken).toHaveBeenCalledWith("proj-1", AMBIENTE);
    expect(env.INSTAGRAM_ACCESS_TOKEN).toBe("token-renovado");
  });

  it("conta vazia ou de tipo errado é ausência, e não apaga a que funciona", async () => {
    for (const account_id of ["", "   ", 12345, null, { id: "x" }]) {
      getProjectCredentials.mockResolvedValue({ account_id });
      const env = await envDoInstagram("proj-1", AMBIENTE);
      expect(env.INSTAGRAM_ACCOUNT_ID).toBe("conta-do-ambiente");
    }
  });

  it("banco fora do ar cai no ambiente em vez de derrubar a publicação", async () => {
    getProjectCredentials.mockRejectedValue(new Error("gateway timeout"));
    const env = await envDoInstagram("proj-1", AMBIENTE);
    expect(env.INSTAGRAM_ACCOUNT_ID).toBe("conta-do-ambiente");
  });

  it("sem projeto, nem consulta o banco", async () => {
    await envDoInstagram("", AMBIENTE);
    expect(getProjectCredentials).not.toHaveBeenCalled();
  });
});

describe("Listmonk", () => {
  it("projeto sem credencial não muda nada", async () => {
    expect(await envDoListmonk("proj-1", AMBIENTE)).toEqual(AMBIENTE);
  });

  it("cada chave é independente: só a lista declarada, o resto do ambiente", async () => {
    /*
     * É o caso real de vários projetos numa instalação só do Listmonk, cada um
     * com a sua lista.
     */
    getProjectCredentials.mockResolvedValue({ list_ids: [7] });
    const env = await envDoListmonk("proj-1", AMBIENTE);
    expect(env.LISTMONK_DEFAULT_LIST_ID).toBe("7");
    expect(env.LISTMONK_URL).toBe("https://listmonk.exemplo");
    expect(env.LISTMONK_API_TOKEN).toBe("token-listmonk-do-ambiente");
  });

  it("aceita lista como array e como string, porque as duas existem", async () => {
    getProjectCredentials.mockResolvedValue({ list_ids: [9, 3] });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_DEFAULT_LIST_ID).toBe("9,3");

    getProjectCredentials.mockResolvedValue({ list_ids: "9,3" });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_DEFAULT_LIST_ID).toBe("9,3");
  });

  it("id inválido na lista é descartado, e lista só de lixo é ausência", async () => {
    getProjectCredentials.mockResolvedValue({ list_ids: [0, -2, "x", 5] });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_DEFAULT_LIST_ID).toBe("5");

    getProjectCredentials.mockResolvedValue({ list_ids: [0, "x"] });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_DEFAULT_LIST_ID).toBe("4,1");
  });

  it("aceita token sob os dois nomes que aparecem no mundo real", async () => {
    getProjectCredentials.mockResolvedValue({ token: "por-token" });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_API_TOKEN).toBe("por-token");

    getProjectCredentials.mockResolvedValue({ api_token: "por-api-token" });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_API_TOKEN).toBe("por-api-token");
  });

  it("url do projeto vence a do ambiente", async () => {
    getProjectCredentials.mockResolvedValue({ url: "https://outro.listmonk" });
    expect((await envDoListmonk("p", AMBIENTE)).LISTMONK_URL).toBe("https://outro.listmonk");
  });
});
