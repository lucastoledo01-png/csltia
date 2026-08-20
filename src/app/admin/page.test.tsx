import { render, screen } from "@testing-library/react";
import AdminPage from "./page";

describe("Admin dashboard", () => {
  it("mostra os controles editoriais e de email que vamos precisar", () => {
    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: /admin casaloti/i })).toBeInTheDocument();
    expect(screen.getByText(/fila de artigos/i)).toBeInTheDocument();
    expect(screen.getByText(/campanhas de email/i)).toBeInTheDocument();
    expect(screen.getByText(/dashboard de dados/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Supabase/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Listmonk/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SEO, AEO e AGE/i)).toBeInTheDocument();
    expect(screen.getByText(/revisão humana/i)).toBeInTheDocument();
    expect(screen.getByText(/entregabilidade/i)).toBeInTheDocument();
  });
});
