import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterSignup } from "./NewsletterSignup";

declare global {
  interface Window {
    turnstile?: {
      render: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  }
}

describe("NewsletterSignup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.turnstile = {
      render: vi.fn((_element: HTMLElement, options: { callback: (token: string) => void }) => {
        options.callback("turnstile-token");
        return "widget-id";
      }),
      remove: vi.fn(),
    };
  });

  it("envia email e token Turnstile para a rota que sincroniza Supabase e Listmonk", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, listmonk: { synced: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterSignup source="newsletter-home" />);

    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/email para newsletter/i), { target: { value: " Pessoa@Exemplo.com " } });
    fireEvent.click(screen.getByRole("button", { name: /inscreva-se/i }));

    await waitFor(() => expect(screen.getByText(/pronto, seu email entrou na lista/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/newsletter",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "Pessoa@Exemplo.com", source: "newsletter-home", turnstileToken: "turnstile-token" }),
      }),
    );
  });

  it("avisa quando o captcha ainda nao foi concluido", async () => {
    window.turnstile = {
      render: vi.fn(() => "widget-id"),
      remove: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterSignup source="newsletter-home" compact />);

    fireEvent.change(screen.getByLabelText(/email para newsletter/i), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: /inscreva-se/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/confirme que voce nao e robo/i)).toBeInTheDocument();
  });
});
