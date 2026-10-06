import { CATALOGO_EVERGREEN } from "../lib/server/social/evergreen/catalogo";
import { AGENTE_DO_EVERGREEN, MINIMO_DE_TEXTO, ehFonteCanonica } from "../lib/server/social/evergreen/grounding";
import { termosDoTopico } from "../lib/server/social/evergreen/cobertura";
import { extrairTextoDeHtml } from "../lib/server/editorial/enriquecimento";

/**
 * Confere, por requisição, cada fonte do catálogo do evergreen.
 *
 * Só lê páginas públicas: não chama modelo, não lê nem grava banco. Para cada
 * URL exige três coisas, as mesmas que o lastro exige na hora de escrever:
 *
 *   1. HTTP 200 com o agente honesto do projeto (sem disfarce de navegador);
 *   2. texto extraído com pelo menos MINIMO_DE_TEXTO caracteres;
 *   3. o assunto do tópico presente no texto (o programa ou um termo do nome).
 *
 * A terceira é a que pega o tipo de defeito do B-1/B-2: a página responde e
 * fala de outra coisa. Sai com código 1 se alguma fonte falhar, para servir de
 * conferência antes de mexer no catálogo.
 *
 *   npx tsx src/scripts/conferir-fontes-evergreen.ts
 */

/*
 * O nome do tópico é em português, e a página é em inglês. Onde nem o
 * programa nem o nome aparecem na página, estes são os termos em inglês que
 * provam o assunto. Conferidos à mão contra o texto de cada página.
 */
const TERMOS_EM_INGLES: Record<string, string[]> = {
  "inflacao-cpi": ["inflation"],
  "ferias-e-feriados": ["vacation", "holiday"],
  "w2-ou-1099": ["independent contractor", "self-employ", "misclassif"],
  "patentes-e-marcas": ["patent", "trademark"],
  "vocabulario-do-plano": ["out-of-pocket", "plan-covered", "coinsurance", "deductible"],
  "temporada-do-ir": ["file", "tax return"],
  "congresso-e-leis": ["bill", "legislative"],
};

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function conferir(url: string, termos: string[]) {
  if (!ehFonteCanonica(url)) return { ok: false, detalhe: "domínio fora da lista" };
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": AGENTE_DO_EVERGREEN, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(25_000),
    });
    if (r.status !== 200) return { ok: false, detalhe: `HTTP ${r.status}` };
    const texto = extrairTextoDeHtml(await r.text());
    if (texto.length < MINIMO_DE_TEXTO) return { ok: false, detalhe: `só ${texto.length} caracteres` };
    const alvo = normalizar(texto);
    const achado = termos.find((t) => alvo.includes(normalizar(t)));
    if (!achado) return { ok: false, detalhe: `${texto.length} caracteres, sem o assunto (${termos.slice(0, 4).join(", ")})` };
    return { ok: true, detalhe: `${texto.length} caracteres, cita "${achado}"` };
  } catch (e) {
    return { ok: false, detalhe: (e as Error).message };
  }
}

async function main() {
  const fila = CATALOGO_EVERGREEN.flatMap((topico) =>
    topico.fontesCanonicas.map((url) => ({
      topico,
      url,
      termos: [
        topico.programa ?? "",
        ...termosDoTopico({ topico, angulo: topico.angulos[0] }),
        ...(TERMOS_EM_INGLES[topico.id] ?? []),
      ].filter(Boolean),
    })),
  );

  const linhas: string[] = [];
  let falhas = 0;
  // Três de cada vez: é leitura de órgão público, e não há pressa que justifique mais.
  for (let i = 0; i < fila.length; i += 3) {
    const lote = fila.slice(i, i + 3);
    const resultados = await Promise.all(lote.map((x) => conferir(x.url, x.termos)));
    resultados.forEach((r, j) => {
      if (!r.ok) falhas += 1;
      linhas.push(`${r.ok ? "OK  " : "FALHA"}  ${lote[j].topico.id.padEnd(32)} ${lote[j].url}  (${r.detalhe})`);
    });
  }

  console.log(linhas.join("\n"));
  console.log(
    `\n${CATALOGO_EVERGREEN.length} tópicos, ${fila.length} fontes, ${fila.length - falhas} ok, ${falhas} com falha.`,
  );
  process.exit(falhas > 0 ? 1 : 0);
}

main();
