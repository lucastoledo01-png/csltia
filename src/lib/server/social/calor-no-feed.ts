import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoDaCapacidade } from "../capacidades";
import type { PautaAvaliada } from "../editorial/guarda";
import {
  aquecerPool,
  calcularCalorDoDia,
  gravarCalor,
  liderPeloCalor,
  registroDoCalor,
  type FontesDoCalor,
} from "../editorial/calor-do-dia";
import { comporFeedSocial, type ConfigSocial } from "./selecao";

/**
 * O calor na porta de entrada do Instagram (06/10/2026).
 *
 * Entra ANTES dos finalistas, e não depois da composição, porque é ali que a
 * ordem começa a cortar: `conferirFinalistas` só verifica as N de maior nota,
 * e a pauta quente que estivesse em décimo nunca chegaria à composição.
 *
 * Em `dry_run` devolve o MESMO array, e grava o que mudaria: a ordem dos
 * finalistas e o feed que `comporFeedSocial` montaria com e sem o calor. A
 * composição de mentira não paga nada (é função pura), e é o que permite ao
 * dono ler "o feed de hoje seria este" antes de ligar.
 */
export async function calorNoPoolDoInstagram(
  pool: PautaAvaliada[],
  entrada: {
    modo: EstadoDaCapacidade;
    fontes: FontesDoCalor;
    configSocial: ConfigSocial;
    client: Pick<SupabaseClient, "from"> | null | undefined;
    projectId: string;
    editionDate: string;
    agoraMs?: number;
  },
): Promise<{ pool: PautaAvaliada[]; linhas: string[] }> {
  if (entrada.modo === "off" || pool.length === 0) return { pool, linhas: [] };

  const calor = await calcularCalorDoDia(pool, {
    fontes: entrada.fontes,
    agoraMs: entrada.agoraMs,
    limiar: entrada.configSocial.limiarDeAgrupamento,
  });
  const aquecido = aquecerPool(pool, calor.porStory);

  const titulos = (lista: PautaAvaliada[], n: number) =>
    [...lista]
      .sort((a, b) => b.pontuacao.total - a.pontuacao.total)
      .slice(0, n)
      .map((p) => p.grupo.primary.title.slice(0, 120));
  const feed = (lista: PautaAvaliada[]) =>
    comporFeedSocial(lista, entrada.configSocial, { paraPublicar: false }).escolhidas.map((e) =>
      e.pauta.grupo.primary.title.slice(0, 120),
    );

  const feedAtual = feed(pool);
  const feedComCalor = feed(aquecido);
  const entraram = feedComCalor.filter((t) => !feedAtual.includes(t));

  const linhas = [
    ...calor.linhas,
    `[CALOR] instagram ${entrada.modo}: ${entraram.length} pauta(s) entrariam no feed pelo calor`,
    ...entraram.map((t) => `[CALOR] entraria: ${t.slice(0, 80)}`),
  ];

  const naoGravado = await gravarCalor(entrada.client, entrada.projectId, {
    canal: "instagram",
    modo: entrada.modo,
    data: entrada.editionDate,
    avisos: calor.avisos,
    pautas: registroDoCalor(pool, calor.porStory),
    ordemAtual: titulos(pool, 10),
    ordemComCalor: titulos(aquecido, 10),
    feedAtual,
    feedComCalor,
    entraram,
  });
  if (naoGravado) linhas.push(`[CALOR] registro não gravado: ${naoGravado}`);

  return { pool: entrada.modo === "enforce" ? aquecido : pool, linhas };
}

/**
 * O calor na abertura da newsletter. A seleção é a mesma; só a primeira pauta
 * pode mudar, e só em `enforce`. Ver `liderPeloCalor`.
 */
export async function calorNaAberturaDaNewsletter(
  escolhidas: PautaAvaliada[],
  entrada: {
    modo: EstadoDaCapacidade;
    fontes: FontesDoCalor;
    client: Pick<SupabaseClient, "from"> | null | undefined;
    projectId: string;
    editionDate: string;
    limiar?: number;
    agoraMs?: number;
  },
): Promise<{ escolhidas: PautaAvaliada[]; linhas: string[] }> {
  if (entrada.modo === "off" || escolhidas.length < 2) return { escolhidas, linhas: [] };

  const calor = await calcularCalorDoDia(escolhidas, {
    fontes: entrada.fontes,
    agoraMs: entrada.agoraMs,
    limiar: entrada.limiar,
  });
  const lider = liderPeloCalor(escolhidas, calor.porStory);
  const linhas = [
    ...calor.linhas,
    lider.mudou
      ? `[CALOR] newsletter ${entrada.modo}: abertura ${entrada.modo === "enforce" ? "passa a ser" : "seria"} "${lider.depois?.slice(0, 70)}", no lugar de "${lider.antes?.slice(0, 70)}"`
      : `[CALOR] newsletter ${entrada.modo}: a abertura já é a pauta mais quente`,
  ];

  const naoGravado = await gravarCalor(entrada.client, entrada.projectId, {
    canal: "newsletter",
    modo: entrada.modo,
    data: entrada.editionDate,
    avisos: calor.avisos,
    pautas: registroDoCalor(escolhidas, calor.porStory),
    aberturaAtual: lider.antes,
    aberturaComCalor: lider.depois,
    mudou: lider.mudou,
  });
  if (naoGravado) linhas.push(`[CALOR] registro não gravado: ${naoGravado}`);

  return { escolhidas: entrada.modo === "enforce" ? lider.pautas : escolhidas, linhas };
}
