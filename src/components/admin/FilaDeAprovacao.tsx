"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ETAPAS_DO_RAMO,
  LIMITE_DE_REFAZIMENTOS,
  MINUTOS_DA_REFACAO,
  ROTULO_DA_ETAPA,
  type Aprovacao,
  type Etapa,
  type Ramo,
} from "@/lib/server/aprovacao/contrato";

/**
 * A fila de aprovação no celular (RF-24), 05/10/2026.
 *
 * A peça renderizada, o pacote factual e os avisos no mesmo cartão, e o botão
 * de aprovar à vista: abrir a página e tocar em Aprovar são dois toques. Peça
 * com aviso de QA pede um terceiro, de confirmação, e vem no topo da fila,
 * porque é a peça em que o olhar humano vale mais (RF-21).
 *
 * O componente não decide nada: toda decisão é um POST para
 * `/api/admin/aprovacao`, e a resposta de recusa aparece com a frase do
 * servidor. A régua mora em `lib/server/aprovacao`, não aqui.
 */

type Taxa = { ramo: Ramo; decididas: number; dePrimeira: number; taxa: number | null };
type Regra = { id: string; etapa: Etapa; regra: string; ocorrencias: number; exemplos: string[]; estado: string };
type Visao = {
  ok: boolean;
  error?: string;
  projeto?: { slug: string; nome: string };
  modo: string;
  ramos: Record<Ramo, "manual" | "automatico">;
  horarios: { aviso: string; envio: string };
  fila: Aprovacao[];
  taxa: Taxa[];
  regras: Regra[];
};

const ROTULO_DO_RAMO: Record<Ramo, string> = { newsletter: "Newsletter", artigo: "Artigo", post: "Post" };
const ROTULO_DO_MODO: Record<string, string> = {
  off: "desligada: o sistema publica sozinho, como antes",
  dry_run: "em ensaio: registra a fila, mas não segura nada",
  enforce: "valendo: nada sai sem aprovação",
};

function hora(iso: string | null): string {
  if (!iso) return "sem horário";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function postar(url: string, corpo: Record<string, unknown>, metodo = "POST") {
  const r = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok && json.ok !== false, json };
}

export function FilaDeAprovacao({ slug }: { slug: string }) {
  const [visao, setVisao] = useState<Visao | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/aprovacao?projeto=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = (await r.json()) as Visao;
      if (!r.ok || !json.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setVisao(json);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a fila.");
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /*
   * Enquanto houver refação na fila ou rodando, a tela se atualiza sozinha a
   * cada 20 segundos (06/10/2026): a refação roda fora do clique, e o dono não
   * pode ficar recarregando para saber se a peça voltou.
   */
  const temRefacaoAndando = Boolean(
    visao?.fila.some((a) => a.estado === "refazendo" && a.resumo.refacao && a.resumo.refacao.estado !== "impossivel"),
  );
  useEffect(() => {
    if (!temRefacaoAndando) return;
    const t = setInterval(() => void carregar(), 20_000);
    return () => clearInterval(t);
  }, [temRefacaoAndando, carregar]);

  async function agir(corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    setAviso("");
    try {
      const r = await postar("/api/admin/aprovacao", { projeto: slug, ...corpo });
      if (!r.ok) {
        const problemas = Array.isArray(r.json.problemas)
          ? (r.json.problemas as Array<{ detalhe: string }>).map((p) => p.detalhe).join("; ")
          : "";
        setAviso(`Não: ${String(r.json.error ?? "recusado")}${problemas ? `. ${problemas}` : ""}`);
      } else {
        const comAviso = Array.isArray(r.json.comAviso) ? (r.json.comAviso as unknown[]).length : 0;
        setAviso(comAviso ? `${sucesso} ${comAviso} peça(s) com aviso ficaram para decidir uma a uma.` : sucesso);
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function trocarModo(ramo: Ramo, modo: "manual" | "automatico") {
    setOcupado(true);
    try {
      const r = await postar("/api/admin/aprovacao/modo", { projeto: slug, ramo, modo }, "PATCH");
      setAviso(r.ok ? `${ROTULO_DO_RAMO[ramo]} agora em ${modo}.` : `Não: ${String(r.json.error)}`);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function decidirRegra(id: string, decisao: "aprovada" | "recusada") {
    setOcupado(true);
    try {
      const r = await postar("/api/admin/aprovacao/regras", { projeto: slug, id, decisao });
      setAviso(r.ok ? `Regra ${decisao}.` : `Não: ${String(r.json.error)}`);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

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

  if (!visao) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center">
        <p className="text-xs font-semibold text-slate-500">Carregando a fila...</p>
      </main>
    );
  }

  const aguardando = visao.fila.filter((a) => a.estado === "aguardando");
  const propostas = visao.regras.filter((r) => r.estado === "proposta");
  const fixas = visao.regras.filter((r) => r.estado === "aprovada");

  return (
    <main className="admin-shell min-h-screen px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="space-y-1">
          <Link href={`/admin/${slug}`} className="text-[11px] text-slate-400">
            {visao.projeto?.nome ?? slug}
          </Link>
          <h1 className="text-[20px] font-semibold text-slate-900">Fila de aprovação</h1>
          <p className="text-[12px] text-slate-500">
            Fila {ROTULO_DO_MODO[visao.modo] ?? visao.modo}. Newsletter sai às {visao.horarios.envio} se aprovada; aviso
            às {visao.horarios.aviso}.
          </p>
        </header>

        {aviso ? (
          <p role="status" className="admin-glass p-3 text-[13px] text-slate-700">
            {aviso}
          </p>
        ) : null}

        <section className="admin-glass space-y-3 p-4">
          <h2 className="text-[13px] font-semibold text-slate-900">Por ramo</h2>
          {(["newsletter", "artigo", "post"] as Ramo[]).map((ramo) => {
            const t = visao.taxa.find((x) => x.ramo === ramo);
            const pendentes = aguardando.filter((a) => a.ramo === ramo);
            const semAviso = pendentes.filter((a) => a.avisos.length === 0).length;
            return (
              <div key={ramo} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <span className="w-24 text-[13px] font-medium text-slate-800">{ROTULO_DO_RAMO[ramo]}</span>
                <span className="text-[11px] text-slate-500">
                  {t && t.taxa !== null
                    ? `${Math.round(t.taxa * 100)}% aprovadas sem retrabalho (${t.dePrimeira}/${t.decididas}, 30 dias)`
                    : "sem decisões nos últimos 30 dias"}
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
                      if (window.confirm(`Ligar o automático em ${ROTULO_DO_RAMO[ramo]}? A máquina aprova o que vier sem aviso.`)) {
                        void trocarModo(ramo, "automatico");
                      }
                    }}
                  >
                    Automático
                  </button>
                </div>
                {semAviso > 0 ? (
                  <button
                    className="admin-botao-secundario w-full"
                    disabled={ocupado}
                    onClick={() => void agir({ acao: "lote", ramo }, `${ROTULO_DO_RAMO[ramo]}: lote aprovado.`)}
                  >
                    Aprovar {semAviso} sem aviso de {ROTULO_DO_RAMO[ramo].toLowerCase()}
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>

        {visao.fila.length === 0 ? (
          <p className="text-center text-[13px] text-slate-500">Nada na fila.</p>
        ) : (
          visao.fila.map((a) => <Cartao key={a.id} a={a} ocupado={ocupado} agir={agir} />)
        )}

        {propostas.length > 0 || fixas.length > 0 ? (
          <section className="admin-glass space-y-3 p-4">
            <h2 className="text-[13px] font-semibold text-slate-900">Memória de reprovação</h2>
            {propostas.map((r) => (
              <div key={r.id} className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <p className="text-[13px] text-slate-800">
                  <strong>Proposta</strong> ({ROTULO_DA_ETAPA[r.etapa]}, {r.ocorrencias} vezes): {r.regra}
                </p>
                <ul className="list-disc pl-5 text-[11px] text-slate-500">
                  {r.exemplos.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button className="admin-botao" disabled={ocupado} onClick={() => void decidirRegra(r.id, "aprovada")}>
                    Virar regra
                  </button>
                  <button
                    className="admin-botao-secundario"
                    disabled={ocupado}
                    onClick={() => void decidirRegra(r.id, "recusada")}
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
            {fixas.map((r) => (
              <p key={r.id} className="text-[12px] text-slate-600">
                Regra fixa ({ROTULO_DA_ETAPA[r.etapa]}): {r.regra}
              </p>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}

type Painel = "nenhum" | "reprovar" | "editar" | "cancelar" | "confirmar";

function Cartao({
  a,
  ocupado,
  agir,
}: {
  a: Aprovacao;
  ocupado: boolean;
  agir: (corpo: Record<string, unknown>, sucesso: string) => Promise<void>;
}) {
  const [painel, setPainel] = useState<Painel>("nenhum");
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState(a.resumo.texto ?? "");
  const [alvo, setAlvo] = useState<string | null>(null);
  const comAviso = a.avisos.length > 0;
  const pautasDaEdicao = a.ramo === "newsletter" ? (a.resumo.contexto?.pautas ?? []) : [];
  const precisaDeAlvo = a.ramo === "newsletter" && etapa === "selecao" && pautasDaEdicao.length > 0;
  const imagem = a.resumo.imagens?.[0];

  return (
    <article className="admin-glass overflow-hidden" data-com-aviso={comAviso}>
      {comAviso ? (
        <div className="bg-red-50 px-4 py-2 text-[12px] text-red-800">
          <strong>Aviso de QA.</strong>
          <ul className="mt-1 list-disc pl-5">
            {a.avisos.map((v, i) => (
              <li key={i}>
                {v.codigo}: {v.detalhe}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{ROTULO_DO_RAMO[a.ramo]}</span>
          <span>{hora(a.publicarEm)}</span>
          <span data-estado={a.estado}>{ROTULO_DO_ESTADO[a.estado] ?? a.estado}</span>
          {a.refazimentos > 0 ? (
            <span>
              {a.refazimentos} de {LIMITE_DE_REFAZIMENTOS} refações usadas
            </span>
          ) : null}
          {a.automatica ? <span>aprovada pela máquina</span> : null}
        </div>

        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} alt="" className="aspect-[3/4] w-full rounded object-cover" loading="lazy" />
        ) : null}

        {a.resumo.titulo ? <h3 className="text-[15px] font-semibold text-slate-900">{a.resumo.titulo}</h3> : null}
        {a.resumo.texto && a.resumo.texto !== a.resumo.titulo ? (
          <p className="whitespace-pre-line text-[13px] text-slate-700">{a.resumo.texto}</p>
        ) : null}

        {a.resumo.pacoteFactual && a.resumo.pacoteFactual.length > 0 ? (
          <details className="text-[12px] text-slate-600">
            <summary className="cursor-pointer">Pacote factual</summary>
            <ul className="mt-1 list-disc pl-5">
              {a.resumo.pacoteFactual.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <StatusDaRefacao a={a} />
        {a.motivo && a.estado !== "aguardando" && !a.resumo.refacao ? <p className="text-[12px] text-slate-500">Motivo: {a.motivo}</p> : null}

        {a.estado === "aguardando" ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              className="admin-botao col-span-2 py-3 text-[15px]"
              disabled={ocupado}
              onClick={() => (comAviso ? setPainel("confirmar") : void agir({ acao: "aprovar", id: a.id }, "Aprovada."))}
            >
              Aprovar
            </button>
            <button className="admin-botao-secundario" disabled={ocupado} onClick={() => setPainel("reprovar")}>
              Reprovar
            </button>
            <button className="admin-botao-secundario" disabled={ocupado} onClick={() => setPainel("editar")}>
              Editar texto
            </button>
            <button className="admin-botao-secundario col-span-2" disabled={ocupado} onClick={() => setPainel("cancelar")}>
              Cancelar peça
            </button>
          </div>
        ) : a.estado === "aprovada" || a.estado === "refazendo" ? (
          <button className="admin-botao-secundario w-full" disabled={ocupado} onClick={() => setPainel("cancelar")}>
            Cancelar peça
          </button>
        ) : null}

        {painel === "confirmar" ? (
          <div className="space-y-2 rounded bg-red-50 p-3">
            <p className="text-[12px] text-red-800">Esta peça tem aviso de QA. Aprovar assim mesmo?</p>
            <button
              className="admin-botao w-full"
              disabled={ocupado}
              onClick={() => void agir({ acao: "aprovar", id: a.id }, "Aprovada com aviso.").then(() => setPainel("nenhum"))}
            >
              Aprovar com aviso
            </button>
          </div>
        ) : null}

        {painel === "reprovar" ? (
          <div className="space-y-2">
            <p className="text-[12px] text-slate-600">
              Qual etapa errou? Só ela é refeita, só nesta peça.{" "}
              {a.refazimentos >= LIMITE_DE_REFAZIMENTOS
                ? "Esta é a terceira reprovação: a peça será descartada."
                : `Refação ${a.refazimentos + 1} de ${LIMITE_DE_REFAZIMENTOS}.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {ETAPAS_DO_RAMO[a.ramo].map((e) => (
                <button
                  key={e}
                  className={etapa === e ? "admin-botao" : "admin-botao-secundario"}
                  onClick={() => setEtapa(e)}
                >
                  {ROTULO_DA_ETAPA[e]}
                </button>
              ))}
            </div>
            {a.ramo === "newsletter" && etapa && pautasDaEdicao.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[12px] text-slate-600">
                  {etapa === "selecao"
                    ? "Qual pauta sai da edição?"
                    : etapa === "imagem"
                      ? "A foto de qual pauta? Sem escolher, todas as fotos são trocadas."
                      : "Alguma pauta em especial? Sem escolher, a edição inteira é reescrita."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pautasDaEdicao.map((p) => (
                    <button
                      key={p.storyId}
                      className={alvo === p.storyId ? "admin-botao" : "admin-botao-secundario"}
                      onClick={() => setAlvo(alvo === p.storyId ? null : p.storyId)}
                    >
                      {p.titulo.slice(0, 60)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <textarea
              className="admin-campo min-h-20 w-full"
              placeholder="O que estava errado (vai para a memória e para o próximo prompt)"
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
            />
            <button
              className="admin-botao w-full"
              disabled={ocupado || !etapa || !motivo.trim() || (precisaDeAlvo && !alvo)}
              onClick={() =>
                void agir(
                  { acao: "reprovar", id: a.id, etapa, motivo, ...(alvo ? { alvo } : {}) },
                  a.refazimentos + 1 > LIMITE_DE_REFAZIMENTOS
                    ? "Reprovada pela terceira vez: a peça foi descartada."
                    : "Reprovada. A refação entrou na fila e começa em até um minuto.",
                ).then(() => setPainel("nenhum"))
              }
            >
              Reprovar {etapa ? ROTULO_DA_ETAPA[etapa].toLowerCase() : ""}
            </button>
          </div>
        ) : null}

        {painel === "editar" ? (
          <div className="space-y-2">
            <textarea className="admin-campo min-h-32 w-full" value={texto} onChange={(ev) => setTexto(ev.target.value)} />
            <p className="text-[11px] text-slate-500">
              O texto passa pela guarda antes de voltar à fila, e volta como versão nova, aguardando aprovação.
            </p>
            <button
              className="admin-botao w-full"
              disabled={ocupado}
              onClick={() => void agir({ acao: "editar", id: a.id, texto }, "Texto editado.").then(() => setPainel("nenhum"))}
            >
              Salvar texto
            </button>
          </div>
        ) : null}

        {painel === "cancelar" ? (
          <div className="space-y-2">
            <input
              className="admin-campo w-full"
              placeholder="Por que cancelar"
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
            />
            <button
              className="admin-botao w-full"
              disabled={ocupado || !motivo.trim()}
              onClick={() => void agir({ acao: "cancelar", id: a.id, motivo }, "Cancelada.").then(() => setPainel("nenhum"))}
            >
              Cancelar esta peça
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

const ROTULO_DO_ESTADO: Record<string, string> = {
  aguardando: "aguardando",
  aprovada: "aprovada",
  refazendo: "refazendo",
  reprovada: "reprovada",
  descartada: "descartada",
  cancelada: "cancelada",
};

function horaCurta(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

/**
 * O andamento da refação, com palavras (06/10/2026).
 *
 * Três estados e nenhum silêncio: na fila (começa em até um minuto, volta por
 * volta de tal hora), rodando (desde quando, previsão) e "não dá para refazer",
 * com o motivo e o que fazer. A previsão é estimativa por etapa
 * (`MINUTOS_DA_REFACAO`), e a tela diz que é.
 */
function StatusDaRefacao({ a }: { a: Aprovacao }) {
  const r = a.resumo.refacao;
  const pendenteAntiga = a.estado === "refazendo" && !r ? a.resumo.refacaoPendente : null;

  if (a.estado === "refazendo" && r && r.estado !== "impossivel") {
    const minutos = MINUTOS_DA_REFACAO[a.ramo][r.etapa];
    const inicio = r.estado === "rodando" && r.iniciadaEm ? Date.parse(r.iniciadaEm) : Date.parse(r.pedidaEm) + 60_000;
    const previsao = horaCurta(inicio + minutos * 60_000);
    return (
      <div className="rounded bg-sky-50 p-2 text-[12px] text-sky-900" data-refacao={r.estado}>
        <p>
          <strong>
            Refazendo {ROTULO_DA_ETAPA[r.etapa].toLowerCase()}, refação {r.tentativa} de {LIMITE_DE_REFAZIMENTOS}.
          </strong>{" "}
          {r.estado === "na_fila"
            ? `Na fila: começa em até um minuto. Previsão de volta: por volta de ${previsao}.`
            : `Rodando desde ${horaCurta(inicio)}. Previsão de volta: por volta de ${previsao}.`}
        </p>
        <p className="mt-1 text-sky-800">Motivo: {r.motivo}</p>
        {r.erro ? <p className="mt-1 text-sky-800">A tentativa anterior falhou e vai de novo: {r.erro}</p> : null}
      </div>
    );
  }

  if (pendenteAntiga) {
    // Reprovada antes de 06/10/2026, quando a refação ficava parada: o relógio a pega no próximo giro.
    return (
      <div className="rounded bg-sky-50 p-2 text-[12px] text-sky-900" data-refacao="antiga">
        <p>
          <strong>Refação pedida antes da refação automática.</strong> Entra na fila no próximo minuto. Antes dizia:{" "}
          {pendenteAntiga}
        </p>
      </div>
    );
  }

  if ((a.estado === "refazendo" || a.estado === "aguardando") && r?.estado === "impossivel") {
    return (
      <div className="rounded bg-amber-50 p-2 text-[12px] text-amber-900" data-refacao="impossivel">
        <p>
          <strong>Não dá para refazer {ROTULO_DA_ETAPA[r.etapa].toLowerCase()}:</strong> {r.motivoImpossivel}
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
        <p className="rounded bg-emerald-50 p-2 text-[12px] text-emerald-900">
          Pauta nova: entrou no lugar de uma peça reprovada na seleção.
        </p>
      ) : null}
      {ultima && a.estado === "aguardando" ? (
        <p className="rounded bg-emerald-50 p-2 text-[12px] text-emerald-900" data-refacao="refeita">
          Refeita ({ROTULO_DA_ETAPA[ultima.etapa].toLowerCase()}) às {horaCurta(Date.parse(ultima.em))}: versão nova, confira de
          novo.{ultima.detalhe ? ` ${ultima.detalhe}` : ""}
        </p>
      ) : null}
    </>
  );
}
