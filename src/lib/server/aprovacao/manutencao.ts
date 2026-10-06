import type { Aprovacao, Ramo } from "./contrato";
import { enfileirar, type DepsDaFila, type ProjetoDaFila } from "./fila";

/**
 * Script de manutenção que mexe numa peça que está na fila (06/10/2026).
 *
 * Em 06/10/2026 o `consertar-capas.ts`, rodado pelo Claude, acrescentou
 * crédito e legenda ao HTML da matéria do diesel enquanto ela esperava
 * aprovação em `aprovacoes`. O hash gravado na fila deixou de bater com a
 * linha, e a aprovação ficou impossível: o painel tirou o botão de aprovar
 * (`hashConfere`) e, em `enforce`, o portão seguraria a matéria para sempre.
 * Ninguém tinha mexido no texto; a peça mudou por uma correção de crédito.
 *
 * A regra é a da própria fila, e não uma nova. Quando a versão de uma peça
 * muda, a fila trata como versão nova: volta para `aguardando` com o hash
 * novo, porque a decisão anterior era sobre outra versão. É o que faz a
 * edição à mão (`editarTexto`) e o que faz o escritor que regrava a linha
 * (`enfileirar`). O script usa `enfileirar`, e não `editarTexto`, porque a
 * edição à mão passa pela guarda do TEXTO e vira aprendizado do editor em
 * `edicoes_do_editor`; um crédito de foto acrescentado por manutenção não é
 * nenhuma das duas coisas.
 *
 * O que a decisão separa:
 *
 *   sem linha na fila, ou já liberada, reprovada, cancelada, descartada:
 *     o hash não decide mais nada; grava como antes.
 *   aguardando:
 *     grava e reentra pela fila com o hash novo; continua aguardando.
 *   refazendo:
 *     NÃO grava. A refação está reescrevendo a peça (a de imagem troca capa,
 *     crédito e legenda), e as duas escritas se atropelariam. Rodar de novo
 *     depois que ela voltar.
 *   aprovada e ainda não liberada:
 *     NÃO grava. Gravar desfaria em silêncio uma aprovação do dono; quem
 *     decide é ele, no painel.
 */

export type DecisaoDaManutencao =
  | { acao: "gravar"; reentrar: false; motivo: string }
  | { acao: "gravar"; reentrar: true; aprovacao: Aprovacao; motivo: string }
  | { acao: "pular"; motivo: string };

export function decidirManutencaoNaFila(aprovacao: Aprovacao | null): DecisaoDaManutencao {
  if (!aprovacao) return { acao: "gravar", reentrar: false, motivo: "fora da fila de aprovação" };
  if (aprovacao.estado === "aguardando") {
    return {
      acao: "gravar",
      reentrar: true,
      aprovacao,
      motivo: "aguardando aprovação: a fila recebe o hash da versão nova e a peça continua aguardando",
    };
  }
  if (aprovacao.estado === "refazendo") {
    return {
      acao: "pular",
      motivo:
        "PULADA: a peça está sendo refeita pela fila de aprovação, e gravar agora atropelaria a refação. Rode de novo quando ela voltar a aguardar.",
    };
  }
  if (aprovacao.estado === "aprovada" && !aprovacao.liberadoEm) {
    return {
      acao: "pular",
      motivo:
        "PULADA: a peça está aprovada e ainda não foi liberada; gravar mudaria a versão aprovada e desfaria a aprovação. Decida no painel.",
    };
  }
  return { acao: "gravar", reentrar: false, motivo: `na fila como "${aprovacao.estado}": o hash não decide mais nada` };
}

export type DesfechoDaManutencao =
  | { gravou: false; motivo: string }
  | { gravou: true; filaAtualizada: boolean; motivo: string };

/**
 * Grava a correção e, quando a peça espera aprovação, reentra com a versão nova.
 *
 * A ordem é gravar e depois reentrar, e o hash é RELIDO da tabela da peça
 * (`pecas.ler`), não calculado do que o script pretendia gravar: é o mesmo
 * hash que o painel e o portão vão comparar. O banco não dá transação por
 * PostgREST; se a fila falhar depois da gravação, o desfecho diz isso com
 * todas as letras, para o dono não descobrir pelo botão sumido.
 */
export async function gravarComAFila(args: {
  projeto: ProjetoDaFila;
  ramo: Ramo;
  pecaId: string;
  deps: Pick<DepsDaFila, "store" | "pecas">;
  gravar: () => Promise<string | null>;
}): Promise<DesfechoDaManutencao> {
  const { projeto, ramo, pecaId, deps } = args;
  const decisao = decidirManutencaoNaFila(await deps.store.porPeca(projeto.id, ramo, pecaId));
  if (decisao.acao === "pular") return { gravou: false, motivo: decisao.motivo };

  const erro = await args.gravar();
  if (erro) return { gravou: false, motivo: `NÃO GRAVOU: ${erro}` };
  if (!decisao.reentrar) return { gravou: true, filaAtualizada: false, motivo: decisao.motivo };

  try {
    const peca = await deps.pecas.ler(ramo, pecaId);
    if (!peca) throw new Error("a peça não foi encontrada depois de gravada");
    const a = decisao.aprovacao;
    const linha = await enfileirar(
      projeto,
      { ramo, pecaId, hash: peca.hashAtual, publicarEm: a.publicarEm, avisos: a.avisos, resumo: {} },
      deps as DepsDaFila,
    );
    if (!linha) throw new Error("a fila não devolveu a linha (fila desligada no projeto?)");
    if (linha.hashArtefato !== peca.hashAtual) throw new Error(`a fila ficou com o hash ${linha.hashArtefato.slice(0, 12)}`);
    return { gravou: true, filaAtualizada: true, motivo: `${decisao.motivo} (estado: ${linha.estado})` };
  } catch (e) {
    return {
      gravou: true,
      filaAtualizada: false,
      motivo:
        `GRAVOU, MAS A FILA NÃO FOI ATUALIZADA: ${e instanceof Error ? e.message : String(e)}. ` +
        "A aprovação vai acusar versão diferente até a peça reentrar na fila.",
    };
  }
}
