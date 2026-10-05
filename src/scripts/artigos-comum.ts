import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planejarEdicao, type EdicaoComoArtigo } from "../lib/server/artigos-por-pauta";
import type { ArtigoAuditavel, PaginaLida } from "../lib/server/auditoria-de-artigo";

/**
 * O que os scripts de auditoria e de correção de artigos dividem (05/10/2026):
 * o ambiente, a leitura do banco e a leitura da página no ar. Só LEITURA aqui;
 * quem grava é `corrigir-artigos.ts`, e só com `--aplicar`.
 */

export function carregarEnv(): void {
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

export function clienteDoBanco(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.");
  return createClient(url, chave, { auth: { persistSession: false } });
}

export type LinhaDoArtigo = ArtigoAuditavel & {
  id?: string;
  status: string;
  project_id: string;
  tags?: string[] | null;
  content?: unknown;
};

const COLUNAS =
  "id, slug, title, excerpt, description, seo_title, seo_description, category, cover_image, published_at, updated_at, content_html, content, aeo_questions, source_urls, status, project_id, tags";

/** As matérias publicadas, como estão no banco agora. */
export async function lerPublicadas(client: SupabaseClient): Promise<LinhaDoArtigo[]> {
  const { data, error } = await client.from("articles").select(COLUNAS).eq("status", "published").order("published_at", { ascending: false });
  if (error) throw new Error(`não consegui ler os artigos: ${error.message}`);
  return (data ?? []) as LinhaDoArtigo[];
}

/**
 * As matérias que o desmonte das edições GRAVARIA, montadas pelo mesmo plano
 * do `artigos-por-pauta.ts`, sem gravar nada. É o estado do portal depois do
 * desmonte, para a auditoria e a correção trabalharem antes de ele rodar.
 */
export async function lerEnsaioDoDesmonte(client: SupabaseClient): Promise<LinhaDoArtigo[]> {
  const { data, error } = await client
    .from("articles")
    .select("slug, project_id, status, published_at, cover_image, content, content_html")
    .like("slug", "edicao-%")
    .order("published_at", { ascending: false });
  if (error) throw new Error(`não consegui ler as edições: ${error.message}`);
  return ((data ?? []) as EdicaoComoArtigo[]).flatMap((e) =>
    (planejarEdicao(e)?.artigos ?? []).map((a) => ({ ...a }) as LinhaDoArtigo),
  );
}

/** A página no ar: o JSON-LD, o canônico e o HTML. `null` se não respondeu 200. */
export async function lerPagina(url: string): Promise<PaginaLida | null> {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (r.status !== 200) return null;
    const html = await r.text();
    const jsonLd: unknown[] = [];
    for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        jsonLd.push(JSON.parse(m[1]));
      } catch {
        jsonLd.push({ erro: "JSON-LD ilegível" });
      }
    }
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1] ?? html.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/i)?.[1] ?? null;
    return { jsonLd, canonical, html };
  } catch {
    return null;
  }
}

/** O valor de `--nome valor` na linha de comando. */
export function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}
