import { getProjectCredentials } from "./projects";
import { resolveInstagramToken } from "./social/instagram/meta-token";

/**
 * A credencial do canal, vinda do projeto quando ele tem uma.
 *
 * Fase 1 da plataforma multi-projeto. A Fase 0 tirou as capacidades do
 * ambiente; sem esta, ligar o social em dois projetos publicaria os dois na
 * MESMA conta do Instagram e na MESMA lista do Listmonk, porque
 * `INSTAGRAM_ACCOUNT_ID` e a configuração inteira do Listmonk são variáveis de
 * ambiente, globais ao deploy.
 *
 * `project_credentials` já existe desde a migration multi-projeto, com quatro
 * provedores previstos, e só `instagram.access_token` era lido. Os outros slots
 * estavam esperando por isto.
 *
 * ## A forma: sobrepor no env, não trocar a leitura
 *
 * Não há mudança em `getMetaConfig` nem em `getListmonkConfig`. Os dez pontos
 * que leem a configuração da Meta continuam lendo do env que recebem; o que
 * muda é o env que chega até eles. É o padrão que `resolveInstagramToken` já
 * usava em produção, e mantê-lo evita tocar em dez call sites do caminho que
 * publica de verdade.
 *
 * ## A regra que torna isto seguro
 *
 * A sobreposição só acontece para a chave que o projeto realmente declara.
 * Projeto sem credencial cai no ambiente, exatamente como antes. Valor vazio ou
 * de tipo errado é tratado como ausente: credencial pela metade não pode
 * apagar a que funciona.
 */

type Env = Record<string, string | undefined>;

/** Só string não vazia conta. `null`, número e objeto são ausência. */
function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}

/**
 * Lista de ids como o Listmonk espera, a partir do que o projeto declarar.
 *
 * Aceita array (`[4, 1]`), que é a forma natural em jsonb, e string (`"4,1"`),
 * que é a forma da variável de ambiente. As duas existem no mundo real, e
 * recusar uma delas por purismo criaria um jeito certo e um jeito silencioso.
 */
function listaDeIds(valor: unknown): string | null {
  if (Array.isArray(valor)) {
    const ids = valor.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
    return ids.length > 0 ? ids.join(",") : null;
  }
  return texto(valor);
}

async function credencial(projectId: string, provider: "instagram" | "listmonk"): Promise<Record<string, unknown> | null> {
  if (!projectId) return null;
  try {
    return await getProjectCredentials(projectId, provider);
  } catch (err) {
    /*
     * Banco fora do ar não pode derrubar a publicação do dia.
     *
     * Cair no ambiente é o comportamento de antes desta fase, e é o certo aqui:
     * a credencial global continua válida. Silenciar seria errado, então fica o
     * log; falhar seria pior, porque trocaria uma degradação por uma parada.
     */
    console.error(`[CREDENCIAL] Leitura de ${provider} falhou, usando o ambiente:`, err);
    return null;
  }
}

/**
 * O env do Instagram para este projeto: token e conta.
 *
 * Substitui a sobreposição que o worker já fazia só do token. A conta importa
 * tanto quanto: com o token do projeto e a conta do ambiente, dois projetos
 * publicariam no mesmo perfil usando credenciais diferentes, que é a pior das
 * combinações possíveis.
 */
export async function envDoInstagram(projectId: string, env: Env = process.env): Promise<Env> {
  /*
   * O token continua saindo de `resolveInstagramToken`, e não de uma leitura
   * própria daqui.
   *
   * Ela já existia, já estava em produção e já tinha teste cobrindo o caso que
   * importa: a pergunta à Meta vai com o token efetivo, nunca com a semente
   * vencida do ambiente. Reimplementar a mesma resolução ao lado criaria uma
   * segunda verdade sobre qual token vale, e foi exatamente isso que quebrou a
   * suíte quando tentei. Custa uma consulta a mais, e a alternativa custava a
   * garantia.
   */
  const token = await resolveInstagramToken(projectId, env);
  const config = await credencial(projectId, "instagram");
  const conta = texto(config?.account_id);

  if (!token && !conta) return env;

  return {
    ...env,
    ...(token ? { INSTAGRAM_ACCESS_TOKEN: token } : {}),
    ...(conta ? { INSTAGRAM_ACCOUNT_ID: conta } : {}),
  };
}

/**
 * O env do Listmonk para este projeto.
 *
 * Cada chave é sobreposta de forma independente, e só quando o projeto a
 * declara. Um projeto que declara apenas a lista continua usando a url e o
 * token do ambiente, que é o caso real de vários projetos numa instalação só
 * do Listmonk, cada um com a sua lista.
 *
 * Vale saber que `url` é a chave que liga o canal: sem ela, em lugar nenhum,
 * `getListmonkConfig` devolve `enabled: false` e a newsletter não sai.
 */
export async function envDoListmonk(projectId: string, env: Env = process.env): Promise<Env> {
  const config = await credencial(projectId, "listmonk");
  if (!config) return env;

  const url = texto(config.url);
  const token = texto(config.api_token) ?? texto(config.token);
  const usuario = texto(config.api_user) ?? texto(config.user);
  const listas = listaDeIds(config.list_ids);
  const formUuid = texto(config.form_list_uuid);

  if (!url && !token && !usuario && !listas && !formUuid) return env;

  return {
    ...env,
    ...(url ? { LISTMONK_URL: url } : {}),
    ...(token ? { LISTMONK_API_TOKEN: token } : {}),
    ...(usuario ? { LISTMONK_API_USER: usuario } : {}),
    ...(listas ? { LISTMONK_DEFAULT_LIST_ID: listas } : {}),
    ...(formUuid ? { LISTMONK_FORM_LIST_UUID: formUuid } : {}),
  };
}
