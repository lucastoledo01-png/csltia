"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Moveable from "react-moveable";
import {
  ROTULO_DO_SLOT,
  SLOTS_DE_TEXTO,
  blocoNovo,
  orcamentoDeCaracteres,
  type Bloco,
  type Layout,
} from "@/lib/carousel-templates/layout";
import { renderLayout } from "@/lib/carousel-templates/layout-render";
import { layoutInicial } from "@/lib/carousel-templates/layouts-iniciais";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import { CAROUSEL_FORMATS, FORMAT_LABEL } from "@/lib/carousel-templates/types";
import { SAMPLE_CAROUSEL } from "@/lib/carousel-templates/sample-data";
import type { CarouselFormat, InstagramSlideType } from "@/lib/carousel-templates/types";
import { MARCA } from "@/lib/marca";

/**
 * Editor visual de layout: arrastar, redimensionar e ligar cada bloco a um slot.
 *
 * A troca que ele representa: até aqui a IA escolhia a forma **e** o conteúdo,
 * e ajustar o resultado significava mexer em token de cor ou trocar de variante
 * pronta. Aqui a forma é desenhada uma vez e a IA só preenche — o que faz o
 * resultado parar de variar de post para post.
 *
 * O preview usa `renderLayout`, a mesma função do worker. Não é uma
 * aproximação: é o slide, inclusive o auto-encolhimento do texto, que roda
 * dentro do iframe igual roda dentro do Playwright.
 */

const SLIDE_TYPE_LABEL: Record<string, string> = {
  cover: "Capa",
  intro: "Abertura",
  content: "Conteúdo",
  quote_highlight: "Citação",
  practical_impact: "Impacto",
  cta: "CTA",
  step: "Passo",
  tip: "Dica",
  gallery: "Galeria",
  personalization: "Personalização",
};

type LayoutSalvo = {
  format: string;
  slide_type: string;
  canvas: { width: number; height: number };
  blocks: Bloco[];
  enabled: boolean;
};

const CANVAS_PADRAO = { width: 1080, height: 1440 };

/** Largura do canvas na tela. A altura sai da proporção. */
const LARGURA_NA_TELA = 340;

export function AdminLayoutEditor() {
  const [formato, setFormato] = useState<CarouselFormat>("noticia");
  const [tipo, setTipo] = useState<InstagramSlideType>("cover");
  const [tiposPorFormato, setTiposPorFormato] = useState<Record<string, string[]>>({});
  const [salvos, setSalvos] = useState<LayoutSalvo[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [canvas, setCanvas] = useState(CANVAS_PADRAO);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [sujo, setSujo] = useState(false);

  // Blocos "assentados": a cópia que alimenta o preview, atualizada só quando o
  // arraste para. Sem isso o `srcDoc` do iframe trocava a cada quadro — foram
  // 11 recargas medidas num arraste de meio segundo, cada uma rebuscando as
  // fontes do Google e reexecutando o script de encaixe. O preview piscava em
  // branco o tempo todo, e a sensação era de que o bloco sumia.
  const [assentados, setAssentados] = useState<Bloco[]>([]);

  // Elemento em estado, não em ref: o Moveable precisa do nó durante o render
  // para se ancorar, e ler `ref.current` ali é justamente o que o React proíbe
  // (o valor pode estar defasado numa renderização concorrente).
  const [areaEl, setAreaEl] = useState<HTMLDivElement | null>(null);

  // A aba corrente vive também em ref porque `carregar` é estável (useCallback
  // sem dependências) e precisa saber qual aba posicionar quando a resposta
  // chega. Passar formato/tipo como dependência recriaria a função a cada
  // troca de aba e refaria o fetch por nada.
  const formatoRef = useRef<CarouselFormat>(formato);
  const tipoRef = useRef<InstagramSlideType>(tipo);

  /**
   * Põe na mesa o desenho salvo de uma combinação, ou uma mesa limpa.
   *
   * É função e não efeito de propósito: sincronizar estado derivado dentro de
   * `useEffect` provoca render em cascata, e o React avisa. Aqui a troca de aba
   * é um evento — quem clicou sabe que está trocando —, então o carregamento
   * acontece no próprio clique.
   */
  function aplicar(lista: LayoutSalvo[], f: CarouselFormat, t: InstagramSlideType) {
    const salvo = lista.find((l) => l.format === f && l.slide_type === t);
    const desenho = salvo ? structuredClone(salvo.blocks) : [];
    setBlocos(desenho);
    setAssentados(desenho);
    setCanvas(salvo?.canvas ?? CANVAS_PADRAO);
    setSelecionado(null);
    setSujo(false);
  }

  function trocarPara(f: CarouselFormat, t: InstagramSlideType) {
    formatoRef.current = f;
    tipoRef.current = t;
    setFormato(f);
    setTipo(t);
    aplicar(salvos, f, t);
  }

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/carousel-layouts");
      const json = await res.json();
      if (res.ok && json.ok) {
        const lista: LayoutSalvo[] = json.layouts ?? [];
        setSalvos(lista);
        setTiposPorFormato(json.slideTypesByFormat ?? {});
        aplicar(lista, formatoRef.current, tipoRef.current);
      } else {
        setAviso(json.error ?? "Não consegui carregar os layouts.");
      }
    } catch (err) {
      setAviso(`Falha ao carregar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      if (!cancelado) await carregar();
    })();
    return () => {
      cancelado = true;
    };
  }, [carregar]);

  const tiposDoFormato = tiposPorFormato[formato] ?? ["cover"];

  const alturaNaTela = Math.round((LARGURA_NA_TELA * canvas.height) / canvas.width);

  const bloco = blocos.find((b) => b.id === selecionado) ?? null;

  /**
   * `assentar: false` durante o arraste — o preview só acompanha quando para.
   * Todo o resto (campo numérico, cor, slot) assenta na hora: são mudanças
   * pontuais, e ver o efeito imediatamente é o ponto de ter um preview.
   */
  function atualizar(id: string, patch: Partial<Bloco>, assentar = true) {
    setBlocos((prev) => {
      const proximo = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
      if (assentar) setAssentados(proximo);
      return proximo;
    });
    setSujo(true);
  }

  /** Fim de arraste ou de redimensionamento: agora o preview pode acompanhar. */
  function assentarAgora() {
    setBlocos((prev) => {
      setAssentados(prev);
      return prev;
    });
  }

  /**
   * Traz o esqueleto do tipo de slide para a mesa.
   *
   * Tela em branco é o pior ponto de partida para desenhar: a primeira decisão
   * vira "onde fica o título?", quando a resposta que já funciona está no ar.
   * Não grava nada — quem gostar salva, quem não gostar apaga e desenha do
   * zero.
   */
  function comecarDoPadrao() {
    const base = layoutInicial(tipo);
    setBlocos(base.blocks);
    setAssentados(base.blocks);
    setCanvas(base.canvas);
    setSelecionado(null);
    setSujo(true);
    setAviso("Ponto de partida carregado. Ajuste e salve — nada foi gravado ainda.");
  }

  function adicionar(tipoDeBloco: Bloco["tipo"]) {
    const z = blocos.length === 0 ? 1 : Math.max(...blocos.map((b) => b.z)) + 1;
    const novo = blocoNovo(tipoDeBloco, z);
    setBlocos((prev) => {
      const proximo = [...prev, novo];
      setAssentados(proximo);
      return proximo;
    });
    setSelecionado(novo.id);
    setSujo(true);
  }

  function remover(id: string) {
    setBlocos((prev) => {
      const proximo = prev.filter((b) => b.id !== id);
      setAssentados(proximo);
      return proximo;
    });
    setSelecionado(null);
    setSujo(true);
  }

  // --- geometria -------------------------------------------------------------

  /** Retângulo do canvas na tela. Tudo que vem do Moveable é px e vira %. */
  function caixaDaArea() {
    return areaEl?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  function pxParaPercentual(px: { x?: number; y?: number; w?: number; h?: number }) {
    const r = caixaDaArea();
    // Duas casas: a prancheta tem 340px de largura, então 0,01% é um terço de
    // pixel — abaixo disso é ruído de arraste, não posicionamento. E campo
    // numérico mostrando "13,0573%" atrapalha quem quer digitar um valor.
    const cento = (v: number, base: number) => Math.round((v / base) * 10000) / 100;
    return {
      ...(px.x !== undefined ? { x: cento(px.x, r.width) } : {}),
      ...(px.y !== undefined ? { y: cento(px.y, r.height) } : {}),
      ...(px.w !== undefined ? { w: cento(px.w, r.width) } : {}),
      ...(px.h !== undefined ? { h: cento(px.h, r.height) } : {}),
    };
  }

  /** Alvos de encaixe: os outros blocos. É o que alinha um ao outro sozinho. */
  const guias = blocos
    .filter((b) => b.id !== selecionado)
    .map((b) => `[data-bloco="${b.id}"]`);

  // --- preview ---------------------------------------------------------------

  const html = useMemo(() => {
    // O preview usa a amostra do formato: texto de tamanho realista é o que
    // faz o auto-encolhimento aparecer aqui em vez de só na publicação.
    const amostra = SAMPLE_CAROUSEL[formato];
    const slide = amostra.slides.find((s) => s.type === tipo) ?? amostra.slides[0] ?? null;
    if (!slide || assentados.length === 0) return "";

    const layout: Layout = { canvas, blocks: assentados };
    const corpo = renderLayout(layout, slide, {
      tokens: DEFAULT_TOKENS,
      eyebrowLabel: DEFAULT_TOKENS.eyebrows[formato].label,
      ctaText: DEFAULT_TOKENS.cta[formato].text,
      slideIndex: slide.index,
      total: amostra.slides.length,
    });

    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700;800;900&family=Playfair+Display:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;600;800&family=JetBrains+Mono:wght@400;700&display=swap">` +
      `<style>html,body{margin:0;padding:0;width:100%;height:100%}` +
      `.lay-bloco{position:absolute;box-sizing:border-box}` +
      `.lay-texto{overflow-wrap:break-word}.lay-texto>span{display:block;width:100%}</style>` +
      `</head><body>${corpo}</body></html>`
    );
  }, [assentados, canvas, formato, tipo]);

  // --- persistência ----------------------------------------------------------

  async function salvar() {
    setSalvando(true);
    setAviso("");
    try {
      const res = await fetch("/api/admin/carousel-layouts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: formato, slideType: tipo, canvas, blocks: blocos }),
      });
      const json = await res.json();
      setAviso(res.ok && json.ok ? "Layout salvo. Os próximos posts já usam." : json.error ?? "Erro ao salvar.");
      if (res.ok && json.ok) {
        setSujo(false);
        await carregar();
      }
    } catch (err) {
      setAviso(`Falha ao salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    setSalvando(true);
    try {
      const res = await fetch(
        `/api/admin/carousel-layouts?format=${formato}&slideType=${tipo}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      setAviso(
        res.ok && json.ok
          ? "Desenho apagado. Este slide volta a usar o template de código."
          : json.error ?? "Erro ao apagar.",
      );
      await carregar();
    } catch (err) {
      setAviso(`Falha ao apagar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="py-8 text-center text-sm text-slate-500">Carregando o editor…</div>;
  }

  const temDesenhoSalvo = salvos.some((l) => l.format === formato && l.slide_type === tipo);

  return (
    <div className="space-y-5">
      <div className="admin-glass flex flex-wrap items-start justify-between gap-4 rounded-3xl p-6">
        <div>
          <h3 className="text-2xl text-slate-900">Editor de layout</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Desenhe o slide uma vez e a IA só preenche os blocos. Cada bloco de texto
            aponta para um <strong>slot</strong> — título, chapéu, corpo — e o texto que
            a IA escrever entra ali, encolhendo sozinho se não couber. O que você desenha
            aqui é exatamente o que o worker publica.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {temDesenhoSalvo ? (
            <button
              onClick={apagar}
              disabled={salvando}
              className="rounded-full bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
            >
              Apagar desenho
            </button>
          ) : null}
          <button
            onClick={salvar}
            disabled={salvando || !sujo}
            className="rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar layout"}
          </button>
        </div>
      </div>

      {aviso ? (
        <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-700">
          {aviso}
        </p>
      ) : null}

      <div className="admin-glass rounded-3xl p-6">
        <div className="flex flex-wrap gap-2">
          {CAROUSEL_FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => trocarPara(f, (tiposPorFormato[f]?.[0] ?? "cover") as InstagramSlideType)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                formato === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {tiposDoFormato.map((t) => {
            const desenhado = salvos.some((l) => l.format === formato && l.slide_type === t);
            return (
              <button
                key={t}
                onClick={() => trocarPara(formato, t as InstagramSlideType)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  tipo === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {SLIDE_TYPE_LABEL[t] ?? t}
                {desenhado ? " ●" : ""}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[auto_auto_minmax(300px,1fr)]">
          {/* ---- canvas de edição ---- */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Desenho</p>
            <div
              ref={setAreaEl}
              onClick={() => setSelecionado(null)}
              className="relative select-none rounded-xl border-2 border-dashed border-slate-300 bg-slate-100"
              style={{ width: LARGURA_NA_TELA, height: alturaNaTela }}
            >
              {[...blocos]
                .sort((a, b) => a.z - b.z)
                .map((b) => (
                  <div
                    key={b.id}
                    data-bloco={b.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelecionado(b.id);
                    }}
                    className={`absolute cursor-move overflow-hidden text-[9px] leading-tight ${
                      selecionado === b.id ? "" : "outline outline-1 outline-slate-400/60"
                    }`}
                    style={{
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      width: `${b.w}%`,
                      height: `${b.h}%`,
                      background:
                        b.tipo === "imagem"
                          ? "repeating-linear-gradient(45deg,#d4d4d8,#d4d4d8 4px,#e4e4e7 4px,#e4e4e7 8px)"
                          : b.tipo === "forma"
                            ? b.fundo || "#a1a1aa"
                            : "rgba(99,102,241,0.14)",
                      zIndex: b.z,
                    }}
                  >
                    <span className="pointer-events-none block px-1 pt-0.5 font-bold text-slate-700">
                      {b.tipo === "texto"
                        ? (ROTULO_DO_SLOT[b.slot ?? "titulo"] ?? b.slot)
                        : b.tipo === "imagem"
                          ? b.imagem === "fundo"
                            ? "imagem de fundo"
                            : "imagem fixa"
                          : "forma"}
                    </span>
                  </div>
                ))}

              {blocos.length === 0 ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[11px] text-slate-400">
                  Sem desenho — este slide usa o template de código. Comece do padrão e
                  ajuste, ou monte bloco a bloco.
                </p>
              ) : null}
            </div>

            {/*
              O Moveable cuida de arrastar, redimensionar, encaixar e desenhar
              as guias. Escrever isso à mão foi o erro anterior: o que parecia
              "só matemática de porcentagem" tem alça, limite de área, snap,
              linha-guia e captura de ponteiro — e cada pedaço tem um jeito
              errado de dar errado.

              Fica fora do canvas porque ele se posiciona sozinho pelo alvo.
            */}
            {bloco ? (
              <Moveable
                target={`[data-bloco="${bloco.id}"]`}
                container={areaEl}
                draggable
                resizable
                throttleDrag={0}
                origin={false}
                keepRatio={false}
                snappable
                snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
                elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
                elementGuidelines={guias}
                // Limites da área: um bloco arrastado para fora da prancheta
                // continua no desenho e some da vista, o que parece bug.
                bounds={{ left: 0, top: 0, right: 0, bottom: 0, position: "css" }}
                snapThreshold={5}
                onDrag={({ left, top }) => {
                  atualizar(bloco.id, pxParaPercentual({ x: left, y: top }), false);
                }}
                onDragEnd={assentarAgora}
                onResize={({ width, height, drag }) => {
                  atualizar(
                    bloco.id,
                    {
                      ...pxParaPercentual({ w: width, h: height }),
                      ...pxParaPercentual({ x: drag.left, y: drag.top }),
                    },
                    false,
                  );
                }}
                onResizeEnd={assentarAgora}
              />
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={comecarDoPadrao}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                title="Carrega o esqueleto deste tipo de slide para você ajustar. Não grava nada."
              >
                {blocos.length === 0 ? "Começar do padrão" : "Recomeçar do padrão"}
              </button>
              <button
                onClick={() => adicionar("texto")}
                className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
              >
                + Texto
              </button>
              <button
                onClick={() => adicionar("imagem")}
                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                + Imagem
              </button>
              <button
                onClick={() => adicionar("forma")}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                + Forma
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Clique para selecionar; arraste para mover; as alças redimensionam. Os
              blocos se alinham sozinhos entre si e com o centro da arte — as linhas
              rosa mostram o encaixe. O preview atualiza quando você solta.
            </p>
          </div>

          {/* ---- preview real ---- */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Como vai sair
            </p>
            {html ? (
              <iframe
                title="preview"
                srcDoc={html}
                sandbox="allow-scripts"
                className="rounded-xl border border-slate-200 bg-white"
                style={{
                  width: LARGURA_NA_TELA,
                  height: alturaNaTela,
                  transform: `scale(1)`,
                }}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center text-[11px] text-slate-400"
                style={{ width: LARGURA_NA_TELA, height: alturaNaTela }}
              >
                O preview aparece quando houver ao menos um bloco.
              </div>
            )}
          </div>

          {/* ---- propriedades ---- */}
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Bloco selecionado
            </p>
            {bloco ? (
              <PainelDoBloco
                bloco={bloco}
                canvas={canvas}
                onChange={(patch) => atualizar(bloco.id, patch)}
                onRemove={() => remover(bloco.id)}
              />
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                Clique num bloco para editar.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
      {rotulo}
      <div className="mt-1 font-normal normal-case">{children}</div>
    </label>
  );
}

const entrada =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none";

function PainelDoBloco({
  bloco,
  canvas,
  onChange,
  onRemove,
}: {
  bloco: Bloco;
  canvas: { width: number; height: number };
  onChange: (patch: Partial<Bloco>) => void;
  onRemove: () => void;
}) {
  const orcamento = orcamentoDeCaracteres(bloco, canvas);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-4 gap-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <Campo key={k} rotulo={k}>
            <input
              type="number"
              className={entrada}
              value={Math.round(bloco[k] * 10) / 10}
              onChange={(e) => onChange({ [k]: Number(e.target.value) } as Partial<Bloco>)}
            />
          </Campo>
        ))}
      </div>

      {bloco.tipo === "texto" ? (
        <>
          <Campo rotulo="Slot — de onde vem o texto">
            <select
              className={entrada}
              value={bloco.slot ?? "titulo"}
              onChange={(e) => onChange({ slot: e.target.value as Bloco["slot"] })}
            >
              {SLOTS_DE_TEXTO.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_DO_SLOT[s]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Texto fixo (vence o slot; deixe vazio para a IA preencher)">
            <input
              className={entrada}
              value={bloco.textoFixo}
              placeholder={`ex.: ${MARCA.nome}`}
              onChange={(e) => onChange({ textoFixo: e.target.value })}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Fonte">
              <select
                className={entrada}
                value={bloco.fonte}
                onChange={(e) => onChange({ fonte: e.target.value as Bloco["fonte"] })}
              >
                <option value="display">Display</option>
                <option value="body">Corpo</option>
                <option value="accent">Destaque</option>
                <option value="mono">Mono</option>
              </select>
            </Campo>
            <Campo rotulo="Cor">
              <input
                type="color"
                className="h-8 w-full rounded-lg border border-slate-200"
                value={bloco.cor}
                onChange={(e) => onChange({ cor: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Tamanho (px)">
              <input
                type="number"
                className={entrada}
                value={bloco.tamanho}
                onChange={(e) => onChange({ tamanho: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Mínimo ao encolher">
              <input
                type="number"
                className={entrada}
                value={bloco.tamanhoMinimo}
                onChange={(e) => onChange({ tamanhoMinimo: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Peso">
              <input
                type="number"
                step={100}
                className={entrada}
                value={bloco.peso}
                onChange={(e) => onChange({ peso: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Entrelinha">
              <input
                type="number"
                step={0.05}
                className={entrada}
                value={bloco.entrelinha}
                onChange={(e) => onChange({ entrelinha: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Alinhamento">
              <select
                className={entrada}
                value={bloco.alinhamento}
                onChange={(e) => onChange({ alinhamento: e.target.value as Bloco["alinhamento"] })}
              >
                <option value="left">Esquerda</option>
                <option value="center">Centro</option>
                <option value="right">Direita</option>
              </select>
            </Campo>
            <Campo rotulo="Vertical">
              <select
                className={entrada}
                value={bloco.alinhamentoVertical}
                onChange={(e) =>
                  onChange({ alinhamentoVertical: e.target.value as Bloco["alinhamentoVertical"] })
                }
              >
                <option value="start">Topo</option>
                <option value="center">Meio</option>
                <option value="end">Base</option>
              </select>
            </Campo>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={bloco.caixaAlta}
              onChange={(e) => onChange({ caixaAlta: e.target.checked })}
            />
            Caixa alta
          </label>

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
            Cabem cerca de <strong>{orcamento} caracteres</strong> nesta caixa no tamanho
            atual. Acima disso o texto encolhe sozinho até {bloco.tamanhoMinimo}px — e
            abaixo disso o excesso é cortado, porque texto menor que isso ninguém lê.
          </p>
        </>
      ) : null}

      {bloco.tipo === "imagem" ? (
        <>
          <Campo rotulo="Origem">
            <select
              className={entrada}
              value={bloco.imagem ?? "fundo"}
              onChange={(e) => onChange({ imagem: e.target.value as Bloco["imagem"] })}
            >
              <option value="fundo">Imagem gerada pela IA (capa/resultado)</option>
              <option value="fixa">URL fixa</option>
            </select>
          </Campo>
          {bloco.imagem === "fixa" ? (
            <Campo rotulo="URL">
              <input
                className={entrada}
                value={bloco.imagemUrl}
                onChange={(e) => onChange({ imagemUrl: e.target.value })}
              />
            </Campo>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Encaixe">
              <select
                className={entrada}
                value={bloco.encaixe}
                onChange={(e) => onChange({ encaixe: e.target.value as Bloco["encaixe"] })}
              >
                <option value="cover">Preencher (corta)</option>
                <option value="contain">Caber inteira</option>
              </select>
            </Campo>
            <Campo rotulo="Véu escuro">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="w-full"
                value={bloco.veu}
                onChange={(e) => onChange({ veu: Number(e.target.value) })}
              />
            </Campo>
          </div>
          <p className="text-[10px] leading-4 text-slate-500">
            O véu é o que garante texto legível sobre a foto. Qual imagem vai sair é
            decisão da IA — sem véu, uma manchete branca some numa foto clara.
          </p>
        </>
      ) : null}

      {bloco.tipo === "forma" ? (
        <Campo rotulo="Cor">
          <input
            type="color"
            className="h-8 w-full rounded-lg border border-slate-200"
            value={bloco.fundo || "#18181b"}
            onChange={(e) => onChange({ fundo: e.target.value })}
          />
        </Campo>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Campo rotulo="Raio">
          <input
            type="number"
            className={entrada}
            value={bloco.raio}
            onChange={(e) => onChange({ raio: Number(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Opacidade">
          <input
            type="number"
            step={0.05}
            min={0}
            max={1}
            className={entrada}
            value={bloco.opacidade}
            onChange={(e) => onChange({ opacidade: Number(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Camada (z)">
          <input
            type="number"
            className={entrada}
            value={bloco.z}
            onChange={(e) => onChange({ z: Number(e.target.value) })}
          />
        </Campo>
      </div>

      <button
        onClick={onRemove}
        className="w-full rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
      >
        Remover bloco
      </button>
    </div>
  );
}
