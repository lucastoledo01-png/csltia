import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectAllNews } from "../lib/server/newsroom/collector";
import { fontesDeOportunidade } from "../lib/server/newsroom/fontes-oportunidade";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { classificarPautas, decidirPauta } from "../lib/server/editorial/classificador";
import type { Classificacao } from "../lib/server/editorial/classificador";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { escreverRelatorio } from "./relatorio";

/**
 * Quanto o classificador muda de ideia sobre a mesma matéria.
 *
 * A pergunta nasceu de um número: o mesmo dia deu 4 pautas aprovadas numa
 * rodada e 6 em outra. Num pool pequeno isso não é ruído inofensivo, é metade
 * do feed. Aqui a coleta acontece UMA vez e a classificação roda três, sobre o
 * conjunto idêntico, para separar variação do modelo de variação da notícia.
 *
 * Não tenta consertar nada. Mede.
 *
 *   npx tsx src/scripts/medir-estabilidade-classificador.ts --rodadas=3
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

type Leitura = {
  pais: string;
  eixo: string;
  imigracao: boolean;
  leitura: string;
  relevancia: number;
  atores: string;
  aprovada: boolean;
  motivo: string;
};

async function main() {
  carregarEnv();

  const argv = process.argv.slice(2);
  const valor = (n: string) => {
    const a = argv.find((x) => x.startsWith(`--${n}=`));
    return a ? a.split("=").slice(1).join("=") : null;
  };

  const rodadas = Number(valor("rodadas") ?? 3);
  const saida = valor("saida") ?? "estabilidade.md";
  const limite = Number(valor("limite") ?? 120);

  const linhas: string[] = [];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const doBanco = await getProjectNewsSources(project.id);
  const novas = fontesDeOportunidade.filter((f) => !doBanco.some((b) => b.url === f.url));

  // Coleta UMA vez. É o ponto do experimento.
  const coleta = await collectAllNews([...doBanco, ...novas], fetch);
  const { uniqueGroups } = deduplicateCandidates(coleta.candidates);
  const amostra = uniqueGroups.slice(0, limite);

  const config = carregarConfigEditorial(process.env);

  escrever(`# Estabilidade do classificador`);
  escrever();
  escrever(
    `${amostra.length} candidatas, coletadas uma vez, classificadas ${rodadas} vezes. ` +
      `Modelo: ${process.env.OPENAI_MODEL_TRIAGE || process.env.OPENAI_MODEL_EDITOR || "padrão"}.`,
  );
  escrever();

  const entrada = amostra.map((g) => ({
    id: g.primary.id,
    titulo: g.primary.title,
    descricao: g.primary.description || g.primary.content || "",
    fonte: g.primary.source_name,
    url: g.primary.url,
  }));

  const porRodada: Array<Map<string, Leitura>> = [];
  let tokens = 0;

  for (let r = 1; r <= rodadas; r += 1) {
    console.log(`\n[ESTABILIDADE] rodada ${r} de ${rodadas}...`);
    const res = await classificarPautas(entrada, process.env, fetch);
    tokens += res.tokens.total;

    const mapa = new Map<string, Leitura>();
    for (const [id, c] of res.classificacoes.entries()) {
      const decisao = decidirPauta(c as Classificacao, config);
      mapa.set(id, {
        pais: c.pais,
        eixo: c.eixo,
        imigracao: c.imigracao,
        leitura: c.leitura,
        relevancia: c.relevancia,
        atores: [...c.atores].sort().join("|"),
        aprovada: decisao.aprovada,
        motivo: decisao.motivo,
      });
    }
    porRodada.push(mapa);
    escrever(`Rodada ${r}: ${mapa.size} classificadas, ${[...mapa.values()].filter((l) => l.aprovada).length} aprovadas.`);
  }
  escrever();

  // ------------------------------------------------------------------
  const ids = entrada.map((e) => e.id);
  const campos: Array<keyof Leitura> = ["pais", "eixo", "imigracao", "leitura", "relevancia", "atores", "aprovada"];
  const divergencias: Record<string, number> = {};
  for (const c of campos) divergencias[c] = 0;

  let semClassificacaoEmAlguma = 0;
  let mudouDeDecisao = 0;
  const perto: string[] = [];
  const longe: string[] = [];

  for (const id of ids) {
    const leituras = porRodada.map((m) => m.get(id)).filter(Boolean) as Leitura[];
    if (leituras.length < rodadas) {
      semClassificacaoEmAlguma += 1;
      continue;
    }

    for (const campo of campos) {
      const valores = leituras.map((l) => l[campo]);
      const distintos = new Set(valores.map((v) => JSON.stringify(v)));
      if (distintos.size > 1) divergencias[campo] += 1;
    }

    const decisoes = leituras.map((l) => l.aprovada);
    if (new Set(decisoes).size > 1) {
      mudouDeDecisao += 1;
      const relevancias = leituras.map((l) => l.relevancia);
      const min = Math.min(...relevancias);
      const max = Math.max(...relevancias);
      const titulo = entrada.find((e) => e.id === id)?.titulo.slice(0, 60) ?? id;
      const perfil = `${titulo} :: relevância ${relevancias.join("/")}, decisão ${decisoes.map((d) => (d ? "sim" : "não")).join("/")}`;

      // Perto do piso é uma coisa; mudar de lado longe do piso é outra.
      if (min >= config.relevanciaMinima - 1 && max <= config.relevanciaMinima + 1) perto.push(perfil);
      else longe.push(perfil);
    }
  }

  const avaliados = ids.length - semClassificacaoEmAlguma;

  escrever(`## Divergência por campo`);
  escrever();
  escrever(`Sobre ${avaliados} candidatas presentes nas ${rodadas} rodadas.`);
  escrever();
  escrever(`| campo | mudou em | % |`);
  escrever(`| --- | --- | --- |`);
  for (const campo of campos) {
    const n = divergencias[campo];
    escrever(`| ${campo} | ${n} | ${avaliados > 0 ? ((n / avaliados) * 100).toFixed(1) : "0"}% |`);
  }
  escrever();

  escrever(
    `${semClassificacaoEmAlguma} candidata(s) faltaram em ao menos uma rodada ` +
      `(o classificador não as devolveu).`,
  );
  escrever();

  escrever(`## Mudança de decisão`);
  escrever();
  escrever(
    `**${mudouDeDecisao} de ${avaliados}** candidatas mudaram de aprovada para recusada, ou o contrário, ` +
      `entre rodadas. Piso de relevância em uso: ${config.relevanciaMinima}.`,
  );
  escrever();
  escrever(`Perto do piso (dentro de um ponto): ${perto.length}. Longe do piso: ${longe.length}.`);
  escrever();

  if (perto.length > 0) {
    escrever(`### Perto do piso`);
    escrever();
    for (const p of perto.slice(0, 15)) escrever(`- ${p}`);
    escrever();
  }
  if (longe.length > 0) {
    escrever(`### Longe do piso, que é o caso preocupante`);
    escrever();
    for (const p of longe.slice(0, 15)) escrever(`- ${p}`);
    escrever();
  }

  const aprovadasPorRodada = porRodada.map((m) => [...m.values()].filter((l) => l.aprovada).length);
  escrever(`## Efeito no tamanho do pool`);
  escrever();
  escrever(`Aprovadas por rodada: ${aprovadasPorRodada.join(", ")}.`);
  const min = Math.min(...aprovadasPorRodada);
  const max = Math.max(...aprovadasPorRodada);
  escrever(
    `Variação de ${min} a ${max}` +
      (min > 0 ? `, ou ${(((max - min) / min) * 100).toFixed(0)}% sobre o menor.` : "."),
  );
  escrever();
  escrever(`${tokens.toLocaleString("pt-BR")} tokens nas ${rodadas} rodadas.`);

  escreverRelatorio(saida, linhas.join("\n"));
  console.log(`\nRelatório em ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
