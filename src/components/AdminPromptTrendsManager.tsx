"use client";

import { useEffect, useState } from "react";

/**
 * Topo do funil no painel: tendência → conceito → campanha.
 *
 * As etapas 1 a 3 existiam só como rota — não havia por onde clicar, e uma
 * campanha criada à mão nascia sem conceito. Sem conceito não há aplicações, e
 * sem aplicações a geração de imagens não tem de onde partir: cada imagem é uma
 * aplicação do conceito.
 *
 * A ordem na tela é a ordem do funil de propósito. Quem abre esta aba lê o
 * caminho de cima para baixo.
 */

type Trend = {
  id: string;
  raw_title: string;
  source: string;
  opportunity_score: number;
  visual_hook: string | null;
  status: string;
  notes: string | null;
};

type IpCheck = { aprovado?: boolean; motivos?: string[]; correcoes?: string[] };

/** Só o que interessa aqui: qual keyword já saiu de qual conceito. */
type CampanhaLigada = { keyword: string; conceptId: string | null };

type Concept = {
  id: string;
  concept: string;
  hook: string | null;
  applications: unknown;
  status: string;
  ip_check: IpCheck | null;
};

const STATUS_TREND: Record<string, { rotulo: string; cor: string }> = {
  candidate: { rotulo: "Candidata", cor: "bg-emerald-100 text-emerald-700" },
  promoted: { rotulo: "Virou conceito", cor: "bg-indigo-100 text-indigo-700" },
  rejected: { rotulo: "Sem gancho visual", cor: "bg-slate-100 text-slate-500" },
  archived: { rotulo: "Arquivada", cor: "bg-slate-200 text-slate-500" },
};

/**
 * Lê a resposta sem assumir que ela é JSON.
 *
 * `res.json()` cru foi o que fez o painel travar em silêncio: quando o
 * container está sendo trocado, o proxy devolve uma página HTML de erro, o
 * parse lança, e — como os handlers só tinham `finally` — o botão parava de
 * girar sem mostrar nada. Sumiço é o pior resultado possível: quem clicou não
 * sabe se criou, se falhou, ou se deve clicar de novo (e clicar de novo era
 * garantia de erro, porque a keyword já existia).
 */
async function lerResposta(res: Response): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const texto = await res.text();
  try {
    return { ok: res.ok, json: JSON.parse(texto) as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      json: {
        error:
          `O servidor respondeu ${res.status} sem JSON — normalmente é deploy em ` +
          `andamento. Espere alguns segundos e tente de novo.`,
      },
    };
  }
}

/** Mensagem de erro de exceção, já legível para quem opera. */
function motivoDaFalha(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `A requisição não completou: ${msg}. Se o deploy acabou de rodar, tente de novo.`;
}

async function buscar<T>(url: string, chave: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    return json.ok ? ((json[chave] as T[]) ?? []) : [];
  } catch {
    return [];
  }
}

/**
 * Campanhas existentes, para saber quais conceitos já viraram uma.
 *
 * Sem isto o cartão oferece "Criar campanha" para um conceito que já tem
 * campanha — e o segundo clique só pode falhar, porque a keyword sugerida é
 * derivada do mesmo hook e a unicidade `(project_id, keyword)` recusa. Era
 * convite para um erro garantido.
 */
async function buscarCampanhas(): Promise<CampanhaLigada[]> {
  try {
    const res = await fetch("/api/admin/prompt-system/campaigns");
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? (json as CampanhaLigada[]) : [];
  } catch {
    return [];
  }
}

export function AdminPromptTrendsManager() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaLigada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string>("");
  const [manuais, setManuais] = useState("");

  async function recarregar() {
    const [t, c, camp] = await Promise.all([
      buscar<Trend>("/api/admin/prompt-system/trends", "trends"),
      buscar<Concept>("/api/admin/prompt-system/concepts", "concepts"),
      buscarCampanhas(),
    ]);
    setTrends(t);
    setConcepts(c);
    setCampanhas(camp);
    setCarregando(false);
  }

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      if (!cancelado) await recarregar();
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  async function coletar() {
    setOcupado("coletar");
    setAviso("");
    try {
      const extras = manuais
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((titulo) => ({ titulo }));

      const res = await fetch("/api/admin/prompt-system/trends/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras }),
      });
      const { ok, json } = await lerResposta(res);
      setAviso(ok && json.ok ? String(json.resumo) : String(json.error ?? "Erro ao coletar."));
      setManuais("");
      await recarregar();
    } catch (err) {
      setAviso(motivoDaFalha(err));
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Reaplica o guardrail atual sobre os conceitos barrados.
   *
   * O veredito fica gravado no registro, então afrouxar a regra não destrava
   * sozinho o que já foi barrado. Este botão é o que faz a correção alcançar
   * o passado — sem ele, seria UPDATE na mão no banco.
   */
  async function reavaliar() {
    setOcupado("reavaliar");
    setAviso("");
    try {
      const res = await fetch("/api/admin/prompt-system/concepts/reavaliar", { method: "POST" });
      const { ok, json } = await lerResposta(res);
      setAviso(ok && json.ok ? String(json.resumo) : String(json.error ?? "Erro ao reavaliar."));
      await recarregar();
    } catch (err) {
      setAviso(motivoDaFalha(err));
    } finally {
      setOcupado(null);
    }
  }

  async function gerarConceito(trendId: string) {
    setOcupado(trendId);
    setAviso("");
    try {
      const res = await fetch("/api/admin/prompt-system/concepts/from-trend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trendId }),
      });
      const { ok, json } = await lerResposta(res);
      setAviso(ok && json.ok ? String(json.resumo) : String(json.error ?? "Erro ao gerar conceito."));
      await recarregar();
    } catch (err) {
      setAviso(motivoDaFalha(err));
    } finally {
      setOcupado(null);
    }
  }

  async function criarCampanha(concept: Concept) {
    const sugestao = (concept.hook ?? concept.concept)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);

    const keyword = prompt(
      "Keyword da campanha — curta, sem acento, só letras e números.\n" +
        "É o que a pessoa vai comentar no post.",
      sugestao || "",
    );
    if (!keyword) return;

    setOcupado(concept.id);
    setAviso("");
    try {
      const res = await fetch("/api/admin/prompt-system/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          theme: (concept.hook || concept.concept).slice(0, 120),
          campaignType: "prompt",
          format: "prompt",
          conceptId: concept.id,
        }),
      });
      const { ok, json } = await lerResposta(res);
      setAviso(
        ok
          ? `Campanha ${keyword.toUpperCase()} criada e ligada ao conceito. ` +
              `Agora use "Gerar prompts + imagens" na tabela abaixo.`
          : String(json.error ?? "Erro ao criar campanha."),
      );
      await recarregar();
    } catch (err) {
      setAviso(motivoDaFalha(err));
    } finally {
      setOcupado(null);
    }
  }

  if (carregando) {
    return <div className="py-8 text-center text-sm text-slate-500">Carregando tendências...</div>;
  }

  const candidatas = trends.filter((t) => t.status === "candidate");
  const outras = trends.filter((t) => t.status !== "candidate");

  return (
    <div className="space-y-6">
      <div className="admin-glass rounded-3xl p-6">
        <h3 className="text-2xl text-slate-900">Tendências &amp; Conceitos</h3>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          O topo do funil. A coleta só promove tendência com <strong>associação visual
          reproduzível</strong> — a pergunta é uma só: dá pra fazer alguém querer refazer isso?
          Assunto quente que não vira imagem é ruído aqui.
        </p>

        <div className="mt-5 space-y-3">
          <textarea
            rows={2}
            value={manuais}
            onChange={(e) => setManuais(e.target.value)}
            placeholder="Opcional: uma tendência por linha, que você viu antes dos coletores"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={coletar}
            disabled={ocupado !== null}
            className="rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {ocupado === "coletar" ? "Coletando e triando..." : "Coletar tendências"}
          </button>
        </div>

        {aviso ? (
          <p className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-700">
            {aviso}
          </p>
        ) : null}
      </div>

      {candidatas.length > 0 ? (
        <div className="admin-glass rounded-3xl p-6">
          <h4 className="text-lg font-bold text-slate-900">
            Candidatas <span className="text-slate-400">({candidatas.length})</span>
          </h4>
          <p className="mt-1 text-xs text-slate-500">Têm gancho visual. Gerar conceito é a etapa 2.</p>

          <div className="mt-4 space-y-2">
            {candidatas.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{t.raw_title}</p>
                  {t.visual_hook ? (
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">Gancho:</span> {t.visual_hook}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-400">
                    score {t.opportunity_score} · {t.source}
                  </p>
                </div>
                <button
                  onClick={() => gerarConceito(t.id)}
                  disabled={ocupado !== null}
                  className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {ocupado === t.id ? "Gerando..." : "Gerar conceito"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {concepts.length > 0 ? (
        <div className="admin-glass rounded-3xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-bold text-slate-900">
                Conceitos <span className="text-slate-400">({concepts.length})</span>
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Cada aplicação vira uma imagem. Criar a campanha liga o conceito à keyword.
              </p>
            </div>

            {concepts.some((c) => c.status === "blocked") ? (
              <button
                onClick={reavaliar}
                disabled={ocupado !== null}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                title="O motivo do bloqueio fica gravado no conceito. Se o guardrail foi afrouxado depois, só reavaliando o registro se atualiza."
              >
                {ocupado === "reavaliar" ? "Reavaliando..." : "Reavaliar barrados"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {concepts.map((c) => {
              const apps = Array.isArray(c.applications) ? (c.applications as string[]) : [];
              const bloqueado = c.status === "blocked";
              const jaTemCampanha = campanhas.find((k) => k.conceptId === c.id);

              return (
                <div
                  key={c.id}
                  className={`rounded-2xl border p-4 ${bloqueado ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{c.hook || c.concept}</p>
                      <p className="mt-1 text-xs text-slate-500">{c.concept}</p>
                      {apps.length > 0 ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          <span className="font-semibold">{apps.length} aplicação(ões):</span>{" "}
                          {apps.slice(0, 4).join(" · ")}
                          {apps.length > 4 ? " …" : ""}
                        </p>
                      ) : null}
                    </div>

                    {bloqueado ? (
                      <span className="rounded-full bg-rose-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-800">
                        Barrado — PI
                      </span>
                    ) : jaTemCampanha ? (
                      <span
                        className="rounded-full bg-emerald-100 px-3 py-1 font-mono text-[10px] font-bold tracking-wide text-emerald-800"
                        title="Este conceito já virou campanha. Gere os prompts e as imagens na aba de campanhas."
                      >
                        {jaTemCampanha.keyword}
                      </span>
                    ) : (
                      <button
                        onClick={() => criarCampanha(c)}
                        disabled={ocupado !== null}
                        className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {ocupado === c.id ? "Criando..." : "Criar campanha"}
                      </button>
                    )}
                  </div>

                  {bloqueado && c.ip_check?.motivos?.length ? (
                    <div className="mt-3 border-t border-rose-200 pt-3 text-xs text-rose-800">
                      <p className="font-bold">Por que foi barrado:</p>
                      <ul className="mt-1 space-y-1">
                        {c.ip_check.motivos.map((m) => (
                          <li key={m}>• {m}</li>
                        ))}
                      </ul>
                      {c.ip_check.correcoes?.length ? (
                        <p className="mt-2">
                          <span className="font-bold">Como corrigir:</span>{" "}
                          {c.ip_check.correcoes.join(" ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {outras.length > 0 ? (
        <details className="admin-glass rounded-3xl p-6">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">
            Tendências já processadas ({outras.length})
          </summary>
          <div className="mt-4 space-y-1.5">
            {outras.map((t) => {
              const s = STATUS_TREND[t.status] ?? { rotulo: t.status, cor: "bg-slate-100 text-slate-500" };
              return (
                <div key={t.id} className="flex items-start justify-between gap-3 py-1.5 text-xs">
                  <div className="min-w-0">
                    <span className="text-slate-700">{t.raw_title}</span>
                    {t.notes ? <p className="text-[11px] text-slate-400">{t.notes}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.cor}`}>
                    {s.rotulo}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
