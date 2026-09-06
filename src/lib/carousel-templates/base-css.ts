/**
 * Camada base — o CSS idêntico nos três formatos. Só usa `var(--s-*)`
 * (definidos por `tokensToCss`). As variantes de slide não redeclaram nada
 * daqui; só compõem estas primitivas.
 *
 * Alvo: `var(--s-w)` × `var(--s-h)` (padrão 1080×1440), definidos pelos
 * tokens. As fontes também: o `<link>` do `renderShell` é derivado delas.
 */
export const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
html,body{width:var(--s-w);height:var(--s-h);background:var(--s-bg);color:var(--s-ink);
  font-family:var(--s-font-body);overflow:hidden;}

.slide{width:var(--s-w);height:var(--s-h);padding:80px;display:flex;flex-direction:column;
  justify-content:space-between;position:relative;}
.slide.full{padding:0;}

/* ---- marca sobreposta ----
 *
 * O chrome de cabecalho e rodape virou sistema proprio (.c-head e .c-foot), e
 * as regras antigas de .s-header e .s-footer sairam junto. So que a remocao
 * levou os seletores e deixou as chaves: sobraram dois blocos de declaracoes
 * orfas, que o parser de CSS descarta em silencio.
 *
 * O efeito nao era silencioso na arte. overlayBrand() continua emitindo
 * .s-header.plain com .s-brand, .s-badge e .s-wordmark dentro, e a capa com
 * foto e a peca que esta no ar: ela vinha renderizando a marca como texto sem
 * estilo nenhum. O mesmo vale para .s-counter, que a galeria ainda usa.
 *
 * O que volta aqui e so o que ainda e emitido, e nada do chrome aposentado.
 */
.s-header{display:flex;align-items:center;justify-content:space-between;}
.s-header.plain{border:none;padding:0;}
.s-brand{display:flex;align-items:center;gap:14px;}
.s-badge{background:var(--s-accent);color:#fff;font-weight:800;font-size:22px;
  width:44px;height:44px;border-radius:12px;display:grid;place-items:center;
  font-family:var(--s-font-accent);}
.s-wordmark{font-family:var(--s-font-accent);font-size:30px;font-weight:700;color:var(--s-ink);}
.s-counter{background:var(--s-border);color:var(--s-stone);font-size:18px;font-weight:700;
  padding:8px 20px;border-radius:22px;font-variant-numeric:tabular-nums;}
.on-dark .s-wordmark,.on-dark .s-counter{color:#fff;}
.on-dark .s-counter{background:rgba(255,255,255,0.16);}

/* ---- eyebrow ---- */
.s-eyebrow{display:inline-flex;align-items:center;width:fit-content;
  font-family:var(--s-font-mono);font-size:17px;font-weight:700;
  letter-spacing:3px;text-transform:uppercase;padding:9px 22px;border-radius:8px;}
.eb-noticia{background:var(--s-eb-noticia-bg);color:var(--s-eb-noticia-fg);}
.eb-tutorial{background:var(--s-eb-tutorial-bg);color:var(--s-eb-tutorial-fg);}
.eb-prompt{background:var(--s-eb-prompt-bg);color:var(--s-eb-prompt-fg);}

/* ---- corpo ---- */
.s-mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:30px 0;}
.s-title{font-family:var(--s-font-accent);font-weight:800;line-height:1.16;
  letter-spacing:-0.01em;font-size:var(--s-display-lg);color:var(--s-ink);}
.s-title.sm{font-size:var(--s-display-md);}
.on-dark .s-title{color:#fff;}
.s-sub{font-size:var(--s-body);line-height:1.55;color:var(--s-stone);font-weight:500;}
.on-dark .s-sub{color:#d4d4d8;}

/* ---- cartão ---- */
.s-card{background:var(--s-ivory);border:2px solid var(--s-border);border-radius:var(--s-radius);
  padding:var(--s-card-pad);display:flex;flex-direction:column;gap:22px;}
.s-card.dark{background:var(--s-dark);border:none;color:#fafafa;}
.s-card .p{font-size:var(--s-body);line-height:1.6;color:var(--s-ink);font-weight:500;}
.s-card.dark .p{color:#e4e4e7;}

.s-label{font-family:var(--s-font-mono);font-size:15px;font-weight:700;letter-spacing:1.5px;
  text-transform:uppercase;width:fit-content;padding:7px 16px;border-radius:10px;}
.lbl-gold{background:#fef3c7;color:#d97706;}
.lbl-step{background:var(--s-border);color:var(--s-stone);}

.s-bullet{display:flex;align-items:center;gap:20px;background:var(--s-bg);
  border:1.5px solid var(--s-border);border-radius:18px;padding:22px 26px;}
.s-bullet .i{flex:0 0 auto;width:38px;height:38px;border-radius:50%;background:var(--s-accent);
  color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;}
.s-bullet .x{font-size:23px;font-weight:600;line-height:1.35;color:var(--s-ink);}

.s-code{background:#0f0f11;border:1px solid #2a2a2e;border-radius:16px;padding:26px;
  font-family:var(--s-font-mono);font-size:var(--s-mono);line-height:1.7;color:#e4e4e7;
  white-space:pre-wrap;word-break:break-word;}
.s-code .p{color:#6ee7b7;}
.s-code .k{color:var(--s-accent);font-weight:700;}
.s-code .c{color:#71717a;}

/* ---- imagem de fundo ---- */
.s-photo{position:absolute;inset:0;z-index:1;background-size:cover;background-position:center;}
.s-credito{position:absolute;left:0;right:0;bottom:0;z-index:40;padding:14px 28px;font-family:var(--s-font-body);font-size:19px;line-height:1.25;letter-spacing:.01em;color:rgba(255,255,255,.92);background:linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,0));text-align:right;}
.s-photo.ph{background:
  radial-gradient(circle at 50% 38%,rgba(255,120,60,0.28),transparent 45%),
  radial-gradient(circle at 50% 42%,rgba(90,20,10,0.45),transparent 60%),
  linear-gradient(180deg,#14100e,#241511 70%,#0c0a09);}
.s-grad{position:absolute;inset:0;z-index:2;
  background:linear-gradient(180deg,rgba(10,10,12,0.15) 0%,rgba(10,10,12,0.55) 55%,rgba(10,10,12,0.95) 92%);}
.s-grad.soft{background:linear-gradient(180deg,rgba(10,10,12,0) 45%,rgba(10,10,12,0.9) 93%);}

.s-overlay{position:absolute;inset:0;z-index:4;padding:80px;display:flex;flex-direction:column;
  justify-content:space-between;}

.s-profile{display:flex;align-items:center;gap:16px;}
.s-avatar{width:56px;height:56px;border-radius:50%;background:var(--s-accent);color:#fff;
  font-weight:900;font-size:26px;display:flex;align-items:center;justify-content:center;
  border:2px solid rgba(255,255,255,0.8);}
.s-pname{font-size:20px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px;}
.s-check{background:#3b82f6;color:#fff;font-size:11px;width:18px;height:18px;border-radius:50%;
  display:inline-flex;align-items:center;justify-content:center;font-weight:900;}
.s-phandle{font-size:15px;color:rgba(255,255,255,0.8);}
.s-swipe{font-size:18px;font-weight:700;color:#e4e4e7;letter-spacing:0.5px;text-align:right;}

/* ---- CTA ---- */
.s-cta{background:var(--s-dark);color:#fafafa;border-radius:32px;padding:56px 40px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:26px;flex:1;justify-content:center;}
.s-cta .ico{font-size:56px;}
.s-cta .t{font-family:var(--s-font-accent);font-size:44px;font-weight:700;line-height:1.2;}
.s-cta .b{font-size:22px;color:#a1a1aa;max-width:640px;line-height:1.5;}
.s-cta .btn{background:var(--s-accent);color:#fff;font-size:24px;font-weight:800;
  padding:20px 44px;border-radius:50px;}
.s-kw{font-family:var(--s-font-mono);font-weight:700;background:rgba(255,255,255,0.14);
  padding:2px 10px;border-radius:6px;}

/* ---- selos de formato ---- */
.prompt-badge{position:absolute;top:28px;right:28px;z-index:5;background:rgba(255,255,255,0.94);
  color:#18181b;border-radius:16px;padding:10px 18px;font-weight:800;font-size:17px;
  transform:rotate(4deg);box-shadow:0 10px 25px rgba(0,0,0,0.25);}
.step-count{background:rgba(255,255,255,0.94);color:#18181b;border-radius:14px;padding:8px 18px;
  font-weight:800;font-size:18px;width:fit-content;font-family:var(--s-font-mono);}

.gallery-cap{font-size:30px;font-weight:700;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.6);}

/* ---- chrome: colchetes de corte (sistema impresso) ---- */
.c-corners i{position:absolute;width:46px;height:46px;border-color:var(--s-accent);border-style:solid;border-width:0;}
.c-corners .tl{top:44px;left:44px;border-top-width:3px;border-left-width:3px;}
.c-corners .tr{top:44px;right:44px;border-top-width:3px;border-right-width:3px;}
.c-corners .bl{bottom:44px;left:44px;border-bottom-width:3px;border-left-width:3px;}
.c-corners .br{bottom:44px;right:44px;border-bottom-width:3px;border-right-width:3px;}

/* ---- chrome editorial ---- */
.c-head{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2;}
.c-head.editorial .handle,.c-head.editorial .count{font-family:var(--s-font-mono);font-size:19px;
  font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:var(--s-stone);}
.c-foot{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2;}
.c-foot.editorial{border-top:1px solid var(--s-border);padding-top:26px;}
.c-foot.editorial .tag,.c-foot.editorial .swipe{font-family:var(--s-font-mono);font-size:16px;
  font-weight:700;letter-spacing:2px;text-transform:uppercase;}
.c-foot.editorial .tag{color:var(--s-stone);}
.c-foot.editorial .swipe{color:var(--s-accent);display:inline-flex;align-items:center;gap:10px;}
.c-foot.editorial .swipe svg{width:22px;height:22px;}
.c-dots{display:flex;gap:11px;}
.c-dots .d{width:11px;height:11px;border-radius:50%;background:var(--s-border);}
.c-dots .d.on{background:var(--s-accent);}

/* ---- chrome social ---- */
.c-head.social .mark{font-family:var(--s-font-body);font-size:21px;font-weight:800;
  letter-spacing:2.4px;text-transform:uppercase;color:var(--s-accent);}
.c-head.social .pill{font-family:var(--s-font-mono);font-size:18px;font-weight:700;color:var(--s-ink);
  background:rgba(255,255,255,0.10);border:1px solid var(--s-border);border-radius:999px;padding:8px 20px;}
.c-head.social .pill i{opacity:0.45;font-style:normal;margin:0 4px;}
.c-foot.social .prog{font-family:var(--s-font-mono);font-size:17px;letter-spacing:1.8px;
  text-transform:uppercase;color:var(--s-stone);}
.c-foot.social .prog b{color:var(--s-accent);font-weight:700;margin-right:10px;}
.c-foot.social .next{width:64px;height:64px;border-radius:50%;background:var(--s-accent);color:#fff;
  display:inline-flex;align-items:center;justify-content:center;}
.c-foot.social .next svg{width:28px;height:28px;}

/* Trilho de engajamento — ícones, sem números: contador de maquete impresso
   na arte seria prova social inventada. */
.c-rail{position:absolute;right:56px;top:50%;transform:translateY(-50%);z-index:2;
  display:flex;flex-direction:column;gap:24px;}
.c-rail span{width:76px;height:76px;border-radius:50%;background:rgba(255,255,255,0.08);
  border:1px solid var(--s-border);color:var(--s-ink);
  display:inline-flex;align-items:center;justify-content:center;}
.c-rail svg{width:32px;height:32px;}

/* ---- primitivas do sistema impresso (design claro) ---- */
.e-wrap{flex:1;display:flex;flex-direction:column;justify-content:center;gap:34px;position:relative;z-index:2;}
.e-wrap.center{align-items:center;text-align:center;}

.e-mark{width:74px;height:74px;color:var(--s-accent);}
.e-mark svg{width:100%;height:100%;}

/* Título partido: primeira linha em display pesada, segunda em serifa itálica
   na cor de destaque. É a assinatura do design. */
.e-title{font-family:var(--s-font-display);font-weight:800;letter-spacing:-0.035em;
  line-height:1.02;font-size:var(--s-display-lg);color:var(--s-ink);text-transform:uppercase;}
.e-title .it{display:block;font-family:var(--s-font-accent);font-weight:400;font-style:italic;
  color:var(--s-accent);text-transform:none;letter-spacing:-0.01em;line-height:1.1;}
.e-title.sm{font-size:var(--s-display-md);text-transform:none;letter-spacing:-0.03em;}

.e-btn{display:inline-flex;align-items:center;justify-content:center;
  border:2px solid var(--s-accent);color:var(--s-accent);border-radius:6px;
  font-family:var(--s-font-body);font-weight:800;font-size:30px;letter-spacing:5px;
  padding:22px 58px;width:fit-content;}

.e-lede{font-size:var(--s-body);line-height:1.55;color:var(--s-stone);max-width:760px;font-weight:500;}
.e-lede b{color:var(--s-ink);font-weight:800;}
.e-lede i{font-family:var(--s-font-accent);font-style:italic;color:var(--s-accent);font-weight:400;}

/* Terminal: barra de arquivo + linhas de saída. */
.e-term{background:var(--s-dark);border-radius:var(--s-radius);overflow:hidden;width:100%;}
.e-term .bar{display:flex;align-items:center;gap:12px;padding:20px 30px;
  border-bottom:1px solid rgba(255,255,255,0.10);}
.e-term .bar u{width:13px;height:13px;border-radius:50%;background:rgba(255,255,255,0.22);text-decoration:none;}
.e-term .bar span{font-family:var(--s-font-mono);font-size:17px;color:rgba(255,255,255,0.55);margin-left:8px;}
.e-term .lines{padding:30px;display:flex;flex-direction:column;gap:14px;}
.e-term .l{font-family:var(--s-font-mono);font-size:var(--s-mono);line-height:1.5;color:#e9e9e9;}
.e-term .l.cmd{color:var(--s-accent);font-weight:700;}

/* Lista numerada do slide de habilidades. */
.e-nums{display:flex;flex-direction:column;gap:0;width:100%;}
.e-nums .row{display:flex;align-items:center;gap:32px;padding:30px 0;border-bottom:1px solid var(--s-border);}
.e-nums .row:last-child{border-bottom:none;}
.e-nums .n{font-family:var(--s-font-accent);font-style:italic;font-size:52px;font-weight:400;
  color:var(--s-accent);min-width:88px;line-height:1;}
.e-nums .t{font-family:var(--s-font-display);font-size:40px;font-weight:700;
  letter-spacing:-0.02em;color:var(--s-ink);}

.e-quote{border-left:4px solid var(--s-accent);padding-left:34px;
  font-family:var(--s-font-accent);font-style:italic;font-weight:400;
  font-size:38px;line-height:1.32;color:var(--s-ink);}

/* Palavra-chave do CTA — o que a pessoa comenta. */
.e-kw{display:inline-flex;align-items:center;justify-content:center;background:var(--s-accent);color:#fff;
  font-family:var(--s-font-body);font-weight:800;font-size:44px;letter-spacing:5px;
  padding:20px 46px;border-radius:8px;width:fit-content;text-transform:uppercase;}
.e-kw-line{font-size:34px;line-height:1.45;color:var(--s-ink);font-weight:500;max-width:820px;}
.e-kw-line b{font-weight:800;color:var(--s-accent);}
`;
