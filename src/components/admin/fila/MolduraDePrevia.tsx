"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Um iframe que cresce até a altura do conteúdo, com um teto recolhível.
 *
 * As duas prévias da fila (o e-mail e a matéria) são da nossa origem, então o
 * painel consegue medir o documento depois de carregado. Uma janela de altura
 * fixa dentro de uma página que já rola é o pior dos dois mundos no celular:
 * dois dedos para ler um texto. Por isso a prévia mostra o começo, e "ver
 * inteira" a abre na altura toda, como uma página só.
 *
 * O e-mail chega com `sandbox` sem `allow-scripts`: o HTML da redação não roda
 * nada na sessão do dono. `allow-same-origin` fica, e é o que deixa medir a
 * altura; sem script dentro, a mesma origem não dá poder nenhum ao conteúdo.
 */
export function MolduraDePrevia({
  src,
  titulo,
  largura,
  alturaRecolhida = 760,
  sandbox,
  rotuloDeAbrir = "Ver inteira",
}: {
  src: string;
  titulo: string;
  /** Largura em px; ausente ocupa a coluna inteira. */
  largura?: number;
  alturaRecolhida?: number;
  sandbox?: string;
  rotuloDeAbrir?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState<number | null>(null);
  const [aberta, setAberta] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const medir = useCallback(() => {
    try {
      const doc = ref.current?.contentDocument;
      if (!doc?.documentElement) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
      if (h > 0) setAltura(h);
    } catch {
      // Sem acesso ao documento (outra origem): fica a altura recolhida, com rolagem própria.
    }
  }, []);

  // A largura muda a altura (o e-mail no tamanho do celular fica mais comprido).
  useEffect(() => {
    const t = setTimeout(medir, 120);
    return () => clearTimeout(t);
  }, [largura, medir]);

  const cheia = altura ?? alturaRecolhida;
  const visivel = aberta ? cheia : Math.min(cheia, alturaRecolhida);
  const cortada = cheia > alturaRecolhida;

  return (
    <div className="relative">
      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white transition-[width]"
        style={{ width: largura ? `min(100%, ${largura}px)` : "100%", height: visivel }}
      >
        <iframe
          ref={ref}
          src={src}
          title={titulo}
          loading="lazy"
          onLoad={() => {
            setFalhou(false);
            medir();
            // Imagens e fontes chegam depois do load do documento e mudam a altura.
            setTimeout(medir, 600);
            setTimeout(medir, 2000);
          }}
          onError={() => setFalhou(true)}
          className="block w-full border-0"
          style={{ height: altura ?? alturaRecolhida }}
          {...(sandbox !== undefined ? { sandbox } : {})}
          scrolling={altura ? "no" : "auto"}
        />
        {!aberta && cortada ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
        ) : null}
      </div>
      {falhou ? <p className="mt-2 text-[12px] text-rose-700">A prévia não carregou. Recarregue a fila.</p> : null}
      {cortada ? (
        <button
          type="button"
          className="admin-botao-secundario mt-2 w-full"
          onClick={() => setAberta((v) => !v)}
          aria-expanded={aberta}
        >
          {aberta ? "Recolher" : rotuloDeAbrir}
        </button>
      ) : null}
    </div>
  );
}
