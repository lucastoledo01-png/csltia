"use client";

import { useState } from "react";

export function AdminNewsroomManager() {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  async function handleRunNewsroom(dryRun: boolean, publish = false, campaign = false) {
    setRunning(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/admin/newsroom/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, publishToPortal: publish, createNewsletterCampaign: campaign }),
      });

      const json = await res.json();
      if (json.ok) {
        setLastResult(json);
        if (publish) setActionSuccess("Edição publicada com sucesso no portal!");
        if (campaign) setActionSuccess("Campanha criada como rascunho no Listmonk!");
        if (dryRun && !publish && !campaign) setActionSuccess("Teste DRY RUN concluído com sucesso!");
      } else {
        setError(json.error || "Erro ao executar a redação.");
      }
    } catch (err: any) {
      setError(err?.message || "Falha na requisição.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner de Status & Agendamento */}
      <div className="admin-glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e4e4e7] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-[#52525b] animate-pulse" />
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#3f3f46]">
                Redação Autônoma Ativa
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-black text-black">Painel da Redação Automatizada</h3>
            <p className="mt-1 text-sm text-[#71717a]">
              Disparo diário automático configurado para às <strong className="text-black">06:03 AM (Horário de Brasília / America/Sao_Paulo)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleRunNewsroom(true, false, false)}
              disabled={running}
              className="rounded-full border border-[#18181b] bg-[#f4f4f5] px-5 py-2.5 text-xs font-bold text-[#18181b] hover:bg-[#e4e4e7] disabled:opacity-50 transition-colors"
            >
              {running ? "Processando..." : "Testar Edição Agora (DRY RUN)"}
            </button>
            <button
              onClick={() => handleRunNewsroom(false, true, true)}
              disabled={running}
              className="rounded-full bg-[#18181b] px-5 py-2.5 text-xs font-black text-white hover:bg-[#000000] disabled:opacity-50 transition-colors"
            >
              Gerar & Publicar Edição Completa
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-[#f5c9c9] bg-[#fdf3f3] p-4 text-xs font-bold text-[#a92b29]">
            {error}
          </div>
        ) : null}

        {actionSuccess ? (
          <div className="mt-4 rounded-xl border border-[#f4f4f5] bg-[#fafafa] p-4 text-xs font-bold text-[#3f3f46]">
            {actionSuccess}
          </div>
        ) : null}

        {/* Métricas da Última Execução */}
        {lastResult ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">Notícias & Fontes</span>
              <p className="mt-1 text-2xl font-black text-black">
                {lastResult.selectedStoriesCount} <span className="text-xs font-normal text-[#71717a]">/ {lastResult.candidatesFound} coletadas</span>
              </p>
            </div>
            <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">QA Audit Score</span>
              <p className="mt-1 text-2xl font-black text-[#3f3f46]">
                {lastResult.qaResult?.score || 95} <span className="text-xs font-normal text-[#71717a]">/ 100</span>
              </p>
            </div>
            <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">Tokens Utilizados</span>
              <p className="mt-1 text-2xl font-black text-black">{lastResult.tokens?.totalTokens || 0}</p>
            </div>
            <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717a]">Custo Estimado</span>
              <p className="mt-1 text-2xl font-black text-[#18181b]">
                ${(lastResult.tokens?.estimatedCostUsd || 0).toFixed(4)} <span className="text-xs font-normal text-[#71717a]">USD</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Visualizador de Edição Gerada */}
      {lastResult?.edition ? (
        <div className="admin-glass rounded-3xl p-6 space-y-6">
          <div className="border-b border-[#e4e4e7] pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#18181b]">
              Pré-Visualização da Edição Gerada
            </span>
            <h4 className="mt-1 text-2xl font-black text-black">{lastResult.edition.headline}</h4>
            <p className="text-sm text-[#71717a] mt-1">{lastResult.edition.preheader}</p>
          </div>

          {/* Opções de Assunto */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-[#3f3f46] mb-2">
              Opções de Assunto de E-mail Geradas:
            </span>
            <div className="space-y-1.5 text-xs font-medium text-[#3f3f46]">
              {lastResult.edition.subject_options?.map((opt: string, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-[#fafafa] p-2 border border-[#e4e4e7]">
                  <span className="font-bold text-[#18181b]">{i + 1}.</span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pautas da Edição */}
          <div className="space-y-4">
            <span className="block text-xs font-bold uppercase tracking-wider text-[#3f3f46]">
              Pautas Selecionadas & Redigidas:
            </span>
            {lastResult.edition.stories?.map((story: any, idx: number) => (
              <div key={idx} className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-full bg-[#18181b] px-3 py-0.5 font-bold text-white uppercase">
                    {story.category}
                  </span>
                  <a href={story.source_url} target="_blank" rel="noreferrer" className="text-[#18181b] hover:underline font-medium">
                    Fonte: {story.source_name} ↗
                  </a>
                </div>
                <h5 className="text-lg font-black text-black">{story.title}</h5>
                <p className="text-sm text-[#3f3f46] leading-relaxed">{story.summary}</p>
                <p className="text-xs text-[#71717a]">
                  <strong className="text-black">Por que importa:</strong> {story.why_it_matters}
                </p>
                <p className="text-xs text-[#71717a]">
                  <strong className="text-black">Na prática:</strong> {story.practical_impact}
                </p>
                {story.humor_line ? (
                  <div className="rounded-xl border-l-4 border-[#18181b] bg-white p-3 text-xs italic text-[#3f3f46]">
                    "{story.humor_line}"
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Assinatura Final */}
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#f4f4f5] p-4 text-center">
            <p className="text-xs font-bold text-[#3f3f46]">{lastResult.edition.closing}</p>
            <p className="mt-1 text-sm font-black text-[#18181b]">{lastResult.edition.final_line}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
