import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";
import { motivoParaRecusarTexto, type EtapaEditorial } from "../lib/server/instrucoes";
import { CATALOGO_DE_ETAPAS } from "../lib/server/instrucoes-catalogo";
import { ativarVersao, criarVersao, listarVersoes, voltarAoPadrao } from "../lib/server/instrucoes-store";

/**
 * Grava as instruções do método Not Journal e The News como versões ativas
 * (06/10/2026), para o dono rodar DEPOIS de aprovar os textos.
 *
 * Os textos são os padrões do código, que já mudaram neste commit: com a
 * capacidade `instrucoes` fora de `enforce`, eles valem sem este script. O que
 * o script faz é deixar o texto novo registrado como versão do painel, para
 * quem liga a capacidade, e para que uma versão antiga gravada no banco não
 * continue vencendo o texto novo.
 *
 *   npx tsx src/scripts/salvar-instrucoes.ts                 (ensaio: só mostra)
 *   npx tsx src/scripts/salvar-instrucoes.ts --aplicar       (grava as versões, ativas)
 *   npx tsx src/scripts/salvar-instrucoes.ts --reverter      (volta cada etapa à versão anterior)
 *   npx tsx src/scripts/salvar-instrucoes.ts --so manchete,voz_social
 *   npx tsx src/scripts/salvar-instrucoes.ts --projeto <id>
 *
 * A volta é a do próprio store: versão nunca é editada nem apagada, voltar é
 * ATIVAR a que valia antes, que fica anotada no autor da versão gravada
 * ("...|antes:v3" ou "...|antes:codigo"). Quando antes valia o texto do
 * código, voltar é desativar; e como o padrão do código também mudou neste
 * commit, voltar ao texto de ANTES do método é reverter o commit.
 *
 * Segunda leva, a legenda do Not Journal (06/10/2026, mais tarde): os padrões
 * de `social_copy` (a legenda em lide e parágrafos), `voz_social` (registro de
 * jornal, sem "você") e o contrato do carrossel mudaram. O mesmo comando grava
 * só o que mudou: a etapa cujo texto já é o ativo é pulada ("já é a versão
 * ativa"). As versões desta leva levam outro autor, e o `--reverter` desfaz
 * as duas levas, uma de cada vez, sempre voltando à versão anterior.
 *
 * O crédito de foto, a hashtag e o "Siga @eua.journal" NÃO dependem destes
 * textos: são montados em código (`social/legenda-final.ts`), e valem mesmo
 * com uma versão antiga ativa no banco.
 */

const ETAPAS_DO_METODO: EtapaEditorial[] = [
  "newsletter_assunto",
  "manchete",
  "social_copy",
  "carrossel_copy",
  "voz_social",
];

/** Quem gravou, para o histórico do painel separar esta leva das edições à mão. */
const AUTOR = "legenda-not-journal-2026-10-06";
/** As levas que este script já gravou, para o `--reverter` reconhecer qualquer uma delas. */
const AUTORES_DO_SCRIPT = ["metodo-not-journal-the-news-2026-10-06", AUTOR];

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const reverter = process.argv.includes("--reverter");
  if (aplicar && reverter) throw new Error("use --aplicar OU --reverter, não os dois");

  const projetoId = argumento("--projeto") ?? DEFAULT_PROJECT_ID;
  const so = argumento("--so");
  const etapas = so
    ? ETAPAS_DO_METODO.filter((e) => so.split(",").map((s) => s.trim()).includes(e))
    : ETAPAS_DO_METODO;

  const cliente = clienteDoBanco();
  const versoes = await listarVersoes(cliente, projetoId);

  console.log(
    aplicar
      ? "MODO: APLICAR (grava uma versão nova e ativa por etapa)"
      : reverter
        ? "MODO: REVERTER (ativa a versão anterior de cada etapa)"
        : "MODO: ENSAIO (nada é gravado; --aplicar grava, --reverter volta)",
  );
  console.log(`projeto ${projetoId}, etapas: ${etapas.join(", ")}\n`);

  for (const etapa of etapas) {
    const descricao = CATALOGO_DE_ETAPAS.find((d) => d.etapa === etapa);
    if (!descricao) throw new Error(`etapa sem catálogo: ${etapa}`);
    const texto = descricao.padrao.trim();
    const daEtapa = versoes.filter((v) => v.etapa === etapa);
    const ativa = daEtapa.find((v) => v.ativo) ?? null;

    console.log(`== ${etapa} (${descricao.rotulo})`);
    console.log(
      `   vigente: ${ativa ? `versão ${ativa.versao}, de ${ativa.criado_por}, ${ativa.texto.length} caracteres` : "texto do código (nenhuma versão ativa)"}`,
    );

    if (reverter) {
      /*
       * Só se desfaz o que ESTE script gravou, e volta-se ao que valia antes
       * dele. O "antes" vai anotado no autor da versão na hora de gravar,
       * porque o histórico sozinho não diz se a versão anterior estava ativa
       * ou se valia o texto do código.
       */
      if (!ativa || !AUTORES_DO_SCRIPT.some((a) => ativa.criado_por.startsWith(a))) {
        console.log("   nada a reverter: a versão ativa não foi gravada por este script");
        continue;
      }
      const antes = /\|antes:v(\d+)$/.exec(ativa.criado_por);
      const anterior = antes ? daEtapa.find((v) => v.versao === Number(antes[1])) : null;
      if (anterior) {
        await ativarVersao(cliente, { projetoId, id: anterior.id });
        console.log(`   revertida: a versão ${anterior.versao}, que valia antes, voltou a valer`);
      } else {
        await voltarAoPadrao(cliente, { projetoId, etapa });
        console.log("   revertida: antes valia o texto do código, e ele volta a valer");
      }
      continue;
    }

    const motivo = motivoParaRecusarTexto(texto);
    if (motivo) {
      console.log(`   RECUSADO pela guarda do painel: ${motivo}`);
      continue;
    }
    if (ativa && ativa.texto.trim() === texto) {
      console.log("   já é a versão ativa, nada a gravar");
      continue;
    }

    console.log(`   novo texto: ${texto.length} caracteres`);
    if (!aplicar) {
      console.log(texto.split("\n").map((l) => `   | ${l}`).join("\n"));
      continue;
    }

    const criadoPor = `${AUTOR}|antes:${ativa ? `v${ativa.versao}` : "codigo"}`;
    const nova = await criarVersao(cliente, { projetoId, etapa, texto, criadoPor });
    console.log(`   gravada: versão ${nova.versao}, ativa`);
  }

  if (!aplicar && !reverter) {
    console.log("\nNada foi gravado. Depois de aprovar os textos: --aplicar. Para desfazer: --reverter.");
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
