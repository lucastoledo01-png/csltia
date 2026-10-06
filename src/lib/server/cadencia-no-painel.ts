import {
  CADENCIA_PADRAO,
  CANAIS,
  diaDaSemana,
  lerCadencia,
  somarDiasIso,
  type Canal,
  type CadenciaDoProjeto,
  type DiaDaSemana,
  type Volume,
} from "./cadencia";
import { zonedTimeToUtc } from "./time";

/**
 * A cadência como o painel a edita (06/10/2026).
 *
 * Puro de propósito, e sem nada de servidor: o formulário do painel importa
 * daqui para mostrar a prévia da semana e os avisos ENQUANTO a pessoa edita,
 * com os mesmos validadores de `cadencia.ts` que a esteira usa. A rota que
 * grava passa pelo mesmo caminho, então o que o painel mostra é o que vai
 * valer.
 *
 * Três peças:
 *
 *   cadenciaParaGravar(corpo, atual)   o objeto que vai para settings.cadencia
 *   previaDaSemana(cadencia, segunda)  os sete dias, com o que cada canal faz
 *   chegouAHoraDaProducao(...)         o relógio da rota de produção
 *   avisosDoCrontab(...)               quando a linha fixa do crontab não acompanha
 */

// --- o que se grava ----------------------------------------------------------

const CHAVES_DO_CANAL = ["dias", "horarios", "volume", "fontes"] as const;
const CHAVES_DA_PRODUCAO = ["dias", "horario", "antecedenciaEmDias"] as const;
const CHAVES_DA_APROVACAO = ["dias", "inicio", "fim", "modo"] as const;

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function soAsChaves(bruto: unknown, chaves: readonly string[], atual: Record<string, unknown> | null): Record<string, unknown> | undefined {
  const o = objeto(bruto);
  if (!o) return atual ?? undefined;
  const saida: Record<string, unknown> = {};
  for (const k of chaves) {
    if (o[k] !== undefined) saida[k] = o[k];
    else if (atual && atual[k] !== undefined) saida[k] = atual[k];
  }
  return saida;
}

/**
 * O que o painel mandou, reduzido às chaves que a cadência conhece.
 *
 * NÃO normaliza valor: campo inválido é gravado como veio e, na leitura, cai
 * no padrão daquele campo com aviso, que é a regra de `cadencia.ts` (decisão
 * de 05/10/2026). Normalizar aqui apagaria o aviso: o painel diria "gravado"
 * e o campo voltaria ao padrão em silêncio. Chave desconhecida sai, para o
 * jsonb não juntar lixo; chave que o formulário não edita (as `fontes` de
 * cada canal) continua com o valor que já estava gravado.
 */
export function cadenciaParaGravar(corpo: unknown, atual: unknown): Record<string, unknown> {
  const novo = objeto(corpo) ?? {};
  const antes = objeto(atual) ?? {};
  const saida: Record<string, unknown> = {};
  for (const canal of CANAIS) {
    const v = soAsChaves(novo[canal], CHAVES_DO_CANAL, objeto(antes[canal]));
    if (v !== undefined) saida[canal] = v;
  }
  const producao = soAsChaves(novo.producao, CHAVES_DA_PRODUCAO, objeto(antes.producao));
  if (producao !== undefined) saida.producao = producao;
  const aprovacao = soAsChaves(novo.aprovacao, CHAVES_DA_APROVACAO, objeto(antes.aprovacao));
  if (aprovacao !== undefined) saida.aprovacao = aprovacao;
  return saida;
}

/** O que valeria com este `settings.cadencia`, e os avisos dos campos que caíram no padrão. */
export function leituraDoRascunho(cadenciaDeclarada: unknown) {
  return lerCadencia({ settings: { cadencia: cadenciaDeclarada } });
}

// --- a prévia ----------------------------------------------------------------

export type DiaDaPrevia = {
  data: string;
  diaDaSemana: DiaDaSemana;
  /** Hora local da produção, quando o dia é de produção. */
  producao: string | null;
  /** O dia em que o conteúdo produzido neste dia vai ao ar. */
  producaoPara: string | null;
  aprovacao: { inicio: string; fim: string } | null;
  canais: Record<Canal, { horarios: string[]; volume: Volume } | null>;
};

/** Os sete dias a partir de `inicio` (AAAA-MM-DD), pelo plano da cadência. */
export function previaDaSemana(cadencia: CadenciaDoProjeto, inicio: string): DiaDaPrevia[] {
  const dias: DiaDaPrevia[] = [];
  for (let i = 0; i < 7; i += 1) {
    const data = somarDiasIso(inicio, i);
    const dia = diaDaSemana(data);
    const canais = Object.fromEntries(
      CANAIS.map((c) => [
        c,
        cadencia[c].dias.includes(dia) && cadencia[c].horarios.length > 0
          ? { horarios: cadencia[c].horarios, volume: cadencia[c].volume }
          : null,
      ]),
    ) as DiaDaPrevia["canais"];
    const produz = cadencia.producao.dias.includes(dia);
    dias.push({
      data,
      diaDaSemana: dia,
      producao: produz ? cadencia.producao.horario : null,
      producaoPara: produz ? somarDiasIso(data, cadencia.producao.antecedenciaEmDias) : null,
      aprovacao: cadencia.aprovacao.dias.includes(dia) ? { inicio: cadencia.aprovacao.inicio, fim: cadencia.aprovacao.fim } : null,
      canais,
    });
  }
  return dias;
}

/** A segunda-feira seguinte a `hoje`: a "próxima semana" da prévia. */
export function proximaSegunda(hoje: string): string {
  const dia = diaDaSemana(hoje);
  return somarDiasIso(hoje, dia === 0 ? 1 : 8 - dia);
}

// --- o relógio da produção ---------------------------------------------------

/**
 * De quanto em quanto tempo o crontab chama a rota da produção no modo
 * relógio. A rota produz no primeiro tique que cai entre o horário configurado
 * e quinze minutos depois dele.
 */
export const JANELA_DO_RELOGIO_MIN = 15;

/**
 * A linha que está no crontab hoje: `/api/cron/producao` às 20:00 UTC, que é
 * 17:00 em Brasília. Fixa, e por isso não acompanha a cadência.
 */
export const CRON_FIXO_DA_PRODUCAO_UTC = "20:00";

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function horaLocal(agora: Date, timezone: string): { data: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  const hora = `${p("hour") === "24" ? "00" : p("hour")}:${p("minute")}`;
  return { data: `${p("year")}-${p("month")}-${p("day")}`, hora };
}

export type HoraDaProducao = {
  naJanela: boolean;
  /** Hora local do projeto no instante da chamada. */
  agoraLocal: string;
  horario: string;
  explicacao: string;
};

/**
 * Chegou a hora de produzir? Para a rota chamada de 15 em 15 minutos.
 *
 * Só olha o RELÓGIO. Se hoje é dia de produção quem decide é
 * `decidirProducao`, que grava a linha do dia em `newsroom_runs` também nos
 * dias que não produzem; por isso a janela vale todo dia, e fora dela a rota
 * não grava nada (seriam 96 linhas por dia).
 */
export function chegouAHoraDaProducao(cadencia: CadenciaDoProjeto, agora: Date, timezone: string): HoraDaProducao {
  const { hora } = horaLocal(agora, timezone);
  const horario = cadencia.producao.horario;
  const diferenca = minutos(hora) - minutos(horario);
  const naJanela = diferenca >= 0 && diferenca < JANELA_DO_RELOGIO_MIN;
  return {
    naJanela,
    agoraLocal: hora,
    horario,
    explicacao: naJanela
      ? `${hora} está na janela da produção (${horario} mais ${JANELA_DO_RELOGIO_MIN} minutos).`
      : `${hora} está fora da janela da produção (${horario} mais ${JANELA_DO_RELOGIO_MIN} minutos).`,
  };
}

/**
 * O que o painel precisa dizer sobre o crontab, para a cadência gravada.
 *
 * A linha fixa das 20:00 UTC só produz na hora certa enquanto o horário de
 * produção for o que ela representa no fuso do projeto (17:00 em Brasília).
 * Mudou o horário, e a linha continua lá, a produção sai no horário VELHO: a
 * rota sem `?relogio=1` produz quando é chamada. O aviso diz isso com as duas
 * horas na mão, e diz o caminho: a linha de 15 em 15 minutos com o relógio.
 */
export function avisosDoCrontab(cadencia: CadenciaDoProjeto, timezone: string, referencia: Date): string[] {
  const avisos: string[] = [];
  const data = horaLocal(referencia, timezone).data;
  const disparoFixo = horaLocal(zonedTimeToUtc(data, CRON_FIXO_DA_PRODUCAO_UTC, "UTC"), timezone).hora;
  const horario = cadencia.producao.horario;

  if (horario !== disparoFixo) {
    avisos.push(
      `A produção está marcada para ${horario}, e a linha atual do crontab chama a produção às ` +
        `${CRON_FIXO_DA_PRODUCAO_UTC} UTC, que é ${disparoFixo} neste fuso. Com essa linha a produção continua ` +
        `saindo às ${disparoFixo}. Troque-a pela linha de 15 em 15 minutos com ?relogio=1, que produz no horário ` +
        `gravado aqui.`,
    );
  }
  /*
   * O portal tem o mesmo problema com outra rota: `/api/cron/portal` publica o
   * que venceu quando é chamada, e o crontab a chama nos horários do PRD. A
   * rota é segura de chamar a qualquer hora (não publica nada a mais), então o
   * caminho é a linha de 5 em 5 minutos.
   */
  const portal = cadencia.portal.horarios;
  const doPrd = CADENCIA_PADRAO.portal.horarios;
  const fora = portal.filter((h) => !doPrd.includes(h));
  if (fora.length > 0) {
    avisos.push(
      `O portal tem horário fora dos do PRD (${fora.join(", ")}). A rota /api/cron/portal só publica quando o ` +
        `crontab a chama, e a linha atual chama em ${doPrd.join(", ")}. Troque-a pela linha de 5 em 5 minutos, ` +
        `que publica cada matéria até 5 minutos depois do horário dela.`,
    );
  }

  if (minutos(horario) > 24 * 60 - JANELA_DO_RELOGIO_MIN) {
    avisos.push(
      `Produção depois de 23:45 não tem disparo no mesmo dia ` +
        `na linha de 15 em 15 minutos, e o dia seguinte já seria outro dia de produção. Use um horário até 23:45.`,
    );
  } else if (minutos(horario) % JANELA_DO_RELOGIO_MIN !== 0) {
    avisos.push(
      `Com a linha de 15 em 15 minutos, a produção sai no primeiro disparo depois de ${horario}, até ` +
        `${JANELA_DO_RELOGIO_MIN} minutos mais tarde. Horário em múltiplo de 15 (17:00, 17:15...) sai na hora exata.`,
    );
  }
  return avisos;
}
