import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import AdminPage from "./page";
import { MARCA } from "@/lib/marca";

const ABAS = [
  "Redação",
  "Publicações",
  "Carrossel",
  "Layout",
  "Sistema PROMPT",
  "Fontes",
  "CMS Artigos",
  "Analytics",
  "Logs",
  "Comentários",
];

describe("Admin dashboard", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("exibe formulário de login quando não estiver autenticado", () => {
    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: new RegExp(MARCA.nome, "i") })).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar/i })).toBeInTheDocument();
  });

  it("libera o painel de gestão quando a sessão estiver autenticada", () => {
    sessionStorage.setItem("casaloti_admin_authed", "true");
    render(<AdminPage />);

    // Dentro da navegação, e não na página inteira: "Redação" também é o nome
    // do botão de teste no topo, e a busca solta casava com os dois.
    const nav = within(screen.getByRole("navigation"));
    for (const aba of ABAS) {
      expect(nav.getByRole("button", { name: new RegExp(aba, "i") })).toBeInTheDocument();
    }
  });

  /**
   * O painel é mesa de controle, não peça de marca.
   *
   * A navegação usava emoji como sistema de ícones. Emoji muda de desenho por
   * sistema operacional, não tem peso nem alinhamento previsível, e ali era
   * decoração: "Fontes" e "Logs" já dizem o que são.
   *
   * Este teste existe porque decoração volta sozinha. Ela entra num commit
   * pequeno, parece simpática, e em três meses o painel está colorido de novo.
   */
  it("a navegação não usa emoji como ícone", () => {
    sessionStorage.setItem("casaloti_admin_authed", "true");
    render(<AdminPage />);

    const emoji = /\p{Extended_Pictographic}/u;
    const nav = within(screen.getByRole("navigation"));
    for (const aba of ABAS) {
      const botao = nav.getByRole("button", { name: new RegExp(aba, "i") });
      expect(botao.textContent ?? "").not.toMatch(emoji);
    }
  });
});
