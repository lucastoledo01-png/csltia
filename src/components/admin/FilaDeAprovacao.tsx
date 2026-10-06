"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROTULO_DA_ETAPA, type Aprovacao, type Ramo } from "@/lib/server/aprovacao/contrato";
import { FILTROS_DE_STATUS, filtroDaSituacao, situacaoDaPeca, type FiltroDeStatus } from "@/lib/server/aprovacao/situacao";
import { CartaoDaPeca } from "./fila/CartaoDaPeca";
import { chaveDoDia, NOME_DO_CANAL, ORDEM_DOS_CANAIS, rotuloDoDia, type Agir, type Visao } from "./fila/tipos";

/**
 * A fila de aprovação, legível (06/10/2026).
 *
 * O dono abriu a versão de 05/10 com as peças do dia e achou confusa: uma
 * coluna só misturando os canais, a matéria e a newsletter representadas pelo
 * pacote factual (os fatos brutos, e não o texto), avisos com código cru em
 * caixa vermelha, nenhum post, e cartão "aprovada" de matéria que já estava
 * no ar com um "Cancelar peça" que não cancelava nada.
 *
 * Agora: um canal por aba, com a contagem do que espera; filtro de situação;
 * as peças na ordem em que vão ao ar, separadas por dia; e cada cartão mostra
 * a peça como ela sai (o e-mail de verdade, a página da matéria, as telas e a
 * legenda do post). O cabeçalho diz se a fila está valendo ou em ensaio,
 * porque é isso que decide se aprovar segura alguma coisa.
 *
 * O componente continua sem decidir nada: toda decisão é um POST para
 * `/api/admin/aprovacao`, e a régua mora em `lib/server/aprovacao`.
 */

const MODO: Record<string, { titulo: string; texto: string; destaque: boolean }> = {
  off: {
    titulo: "Fila desligada",
    texto: "O sistema publica sozinho, como antes, e a fila não registra nada.",
    destaque: false,
  },
  dry_run: {
    titulo: "Ensaio: nada é segurado",
    texto:
      "Cada peça sai no horário dela, aprovada ou não. Suas decisões ficam registradas e ensinam cada canal, mas não mudam o que vai ao ar.",
    destaque: false,
  },
  enforce: {
    titulo: "Valendo: nada sai sem você",
    texto: "A peça aprovada sai no horário dela; aprovada depois do horário, sai na hora. Sem aprovação, não sai.",
    destaque: true,
  },
};

async function postar(url: string, corpo: Record<string, unknown>, metodo = "POST") {
  const r = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok && json.ok !== false, json };
}

function situacaoDe(a: Aprovacao, visao: Visao) {
  const p = visao.previas?.[a.id];
  return situacaoDaPeca(a, Boolean(p && "noAr" in p && p.noAr));
}

/** O botão do lote diz quantas e de quê: "Aprovar 1 sem aviso de artigo" não dizia nem uma coisa nem outra. */
export function rotuloDoLote(canal: Ramo, n: number): string {
  if (canal === "post") return n === 1 ? "Aprovar o post sem aviso" : `Aprovar todos os ${n} posts sem aviso`;
  return n === 1 ? "Aprovar a matéria sem aviso" : `Aprovar todas as ${n} matérias sem aviso`;
}

function canalInicial(visao: Visao): Ramo {
  const comEspera = ORDEM_DOS_CANAIS.find((r) => visao.fila.some((a) => a.ramo === r && situacaoDe(a, visao) === "aguardando"));
  return comEspera ?? "newsletter";
}

export function FilaDeAprovacao({ slug }: { slug: string }) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; ruim: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [canal, setCanal] = useState<Ramo | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeStatus>("aguardando");
  const [confirmarLote, setConfirmarLote] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/aprovacao?projeto=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = (await r.json()) as Visao;
      if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setVisao(json);
      setCanal((atual) => {
        if (atual) return atual;
        const inicial = canalInicial(json);
        // Sem nada aguardando em canal nenhum, abre no filtro que tem peça (o dia já publicado, por exemplo).
        const doCanal = json.fila.filter((a) => a.ramo === inicial).map((a) => filtroDaSituacao(situacaoDe(a, json)));
        if (!doCanal.includes("aguardando")) {
          const comPeca = FILTROS_DE_STATUS.find((f) => doCanal.includes(f.id));
          if (comPeca) setFiltro(comPeca.id);
        }
        return inicial;
      });
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a fila.");
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O recado some sozinho: no celular ele fica por cima do fim da tela.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.ruim ? 12_000 : 6_000);
    return () => clearTimeout(t);
  }, [aviso]);

  /*
   * Enquanto houver refação andando, a tela se atualiza sozinha a cada 20
   * segundos (06/10/2026): a refação roda fora do clique.
   */
  const temRefacaoAndando = Boolean(
    visao?.modo === "enforce" &&
      visao.fila.some((a) => a.estado === "refazendo" && a.resumo.refacao && a.resumo.refacao.estado !== "impossivel"),
  );
  useEffect(() => {
    if (!temRefacaoAndando) return;
    const t = setInterval(() => void carregar(), 20_000);
    return () => clearInterval(t);
  }, [temRefacaoAndando, carregar]);

  const agir: Agir = useCallback(
    async (corpo, sucesso) => {
      setOcupado(true);
      try {
        const r = await postar("/api/admin/aprovacao", { projeto: slug, ...corpo });
        if (!r.ok) {
          const problemas = Array.isArray(r.json.problemas)
            ? (r.json.problemas as Array<{ detalhe: string }>).map((p) => p.detalhe).join("; ")
            : "";
          setAviso({ texto: `Não foi: ${String(r.json.error ?? "recusado")}${problemas ? `. ${problemas}` : ""}`, ruim: true });
          return false;
        }
        const comAviso = Array.isArray(r.json.comAviso) ? (r.json.comAviso as unknown[]).length : 0;
        setAviso({
          texto: comAviso ? `${sucesso} ${comAviso} com aviso ficaram para você decidir uma a uma.` : sucesso,
          ruim: false,
        });
        await carregar();
        return true;
      } finally {
        setOcupado(false);
      }
    },
    [slug, carregar],
  );

  async function trocarModo(ramo: Ramo, modo: "manual" | "automatico") {
    setOcupado(true);
    try {
      const r = await postar("/api/admin/aprovacao/modo", { projeto: slug, ramo, modo }, "PATCH");
      setAviso(r.ok ? { texto: `${NOME_DO_CANAL[ramo]} agora em ${modo}.`, ruim: false } : { texto: `Não foi: ${String(r.json.error)}`, ruim: true });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function decidirRegra(id: string, decisao: "aprovada" | "recusada") {
    setOcupado(true);
    try {
      const r = await postar("/api/admin/aprovacao/regras", { projeto: slug, id, decisao });
      setAviso(r.ok ? { texto: `Regra ${decisao}.`, ruim: false } : { texto: `Não foi: ${String(r.json.error)}`, ruim: true });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const contas = useMemo(() => {
    const porCanal = {} as Record<Ramo, Record<FiltroDeStatus, number>>;
    for (const r of ORDEM_DOS_CANAIS) porCanal[r] = { aguardando: 0, aprovadas: 0, reprovadas: 0, publicadas: 0 };
    for (const a of visao?.fila ?? []) porCanal[a.ramo][filtroDaSituacao(situacaoDe(a, visao!))] += 1;
    return porCanal;
  }, [visao]);

  if (erro) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center p-6">
        <div className="admin-glass max-w-sm p-6 text-center">
          <p className="text-[13px] text-slate-600">{erro}</p>
          <button className="admin-botao mt-4" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }

  if (!visao || !canal) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center">
        <p className="text-xs font-semibold text-slate-500">Carregando a fila...</p>
      </main>
    );
  }

  const agoraIso = visao.agora ?? new Date().toISOString();
  const modo = MODO[visao.modo] ?? { titulo: `Fila em ${visao.modo}`, texto: "", destaque: false };
  const doCanal = visao.fila
    .filter((a) => a.ramo === canal && filtroDaSituacao(situacaoDe(a, visao)) === filtro)
    .sort((x, y) => {
      const t = (a: Aprovacao) => (a.publicarEm ? Date.parse(a.publicarEm) : Date.parse(a.createdAt) || 0);
      // Publicadas: a mais recente primeiro. O resto: na ordem em que vai ao ar.
      return filtro === "publicadas" ? t(y) - t(x) : t(x) - t(y);
    });
  const dias: Array<{ chave: string; itens: Aprovacao[] }> = [];
  for (const a of doCanal) {
    const chave = chaveDoDia(a.publicarEm ?? a.createdAt);
    const grupo = dias.find((d) => d.chave === chave);
    if (grupo) grupo.itens.push(a);
    else dias.push({ chave, itens: [a] });
  }

  /*
   * O lote é o mesmo do servidor (`aprovarEmLote`): só o que aguarda e não
   * tem aviso nenhum, nem resolvido. Peça com aviso é decidida olhando para
   * ela (RF-21), então o botão diz quantas entram e por quê as outras não.
   */
  const semAviso = visao.fila.filter((a) => a.ramo === canal && a.estado === "aguardando" && a.avisos.length === 0).length;
  const comAvisoAguardando = visao.fila.filter((a) => a.ramo === canal && a.estado === "aguardando" && a.avisos.length > 0).length;
  const nomeDoLote = canal === "artigo" ? (semAviso === 1 ? "matéria" : "matérias") : canal === "post" ? (semAviso === 1 ? "post" : "posts") : "";
  const propostas = visao.regras.filter((r) => r.estado === "proposta");
  const fixas = visao.regras.filter((r) => r.estado === "aprovada");

  return (
    <main className="admin-shell min-h-screen pb-24">
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
        <header className="space-y-3">
          <div>
            <Link href={`/admin/${slug}`} className="text-[12px] text-slate-500">
              {visao.projeto?.nome ?? slug}
            </Link>
            <h1 className="text-[22px] font-semibold text-slate-900">Fila de aprovação</h1>
          </div>
          <div
            className={`rounded-xl p-4 ${modo.destaque ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-800"}`}
            data-modo={visao.modo}
          >
            <p className="text-[15px] font-semibold">{modo.titulo}</p>
            <p className={`mt-1 text-[13px] leading-snug ${modo.destaque ? "text-slate-200" : "text-slate-600"}`}>{modo.texto}</p>
            <p className={`mt-2 text-[12px] ${modo.destaque ? "text-slate-300" : "text-slate-500"}`}>
              Newsletter às {visao.horarios.envio}, com lembrete às {visao.horarios.aviso} se ainda não estiver aprovada.
            </p>
          </div>
        </header>
      </div>

      {/* Abas por canal: fixas no topo enquanto a lista rola. */}
      <nav className="sticky top-0 z-20 mt-4 border-b border-slate-200 bg-white/95 backdrop-blur" aria-label="Canais">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-3" role="tablist">
            {ORDEM_DOS_CANAIS.map((r) => {
              const n = contas[r].aguardando;
              const ativo = r === canal;
              return (
                <button
                  key={r}
                  role="tab"
                  aria-selected={ativo}
                  className={`relative flex items-center justify-center gap-1.5 py-3 text-[14px] ${ativo ? "font-semibold text-slate-900" : "text-slate-500"}`}
                  onClick={() => {
                    setCanal(r);
                    setConfirmarLote(false);
                    // Aba nova abre no primeiro filtro que tem peça, para não abrir vazia por acaso.
                    if (contas[r][filtro] === 0) {
                      const comPeca = FILTROS_DE_STATUS.find((f) => contas[r][f.id] > 0);
                      if (comPeca) setFiltro(comPeca.id);
                    }
                  }}
                >
                  {NOME_DO_CANAL[r]}
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-[11px] font-semibold leading-5 ${n > 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}
                    aria-label={`${n} aguardando`}
                  >
                    {n}
                  </span>
                  {ativo ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded bg-slate-900" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-4 sm:px-6">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]" role="group" aria-label="Situação">
          {FILTROS_DE_STATUS.map((f) => {
            const n = contas[canal][f.id];
            const ativo = f.id === filtro;
            return (
              <button
                key={f.id}
                aria-pressed={ativo}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${ativo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                onClick={() => setFiltro(f.id)}
              >
                {f.rotulo} <span className={ativo ? "text-slate-300" : "text-slate-400"}>{n}</span>
              </button>
            );
          })}
        </div>

        {filtro === "aguardando" && canal !== "newsletter" && semAviso > 0 ? (
          <div className="admin-glass space-y-2 p-3">
            {!confirmarLote ? (
              <button className="admin-botao-secundario w-full" disabled={ocupado} onClick={() => setConfirmarLote(true)}>
                {rotuloDoLote(canal, semAviso)}
              </button>
            ) : (
              <>
                <p className="text-[13px] text-slate-700">
                  Aprovar de uma vez {semAviso} {nomeDoLote} sem nenhum aviso?
                  {comAvisoAguardando > 0
                    ? ` ${comAvisoAguardando} com aviso ficam de fora: essas você aprova uma a uma, olhando.`
                    : ""}
                </p>
                <div className="flex gap-2">
                  <button
                    className="admin-botao flex-1"
                    disabled={ocupado}
                    onClick={() =>
                      void agir(
                        { acao: "lote", ramo: canal },
                        `Lote aprovado: ${semAviso} ${nomeDoLote}.`,
                      ).then(() => setConfirmarLote(false))
                    }
                  >
                    Aprovar {semAviso}
                  </button>
                  <button className="admin-botao-secundario" onClick={() => setConfirmarLote(false)}>
                    Voltar
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {dias.length === 0 ? (
          <div className="admin-glass p-5 text-[14px] text-slate-600" data-vazio={canal}>
            {canal === "post" && visao.instagram && Object.values(contas.post).every((n) => n === 0) ? (
              <div className="space-y-2">
                <p className="font-semibold text-slate-900">Nenhum post na fila.</p>
                <p>{visao.instagram.frase}</p>
                {visao.instagram.detalhes.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-500">
                    {visao.instagram.detalhes.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p>
                Nenhuma peça {FILTROS_DE_STATUS.find((f) => f.id === filtro)?.descricao} em {NOME_DO_CANAL[canal]} nos últimos três dias.
              </p>
            )}
          </div>
        ) : (
          dias.map((d) => (
            <section key={d.chave} className="space-y-3">
              <h2 className="pt-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">{rotuloDoDia(d.chave, agoraIso)}</h2>
              {d.itens.map((a) => (
                <CartaoDaPeca
                  key={`${a.id}:${a.hashArtefato}`}
                  a={a}
                  previa={visao.previas?.[a.id]}
                  modo={visao.modo}
                  slug={slug}
                  agoraIso={agoraIso}
                  ocupado={ocupado}
                  agir={agir}
                />
              ))}
            </section>
          ))
        )}

        <details className="admin-glass p-4">
          <summary className="cursor-pointer select-none text-[14px] font-semibold text-slate-900">Manual ou automático, por canal</summary>
          <div className="mt-3 space-y-3">
            {ORDEM_DOS_CANAIS.map((ramo) => {
              const t = visao.taxa.find((x) => x.ramo === ramo);
              return (
                <div key={ramo} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                  <span className="w-24 text-[13px] font-medium text-slate-800">{NOME_DO_CANAL[ramo]}</span>
                  <span className="text-[12px] text-slate-500">
                    {t && t.taxa !== null
                      ? `${Math.round(t.taxa * 100)}% aprovadas de primeira (${t.dePrimeira} de ${t.decididas}, 30 dias)`
                      : "nenhuma decisão nos últimos 30 dias"}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button
                      className={visao.ramos[ramo] === "manual" ? "admin-botao" : "admin-botao-secundario"}
                      disabled={ocupado || visao.ramos[ramo] === "manual"}
                      onClick={() => void trocarModo(ramo, "manual")}
                    >
                      Manual
                    </button>
                    <button
                      className={visao.ramos[ramo] === "automatico" ? "admin-botao" : "admin-botao-secundario"}
                      disabled={ocupado || visao.ramos[ramo] === "automatico"}
                      onClick={() => {
                        if (window.confirm(`Ligar o automático em ${NOME_DO_CANAL[ramo]}? A máquina aprova o que vier sem aviso.`)) {
                          void trocarModo(ramo, "automatico");
                        }
                      }}
                    >
                      Automático
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="text-[12px] text-slate-500">No automático a máquina aprova sozinha a peça sem aviso nenhum. Peça com aviso sempre espera você.</p>
          </div>
        </details>

        {propostas.length > 0 || fixas.length > 0 ? (
          <section className="admin-glass space-y-3 p-4">
            <h2 className="text-[14px] font-semibold text-slate-900">Memória de reprovação</h2>
            {propostas.map((r) => (
              <div key={r.id} className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <p className="text-[13px] text-slate-800">
                  <strong>Proposta</strong> ({r.ramo ? `${NOME_DO_CANAL[r.ramo]}, ` : ""}
                  {ROTULO_DA_ETAPA[r.etapa]}, {r.ocorrencias} vezes): {r.regra}
                </p>
                <ul className="list-disc pl-5 text-[12px] text-slate-500">
                  {r.exemplos.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button className="admin-botao" disabled={ocupado} onClick={() => void decidirRegra(r.id, "aprovada")}>
                    Virar regra
                  </button>
                  <button className="admin-botao-secundario" disabled={ocupado} onClick={() => void decidirRegra(r.id, "recusada")}>
                    Recusar
                  </button>
                </div>
              </div>
            ))}
            {fixas.map((r) => (
              <p key={r.id} className="text-[12px] text-slate-600">
                Regra fixa ({r.ramo ? `${NOME_DO_CANAL[r.ramo]}, ` : ""}
                {ROTULO_DA_ETAPA[r.etapa]}): {r.regra}
              </p>
            ))}
          </section>
        ) : null}
      </div>

      {aviso ? (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm" role="status">
          <div
            className={`rounded-xl px-4 py-3 text-[13px] shadow-lg ${aviso.ruim ? "bg-rose-700 text-white" : "bg-slate-900 text-white"}`}
          >
            <div className="flex items-start gap-3">
              <p className="flex-1">{aviso.texto}</p>
              <button className="text-white/70" aria-label="Fechar" onClick={() => setAviso(null)}>
                ×
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
