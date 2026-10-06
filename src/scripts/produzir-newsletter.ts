/**
 * Produz SÓ a newsletter de uma edição, sem tocar em posts nem matérias.
 *
 *   npx tsx src/scripts/produzir-newsletter.ts --data 2026-10-07            # ensaio
 *   npx tsx src/scripts/produzir-newsletter.ts --data 2026-10-07 --aplicar  # grava e enfileira
 *
 * Criado em 06/10/2026, quando a produção das 17:00 da edição de 07/10 fez os
 * posts e as matérias e teve só a newsletter barrada pelo QA. O caminho é o de
 * `produzirSoANewsletter` (`producao-vespera.ts`): a mesma redação da véspera,
 * com o horário da cadência (06:07) e a entrada na fila de aprovação. Com a
 * fila em `enforce`, o Listmonk só é chamado quando a edição for aprovada.
 *
 * ENSAIO (o padrão): o cliente do banco fica travado para escrita
 * (`travarEscritasDoBanco`), o Telegram fica sem credencial, e nada é
 * gravado, enfileirado ou enviado. O fim do ensaio lista as escritas que a
 * trava recusou, para provar que nenhuma passou. Custa as chamadas de modelo
 * da redação (redação, QA, conclusões e, se faltar, pacote factual).
 *
 * `--aplicar` recusa se a edição do dia já estiver em `news_editions`.
 */

import fs from "node:fs";
import path from "node:path";
import { escritasBloqueadas, travarEscritasDoBanco } from "../lib/server/supabase-admin";
import { produzirSoANewsletter } from "../lib/server/producao-vespera";

function carregarEnv() {
  for (const nome of [".env.local", ".env"]) {
    const arquivo = path.resolve(process.cwd(), nome);
    if (!fs.existsSync(arquivo)) continue;
    for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
      const l = linha.trim();
      if (!l || l.startsWith("#") || !l.includes("=")) continue;
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

const MODOS_DE_PRODUCAO: Record<string, string> = {
  EDITORIAL_GUARD: "enforce",
  VISUAL_RESOLVER_V2: "enforce",
  SOCIAL_PIPELINE_V2: "enforce",
};

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  carregarEnv();
  const data = argumento("--data");
  const aplicar = process.argv.includes("--aplicar");
  if (!data) {
    console.error("Uso: npx tsx src/scripts/produzir-newsletter.ts --data AAAA-MM-DD [--aplicar]");
    process.exit(2);
  }

  /*
   * Os modos que a produção da véspera lê do AMBIENTE do contêiner. O `.env`
   * local não os declara, e sem eles a guarda cai em observação: a edição sairia
   * pelo ranker antigo, com 4 a 6 pautas, e os ramos desceriam para ensaio, ou
   * seja, outra newsletter, e não a que a véspera faria. O que estiver no
   * ambiente vence; o que faltar é preenchido com o valor de produção, que é
   * `enforce` nos três desde a produção da véspera (ramos em `enforce` exigem a
   * guarda em `enforce`, e o custo do dia 07/10 foi gravado com os ramos no comando).
   */
  for (const [chave, valor] of Object.entries(MODOS_DE_PRODUCAO)) {
    if (!process.env[chave]?.trim()) process.env[chave] = valor;
    console.log(`${chave}=${process.env[chave]}`);
  }

  if (!aplicar) {
    travarEscritasDoBanco();
    // Ensaio não avisa ninguém: um "edição saiu sem pauta" de teste no Telegram seria ruído.
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }

  console.log(`=== SÓ A NEWSLETTER de ${data} (${aplicar ? "APLICAR: grava e enfileira" : "ENSAIO: nada é gravado"}) ===`);
  const desfecho = await produzirSoANewsletter({ data, aplicar, projetoId: process.env.PROJETO_ID });

  console.log("\n=== DESFECHO ===");
  console.log(`projeto: ${desfecho.projeto} | data: ${desfecho.data} | ok: ${desfecho.ok}`);
  if (desfecho.agendamento) console.log(`envio planejado: ${desfecho.agendamento.newsletterEm}`);
  if (desfecho.recusa) console.log(`RECUSADO: ${desfecho.recusa}`);
  if (desfecho.erro) console.log(`ERRO:\n${desfecho.erro}`);

  const r = (desfecho.resultado ?? {}) as Record<string, any>;
  if (r.ok === false) console.log(`sem edição: ${r.reason} ${r.detail ?? ""}`);
  if (r.edition) {
    console.log(`\nQA: ${r.qaResult?.score}/100 | alucinação: ${r.qaResult?.hallucination_risk ? "SIM" : "não"}`);
    console.log(`assunto: ${r.edition.subject}`);
    console.log(`preheader: ${r.edition.preheader}`);
    console.log(`headline: ${r.edition.headline}`);
    (r.edition.stories ?? []).forEach((s: any, i: number) => {
      console.log(`  ${i + 1}. ${s.title}  (${s.source_name})`);
    });
    if ((r.qaResult?.issues ?? []).length) console.log(`apontamentos do QA: ${r.qaResult.issues.join(" | ")}`);
    console.log(`custo da redação: US$ ${Number(r.tokens?.estimatedCostUsd ?? 0).toFixed(4)}`);
  }
  if (r.ramos?.custos) console.log(`custo por ramo: ${JSON.stringify(r.ramos.custos)}`);
  if (r.ramos?.pecas) {
    const ramos = (r.ramos.pecas as Array<{ ramo: string }>).map((p) => p.ramo);
    console.log(`peças produzidas: ${ramos.join(", ") || "nenhuma"}`);
  }

  if (!aplicar) {
    const bloqueadas = escritasBloqueadas();
    console.log(`\nescritas recusadas pela trava do ensaio: ${bloqueadas.length}`);
    for (const b of bloqueadas) console.log(`  - ${b}`);
  }
  process.exit(desfecho.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
