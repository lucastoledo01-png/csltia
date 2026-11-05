/**
 * Aprova UMA peça da fila pelo id da linha (`aprovacoes.peca_id`), pelo mesmo
 * `aprovar` do painel. Para quando o dono pede no chat e o painel não deixa.
 *
 *   npx tsx src/scripts/_aprovar-peca-manual.ts --peca <uuid>             (ensaio: mostra o estado)
 *   npx tsx src/scripts/_aprovar-peca-manual.ts --peca <uuid> --valendo   (aprova)
 */
import { carregarEnv } from "./artigos-comum";

const PROJETO_ID = "00000000-0000-4000-8000-000000000001";
const DECISOR = "Lucas Toledo (dono), aprovado pelo chat com o Claude";

async function main() {
  const args = process.argv.slice(2);
  const peca = args[args.indexOf("--peca") + 1];
  const valendo = args.includes("--valendo");
  if (!peca || peca.startsWith("--")) throw new Error("--peca <uuid> é obrigatório");
  carregarEnv();

  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { depsDaFila, projetoDaFila } = await import("../lib/server/aprovacao/integracao");
  const { aprovar } = await import("../lib/server/aprovacao/fila");

  const client = getSupabaseAdminClient();
  const { data: projetoRow } = await client.from("projects").select("id, timezone, settings").eq("id", PROJETO_ID).single();
  const projeto = projetoDaFila(projetoRow as never, PROJETO_ID);
  if (!projeto) throw new Error("projeto da fila indisponível");

  const { data: linha, error } = await client
    .from("aprovacoes")
    .select("id, estado, ramo, publicar_em")
    .eq("peca_id", peca)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !linha) throw new Error(`peça ${peca} não está na fila: ${error?.message ?? "sem linha"}`);
  console.log("fila:", JSON.stringify(linha));
  if (!valendo) return console.log("(ensaio: nada foi aprovado)");

  const decisao = await aprovar(projeto, (linha as { id: string }).id, DECISOR, depsDaFila(client, projeto));
  console.log(decisao.ok ? `aprovada; liberação: ${decisao.liberacao?.detalhe ?? "sem detalhe"}` : `NÃO aprovada: ${decisao.motivo}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
