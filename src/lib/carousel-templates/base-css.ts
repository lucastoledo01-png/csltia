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

/* ---- cabeçalho ---- */
.s-header{display:flex;align-items:center;justify-content:space-between;
  border-bottom:2px solid var(--s-border);padding-bottom:24px;}
.s-header.plain{border:none;padding:0;}
.s-brand{display:flex;align-items:center;gap:14px;}
.s-badge{background:var(--s-accent);color:#fff;font-weight:800;font-size:22px;
  width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;}
.s-wordmark{font-family:var(--s-font-accent);font-size:30px;font-weight:700;color:var(--s-ink);}
.s-counter{background:var(--s-border);color:var(--s-stone);font-size:18px;font-weight:700;
  padding:8px 20px;border-radius:22px;font-variant-numeric:tabular-nums;}
.on-dark .s-wordmark,.on-dark .s-counter{color:#fff;}
.on-dark .s-header,.on-dark .s-footer{border-color:rgba(255,255,255,0.2);}
.on-dark .s-counter{background:rgba(255,255,255,0.16);}

/* ---- rodapé ---- */
.s-footer{display:flex;align-items:center;justify-content:space-between;
  border-top:2px solid var(--s-border);padding-top:22px;font-size:18px;}
.s-footer .h{font-weight:800;color:var(--s-ink);}
.s-footer .t{color:var(--s-stone);font-size:15px;font-weight:600;}
.on-dark .s-footer .h{color:#fff;}
.on-dark .s-footer .t{color:rgba(255,255,255,0.65);}

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
`;
