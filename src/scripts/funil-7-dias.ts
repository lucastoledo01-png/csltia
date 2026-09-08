import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectFromSource } from "../lib/server/newsroom/collector";
import type { NewsCandidate } from "../lib/server/newsroom/collector";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { carregarConfigSocial } from "../lib/server/social/selecao";
import { rodarFunilDoDia } from "../lib/server/social/funil";
import type { FunilDoDia } from "../lib/server/social/funil";
import { dominioDe } from "../lib/server/editorial/url-canonica";

/**
 * Onde o volume se perde, ao longo de vários dias.
 *
 * Três dias deram 0, 1 e 0 posts. Esse número sozinho não distingue quatro
 * causas que pedem quatro correções opostas: pouca oferta útil, filtro
 * editorial apertado demais, verificador instável, ou copy quebrando. A saída
 * daqui é o funil por etapa, por dia, com os motivos nominais.
 *
 * A coleta acontece UMA vez e é repartida por data de publicação. É por isso
 * que o dia mais antigo da amostra sai sempre subestimado: o feed RSS já
 * descartou parte dele antes de a gente chegar. O relatório diz isso na cara.
 *
 * Os tetos da newsletter ficam levantados de propósito. Medir capacidade com
 * o teto ligado responde qual é o teto, não qual é a capacidade.
 *
 * Não publica, não agenda, não grava em social_posts.
 *
 *   npx tsx src/scripts/funil-7-dias.ts --dias=7 --saida=funil.md
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

const FUSO = "America/Sao_Paulo";

function diaDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "sem-data" : d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

function somar(alvo: Record<string, number>, fonte: Record<string, number>): void {
  for (const [k, v] of Object.entries(fonte)) alvo[k] = (alvo[k] ?? 0) + v;
}

function tabela(mapa: Record<string, number>): string {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  return itens.length === 0 ? "nenhum" : itens.map(([k, v]) => `${k} ${v}`).join(", ");
}

async function main() {
  carregarEnv();

  const argv = process.argv.slice(2);
  const valor = (nome: string) => argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;
  const quantosDias = Number(valor("dias")) > 0 ? Number(valor("dias")) : 7;
  const saida = valor("saida") ?? "funil-7-dias.md";

  // O pool é o insumo, não a edição.
  process.env.EDITORIAL_MAX_PAUTAS = "40";
  process.env.EDITORIAL_MAX_PAUTAS_BRASIL = "40";
  process.env.EDITORIAL_MIN_PAUTAS = "1";

  const linhas: string[] = [];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const fontes = (await getProjectNewsSources(project.id)).filter((f) => f.enabled);
  const client = getSupabaseAdminClient();
  const config = carregarConfigEditorial(process.env);
  const configSocial = carregarConfigSocial(process.env);
  const historicoStore = criarHistoricoStore(client);
  const historico = await historicoStore.janela(project.id, config.janelaDeDias);

  escrever(`# Funil de ${quantosDias} dias, ${project.slug}`);
  escrever();
  escrever(`${fontes.length} fontes ativas. Nada foi publicado, agendado ou gravado em social_posts.`);
  escrever();

  console.log(`Coletando de ${fontes.length} fontes...`);
  const coletado = await Promise.all(
    fontes.map(async (f) => {
      try {
        return await collectFromSource(f, fetch);
      } catch {
        return [] as NewsCandidate[];
      }
    }),
  );

  const todas = coletado.flat();
  const porDia = new Map<string, NewsCandidate[]>();
  for (const c of todas) {
    const d = diaDe(c.published_at);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d)!.push(c);
  }

  const dias = [...porDia.keys()]
    .filter((d) => d !== "sem-data")
    .sort()
    .reverse()
    .slice(0, quantosDias);

  escrever(
    `${todas.length} candidatas coletadas ao todo, distribuídas em ${porDia.size} dias. ` +
      `Analisando os ${dias.length} mais recentes: ${dias.slice().reverse().join(", ")}.`,
  );
  escrever();
  escrever(
    `O dia mais antigo da amostra sai subestimado por construção: o feed RSS entrega uma janela, ` +
      `e o que caiu fora dela nunca chegou aqui.`,
  );
  escrever();

  const resumos: FunilDoDia[] = [];
  const todasAsRecusas: Array<{ etapa: string; motivo: string; titulo: string; detalhe?: string }> = [];
  const dominiosQueEntregaram = new Map<string, number>();
  const dominiosQueSobreviveram = new Map<string, number>();

  /*
   * A origem por dia, e por que ela não sai do resumo do funil.
   *
   * `origin_channel` não é derivado dos tetos desta medição: `resolverOrigem`
   * pergunta ao `editorial_history` se aquela pauta saiu no e-mail. Como este
   * script levanta os tetos, a coluna "newsletter levaria" mente de propósito,
   * mas a origem continua verdadeira, porque ela se apoia em publicação e não
   * em seleção hipotética.
   */
  const origemPorDia = new Map<string, { newsletter: number; social: number }>();

  /**
   * O funil por fonte nomeada.
   *
   * Volume bruto não é sucesso: uma fonte que entrega 40 itens e nenhum post
   * confirmado é pior que uma que entrega 3 e confirma 2. Por isso a tabela
   * carrega as quatro etapas, e não só a primeira.
   */
  type EtapasDaFonte = { entregou: number; pool: number; confirmadas: number; posts: number };
  const porFonte = new Map<string, EtapasDaFonte>();
  const etapasDe = (nome: string): EtapasDaFonte => {
    const chave = nome || "(sem nome)";
    if (!porFonte.has(chave)) porFonte.set(chave, { entregou: 0, pool: 0, confirmadas: 0, posts: 0 });
    return porFonte.get(chave)!;
  };

  for (const dia of dias.slice().reverse()) {
    console.log(`\n=== ${dia} (${porDia.get(dia)!.length} candidatas) ===`);
    const { resumo, ciclo, recusadas, guarda, conferencia } = await rodarFunilDoDia(porDia.get(dia)!, {
      dia,
      projectId: project.id,
      marca: {
        nome: project.brand.displayName || project.name,
        nicho: project.niche,
        extra: project.editorialPromptExtra ?? "",
        keyword: String(project.settings?.instagram_keyword ?? "").trim() || "VISA",
      },
      historico,
      config,
      configSocial,
      client,
      provedorDeVetor: criarProvedorOpenAI(process.env, fetch),
      env: process.env,
      fetcher: fetch,
    });

    resumos.push(resumo);
    todasAsRecusas.push(...recusadas.map((r) => ({ ...r, titulo: `${dia} :: ${r.titulo}` })));

    for (const c of porDia.get(dia)!) {
      const d = dominioDe(c.url);
      dominiosQueEntregaram.set(d, (dominiosQueEntregaram.get(d) ?? 0) + 1);
    }
    for (const p of ciclo.previews) {
      const d = dominioDe(p.post.pauta.grupo.primary.url);
      dominiosQueSobreviveram.set(d, (dominiosQueSobreviveram.get(d) ?? 0) + 1);
    }

    const origem = { newsletter: 0, social: 0 };
    for (const p of ciclo.previews) origem[p.origem.originChannel] += 1;
    origemPorDia.set(dia, origem);

    for (const c of porDia.get(dia)!) etapasDe(c.source_name).entregou += 1;
    for (const pa of guarda.approvedEditorialPool) etapasDe(pa.grupo.primary.source_name).pool += 1;
    for (const cf of conferencia.confirmadas) etapasDe(cf.grupo.primary.source_name).confirmadas += 1;
    for (const p of ciclo.previews) etapasDe(p.post.pauta.grupo.primary.source_name).posts += 1;

    console.log(
      `${dia}: ${resumo.gruposUnicos} grupos, ${resumo.approvedEditorialPool} no pool, ` +
        `${resumo.confirmadas} confirmadas, ${resumo.postsFinais} post(s)`,
    );
  }

  // ------------------------------------------------------------------
  escrever(`## 1. Dia a dia`);
  escrever();
  escrever(
    `| dia | coletadas | grupos | classif. | reuso | rejeitadas | pool | conferidos | confirm | reject | conflito | cortes div. | copy fail | sem img | **posts** | origem NL | origem social |`,
  );
  escrever(
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
  );
  for (const r of resumos) {
    escrever(
      `| ${r.dia} | ${r.coletadas} | ${r.gruposUnicos} | ${r.classificadasAgora} | ${r.reaproveitadasDaClassificacao} | ` +
        `${r.recusadasNaLinhaEditorial} | ${r.approvedEditorialPool} | ${r.finalistasConferidos} | ${r.confirmadas} | ` +
        `${r.recusadasNaVerificacao} | ${r.emConflito} | ${r.cortadasPorDiversidade} | ${r.descartadasNaCopy} | ` +
        `${r.semImagem} | **${r.postsFinais}** | ${origemPorDia.get(r.dia)?.newsletter ?? 0} | ` +
        `${origemPorDia.get(r.dia)?.social ?? 0} |`,
    );
  }
  escrever();

  const total = <K extends keyof FunilDoDia>(campo: K) =>
    resumos.reduce((acc, r) => acc + (typeof r[campo] === "number" ? (r[campo] as number) : 0), 0);

  escrever(
    `Total: ${total("gruposUnicos")} grupos únicos, ${total("approvedEditorialPool")} aprovadas na linha editorial, ` +
      `${total("confirmadas")} verificadas, **${total("postsFinais")} posts** em ${resumos.length} dias ` +
      `(média ${(total("postsFinais") / Math.max(1, resumos.length)).toFixed(1)}/dia contra alvo ${configSocial.alvoPorDia}).`,
  );
  escrever();

  // ------------------------------------------------------------------
  escrever(`## 2. Onde o volume morre`);
  escrever();

  const editoriais: Record<string, number> = {};
  const diversidade: Record<string, number> = {};
  const copy: Record<string, number> = {};
  const semImagem: Record<string, number> = {};
  const conflito: Record<string, number> = {};
  for (const r of resumos) {
    somar(editoriais, r.motivosEditoriais);
    somar(diversidade, r.motivosDeDiversidade);
    somar(copy, r.motivosDeCopy);
    somar(semImagem, r.motivosSemImagem);
    somar(conflito, r.camposEmConflito);
  }

  const g = total("gruposUnicos");
  const pct = (n: number) => (g === 0 ? "0%" : `${((n / g) * 100).toFixed(1)}%`);

  escrever(`| etapa | perdidas | % dos grupos únicos | sobreviventes |`);
  escrever(`| --- | ---: | ---: | ---: |`);
  escrever(
    `| linha editorial | ${total("recusadasNaLinhaEditorial")} | ${pct(total("recusadasNaLinhaEditorial"))} | ${total("approvedEditorialPool")} |`,
  );
  escrever(
    `| verificação (reject) | ${total("recusadasNaVerificacao")} | ${pct(total("recusadasNaVerificacao"))} | |`,
  );
  escrever(`| verificação (conflito) | ${total("emConflito")} | ${pct(total("emConflito"))} | ${total("confirmadas")} |`);
  escrever(
    `| diversidade social | ${total("cortadasPorDiversidade")} | ${pct(total("cortadasPorDiversidade"))} | |`,
  );
  escrever(`| copy / guard | ${total("descartadasNaCopy")} | ${pct(total("descartadasNaCopy"))} | ${total("postsFinais")} |`);
  escrever();
  escrever(
    `Pautas do pool que nem chegaram à conferência (ficaram fora das vagas mais folga): ` +
      `${total("approvedEditorialPool") - total("finalistasConferidos")}.`,
  );
  escrever();

  escrever(`### Linha editorial, por motivo`);
  escrever();
  escrever(`| motivo | quantas | % das rejeições |`);
  escrever(`| --- | ---: | ---: |`);
  const totalEditorial = Object.values(editoriais).reduce((a, b) => a + b, 0);
  for (const [motivo, n] of Object.entries(editoriais).sort((a, b) => b[1] - a[1])) {
    escrever(`| ${motivo} | ${n} | ${((n / Math.max(1, totalEditorial)) * 100).toFixed(1)}% |`);
  }
  escrever();

  escrever(`### Verificação, campos que divergiram`);
  escrever();
  escrever(tabela(conflito));
  escrever();

  escrever(`### Diversidade social`);
  escrever();
  escrever(tabela(diversidade));
  escrever();

  escrever(`### Copy e guard`);
  escrever();
  escrever(tabela(copy));
  escrever();

  escrever(`### Visual`);
  escrever();
  escrever(
    `${total("semImagem")} de ${total("postsFinais")} post(s) sem imagem válida. ` +
      `Isso NÃO reduz o volume: a pauta publica com capa de texto.`,
  );
  escrever();
  escrever(tabela(semImagem));
  escrever();

  // ------------------------------------------------------------------
  escrever(`## 2b. Funil por fonte`);
  escrever();
  escrever(
    `Volume bruto não é sucesso. As quatro colunas são a mesma pergunta em quatro alturas: ` +
      `quantos itens a fonte entregou, quantos passaram na linha editorial, quantos o verificador ` +
      `confirmou, e quantos viraram post de fato.`,
  );
  escrever();
  escrever(`| fonte | entregou | pool | confirmadas | **posts** |`);
  escrever(`| --- | ---: | ---: | ---: | ---: |`);
  const ordenadas = [...porFonte.entries()].sort(
    (a, b) => b[1].posts - a[1].posts || b[1].confirmadas - a[1].confirmadas || b[1].pool - a[1].pool || b[1].entregou - a[1].entregou,
  );
  for (const [nome, e] of ordenadas) {
    escrever(`| ${nome} | ${e.entregou} | ${e.pool} | ${e.confirmadas} | **${e.posts}** |`);
  }
  escrever();

  const mudas = ordenadas.filter(([, e]) => e.posts === 0);
  escrever(
    `${mudas.length} de ${ordenadas.length} fontes não produziram nenhum post no período. ` +
      `Entre elas, ${mudas.filter(([, e]) => e.pool > 0).length} chegaram ao pool e morreram depois, ` +
      `e ${mudas.filter(([, e]) => e.pool === 0).length} nunca passaram da linha editorial.`,
  );
  escrever();

  // ------------------------------------------------------------------
  escrever(`## 3. Oferta por domínio`);
  escrever();
  escrever(`Quem entrega volume e quem entrega volume que sobrevive ao filtro.`);
  escrever();
  escrever(`| domínio | coletadas | viraram post |`);
  escrever(`| --- | ---: | ---: |`);
  for (const [d, n] of [...dominiosQueEntregaram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    escrever(`| ${d} | ${n} | ${dominiosQueSobreviveram.get(d) ?? 0} |`);
  }
  escrever();

  const semNenhum = [...dominiosQueEntregaram.entries()].filter(([d]) => !dominiosQueSobreviveram.has(d));
  escrever(
    `${semNenhum.length} de ${dominiosQueEntregaram.size} domínios não produziram nenhum post no período.`,
  );
  escrever();

  // ------------------------------------------------------------------
  escrever(`## 4. Pautas que chegaram longe e caíram`);
  escrever();
  const tardias = todasAsRecusas.filter((r) => r.etapa !== "linha editorial");
  if (tardias.length === 0) {
    escrever(`Nenhuma. Tudo que morreu, morreu na linha editorial.`);
  } else {
    escrever(`| pauta | motivo | o que o verificador disse |`);
    escrever(`| --- | --- | --- |`);
    for (const r of tardias) {
      escrever(
        `| ${r.titulo.slice(0, 70)} | ${r.motivo.slice(0, 34)} | ${(r.detalhe ?? "").replace(/\|/g, " ").slice(0, 150)} |`,
      );
    }
  }
  escrever();

  escrever(`## 5. Custo`);
  escrever();
  escrever(
    `${(total("tokensDaClassificacao") + total("tokensDaVerificacao")).toLocaleString("pt-BR")} tokens ` +
      `(${total("tokensDaClassificacao").toLocaleString("pt-BR")} classificação, ` +
      `${total("tokensDaVerificacao").toLocaleString("pt-BR")} verificação). ` +
      `${total("reaproveitadasDaClassificacao")} classificações vieram do banco e não foram pagas de novo.`,
  );
  escrever();

  const falhas = resumos.flatMap((r) => r.falhasDeClassificacao.map((f) => `${r.dia}: ${f}`));
  if (falhas.length > 0) {
    escrever(`## 5b. Lotes de classificação que falharam`);
    escrever();
    escrever(
      `Pauta sem classificação é recusada por precaução e aparece como REJECT_UNCLASSIFIED. ` +
        `Isso parece decisão editorial e não é: é infraestrutura.`,
    );
    escrever();
    for (const f of falhas) escrever(`- ${f}`);
    escrever();
  }

  const degradados = resumos.filter((r) => r.persistenciaDegradada.length > 0);
  if (degradados.length > 0) {
    escrever(
      `**Persistência degradada em ${degradados.length} dia(s)**: ${degradados
        .map((d) => `${d.dia} (${d.persistenciaDegradada.join("; ")})`)
        .join(", ")}. Os números acima estão sujeitos a isso.`,
    );
    escrever();
  }

  fs.writeFileSync(path.resolve(process.cwd(), saida), linhas.join("\n"), "utf-8");
  console.log(`\nRelatório em ${saida}`);

  fs.writeFileSync(
    path.resolve(process.cwd(), saida.replace(/\.md$/, "") + ".json"),
    JSON.stringify({ resumos, recusas: todasAsRecusas }, null, 2),
    "utf-8",
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
