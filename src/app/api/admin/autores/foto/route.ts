import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/api-auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { projetoDoPedido } from "../comum";

/**
 * Sobe a foto de um autor para o Storage e devolve o endereço público
 * (06/10/2026). O painel grava esse endereço em `foto_url`, como faria com um
 * link colado. Vai para `public_assets`, o bucket público das artes, numa
 * pasta própria por projeto; o nome é aleatório para trocar de foto nunca
 * servir a antiga do cache.
 */

const TAMANHO_MAXIMO_DA_FOTO = 2 * 1024 * 1024;

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "envie o arquivo como formulário" }, { status: 400 });

  const p = await projetoDoPedido(String(form.get("projeto") ?? ""));
  if ("resposta" in p) return p.resposta;

  const arquivo = form.get("arquivo");
  if (!arquivo || typeof arquivo === "string") {
    return NextResponse.json({ ok: false, error: "nenhum arquivo enviado" }, { status: 400 });
  }
  const ext = EXTENSAO[arquivo.type];
  if (!ext) return NextResponse.json({ ok: false, error: "use JPG, PNG ou WebP" }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO_DA_FOTO) {
    return NextResponse.json({ ok: false, error: "a foto passa de 2 MB: reduza antes de subir" }, { status: 400 });
  }

  const caminho = `autores/${p.projeto.id}/${randomUUID()}.${ext}`;
  try {
    const storage = getSupabaseAdminClient().storage.from("public_assets");
    const { error } = await storage.upload(caminho, Buffer.from(await arquivo.arrayBuffer()), {
      contentType: arquivo.type,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const url = storage.getPublicUrl(caminho).data.publicUrl;
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
