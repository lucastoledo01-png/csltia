import { criarHistoricoStore } from "../lib/server/editorial/history";
import type { RegistroHistorico } from "../lib/server/editorial/history";
import { COLUNAS_DO_FEED, registrosDoFeed } from "../lib/server/social/historico-do-feed";
import type { LinhaDoFeed } from "../lib/server/social/historico-do-feed";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";

/**
 * Grava no `editorial_history` as linhas `instagram` que faltam, a partir de
 * `social_posts` (06/10/2026).
 *
 *   npx tsx src/scripts/backfill-instagram-no-historico.ts              ensaio: só lê e relata
 *   npx tsx src/scripts/backfill-instagram-no-historico.ts --aplicar    grava
 *   --desde=2026-09-05      primeira data de edição considerada (padrão)
 *   --projeto=<uuid>        só um projeto
 *
 * O ENSAIO É O PADRÃO, e só lê.
 *
 * Por que existe. Nenhum caminho de produção gravava o canal `instagram` do
 * histórico editorial: as oito linhas que existem são do backfill de 05/09, e
 * desde então o feed publicou sem deixar registro ali. A régua de repetição
 * do feed NÃO depende disto, porque passou a ler `social_posts` direto (ver
 * `social/historico-do-feed.ts`), e a escrita passou a acontecer no
 * agendamento. Este script só fecha o buraco do registro, para relatório e
 * auditoria lerem o mesmo que o feed publicou.
 *
 * O que entra: posts do Instagram que contam como "já no feed" (agendados,
 * publicados ou esperando aprovação; nunca `failed` nem `cancelled`), com a
 * URL, as entidades e o vetor da candidata de origem, sem foto (a memória de
 * foto do histórico é de todos os canais, ver `registroDoPost`). A mesma pauta
 * publicada em dias seguidos, que é o incidente, vira UMA linha, a do primeiro
 * dia: a chave do histórico é (projeto, pauta, canal). Linha que já existe não
 * é sobrescrita (`ignoreDuplicates`).
 */

function argumento(nome: string): string | null {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split("=").slice(1).join("=") : null;
}

async function main() {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const desde = argumento("desde") ?? "2026-09-05";
  const projeto = argumento("projeto");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error(`--desde precisa ser AAAA-MM-DD, veio "${desde}".`);

  const client = clienteDoBanco();
  console.log("=== INSTAGRAM NO HISTÓRICO EDITORIAL ===");
  console.log(`desde ${desde}${projeto ? `, projeto ${projeto}` : ""}`);
  console.log(`modo: ${aplicar ? "GRAVANDO" : "ensaio, nada é gravado"}`);

  let consulta = client
    .from("social_posts")
    .select(`${COLUNAS_DO_FEED},project_id`)
    .eq("platform", "instagram")
    .gte("edition_date", desde);
  if (projeto) consulta = consulta.eq("project_id", projeto);
  const { data, error } = await consulta.order("edition_date", { ascending: true });
  if (error) throw new Error(`social_posts, leitura falhou: ${error.message}`);
  const linhas = (data ?? []) as unknown as Array<LinhaDoFeed & { project_id: string }>;

  const existentes = await client
    .from("editorial_history")
    .select("project_id,story_id")
    .eq("channel", "instagram");
  if (existentes.error) throw new Error(`editorial_history, leitura falhou: ${existentes.error.message}`);
  const jaGravadas = new Set((existentes.data ?? []).map((l) => `${l.project_id}|${l.story_id}`));

  const novos: RegistroHistorico[] = [];
  const vistos = new Set<string>();
  let repetidasNoFeed = 0;
  let foraDoFeed = 0;
  for (const l of linhas) {
    const [r] = registrosDoFeed([l], l.project_id);
    if (!r) {
      foraDoFeed += 1;
      continue;
    }
    const chave = `${l.project_id}|${r.storyId}`;
    if (vistos.has(chave)) {
      repetidasNoFeed += 1;
      console.log(`  repetida no feed: ${l.edition_date} :: ${(l.title ?? "").slice(0, 70)}`);
      continue;
    }
    vistos.add(chave);
    if (jaGravadas.has(chave)) continue;
    novos.push({ ...r, id: undefined, tipo: "post", procedencia: "backfill:social_posts" });
  }

  console.log(`\nposts lidos: ${linhas.length}`);
  console.log(`fora do feed (failed, cancelled): ${foraDoFeed}`);
  console.log(`a mesma pauta de novo em outro dia, contada uma vez: ${repetidasNoFeed}`);
  console.log(`já no histórico: ${vistos.size - novos.length}`);
  console.log(`a gravar: ${novos.length} (com vetor: ${novos.filter((r) => r.vetor?.length).length})`);
  for (const r of novos) {
    console.log(`  ${String(r.publicadoEm ?? "").slice(0, 10)} ${r.storyId} :: ${r.titulo.slice(0, 80)}`);
  }

  if (!aplicar) {
    console.log("\nNada foi gravado. Rode de novo com --aplicar para gravar.");
    return;
  }
  const gravados = await criarHistoricoStore(client).registrar(novos);
  console.log(`\ngravados agora: ${gravados}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
