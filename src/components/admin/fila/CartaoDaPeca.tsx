"use client";

import { useState } from "react";
import {
  ETAPAS_DO_RAMO,
  LIMITE_DE_REFAZIMENTOS,
  MINUTOS_DA_REFACAO,
  ROTULO_DA_ETAPA,
  type Aprovacao,
  type Etapa,
} from "@/lib/server/aprovacao/contrato";
import { agruparAvisos, type AvisoLegivel } from "@/lib/server/aprovacao/avisos-legiveis";
import { acoesDaPeca, filtroDaSituacao, ROTULO_DA_SITUACAO, situacaoDaPeca, type SituacaoDaPeca } from "@/lib/server/aprovacao/situacao";
import type { PreviaDaPeca } from "@/lib/server/aprovacao/previa";
import { CorpoDaNewsletter, CorpoDoArtigo, CorpoDoPlano, CorpoDoPost, type Edicao } from "./CorpoDaPeca";
import { chaveDoDia, COR_DO_FILTRO, fraseDoHorario, horaCurta, NOME_DO_CANAL, rotuloDoDia, type Agir } from "./tipos";

/**
 * Um cartão por peça e por canal (06/10/2026).
 *
 * No celular é uma coluna: o cabeçalho (canal, horário, situação), o que
 * precisa de atenção, a peça e as ações. No computador são duas: a peça à
 * esquerda, e à direita, fixos enquanto a peça rola, os avisos e as ações.
 */

/** O que cada etapa quer dizer, para o dono escolher sem saber o nome interno. */
const AJUDA_DA_ETAPA: Record<Etapa, string> = {
  selecao: "A pauta não devia sair. Troca por outra.",
  texto: "A pauta é boa e o texto não. Reescreve.",
  imagem: "A foto não serve. Procura outra.",
  arte: "A arte ficou ruim. Redesenha com a mesma foto.",
};

function Avisos({ confira, resolvidos }: { confira: AvisoLegivel[]; resolvidos: AvisoLegivel[] }) {
  if (confira.length === 0 && resolvidos.length === 0) return null;
  const codigos = [...confira, ...resolvidos];
  return (
    <div className="space-y-2">
      {confira.length > 0 ? (
        <div className="rounded-2xl border border-[#FBD5D5] bg-[#FEF2F2] p-5 text-[13px] text-[#7F1D1D]" data-avisos="confira">
          <p className="flex items-center gap-2 text-[14px] font-bold text-[#B91C1C]">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {confira.length === 1 ? "1 ponto para você conferir" : `${confira.length} pontos para você conferir`}
          </p>
          <ul className="mt-3 space-y-3">
            {confira.map((v, i) => (
              <li key={i} className="flex gap-2.5 leading-relaxed">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#EF4444]" aria-hidden />
                <span>{v.frase}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {resolvidos.length > 0 ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px] text-slate-700" data-avisos="resolvidos">
          <summary className="cursor-pointer select-none">
            <span className="font-medium">
              {resolvidos.length === 1 ? "1 ajuste automático" : `${resolvidos.length} ajustes automáticos`}
            </span>
            <span className="text-slate-500">{resolvidos.length === 1 ? ": já aplicado, nada a fazer" : ": já aplicados, nada a fazer"}</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
            {resolvidos.map((v, i) => (
              <li key={i}>{v.frase}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer select-none">Detalhes técnicos</summary>
        <ul className="mt-1 space-y-0.5 break-words font-mono">
          {codigos.map((v, i) => (
            <li key={i}>
              {v.codigo}: {v.original}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * O andamento da refação, com palavras (06/10/2026). Mesma régua do cartão
 * anterior: na fila, rodando ou "não dá", e nunca silêncio.
 */
function StatusDaRefacao({ a, modo }: { a: Aprovacao; modo: string }) {
  const r = a.resumo.refacao;
  const pendenteAntiga = a.estado === "refazendo" && !r ? a.resumo.refacaoPendente : null;

  if (a.estado === "refazendo" && r && r.estado !== "impossivel") {
    const minutos = MINUTOS_DA_REFACAO[a.ramo][r.etapa];
    const inicio = r.estado === "rodando" && r.iniciadaEm ? Date.parse(r.iniciadaEm) : Date.parse(r.pedidaEm) + 60_000;
    const previsao = horaCurta(new Date(inicio + minutos * 60_000).toISOString());
    return (
      <div className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-800" data-refacao={r.estado}>
        <p>
          <strong>
            Refazendo {ROTULO_DA_ETAPA[r.etapa].toLowerCase()}, refação {r.tentativa} de {LIMITE_DE_REFAZIMENTOS}.
          </strong>{" "}
          {modo !== "enforce"
            ? "A fila está em ensaio, e no ensaio a refação não roda: a reprovação ficou registrada para o aprendizado."
            : r.estado === "com_o_claude"
              ? "O pedido voltou ao Claude, no MCP. A versão nova entra aqui quando ele reescrever e o worker renderizar."
              : r.estado === "na_fila"
              ? `Começa em até um minuto. Volta por volta de ${previsao} (estimativa).`
              : `Rodando desde ${horaCurta(new Date(inicio).toISOString())}. Volta por volta de ${previsao} (estimativa).`}
        </p>
        <p className="mt-1 text-slate-600">Seu motivo: {r.motivo}</p>
        {r.erro ? <p className="mt-1 text-slate-600">A tentativa anterior falhou e vai de novo: {r.erro}</p> : null}
      </div>
    );
  }

  if (pendenteAntiga) {
    return (
      <p className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-800" data-refacao="antiga">
        Refação pedida antes da refação automática. Antes dizia: {pendenteAntiga}
      </p>
    );
  }

  if ((a.estado === "refazendo" || a.estado === "aguardando") && r?.estado === "impossivel") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800" data-refacao="impossivel">
        <p>
          <strong>Não deu para refazer {ROTULO_DA_ETAPA[r.etapa].toLowerCase()}:</strong> {r.motivoImpossivel}
        </p>
        <p className="mt-1">
          {a.estado === "aguardando"
            ? "A peça voltou como estava: aprove assim, reprove outra etapa ou cancele."
            : "A peça mudou pela metade e não sai assim: cancele."}
        </p>
      </div>
    );
  }

  const ultima = a.resumo.ultimaRefacao;
  return (
    <>
      {a.resumo.substituiu ? (
        <p className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-800">Pauta nova: entrou no lugar de uma peça reprovada na seleção.</p>
      ) : null}
      {ultima && a.estado === "aguardando" ? (
        <p className="rounded-lg bg-slate-100 p-3 text-[13px] text-slate-800" data-refacao="refeita">
          Refeita ({ROTULO_DA_ETAPA[ultima.etapa].toLowerCase()}) às {horaCurta(ultima.em)}: versão nova, confira de novo.
          {ultima.detalhe ? ` ${ultima.detalhe}` : ""}
        </p>
      ) : null}
    </>
  );
}

/**
 * Uma frase sobre onde a peça está e quem decidiu, para a coluna da direita
 * nunca ficar vazia: a newsletter que já saiu mostrava só o espaço em branco,
 * e o dono não sabia se ela tinha saído aprovada ou apesar dele.
 */
function resumoDaSituacao(a: Aprovacao, situacao: SituacaoDaPeca, previa: PreviaDaPeca | undefined, agoraIso: string): string {
  const quem = a.automatica ? "A máquina aprovou" : "Você aprovou";
  const decisao = a.estado === "aprovada" && a.decididoEm ? `${quem} às ${horaCurta(a.decididoEm)}.` : "";
  const horario = fraseDoHorario(a, previa, agoraIso);
  switch (situacao) {
    case "publicada":
      return `${horario.charAt(0).toUpperCase()}${horario.slice(1)}. ${decisao || (a.estado === "aguardando" ? "Saiu sem a sua decisão." : "")}`.trim();
    case "aprovada":
      return `${decisao} ${a.liberadoEm ? "Liberada: o canal publica no horário." : `${horario.charAt(0).toUpperCase()}${horario.slice(1)}.`}`.trim();
    case "aguardando":
      return `Esperando a sua decisão; ${horario}.`;
    case "fora":
      return a.estado === "cancelada" ? "Cancelada: não vai ao ar." : "Descartada: não vai ao ar.";
    default:
      return "";
  }
}

type Painel = "nenhum" | "confirmar" | "reprovar" | "cancelar";

function Acoes({
  a,
  situacao,
  modo,
  confira,
  mudou,
  ocupado,
  agir,
}: {
  a: Aprovacao;
  situacao: SituacaoDaPeca;
  modo: string;
  confira: AvisoLegivel[];
  /** A versão na tabela não é a que entrou na fila: o servidor recusaria a aprovação. */
  mudou: boolean;
  ocupado: boolean;
  agir: Agir;
}) {
  const [painel, setPainel] = useState<Painel>("nenhum");
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [motivo, setMotivo] = useState("");
  const [alvo, setAlvo] = useState<string | null>(null);
  const permitidas = acoesDaPeca(a, situacao, modo);
  const acoes = mudou ? { ...permitidas, aprovar: false } : permitidas;
  const pautasDaEdicao = a.ramo === "newsletter" ? (a.resumo.contexto?.pautas ?? []) : [];
  const precisaDeAlvo = a.ramo === "newsletter" && etapa === "selecao" && pautasDaEdicao.length > 0;
  const nenhuma = !acoes.aprovar && !acoes.reprovar && !acoes.cancelar;
  const ultimaChance = a.refazimentos >= LIMITE_DE_REFAZIMENTOS;

  const aprovar = () =>
    void agir(
      { acao: "aprovar", id: a.id },
      modo === "enforce" ? "Aprovada. Sai no horário dela." : "Aprovada. Decisão registrada (ensaio).",
    ).then((ok) => ok && setPainel("nenhum"));

  return (
    <div className="space-y-3">
      {acoes.nota ? <p className="text-[12px] leading-snug text-slate-500">{acoes.nota}</p> : null}
      {nenhuma ? null : (
        <div className="grid grid-cols-2 gap-2">
          {acoes.aprovar ? (
            <button
              type="button"
              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] px-4 py-3.5 text-[13px] font-bold uppercase tracking-[0.04em] text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.55)] transition hover:bg-black disabled:opacity-45"
              disabled={ocupado}
              onClick={() => (confira.length > 0 ? setPainel("confirmar") : aprovar())}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Aprovar conteúdo
            </button>
          ) : null}
          {acoes.reprovar ? (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] font-semibold text-[#B91C1C] transition hover:border-[#FBD5D5] hover:bg-[#FEF2F2] disabled:opacity-45"
              disabled={ocupado}
              onClick={() => setPainel(painel === "reprovar" ? "nenhum" : "reprovar")}
            >
              Reprovar
            </button>
          ) : null}
          {acoes.cancelar ? (
            <button
              type="button"
              className={`rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-45 ${acoes.reprovar ? "" : "col-span-2"}`}
              disabled={ocupado}
              onClick={() => setPainel(painel === "cancelar" ? "nenhum" : "cancelar")}
            >
              Cancelar peça
            </button>
          ) : null}
        </div>
      )}
      {acoes.aprovar && confira.length === 0 && painel === "nenhum" ? (
        <p className="text-[12px] text-slate-500">O que você vê aqui é o que vai ao ar. Os ajustes automáticos já estão aplicados.</p>
      ) : null}

      {painel === "confirmar" ? (
        <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-900">
          <p>
            <strong>Antes de aprovar:</strong>{" "}
            {confira.length === 1 ? "há 1 ponto para conferir, listado acima." : `há ${confira.length} pontos para conferir, listados acima.`}{" "}
            Aprovar publica a peça exatamente como você está vendo. A lista é só para você conferir: nada dela entra na peça.
          </p>
          <div className="flex gap-2">
            <button type="button" className="admin-botao flex-1" disabled={ocupado} onClick={aprovar}>
              Conferi, aprovar
            </button>
            <button type="button" className="admin-botao-secundario" onClick={() => setPainel("nenhum")}>
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {painel === "reprovar" ? (
        <div className="space-y-3 rounded-lg border border-slate-300 bg-white p-3">
          <p className="text-[13px] text-slate-700">
            O que estava errado? Só essa etapa é refeita, só nesta peça e só neste canal.{" "}
            {ultimaChance
              ? "Esta é a terceira reprovação: a peça será descartada."
              : `Refação ${a.refazimentos + 1} de ${LIMITE_DE_REFAZIMENTOS}.`}
          </p>
          <div className="grid gap-2">
            {ETAPAS_DO_RAMO[a.ramo].map((e) => (
              <button
                key={e}
                type="button"
                className={`rounded-lg border px-3 py-2 text-left text-[13px] ${etapa === e ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}
                aria-pressed={etapa === e}
                onClick={() => setEtapa(e)}
              >
                <span className="block font-semibold">{ROTULO_DA_ETAPA[e]}</span>
                <span className={`block text-[12px] ${etapa === e ? "text-slate-300" : "text-slate-500"}`}>{AJUDA_DA_ETAPA[e]}</span>
              </button>
            ))}
          </div>
          {a.ramo === "newsletter" && etapa && pautasDaEdicao.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[12px] text-slate-600">
                {etapa === "selecao"
                  ? "Qual pauta sai da edição?"
                  : etapa === "imagem"
                    ? "A foto de qual pauta? Sem escolher, todas as fotos são trocadas."
                    : "Alguma pauta em especial? Sem escolher, a edição inteira é reescrita."}
              </p>
              <div className="grid gap-1.5">
                {pautasDaEdicao.map((p) => (
                  <button
                    key={p.storyId}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-[12px] ${alvo === p.storyId ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
                    onClick={() => setAlvo(alvo === p.storyId ? null : p.storyId)}
                  >
                    {p.titulo}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <textarea
            className="admin-campo min-h-24 w-full"
            placeholder="O motivo, em uma ou duas frases. Ele vai para a memória do canal e para o próximo texto."
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
          />
          {modo !== "enforce" ? (
            <p className="text-[12px] text-slate-500">
              A fila está em ensaio: a refação não roda, e a peça segue o horário dela. A reprovação fica registrada e ensina o canal.
            </p>
          ) : null}
          <button
            type="button"
            className="admin-botao w-full"
            disabled={ocupado || !etapa || !motivo.trim() || (precisaDeAlvo && !alvo)}
            onClick={() =>
              void agir(
                { acao: "reprovar", id: a.id, etapa, motivo, ...(alvo ? { alvo } : {}) },
                ultimaChance
                  ? "Reprovada pela terceira vez: a peça foi descartada."
                  : modo === "enforce"
                    ? "Reprovada. A refação começa em até um minuto."
                    : "Reprovada e registrada para o aprendizado (ensaio: sem refação).",
              ).then((ok) => ok && setPainel("nenhum"))
            }
          >
            Reprovar {etapa ? ROTULO_DA_ETAPA[etapa].toLowerCase() : ""}
          </button>
        </div>
      ) : null}

      {painel === "cancelar" ? (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
          <p className="text-[13px] text-slate-700">Cancelar tira a peça do caminho do ar, sem refazer nada. Não tem volta.</p>
          <input
            className="admin-campo w-full"
            placeholder="Por que cancelar"
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
          />
          <button
            type="button"
            className="admin-botao w-full"
            disabled={ocupado || !motivo.trim()}
            onClick={() => void agir({ acao: "cancelar", id: a.id, motivo }, "Peça cancelada.").then((ok) => ok && setPainel("nenhum"))}
          >
            Cancelar esta peça
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CartaoDaPeca({
  a,
  previa,
  modo,
  slug,
  agoraIso,
  ocupado,
  agir,
}: {
  a: Aprovacao;
  previa: PreviaDaPeca | undefined;
  modo: string;
  slug: string;
  agoraIso: string;
  ocupado: boolean;
  agir: Agir;
}) {
  const real = previa && !("ausente" in previa) ? previa : null;
  const situacao = situacaoDaPeca(a, Boolean(real?.noAr));
  const acoes = acoesDaPeca(a, situacao, modo);
  const { confira, resolvidos } = agruparAvisos(a.avisos, a.ramo);
  const mudou = Boolean(real && !real.hashConfere && (acoes.aprovar || acoes.editar || acoes.reprovar));
  const resumo = resumoDaSituacao(a, situacao, previa, agoraIso);

  const edicao: Edicao = {
    rotulo: a.ramo === "newsletter" ? "Assunto" : a.ramo === "artigo" ? "Título" : a.ramo === "plano" ? "Plano" : "Legenda",
    valor: real
      ? real.ramo === "newsletter"
        ? real.assunto
        : real.ramo === "artigo"
          ? real.titulo
          : real.ramo === "plano"
            ? JSON.stringify(real.itens, null, 2)
            : real.legenda
      : (a.resumo.texto ?? ""),
    pode: acoes.editar,
    ocupado,
    salvar: (texto) => agir({ acao: "editar", id: a.id, texto }, "Texto editado: a versão nova voltou para a fila, aguardando você."),
  };

  const corpo = !real ? (
    <p className="rounded-lg bg-slate-100 p-4 text-[13px] text-slate-600">
      {previa && "ausente" in previa
        ? "A peça não está mais na tabela do canal. Cancele para tirá-la da fila."
        : "Não consegui carregar a prévia desta peça. Recarregue a fila."}
    </p>
  ) : real.ramo === "newsletter" ? (
    <CorpoDaNewsletter a={a} previa={real} slug={slug} edicao={edicao} />
  ) : real.ramo === "artigo" ? (
    <CorpoDoArtigo a={a} previa={real} slug={slug} edicao={edicao} />
  ) : real.ramo === "plano" ? (
    <CorpoDoPlano previa={real} edicao={edicao} />
  ) : (
    <CorpoDoPost a={a} previa={real} edicao={edicao} />
  );

  const detalhesDoPost =
    real?.ramo === "post" ? real.formato === "reel" ? "Reel" : real.formato === "carrossel" ? `Carrossel, ${real.telas.length} telas` : "Post único" : null;

  const identidade = !real
    ? { titulo: a.resumo.texto?.split("\n")[0] || NOME_DO_CANAL[a.ramo], linha: "" }
    : real.ramo === "newsletter"
      ? { titulo: real.assunto || "(sem assunto)", linha: real.preheader || "(sem pré-cabeçalho)" }
      : real.ramo === "artigo"
        ? {
            titulo: real.titulo,
            linha: [real.editoria, `${real.palavras} palavras`, `${real.perguntas} ${real.perguntas === 1 ? "pergunta" : "perguntas"} e respostas`]
              .filter(Boolean)
              .join(" · "),
          }
        : real.ramo === "plano"
          ? {
              titulo: "Plano do dia",
              linha: real.canais.map((c) => `${c.itens.length} ${c.canal}`).join(" · "),
            }
          : { titulo: real.manchete, linha: detalhesDoPost ?? "" };
  const cor = COR_DO_FILTRO[filtroDaSituacao(situacao)];
  const dia = rotuloDoDia(chaveDoDia(a.publicarEm ?? a.createdAt), agoraIso);

  return (
    <article
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
      data-ramo={a.ramo}
      data-situacao={situacao}
      data-com-aviso={confira.length > 0}
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <header className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${cor.selo}`}>{ROTULO_DA_SITUACAO[situacao]}</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{dia}</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-slate-600">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" />
              </svg>
              {fraseDoHorario(a, previa, agoraIso)}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-[12px] font-bold text-white">eua</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">eua.journal · {NOME_DO_CANAL[a.ramo]}</p>
              <h3 className="mt-0.5 text-[19px] leading-snug text-slate-900 sm:text-[21px]" style={{ fontWeight: 700 }}>{identidade.titulo}</h3>
              {identidade.linha ? <p className="mt-1 text-[13px] leading-snug text-slate-600">{identidade.linha}</p> : null}
              {a.refazimentos > 0 || a.automatica ? (
                <p className="mt-1.5 text-[12px] text-slate-500">
                  {[a.refazimentos > 0 ? `${a.refazimentos} de ${LIMITE_DE_REFAZIMENTOS} refações usadas` : "", a.automatica ? "aprovada pela máquina" : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
            {a.publicarEm ? <span className="hidden shrink-0 font-mono text-[13px] text-slate-500 sm:block">{horaCurta(a.publicarEm)}</span> : null}
          </div>
        </header>
        <div className="border-t border-slate-100 bg-[#FAFAFA] p-4 sm:p-6">{corpo}</div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
          {resumo ? <p className="px-1 text-[13px] leading-snug text-slate-600" data-resumo>{resumo}</p> : null}
          {mudou ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
              Esta peça foi alterada depois de entrar na fila. O que aparece aqui é a versão de agora, e a aprovação vale para a
              versão registrada, então aprovar seria recusado.{" "}
              {acoes.editar
                ? "Editar o texto registra a versão de agora na fila; reprovar ou cancelar também resolvem."
                : "Reprovar continua registrando a sua decisão para o canal."}
            </p>
          ) : null}
          <Avisos confira={confira} resolvidos={resolvidos} />
          <StatusDaRefacao a={a} modo={modo} />
          {a.motivo && situacao !== "aguardando" && !a.resumo.refacao ? (
            <p className="text-[12px] text-slate-500">
              {a.estado === "cancelada" ? "Cancelada" : a.estado === "descartada" ? "Descartada" : "Registro"}: {a.motivo}
            </p>
          ) : null}
          {real?.ramo === "post" && real.mensagem && situacao !== "publicada" ? (
            <p className="text-[12px] text-slate-500">Na linha do post: {real.mensagem}</p>
          ) : null}
          <Acoes a={a} situacao={situacao} modo={modo} confira={confira} mudou={mudou} ocupado={ocupado} agir={agir} />
      </aside>
    </article>
  );
}
