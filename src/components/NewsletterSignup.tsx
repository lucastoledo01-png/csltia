"use client";

import { FormEvent, useCallback, useId, useRef, useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";

type NewsletterSignupProps = {
  compact?: boolean;
  source?: string;
  /**
   * Só a pele muda. O portal desenha o formulário empilhado, campo em cima e
   * botão vermelho embaixo, e o fluxo continua o mesmo: a mesma rota, o mesmo
   * captcha e as mesmas mensagens. Formulário de assinatura que não passa por
   * aqui é formulário morto.
   */
  aparencia?: "padrao" | "portal";
};

export function NewsletterSignup({ compact = false, source = "newsletter-home", aparencia = "padrao" }: NewsletterSignupProps) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "captcha" | "verificando">("idle");

  /*
   * O captcha só carrega quando a pessoa mostra que vai assinar (06/10/2026):
   * foco no campo, toque no formulário ou o envio. Antes ele entrava em toda
   * página do portal no carregamento, e a caixa fica no fim da página. A
   * proteção é a mesma: sem token, a rota recusa, e o envio nunca sai sem ele.
   *
   * Quem envia antes de o widget terminar não perde o clique: o envio fica
   * pendente e sai sozinho quando o token chega, com o e-mail que estiver no
   * campo nessa hora.
   */
  const [captchaLigado, setCaptchaLigado] = useState(false);
  const envioPendente = useRef(false);
  const emailAtual = useRef("");
  const mudarEmail = useCallback((valor: string) => {
    emailAtual.current = valor;
    setEmail(valor);
  }, []);
  const ligarCaptcha = useCallback(() => setCaptchaLigado(true), []);

  const enviar = useCallback(
    async (token: string) => {
      setStatus("loading");

      try {
        const response = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailAtual.current.trim(), source, turnstileToken: token }),
        });

        if (!response.ok) {
          throw new Error("newsletter_failed");
        }

        mudarEmail("");
        setStatus("success");
      } catch {
        setStatus("error");
      }
    },
    [source, mudarEmail],
  );

  const aoVerificar = useCallback(
    (token: string) => {
      setTurnstileToken(token);
      if (envioPendente.current && token) {
        envioPendente.current = false;
        void enviar(token);
      }
    },
    [enviar],
  );
  // Widget que expira ou falha com envio pendente devolve o botão e pede de novo.
  const resetTurnstile = useCallback(() => {
    setTurnstileToken("");
    if (envioPendente.current) {
      envioPendente.current = false;
      setStatus("captcha");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!turnstileToken) {
      if (captchaLigado) {
        setStatus("captcha");
        return;
      }
      // Primeiro envio sem intenção prévia: liga o captcha e espera o token.
      envioPendente.current = true;
      setCaptchaLigado(true);
      setStatus("verificando");
      return;
    }

    await enviar(turnstileToken);
  }

  const mensagem = (
    <>
      {status === "success" ? "pronto, seu email entrou na lista" : null}
      {status === "error" ? "nao consegui cadastrar agora, tenta de novo em instantes" : null}
      {status === "captcha" ? "confirme que voce nao e robo antes de entrar na lista" : null}
      {status === "verificando" ? "conferindo que voce nao e robo, um instante" : null}
    </>
  );

  const ocupado = status === "loading" || status === "verificando";
  const captcha = (
    <TurnstileWidget action="newsletter_signup" carregar={captchaLigado} onExpire={resetTurnstile} onVerify={aoVerificar} />
  );

  if (aparencia === "portal") {
    return (
      <div className="w-full">
        <form className="flex w-full flex-col gap-3" onFocus={ligarCaptcha} onPointerDown={ligarCaptcha} onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={inputId}>Email para newsletter</label>
          <input
            autoComplete="email"
            className="w-full rounded-lg border border-[#D4D4D8] bg-white px-4 py-3 text-sm text-[#0A0A0A] outline-none placeholder:text-[#71717A] focus:border-[var(--portal-vermelho)] focus:ring-2 focus:ring-[var(--portal-vermelho)]/20"
            id={inputId}
            onChange={(event) => mudarEmail(event.target.value)}
            placeholder="Seu melhor e-mail"
            required
            type="email"
            value={email}
          />
          <button
            className="w-full rounded-lg bg-[var(--portal-vermelho)] py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[var(--portal-vermelho-texto)] disabled:cursor-wait disabled:opacity-70"
            disabled={ocupado}
            type="submit"
          >
            {ocupado ? "Enviando" : "Assinar"}
          </button>
        </form>
        {captcha}
        <p className="mt-2 text-[13px] text-[#52525B]" role="status">
          {mensagem}
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "w-full" : ""}>
      <form
        className={`mx-auto flex w-full max-w-[520px] items-center gap-2 rounded-full border border-black bg-white p-1.5 ${compact ? "mx-0" : ""}`}
        onFocus={ligarCaptcha}
        onPointerDown={ligarCaptcha}
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor={inputId}>Email para newsletter</label>
        <svg aria-hidden="true" className="ml-3 size-5 shrink-0 text-black" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <rect height="16" rx="2" width="20" x="2" y="4" />
          <path d="m22 7-10 6L2 7" />
        </svg>
        <input
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-[#6b7280]"
          id={inputId}
          onChange={(event) => mudarEmail(event.target.value)}
          placeholder="coloque seu email"
          required
          type="email"
          value={email}
        />
        <button
          className="cta-gradient rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(255,74,28,0.26)] transition-transform duration-200 ease-in-out hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:text-base"
          disabled={ocupado}
          type="submit"
        >
          {ocupado ? "enviando" : "inscreva-se"}
        </button>
      </form>
      {captcha}
      <p className={`mt-3 text-sm ${compact ? "text-white/70" : "text-[#667085]"}`} role="status">
        {mensagem}
      </p>
    </div>
  );
}
