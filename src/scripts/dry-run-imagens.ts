import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";
import { extrairEntidades } from "../lib/server/editorial/classificador";
import { resolveVisualAsset } from "../lib/server/visual/resolver";
import { criarBiblioteca } from "../lib/server/visual/biblioteca";
import type { PautaParaImagem } from "../lib/server/visual/resolver";
import type { ResultadoVisual } from "../lib/server/visual/tipos";
import { carregarConfigDeImagem } from "../lib/server/visual/relevancia";

/**
 * Resolução de imagem sobre pautas reais, sem publicar nada.
 *
 * As pautas saem do que já foi publicado: `editorial_history`, que guarda as
 * entidades desde o backfill, e `news_editions`, que guarda o texto das
 * edições. Onde faltar entidade, ela é extraída da própria matéria, com o
 * mesmo extrator da fase 1. Nenhuma pauta é inventada para conseguir foto.
 *
 *   npx tsx src/scripts/dry-run-imagens.ts --saida=relatorio.md
 *   npx tsx src/scripts/dry-run-imagens.ts --gravar   (persiste os assets escolhidos)
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

type Entidades = { atores: string[]; lugares: string[]; acontecimento: string[] };

type PautaReal = PautaParaImagem & { origem: string };

async function coletarPautas(client: ReturnType<typeof getSupabaseAdminClient>): Promise<PautaReal[]> {
  const pautas: PautaReal[] = [];

  const { data: historico } = await client
    .from("editorial_history")
    .select("story_id,title,category,country,entities")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .order("published_at", { ascending: false })
    .limit(40);

  for (const h of historico ?? []) {
    const e = (h.entities ?? {}) as Partial<Entidades>;
    if (!Array.isArray(e.atores) || e.atores.length === 0) continue;
    pautas.push({
      storyId: h.story_id as string,
      titulo: h.title as string,
      categoria: (h.category as string) || "",
      classificacao: {
        atores: e.atores ?? [],
        lugares: e.lugares ?? [],
        acontecimento: e.acontecimento ?? [],
        pais: (h.country as string) || undefined,
      },
      origem: "editorial_history",
    });
  }

  // As edições trazem pautas que o histórico não cobre, e sem entidade
  // guardada. Extrair delas é ler o que já foi publicado, não inventar pauta.
  const { data: edicoes } = await client
    .from("news_editions")
    .select("edition_date,stories")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .order("edition_date", { ascending: false })
    .limit(6);

  const semEntidade: Array<{ id: string; titulo: string; resumo: string; fonte: string; categoria: string }> = [];
  for (const ed of edicoes ?? []) {
    const stories = Array.isArray(ed.stories) ? (ed.stories as Array<Record<string, string>>) : [];
    for (const s of stories) {
      const titulo = (s.title || "").trim();
      if (!titulo || pautas.some((p) => p.titulo === titulo)) continue;
      semEntidade.push({
        id: `ed-${ed.edition_date}-${semEntidade.length}`,
        titulo,
        resumo: (s.summary || "").slice(0, 700),
        fonte: s.source_name || "",
        categoria: s.category || "",
      });
    }
  }

  if (semEntidade.length > 0) {
    const { entidades } = await extrairEntidades(semEntidade);
    for (const s of semEntidade) {
      const e = entidades.get(s.id);
      if (!e || e.atores.length === 0) continue;
      pautas.push({
        storyId: s.id,
        titulo: s.titulo,
        categoria: s.categoria,
        classificacao: e,
        origem: "news_editions",
      });
    }
  }

  return pautas;
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? null;
  const gravar = argv.includes("--gravar");
  const saida = valor("saida");

  const client = getSupabaseAdminClient();
  const config = carregarConfigDeImagem();

  const linhas: string[] = [];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  escrever(`# Dry-run da resolução de imagem, ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  escrever();
  escrever(`Modo: ${gravar ? "GRAVANDO os assets escolhidos" : "somente leitura, nada é persistido"}`);
  escrever(
    `Piso de relevância: ${config.relevanciaMinima} geral, ${config.relevanciaMinimaPessoa} para pessoa. ` +
      `Largura mínima ${config.larguraMinima}px. Janela de repetição ${config.janelaEmDias} dias.`
  );
  escrever();

  // A biblioteca só entra se a tabela existir. Sem ela, o resto do caminho
  // continua exercitável.
  let biblioteca = undefined;
  try {
    const { error } = await client.from("visual_assets").select("id").limit(1);
    if (!error) biblioteca = criarBiblioteca(client);
    escrever(error ? `Biblioteca: tabela ainda não existe (${error.message})` : "Biblioteca: disponível");
  } catch (erro) {
    escrever(`Biblioteca: indisponível (${(erro as Error).message})`);
  }
  escrever();

  const pautas = await coletarPautas(client);
  escrever(`${pautas.length} pautas reais reunidas de editorial_history e news_editions.`);
  escrever();

  const usados = new Set<string>();
  const resultados: Array<{ pauta: PautaReal; r: ResultadoVisual }> = [];

  for (const pauta of pautas) {
    const r = await resolveVisualAsset(pauta, {
      client,
      biblioteca,
      jaUsadosNestaEdicao: usados,
      somenteLeitura: !gravar,
    });
    resultados.push({ pauta, r });
  }

  // Agrupa por tipo, que é o recorte que interessa ao teste.
  const porTipo = new Map<string, Array<{ pauta: PautaReal; r: ResultadoVisual }>>();
  for (const item of resultados) {
    const tipo = item.r.entidade?.tipo ?? "sem_entidade";
    porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), item]);
  }

  escrever("## Cobertura por tipo de entidade");
  escrever();
  for (const [tipo, itens] of [...porTipo.entries()].sort()) {
    const comFoto = itens.filter((i) => i.r.status === "SELECTED").length;
    escrever(`- ${tipo}: ${itens.length} pauta(s), ${comFoto} com imagem`);
  }
  escrever();

  escrever("## Pauta a pauta");
  escrever();
  for (const { pauta, r } of resultados) {
    escrever(`### ${pauta.titulo}`);
    escrever();
    escrever(`- origem da pauta: ${pauta.origem}`);
    escrever(`- story_id: ${pauta.storyId}`);
    escrever(`- atores: ${pauta.classificacao.atores.join(", ") || "nenhum"}`);
    escrever(`- primary_visual_entity: ${r.entidade?.nome ?? "nenhuma"} (${r.entidade?.tipo ?? "n/d"})`);
    if (r.entidade) escrever(`- como foi escolhida: ${r.entidade.origem}`);
    escrever("- fontes consultadas:");
    for (const f of r.fontesConsultadas) escrever(`  - ${f.fonte}: ${f.encontrados} resultado(s), ${f.nota}`);

    if (r.asset) {
      escrever(`- **SELECTED**`);
      escrever(`  - imagem: ${r.asset.imageUrl}`);
      escrever(`  - página de origem: ${r.asset.sourcePageUrl}`);
      escrever(`  - fonte: ${r.asset.source}`);
      escrever(`  - autor: ${r.asset.author || "não identificado"}`);
      escrever(`  - licença: ${r.asset.license}`);
      escrever(`  - atribuição: ${r.asset.attribution || "não exigida por esta licença"}`);
      escrever(`  - resolução: ${r.asset.width}x${r.asset.height} ${r.asset.mimeType}`);
      escrever(`  - image_relevance_score: ${r.asset.imageRelevanceScore}`);
      escrever(`  - rights_status: ${r.asset.rightsStatus}`);
    } else {
      escrever(`- **NO_VALID_IMAGE**, motivo ${r.motivo}`);
    }

    if (r.recusados.length > 0) {
      escrever(`- recusados (${r.recusados.length}), amostra:`);
      for (const c of r.recusados.slice(0, 3)) {
        escrever(`  - ${c.origem} :: ${c.identificacao.slice(0, 60)} :: ${c.motivo} :: ${c.detalhe.slice(0, 110)}`);
      }
    }
    escrever();
  }

  const comFoto = resultados.filter((x) => x.r.status === "SELECTED");
  escrever("## Números");
  escrever();
  escrever(`- pautas: ${resultados.length}`);
  escrever(`- com imagem: ${comFoto.length}`);
  escrever(`- sem imagem: ${resultados.length - comFoto.length}`);
  const porFonte = comFoto.reduce<Record<string, number>>((acc, x) => {
    const f = x.r.asset?.source ?? "?";
    acc[f] = (acc[f] ?? 0) + 1;
    return acc;
  }, {});
  for (const [f, n] of Object.entries(porFonte)) escrever(`- ${f}: ${n}`);
  const distintas = new Set(comFoto.map((x) => x.r.asset?.imageUrl));
  escrever(`- imagens distintas: ${distintas.size} (repetição dentro da rodada: ${comFoto.length - distintas.size})`);
  escrever();
  escrever("Nada foi publicado. " + (gravar ? "Os assets escolhidos foram gravados na biblioteca." : "Nada foi gravado."));

  if (saida) {
    fs.writeFileSync(path.resolve(process.cwd(), saida), linhas.join("\n"), "utf-8");
    console.log(`\n[relatório em ${saida}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
