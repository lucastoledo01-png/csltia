/**
 * As dependências reais da rodada dos perfis de referência.
 *
 * Separado de `candidatos.ts` para o núcleo ser testável sem banco, sem Meta e
 * sem OpenAI, e para estas importações só acontecerem quando a capacidade está
 * ligada: com `off`, `candidatosDosPerfisDeReferencia` volta antes de carregar
 * este arquivo.
 */

import { getSupabaseAdminClient } from "../../supabase-admin";
import { envDoInstagram } from "../../credenciais-do-projeto";
import { getMetaConfig } from "../instagram/meta-client";
import { collectAllNews } from "../../newsroom/collector";
import { avaliarPautas } from "../../editorial/guarda";
import { carregarConfigEditorial } from "../../editorial/config";
import { criarHistoricoStore } from "../../editorial/history";
import { criarProvedorOpenAI } from "../../editorial/embeddings";
import { lerPerfilPorBusinessDiscovery } from "./graph";
import { extrairTopicos } from "./topico";
import { criarPerfisStore } from "./store";
import { EVENTO_DA_RODADA, type DependenciasDosPerfis, type ProjetoDosPerfis } from "./candidatos";

export async function dependenciasDeProducao(
  projeto: ProjetoDosPerfis,
  envBase: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<DependenciasDosPerfis> {
  const client = getSupabaseAdminClient();
  const config = carregarConfigEditorial(envBase);

  return {
    store: criarPerfisStore(client),

    async credencial() {
      // O token efetivo do projeto, o mesmo que publica. Nunca a semente
      // vencida do ambiente: ver `envDoInstagram`.
      const env = await envDoInstagram(projeto.id, envBase);
      const { accountId, accessToken } = getMetaConfig(env);
      return { accountId, accessToken };
    },

    lerPerfil: (handle, credencial) => lerPerfilPorBusinessDiscovery(handle, credencial, { fetcher }),

    extrair: (handle, sinais) => extrairTopicos(handle, sinais, envBase, fetcher),

    async coletar(fontes) {
      const { candidates } = await collectAllNews(fontes, fetcher);
      return candidates;
    },

    async avaliar(grupos, modo) {
      const historico = await criarHistoricoStore(client).janela(projeto.id, config.janelaDeDias);
      return avaliarPautas(grupos, {
        canal: "instagram",
        historico,
        config,
        provedorDeVetor: criarProvedorOpenAI(envBase, fetcher),
        env: envBase,
        fetcher,
        /*
         * A camada persistida só em `enforce`.
         *
         * Com ela, a classificação vai para `news_candidates` e vale para os
         * outros canais e para a antirrepetição, que é o que se quer quando a
         * pauta pode virar post. Em `dry_run` a rodada é observação: gravar
         * candidatas ali misturaria o ensaio com o pool de verdade.
         */
        ...(modo === "enforce" ? { candidatos: { client, projectId: projeto.id } } : {}),
      });
    },

    async registrarRodada(projectId, payload) {
      const { error } = await client
        .from("platform_events")
        .insert({ event_type: EVENTO_DA_RODADA, project_id: projectId, payload });
      if (error) throw new Error(error.message);
    },
  };
}
