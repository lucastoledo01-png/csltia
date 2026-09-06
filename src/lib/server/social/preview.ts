/**
 * A página de preview de um dia do feed.
 *
 * O relatório em Markdown responde "quantos posts e por quê". Ele não responde
 * a pergunta que só o olho responde: isso está publicável? Uma manchete que
 * cabe na tabela pode estourar a arte, um crédito de licença pode cair em cima
 * do título, uma foto aprovada pelo resolvedor pode estar simplesmente errada
 * para a notícia.
 *
 * Por isso o preview mostra a arte renderizada, a legenda exata que iria para
 * o Instagram, e o diagnóstico ao lado. Nada aqui é ilustrativo: o PNG é o
 * mesmo arquivo que subiria, e a legenda é a string que o guard liberou.
 */

export type LinhaDeDiagnostico = { campo: string; valor: string; alerta?: boolean };

export type PostDePreview = {
  posicao: number;
  hora: string;
  headline: string;
  legenda: string;
  hashtags: string[];
  /*
   * A arte, embutida como data URI.
   *
   * O PNG também é escrito ao lado, mas o `src` não aponta para ele: uma
   * página que depende de arquivo vizinho quebra assim que alguém a manda por
   * mensagem ou a abre de outra pasta. Embutida, ela é um arquivo só.
   */
  arte: string;
  /** Nome do PNG escrito ao lado, para quem quiser o arquivo solto. */
  arquivo: string;
  comFoto: boolean;
  motivoSemFoto: string;
  diagnostico: LinhaDeDiagnostico[];
  recusadosVisuais: Array<{ motivo: string; identificacao: string; detalhe: string }>;
};

export type DadosDoPreview = {
  dia: string;
  projeto: string;
  alvo: number;
  maximo: number;
  posts: PostDePreview[];
  descartes: Array<{ etapa: string; motivo: string; quantas: number }>;
  observacoes: string[];
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A legenda quebrada em parágrafos, como o Instagram a exibe. */
function legendaHtml(legenda: string): string {
  return legenda
    .split("\n")
    .map((l) => (l.trim() ? `<p>${esc(l)}</p>` : `<p class="vazia"></p>`))
    .join("");
}

function cartao(p: PostDePreview): string {
  const arte = p.arte
    ? `<img src="${esc(p.arte)}" alt="Arte do post ${p.posicao}">`
    : `<div class="sem-arte">arte não renderizada</div>`;

  const selo = p.comFoto
    ? `<span class="selo ok">foto licenciada</span>`
    : `<span class="selo alerta">sem foto: ${esc(p.motivoSemFoto || "NO_VALID_VISUAL_ASSET")}</span>`;

  const linhas = p.diagnostico
    .map(
      (d) =>
        `<tr class="${d.alerta ? "alerta" : ""}"><th>${esc(d.campo)}</th><td>${esc(d.valor)}</td></tr>`,
    )
    .join("");

  const recusados =
    p.recusadosVisuais.length === 0
      ? ""
      : `<details class="recusados"><summary>${p.recusadosVisuais.length} candidato(s) de imagem descartado(s)</summary>
<table>${p.recusadosVisuais
          .map(
            (r) =>
              `<tr><th>${esc(r.motivo)}</th><td>${esc(r.identificacao)}</td><td>${esc(r.detalhe)}</td></tr>`,
          )
          .join("")}</table></details>`;

  return `<article class="post">
  <div class="coluna-arte">
    <div class="moldura">${arte}</div>
    <div class="conta"><span class="avatar">us</span><span class="handle">imigra.us</span><span class="hora">${esc(p.hora)}</span></div>
    <div class="legenda">${legendaHtml(p.legenda)}</div>
  </div>
  <aside class="coluna-diag">
    <div class="cabeca"><span class="pos">${p.posicao}</span>${selo}</div>
    <table class="diag">${linhas}${p.arquivo ? `<tr><th>arquivo</th><td>${esc(p.arquivo)}</td></tr>` : ""}</table>
    ${recusados}
  </aside>
</article>`;
}

export function paginaDePreview(dados: DadosDoPreview): string {
  const cartoes = dados.posts.map(cartao).join("\n");

  const descartes = dados.descartes.length
    ? `<table class="descartes"><thead><tr><th>etapa</th><th>motivo</th><th>quantas</th></tr></thead><tbody>${dados.descartes
        .map((d) => `<tr><td>${esc(d.etapa)}</td><td>${esc(d.motivo)}</td><td>${d.quantas}</td></tr>`)
        .join("")}</tbody></table>`
    : `<p class="nada">Nenhum descarte registrado.</p>`;

  const vazio =
    dados.posts.length === 0
      ? `<p class="nada">Nenhum post. O dia não sustentou nenhuma pauta, e isso não é falha de pipeline.</p>`
      : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview do feed, ${esc(dados.dia)}</title>
<style>
  :root{--fg:#111418;--fg2:#5b6572;--linha:#e3e7ec;--fundo:#f6f7f9;--card:#fff;--alerta:#b45309;--ok:#15803d;}
  @media (prefers-color-scheme:dark){:root{--fg:#e9edf2;--fg2:#98a2b0;--linha:#262c34;--fundo:#0e1116;--card:#161a20;--alerta:#f59e0b;--ok:#4ade80;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--fundo);color:var(--fg);font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",sans-serif;}
  header{max-width:1180px;margin:0 auto;padding:40px 24px 8px}
  h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--fg2);margin:0 0 4px}
  main{max-width:1180px;margin:0 auto;padding:16px 24px 80px}
  .post{display:grid;grid-template-columns:minmax(320px,470px) 1fr;gap:28px;background:var(--card);border:1px solid var(--linha);border-radius:14px;padding:20px;margin:22px 0;align-items:start}
  @media (max-width:900px){.post{grid-template-columns:1fr}}
  .moldura{border:1px solid var(--linha);border-radius:10px;overflow:hidden;background:#0b0d10;display:flex;min-height:120px}
  .moldura img{width:100%;height:100%;object-fit:contain;display:block}
  .sem-arte{margin:auto;color:#888;font-size:13px}
  .conta{display:flex;align-items:center;gap:9px;margin:12px 0 8px;font-size:13px}
  .avatar{width:26px;height:26px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700}
  .handle{font-weight:650}
  .hora{color:var(--fg2);margin-left:auto}
  .legenda p{margin:0 0 9px;white-space:pre-wrap;word-break:break-word}
  .legenda p.vazia{height:6px;margin:0}
  .cabeca{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .pos{width:26px;height:26px;border-radius:7px;background:var(--fg);color:var(--card);display:grid;place-items:center;font-size:13px;font-weight:700}
  .selo{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid currentColor}
  .selo.ok{color:var(--ok)} .selo.alerta{color:var(--alerta)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  .diag th{text-align:left;color:var(--fg2);font-weight:500;width:180px;vertical-align:top;padding:5px 10px 5px 0}
  .diag td{padding:5px 0;word-break:break-word}
  .diag tr{border-bottom:1px solid var(--linha)}
  .diag tr.alerta td{color:var(--alerta);font-weight:600}
  details.recusados{margin-top:14px;font-size:13px}
  details.recusados summary{cursor:pointer;color:var(--fg2)}
  details.recusados th{text-align:left;font-weight:600;padding:4px 10px 4px 0;white-space:nowrap}
  details.recusados td{padding:4px 10px 4px 0;color:var(--fg2)}
  .descartes{margin-top:10px;background:var(--card);border:1px solid var(--linha);border-radius:10px;overflow:hidden}
  .descartes th,.descartes td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--linha)}
  .descartes thead th{color:var(--fg2);font-weight:500}
  .nada{color:var(--fg2)}
  h2{font-size:17px;margin:38px 0 6px}
  ul.obs{color:var(--fg2);font-size:14px;padding-left:18px}
</style></head><body>
<header>
  <h1>Preview do feed, ${esc(dados.dia)}</h1>
  <p class="sub">${esc(dados.projeto)} · ${dados.posts.length} post(s) · alvo ${dados.alvo}, máximo ${dados.maximo}</p>
  <p class="sub">Nada foi publicado. A arte e a legenda abaixo são exatamente as que iriam para o Instagram.</p>
</header>
<main>
${vazio}
${cartoes}
<h2>Descartados, e em que etapa</h2>
${descartes}
${dados.observacoes.length ? `<h2>Observações</h2><ul class="obs">${dados.observacoes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
</main></body></html>`;
}
