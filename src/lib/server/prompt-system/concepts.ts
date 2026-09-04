import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";
import { DEFAULT_PROJECT_ID } from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";
import { checarPropriedadeIntelectual, INSTRUCAO_PI, type VeredictoPI } from "./guardrail-pi";

/**
 * Etapa 2 — trend jacking criativo, com o guardrail da etapa 3 como portão.
 *
 * A pergunta que o modelo responde é: *como alguém usaria IA para participar
 * dessa conversa?* A tendência é a porta de entrada; a aplicação é o conteúdo.
 *
 * O que sai daqui alimenta a geração visual: cada aplicação vira uma imagem, e
 * a `visual_direction` é o que faz as N imagens parecerem uma série em vez de
 * seis coisas soltas.
 *
 * **O guardrail de PI é portão de gravação, não aviso.** Um conceito reprovado
 * é gravado com `status = "blocked"` e o veredito em `ip_check` — não vira
 * campanha, mas fica registrado com o motivo, para o critério ser auditável e
 * para ninguém tentar o mesmo conceito de novo sem saber que já foi barrado.
 */

const MIN_APLICACOES = 3;
const MAX_APLICACOES = 6;

export type ConceitoGerado = {
  id?: string;
  conceito: string;
  hook: string;
  aplicacoes: string[];
  direcaoVisual: Record<string, string>;
  ipCheck: VeredictoPI;
  status: "draft" | "blocked";
};

const SYSTEM_JACKING = `
Você é o estrategista criativo desta publicação.

Recebe uma tendência em alta e responde: **como alguém usaria IA para
participar dessa conversa?**

A tendência é a porta de entrada. O conteúdo é a APLICAÇÃO — o que a pessoa faz
com a cara dela, o bairro dela, o pet, o produto, a profissão. Ninguém quer ver
a tendência; quer se ver dentro dela.

REGRAS DAS APLICAÇÕES:
- De ${MIN_APLICACOES} a ${MAX_APLICACOES}, cada uma REALMENTE distinta: pessoa
  comum, casal, pet, cidade brasileira, profissão, produto, personagem original.
- Variação quase idêntica não conta. "Retrato de homem" e "retrato de mulher"
  são a mesma aplicação.
- Cada uma precisa ser reproduzível por quem tem só uma foto e um prompt.

DIREÇÃO VISUAL:
Fixe uma direção única que TODAS as imagens vão herdar — é o que faz o conjunto
parecer uma série. Preencha o que fizer sentido: composicao, enquadramento,
cenario, iluminacao, tratamento, textura, atmosfera, elementos_recorrentes.

${INSTRUCAO_PI}

Responda EXCLUSIVAMENTE com o JSON:
{
  "conceito": "o conceito em uma ou duas frases",
  "hook": "a frase de capa, curta e magnética, no máximo 90 caracteres",
  "aplicacoes": ["...", "..."],
  "direcao_visual": { "composicao": "...", "iluminacao": "...", "atmosfera": "..." }
}
`.trim();

/**
 * Reavalia os conceitos barrados com o guardrail atual.
 *
 * Existe porque o veredito é **gravado**, não recalculado na leitura: um
 * conceito barrado guarda o motivo do dia em que foi checado. Quando o
 * guardrail é afrouxado — e ele foi, duas vezes, porque estava barrando a
 * declaração da boa prática ("não inserir logos", "nunca de material
 * oficial") — os registros antigos continuam barrados para sempre, e a
 * correção não alcança o que já existe.
 *
 * Sem isto o conserto seria `UPDATE` na mão em produção, que ninguém audita.
 *
 * Só afrouxa, nunca aperta: um conceito que **passou** a ser reprovado
 * continua `draft`. Rebaixar conteúdo já aprovado — possivelmente já
 * publicado — a partir de uma regra nova é decisão editorial, não efeito
 * colateral de um botão.
 */
export async function reavaliarConceitosBloqueados(): Promise<{
  avaliados: number;
  liberados: number;
  detalhes: Array<{ id: string; hook: string; liberado: boolean; motivos: string[] }>;
}> {
  const supabase = getSupabaseAdminClient();

  const { data } = await supabase
    .from("prompt_concepts")
    .select("id, concept, hook, applications, visual_direction")
    .eq("project_id", DEFAULT_PROJECT_ID)
    .eq("status", "blocked");

  const detalhes: Array<{ id: string; hook: string; liberado: boolean; motivos: string[] }> = [];
  let liberados = 0;

  for (const c of data ?? []) {
    const veredito = checarPropriedadeIntelectual({
      conceito: String(c.concept ?? ""),
      hook: String(c.hook ?? ""),
      aplicacoes: (Array.isArray(c.applications) ? c.applications : []).map((a) =>
        String(a ?? ""),
      ),
      direcaoVisual: (c.visual_direction ?? {}) as Record<string, string>,
    });

    // O veredito é regravado mesmo quando continua barrado: o motivo de hoje
    // é o que quem opera precisa ler para reformular, não o de duas semanas
    // atrás sob outra regra.
    await supabase
      .from("prompt_concepts")
      .update({ ip_check: veredito, ...(veredito.aprovado ? { status: "draft" } : {}) })
      .eq("id", c.id)
      .eq("project_id", DEFAULT_PROJECT_ID);

    if (veredito.aprovado) liberados += 1;

    detalhes.push({
      id: String(c.id),
      hook: String(c.hook ?? c.concept ?? ""),
      liberado: veredito.aprovado,
      motivos: veredito.motivos,
    });
  }

  return { avaliados: (data ?? []).length, liberados, detalhes };
}

/** Gera o conceito a partir da tendência. Não grava — quem chama decide. */
export async function gerarConceito(
  tendencia: { titulo: string; visualHook?: string },
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<Omit<ConceitoGerado, "id">> {
  const { editorModel } = getAIProviderConfig(env);

  const { data } = await callOpenAIJSON<Record<string, unknown>>(
    [
      { role: "system", content: SYSTEM_JACKING },
      {
        role: "user",
        content:
          `TENDÊNCIA: ${tendencia.titulo}\n` +
          (tendencia.visualHook ? `GANCHO VISUAL IDENTIFICADO: ${tendencia.visualHook}\n` : "") +
          `\nGere o conceito e as aplicações.`,
      },
    ],
    editorModel,
    env,
    fetcher,
  );

  const conceito = String(data?.conceito ?? "").trim();
  const hook = String(data?.hook ?? "").trim();

  const aplicacoes = (Array.isArray(data?.aplicacoes) ? data.aplicacoes : [])
    .map((a) => String(a ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_APLICACOES);

  const direcaoBruta = (data?.direcao_visual ?? {}) as Record<string, unknown>;
  const direcaoVisual: Record<string, string> = {};
  for (const [k, v] of Object.entries(direcaoBruta)) {
    const valor = String(v ?? "").trim();
    if (valor) direcaoVisual[k] = valor;
  }

  if (!conceito) throw new Error("O modelo não devolveu conceito.");
  if (aplicacoes.length < MIN_APLICACOES) {
    throw new Error(
      `O conceito precisa de ao menos ${MIN_APLICACOES} aplicações distintas; ` +
        `veio com ${aplicacoes.length}. Cada aplicação é uma imagem — menos que isso ` +
        `não sustenta o carrossel.`,
    );
  }

  // O guardrail roda sobre o que o modelo produziu, não sobre o que pedimos:
  // a instrução no prompt reduz a chance de sair fora da linha, mas não é
  // garantia — e a checagem é o que garante.
  const ipCheck = checarPropriedadeIntelectual({ conceito, hook, aplicacoes, direcaoVisual });

  return {
    conceito,
    hook,
    aplicacoes,
    direcaoVisual,
    ipCheck,
    status: ipCheck.aprovado ? "draft" : "blocked",
  };
}

/**
 * Gera e grava o conceito, promovendo a tendência de origem.
 *
 * A tendência vira `promoted` mesmo quando o conceito é bloqueado pelo
 * guardrail: ela **foi** aproveitada, e o problema está no conceito, não nela.
 * Deixá-la como `candidate` faria a próxima coleta gerar outro conceito para a
 * mesma tendência sem saber que a primeira tentativa foi barrada.
 */
export async function gerarEGravarConceito(
  trendId: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<ConceitoGerado> {
  const supabase = getSupabaseAdminClient();

  const { data: tendencia } = await supabase
    .from("prompt_trends")
    .select("id, raw_title, visual_hook, status")
    .eq("id", trendId)
    .eq("project_id", DEFAULT_PROJECT_ID)
    .maybeSingle();

  if (!tendencia) throw new Error(`Tendência ${trendId} não encontrada.`);

  const gerado = await gerarConceito(
    { titulo: String(tendencia.raw_title), visualHook: String(tendencia.visual_hook ?? "") },
    env,
    fetcher,
  );

  const { data, error } = await supabase
    .from("prompt_concepts")
    .insert({
      project_id: DEFAULT_PROJECT_ID,
      trend_id: trendId,
      concept: gerado.conceito,
      hook: gerado.hook,
      applications: gerado.aplicacoes,
      visual_direction: gerado.direcaoVisual,
      ip_check: gerado.ipCheck,
      status: gerado.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao gravar o conceito: ${error?.message}`);
  }

  await supabase.from("prompt_trends").update({ status: "promoted" }).eq("id", trendId);

  return { ...gerado, id: data.id as string };
}
