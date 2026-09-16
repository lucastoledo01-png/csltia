import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../lib/server/projects";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { resolveVisualAsset } from "../lib/server/visual/resolver";
import { congelarArtefato } from "../lib/server/social/artefato";

/**
 * Refaz a ARTE de um post que já existe, sem tocar no texto dele.
 *
 * Existe para o caso em que a peça foi congelada antes de uma correção visual:
 * a foto que o resolvedor não achava e agora acha, a tipografia remedida, a
 * marca trocada. Sem isto, a única saída é cancelar o post e gerar outro, e as
 * duas barreiras de idempotência impedem gerar outro para a mesma pauta no
 * mesmo dia.
 *
 * O que ele NÃO faz, e é o ponto: não reescreve manchete, legenda, hashtags
 * nem horário. O texto já passou pelo Social Guard e continua valendo. O que
 * muda é o desenho, e só ele.
 *
 * O artefato novo sobe num caminho NOVO, com sufixo. Sobrescrever o caminho
 * antigo quebraria o hash de quem ainda aponta para ele, que foi exatamente o
 * defeito que derrubou o post das 14h32 de 16/09/2026.
 *
 *   npx tsx src/scripts/reencapar-arte.ts --dia=2026-09-16
 *   npx tsx src/scripts/reencapar-arte.ts --dia=2026-09-16 --valendo
 */

function carregarEnv(): void {
  for (const arquivo of [".env.local", ".env"]) {
    const caminho = path.resolve(process.cwd(), arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [chave, ...resto] = t.split("=");
      const valor = resto.join("=").trim().replace(/^["']|["']$/g, "");
      if (chave && !process.env[chave.trim()]) process.env[chave.trim()] = valor;
    }
  }
}

type Linha = {
  id: string;
  title: string;
  status: string;
  story_id: string | null;
  candidate_id: string | null;
  scheduled_at: string | null;
  content_json: Record<string, any>;
  asset_paths: string[] | null;
};

async function main() {
  carregarEnv();

  const argv = process.argv.slice(2);
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };

  const dia = valor("dia") ?? new Date().toISOString().slice(0, 10);
  const valendo = argv.includes("--valendo");

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const client = getSupabaseAdminClient();

  const { data, error } = await client
    .from("social_posts")
    .select("id,title,status,story_id,candidate_id,scheduled_at,content_json,asset_paths")
    .eq("project_id", project.id)
    .eq("edition_date", dia)
    .in("status", ["scheduled", "failed"])
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(`leitura de social_posts falhou: ${error.message}`);

  const linhas = (data ?? []) as unknown as Linha[];
  console.log(`[REENCAPAR] ${linhas.length} post(s) em ${dia}, ${valendo ? "VALENDO" : "ensaio"}`);

  // Uma foto não pode ir para dois posts do mesmo dia.
  const usadosAgora = new Set<string>();

  for (const linha of linhas) {
    const cj = linha.content_json ?? {};
    const copy = cj.copy ?? {};
    const arte = cj.arte ?? {};
    const headline = String(copy.headline ?? linha.title ?? "").trim();

    /*
     * Carrossel fica de fora, e a checagem olha DUAS coisas.
     *
     * Só o `content_json.slides` não basta: a peça de várias telas se
     * reconhece pelo número de arquivos que ela tem no Storage. Refazer um
     * carrossel como capa única trocaria seis arquivos por um e o post sairia
     * pela metade.
     */
    const ehCarrossel =
      (Array.isArray(cj.slides) && cj.slides.length > 0) ||
      (Array.isArray(linha.asset_paths) && linha.asset_paths.length > 1) ||
      Boolean(cj.carrossel);
    if (ehCarrossel) {
      console.log(`[REENCAPAR] pulo carrossel: ${linha.title.slice(0, 50)}`);
      continue;
    }
    if (!headline) {
      console.log(`[REENCAPAR] pulo sem manchete: ${linha.id}`);
      continue;
    }

    /*
     * A classificação vem da candidata, que é onde ela mora.
     * Sem ator, lugar e acontecimento o resolvedor não tem entidade para
     * procurar, e devolveria conceitual para tudo.
     */
    let classificacao = { atores: [] as string[], lugares: [] as string[], acontecimento: [] as string[], pais: "EUA" };
    let resumo = "";
    if (linha.story_id) {
      const { data: cand } = await client
        .from("news_candidates")
        .select("title,summary,classificacao")
        .eq("project_id", project.id)
        .eq("story_id", linha.story_id)
        .limit(1);
      const c = (cand ?? [])[0] as { summary?: string; classificacao?: Record<string, unknown> } | undefined;
      if (c?.classificacao) {
        const k = c.classificacao as Record<string, unknown>;
        classificacao = {
          atores: Array.isArray(k.atores) ? (k.atores as string[]) : [],
          lugares: Array.isArray(k.lugares) ? (k.lugares as string[]) : [],
          acontecimento: Array.isArray(k.acontecimento) ? (k.acontecimento as string[]) : [],
          pais: typeof k.pais === "string" ? k.pais : "EUA",
        };
      }
      resumo = String(c?.summary ?? "");
    }

    /*
     * A foto que o post JÁ tem vale mais que uma nova.
     *
     * Ela passou pelo resolvedor uma vez, com as mesmas barreiras, e já está
     * gravada na memória de "não repetir foto": pedir de novo faz o resolvedor
     * recusar a própria escolha dele, porque ela consta como usada hoje. E o
     * objetivo aqui é trocar o DESENHO, não a imagem.
     */
    const fotoQueJaTem = String((cj.visual ?? {}).imageUrl ?? "").trim();
    if (fotoQueJaTem) {
      const credito = String((cj.visual ?? {}).credito ?? "");
      console.log(`[REENCAPAR] reaproveita a foto que o post já tem :: ${headline.slice(0, 46)}`);
      if (!valendo) continue;

      const congeladoComFoto = await congelarArtefato({
        capa: {
          headline,
          eixo: String(arte.eixo ?? ""),
          asset: { imageUrl: fotoQueJaTem, attribution: credito },
          assetSecundario: null,
          motivoSemFoto: "",
        },
        path: `${project.slug}/${dia}/reencapado-${linha.id.slice(0, 8)}-v2`,
      });

      if (!congeladoComFoto.ok) {
        console.log(`[REENCAPAR] arte não fechou: ${congeladoComFoto.motivo}`);
        continue;
      }

      const { error: erroFoto } = await client
        .from("social_posts")
        .update({
          content_json: {
            ...cj,
            arte: { ...arte, artefato: { ...(arte.artefato ?? {}), ...congeladoComFoto.artefato, index: 1 }, variante: "capa_jornal" },
          },
          asset_paths: [congeladoComFoto.artefato.url],
          slides_manifest: [
            {
              index: 1,
              url: congeladoComFoto.artefato.url,
              filename: congeladoComFoto.artefato.filename,
              sha256: congeladoComFoto.artefato.sha256,
              bytes: congeladoComFoto.artefato.bytes,
              provider_child_id: null,
            },
          ],
          error_message: null,
        })
        .eq("id", linha.id);

      if (erroFoto) console.log(`[REENCAPAR] gravação falhou: ${erroFoto.message}`);
      else console.log(`[REENCAPAR] trocado com a foto de sempre: sha ${congeladoComFoto.artefato.sha256.slice(0, 8)}`);
      continue;
    }

    const visual = await resolveVisualAsset(
      {
        storyId: linha.story_id ?? linha.id,
        titulo: headline,
        resumo,
        categoria: String(arte.eixo ?? ""),
        classificacao,
      },
      { client, env: process.env, jaUsadosNestaEdicao: usadosAgora, somenteLeitura: !valendo },
    );

    const temFoto = Boolean(visual.asset?.imageUrl);
    console.log(
      `[REENCAPAR] ${temFoto ? "COM FOTO" : "sem foto"} (${visual.motivo ?? "ok"}) :: ${headline.slice(0, 52)}`,
    );

    if (!valendo) continue;
    if (!temFoto) continue;

    const caminhoNovo = `${project.slug}/${dia}/reencapado-${linha.id.slice(0, 8)}`;
    const congelado = await congelarArtefato({
      capa: {
        headline,
        eixo: String(arte.eixo ?? ""),
        asset: visual.asset,
        assetSecundario: visual.assetSecundario ?? null,
        motivoSemFoto: visual.motivo ?? "",
      },
      path: caminhoNovo,
    });

    if (!congelado.ok) {
      console.log(`[REENCAPAR] arte não fechou, post fica como está: ${congelado.motivo}`);
      continue;
    }

    const artefato = { ...(arte.artefato ?? {}), ...congelado.artefato, index: 1 };
    const novoConteudo = {
      ...cj,
      arte: { ...arte, artefato, variante: temFoto ? "capa_jornal" : "noticia_sem_foto" },
      visual: {
        ...(cj.visual ?? {}),
        capa: "foto",
        imageUrl: visual.asset?.imageUrl ?? "",
        credito: visual.asset?.attribution ?? "",
        motivo: visual.motivo ?? "",
      },
    };

    const { error: erroUpdate } = await client
      .from("social_posts")
      .update({
        content_json: novoConteudo,
        asset_paths: [congelado.artefato.url],
        slides_manifest: [
          {
            index: 1,
            url: congelado.artefato.url,
            filename: congelado.artefato.filename,
            sha256: congelado.artefato.sha256,
            bytes: congelado.artefato.bytes,
            provider_child_id: null,
          },
        ],
        status: "scheduled",
        error_message: null,
      })
      .eq("id", linha.id);

    if (erroUpdate) {
      console.log(`[REENCAPAR] gravação falhou: ${erroUpdate.message}`);
      continue;
    }

    if (visual.asset?.imageUrl) usadosAgora.add(visual.asset.imageUrl);
    console.log(`[REENCAPAR] trocado: ${congelado.artefato.url.slice(-40)} sha ${congelado.artefato.sha256.slice(0, 8)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
