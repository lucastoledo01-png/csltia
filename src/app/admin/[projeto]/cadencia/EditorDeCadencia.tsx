"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PortaoAdmin } from "@/components/admin/PortaoAdmin";
import type { RespostaDeProjetos } from "@/components/admin/tipos";
import type { CadenciaDoProjeto, Canal } from "@/lib/server/cadencia";
import {
  avisosDoCrontab,
  leituraDoRascunho,
  previaDaSemana,
  proximaSegunda,
} from "@/lib/server/cadencia-no-painel";

/**
 * O formulário da cadência (06/10/2026).
 *
 * A prévia e os avisos são calculados AQUI, a cada tecla, com os mesmos
 * validadores que a esteira usa (`cadencia.ts`, por `cadencia-no-painel.ts`).
 * Campo inválido não trava o formulário: ele aparece como aviso, e a prévia
 * mostra o padrão que vai valer no lugar dele, que é exatamente o que a
 * esteira faria com ele gravado.
 */

type Resposta = {
  ok: boolean;
  error?: string;
  projeto: { id: string; slug: string; timezone: string };
  hoje: string;
  declarada: unknown;
  cadencia: CadenciaDoProjeto;
  avisos: string[];
  padrao: CadenciaDoProjeto;
  avisosDoCrontab: string[];
};

type CanalNoFormulario = { dias: number[]; horarios: string; minimo: string; maximo: string };

type Formulario = {
  canais: Record<Canal, CanalNoFormulario>;
  producao: { dias: number[]; horario: string; antecedenciaEmDias: string };
  aprovacao: { dias: number[]; inicio: string; fim: string; modo: string };
};

const CANAIS: Array<{ id: Canal; rotulo: string; volume: string }> = [
  { id: "newsletter", rotulo: "Newsletter", volume: "pautas por edição" },
  { id: "portal", rotulo: "Portal", volume: "matérias por dia" },
  { id: "instagram", rotulo: "Instagram", volume: "posts por dia" },
];

/** Segunda primeiro, como a semana do calendário do painel. */
const DIAS = [
  { n: 1, curto: "Seg" },
  { n: 2, curto: "Ter" },
  { n: 3, curto: "Qua" },
  { n: 4, curto: "Qui" },
  { n: 5, curto: "Sex" },
  { n: 6, curto: "Sáb" },
  { n: 0, curto: "Dom" },
];
const NOME_DO_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const MODOS = [
  { id: "lote_ou_peca", rotulo: "Lote ou peça a peça" },
  { id: "lote", rotulo: "Só em lote" },
  { id: "peca", rotulo: "Só peça a peça" },
];

function formularioDe(c: CadenciaDoProjeto): Formulario {
  const canal = (x: CadenciaDoProjeto[Canal]): CanalNoFormulario => ({
    dias: [...x.dias],
    horarios: x.horarios.join(", "),
    minimo: String(x.volume.minimo),
    maximo: String(x.volume.maximo),
  });
  return {
    canais: { newsletter: canal(c.newsletter), portal: canal(c.portal), instagram: canal(c.instagram) },
    producao: {
      dias: [...c.producao.dias],
      horario: c.producao.horario,
      antecedenciaEmDias: String(c.producao.antecedenciaEmDias),
    },
    aprovacao: { dias: [...c.aprovacao.dias], inicio: c.aprovacao.inicio, fim: c.aprovacao.fim, modo: c.aprovacao.modo },
  };
}

/** Número digitado: vazio ou torto vira o próprio texto, para o validador acusar em vez de virar 0 calado. */
function numero(s: string): number | string {
  const t = s.trim();
  // Vazio vai como texto: `Number("")` é 0, e o validador aceitaria um zero que ninguém digitou.
  if (t === "") return "vazio";
  return /^-?\d+$/.test(t) ? Number(t) : t;
}

/** O formulário no formato de `settings.cadencia`. Não corrige nada: isso é do validador. */
export function declaradaDoFormulario(f: Formulario): Record<string, unknown> {
  const canal = (x: CanalNoFormulario) => ({
    dias: [...x.dias].sort((a, b) => a - b),
    horarios: x.horarios
      .split(/[,;\s]+/)
      .map((h) => h.trim())
      .filter(Boolean),
    volume: { minimo: numero(x.minimo), maximo: numero(x.maximo) },
  });
  return {
    newsletter: canal(f.canais.newsletter),
    portal: canal(f.canais.portal),
    instagram: canal(f.canais.instagram),
    producao: {
      dias: [...f.producao.dias].sort((a, b) => a - b),
      horario: f.producao.horario,
      antecedenciaEmDias: numero(f.producao.antecedenciaEmDias),
    },
    aprovacao: {
      dias: [...f.aprovacao.dias].sort((a, b) => a - b),
      inicio: f.aprovacao.inicio,
      fim: f.aprovacao.fim,
      modo: f.aprovacao.modo,
    },
  };
}

function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function EditorDeCadencia({ slug }: { slug: string }) {
  return (
    <PortaoAdmin>
      <Tela slug={slug} />
    </PortaoAdmin>
  );
}

function Tela({ slug }: { slug: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const aplicar = useCallback((r: Resposta) => {
    setDados(r);
    setForm(formularioDe(r.cadencia));
  }, []);

  const carregar = useCallback(async () => {
    try {
      const rp = await fetch("/api/admin/projetos");
      const projetos = (await rp.json()) as RespostaDeProjetos;
      if (!rp.ok || !projetos.ok) throw new Error(projetos.error ?? `HTTP ${rp.status}`);
      const achado = (projetos.projetos ?? []).find((p) => p.slug === slug);
      if (!achado) throw new Error(`Nenhum projeto com o identificador "${slug}".`);

      const r = await fetch(`/api/admin/projetos/${achado.id}/cadencia`);
      const corpo = (await r.json()) as Resposta;
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      aplicar(corpo);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a cadência.");
    }
  }, [slug, aplicar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rascunho = useMemo(() => (form ? declaradaDoFormulario(form) : null), [form]);
  const leitura = useMemo(() => (rascunho ? leituraDoRascunho(rascunho) : null), [rascunho]);
  const previa = useMemo(
    () => (leitura && dados ? previaDaSemana(leitura.cadencia, proximaSegunda(dados.hoje)) : []),
    [leitura, dados],
  );
  const crontab = useMemo(
    () => (leitura && dados ? avisosDoCrontab(leitura.cadencia, dados.projeto.timezone, new Date()) : []),
    [leitura, dados],
  );

  async function gravar(cadencia: Record<string, unknown> | null) {
    if (!dados) return;
    setOcupado(true);
    setAviso("");
    try {
      const r = await fetch(`/api/admin/projetos/${dados.projeto.id}/cadencia`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cadencia }),
      });
      const corpo = (await r.json()) as Resposta;
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      aplicar(corpo);
      setErro("");
      setAviso(
        corpo.avisos.length
          ? `Gravada, com ${corpo.avisos.length} campo(s) valendo o padrão. Veja os avisos.`
          : "Gravada. A esteira lê a cadência nova na próxima rodada.",
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar.");
    } finally {
      setOcupado(false);
    }
  }

  if (!form || !dados || !leitura) {
    return (
      <main className="admin-shell grid min-h-screen place-items-center p-6">
        <p className="text-xs font-semibold text-slate-500">{erro || "Carregando a cadência..."}</p>
      </main>
    );
  }

  const mudarCanal = (canal: Canal, parcial: Partial<CanalNoFormulario>) =>
    setForm({ ...form, canais: { ...form.canais, [canal]: { ...form.canais[canal], ...parcial } } });

  return (
    <main className="admin-shell min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href={`/admin/${slug}`} className="text-[11px] text-slate-400 hover:text-slate-900">
            Voltar ao projeto
          </Link>
          <h1 className="mt-1 text-[18px] font-medium text-slate-900">Cadência</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Dias, horários e volume de cada canal, em hora de {dados.projeto.timezone}. Campo inválido não para o dia:
            ele vale o padrão do PRD e o aviso fica aqui até ser corrigido.
          </p>
        </div>

        {erro && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">{erro}</div>
        )}
        {aviso && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{aviso}</div>}

        {leitura.avisos.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-800" role="status">
            <p className="font-semibold">Campos que vão valer o padrão</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {leitura.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rascunho) void gravar(rascunho);
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {CANAIS.map((c) => (
              <fieldset key={c.id} className="admin-glass space-y-3 p-4">
                <legend className="px-1 text-[13px] font-medium text-slate-900">{c.rotulo}</legend>
                <SeletorDeDias
                  rotulo={`Dias da ${c.rotulo.toLowerCase()}`}
                  dias={form.canais[c.id].dias}
                  aoMudar={(dias) => mudarCanal(c.id, { dias })}
                />
                <label className="flex flex-col gap-1 text-[12px] text-slate-500">
                  Horários (HH:MM, separados por vírgula)
                  <input
                    className="admin-campo"
                    value={form.canais[c.id].horarios}
                    onChange={(e) => mudarCanal(c.id, { horarios: e.target.value })}
                  />
                </label>
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                    Mínimo
                    <input
                      className="admin-campo"
                      inputMode="numeric"
                      value={form.canais[c.id].minimo}
                      onChange={(e) => mudarCanal(c.id, { minimo: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                    Máximo
                    <input
                      className="admin-campo"
                      inputMode="numeric"
                      value={form.canais[c.id].maximo}
                      onChange={(e) => mudarCanal(c.id, { maximo: e.target.value })}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">Volume em {c.volume}.</p>
              </fieldset>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="admin-glass space-y-3 p-4">
              <legend className="px-1 text-[13px] font-medium text-slate-900">Produção</legend>
              <SeletorDeDias
                rotulo="Dias de produção"
                dias={form.producao.dias}
                aoMudar={(dias) => setForm({ ...form, producao: { ...form.producao, dias } })}
              />
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                  Horário
                  <input
                    className="admin-campo"
                    value={form.producao.horario}
                    placeholder="17:00"
                    onChange={(e) => setForm({ ...form, producao: { ...form.producao, horario: e.target.value } })}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                  Vai ao ar quantos dias depois
                  <input
                    className="admin-campo"
                    inputMode="numeric"
                    value={form.producao.antecedenciaEmDias}
                    onChange={(e) =>
                      setForm({ ...form, producao: { ...form.producao, antecedenciaEmDias: e.target.value } })
                    }
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="admin-glass space-y-3 p-4">
              <legend className="px-1 text-[13px] font-medium text-slate-900">Aprovação</legend>
              <SeletorDeDias
                rotulo="Dias de aprovação"
                dias={form.aprovacao.dias}
                aoMudar={(dias) => setForm({ ...form, aprovacao: { ...form.aprovacao, dias } })}
              />
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                  Das
                  <input
                    className="admin-campo"
                    value={form.aprovacao.inicio}
                    onChange={(e) => setForm({ ...form, aprovacao: { ...form.aprovacao, inicio: e.target.value } })}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                  Até
                  <input
                    className="admin-campo"
                    value={form.aprovacao.fim}
                    onChange={(e) => setForm({ ...form, aprovacao: { ...form.aprovacao, fim: e.target.value } })}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[12px] text-slate-500">
                  Modo
                  <select
                    className="admin-campo"
                    value={form.aprovacao.modo}
                    onChange={(e) => setForm({ ...form, aprovacao: { ...form.aprovacao, modo: e.target.value } })}
                  >
                    {MODOS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
          </div>

          {crontab.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-[12px] text-sky-900" role="note">
              <p className="font-semibold">O crontab precisa acompanhar</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {crontab.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="admin-botao" disabled={ocupado}>
              {ocupado ? "Gravando..." : "Gravar cadência"}
            </button>
            <button type="button" className="admin-botao-secundario" disabled={ocupado} onClick={() => setForm(formularioDe(dados.cadencia))}>
              Desfazer edição
            </button>
            <button
              type="button"
              className="admin-botao-secundario"
              disabled={ocupado || dados.declarada === null}
              onClick={() => void gravar(null)}
              title="Apaga settings.cadencia; o projeto passa a valer a tabela do PRD"
            >
              Voltar ao padrão do PRD
            </button>
          </div>
        </form>

        <section className="admin-glass overflow-x-auto p-4" aria-labelledby="previa-da-semana">
          <h2 id="previa-da-semana" className="text-[13px] font-medium text-slate-900">
            Prévia da próxima semana
          </h2>
          <p className="mt-1 text-[12px] text-slate-500">
            O plano que a cadência deste formulário daria, ainda sem gravar. O que de fato existe em cada dia está no
            Calendário do projeto.
          </p>
          <table className="mt-3 w-full min-w-[640px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Dia</th>
                <th className="py-2 pr-3 font-medium">Produção</th>
                <th className="py-2 pr-3 font-medium">Aprovação</th>
                {CANAIS.map((c) => (
                  <th key={c.id} className="py-2 pr-3 font-medium">
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previa.map((d) => (
                <tr key={d.data} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 text-slate-900">
                    {NOME_DO_DIA[d.diaDaSemana]} <span className="text-slate-400">{dataCurta(d.data)}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {d.producao ? (
                      <>
                        {d.producao}
                        {d.producaoPara ? <span className="block text-slate-400">para {dataCurta(d.producaoPara)}</span> : null}
                      </>
                    ) : (
                      <span className="text-slate-300">nada</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {d.aprovacao ? `${d.aprovacao.inicio} a ${d.aprovacao.fim}` : <span className="text-slate-300">nada</span>}
                  </td>
                  {CANAIS.map((c) => {
                    const canal = d.canais[c.id];
                    return (
                      <td key={c.id} className="py-2 pr-3">
                        {canal ? (
                          <>
                            {canal.horarios.join(", ")}
                            <span className="block text-slate-400">
                              {canal.volume.minimo === canal.volume.maximo
                                ? `${canal.volume.maximo}`
                                : `${canal.volume.minimo} a ${canal.volume.maximo}`}{" "}
                              {c.volume}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-300">não publica</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function SeletorDeDias({ rotulo, dias, aoMudar }: { rotulo: string; dias: number[]; aoMudar: (dias: number[]) => void }) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap gap-1">
      {DIAS.map((d) => {
        const marcado = dias.includes(d.n);
        return (
          <label
            key={d.n}
            className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] ${
              marcado ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={marcado}
              onChange={() => aoMudar(marcado ? dias.filter((x) => x !== d.n) : [...dias, d.n])}
            />
            {d.curto}
          </label>
        );
      })}
    </div>
  );
}
