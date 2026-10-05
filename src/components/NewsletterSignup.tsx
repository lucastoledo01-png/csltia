"use client";

import { FormEvent, useCallback, useId, useState } from "react";
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
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "captcha">("idle");
  const resetTurnstile = useCallback(() => setTurnstileToken(""), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!turnstileToken) {
      setStatus("captcha");
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source, turnstileToken }),
      });

      if (!response.ok) {
        throw new Error("newsletter_failed");
      }

      setEmail("");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const mensagem = (
    <>
      {status === "success" ? "pronto, seu email entrou na lista" : null}
      {status === "error" ? "nao consegui cadastrar agora, tenta de novo em instantes" : null}
      {status === "captcha" ? "confirme que voce nao e robo antes de entrar na lista" : null}
    </>
  );

  if (aparencia === "portal") {
    return (
      <div className="w-full">
        <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={inputId}>Email para newsletter</label>
          <input
            autoComplete="email"
            className="w-full rounded-lg border border-[#D4D4D8] bg-white px-4 py-3 text-sm text-[#0A0A0A] outline-none placeholder:text-[#71717A] focus:border-[var(--portal-vermelho)] focus:ring-2 focus:ring-[var(--portal-vermelho)]/20"
            id={inputId}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Seu melhor e-mail"
            required
            type="email"
            value={email}
          />
          <button
            className="w-full rounded-lg bg-[var(--portal-vermelho)] py-3 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[var(--portal-vermelho-texto)] disabled:cursor-wait disabled:opacity-70"
            disabled={status === "loading"}
            type="submit"
          >
            {status === "loading" ? "Enviando" : "Assinar"}
          </button>
        </form>
        <TurnstileWidget action="newsletter_signup" onExpire={resetTurnstile} onVerify={setTurnstileToken} />
        <p className="mt-2 text-[13px] text-[#52525B]" role="status">
          {mensagem}
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "w-full" : ""}>
      <form className={`mx-auto flex w-full max-w-[520px] items-center gap-2 rounded-full border border-black bg-white p-1.5 ${compact ? "mx-0" : ""}`} onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={inputId}>Email para newsletter</label>
        <svg aria-hidden="true" className="ml-3 size-5 shrink-0 text-black" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <rect height="16" rx="2" width="20" x="2" y="4" />
          <path d="m22 7-10 6L2 7" />
        </svg>
        <input
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-[#6b7280]"
          id={inputId}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="coloque seu email"
          required
          type="email"
          value={email}
        />
        <button
          className="cta-gradient rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(255,74,28,0.26)] transition-transform duration-200 ease-in-out hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 sm:px-6 sm:text-base"
          disabled={status === "loading"}
          type="submit"
        >
          {status === "loading" ? "enviando" : "inscreva-se"}
        </button>
      </form>
      <TurnstileWidget action="newsletter_signup" onExpire={resetTurnstile} onVerify={setTurnstileToken} />
      <p className={`mt-3 text-sm ${compact ? "text-white/70" : "text-[#667085]"}`} role="status">
        {mensagem}
      </p>
    </div>
  );
}
