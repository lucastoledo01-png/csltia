"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { MARCA } from "@/lib/marca";

/**
 * Captura da etapa 11.
 *
 * Os campos de atribuição (keyword, campanha) não são inputs ocultos no
 * formulário: a keyword está na URL e o servidor resolve a campanha a partir
 * dela. Campo oculto num formulário público é editável por quem abrir o
 * inspetor, e atribuição falsificável não serve para decidir pauta.
 */
export function UltraPromptLeadForm({ keyword }: { keyword: string }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileToken) {
      setErro("Aguarde a verificação de segurança terminar.");
      return;
    }

    setEnviando(true);
    setErro(null);

    try {
      const res = await fetch(`/api/ultraprompts/${encodeURIComponent(keyword)}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
          source: "landing",
          turnstileToken,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        setErro(json.error ?? "Não consegui salvar seu cadastro. Tente de novo.");
        setTurnstileToken("");
        return;
      }

      // O cookie de acesso vem na resposta; a navegação já entra liberada.
      router.push(json.materialUrl ?? `/ultraprompts/${keyword}/material`);
    } catch {
      setErro("Erro de conexão. Tente de novo.");
      setTurnstileToken("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[520px] space-y-3 text-left">
      {erro ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          {erro}
        </p>
      ) : null}

      <input
        required
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Seu nome"
        autoComplete="name"
        className="w-full rounded-xl border border-black/15 bg-white px-4 py-3.5 text-base text-black placeholder:text-[#98a2b3] focus:border-[#E4344A] focus:outline-none"
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Seu melhor e-mail"
        autoComplete="email"
        className="w-full rounded-xl border border-black/15 bg-white px-4 py-3.5 text-base text-black placeholder:text-[#98a2b3] focus:border-[#E4344A] focus:outline-none"
      />
      <input
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
        placeholder="WhatsApp (opcional)"
        inputMode="tel"
        autoComplete="tel"
        className="w-full rounded-xl border border-black/15 bg-white px-4 py-3.5 text-base text-black placeholder:text-[#98a2b3] focus:border-[#E4344A] focus:outline-none"
      />

      <TurnstileWidget
        action="ultraprompt_lead"
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
      />

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-[#E4344A] py-4 text-base font-black tracking-[-0.02em] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Liberando..." : "Quero os prompts"}
      </button>

      <p className="pt-1 text-center text-xs text-[#98a2b3]">
        Sem spam. Você recebe o material e as novidades da {MARCA.nome}.
      </p>
    </form>
  );
}
