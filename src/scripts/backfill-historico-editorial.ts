import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { semelhancaDeTitulo } from "../lib/server/editorial/fingerprint";
import { criarHistoricoStore, gerarStoryId } from "../lib/server/editorial/history";
import type { RegistroHistorico } from "../lib/server/editorial/history";
import { criarProvedorOpenAI, textoParaVetor } from "../lib/server/editorial/embeddings";

/**
 * Reconstrói o histórico editorial a partir do que já foi publicado.
 *
 * A tabela nasce vazia. Ligar a verificação de repetição com histórico vazio
 * faria o sistema tratar como inédita qualquer pauta das últimas semanas, que
 * é exatamente o problema que ela existe para resolver.
 *
 * O que dá para reconstruir é reconstruído. O que não dá aparece no relatório
 * como não reconstruído, sem ser preenchido por dedução. Entidades, por
 * exemplo: ninguém extraiu atores e lugares na época, e inventá-los agora
 * criaria impressão digital falsa, que é pior do que impressão ausente.
 *
 *   npx tsx src/scripts/backfill-historico-editorial.ts            (só relata)
 *   npx tsx src/scripts/backfill-historico-editorial.ts --aplicar  (grava)
 *   ... --dias=60 --sem-vetor
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

type Argumentos = {
  aplicar: boolean;
  dias: number;
  comVetor: boolean;
  projeto: string | null;
};

function lerArgumentos(argv: string[], dias: number): Argumentos {
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };
  const diasArg = Number(valor("dias"));

  return {
    aplicar: argv.includes("--aplicar"),
    dias: Number.isFinite(diasArg) && diasArg > 0 ? diasArg : dias,
    comVetor: !argv.includes("--sem-vetor"),
    projeto: valor("projeto"),
  };
}

type StoryDaEdicao = {
  title?: string;
  summary?: string;
  category?: string;
  source_url?: string;
  source_name?: string;
};

type NaoReconstruido = { origem: string; item: string; oque: string };

/** Score mínimo para dizer que o post nasceu de uma pauta daquela edição. */
const PISO_DE_ORIGEM = 0.2;

async function main() {
  carregarEnv();
  const config = carregarConfigEditorial();
  const args = lerArgumentos(process.argv.slice(2), config.janelaDeDias);
  const client = getSupabaseAdminClient();
  const store = criarHistoricoStore(client);

  const corte = new Date(Date.now() - args.dias * 24 * 60 * 60 * 1000);
  const corteISO = corte.toISOString();
  const corteData = corteISO.slice(0, 10);

  console.log("=== BACKFILL DO HISTÓRICO EDITORIAL ===");
  console.log(`janela: ${args.dias} dias (desde ${corteData})`);
  console.log(`modo: ${args.aplicar ? "GRAVANDO" : "somente relatório"}`);

  const registros: RegistroHistorico[] = [];
  const pendencias: NaoReconstruido[] = [];
  // Título da pauta -> story_id, para o post do Instagram herdar a identidade
  // da pauta que o originou em vez de virar uma pauta nova.
  const pautasPorEdicao = new Map<string, Array<{ titulo: string; storyId: string }>>();

  const { data: edicoes, error: erroEdicoes } = await client
    .from("news_editions")
    .select("id,project_id,edition_date,status,stories")
    .gte("edition_date", corteData)
    .order("edition_date", { ascending: true });
  if (erroEdicoes) throw new Error(`news_editions: ${erroEdicoes.message}`);

  const projeto =
    args.projeto ?? (edicoes?.[0]?.project_id as string | undefined) ?? null;
  if (!projeto) {
    console.error("Nenhum project_id encontrado. Passe --projeto=<uuid>.");
    process.exit(1);
  }
  console.log(`projeto: ${projeto}`);

  for (const edicao of edicoes ?? []) {
    if (edicao.status !== "published") {
      pendencias.push({
        origem: "news_editions",
        item: String(edicao.edition_date),
        oque: `status "${edicao.status}", não conta como publicado`,
      });
      continue;
    }

    const stories = Array.isArray(edicao.stories) ? (edicao.stories as StoryDaEdicao[]) : [];
    if (stories.length === 0) {
      pendencias.push({
        origem: "news_editions",
        item: String(edicao.edition_date),
        oque: "edição publicada sem stories utilizáveis",
      });
      continue;
    }

    const doDia: Array<{ titulo: string; storyId: string }> = [];

    for (const story of stories) {
      const titulo = (story.title || "").trim();
      if (!titulo) continue;

      const url = (story.source_url || "").trim();
      if (!url) {
        pendencias.push({
          origem: "news_editions",
          item: `${edicao.edition_date} :: ${titulo.slice(0, 60)}`,
          oque: "sem source_url, identidade caiu no título",
        });
      }

      const storyId = gerarStoryId({ url: url || undefined, titulo });
      doDia.push({ titulo, storyId });

      registros.push({
        projectId: projeto,
        storyId,
        canal: "newsletter",
        titulo,
        resumo: (story.summary || "").trim(),
        url,
        categoria: (story.category || "").trim(),
        procedencia: "backfill:news_editions",
        newsletterId: String(edicao.id),
        // Sem classificação editorial na época. "neutral" aqui é ausência de
        // dado, não julgamento sobre a pauta.
        sentimento: "neutral",
        publicadoEm: `${edicao.edition_date}T12:00:00.000Z`,
      });
    }

    pautasPorEdicao.set(String(edicao.id), doDia);
  }

  const { data: artigos, error: erroArtigos } = await client
    .from("articles")
    .select("id,slug,title,excerpt,status,published_at,source_urls,cover_image,project_id")
    .gte("published_at", corteISO)
    .order("published_at", { ascending: true });
  if (erroArtigos) throw new Error(`articles: ${erroArtigos.message}`);

  for (const artigo of artigos ?? []) {
    if (artigo.status !== "published") continue;
    const fontes = Array.isArray(artigo.source_urls) ? (artigo.source_urls as string[]) : [];
    const url = fontes[0] ?? "";

    // Os artigos de hoje são a página da edição, não pauta avulsa: título de
    // compilação ("O ICE sob escrutínio, um detido com câncer e uma consulta
    // do USCIS") e nenhuma fonte própria. As pautas dentro dele já entraram
    // pelo canal newsletter. Registrar como edição evita que um título que
    // mistura três assuntos vire referência de comparação semântica e barre
    // pauta nova por parecer com todas.
    const ehEdicao = String(artigo.slug).startsWith("edicao-");

    if (!ehEdicao && fontes.length === 0) {
      pendencias.push({
        origem: "articles",
        item: String(artigo.slug),
        oque: "source_urls vazio, identidade caiu no título",
      });
    }

    registros.push({
      projectId: (artigo.project_id as string) || projeto,
      storyId: ehEdicao
        ? `d_${String(artigo.slug)}`
        : gerarStoryId({ url: url || undefined, titulo: artigo.title }),
      canal: "article",
      tipo: ehEdicao ? "edition" : "story",
      titulo: artigo.title,
      resumo: (artigo.excerpt || "").trim(),
      url,
      imagemUrl: artigo.cover_image,
      procedencia: "backfill:articles",
      sentimento: "neutral",
      publicadoEm: artigo.published_at,
    });
  }

  const { data: posts, error: erroPosts } = await client
    .from("social_posts")
    .select("id,edition_id,edition_date,article_slug,platform,title,caption,status,published_at,project_id")
    .gte("edition_date", corteData)
    .order("edition_date", { ascending: true });
  if (erroPosts) throw new Error(`social_posts: ${erroPosts.message}`);

  let postsIgnorados = 0;

  type PostPublicado = {
    id: string;
    edicaoId: string;
    data: string;
    titulo: string;
    legenda: string;
    publicadoEm: string | null;
    projectId: string | null;
  };

  const publicados: PostPublicado[] = [];
  for (const post of posts ?? []) {
    // Agendado não saiu e falhado não chegou ao feed. Registrar qualquer um
    // dos dois bloquearia uma pauta que o público nunca viu.
    if (post.status !== "published") {
      postsIgnorados += 1;
      continue;
    }
    const titulo = (post.title || "").trim();
    if (!titulo) {
      pendencias.push({ origem: "social_posts", item: String(post.id), oque: "post sem título" });
      continue;
    }
    publicados.push({
      id: String(post.id),
      edicaoId: String(post.edition_id),
      data: String(post.edition_date),
      titulo,
      legenda: (post.caption || "").slice(0, 500),
      publicadoEm: post.published_at,
      projectId: (post.project_id as string) || null,
    });
  }

  /**
   * Casa cada post com a pauta que o originou, dentro da própria edição.
   *
   * Percorrer os posts na ordem em que vieram e deixar cada um levar o melhor
   * disponível fazia o primeiro post ficar com a pauta de outro, e o segundo
   * sobrava com score 0.09 mesmo tendo par óbvio. Ordenar todos os pares da
   * edição por score e distribuir de cima para baixo resolve isso.
   *
   * O piso é baixo e diferente do limiar de deduplicação de propósito.
   * Deduplicar compara uma pauta contra o mundo e precisa de barra alta. Aqui
   * o universo já são as três ou quatro pautas da edição que gerou o post, e o
   * post reescreve a manchete: "Agente do ICE acusado e solto sob fiança"
   * contra "Agente do ICE acusado de mentir é solto sob fiança" dá 0.71,
   * abaixo do limiar de dedup e evidentemente o mesmo fato.
   */
  const origemDoPost = new Map<string, { titulo: string; storyId: string }>();
  const scoreDoPost = new Map<string, number>();
  const porEdicao = new Map<string, PostPublicado[]>();
  for (const p of publicados) {
    const lista = porEdicao.get(p.edicaoId) ?? [];
    lista.push(p);
    porEdicao.set(p.edicaoId, lista);
  }

  for (const [edicaoId, lista] of porEdicao) {
    const pautas = pautasPorEdicao.get(edicaoId) ?? [];
    const pares: Array<{ postId: string; pauta: { titulo: string; storyId: string }; score: number }> = [];
    for (const post of lista) {
      for (const pauta of pautas) {
        const score = semelhancaDeTitulo(post.titulo, pauta.titulo);
        if (score >= PISO_DE_ORIGEM) pares.push({ postId: post.id, pauta, score });
      }
    }
    pares.sort((a, b) => b.score - a.score);

    const pautaUsada = new Set<string>();
    for (const par of pares) {
      if (origemDoPost.has(par.postId) || pautaUsada.has(par.pauta.storyId)) continue;
      origemDoPost.set(par.postId, par.pauta);
      scoreDoPost.set(par.postId, par.score);
      pautaUsada.add(par.pauta.storyId);
    }
  }

  for (const post of publicados) {
    const origem = origemDoPost.get(post.id) ?? null;
    const candidatas = pautasPorEdicao.get(post.edicaoId) ?? [];

    if (!origem && candidatas.length > 0) {
      const melhor = candidatas.reduce(
        (acc, c) => Math.max(acc, semelhancaDeTitulo(post.titulo, c.titulo)),
        0
      );
      pendencias.push({
        origem: "social_posts",
        item: `${post.data} :: ${post.titulo.slice(0, 60)}`,
        oque: `não casou com pauta da edição (melhor score ${melhor.toFixed(2)}), virou pauta própria`,
      });
    }

    registros.push({
      projectId: post.projectId || projeto,
      // Reaproveitar a pauta da newsletter no Instagram é o fluxo desejado, e
      // por isso o post herda o story_id: mesma pauta, canal diferente. O que
      // não pode é a mesma pauta voltar ao Instagram em outro dia, e é isso
      // que a chave única (projeto, story, canal) passa a impedir.
      storyId: origem ? origem.storyId : gerarStoryId({ titulo: post.titulo }),
      originStoryId: origem ? origem.storyId : null,
      canal: "instagram",
      tipo: "carousel",
      titulo: post.titulo,
      resumo: post.legenda,
      procedencia: "backfill:social_posts",
      sentimento: "neutral",
      instagramPostId: post.id,
      publicadoEm: post.publicadoEm ?? `${post.data}T12:00:00.000Z`,
    });
  }

  // Duas linhas com a mesma chave dentro do mesmo upsert derrubam o lote
  // inteiro no Postgres, mesmo com ignoreDuplicates.
  const vistos = new Set<string>();
  const unicos: RegistroHistorico[] = [];
  let colisoes = 0;
  for (const r of registros) {
    const chave = `${r.projectId}|${r.storyId}|${r.canal}`;
    if (vistos.has(chave)) {
      colisoes += 1;
      pendencias.push({
        origem: r.procedencia ?? "?",
        item: r.titulo.slice(0, 60),
        oque: `mesma pauta no mesmo canal já no lote (${r.storyId}), segunda ocorrência descartada`,
      });
      continue;
    }
    vistos.add(chave);
    unicos.push(r);
  }

  if (args.comVetor && unicos.length > 0) {
    try {
      const provedor = criarProvedorOpenAI();
      // Compilação de edição não recebe vetor: o texto mistura assuntos e
      // pareceria com quase tudo.
      const alvos = unicos.filter((r) => r.tipo !== "edition");
      const vetores = await provedor.gerar(
        alvos.map((r) => textoParaVetor(r.titulo, r.resumo ?? ""))
      );
      alvos.forEach((r, i) => {
        r.vetor = vetores[i];
        r.modeloDoVetor = provedor.modelo;
      });
      console.log(
        `vetores gerados: ${vetores.length} de ${unicos.length} registros (${provedor.modelo})`
      );
    } catch (erro) {
      console.warn(`vetores não gerados: ${(erro as Error).message}`);
      pendencias.push({
        origem: "embeddings",
        item: "todos",
        oque: "vetor não gerado, camada semântica fica sem histórico",
      });
    }
  }

  const porCanal = unicos.reduce<Record<string, number>>((acc, r) => {
    acc[r.canal] = (acc[r.canal] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n--- o que foi reconstruído ---");
  for (const [canal, n] of Object.entries(porCanal)) console.log(`${canal}: ${n}`);
  console.log(`total: ${unicos.length} (${colisoes} duplicados no próprio lote)`);
  console.log(`posts não publicados ignorados: ${postsIgnorados}`);
  console.log("entidades: nenhuma. Não existiam na época e não serão deduzidas.");

  console.log(`\n--- não reconstruído (${pendencias.length}) ---`);
  for (const p of pendencias) console.log(`[${p.origem}] ${p.item}: ${p.oque}`);

  if (!args.aplicar) {
    console.log("\nNada foi gravado. Rode de novo com --aplicar para persistir.");
    return;
  }

  const gravados = await store.registrar(unicos);
  const total = await store.contar(projeto);
  console.log(`\ngravados agora: ${gravados}`);
  console.log(`total na tabela para este projeto: ${total}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
