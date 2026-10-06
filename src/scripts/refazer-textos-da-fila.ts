import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarEnv, clienteDoBanco } from "./artigos-comum";
import type { Aprovacao, Etapa } from "../lib/server/aprovacao/contrato";
import type { MundoDaRefacao } from "../lib/server/aprovacao/ganchos-por-etapa";

/**
 * Refaz o texto dos posts que o dono devolveu, pela MESMA refação da fila
 * (06/10/2026).
 *
 *   npx tsx src/scripts/refazer-textos-da-fila.ts                       ensaio dos 5 posts de 07/10/2026
 *   npx tsx src/scripts/refazer-textos-da-fila.ts --posts=<id>,<id>     ensaio de outros posts (pede --motivo)
 *   npx tsx src/scripts/refazer-textos-da-fila.ts --aplicar             reprova na fila, com o motivo do dono
 *   --teto-usd=2                                                        teto de custo de modelo do ensaio
 *   --motivo="..."                                                      motivo para post fora da lista do dono
 *
 * O ENSAIO É O PADRÃO. Ele roda o gancho de texto de produção
 * (`criarGanchosPorEtapa(...).post.texto`), com o motivo do dono e a memória
 * do canal, contra um cliente do banco que só LÊ: toda escrita (o `update` do
 * post) é anotada e não enviada. Mostra a manchete e a legenda que a refação
 * gravaria. Chama modelo (redação, guarda e reparos), por isso o teto.
 *
 * Com `--aplicar`, nada é gerado aqui: o script REPROVA cada peça na fila
 * (`reprovar`, etapa texto, ou arte quando o defeito era só de desenho), com
 * o retorno do dono como motivo. Isso grava a reprovação (é dela que o
 * aprendizado do canal lê, RF-29), agenda a refação e devolve a peça a
 * `refazendo`. Quem refaz é o relógio da fila em produção, com o código
 * implantado, e a peça volta `aguardando` com o hash novo. Por isso o
 * `--aplicar` é para DEPOIS do deploy: refazer com o código velho
 * reproduziria os mesmos defeitos.
 *
 * Por que reprovar, e não gravar o texto direto: a reprovação é o caminho em
 * que a fila confere o estado (só `aguardando` ou aprovada sem liberar), conta
 * a refação (a terceira reprovação descarta) e ensina o canal. Gravar por fora
 * seria o defeito do `consertar-capas` de 06/10: um escritor da peça que não
 * fala com a fila.
 */

type Retorno = { etapa: Etapa; motivo: string; manchete: string };

/*
 * O retorno do dono sobre a fila de 07/10/2026, post a post. As palavras são
 * as dele, resumidas; é este texto que vai para a reprovação e para a voz do
 * redator na refação.
 */
const RETORNO_DO_DONO: Record<string, Retorno> = {
  "c3001847-87a8-44dd-ba1d-2f2ae7c18987": {
    etapa: "texto",
    manchete: "Bret Taylor: “É uma espécie de caos até que tal padrão exista”",
    motivo:
      "Manchete sem contexto, não comunica nada. Quem fala tem de ser apresentado pelo cargo ou pela empresa famosa " +
      "(Bret Taylor, presidente do conselho da OpenAI e cofundador da Sierra), e a fala não pode depender da matéria: " +
      "\"tal padrão\" sem dizer qual padrão. A manchete diz do que se trata (o padrão de Meta, Walmart e Stripe para agentes de IA) e por que importa.",
  },
  "71a5312c-9e30-43b3-baf4-e968f70ad3fa": {
    etapa: "arte",
    manchete: "Anthropic amplia programa para startups com até US$ 45.000 em descontos e créditos",
    motivo: "O valor \"US$ 45.000\" quebrou de linha na arte. Dinheiro e número com a unidade nunca se partem.",
  },
  "ad4671f7-de78-4a4a-9b67-136a442aa248": {
    etapa: "texto",
    manchete: "Ronaldo Caiado oficializa apoio a Flávio Bolsonaro no segundo turno em Goiânia",
    motivo:
      "A manchete precisa dizer a um brasileiro qualquer quem e por que importa, com o sujeito explícito: " +
      "Caiado foi derrotado no primeiro turno e o apoio é a Flávio contra Lula. Goiânia é detalhe, não o fato.",
  },
  "af4a2c30-dfe4-4152-b47b-aae25d2acd9a": {
    etapa: "texto",
    manchete: "Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ",
    motivo:
      "Quem é Douglas Ruas e vencer o quê? Apresente pelo que ele disputa (o governo do Rio) e diga por que importa " +
      "(a eleição pode acabar sem segundo turno contra Eduardo Paes). E o crédito da foto leva só o nome dos fotógrafos, " +
      "sem banco, sem licença e sem barra: \"Fotos: Lucio Bernardo Jr. e Leonardo Prado\".",
  },
  "a8168226-f2cf-45ab-a427-2f886d1eceba": {
    etapa: "texto",
    manchete: "SpaceX sobe quase 8%, atinge maior nível desde meados de junho e devolve Musk ao status de trilionário",
    motivo:
      "\"SpaceX sobe quase 8%\": sobe 8% em quê? Toda variação nomeia a métrica (as ações, o valor de mercado, a avaliação, a receita). " +
      "E o crédito leva só o nome do fotógrafo, sem \"from Washington, DC, USA\" e sem licença.",
  },
};

const QUEM = "dono (refazer-textos-da-fila)";

function argumento(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
}

/**
 * Um cliente que lê e não escreve: `insert`, `update`, `upsert` e `delete`
 * são anotados e respondem sucesso sem sair da máquina, e `rpc` e `storage`
 * são recusados. É o que deixa o ensaio rodar o gancho de produção inteiro.
 */
function clienteSoDeLeitura(real: SupabaseClient, anotadas: Array<{ tabela: string; op: string; dados: unknown }>): SupabaseClient {
  const encadeavel = (): unknown =>
    new Proxy(
      {},
      {
        get(_alvo, chave) {
          if (chave === "then") return (ok: (v: unknown) => void) => ok({ data: null, error: null });
          return () => encadeavel();
        },
      },
    );
  return new Proxy(real, {
    get(alvo, chave) {
      if (chave === "from") {
        return (tabela: string) => {
          const consulta = alvo.from(tabela);
          return new Proxy(consulta, {
            get(c, k) {
              if (k === "insert" || k === "update" || k === "upsert" || k === "delete") {
                return (dados: unknown) => {
                  anotadas.push({ tabela, op: String(k), dados });
                  return encadeavel();
                };
              }
              const v = (c as unknown as Record<string | symbol, unknown>)[k];
              return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
            },
          });
        };
      }
      if (chave === "rpc" || chave === "storage") throw new Error(`ensaio: ${String(chave)} recusado no cliente só de leitura`);
      const v = (alvo as unknown as Record<string | symbol, unknown>)[chave];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(alvo) : v;
    },
  }) as SupabaseClient;
}

async function main() {
  carregarEnv();
  const aplicar = process.argv.includes("--aplicar");
  const teto = Number(argumento("teto-usd") ?? "2");
  const ids = (argumento("posts") ?? Object.keys(RETORNO_DO_DONO).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const motivoAvulso = argumento("motivo")?.trim();

  const client = clienteDoBanco();
  const { criarFilaStore } = await import("../lib/server/aprovacao/fila-store");
  const { requireActiveProject } = await import("../lib/server/projects");
  const { projetoDaFila } = await import("../lib/server/aprovacao/integracao");
  const { modoDaFila } = await import("../lib/server/aprovacao/modo");
  const store = criarFilaStore(client);

  console.log(aplicar ? "APLICAR: reprova na fila com o retorno do dono\n" : `ENSAIO: nada é gravado (teto de US$ ${teto.toFixed(2)})\n`);

  const alvos: Array<{ id: string; aprovacao: Aprovacao; retorno: Retorno }> = [];
  for (const id of ids) {
    const { data: linha } = await client.from("social_posts").select("id, project_id, title").eq("id", id).maybeSingle();
    if (!linha) {
      console.log(`- ${id}: post não encontrado`);
      continue;
    }
    const aprovacao = await store.porPeca(String(linha.project_id), "post", id);
    if (!aprovacao) {
      console.log(`- ${id}: o post não está na fila de aprovação`);
      continue;
    }
    const retorno =
      RETORNO_DO_DONO[id] ?? (motivoAvulso ? { etapa: "texto" as Etapa, motivo: motivoAvulso, manchete: String(linha.title ?? "") } : null);
    if (!retorno) {
      console.log(`- ${id}: fora da lista do dono; passe --motivo="..."`);
      continue;
    }
    alvos.push({ id, aprovacao, retorno });
  }
  if (alvos.length === 0) return;

  const projeto = await requireActiveProject(alvos[0].aprovacao.projectId);
  const daFila = projetoDaFila(projeto as never, projeto.id);
  if (!daFila) throw new Error("projeto sem configuração de fila");
  console.log(`fila do projeto: ${modoDaFila(projeto as never)} (a refação só roda sozinha com a fila em enforce)\n`);

  if (aplicar) {
    const { depsDaFila } = await import("../lib/server/aprovacao/integracao");
    const { reprovar } = await import("../lib/server/aprovacao/fila");
    const deps = depsDaFila(client, daFila);
    for (const { id, aprovacao, retorno } of alvos) {
      const r = await reprovar(daFila, aprovacao.id, retorno.etapa, retorno.motivo, QUEM, deps);
      console.log(`- ${id} (${retorno.etapa}): ${r.ok ? `${r.desfecho}: ${r.detalhe}` : `NÃO: ${r.motivo}`}`);
    }
    console.log("\nA refação roda no relógio da fila em produção, em até um minuto, e a peça volta aguardando com o hash novo.");
    return;
  }

  // Ensaio: o gancho de produção, com um cliente que não escreve.
  const { mundoDeProducao } = await import("../lib/server/aprovacao/ganchos-de-producao");
  const { criarGanchosPorEtapa } = await import("../lib/server/aprovacao/ganchos-por-etapa");
  const { errosRecentesDaEtapa } = await import("../lib/server/aprovacao/memoria-de-reprovacao");
  const { aprendizadoDoCanal } = await import("../lib/server/aprendizado/do-canal");
  const { conferirContextoDaManchete } = await import("../lib/server/social/manchete-com-contexto");
  const { linhaDeCreditoSoComNomes } = await import("../lib/server/social/legenda-final");

  const anotadas: Array<{ tabela: string; op: string; dados: unknown }> = [];
  const leitura = clienteSoDeLeitura(client, anotadas);
  let gasto = 0;
  // O mundo de produção traz todos os campos; o tipo dele os declara opcionais.
  const producao = mundoDeProducao() as unknown as MundoDaRefacao;
  const mundo: MundoDaRefacao = {
    ...producao,
    client: () => leitura,
    gerarPost: async (...a: Parameters<MundoDaRefacao["gerarPost"]>) => {
      const r = await producao.gerarPost(...a);
      gasto += r.post?.custoUsd ?? r.descarte?.custoUsd ?? 0;
      return r;
    },
  };
  const ganchos = criarGanchosPorEtapa(mundo);

  for (const { id, aprovacao, retorno } of alvos) {
    console.log(`== ${id}`);
    console.log(`   antes: ${retorno.manchete}`);
    console.log(`   problemas que a guarda nova acha na manchete de antes: ${
      conferirContextoDaManchete(retorno.manchete, {}).map((p) => p.regra).join(", ") || "nenhum sem o pacote"
    }`);
    if (retorno.etapa !== "texto") {
      const { data: l } = await client.from("social_posts").select("caption").eq("id", id).maybeSingle();
      const ultima = String(l?.caption ?? "").trim().split("\n").pop() ?? "";
      console.log(`   etapa ${retorno.etapa}: a arte é recongelada com o mesmo texto; o valor sai colado (US$ 45.000).`);
      console.log(`   crédito: ${linhaDeCreditoSoComNomes(ultima)}\n`);
      continue;
    }
    if (gasto >= teto) {
      console.log(`   pulado: o teto de US$ ${teto.toFixed(2)} foi atingido\n`);
      continue;
    }
    const [naoRepetir, aprendizado] = await Promise.all([
      errosRecentesDaEtapa(aprovacao.projectId, "post", "texto", undefined, store),
      aprendizadoDoCanal(store, aprovacao.projectId, "post"),
    ]);
    const antes = anotadas.length;
    const r = await ganchos.post.texto({ aprovacao, etapa: "texto", motivo: retorno.motivo, naoRepetir, alvo: null, aprendizado });
    if (!r.ok) {
      console.log(`   a refação NÃO fecharia: ${r.motivo}\n`);
      continue;
    }
    const escrita = anotadas.slice(antes).find((a) => a.tabela === "social_posts" && a.op === "update");
    const dados = (escrita?.dados ?? {}) as { title?: string; caption?: string; social_guard_reasons?: { attempts?: number } };
    console.log(`   depois: ${dados.title ?? r.resumo?.titulo ?? "(sem título)"}`);
    console.log(`   tentativas: ${dados.social_guard_reasons?.attempts ?? "?"}  |  custo acumulado: US$ ${gasto.toFixed(4)}`);
    console.log("   legenda:");
    for (const l of String(dados.caption ?? r.resumo?.texto ?? "").split("\n")) console.log(`     ${l}`);
    console.log("");
  }

  const escritas = anotadas.map((a) => `${a.op} ${a.tabela}`);
  console.log(`escritas anotadas e NÃO enviadas: ${escritas.length ? escritas.join(", ") : "nenhuma"}`);
  console.log(`custo de modelo do ensaio: US$ ${gasto.toFixed(4)}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
