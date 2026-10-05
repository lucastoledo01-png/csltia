"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortaoAdmin } from "@/components/admin/PortaoAdmin";

type Prateleira = { tag: string; pais: string; fotos: number; livres: number };
type ItemDaLista = {
  tipo: string;
  chave: string;
  pais: string;
  pautas: number;
  vazio: number;
  janela: number;
  ultimoPedido: string;
  exemplo: string;
};
type Resposta = {
  ok: boolean;
  error?: string;
  modo?: string;
  total?: number;
  livres?: number;
  janelaEmDias?: number;
  dias?: number;
  prateleiras?: Prateleira[];
  tagsSemFoto?: number;
  tagsNoCatalogo?: number;
  listaDeCompras?: ItemDaLista[];
  erros?: string[];
};

const MODOS: Record<string, string> = {
  off: "desligado: o resolvedor não consulta o acervo",
  dry_run: "em ensaio: consulta, anota o que escolheria e a lista de compras, sem decidir a foto",
  enforce: "no comando: o acervo é a primeira fonte de imagem",
};

const celula: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "left" };

export function PainelDoAcervo({ slug }: { slug: string }) {
  return (
    <PortaoAdmin>
      <Conteudo slug={slug} />
    </PortaoAdmin>
  );
}

function Conteudo({ slug }: { slug: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [dias, setDias] = useState(7);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/acervo?projeto=${encodeURIComponent(slug)}&dias=${dias}`);
        const json = (await r.json()) as Resposta;
        if (ativo) setDados(json);
      } catch (erro) {
        if (ativo) setDados({ ok: false, error: (erro as Error).message });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [slug, dias]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "var(--font-jakarta), sans-serif" }}>
      <p>
        <Link href={`/admin/${slug}`}>Voltar ao projeto</Link>
      </p>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Acervo próprio</h1>

      {!dados && <p>Carregando…</p>}
      {dados && !dados.ok && <p style={{ color: "#b91c1c" }}>Não foi possível ler: {dados.error}</p>}

      {dados?.ok && (
        <>
          <p>
            Capacidade <strong>{dados.modo}</strong>, {MODOS[dados.modo ?? "off"] ?? ""}. Para mudar, declare{" "}
            <code>settings.capacidades.acervo</code> no projeto.
          </p>
          <p>
            {dados.total} foto(s) no acervo, {dados.livres} livre(s) na janela de {dados.janelaEmDias} dias.{" "}
            {dados.tagsSemFoto} de {dados.tagsNoCatalogo} cenas do cardápio ainda sem foto.
          </p>
          {(dados.erros ?? []).length > 0 && (
            <ul style={{ color: "#b91c1c" }}>
              {(dados.erros ?? []).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24 }}>
            Lista de compras, últimos{" "}
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {[7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>{" "}
            dias
          </h2>
          <p style={{ color: "#4b5563" }}>
            O que foi pedido e não havia, por número de pautas. &quot;vazio&quot; é cena a produzir; &quot;janela&quot; é
            cena que existe mas já saiu toda dentro do mês.
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["pautas", "vazio", "janela", "tipo", "país", "tag ou entidade", "exemplo"].map((h) => (
                  <th key={h} style={celula}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(dados.listaDeCompras ?? []).map((i) => (
                <tr key={`${i.tipo}|${i.chave}|${i.pais}`}>
                  <td style={celula}>{i.pautas}</td>
                  <td style={celula}>{i.vazio}</td>
                  <td style={celula}>{i.janela}</td>
                  <td style={celula}>{i.tipo}</td>
                  <td style={celula}>{i.pais || "-"}</td>
                  <td style={celula}>
                    <code>{i.chave}</code>
                  </td>
                  <td style={celula}>{i.exemplo}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24 }}>Prateleiras, das mais vazias para as mais cheias</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["tag", "país", "fotos", "livres"].map((h) => (
                  <th key={h} style={celula}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(dados.prateleiras ?? []).map((p) => (
                <tr key={`${p.tag}|${p.pais}`}>
                  <td style={celula}>
                    <code>{p.tag}</code>
                  </td>
                  <td style={celula}>{p.pais}</td>
                  <td style={celula}>{p.fotos}</td>
                  <td style={celula}>{p.livres}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
