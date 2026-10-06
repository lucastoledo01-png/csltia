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

function scriptDoTurnstile(): Element | null {
  return document.querySelector('script[src*="challenges.cloudflare.com"]');
}

describe("NewsletterSignup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((s) => s.remove());
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

    fireEvent.focus(screen.getByLabelText(/email para newsletter/i));
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

  /*
   * O captcha não carrega com a página (06/10/2026): a caixa fica no fim de
   * toda página do portal e o script da Cloudflare pesava em cada visita.
   */
  it("não baixa nem desenha o captcha antes de a pessoa mostrar intenção de assinar", () => {
    render(<NewsletterSignup aparencia="portal" source="portal-materia" />);

    expect(window.turnstile?.render).not.toHaveBeenCalled();
    expect(scriptDoTurnstile()).toBeNull();
  });

  it("liga o captcha no foco do campo", async () => {
    render(<NewsletterSignup aparencia="portal" source="portal-materia" />);

    fireEvent.focus(screen.getByLabelText(/email para newsletter/i));

    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(1));
    expect(window.turnstile?.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ action: "newsletter_signup" }));
  });

  it("envio sem interação prévia espera o token e sai sozinho, nunca sem ele", async () => {
    let resolverToken: (token: string) => void = () => {};
    window.turnstile = {
      render: vi.fn((_element: HTMLElement, options: { callback: (token: string) => void }) => {
        resolverToken = options.callback;
        return "widget-id";
      }),
      remove: vi.fn(),
    };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterSignup aparencia="portal" source="portal-materia" />);
    fireEvent.change(screen.getByLabelText(/email para newsletter/i), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.submit(screen.getByRole("button", { name: /assinar/i }).closest("form")!);

    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/conferindo que voce nao e robo/i)).toBeInTheDocument();

    resolverToken("token-tardio");

    await waitFor(() => expect(screen.getByText(/pronto, seu email entrou na lista/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/newsletter",
      expect.objectContaining({
        body: JSON.stringify({ email: "pessoa@exemplo.com", source: "portal-materia", turnstileToken: "token-tardio" }),
      }),
    );
  });

  it("widget que falha com envio pendente devolve o botão e pede o captcha", async () => {
    let falhar: () => void = () => {};
    window.turnstile = {
      render: vi.fn((_element: HTMLElement, options: { "error-callback": () => void }) => {
        falhar = options["error-callback"];
        return "widget-id";
      }),
      remove: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterSignup aparencia="portal" source="portal-materia" />);
    fireEvent.change(screen.getByLabelText(/email para newsletter/i), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.submit(screen.getByRole("button", { name: /assinar/i }).closest("form")!);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());

    falhar();

    await waitFor(() => expect(screen.getByText(/confirme que voce nao e robo/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /assinar/i })).not.toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("avisa quando o captcha ainda nao foi concluido", async () => {
    window.turnstile = {
      render: vi.fn(() => "widget-id"),
      remove: vi.fn(),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterSignup source="newsletter-home" compact />);

    fireEvent.focus(screen.getByLabelText(/email para newsletter/i));
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/email para newsletter/i), { target: { value: "pessoa@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: /inscreva-se/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/confirme que voce nao e robo/i)).toBeInTheDocument();
  });
});
