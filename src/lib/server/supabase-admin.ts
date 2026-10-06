import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "./env";

/**
 * Cliente Supabase com chave de serviço, exclusivo do servidor.
 *
 * A URL e a chave vinham com valores padrão escritos no código, o que fazia
 * um ambiente mal configurado se conectar silenciosamente a um projeto fixo.
 * Agora a falta de configuração interrompe a operação.
 */
export function getSupabaseAdminClient() {
  const { url, key } = getSupabaseAdminConfig();

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return travado ? somenteLeitura(client) : client;
}

/*
 * Trava de escrita para ensaio (06/10/2026).
 *
 * O ensaio da redação (`dryRun`) pula as escritas que ele conhece, mas
 * "pular as que conhece" é uma lista, e lista envelhece: a classificação grava
 * `news_candidates`, a foto grava a biblioteca, o diagnóstico do social grava
 * `platform_events`, todos também em ensaio. Para um ensaio que o dono pede
 * com "não escreva nada em produção", a garantia precisa ser estrutural: com a
 * trava ligada, TODO cliente devolvido por `getSupabaseAdminClient` recusa
 * insert, upsert, update, delete, rpc e escrita no Storage, e a recusa volta
 * como `error` (o mesmo formato de uma falha do PostgREST), que todo caminho
 * de gravação deste repositório já trata como "não gravou, segue".
 *
 * É um interruptor de processo, e não variável de ambiente, de propósito: uma
 * variável esquecida no painel do EasyPanel desligaria a gravação da produção
 * em silêncio. Só um script chama `travarEscritasDoBanco()`.
 */
let travado = false;
const bloqueadas: string[] = [];

export function travarEscritasDoBanco(): void {
  travado = true;
}

/** Só para teste: desliga a trava e limpa o registro. */
export function destravarEscritasDoBanco(): void {
  travado = false;
  bloqueadas.length = 0;
}

/** As escritas recusadas pela trava, na ordem, como `operacao tabela`. */
export function escritasBloqueadas(): readonly string[] {
  return bloqueadas;
}

const ESCRITAS_DA_TABELA = new Set(["insert", "upsert", "update", "delete"]);
const ESCRITAS_DO_STORAGE = new Set(["upload", "update", "remove", "move", "copy", "uploadToSignedUrl", "createSignedUploadUrl"]);

/**
 * Um resultado que aceita qualquer encadeamento (`.select().single()` depois
 * do `upsert`) e, aguardado, devolve o erro de recusa.
 */
function recusa(operacao: string, alvo: string): unknown {
  bloqueadas.push(`${operacao} ${alvo}`);
  const resultado = {
    data: null,
    error: { message: `SOMENTE_LEITURA: ${operacao} em ${alvo} bloqueado no ensaio`, code: "SOMENTE_LEITURA", details: "", hint: "" },
    count: null,
    status: 0,
    statusText: "SOMENTE_LEITURA",
  };
  const encadeavel: unknown = new Proxy(function () {}, {
    get(_alvo, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, falha);
      }
      return () => encadeavel;
    },
    apply() {
      return encadeavel;
    },
  });
  return encadeavel;
}

function metodoLigado(alvo: object, prop: string | symbol): unknown {
  const v = Reflect.get(alvo, prop, alvo);
  return typeof v === "function" ? v.bind(alvo) : v;
}

/** O cliente com toda escrita recusada. Leitura passa intacta. */
export function somenteLeitura(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(alvo, prop) {
      if (prop === "from") {
        return (tabela: string) => {
          const consulta = alvo.from(tabela);
          return new Proxy(consulta, {
            get(c, op) {
              if (typeof op === "string" && ESCRITAS_DA_TABELA.has(op)) return () => recusa(op, tabela);
              return metodoLigado(c, op);
            },
          });
        };
      }
      if (prop === "rpc") return (fn: string) => recusa("rpc", fn);
      if (prop === "storage") {
        const storage = alvo.storage;
        return new Proxy(storage, {
          get(s, p) {
            if (p !== "from") return metodoLigado(s, p);
            return (bucket: string) => {
              const b = storage.from(bucket);
              return new Proxy(b, {
                get(bb, op) {
                  if (typeof op === "string" && ESCRITAS_DO_STORAGE.has(op)) return () => recusa(op, `storage:${bucket}`);
                  return metodoLigado(bb, op);
                },
              });
            };
          },
        });
      }
      return metodoLigado(alvo, prop);
    },
  });
}
