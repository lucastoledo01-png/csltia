import { getSupabaseAdminClient } from "../../supabase-admin";

/**
 * Subir um PNG para o Storage, e nada além disso.
 *
 * Isto morava dentro de `opendesign-renderer.ts`, que importa o banco de fotos
 * de estoque. Qualquer módulo que precisasse apenas subir um arquivo puxava,
 * de carona, o caminho de foto de banco para dentro do seu grafo de imports.
 *
 * Para o ramo social-v2 isso não é detalhe de organização: a garantia de que
 * ele nunca alcança foto de banco nem geração por IA é provada lendo o grafo
 * de imports. Se ele importasse o renderizador antigo só para usar esta
 * função, a prova viraria encenação.
 */
export async function subirPngParaStorage(
  pngBuffer: Buffer,
  filepath: string,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdminClient();

    const { error: uploadErr } = await supabase.storage
      .from("public_assets")
      .upload(filepath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      console.warn("[STORAGE UPLOAD WARN]", uploadErr.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage.from("public_assets").getPublicUrl(filepath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.warn("[STORAGE EXCEPTION]", err);
    return null;
  }
}
