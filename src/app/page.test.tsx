import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Casaloti home", () => {
  it("usa o visual inspirado no the news com o laranja do IA", () => {
    render(<Home />);

    expect(screen.getAllByRole("link", { name: /casaloti ia/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: /o_ jornal digital da ia/i })).toBeInTheDocument();
    expect(screen.getByText(/sem palestra de linkedin/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /inscreva-se/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("mantém o menu limpo", () => {
    render(<Home />);

    expect(screen.getAllByRole("link", { name: /ultraprompts/i })[0]).toHaveAttribute("href", "/ultraprompts");
    expect(screen.getAllByRole("link", { name: /artigos/i })[0]).toHaveAttribute("href", "/artigos");
    expect(screen.getAllByRole("link", { name: /formações/i })[0]).toHaveAttribute("href", "/formacoes");
    expect(screen.queryByRole("link", { name: /podcast/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /streak/i })).not.toBeInTheDocument();
  });

  it("tem voz humana, nostálgica e sem travessão", () => {
    render(<Home />);

    expect(screen.getByText(/MSN piscando/i)).toBeInTheDocument();
    expect(screen.getByText(/Orkut, MSN, Windows XP/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dúvidas/i })).toBeInTheDocument();
    expect(screen.getByText(/sem nudges/i)).toBeInTheDocument();
  });
});
