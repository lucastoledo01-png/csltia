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
};

const fallbackSiteKey = "0x4AAAAAAEXJ_FUjA4w-X0Nd";
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || fallbackSiteKey;

export function TurnstileWidget({ action, onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) {
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
  }, [action, onExpire, onVerify, scriptLoaded]);

  return (
    <div className="mt-4 flex justify-center">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} />
      <div ref={containerRef} />
    </div>
  );
}
