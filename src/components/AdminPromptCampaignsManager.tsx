"use client";

import { useEffect, useState } from "react";
import { normalizeKeyword, validateKeyword } from "@/lib/prompt-system/keyword";
import {
  CAMPAIGN_FORMATS,
  CAMPAIGN_STATUSES,
  statusLabel,
} from "@/lib/prompt-system/vocabulary";

/**
 * Sistema PROMPT — registro de campanhas (Fase 0).
 *
 * O painel só registra e acompanha: nada aqui publica no Instagram nem cria
 * automação no OpenReply. É o gatilho manual que permite levar uma campanha de
 * ponta a ponta à mão antes de existir qualquer automação de ideação.
 */

type Campaign = {
  id: string;
  keyword: string;
  campaignType: string;
  theme: string;
  format: string;
  status: string;
  source: string;
  igMediaId: string | null;
  openReplyAutomationId: string | null;
  lpUrl: string | null;
  followUpEnabled: boolean;
  createdAt: string;
  publishedAt: string | null;
};

/** Cor por status; um status novo vindo do banco cai no neutro. */
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  ready: "bg-indigo-100 text-indigo-700",
  published: "bg-emerald-100 text-emerald-700",
  blocked: "bg-rose-100 text-rose-700",
  archived: "bg-slate-200 text-slate-500",
};

/**
 * Mesma regra do servidor: o botão só aparece quando não há nada externo
 * apontando para a campanha. A rota confere de novo — isto é só a tela.
 */
function podeRemover(c: Campaign): boolean {
  if (c.status === "published" || c.status === "archived") return false;
  return c.igMediaId === null && c.openReplyAutomationId === null;
}

function statusStyle(status: string): string {
  return STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600";
}

const emptyDraft = { keyword: "", theme: "", format: "prompt", lp_url: "" };

/** O que é mostrado embaixo do campo, derivado a cada render. */
type KeywordCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "free" }
  | { state: "taken"; conflictTheme: string }
  | { state: "invalid"; error: string };

/**
 * Resultado da última checagem que voltou do servidor, carimbado com a keyword
 * a que se refere. É o carimbo que impede uma resposta lenta de uma keyword já
 * apagada de sobrescrever o veredito da que está na tela.
 */
type RemoteCheck = { keyword: string } & (
  | { state: "free" }
  | { state: "taken"; conflictTheme: string }
  | { state: "error"; error: string }
);

type FetchResult =
  | { ok: true; campaigns: Campaign[] }
  | { ok: false; error: string };

async function fetchCampaigns(): Promise<FetchResult> {
  try {
    const res = await fetch("/api/admin/prompt-campaigns");
    const json = await res.json();
    if (json.ok) return { ok: true, campaigns: json.campaigns };
    return { ok: false, error: json.error ?? "Erro ao carregar campanhas." };
  } catch {
    return { ok: false, error: "Erro de conexão ao carregar campanhas." };
  }
}

export function AdminPromptCampaignsManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteCheck | null>(null);

  // O formato é decidido a cada render, sem estado: a única coisa que precisa
  // de ida ao servidor é saber se a keyword já está em uso.
  const validation = draft.keyword ? validateKeyword(draft.keyword) : null;
  const canonical = validation?.ok ? validation.keyword : null;
  const keywordCheck = describeKeyword(draft.keyword, validation, canonical, remote);

  function aplicar(resultado: FetchResult) {
    if (resultado.ok) setCampaigns(resultado.campaigns);
    else setError(resultado.error);
    setLoading(false);
  }

  async function load() {
    aplicar(await fetchCampaigns());
  }

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const resultado = await fetchCampaigns();
      if (!cancelado) aplicar(resultado);
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  // Checagem de disponibilidade com respiro entre teclas.
  useEffect(() => {
    if (!canonical) return;

    let cancelado = false;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/prompt-campaigns/keyword?keyword=${encodeURIComponent(canonical)}`,
        );
        const json = await res.json();
        if (cancelado) return;

        if (json.ok && json.available) setRemote({ keyword: canonical, state: "free" });
        else if (json.ok) {
          setRemote({
            keyword: canonical,
            state: "taken",
            conflictTheme: json.conflict?.theme || "sem tema",
          });
        } else {
          setRemote({ keyword: canonical, state: "error", error: json.error ?? "Erro ao checar." });
        }
      } catch {
        if (!cancelado) {
          setRemote({
            keyword: canonical,
            state: "error",
            error: "Erro de conexão ao checar a keyword.",
          });
        }
      }
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [canonical]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/prompt-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Erro ao registrar campanha.");
        return;
      }
      setDraft(emptyDraft);
      setRemote(null);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(campaign: Campaign, status: string) {
    setError(null);
    const res = await fetch(`/api/admin/prompt-campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "Erro ao mudar o status.");
      return;
    }
    setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? json.campaign : c)));
  }

  async function handleDelete(campaign: Campaign) {
    if (!confirm(`Remover a campanha ${campaign.keyword}?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/prompt-campaigns/${campaign.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "Erro ao remover campanha.");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando campanhas...</div>;
  }

  const canSubmit = keywordCheck.state === "free" && !saving;

  return (
    <div className="space-y-6">
      <div className="admin-glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <h3 className="text-2xl text-slate-900">Sistema PROMPT</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cada campanha é uma publicação do funil, identificada por uma keyword exclusiva — o que
            a pessoa comenta no post e o que amarra comentário, Direct, clique e cadastro.
            {" "}<strong className="font-semibold text-slate-600">Fase 0:</strong> o registro é
            manual e a checagem de keyword confere só o histórico daqui. A automação no OpenReply
            entra na Fase 1.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
        >
          {showForm ? "Cancelar" : "+ Nova Campanha"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={handleCreate} className="admin-glass space-y-4 rounded-3xl p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Keyword (só letras e números)
              </label>
              <input
                required
                value={draft.keyword}
                onChange={(e) => setDraft({ ...draft, keyword: normalizeKeyword(e.target.value) })}
                placeholder="ex: GTA26"
                maxLength={20}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 font-mono text-sm uppercase focus:border-indigo-500 focus:outline-none"
              />
              <KeywordHint check={keywordCheck} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Tema
              </label>
              <input
                value={draft.theme}
                onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
                placeholder="ex: Retrato estilo pôster de GTA"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Formato
              </label>
              <select
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {CAMPAIGN_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                URL da landing (opcional)
              </label>
              <input
                value={draft.lp_url}
                onChange={(e) => setDraft({ ...draft, lp_url: e.target.value })}
                placeholder="/ultraprompts/GTA26"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Registrando..." : "Registrar campanha"}
          </button>
        </form>
      ) : null}

      {campaigns.length === 0 ? (
        <div className="admin-glass rounded-3xl p-10 text-center text-sm text-slate-500">
          Nenhuma campanha registrada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="admin-glass flex flex-wrap items-start justify-between gap-4 rounded-3xl p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                    {campaign.keyword}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusStyle(campaign.status)}`}
                  >
                    {statusLabel(campaign.status)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {campaign.format} · {campaign.source}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {campaign.theme || <span className="text-slate-400">Sem tema</span>}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Criada em {new Date(campaign.createdAt).toLocaleDateString("pt-BR")}
                  {campaign.publishedAt
                    ? ` · publicada em ${new Date(campaign.publishedAt).toLocaleDateString("pt-BR")}`
                    : null}
                  {campaign.openReplyAutomationId
                    ? ` · automação ${campaign.openReplyAutomationId}`
                    : null}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={campaign.status}
                  onChange={(e) => changeStatus(campaign, e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
                {podeRemover(campaign) ? (
                  <button
                    onClick={() => handleDelete(campaign)}
                    className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Traduz entrada crua + veredito local + resposta do servidor no que aparece
 * embaixo do campo. Enquanto a resposta em mãos for de outra keyword, o estado
 * é "checando" — nunca o veredito velho.
 */
function describeKeyword(
  raw: string,
  validation: ReturnType<typeof validateKeyword> | null,
  canonical: string | null,
  remote: RemoteCheck | null,
): KeywordCheck {
  if (!raw) return { state: "idle" };
  if (validation && !validation.ok) return { state: "invalid", error: validation.error };
  if (!canonical || remote?.keyword !== canonical) return { state: "checking" };

  if (remote.state === "free") return { state: "free" };
  if (remote.state === "taken") return { state: "taken", conflictTheme: remote.conflictTheme };
  return { state: "invalid", error: remote.error };
}

function KeywordHint({ check }: { check: KeywordCheck }) {
  if (check.state === "idle") {
    return (
      <p className="mt-1 text-[11px] text-slate-400">
        Curta, sem acento e fácil de digitar — quem erra a keyword não recebe o Direct.
      </p>
    );
  }
  if (check.state === "checking") {
    return <p className="mt-1 text-[11px] text-slate-400">Checando disponibilidade...</p>;
  }
  if (check.state === "free") {
    return <p className="mt-1 text-[11px] font-semibold text-emerald-600">Keyword livre.</p>;
  }
  if (check.state === "taken") {
    return (
      <p className="mt-1 text-[11px] font-semibold text-rose-600">
        Já usada na campanha “{check.conflictTheme}”. Escolha outra.
      </p>
    );
  }
  return <p className="mt-1 text-[11px] font-semibold text-rose-600">{check.error}</p>;
}
