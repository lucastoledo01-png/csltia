"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MARCA } from "@/lib/marca";

/**
 * A porta do painel, uma só, para todas as telas administrativas.
 *
 * Antes cada tela resolvia isso por conta própria, e a única tela que resolvia
 * usava `sessionStorage`. Ver o porquê da troca em `/api/admin/sessao`: a marca
 * local sobrevive ao cookie e faz o painel abrir autenticado quando já não
 * está.
 *
 * O componente é burro de propósito. Ele não sabe o que tem atrás dele: só
 * pergunta ao servidor se a sessão vale, mostra o formulário quando não vale, e
 * some de vista quando vale.
 */

type Estado = "verificando" | "fora" | "dentro";

/**
 * Encerra a sessão e volta para a porta.
 *
 * A navegação é dura, e não troca de estado em React, porque a sessão é do
 * cookie: recarregar é o que garante que nenhuma tela continue montada com
 * dados carregados por uma sessão que já não existe.
 */
export async function sairDoPainel() {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
  window.location.assign("/admin");
}

export function PortaoAdmin({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const r = await fetch("/api/admin/sessao");
        if (ativo) setEstado(r.ok ? "dentro" : "fora");
      } catch {
        if (ativo) setEstado("fora");
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!senha.trim()) return;

    setEntrando(true);
    setErro("");

    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: senha }),
      });
      const corpo = await r.json().catch(() => ({}));

      if (r.ok && corpo.ok) {
        setSenha("");
        setEstado("dentro");
      } else {
        setErro("Senha incorreta.");
      }
    } catch {
      setErro("Erro de conexão ao autenticar.");
    } finally {
      setEntrando(false);
    }
  }

  if (estado === "verificando") {
    return (
      <main className="admin-shell grid min-h-screen place-items-center">
        <p className="text-xs font-semibold text-slate-500">Verificando acesso...</p>
      </main>
    );
  }

  if (estado === "fora") {
    return (
      <main className="admin-shell grid min-h-screen place-items-center p-4">
        <div className="admin-glass w-full max-w-sm p-8">
          <h1 className="text-[22px] text-slate-900">{MARCA.nome}</h1>
          <p className="mt-1 text-[13px] text-slate-500">Painel de operação. Acesso restrito.</p>

          <form onSubmit={entrar} className="mt-6 space-y-4">
            {erro ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600">
                {erro}
              </div>
            ) : null}

            <div>
              <label htmlFor="admin-senha" className="block text-[12px] text-slate-600">
                Senha
              </label>
              <input
                id="admin-senha"
                type="password"
                required
                autoFocus
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="admin-campo mt-1.5"
              />
            </div>

            <button type="submit" disabled={entrando} className="admin-botao w-full">
              {entrando ? "Entrando" : "Entrar"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
              Voltar para o site
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
