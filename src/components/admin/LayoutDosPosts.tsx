"use client";

import { useEffect, useMemo, useState } from "react";
import { assembleSlide, resolveFormatConfig } from "@/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS, mergeTokens, type CarouselTokens } from "@/lib/carousel-templates/tokens";
import { MOLDES, slideDeExemplo, type MoldeDePost } from "./moldes-de-post";
import type { ProjetoDoPainel } from "./tipos";

/**
 * O layout dos posts: qual molde o feed usa e com que cores.
 *
 * Substitui, no menu, a tela de design de carrossel. O motivo está em
 * `moldes-de-post.ts`: aquela tela mostrava os formatos do projeto anterior, e
 * o dono abriu o painel, viu cartão de tutorial em laranja e disse, com razão,
 * que não era isso que sai.
 *
 * A ordem da tela é a ordem da pergunta: primeiro QUAL molde, com a peça
 * desenhada do lado, e só depois as cores. Antes as cores vinham no topo e o
 * molde era um item de lista suspensa no meio, o que obrigava a escolher sem
 * ver.
 */

/** O preview cabe na tela em 3:4 reduzido; o grande é 3,3 vezes o pequeno. */
const ESCALA_CARTAO = 0.13;
const ESCALA_GRANDE = 0.42;

export function LayoutDosPosts({
  projeto,
  aoTrocarMoldes,
}: {
  projeto: ProjetoDoPainel;
  aoTrocarMoldes: (moldes: ProjetoDoPainel["moldes"]) => void;
}) {
  const [tokens, setTokens] = useState<CarouselTokens>(DEFAULT_TOKENS);
  const [salvos, setSalvos] = useState<CarouselTokens>(DEFAULT_TOKENS);
  const [molde, setMolde] = useState<MoldeDePost>(MOLDES[0]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [trocando, setTrocando] = useState("");

  /* Molde ausente está ligado. Ver `moldes-do-feed.ts`, do lado do servidor. */
  const ligado = (id: string) => projeto.moldes?.[id] !== false;
  const nenhumLigado = MOLDES.every((m) => !ligado(m.id));

  async function alternarMolde(id: string, novo: boolean) {
    setTrocando(id);
    setErro("");
    try {
      const r = await fetch(`/api/admin/projetos/${projeto.id}/moldes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ molde: id, ligado: novo }),
      });
      const corpo = await r.json();
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      aoTrocarMoldes(corpo.moldes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao mudar o molde.");
    } finally {
      setTrocando("");
    }
  }

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const r = await fetch("/api/admin/carousel-design");
        const corpo = await r.json();
        if (!ativo) return;
        if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);

        /*
         * Os tokens efetivos do formato `noticia`, e não o tema global: é a
         * cascata que a arte do dia realmente resolve. Mostrar o tema global
         * aqui faria a tela prometer uma cor e a peça sair com outra.
         */
        const efetivos = mergeTokens(corpo.formatTokens?.noticia ?? corpo.tokens ?? {});
        setTokens(efetivos);
        setSalvos(efetivos);
        setErro("");
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar o design.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  const mudou = useMemo(
    () => JSON.stringify(tokens.colors) !== JSON.stringify(salvos.colors),
    [tokens, salvos],
  );

  async function salvar() {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const r = await fetch("/api/admin/carousel-design", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokens: { colors: tokens.colors } }),
      });
      const corpo = await r.json();
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
      setSalvos(tokens);
      setAviso("Cores salvas. Valem a partir da próxima arte gerada.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  function restaurar() {
    setTokens({ ...tokens, colors: { ...DEFAULT_TOKENS.colors } });
    setAviso("Cores do código carregadas na tela. Salve para valerem.");
  }

  if (carregando) {
    return <p className="text-[13px] text-slate-500">Carregando o design...</p>;
  }

  return (
    <div className="space-y-8">
      <section className="admin-glass p-6">
        <h3 className="text-[15px] text-slate-900">Molde do post</h3>
        <p className="mt-1 text-[13px] text-slate-500">
          Os quatro desenhos que a esteira escolhe sozinha. Aqui você vê qual é cada um; quem
          decide no dia é o ritmo do feed.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MOLDES.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-2 transition-colors ${
                molde.id === m.id ? "border-slate-900 bg-slate-50" : "border-slate-200"
              }`}
            >
              <button
                type="button"
                onClick={() => setMolde(m)}
                className="block w-full text-left"
              >
                {/*
                  Molde desligado continua desenhado, e apagado. Esconder a peça
                  faria o painel perder a única tela onde se vê o que ela é, e
                  religar viraria escolha às cegas.
                */}
                <span className={ligado(m.id) ? "" : "block opacity-35 grayscale"}>
                  <PecaDesenhada molde={m} tokens={tokens} escala={ESCALA_CARTAO} />
                </span>
                <span className="mt-2 block text-[12px] font-medium text-slate-900">{m.nome}</span>
              </button>

              <label className="mt-1.5 flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={ligado(m.id)}
                  disabled={trocando === m.id}
                  onChange={(e) => alternarMolde(m.id, e.target.checked)}
                  className="h-3.5 w-3.5 accent-slate-900"
                />
                <span className="text-[11px] text-slate-500">
                  {ligado(m.id) ? "Em uso" : "Desligado"}
                </span>
              </label>
            </div>
          ))}
        </div>

        {!ligado("sem_foto") ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
            Com o molde <strong>Sem foto</strong> desligado, o dia em que nenhuma foto passa pelas
            barreiras fica sem post. Em 18/09 isso foi a edição inteira.
          </p>
        ) : null}
        {nenhumLigado ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
            Nenhum molde em uso: a esteira não vai produzir post nenhum.
          </p>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr]">
          <PecaDesenhada molde={molde} tokens={tokens} escala={ESCALA_GRANDE} />

          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              {molde.nome}
            </span>
            <p className="mt-2 text-[13px] text-slate-700">{molde.explica}</p>
            <p className="mt-3 text-[12px] text-slate-500">
              <strong className="font-medium text-slate-600">Quando entra:</strong>{" "}
              {ligado(molde.id) ? molde.quando : "Nunca: este molde está desligado."}
            </p>
            <p className="mt-3 text-[12px] text-slate-400">
              Variante no código: <code className="text-slate-500">{molde.variante}</code>. A foto
              e o texto acima são exemplo; a manchete real muda o corpo da letra.
            </p>
          </div>
        </div>
      </section>

      <section className="admin-glass p-6">
        <h3 className="text-[15px] text-slate-900">Cores</h3>
        <p className="mt-1 text-[13px] text-slate-500">
          Valem para os quatro moldes. O preview acima muda enquanto você edita.
        </p>

        {erro ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
            {erro}
          </div>
        ) : null}
        {aviso ? <p className="mt-4 text-[12px] text-slate-500">{aviso}</p> : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {CORES.map((c) => (
            <label key={c.chave} className="flex items-center gap-3">
              <input
                type="color"
                value={tokens.colors[c.chave]}
                onChange={(e) =>
                  setTokens({
                    ...tokens,
                    colors: { ...tokens.colors, [c.chave]: e.target.value },
                  })
                }
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-slate-200 bg-white"
                aria-label={c.nome}
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-slate-800">{c.nome}</span>
                <span className="block text-[11px] text-slate-500">{c.onde}</span>
              </span>
              <code className="ml-auto shrink-0 text-[11px] text-slate-400">
                {tokens.colors[c.chave]}
              </code>
            </label>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !mudou}
            className="admin-botao"
          >
            {salvando ? "Salvando" : "Salvar cores"}
          </button>
          <button type="button" onClick={restaurar} className="admin-botao-secundario">
            Voltar ao padrão do código
          </button>
          {mudou ? (
            <span className="text-[12px] text-slate-500">Há mudança não salva.</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const CORES: Array<{ chave: keyof CarouselTokens["colors"]; nome: string; onde: string }> = [
  { chave: "ink", nome: "Tinta", onde: "Texto principal e manchete do recorte." },
  { chave: "bg", nome: "Fundo", onde: "Fundo da peça sem foto e do recorte." },
  { chave: "accent", nome: "Destaque", onde: "A marcação sobre a palavra destacada na manchete." },
  { chave: "dark", nome: "Escuro", onde: "Cartões escuros e blocos cheios." },
  { chave: "ivory", nome: "Claro", onde: "Cartão claro sobre fundo cheio." },
  { chave: "stone", nome: "Secundário", onde: "Chapéu, crédito e texto de apoio." },
  { chave: "border", nome: "Linha", onde: "Bordas e réguas finas." },
];

/**
 * A peça, renderizada pelo mesmo código que a publica.
 *
 * O `assembleSlide` aqui é o mesmo que o worker usa antes de tirar o PNG com o
 * Playwright, então o que aparece nesta caixa é o desenho real, e não uma
 * maquete mantida à parte que envelhece em silêncio.
 */
function PecaDesenhada({
  molde,
  tokens,
  escala,
}: {
  molde: MoldeDePost;
  tokens: CarouselTokens;
  escala: number;
}) {
  const { width, height } = tokens.canvas;

  const html = useMemo(
    () =>
      assembleSlide(slideDeExemplo(molde), {
        format: "noticia",
        tokens,
        formatConfig: resolveFormatConfig("noticia"),
        slideIndex: 1,
        total: 1,
      }),
    [molde, tokens],
  );

  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      style={{ width: width * escala, height: height * escala }}
    >
      {/*
        `allow-scripts` é deliberado. A manchete se ajusta ao espaço por um
        script dentro da peça, e o preview anterior rodava com sandbox vazio:
        manchete longa aparecia estourando aqui e saía certa no Instagram, o que
        faz o painel acusar um defeito que não existe. Sem `allow-same-origin`,
        o quadro não alcança nada desta página.
      */}
      <iframe
        title={`molde ${molde.nome}`}
        srcDoc={html}
        sandbox="allow-scripts"
        scrolling="no"
        style={{
          width,
          height,
          border: 0,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
