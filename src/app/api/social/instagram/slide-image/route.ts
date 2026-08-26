import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId");
  const slideIndexStr = searchParams.get("index");

  if (!postId || !slideIndexStr) {
    return new NextResponse("Parâmetros postId e index são obrigatórios.", { status: 400 });
  }

  const slideIndex = parseInt(slideIndexStr, 10);

  try {
    const supabase = getSupabaseAdminClient();
    const { data: post, error } = await supabase
      .from("social_posts")
      .select("slides_manifest")
      .eq("id", postId)
      .single();

    if (error || !post || !post.slides_manifest) {
      return new NextResponse("Post ou slides não encontrados.", { status: 404 });
    }

    const slides = post.slides_manifest as any[];
    const slide = slides.find((s) => s.index === slideIndex || s.index === slideIndexStr);

    if (!slide || !slide.pngBase64) {
      return new NextResponse("Mídia do slide não encontrada.", { status: 404 });
    }

    const imageBuffer = Buffer.from(slide.pngBase64, "base64");

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error("[SLIDE IMAGE API ERROR]", err);
    return new NextResponse("Erro ao carregar imagem do slide.", { status: 500 });
  }
}
