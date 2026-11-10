import type { SupabaseClient } from "@supabase/supabase-js";
import { cadenciaDoProjeto } from "@/lib/server/cadencia";
import type { Project } from "@/lib/server/projects";
import { vagasDaTarde, type PostDoDia } from "@/lib/server/social/quente-da-tarde";
import { zonedTimeToUtc } from "@/lib/server/time";

/*
 * A vaga do Instagram: o dia pedido e, sem vaga nele, o próximo dia com
 * horário livre (29/10/2026 no Reel de vídeo; 10/11/2026 no post do MCP).
 *
 * Em 10/11/2026 os posts da Anthropic e da Ring ficaram prontos às 15:27 de
 * Brasília, quando o dia só tinha mais dois horários, e os dois foram para
 * Rubio e Massie. O post de foto não procurava o dia seguinte: o texto
 * escrito, auditado e a matéria do portal saíram, e o post não.
 */
export const DIAS_PARA_ACHAR_VAGA = 4;

export function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type Vaga = { data: string; horaLocal: string; quandoIso: string };

export async function proximaVagaDoInstagram(
  projeto: Project,
  dataPedida: string,
  deps: { client: SupabaseClient; agora?: () => Date },
): Promise<{ ok: true; vaga: Vaga } | { ok: false; error: string }> {
  const cadencia = cadenciaDoProjeto(projeto);
  const agora = deps.agora ? deps.agora() : new Date();
  let motivo = "";
  let data = dataPedida;
  for (let dia = 0; dia < DIAS_PARA_ACHAR_VAGA; dia++) {
    data = somarDias(dataPedida, dia);
    const { data: linhas, error } = await deps.client
      .from("social_posts")
      .select("status, scheduled_at, error_message, dry_run")
      .eq("project_id", projeto.id)
      .eq("edition_date", data)
      .eq("platform", "instagram");
    if (error) return { ok: false, error: `os posts de ${data} não puderam ser lidos: ${error.message}` };
    const vagas = vagasDaTarde({
      horarios: cadencia.instagram.horarios,
      dataIso: data,
      timezone: projeto.timezone,
      agoraMs: agora.getTime(),
      postsDoDia: (linhas ?? []) as PostDoDia[],
      maximoDoDia: cadencia.instagram.volume.maximo,
      maximoDoCiclo: 1,
    });
    const horaLocal = vagas.teto > 0 ? vagas.horarios[0] : null;
    if (horaLocal) return { ok: true, vaga: { data, horaLocal, quandoIso: zonedTimeToUtc(data, horaLocal, projeto.timezone).toISOString() } };
    motivo = vagas.motivo;
  }
  return { ok: false, error: `sem vaga no Instagram de ${dataPedida} a ${data}: ${motivo}` };
}
