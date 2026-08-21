"use client";

import { FormEvent, useCallback, useId, useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";

type NewsletterSignupProps = {
  compact?: boolean;
  source?: string;
};

export function NewsletterSignup({ compact = false, source = "newsletter-home" }: NewsletterSignupProps) {
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
        {status === "success" ? "pronto, seu email entrou na lista" : null}
        {status === "error" ? "nao consegui cadastrar agora, tenta de novo em instantes" : null}
        {status === "captcha" ? "confirme que voce nao e robo antes de entrar na lista" : null}
      </p>
    </div>
  );
}
