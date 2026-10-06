import fs from "node:fs";
import path from "node:path";
import { CATALOGO_EVERGREEN } from "../lib/server/social/evergreen/catalogo";
import { pautaDoEvergreen } from "../lib/server/social/evergreen/adaptador";
import { AGENTE_DO_EVERGREEN } from "../lib/server/social/evergreen/grounding";
import { extrairTextoDeHtml } from "../lib/server/editorial/enriquecimento";
import type { PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { buscarSegundaFoto, resolveVisualAsset } from "../lib/server/visual/resolver";
import type { TopicoEvergreen } from "../lib/server/social/evergreen/tipos";

/**
 * Quantos tópicos do evergreen morrem por falta de foto, medido só no ramo visual.
 *
 * As amostras de ponta a ponta (`amostras-evergreen.ts`) passam por dois a
 * quatro tópicos por rodada, e com isso a taxa de queda por foto vira sorteio
 * de quais tópicos a seleção pegou. Aqui o catálogo inteiro passa pelo
 * resolvedor de produção, com a pauta montada pelo mesmo adaptador e o resumo
 * igual ao do ciclo (o texto das fontes canônicas). Nada é gravado: sem
 * cliente de banco, sem biblioteca, sem acervo, `somenteLeitura`.
 *
 * Custa a pergunta da cena e as conferências visuais de cada tópico.
 *
 *   npx tsx src/scripts/medir-fotos-evergreen.ts --saida=medicao.json
 *   npx tsx src/scripts/medir-fotos-evergreen.ts --entidade=401k:Internal Revenue Service,programa-artemis:NASA
 *   npx tsx src/scripts/medir-fotos-evergreen.ts --topicos=fdic,credit-score
 *
 * `--bolha` também procura a segunda foto (a do círculo) para cada tópico com
 * foto e entidade nomeada, do jeito que o ciclo faz na vez da bolha.
 */

function carregarEnv(): void {
  for (const arquivo of [".env.local", ".env"]) {
    const caminho = path.resolve(process.cwd(), arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [chave, ...resto] = t.split("=");
      const valor = resto.join("=").trim().replace(/^["']|["']$/g, "");
      if (chave && !process.env[chave.trim()]) process.env[chave.trim()] = valor;
    }
  }
}

async function textoDasFontes(topico: TopicoEvergreen): Promise<string> {
  const textos: string[] = [];
  for (const url of topico.fontesCanonicas) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": AGENTE_DO_EVERGREEN, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!r.ok) continue;
      const t = extrairTextoDeHtml(await r.text());
      if (t.length >= 400) textos.push(t);
    } catch {
      // Fonte fora do ar não muda a pergunta desta medição.
    }
  }
  return textos.join("\n\n") || topico.resumo;
}

/**
 * O Pexels corta rajada com 429 (medido em 06/10/2026: duas buscas em um
 * segundo, a segunda recusada), e o ciclo de produção nunca faz rajada. Para a
 * medição não confundir "o banco recusou a rajada" com "não há foto", as
 * buscas no banco saem espaçadas e a recusada é refeita uma vez.
 */
let proximaBuscaNoBanco = 0;
const ESPACO_ENTRE_BUSCAS_MS = 10_000;
const fetchEspacado: typeof fetch = async (entrada, init) => {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  if (!url.includes("api.pexels.com")) return fetch(entrada, init);
  for (let tentativa = 0; ; tentativa += 1) {
    const agora = Date.now();
    const espera = Math.max(0, proximaBuscaNoBanco - agora);
    proximaBuscaNoBanco = Math.max(agora, proximaBuscaNoBanco) + ESPACO_ENTRE_BUSCAS_MS;
    if (espera) await new Promise((r) => setTimeout(r, espera));
    // O prazo do chamador começou a contar antes da fila: o relógio é refeito aqui.
    const r = await fetch(entrada, { ...init, signal: AbortSignal.timeout(15_000) });
    if (r.status !== 429 || tentativa >= 2) return r;
  }
};

type Linha = {
  topico: string;
  entidadeDeclarada: string | null;
  entidadeVisual: string | null;
  tipo: string | null;
  status: string;
  motivo: string | null;
  fonte: string | null;
  caminho: string | null;
  imagem: string | null;
  vista: string | null;
  recusas: string[];
  bolha: string | null;
};

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const arg = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");
  const saida = arg("saida");
  const soTopicos = (arg("topicos") ?? "").split(",").filter(Boolean);
  const concorrencia = Number(arg("concorrencia")) || 4;
  const comBolha = argv.includes("--bolha");
  const entidades = new Map(
    (arg("entidade") ?? "")
      .split(",")
      .filter(Boolean)
      .map((par) => {
        const [id, ...nome] = par.split(":");
        return [id, nome.join(":")] as const;
      }),
  );

  const topicos = CATALOGO_EVERGREEN.filter((t) => soTopicos.length === 0 || soTopicos.includes(t.id)).map((t) =>
    entidades.has(t.id) ? { ...t, entidade: entidades.get(t.id) || undefined } : t,
  );

  const linhas: Linha[] = [];
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < topicos.length) {
      const topico = topicos[proximo++];
      const item = { topico, angulo: topico.angulos[0] };
      const texto = await textoDasFontes(topico);
      const pacote = { texto_de_origem: texto, source_urls: topico.fontesCanonicas } as unknown as PacoteFactual;
      const pauta = pautaDoEvergreen(item, pacote);
      const paraImagem = {
        storyId: pauta.storyId,
        titulo: pauta.grupo.primary.title,
        resumo: pauta.enriquecimento?.texto ?? "",
        categoria: pauta.classificacao.eixo,
        classificacao: {
          atores: pauta.classificacao.atores,
          lugares: pauta.classificacao.lugares,
          acontecimento: pauta.classificacao.acontecimento,
          pais: pauta.classificacao.pais,
        },
      };
      const r = await resolveVisualAsset(paraImagem, { somenteLeitura: true, fetcher: fetchEspacado });
      let bolha: string | null = null;
      if (comBolha && r.status === "SELECTED" && r.asset) {
        if (r.assetSecundario) bolha = `vice ${r.assetSecundario.imageUrl}`;
        else {
          const extra = await buscarSegundaFoto(paraImagem, r.asset, r.entidade, { somenteLeitura: true, fetcher: fetchEspacado });
          bolha = extra.asset ? `busca extra ${extra.asset.imageUrl}` : `sem segunda foto: ${extra.nota}`.slice(0, 200);
        }
      }
      const linha: Linha = {
        topico: topico.id,
        entidadeDeclarada: topico.entidade ?? null,
        entidadeVisual: r.entidade?.nome ?? null,
        tipo: r.entidade?.tipo ?? null,
        status: r.status,
        motivo: r.motivo,
        fonte: r.status === "SELECTED" ? (r.asset?.source ?? null) : null,
        caminho: r.caminho ?? null,
        imagem: r.status === "SELECTED" ? (r.asset?.imageUrl ?? null) : null,
        vista: r.asset?.conferenciaVisual?.descricao ?? null,
        recusas: r.recusados.map((c) => `${c.origem} ${c.motivo}: ${c.detalhe}`.slice(0, 220)),
        bolha,
      };
      linhas.push(linha);
      console.log(
        `${linha.status === "SELECTED" ? "FOTO" : "SEM "} ${topico.id.padEnd(32)} ` +
          `${(linha.entidadeVisual ?? "-").slice(0, 34).padEnd(34)} ${linha.fonte ?? linha.motivo} ${linha.caminho ?? ""}` +
          (comBolha ? ` | bolha: ${linha.bolha ? (linha.bolha.startsWith("sem") ? "não" : "sim") : "-"}` : ""),
      );
    }
  };
  await Promise.all(Array.from({ length: concorrencia }, trabalhador));

  linhas.sort((a, b) => a.topico.localeCompare(b.topico));
  const comFoto = linhas.filter((l) => l.status === "SELECTED").length;
  console.log(`\n${comFoto} de ${linhas.length} com foto; ${linhas.length - comFoto} sem foto (${((100 * (linhas.length - comFoto)) / linhas.length).toFixed(1)}%)`);
  const porCaminho = new Map<string, number>();
  for (const l of linhas) if (l.caminho) porCaminho.set(l.caminho, (porCaminho.get(l.caminho) ?? 0) + 1);
  console.log(`por caminho: ${[...porCaminho].map(([c, n]) => `${c} ${n}`).join(", ") || "-"}`);
  if (comBolha) {
    const comSegunda = linhas.filter((l) => l.bolha && !l.bolha.startsWith("sem")).length;
    console.log(`com segunda foto para a bolha: ${comSegunda} de ${comFoto}`);
  }
  if (saida) fs.writeFileSync(path.resolve(saida), JSON.stringify(linhas, null, 2) + "\n", "utf-8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
