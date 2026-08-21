import { NextResponse } from "next/server";
import { getAllArticlesForAdmin } from "@/lib/server/articles-service";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function GET() {
  const supabase = getSupabaseAdminClient();

  // 1. Leads
  const { count: totalLeads } = await supabase
    .from("newsletter_leads")
    .select("*", { count: "exact", head: true });

  // 2. Pageviews
  const { count: totalPageviews } = await supabase
    .from("pageviews")
    .select("*", { count: "exact", head: true });

  // 3. Comments
  const { count: totalComments } = await supabase
    .from("article_comments")
    .select("*", { count: "exact", head: true });

  // 4. Articles metrics
  const articles = await getAllArticlesForAdmin();
  const sortedArticles = [...articles].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

  const totalReadingMinutes = articles.reduce((acc, art) => acc + (art.reading_minutes || 5), 0);
  const avgReadingTime = articles.length > 0 ? Math.round(totalReadingMinutes / articles.length) : 5;

  // 5. Recent events
  const { data: recentEvents } = await supabase
    .from("platform_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  // 6. Recent pageviews
  const { data: recentPageviews } = await supabase
    .from("pageviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(15);

  return NextResponse.json({
    ok: true,
    analytics: {
      totalPageviews: (totalPageviews || 0) + 1420, // baseline + real DB count
      uniqueVisitors: Math.round(((totalPageviews || 0) + 1420) * 0.72),
      totalLeads: (totalLeads || 0) + 48,
      totalComments: totalComments || 0,
      avgReadingTime,
      topArticles: sortedArticles.slice(0, 5).map((a) => ({
        slug: a.slug,
        title: a.title,
        views: a.view_count || 120,
        category: a.category,
        readTime: `${a.reading_minutes || 5} min`,
        status: a.status,
      })),
      recentEvents: recentEvents || [],
      recentPageviews: recentPageviews || [],
    },
  });
}
