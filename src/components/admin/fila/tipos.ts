import type { Aprovacao, Etapa, Ramo } from "@/lib/server/aprovacao/contrato";
import type { PreviaDaPeca } from "@/lib/server/aprovacao/previa";
import type { DiaDoInstagram } from "@/lib/server/aprovacao/dia-do-instagram";
import type { FiltroDeStatus } from "@/lib/server/aprovacao/situacao";

/**
 * O que a tela da fila recebe de `GET /api/admin/aprovacao`, e as contas de
 * data que os cartões dividem. Tudo no fuso de São Paulo: o dono decide pelo
 * relógio dele, e o contêiner está em UTC.
 */

export type Taxa = { ramo: Ramo; decididas: number; dePrimeira: number; taxa: number | null };
export type Regra = { id: string; ramo?: Ramo | null; etapa: Etapa; regra: string; ocorrencias: number; exemplos: string[]; estado: string };

export type Visao = {
  ok: boolean;
  error?: string;
  projeto?: { slug: string; nome: string };
  modo: string;
  ramos: Record<Ramo, "manual" | "automatico">;
  horarios: { aviso: string; envio: string };
  fila: Aprovacao[];
  taxa: Taxa[];
  regras: Regra[];
  previas?: Record<string, PreviaDaPeca>;
  instagram?: DiaDoInstagram;
  agora?: string;
};

export type Agir = (corpo: Record<string, unknown>, sucesso: string) => Promise<boolean>;

/** O canal como o dono o chama. O ramo `artigo` é o portal. */
export const NOME_DO_CANAL: Record<Ramo, string> = { newsletter: "Newsletter", artigo: "Portal", post: "Instagram", plano: "Plano do dia" };
// O plano vem primeiro: aprová-lo é o que libera a produção das outras peças.
export const ORDEM_DOS_CANAIS: Ramo[] = ["plano", "newsletter", "artigo", "post"];

/**
 * A cor de cada situação (05/11/2026, pedido do dono): amarelo aguarda você,
 * verde aprovada, vermelho reprovada, azul publicada. A mesma cor no filtro e
 * no selo do cartão. Em hexadecimal de propósito: o `.admin-shell` remapeia
 * amber, emerald e blue do Tailwind para cinza (`admin.css`).
 */
export const COR_DO_FILTRO: Record<FiltroDeStatus, { cheio: string; contagem: string; selo: string; ponto: string; sombra: string }> = {
  aguardando: {
    cheio: "bg-[#FACC15] text-[#3B2A02] border-[#FACC15]",
    contagem: "bg-[#3B2A02]/15 text-[#3B2A02]",
    selo: "bg-[#FACC15] text-[#3B2A02]",
    ponto: "bg-[#EAB308]",
    sombra: "shadow-[0_6px_18px_-6px_rgba(234,179,8,0.7)]",
  },
  aprovadas: {
    cheio: "bg-[#16A34A] text-white border-[#16A34A]",
    contagem: "bg-white/25 text-white",
    selo: "bg-[#DCFCE7] text-[#14532D]",
    ponto: "bg-[#16A34A]",
    sombra: "shadow-[0_6px_18px_-6px_rgba(22,163,74,0.6)]",
  },
  reprovadas: {
    cheio: "bg-[#DC2626] text-white border-[#DC2626]",
    contagem: "bg-white/25 text-white",
    selo: "bg-[#FEE2E2] text-[#7F1D1D]",
    ponto: "bg-[#DC2626]",
    sombra: "shadow-[0_6px_18px_-6px_rgba(220,38,38,0.6)]",
  },
  publicadas: {
    cheio: "bg-[#2563EB] text-white border-[#2563EB]",
    contagem: "bg-white/25 text-white",
    selo: "bg-[#DBEAFE] text-[#1E3A8A]",
    ponto: "bg-[#2563EB]",
    sombra: "shadow-[0_6px_18px_-6px_rgba(37,99,235,0.6)]",
  },
};

const FUSO = "America/Sao_Paulo";

export function chaveDoDia(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "sem-dia";
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);
}

export function rotuloDoDia(chave: string, agoraIso: string): string {
  if (chave === "sem-dia") return "Sem horário";
  const hoje = chaveDoDia(agoraIso);
  const um = 24 * 60 * 60 * 1000;
  const amanha = chaveDoDia(new Date(Date.parse(agoraIso) + um).toISOString());
  const ontem = chaveDoDia(new Date(Date.parse(agoraIso) - um).toISOString());
  const [a, m, d] = chave.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d, 12));
  const extenso = data.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });
  if (chave === hoje) return `Hoje, ${extenso}`;
  if (chave === amanha) return `Amanhã, ${extenso}`;
  if (chave === ontem) return `Ontem, ${extenso}`;
  return extenso.charAt(0).toUpperCase() + extenso.slice(1);
}

export function horaCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

/** O horário da peça numa frase: "sai às 18:00", "saiu às 06:07". */
export function fraseDoHorario(a: Aprovacao, previa: PreviaDaPeca | undefined, agoraIso: string): string {
  const noAr = Boolean(previa && "noAr" in previa && previa.noAr);
  const publicado = previa && "publicadoEm" in previa ? previa.publicadoEm : null;
  const quando = (noAr && publicado) || a.publicarEm;
  if (!quando) return noAr ? "no ar" : "sem horário marcado";
  const h = horaCurta(quando);
  if (noAr) return `saiu às ${h}`;
  return Date.parse(quando) <= Date.parse(agoraIso) ? `era para sair às ${h}` : `sai às ${h}`;
}
