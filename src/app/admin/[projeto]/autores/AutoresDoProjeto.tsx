"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PortaoAdmin } from "@/components/admin/PortaoAdmin";
import { EDITORIAS } from "@/lib/editorias";
import { ASSINATURA_DA_REDACAO, REDES, hrefDoAutor, slugDoAutor, type Autor, type RedesDoAutor } from "@/lib/autores";

/**
 * Cadastro dos autores e a atribuição de autor a cada matéria (06/10/2026).
 *
 * Duas perguntas, nesta ordem: quem assina no portal, e quem assina cada
 * matéria. A matéria sem autor é da Redação, e é assim que tudo o que a
 * esteira publica nasce: ninguém precisa fazer nada para manter o de sempre.
 */

type Materia = { id: string; slug: string; title: string; status: string; published_at: string | null; author_id: string | null };

type Resposta = { ok: boolean; error?: string; autores?: Autor[]; materias?: Materia[] };

type Formulario = {
  nome: string;
  slug: string;
  cargo: string;
  minibio: string;
  foto_url: string;
  area: string;
  redes: Required<RedesDoAutor>;
};

const VAZIO: Formulario = {
  nome: "",
  slug: "",
  cargo: "",
  minibio: "",
  foto_url: "",
  area: "",
  redes: { instagram: "", linkedin: "", x: "", site: "" },
};

function doAutor(a: Autor): Formulario {
  return {
    nome: a.nome,
    slug: a.slug,
    cargo: a.cargo,
    minibio: a.minibio,
    foto_url: a.foto_url ?? "",
    area: a.area,
    redes: { instagram: a.redes.instagram ?? "", linkedin: a.redes.linkedin ?? "", x: a.redes.x ?? "", site: a.redes.site ?? "" },
  };
}

function quando(iso: string | null): string {
  if (!iso) return "sem data";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

export function AutoresDoProjeto({ slug }: { slug: string }) {
  return (
    <PortaoAdmin>
      <Tela slug={slug} />
    </PortaoAdmin>
  );
}

function Tela({ slug }: { slug: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [slugTocado, setSlugTocado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/autores?projeto=${encodeURIComponent(slug)}`);
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

  async function chamar(rotulo: string, url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setOcupado(rotulo);
    setAviso("");
    try {
      const r = await fetch(url, init);
      const corpo = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      setErro("");
      return corpo as Record<string, unknown>;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha.");
      return null;
    } finally {
      setOcupado(null);
    }
  }

  const json = (metodo: string, corpo: unknown): RequestInit => ({
    method: metodo,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const campos = { ...form, slug: form.slug || slugDoAutor(form.nome) };
    const ok = editando
      ? await chamar("salvar", `/api/admin/autores/${editando}`, json("PATCH", { projeto: slug, ...campos }))
      : await chamar("salvar", "/api/admin/autores", json("POST", { projeto: slug, ...campos }));
    if (ok) {
      setAviso(editando ? "Autor atualizado." : "Autor cadastrado.");
      setForm(VAZIO);
      setEditando(null);
      setSlugTocado(false);
      await carregar();
    }
  }

  async function subirFoto(arquivo: File) {
    const corpo = new FormData();
    corpo.set("projeto", slug);
    corpo.set("arquivo", arquivo);
    const r = await chamar("foto", "/api/admin/autores/foto", { method: "POST", body: corpo });
    if (r && typeof r.url === "string") setForm((f) => ({ ...f, foto_url: r.url as string }));
  }

  async function alternarAtivo(a: Autor) {
    if (a.ativo && !window.confirm(`Desativar ${a.nome}? A página sai do ar e as matérias voltam a assinar como ${ASSINATURA_DA_REDACAO}.`)) return;
    const ok = await chamar(`ativo-${a.id}`, `/api/admin/autores/${a.id}`, json("PATCH", { projeto: slug, ativo: !a.ativo }));
    if (ok) await carregar();
  }

  async function atribuir(materia: Materia, autorId: string) {
    const ok = await chamar(`materia-${materia.id}`, "/api/admin/autores/materia", json("PATCH", { projeto: slug, artigo: materia.id, autor: autorId || null }));
    if (ok) {
      setAviso(`Autor de "${materia.title}" atualizado. A matéria muda no portal em até 5 minutos.`);
      await carregar();
    }
  }

  const autores = dados?.autores ?? [];
  const ativos = autores.filter((a) => a.ativo);
  const materias = dados?.materias ?? [];
  const nomeDoAutor = new Map(autores.map((a) => [a.id, a]));

  return (
    <main className="admin-shell min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href={`/admin/${slug}`} className="text-[11px] text-slate-400 hover:text-slate-900">
            Voltar ao projeto
          </Link>
          <h1 className="mt-1 text-[18px] font-medium text-slate-900">Autores do portal</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Quem assina matéria no portal, com página própria em /autor/&lt;endereço&gt;. A matéria sem autor assina como{" "}
            {ASSINATURA_DA_REDACAO}, que é o padrão de tudo o que a esteira publica.
          </p>
        </div>

        {erro && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">{erro}</div>}
        {aviso && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{aviso}</div>}

        <form onSubmit={salvar} className="admin-glass space-y-4 p-5" aria-label={editando ? "Editar autor" : "Novo autor"}>
          <h2 className="text-[14px] font-medium text-slate-900">{editando ? `Editar ${form.nome}` : "Novo autor"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] text-slate-500">
              Nome
              <input
                className="admin-campo"
                value={form.nome}
                required
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value, slug: slugTocado ? f.slug : slugDoAutor(e.target.value) }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-slate-500">
              Endereço da página (slug)
              <input
                className="admin-campo"
                value={form.slug}
                placeholder="nome-sobrenome"
                maxLength={80}
                onChange={(e) => {
                  setSlugTocado(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-slate-500">
              Cargo
              <input className="admin-campo" value={form.cargo} maxLength={120} placeholder="Editora de Economia" onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-slate-500">
              Área
              <input
                className="admin-campo"
                list="editorias-do-portal"
                value={form.area}
                maxLength={80}
                placeholder="uma editoria ou texto livre"
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              />
              <datalist id="editorias-do-portal">
                {EDITORIAS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </datalist>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-slate-500">
            Minibio
            <textarea className="admin-campo min-h-24" value={form.minibio} maxLength={1200} onChange={(e) => setForm((f) => ({ ...f, minibio: e.target.value }))} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            {form.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.foto_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : null}
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[12px] text-slate-500">
              Foto (link https)
              <input className="admin-campo" value={form.foto_url} placeholder="https://..." onChange={(e) => setForm((f) => ({ ...f, foto_url: e.target.value }))} />
            </label>
            <label className="admin-botao-secundario cursor-pointer">
              {ocupado === "foto" ? "Subindo..." : "Subir foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) void subirFoto(arquivo);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {REDES.map((r) => (
              <label key={r.id} className="flex flex-col gap-1 text-[12px] text-slate-500">
                {r.rotulo}
                <input
                  className="admin-campo"
                  value={form.redes[r.id]}
                  placeholder={r.id === "instagram" || r.id === "x" ? "@perfil ou link" : "https://..."}
                  onChange={(e) => setForm((f) => ({ ...f, redes: { ...f.redes, [r.id]: e.target.value } }))}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="admin-botao" disabled={ocupado !== null}>
              {ocupado === "salvar" ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar autor"}
            </button>
            {editando ? (
              <button
                type="button"
                className="admin-botao-secundario"
                onClick={() => {
                  setEditando(null);
                  setForm(VAZIO);
                  setSlugTocado(false);
                }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <section className="admin-glass divide-y divide-slate-200" aria-label="Autores cadastrados">
          {autores.length === 0 && <p className="p-5 text-[13px] text-slate-500">{dados ? "Nenhum autor cadastrado." : "Carregando..."}</p>}
          {autores.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex min-w-0 items-center gap-3">
                {a.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-[13px] font-medium text-slate-600">{a.nome.charAt(0)}</span>
                )}
                <div className="min-w-0">
                  <p className={`text-[14px] font-medium ${a.ativo ? "text-slate-900" : "text-slate-400 line-through"}`}>{a.nome}</p>
                  <p className="text-[12px] text-slate-500">
                    {[a.cargo, a.ativo ? hrefDoAutor(a.slug) : "desativado"].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.ativo ? (
                  <a href={hrefDoAutor(a.slug)} target="_blank" rel="noreferrer" className="admin-botao-secundario">
                    Ver página
                  </a>
                ) : null}
                <button
                  className="admin-botao-secundario"
                  disabled={ocupado !== null}
                  onClick={() => {
                    setEditando(a.id);
                    setForm(doAutor(a));
                    setSlugTocado(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Editar
                </button>
                <button className="admin-botao-secundario" disabled={ocupado !== null} onClick={() => void alternarAtivo(a)}>
                  {a.ativo ? "Desativar" : "Reativar"}
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="admin-glass p-5" aria-label="Autor de cada matéria">
          <h2 className="text-[14px] font-medium text-slate-900">Autor de cada matéria</h2>
          <p className="mt-1 text-[12px] text-slate-500">
            As 100 matérias mais recentes do portal, publicadas e agendadas. Escolher {ASSINATURA_DA_REDACAO} tira o autor.
          </p>
          <ul className="mt-4 divide-y divide-slate-200">
            {materias.length === 0 && <li className="py-3 text-[13px] text-slate-500">{dados ? "Nenhuma matéria." : "Carregando..."}</li>}
            {materias.map((m) => {
              const atual = m.author_id ? nomeDoAutor.get(m.author_id) : undefined;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <a href={`/artigos/${m.slug}`} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-slate-900 hover:underline">
                      {m.title}
                    </a>
                    <p className="text-[11px] text-slate-500">
                      {m.status === "published" ? "publicada" : "agendada"} · {quando(m.published_at)}
                      {atual && !atual.ativo ? ` · ${atual.nome} está desativado: assina como ${ASSINATURA_DA_REDACAO}` : ""}
                    </p>
                  </div>
                  <select
                    aria-label={`Autor de ${m.title}`}
                    className="admin-campo w-auto"
                    value={m.author_id ?? ""}
                    disabled={ocupado !== null}
                    onChange={(e) => void atribuir(m, e.target.value)}
                  >
                    <option value="">{ASSINATURA_DA_REDACAO}</option>
                    {ativos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                      </option>
                    ))}
                    {atual && !atual.ativo ? (
                      <option value={atual.id} disabled>
                        {atual.nome} (desativado)
                      </option>
                    ) : null}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
