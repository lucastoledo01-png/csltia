import { describe, expect, it } from "vitest";
import { conteudoInsuficiente, temFatosSuficientes } from "./enriquecimento";

/**
 * A página que respondeu e não entregou a matéria.
 *
 * O caso real: uma candidata do Federal Register foi APROVADA pela
 * classificação primária, e só o verificador de finalista percebeu que o texto
 * "só exibe um bloqueio de acesso e um CAPTCHA". O comprimento estava lá; a
 * matéria não. Barrar isso no enriquecimento economiza duas chamadas de modelo
 * e, mais importante, evita aprovar uma pauta que não existe.
 */

const MATERIA =
  "O United States Citizenship and Immigration Services informou nesta quinta-feira que o prazo de " +
  "renovação automática da permissão de trabalho passa de 180 para 540 dias. A mudança vale para " +
  "pedidos protocolados a partir de outubro e alcança asilo, ajuste de status e renovação por " +
  "casamento. O órgão afirmou que a fila soma 1,2 milhão de pedidos e que a medida evita a " +
  "interrupção do vínculo de trabalho durante a análise do processo. A publicação saiu no " +
  "Federal Register desta semana e vale para todo o território americano.";

describe("conteúdo insuficiente", () => {
  it("matéria de verdade passa", () => {
    expect(conteudoInsuficiente(MATERIA).insuficiente).toBe(false);
    expect(temFatosSuficientes({ texto: MATERIA } as never)).toBe(true);
  });

  it("página de CAPTCHA é barrada, mesmo sendo longa", () => {
    const bloqueio =
      "Access Denied. Please verify you are human. Complete the CAPTCHA below to continue browsing. " +
      "Checking your browser before accessing the site. This process is automatic and should take " +
      "only a few seconds of your time. Your browser will redirect to your requested content shortly. " +
      "Please enable cookies and enable JavaScript to continue using this website normally. " +
      "Cloudflare Ray ID: 8a3f2b1c. Performance and security are provided by Cloudflare services.";

    const r = conteudoInsuficiente(bloqueio);
    expect(r.insuficiente).toBe(true);
    expect(r.motivo).toMatch(/bloqueio/);
  });

  it("um marcador só não condena uma matéria que tem corpo", () => {
    // Reportagem sobre segurança digital cita CAPTCHA e continua sendo pauta.
    const sobreCaptcha =
      "A empresa anunciou nesta terça-feira que vai substituir o CAPTCHA por verificação por " +
      "dispositivo em todos os seus serviços de autenticação de usuários. A mudança começa em " +
      "outubro e alcança cerca de 40 milhões de pessoas em doze países diferentes. Segundo a " +
      "companhia, o método antigo bloqueava três por cento dos acessos legítimos por engano. " +
      "A decisão foi tomada depois de um estudo interno que durou dois anos e ouviu clientes.";

    expect(conteudoInsuficiente(sobreCaptcha).insuficiente).toBe(false);
  });

  it("um marcador com pouco corpo é bloqueio", () => {
    const magro = "Access denied. " + "Retry later. ".repeat(40);
    const r = conteudoInsuficiente(magro);
    expect(r.insuficiente).toBe(true);
    expect(r.motivo).toMatch(/access denied/);
  });

  it("texto longo sem frase de matéria não sustenta pauta", () => {
    // Menu, rodapé e lista de links: tem tamanho, não tem texto corrido.
    const navegacao = "Início Notícias Economia Esportes Contato Sobre Assine Newsletter ".repeat(12);
    const r = conteudoInsuficiente(navegacao);
    expect(r.insuficiente).toBe(true);
    expect(r.motivo).toMatch(/frase/);
  });

  it("texto curto continua sendo barrado pelo mínimo de sempre", () => {
    const r = conteudoInsuficiente("Nota curta.");
    expect(r.insuficiente).toBe(true);
    expect(r.motivo).toMatch(/caracteres/);
  });

  it("login wall é barrado", () => {
    const paywall =
      "Sign in to continue reading this article from our newsroom today. Subscribe to read the full " +
      "story and get unlimited access to our journalism across every device you own. Already a " +
      "subscriber? Sign in to continue where you left off reading. Choose a plan that fits your " +
      "needs and support independent reporting today and every day of the year.";
    expect(conteudoInsuficiente(paywall).insuficiente).toBe(true);
  });

  it("o detector acha acento e maiúscula do mesmo jeito", () => {
    const pt = "ACESSO NEGADO. Verifique se você é humano. " + "Tente novamente. ".repeat(30);
    expect(conteudoInsuficiente(pt).insuficiente).toBe(true);
  });
});
