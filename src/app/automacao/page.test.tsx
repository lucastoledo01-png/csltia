import { render, screen } from "@testing-library/react";
import AutomationPage from "./page";

describe("Automation structure", () => {
  it("documenta a esteira de conteúdo autônoma", () => {
    render(<AutomationPage />);

    expect(screen.getByRole("heading", { name: /esteira autônoma desbuguei.ia/i })).toBeInTheDocument();
    expect(screen.getByText(/hacker news/i)).toBeInTheDocument();
    expect(screen.getByText(/rss de blogs/i)).toBeInTheDocument();
    expect(screen.getByText(/arxiv/i)).toBeInTheDocument();
    expect(screen.getByText(/youtube/i)).toBeInTheDocument();
    expect(screen.getAllByText(/instagram/i).length).toBeGreaterThanOrEqual(2);
  });
});
