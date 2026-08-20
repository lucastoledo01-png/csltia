import { render, screen } from "@testing-library/react";
import ArticlesPage from "./page";

describe("Articles index", () => {
  it("renderiza a experiência de newsletter estilo The News", () => {
    render(<ArticlesPage />);

    expect(screen.getByRole("heading", { name: /o_ jornal digital da ia/i })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /mais inteligente/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: /dúvidas/i })).toBeInTheDocument();
  });
});
