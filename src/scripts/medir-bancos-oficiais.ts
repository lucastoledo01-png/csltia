import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { resolveVisualAsset, type Conferente, type PautaParaImagem } from "../lib/server/visual/resolver";
import { conferirImagem, paraConferir } from "../lib/server/visual/conferencia-visual";
import { calculateCost } from "../lib/server/newsroom/ai-provider";
import { ehPessoa, normalizarEntidade, type ResultadoVisual } from "../lib/server/visual/tipos";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";

/**
 * Antes e depois dos bancos oficiais, em pautas REAIS (06/10/2026).
 *
 * Lê do banco, só com SELECT, as pautas aprovadas dos últimos dias cuja
 * manchete nomeia um político brasileiro ou uma autoridade americana, e passa
 * cada uma duas vezes pelo resolvedor de produção, em leitura: sem os bancos
 * oficiais (o código de hoje) e com eles. A pergunta é uma só: a pauta ganhou a
 * foto DA PESSOA que a manchete nomeia?
 *
 * Nada é gravado: sem cliente de banco no resolvedor, sem biblioteca, sem
 * acervo, `somenteLeitura`.
 *
 * O custo das chamadas de modelo (conferência visual e pergunta da cena) é
 * somado pelo uso que a própria API devolve, e o script para de abrir pautas
 * novas quando passa do teto (`--custo`, US$ 1 por padrão). A conferência da
 * mesma foto para a mesma manchete é feita uma vez e reaproveitada no "depois".
 *
 *   npx tsx src/scripts/medir-bancos-oficiais.ts --dias=30 --max=30 --custo=1 \
 *     --saida=docs/design/bancos-oficiais-2026-10-06
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

/**
 * Quem a medição procura na manchete. A lista é da linha editorial de hoje:
 * política brasileira em ano de eleição e as autoridades americanas que mais
 * aparecem nas pautas aprovadas (contado em 06/10/2026).
 */
const PESSOAS = [
  "Lula", "Flávio Bolsonaro", "Jair Bolsonaro", "Bolsonaro", "Eduardo Bolsonaro", "Michelle Bolsonaro",
  "Alexandre de Moraes", "Moraes", "Haddad", "Tarcísio", "Hugo Motta", "Alcolumbre", "Gleisi", "Galípolo",
  "Simone Tebet", "Ciro Gomes", "Caiado", "Ratinho", "Zema", "Boulos", "Alckmin", "Barroso", "Fachin", "Gilmar",
  "Trump", "Hegseth", "Bessent", "Rubio", "Vance", "Powell", "Newsom", "Mamdani", "Biden", "Musk", "Leavitt",
  "Lutnick", "Kennedy", "Noem", "Bondi", "Waltz", "Bonta", "Johnson", "Schumer", "Jeffries", "Warsh", "Hassett",
];

function nomeiaPessoa(titulo: string): string | null {
  const t = ` ${normalizarEntidade(titulo)} `;
  return PESSOAS.find((p) => t.includes(` ${normalizarEntidade(p)} `)) ?? null;
}

async function pautasComPessoa(dias: number, max: number): Promise<Array<{ id: string; pessoa: string; pauta: PautaParaImagem }>> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from("news_candidates")
    .select("story_id,title,summary,description,editorial_axis,actors,places,event_terms,country,created_at")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .like("decision_reason", "APPROVED%")
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`leitura de news_candidates falhou: ${error.message}`);

  const vistas = new Set<string>();
  const saida: Array<{ id: string; pessoa: string; pauta: PautaParaImagem }> = [];
  const porPessoa = new Map<string, number>();
  for (const r of data ?? []) {
    if (r.editorial_axis === "imigracao") continue;
    const pessoa = nomeiaPessoa(String(r.title ?? ""));
    if (!pessoa) continue;
    const chave = normalizarEntidade(String(r.title)).slice(0, 60);
    if (vistas.has(chave)) continue;
    // No máximo três pautas por pessoa, para Trump não ser a medição inteira.
    if ((porPessoa.get(pessoa) ?? 0) >= 3) continue;
    vistas.add(chave);
    porPessoa.set(pessoa, (porPessoa.get(pessoa) ?? 0) + 1);
    saida.push({
      id: `${String(r.created_at).slice(0, 10)} ${r.story_id}`,
      pessoa,
      pauta: {
        storyId: r.story_id as string,
        titulo: r.title as string,
        resumo: (r.summary as string) || (r.description as string) || "",
        categoria: (r.editorial_axis as string) || "",
        classificacao: {
          atores: (r.actors as string[]) ?? [],
          lugares: (r.places as string[]) ?? [],
          acontecimento: (r.event_terms as string[]) ?? [],
          pais: (r.country as string) || undefined,
        },
      },
    });
  }
  // As brasileiras primeiro: são o motivo da medição.
  saida.sort((a, b) => Number(b.pauta.classificacao.pais === "Brasil") - Number(a.pauta.classificacao.pais === "Brasil"));
  return saida.slice(0, max);
}

/** O custo das chamadas de modelo, pelo uso que a API devolve. */
let gasto = 0;
let teto = 1;
const fetchContado: typeof fetch = async (entrada, init) => {
  const url = String(entrada instanceof Request ? entrada.url : entrada);
  const ehModelo = /api\.openai\.com|\/chat\/completions|\/responses/.test(url);
  if (ehModelo && gasto >= teto) throw new Error(`teto de custo da medição atingido (US$ ${gasto.toFixed(3)})`);
  const r = await fetch(entrada, init);
  if (ehModelo) {
    try {
      const corpo = (await r.clone().json()) as {
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
      };
      const u = corpo.usage ?? {};
      gasto += calculateCost(
        corpo.model ?? "",
        u.prompt_tokens ?? u.input_tokens ?? 0,
        u.completion_tokens ?? u.output_tokens ?? 0,
      );
    } catch {
      // Resposta sem uso legível conta pelo pior caso de uma conferência.
      gasto += 0.01;
    }
  }
  return r;
};

/** A mesma foto na mesma manchete é conferida uma vez, e o "depois" reaproveita. */
const veredictos = new Map<string, ReturnType<Conferente>>();
const conferente: Conferente = (asset, pauta) => {
  const chave = [asset.imageUrl, pauta.titulo, pauta.uso ?? "", pauta.papel ?? ""].join("|");
  if (!veredictos.has(chave)) veredictos.set(chave, conferirImagem(asset, pauta, { fetcher: fetchContado }));
  return veredictos.get(chave)!;
};

type Lado = {
  status: string;
  caminho: string | null;
  entidade: string | null;
  tipo: string | null;
  fonte: string | null;
  banco: string | null;
  imagem: string | null;
  credito: string;
  data: string | null;
  vista: string | null;
  fotoDaPessoa: boolean;
};

function lado(r: ResultadoVisual, pessoa: string): Lado {
  const a = r.status === "SELECTED" ? r.asset : null;
  const textoDaFoto = normalizarEntidade(
    [a?.sourceAssetId, a?.metadata?.titulo, a?.metadata?.descricao, a?.metadata?.categorias].map((x) => String(x ?? "")).join(" "),
  );
  const sobrenome = normalizarEntidade(pessoa).split(" ").pop() ?? "";
  /*
   * "Foto da pessoa": a foto veio pelo caminho da entidade, a entidade é uma
   * pessoa, a conferência visual aprovou, e o registro da foto (nome do
   * arquivo, legenda do banco) nomeia a pessoa que a manchete cita.
   */
  const fotoDaPessoa = Boolean(
    a &&
      r.caminho === "entidade" &&
      r.entidade &&
      ehPessoa(r.entidade.tipo) &&
      sobrenome.length >= 3 &&
      ` ${textoDaFoto} `.includes(` ${sobrenome} `),
  );
  return {
    status: r.status,
    caminho: r.caminho ?? null,
    entidade: r.entidade?.nome ?? null,
    tipo: r.entidade?.tipo ?? null,
    fonte: a?.source ?? null,
    banco: (a?.metadata?.banco_nome as string) ?? null,
    imagem: a?.imageUrl ?? null,
    credito: a?.attribution ?? "",
    data: a?.metadata?.data ? String(a.metadata.data) : a?.assetDate ? String(a.assetDate) : null,
    vista: a?.conferenciaVisual?.descricao ?? null,
    fotoDaPessoa,
  };
}

async function miniatura(url: string | null, largura: number, altura: number): Promise<Buffer> {
  const vazio = () =>
    sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 230, g: 230, b: 230 } } }).png().toBuffer();
  if (!url) return vazio();
  try {
    // O original do Commons passa de 20 MB: a folha usa a miniatura de 1280 px do mesmo arquivo.
    const r = await fetch(paraConferir(url), { headers: { "User-Agent": "eua.journal/1.0 (+https://casaloti.ia.br)" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return vazio();
    return await sharp(Buffer.from(await r.arrayBuffer())).resize(largura, altura, { fit: "cover", position: "attention" }).png().toBuffer();
  } catch {
    return vazio();
  }
}

function escaparXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A folha de contato: uma linha por pauta, antes à esquerda e depois à direita. */
async function folhaDeContato(
  linhas: Array<{ id: string; pessoa: string; titulo: string; antes: Lado; depois: Lado }>,
  arquivo: string,
): Promise<void> {
  const L = 300;
  const A = 300;
  const TEXTO = 520;
  const ALTURA_LINHA = A + 20;
  const largura = TEXTO + 2 * (L + 20);
  const camadas: OverlayOptions[] = [];
  let svg = "";
  for (const [i, l] of linhas.entries()) {
    const y = i * ALTURA_LINHA + 10;
    camadas.push({ input: await miniatura(l.antes.imagem, L, A), left: TEXTO, top: y });
    camadas.push({ input: await miniatura(l.depois.imagem, L, A), left: TEXTO + L + 20, top: y });
    const linhasDeTexto = [
      `${l.pessoa}  (${l.id.slice(0, 10)})`,
      ...(l.titulo.match(/.{1,60}(\s|$)/g) ?? [l.titulo]).slice(0, 4),
      `ANTES: ${l.antes.fotoDaPessoa ? "foto da pessoa" : l.antes.status === "SELECTED" ? `outra foto (${l.antes.caminho})` : "sem foto"} ${l.antes.fonte ?? ""}`,
      `DEPOIS: ${l.depois.fotoDaPessoa ? "foto da pessoa" : l.depois.status === "SELECTED" ? `outra foto (${l.depois.caminho})` : "sem foto"} ${l.depois.banco ?? l.depois.fonte ?? ""}`,
      l.depois.credito.slice(0, 70),
      l.depois.data ? `data da foto: ${l.depois.data}` : "",
    ].filter(Boolean);
    linhasDeTexto.forEach((t, j) => {
      svg += `<text x="10" y="${y + 22 + j * 24}" font-family="Helvetica" font-size="${j === 0 ? 18 : 15}" font-weight="${j === 0 ? 700 : 400}" fill="#111">${escaparXml(t)}</text>`;
    });
  }
  const altura = linhas.length * ALTURA_LINHA + 20;
  camadas.unshift({ input: Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(camadas)
    .jpeg({ quality: 78 })
    .toFile(arquivo);
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const arg = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=");
  const dias = Number(arg("dias")) || 30;
  const max = Number(arg("max")) || 30;
  teto = Number(arg("custo")) || 1;
  const saida = arg("saida");

  const so = arg("so");
  // `--so=<trecho da manchete>`: uma pauta só, para olhar o detalhe dela.
  const pautas = (await pautasComPessoa(dias, max)).filter((p) => !so || p.pauta.titulo.toLowerCase().includes(so.toLowerCase()));
  console.log(`${pautas.length} pauta(s) com pessoa nomeada na manchete, teto de custo US$ ${teto}`);

  const linhas: Array<{ id: string; pessoa: string; titulo: string; pais: string; antes: Lado; depois: Lado; notas: string[] }> = [];
  for (const { id, pessoa, pauta } of pautas) {
    if (gasto >= teto) {
      console.log(`teto de custo atingido (US$ ${gasto.toFixed(3)}), parando antes de ${id}`);
      break;
    }
    /*
     * `--sem-conferencia`: sem chamada de modelo nenhuma. O resolvedor aprova a
     * primeira da fila, que é a foto que a conferência abriria primeiro. Serve
     * quando a conta do modelo está sem crédito (06/10/2026), e quem confere
     * é quem olha a folha de contato.
     */
    const comum = {
      somenteLeitura: true,
      fetcher: fetchContado,
      conferenciaVisual: argv.includes("--sem-conferencia") ? (false as const) : conferente,
    };
    const antes = await resolveVisualAsset(pauta, { ...comum, bancosOficiais: false });
    const depois = await resolveVisualAsset(pauta, { ...comum, bancosOficiais: true });
    const linha = {
      id,
      pessoa,
      titulo: pauta.titulo,
      pais: pauta.classificacao.pais ?? "",
      antes: lado(antes, pessoa),
      depois: lado(depois, pessoa),
      notas: depois.fontesConsultadas.filter((f) => f.fonte === "banco_oficial").map((f) => f.nota),
    };
    linhas.push(linha);
    if (argv.includes("--detalhe")) {
      for (const [nome, r] of [["antes", antes], ["depois", depois]] as const) {
        console.log(`  [${nome}] ${r.status} ${r.motivo ?? ""}`);
        for (const f of r.fontesConsultadas) console.log(`    fonte ${f.fonte} (${f.encontrados}): ${f.nota.slice(0, 220)}`);
        for (const x of r.recusados.slice(0, 8)) console.log(`    recusa ${x.origem} ${x.motivo}: ${x.detalhe.slice(0, 160)}`);
      }
    }
    console.log(
      `${pessoa.padEnd(18)} antes ${linha.antes.fotoDaPessoa ? "PESSOA" : linha.antes.status === "SELECTED" ? "outra " : "nada  "} ` +
        `depois ${linha.depois.fotoDaPessoa ? "PESSOA" : linha.depois.status === "SELECTED" ? "outra " : "nada  "} ` +
        `${linha.depois.banco ?? linha.depois.fonte ?? "-"} | US$ ${gasto.toFixed(3)} | ${pauta.titulo.slice(0, 70)}`,
    );
  }

  const conta = (f: (l: (typeof linhas)[number]) => boolean) => linhas.filter(f).length;
  const resumo = {
    pautas: linhas.length,
    brasileiras: conta((l) => l.pais === "Brasil"),
    antes: { fotoDaPessoa: conta((l) => l.antes.fotoDaPessoa), comFoto: conta((l) => l.antes.status === "SELECTED") },
    depois: {
      fotoDaPessoa: conta((l) => l.depois.fotoDaPessoa),
      comFoto: conta((l) => l.depois.status === "SELECTED"),
      deBancoOficial: conta((l) => l.depois.fonte === "banco_oficial"),
    },
    brasileirasAntes: conta((l) => l.pais === "Brasil" && l.antes.fotoDaPessoa),
    brasileirasDepois: conta((l) => l.pais === "Brasil" && l.depois.fotoDaPessoa),
    custoUsd: Number(gasto.toFixed(4)),
  };
  console.log(JSON.stringify(resumo, null, 2));

  if (saida) {
    fs.mkdirSync(path.resolve(saida), { recursive: true });
    fs.writeFileSync(path.resolve(saida, "medicao.json"), JSON.stringify({ resumo, linhas }, null, 2) + "\n", "utf-8");
    await folhaDeContato(linhas, path.resolve(saida, "folha-de-contato.jpg"));
    console.log(`gravado em ${saida}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
