import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Leitura que falhou não é projeto ausente.
 *
 * Em 13/09/2026 o ciclo diário morreu sete segundos depois de começar, com
 * "Projeto 00000000-...-000000000001 não encontrado". O projeto existia e
 * estava ativo: foi erro de leitura do Supabase, que vinha dando Gateway
 * Timeout intermitente, colapsado num `null` por um `if (error || !data)`.
 *
 * Custou o dia inteiro. Nem newsletter, nem artigo, nem post. E mandou procurar
 * o defeito na configuração, que estava certa.
 */

const maybeSingle = vi.fn();

vi.mock("./supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("./supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    }),
  };
});

const { getProjectById, requireActiveProject, LeituraDoProjetoFalhou } = await import("./projects");

const LINHA = {
  id: "p1",
  slug: "imigra-us",
  name: "imigra.us",
  status: "active",
  niche: "",
  content_language: "pt-BR",
  timezone: "America/Sao_Paulo",
  site_url: null,
  brand_display_name: "",
  brand_tagline: "",
  brand_primary_color: "#ff4a1c",
  brand_logo_url: null,
  brand_social_links: {},
  newsletter_from_name: "",
  publish_hour_local: 6,
  publish_minute_local: 3,
  editorial_prompt_extra: "",
  settings: {},
};

beforeEach(() => maybeSingle.mockReset());

describe("os dois casos param de ser o mesmo caso", () => {
  it("projeto ausente devolve null", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getProjectById("p1")).toBeNull();
  });

  it("erro de leitura SOBE, e não vira null", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Gateway Timeout" } });
    await expect(getProjectById("p1")).rejects.toBeInstanceOf(LeituraDoProjetoFalhou);
  });

  it("o motivo vai junto, para o alerta não mandar procurar no lugar errado", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Gateway Timeout" } });
    await expect(getProjectById("p1")).rejects.toThrow(/leitura falhou.*Gateway Timeout/);
  });
});

describe("a segunda tentativa, e só para leitura", () => {
  it("timeout que passa na segunda não derruba o dia", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: { message: "Gateway Timeout" } })
      .mockResolvedValueOnce({ data: LINHA, error: null });

    const p = await requireActiveProject("p1");
    expect(p.slug).toBe("imigra-us");
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    // Parou na primeira que deu certo: releitura não insiste à toa.
  });

  it("indisponibilidade real sobe como erro de leitura, e não como ausência", async () => {
    // Sem isto, banco fora do ar apareceria como projeto inexistente e o alerta
    // mandaria conferir a configuração, que está certa.
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Gateway Timeout" } });
    await expect(requireActiveProject("p1")).rejects.toBeInstanceOf(LeituraDoProjetoFalhou);
    // Três tentativas, e aí o erro sobe com o motivo.
    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });

  it("projeto ausente NÃO é tentado de novo", async () => {
    /*
     * A resposta seria a mesma, e insistir só atrasaria o alerta de uma
     * configuração errada.
     */
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(requireActiveProject("p1")).rejects.toThrow(/não encontrado/);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("projeto pausado continua recusado, e sem retentativa", async () => {
    maybeSingle.mockResolvedValue({ data: { ...LINHA, status: "paused" }, error: null });
    await expect(requireActiveProject("p1")).rejects.toThrow(/status "paused"/);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
