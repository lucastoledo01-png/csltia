/**
 * Ensaio de ponta a ponta dos perfis de referência, contra as APIs reais e
 * SEM escrever no banco.
 *
 *   npx tsx src/scripts/ensaiar-perfis-referencia.ts braziljournal notjournal.ai
 *
 * Lê os perfis pela Business Discovery, extrai o assunto, busca a fonte
 * primária no Google News e passa tudo pela guarda real. O cadastro e a
 * gravação são trocados por memória, e a guarda roda sem a camada persistida:
 * o banco só é LIDO (credencial do Instagram e histórico editorial).
 *
 * Criado em 05/10/2026 para provar o caminho antes de o dono ligar a
 * capacidade, que é a lição do PERM: teste com stub prova a lógica, e só a
 * chamada real acha o 400 que nenhum teste acha.
 */

import fs from "node:fs";
import path from "node:path";

function carregarEnv() {
  const arquivo = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../../.env")].find((p) =>
    fs.existsSync(p),
  );
  if (!arquivo) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#") || !l.includes("=")) continue;
    const i = l.indexOf("=");
    const k = l.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  carregarEnv();
  const handles = process.argv.slice(2);
  if (handles.length === 0) throw new Error("informe ao menos um perfil");

  const { lerPerfisDeReferencia } = await import("../lib/server/social/perfis-referencia/candidatos");
  const { dependenciasDeProducao } = await import("../lib/server/social/perfis-referencia/producao");
  const { avaliarPautas } = await import("../lib/server/editorial/guarda");
  const { carregarConfigEditorial } = await import("../lib/server/editorial/config");
  const { criarHistoricoStore } = await import("../lib/server/editorial/history");
  const { getSupabaseAdminClient } = await import("../lib/server/supabase-admin");
  const { DEFAULT_PROJECT_ID } = await import("../lib/server/projects");

  const projeto = { id: DEFAULT_PROJECT_ID, settings: { capacidades: { perfis_referencia: "dry_run" } } };
  const reais = await dependenciasDeProducao(projeto);
  const config = carregarConfigEditorial();

  const r = await lerPerfisDeReferencia(projeto, {
    ...reais,
    store: {
      listar: async () =>
        handles.map((h) => ({ id: `ensaio-${h}`, projectId: projeto.id, handle: h, nota: "", ativo: true, criadoEm: "" })),
      gravarLeituras: async (l: unknown[]) => l.length,
    } as unknown as typeof reais.store,
    async avaliar(grupos) {
      const historico = await criarHistoricoStore(getSupabaseAdminClient()).janela(projeto.id, config.janelaDeDias);
      return avaliarPautas(grupos, { canal: "instagram", historico, config });
    },
    registrarRodada: undefined,
  });

  for (const l of r.leituras) {
    console.log(`\n@${l.handle}: ${l.status} ${l.mensagemDeErro ?? ""}`);
    console.log(`  ${l.postsLidos} posts, base ${l.linhaDeBase}, ${l.observacao ?? ""}`);
    for (const s of l.sinais) console.log(`  sinal ${s.razao}x ${s.permalink} :: ${s.trechoDaLegenda.slice(0, 90)}`);
    for (const t of l.topicos) {
      console.log(`  assunto: ${t.assunto} | busca "${t.consulta}" (${t.idioma})${t.descartado ? ` | DESCARTADO: ${t.descartado}` : ""}`);
    }
    console.log(`  candidatas ${l.candidatas}, aprovadas ${l.aprovadas}, custo US$ ${l.custoUsd.toFixed(5)}`);
  }
  console.log(
    `\nbuscas ${r.buscas}, coletadas ${r.candidatasColetadas}, rede social recusada ${r.recusadasPorSerRedeSocial}, ` +
      `recusadas pela guarda ${r.recusadasPelaGuarda}, aprovadas ${r.pautas.length}`,
  );
  for (const p of r.pautas) {
    console.log(`  APROVADA ${p.classificacao.eixo} ${p.grupo.primary.url} :: ${p.grupo.primary.title.slice(0, 90)}`);
  }
  console.log(`  motivos de recusa: ${JSON.stringify(r.motivosDaGuarda)}`);
  for (const c of r.custos) console.log(`  custo ${c.etapa} ${c.ramo} US$ ${c.usd.toFixed(5)}`);
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
