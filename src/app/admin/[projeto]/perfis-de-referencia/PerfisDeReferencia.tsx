"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PortaoAdmin } from "@/components/admin/PortaoAdmin";

/**
 * Cadastro dos perfis de referência e a última leitura de cada um.
 *
 * A tela responde três perguntas, nesta ordem: a capacidade está ligada? Cada
 * perfil está sendo lido? E o que ele trouxe da última vez? A terceira é a que
 * evita o perfil mudo: uma conta que virou pessoal aparece aqui com o motivo e
 * a data, em vez de simplesmente parar de trazer pauta.
 */

type Sinal = { postId: string; permalink: string; razao: number; engajamento: number; trechoDaLegenda: string };
type Topico = { postId: string; assunto: string; consulta: string; descartado: string | null };

type Leitura = {
  lidoEm: string;
  modo: string;
  status: string;
  mensagemDeErro: string | null;
  seguidores: number | null;
  postsLidos: number;
  sinais: Sinal[];
  topicos: Topico[];
  candidatas: number;
  aprovadas: number;
  custoUsd: number;
  observacao: string | null;
};

type Perfil = {
  id: string;
  handle: string;
  nota: string;
  ativo: boolean;
  ultimaLeitura: Leitura | null;
};

type Resposta = {
  ok: boolean;
  error?: string;
  projeto?: { id: string; slug: string; nome: string };
  modo?: "off" | "dry_run" | "enforce";
  perfis?: Perfil[];
};

const ROTULO_DO_STATUS: Record<string, string> = {
  ok: "Lido",
  nao_encontrado_ou_nao_business: "Não encontrado ou não é conta profissional",
  limite_da_api: "Limite da API da Meta, tenta de novo mais tarde",
  token_invalido: "Token do Instagram inválido",
  sem_credencial: "Projeto sem conta do Instagram configurada",
  erro: "Erro na leitura",
};

const ROTULO_DO_MODO: Record<string, string> = {
  off: "Desligado: nada é lido. Ligue em Avançado, Etapas ligadas, Perfis de referência.",
  dry_run: "Ensaio: os perfis são lidos e a leitura é gravada, mas nada vai para o feed.",
  enforce: "No ar: as pautas aprovadas entram no pool do Instagram.",
};

function quando(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function PerfisDeReferencia({ slug }: { slug: string }) {
  return (
    <PortaoAdmin>
      <Tela slug={slug} />
    </PortaoAdmin>
  );
}

function Tela({ slug }: { slug: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [handle, setHandle] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/perfis-referencia?projeto=${encodeURIComponent(slug)}`);
      const corpo = (await r.json()) as Resposta;
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      setDados(corpo);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function chamar(rotulo: string, url: string, init: RequestInit) {
    setOcupado(rotulo);
    try {
      const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const corpo = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      setErro("");
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const ok = await chamar("adicionar", "/api/admin/perfis-referencia", {
      method: "POST",
      body: JSON.stringify({ projeto: slug, handle, nota }),
    });
    if (ok) {
      setHandle("");
      setNota("");
    }
  }

  const perfis = dados?.perfis ?? [];

  return (
    <main className="admin-shell min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href={`/admin/${slug}`} className="text-[11px] text-slate-400 hover:text-slate-900">
            Voltar ao projeto
          </Link>
          <h1 className="mt-1 text-[18px] font-medium text-slate-900">Perfis de referência do Instagram</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            O post que rende acima do normal num destes perfis é um sinal de assunto. O sistema busca a fonte
            original e só ela pode virar pauta: o post nunca é republicado, nem a arte nem o texto.
          </p>
        </div>

        {dados?.modo && (
          <div className="admin-glass p-4 text-[13px] text-slate-700">{ROTULO_DO_MODO[dados.modo]}</div>
        )}

        {erro && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
            {erro}
          </div>
        )}

        <form onSubmit={adicionar} className="admin-glass flex flex-wrap items-end gap-3 p-5">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[12px] text-slate-500">
            Perfil
            <input
              className="admin-campo"
              placeholder="@perfil ou link"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
            />
          </label>
          <label className="flex min-w-[220px] flex-[2] flex-col gap-1 text-[12px] text-slate-500">
            Nota
            <input
              className="admin-campo"
              placeholder="por que acompanhar este perfil"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </label>
          <button type="submit" className="admin-botao" disabled={ocupado !== null}>
            {ocupado === "adicionar" ? "Adicionando..." : "Adicionar"}
          </button>
        </form>

        <div className="admin-glass divide-y divide-slate-200">
          {perfis.length === 0 && (
            <p className="p-5 text-[13px] text-slate-500">{dados ? "Nenhum perfil cadastrado." : "Carregando..."}</p>
          )}
          {perfis.map((p) => (
            <div key={p.id} className="space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={`https://www.instagram.com/${p.handle}/`}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-[14px] font-medium ${p.ativo ? "text-slate-900" : "text-slate-400 line-through"}`}
                  >
                    @{p.handle}
                  </a>
                  {p.nota && <p className="text-[12px] text-slate-500">{p.nota}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="admin-botao-secundario"
                    disabled={ocupado !== null}
                    onClick={() =>
                      chamar(`ler-${p.id}`, `/api/admin/perfis-referencia/${p.id}/ler`, {
                        method: "POST",
                        body: JSON.stringify({ projeto: slug }),
                      })
                    }
                  >
                    {ocupado === `ler-${p.id}` ? "Lendo..." : "Ler agora"}
                  </button>
                  <button
                    className="admin-botao-secundario"
                    disabled={ocupado !== null}
                    onClick={() =>
                      chamar(`ativo-${p.id}`, `/api/admin/perfis-referencia/${p.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ projeto: slug, ativo: !p.ativo }),
                      })
                    }
                  >
                    {p.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    className="admin-botao-secundario"
                    disabled={ocupado !== null}
                    onClick={() => {
                      if (!window.confirm(`Remover @${p.handle}? As leituras gravadas ficam.`)) return;
                      void chamar(
                        `remover-${p.id}`,
                        `/api/admin/perfis-referencia/${p.id}?projeto=${encodeURIComponent(slug)}`,
                        { method: "DELETE" },
                      );
                    }}
                  >
                    Remover
                  </button>
                </div>
              </div>
              <UltimaLeitura leitura={p.ultimaLeitura} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function UltimaLeitura({ leitura }: { leitura: Leitura | null }) {
  if (!leitura) return <p className="text-[12px] text-slate-400">Sem leitura recente.</p>;

  const ok = leitura.status === "ok";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-600">
      <p>
        <span className={ok ? "text-emerald-700" : "text-rose-600"}>
          {ROTULO_DO_STATUS[leitura.status] ?? leitura.status}
        </span>
        {" em "}
        {quando(leitura.lidoEm)} ({leitura.modo})
        {ok && ` · ${leitura.postsLidos} posts lidos`}
        {leitura.seguidores !== null && ` · ${leitura.seguidores.toLocaleString("pt-BR")} seguidores`}
        {leitura.custoUsd > 0 && ` · US$ ${leitura.custoUsd.toFixed(4)}`}
      </p>
      {leitura.mensagemDeErro && <p className="mt-1 text-slate-500">{leitura.mensagemDeErro}</p>}
      {leitura.observacao && <p className="mt-1 text-slate-500">{leitura.observacao}</p>}
      {leitura.sinais.length > 0 && (
        <ul className="mt-2 space-y-1">
          {leitura.sinais.map((s) => {
            const t = leitura.topicos.find((x) => x.postId === s.postId);
            return (
              <li key={s.postId}>
                <a href={s.permalink} target="_blank" rel="noreferrer" className="underline">
                  {s.razao}x o normal
                </a>
                {t
                  ? t.descartado
                    ? ` · descartado: ${t.descartado}`
                    : ` · assunto: ${t.assunto} · busca: "${t.consulta}"`
                  : ` · ${s.trechoDaLegenda.slice(0, 120)}`}
              </li>
            );
          })}
        </ul>
      )}
      {(leitura.candidatas > 0 || leitura.aprovadas > 0) && (
        <p className="mt-1">
          {leitura.candidatas} matéria(s) encontrada(s) na busca, {leitura.aprovadas} aprovada(s) pela linha editorial
        </p>
      )}
    </div>
  );
}
