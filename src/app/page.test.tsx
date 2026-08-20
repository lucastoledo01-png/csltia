import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Casaloti home", () => {
  it("usa botões sólidos com o laranja do IA", () => {
    render(<Home />);

    const buttons = screen.getAllByRole("button", { name: /inscreva-se/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    buttons.forEach((button) => expect(button).toHaveClass("cta-gradient"));
  });

  it("mantém o menu limpo", () => {
    render(<Home />);

    expect(screen.getAllByRole("link", { name: /ultraprompts/i })[0]).toHaveAttribute("href", "/ultraprompts");
    expect(screen.getAllByRole("link", { name: /artigos/i })[0]).toHaveAttribute("href", "/artigos");
    expect(screen.getAllByRole("link", { name: /formações/i })[0]).toHaveAttribute("href", "/formacoes");
    expect(screen.queryByRole("link", { name: /podcast/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /streak/i })).not.toBeInTheDocument();
  });

  it("usa apenas a imagem do logo no topo", () => {
    render(<Home />);

    expect(screen.queryByTestId("brand-dot")).not.toBeInTheDocument();
    expect(screen.getAllByAltText(/Casaloti IA/i).length).toBeGreaterThanOrEqual(1);
  });

  it("troca a headline por um loop com cara de programação", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /while IA atualiza/i })).toBeInTheDocument();
    expect(screen.getByText(/aprende/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cria/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/vende/i)).toBeInTheDocument();
  });

  it("não finge integração Cloudflare antes dela existir", () => {
    render(<Home />);

    expect(screen.queryByText(/cloudflare/i)).not.toBeInTheDocument();
    expect(screen.getByText(/anti-spam entra aqui/i)).toBeInTheDocument();
  });

  it("tem voz humana, nostálgica e sem travessão", () => {
    render(<Home />);

    expect(screen.getByText(/MSN piscando/i)).toBeInTheDocument();
    expect(screen.getByText(/Orkut, MSN, Windows XP/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dúvidas/i })).toBeInTheDocument();
    expect(screen.getByText(/sem nudges/i)).toBeInTheDocument();
  });
});
