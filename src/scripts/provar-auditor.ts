import fs from "node:fs";
import path from "node:path";
import { auditarClaims } from "../lib/server/editorial/claims-semanticas";
import type { PacoteFactual } from "../lib/server/editorial/pacote-factual";

/**
 * O auditor semântico reprova quando deve?
 *
 * O benchmark de sete dias detectou 34 claims e reprovou zero. Isso pode
 * significar duas coisas opostas: a copy está bem ancorada, ou o auditor nunca
 * diz não. "Zero reprovadas" só vale como notícia boa depois de provar que o
 * não existe.
 *
 * Este script manda pares deliberadamente errados, dos tipos que o item 6 e o
 * item 11 nomeiam, e confere que cada um é reprovado. Uma chamada, sem rede
 * além do modelo, sem tocar em nada.
 *
 *   npx tsx src/scripts/provar-auditor.ts --saida=/tmp/auditor.md
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

function pacote(fatos: string[], gaps: string[] = []): PacoteFactual {
  return {
    verified_facts: fatos,
    people: [],
    organizations: ["USCIS"],
    places: ["Estados Unidos"],
    dates: [],
    numbers: [],
    gaps,
    source_urls: ["https://www.uscis.gov/x"],
    texto_de_origem: fatos.join(" "),
  } as PacoteFactual;
}

/** Cada caso diz o que a fonte tem e o que o slide afirma, e o veredito esperado. */
const CASOS: Array<{
  nome: string;
  fatos: string[];
  gaps?: string[];
  texto: string;
  deveReprovar: boolean;
}> = [
  {
    nome: "pode virando garante",
    fatos: ["A USCIS pode pedir evidencia adicional antes de decidir o pedido."],
    texto: "A USCIS garante que vai pedir evidencia adicional antes de decidir.",
    deveReprovar: true,
  },
  {
    nome: "algumas situacoes virando todos",
    fatos: ["Em algumas categorias, a peticao e o pedido de green card podem ser enviados juntos."],
    texto: "Em todas as categorias a peticao e o pedido de green card sao enviados juntos.",
    deveReprovar: true,
  },
  {
    nome: "caso individual virando regra geral",
    fatos: ["Num caso analisado pela USCIS, o pedido foi aprovado sem entrevista."],
    texto: "Pedidos desse tipo sao aprovados sem entrevista.",
    deveReprovar: true,
  },
  {
    nome: "evidencia virando exigencia",
    fatos: ["Cartas de recomendacao podem ser apresentadas como evidencia no pedido."],
    texto: "Cartas de recomendacao sao obrigatorias no pedido.",
    deveReprovar: true,
  },
  {
    nome: "permissao virando direito",
    fatos: ["Quem esta nos Estados Unidos e e elegivel pode pedir o green card sem sair do pais."],
    texto: "Quem esta nos Estados Unidos tem direito de pedir o green card sem sair do pais.",
    deveReprovar: true,
  },
  {
    nome: "beneficio que o pacote nao da",
    fatos: ["O EB-2 NIW dispensa oferta de trabalho quando o interesse nacional e demonstrado."],
    texto: "Essa categoria permite que o profissional trabalhe para qualquer empresa nos Estados Unidos.",
    deveReprovar: true,
  },
  {
    nome: "consequencia que o pacote nao afirma",
    fatos: ["A USCIS publicou uma atualizacao do manual de politicas sobre ajuste de status."],
    gaps: ["A pagina nao informa efeito sobre prazos."],
    texto: "A atualizacao acelera a analise dos pedidos que ja estao na fila.",
    deveReprovar: true,
  },
  {
    nome: "parafrase fiel, que NAO pode ser reprovada",
    fatos: ["O ajuste de status permite pedir o green card sem sair dos Estados Unidos."],
    texto: "Quem ja esta nos Estados Unidos pode fazer o pedido sem precisar voltar ao pais de origem.",
    deveReprovar: false,
  },
  {
    nome: "ressalva, que NAO pode ser reprovada",
    fatos: ["A USCIS descreve as etapas do pedido."],
    gaps: ["A pagina nao informa prazo de analise."],
    texto: "A fonte nao informa quanto tempo a analise leva.",
    deveReprovar: false,
  },
];

async function main() {
  carregarEnv();
  const saida = process.argv.slice(2).find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/auditor.md";

  const r = await auditarClaims(
    CASOS.map((c, i) => ({
      indice: i,
      titulo: c.nome,
      texto: c.texto,
      pacote: pacote(c.fatos, c.gaps),
    })),
    process.env,
    fetch,
    { comEscopo: true },
  );

  const linhas: string[] = [
    "# O auditor semântico reprova quando deve?",
    "",
    `${CASOS.length} pares deliberadamente construídos, numa chamada. Custo US$ ${r.custoUsd.toFixed(4)}.`,
    "",
  ];

  if (r.erro) {
    linhas.push(`**A auditoria não rodou: ${r.erro}**`);
    fs.writeFileSync(saida, linhas.join("\n"), "utf-8");
    console.log(linhas.join("\n"));
    process.exitCode = 1;
    return;
  }

  linhas.push("| caso | esperado | claims | veredito | resultado |");
  linhas.push("| --- | --- | ---: | --- | --- |");

  let erros = 0;

  CASOS.forEach((c, i) => {
    const doCaso = r.claims.filter((x) => x.pauta === i);
    const reprovou = doCaso.some((x) => !x.sustentada);
    const ok = reprovou === c.deveReprovar;
    if (!ok) erros += 1;

    linhas.push(
      `| ${c.nome} | ${c.deveReprovar ? "reprovar" : "passar"} | ${doCaso.length} | ` +
        `${reprovou ? "**reprovou**" : "passou"} | ${ok ? "ok" : "**DIVERGIU**"} |`,
    );
  });

  linhas.push("");
  linhas.push("## As claims, uma por uma");
  linhas.push("");

  CASOS.forEach((c, i) => {
    const doCaso = r.claims.filter((x) => x.pauta === i);
    linhas.push(`### ${c.nome}`);
    linhas.push("");
    linhas.push(`- fonte: ${c.fatos.join(" ")}`);
    linhas.push(`- slide: ${c.texto}`);
    if (doCaso.length === 0) linhas.push(`- **nenhuma claim detectada**`);
    for (const x of doCaso) {
      linhas.push(`- [${x.tipo}] ${x.sustentada ? "sustentada" : "**NÃO sustentada**"}: "${x.trecho}"`);
      if (x.motivo) linhas.push(`  - ${x.motivo}`);
    }
    linhas.push("");
  });

  linhas.push(
    erros === 0
      ? `Os ${CASOS.length} casos conferem: o auditor reprova o que deve e passa o que deve.`
      : `**${erros} divergência(s)**: o auditor não está fazendo o que se espera dele.`,
  );

  fs.writeFileSync(saida, linhas.join("\n"), "utf-8");
  console.log(linhas.join("\n"));
  if (erros > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
