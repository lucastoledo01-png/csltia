"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  action: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
  /**
   * Quando baixar o script da Cloudflare (06/10/2026).
   *
   * Até aqui o script entrava em toda página do portal, no carregamento, para
   * uma caixa de assinatura que fica no fim da página e que quase ninguém usa
   * (auditoria de SEO, item 23). Com `false` nada é baixado e a caixa só
   * reserva o lugar do widget; quem decide ligar é o formulário, quando a
   * pessoa demonstra intenção de assinar. Ausente vale `true`, o comportamento
   * de antes, para quem não declara.
   */
  carregar?: boolean;
};

const fallbackSiteKey = "0x4AAAAAAEXJ_FUjA4w-X0Nd";
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || fallbackSiteKey;
export const ENDERECO_DO_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({ action, onVerify, onExpire, carregar = true }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!carregar || !containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      callback: onVerify,
      "expired-callback": onExpire,
      "error-callback": onExpire,
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, carregar, onExpire, onVerify, scriptLoaded]);

  /*
   * A altura do widget (65px) fica reservada desde o começo. Sem ela, o widget
   * que aparece depois empurra a mensagem e o rodapé para baixo, e isso conta
   * como deslocamento de layout, carregando cedo ou tarde.
   */
  return (
    <div className="mt-4 flex min-h-[65px] justify-center">
      {carregar ? (
        <Script src={ENDERECO_DO_TURNSTILE} strategy="afterInteractive" onReady={() => setScriptLoaded(true)} />
      ) : null}
      <div ref={containerRef} />
    </div>
  );
}
