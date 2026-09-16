"use client";

import { useEffect, useMemo, useState } from "react";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import type { CarouselTokens } from "@/lib/carousel-templates/tokens";
import type { FormatConfig } from "@/lib/carousel-templates/types";
import type {
  CarouselFormat,
  InstagramCarouselContent,
  InstagramSlide,
  InstagramSlideType,
} from "@/lib/server/social/instagram/schemas";

type FormatDefault = {
  allowedSlideTypes: InstagramSlideType[];
  variantBySlideType: Partial<Record<InstagramSlideType, string>>;
};

type Payload = {
  tokens: CarouselTokens;
  /** Tokens efetivos de cada formato: tema global + override do formato. */
  formatTokens: Record<CarouselFormat, CarouselTokens>;
  /** Só o que o formato sobrescreve — o que o botão de restaurar apaga. */
  formatTokenOverrides: Record<CarouselFormat, OverrideDeTokens>;
  defaultTokens: CarouselTokens;
  formatConfigs: Record<CarouselFormat, FormatConfig>;
  formatDefaults: Record<CarouselFormat, FormatDefault>;
  variantCatalog: Record<string, Array<{ key: string; label: string }>>;
  sampleData: Record<CarouselFormat, InstagramCarouselContent>;
};

const FORMATS: Array<{ id: CarouselFormat; label: string }> = [
  { id: "noticia", label: "Notícia" },
  { id: "tutorial", label: "Tutorial" },
  { id: "prompt", label: "Prompt" },
];

const SLIDE_TYPE_LABEL: Record<string, string> = {
  cover: "Capa",
  intro: "Intro",
  content: "Conteúdo",
  quote_highlight: "Citação",
  practical_impact: "Como aplicar",
  step: "Passo",
  tip: "Dica",
  gallery: "Galeria",
  personalization: "Personalização",
  cta: "CTA",
};

const PREVIEW_SCALE = 0.25;

/**
 * O que um formato sobrescreve do tema global.
 *
 * Não é `Partial<CarouselTokens>`: aquele torna `colors` opcional como bloco,
 * mas continua exigindo as sete cores juntas. Aqui cada cor é opcional
 * sozinha, que é como o painel edita — e como o `deepMerge` do servidor
 * consome.
 */
type OverrideDeTokens = {
  canvas?: Partial<CarouselTokens["canvas"]>;
  chrome?: CarouselTokens["chrome"];
  fonts?: Partial<CarouselTokens["fonts"]>;
  colors?: Partial<CarouselTokens["colors"]>;
};

/** Aplica só as chaves realmente definidas do override sobre a base. */
function sobrepor<T extends object>(base: T, over?: Partial<T>): T {
  const saida = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    if (v !== undefined) (saida as Record<string, unknown>)[k] = v;
  }
  return saida;
}

export function AdminCarouselDesignManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState<CarouselFormat>("noticia");
  const [showTokens, setShowTokens] = useState(true);

  // cópias editáveis
  const [tokens, setTokens] = useState<CarouselTokens | null>(null);
  // Override por formato. É o que permite `tutorial` claro e `noticia` escuro:
  // um `--s-bg` só não pode ser #fafafa e #18181b ao mesmo tempo.
  const [porFormato, setPorFormato] = useState<Record<string, OverrideDeTokens> | null>(null);
  const [configs, setConfigs] = useState<Record<CarouselFormat, FormatConfig> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/carousel-design");
      const json = (await res.json()) as Payload & { ok: boolean };
      if (json.ok) {
        setData(json);
        setTokens(structuredClone(json.tokens));
        setConfigs(structuredClone(json.formatConfigs));
        setPorFormato(structuredClone(json.formatTokenOverrides ?? {}));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const dirty = useMemo(() => {
    if (!data || !tokens || !configs) return false;
    return (
      JSON.stringify(tokens) !== JSON.stringify(data.tokens) ||
      JSON.stringify(configs) !== JSON.stringify(data.formatConfigs) ||
      JSON.stringify(porFormato) !== JSON.stringify(data.formatTokenOverrides ?? {})
    );
  }, [data, tokens, configs, porFormato]);

  if (loading || !data || !tokens || !configs || !porFormato) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando design dos carrosséis…</div>;
  }

  // Cascata na tela, igual à do servidor: tema global sob o override do formato.
  //
  // O spread cru não serve: uma chave presente com valor `undefined` no
  // override apagaria a cor do tema, e o resultado renderizaria `undefined` no
  // CSS. `sobrepor` ignora as ausentes.
  const overrideDoFormato = porFormato[activeFormat] ?? {};
  const tokensEfetivos: CarouselTokens = {
    ...tokens,
    colors: sobrepor(tokens.colors, overrideDoFormato.colors),
    fonts: sobrepor(tokens.fonts, overrideDoFormato.fonts),
    canvas: sobrepor(tokens.canvas, overrideDoFormato.canvas),
    chrome: overrideDoFormato.chrome ?? tokens.chrome,
  };

  function ajustarCorDoFormato(chave: keyof CarouselTokens["colors"], valor: string) {
    setPorFormato((prev) => {
      const next = { ...(prev ?? {}) };
      const atual = { ...(next[activeFormat] ?? {}) };
      atual.colors = { ...(atual.colors ?? {}), [chave]: valor };
      next[activeFormat] = atual;
      return next;
    });
  }

  function limparOverrideDoFormato() {
    setPorFormato((prev) => ({ ...(prev ?? {}), [activeFormat]: {} }));
  }

  const fmtDefault = data.formatDefaults[activeFormat];
  const fmtConfig = configs[activeFormat];
  const sample = data.sampleData[activeFormat];

  function updateVariant(slideType: InstagramSlideType, variantKey: string) {
    setConfigs((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next[activeFormat].variantBySlideType = {
        ...next[activeFormat].variantBySlideType,
        [slideType]: variantKey,
      };
      return next;
    });
  }

  function updateFormatText(field: "eyebrowLabel" | "ctaText", value: string) {
    setConfigs((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next[activeFormat][field] = value || null;
      return next;
    });
  }

  function setColor(path: string, value: string) {
    setTokens((prev) => (prev ? applyPath(prev, path, value) : prev));
  }
  function setNumber(path: string, value: number) {
    setTokens((prev) => (prev ? applyPath(prev, path, value) : prev));
  }

  async function save() {
    if (!tokens || !configs) return;
    setSaving(true);
    setMessage(null);
    try {
      const puts: Promise<Response>[] = [];
      if (JSON.stringify(tokens) !== JSON.stringify(data!.tokens)) {
        puts.push(putJson({ tokens }));
      }
      for (const f of FORMATS) {
        if (JSON.stringify(configs[f.id]) !== JSON.stringify(data!.formatConfigs[f.id])) {
          puts.push(
            putJson({
              format: f.id,
              variantBySlideType: configs[f.id].variantBySlideType,
              eyebrowLabel: configs[f.id].eyebrowLabel ?? "",
              ctaText: configs[f.id].ctaText ?? "",
            }),
          );
        }

        const antes = (data!.formatTokenOverrides ?? {})[f.id] ?? {};
        const agora = porFormato![f.id] ?? {};
        if (JSON.stringify(antes) !== JSON.stringify(agora)) {
          // `formatTokens: true` diz ao servidor que estes tokens são override
          // do formato, não tema global — os dois usam a mesma chave.
          puts.push(putJson({ format: f.id, tokens: agora, formatTokens: true }));
        }
      }
      const results = await Promise.all(puts);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        setMessage(`Erro ao salvar: ${body.error ?? failed.status}`);
      } else {
        setMessage("Salvo.");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function resetTokens() {
    if (!confirm("Restaurar todos os tokens de design pro padrão?")) return;
    await fetch("/api/admin/carousel-design?scope=tokens", { method: "DELETE" });
    await load();
    setMessage("Tokens restaurados.");
  }

  async function resetFormat() {
    if (!confirm(`Restaurar o formato "${activeFormat}" pro padrão?`)) return;
    await fetch(`/api/admin/carousel-design?scope=format&format=${activeFormat}`, { method: "DELETE" });
    await load();
    setMessage(`Formato ${activeFormat} restaurado.`);
  }

  return (
    <div className="space-y-6">
      <div className="admin-glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6">
        <div>
          <h3 className="text-2xl text-slate-900">Design dos carrosséis</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Ajuste as cores, a tipografia e a variante de layout de cada tipo de slide. O preview
            usa o mesmo motor que renderiza os posts de verdade. Nada aqui edita HTML.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
          {message}
        </div>
      ) : null}

      {/* ---- painel de tokens ---- */}
      <div className="admin-glass rounded-3xl p-6">
        <button
          onClick={() => setShowTokens((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-lg font-semibold text-slate-900">Tokens globais</span>
          <span className="text-xs text-slate-400">{showTokens ? "ocultar" : "mostrar"}</span>
        </button>

        {showTokens ? (
          <div className="mt-5 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {(
                [
                  ["colors.bg", "Fundo"],
                  ["colors.ivory", "Cartão claro"],
                  ["colors.ink", "Texto"],
                  ["colors.stone", "Texto 2"],
                  ["colors.accent", "Accent"],
                  ["colors.dark", "Cartão escuro"],
                  ["colors.border", "Borda"],
                ] as const
              ).map(([path, label]) => (
                <ColorField
                  key={path}
                  label={label}
                  value={getPath(tokens, path) as string}
                  onChange={(v) => setColor(path, v)}
                />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {(
                [
                  ["type.displayLg", "Título capa"],
                  ["type.displayMd", "Título conteúdo"],
                  ["type.body", "Corpo"],
                  ["type.mono", "Código"],
                  ["radius", "Raio do cartão"],
                  ["cardPadding", "Padding do cartão"],
                ] as const
              ).map(([path, label]) => (
                <NumberField
                  key={path}
                  label={label}
                  value={getPath(tokens, path) as number}
                  onChange={(v) => setNumber(path, v)}
                />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {FORMATS.map((f) => (
                <div key={f.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{f.label} — eyebrow</p>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={getPath(tokens, `eyebrows.${f.id}.label`) as string}
                    onChange={(e) => setColor(`eyebrows.${f.id}.label`, e.target.value)}
                  />
                  <div className="mt-3 flex gap-3">
                    <ColorField
                      label="fundo"
                      value={getPath(tokens, `eyebrows.${f.id}.bg`) as string}
                      onChange={(v) => setColor(`eyebrows.${f.id}.bg`, v)}
                    />
                    <ColorField
                      label="texto"
                      value={getPath(tokens, `eyebrows.${f.id}.fg`) as string}
                      onChange={(v) => setColor(`eyebrows.${f.id}.fg`, v)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={resetTokens} className="text-xs font-semibold text-rose-600 hover:underline">
              Restaurar tokens pro padrão
            </button>
          </div>
        ) : null}
      </div>

      {/* ---- abas de formato ---- */}
      <div className="admin-glass rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFormat(f.id)}
                className={`rounded-full px-4 py-2 text-xs font-bold ${
                  activeFormat === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={resetFormat} className="text-xs font-semibold text-rose-600 hover:underline">
            Restaurar formato
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Eyebrow (sobrescreve o token)
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case"
              placeholder={tokens.eyebrows[activeFormat].label}
              value={fmtConfig.eyebrowLabel ?? ""}
              onChange={(e) => updateFormatText("eyebrowLabel", e.target.value)}
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Texto do CTA
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case"
              placeholder={tokens.cta[activeFormat].text}
              value={fmtConfig.ctaText ?? ""}
              onChange={(e) => updateFormatText("ctaText", e.target.value)}
            />
          </label>
        </div>

        {/* ---- cores só deste formato ---- */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800">Cores deste formato</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Sobrescreve o tema global só em <strong>{FORMATS.find((f) => f.id === activeFormat)?.label}</strong>.
                É o que permite o tutorial claro e a notícia escura ao mesmo tempo — um
                token global sozinho não consegue ser as duas coisas. Campo em branco
                herda o tema.
              </p>
            </div>
            {Object.keys(overrideDoFormato).length > 0 ? (
              <button
                onClick={limparOverrideDoFormato}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Voltar a herdar o tema
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(
              [
                ["bg", "Fundo"],
                ["ivory", "Cartão claro"],
                ["ink", "Texto"],
                ["stone", "Texto 2"],
                ["accent", "Accent"],
                ["dark", "Cartão escuro"],
                ["border", "Borda"],
              ] as const
            ).map(([chave, label]) => (
              <ColorField
                key={chave}
                label={
                  overrideDoFormato.colors?.[chave] ? `${label} ·` : label
                }
                value={tokensEfetivos.colors[chave]}
                onChange={(v) => ajustarCorDoFormato(chave, v)}
              />
            ))}
          </div>

          <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Moldura
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case sm:w-64"
              value={overrideDoFormato.chrome ?? ""}
              onChange={(e) =>
                setPorFormato((prev) => {
                  const next = { ...(prev ?? {}) };
                  const atual = { ...(next[activeFormat] ?? {}) };
                  const v = e.target.value;
                  if (v) atual.chrome = v as CarouselTokens["chrome"];
                  else delete atual.chrome;
                  next[activeFormat] = atual;
                  return next;
                })
              }
            >
              <option value="">herda o tema ({tokens.chrome})</option>
              <option value="editorial">editorial — cantos e trilho</option>
              <option value="social">social — cabeçalho e rodapé</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {fmtDefault.allowedSlideTypes.map((slideType) => {
            const variants = data.variantCatalog[slideType] ?? [];
            const currentVariant =
              fmtConfig.variantBySlideType[slideType] ?? variants[0]?.key ?? "";
            const previewSlide = pickSampleSlide(sample, slideType);
            const html = assembleSlide(previewSlide, {
              format: activeFormat,
              // Efetivos, não globais: o preview tem que mostrar o que vai ser
              // publicado, e o formato pode sobrescrever o tema.
              tokens: tokensEfetivos,
              formatConfig: fmtConfig,
              slideIndex: previewSlide.index,
              total: sample.slides.length,
            });

            return (
              <div key={slideType} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">
                    {SLIDE_TYPE_LABEL[slideType] ?? slideType}
                  </span>
                </div>

                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  value={currentVariant}
                  onChange={(e) => updateVariant(slideType, e.target.value)}
                >
                  {variants.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </select>

                <div
                  className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  style={{ width: 1080 * PREVIEW_SCALE, height: 1350 * PREVIEW_SCALE }}
                >
                  <iframe
                    title={`preview ${activeFormat} ${slideType}`}
                    srcDoc={html}
                    sandbox=""
                    scrolling="no"
                    style={{
                      width: 1080,
                      height: 1350,
                      border: 0,
                      transform: `scale(${PREVIEW_SCALE})`,
                      transformOrigin: "top left",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function putJson(body: unknown) {
  return fetch("/api/admin/carousel-design", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pickSampleSlide(sample: InstagramCarouselContent, type: InstagramSlideType): InstagramSlide {
  const found = sample.slides.find((s) => s.type === type);
  if (found) return found;
  return {
    index: 1,
    type,
    eyebrow: "",
    title: "Título de exemplo para o preview deste slide",
    body: "Texto de exemplo usado só na pré-visualização.",
    bullet_points: ["Item de exemplo 1", "Item de exemplo 2"],
    highlight_text: "PALAVRA",
    variant: "",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "",
    cta_text: "",
  };
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-slate-200"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
        />
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-500">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
      />
    </label>
  );
}

// -- helpers de path em objeto ("colors.bg", "eyebrows.noticia.label") --

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function applyPath<T>(obj: T, path: string, value: unknown): T {
  const next = structuredClone(obj) as Record<string, unknown>;
  const keys = path.split(".");
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor[keys[i]] = { ...(cursor[keys[i]] as Record<string, unknown>) };
    cursor = cursor[keys[i]] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return next as T;
}
