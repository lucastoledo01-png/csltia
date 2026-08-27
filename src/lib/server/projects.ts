import { getSupabaseAdminClient } from "./supabase-admin";
import type { NewsSourceConfig, NewsSourceType } from "./newsroom/news-sources";

/**
 * Projetos da plataforma.
 *
 * Cada projeto é uma marca operando num segmento: tem suas fontes de conteúdo,
 * sua identidade visual, sua conta de publicação e seu horário de disparo. O
 * conteúdo é isolado por `project_id` em todas as tabelas.
 */

/** Projeto semente, criado na migração com o conteúdo que já existia. */
export const DEFAULT_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_PROJECT_SLUG = "desbuguei";

export type Project = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "paused" | "archived";
  niche: string;
  contentLanguage: string;
  timezone: string;
  siteUrl: string | null;
  brand: {
    displayName: string;
    tagline: string;
    primaryColor: string;
    logoUrl: string | null;
    socialLinks: Record<string, string>;
  };
  newsletterFromName: string;
  publishHourLocal: number;
  publishMinuteLocal: number;
  editorialPromptExtra: string;
  settings: Record<string, unknown>;
};

export type ProjectCredentialProvider = "instagram" | "listmonk" | "openai" | "chatbotx";

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  status: Project["status"];
  niche: string;
  content_language: string;
  timezone: string;
  site_url: string | null;
  brand_display_name: string;
  brand_tagline: string;
  brand_primary_color: string;
  brand_logo_url: string | null;
  brand_social_links: Record<string, string> | null;
  newsletter_from_name: string;
  publish_hour_local: number;
  publish_minute_local: number;
  editorial_prompt_extra: string;
  settings: Record<string, unknown> | null;
};

const PROJECT_COLUMNS =
  "id, slug, name, status, niche, content_language, timezone, site_url, " +
  "brand_display_name, brand_tagline, brand_primary_color, brand_logo_url, " +
  "brand_social_links, newsletter_from_name, publish_hour_local, " +
  "publish_minute_local, editorial_prompt_extra, settings";

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    niche: row.niche,
    contentLanguage: row.content_language,
    timezone: row.timezone,
    siteUrl: row.site_url,
    brand: {
      displayName: row.brand_display_name,
      tagline: row.brand_tagline,
      primaryColor: row.brand_primary_color,
      logoUrl: row.brand_logo_url,
      socialLinks: row.brand_social_links ?? {},
    },
    newsletterFromName: row.newsletter_from_name,
    publishHourLocal: row.publish_hour_local,
    publishMinuteLocal: row.publish_minute_local,
    editorialPromptExtra: row.editorial_prompt_extra,
    settings: row.settings ?? {},
  };
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) return null;
  return toProject(data as unknown as ProjectRow);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return toProject(data as unknown as ProjectRow);
}

export async function listProjects(onlyActive = false): Promise<Project[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("projects").select(PROJECT_COLUMNS).order("name");
  if (onlyActive) query = query.eq("status", "active");

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as ProjectRow[]).map(toProject);
}

/**
 * Carrega o projeto e falha se ele não existir ou estiver parado. Rodar um
 * pipeline sobre um projeto inexistente gravaria conteúdo órfão.
 */
export async function requireActiveProject(projectId: string): Promise<Project> {
  const project = await getProjectById(projectId);

  if (!project) {
    throw new Error(`Projeto ${projectId} não encontrado.`);
  }
  if (project.status !== "active") {
    throw new Error(`Projeto ${project.slug} está com status "${project.status}" e não publica.`);
  }

  return project;
}

/** Fontes de conteúdo configuradas para o projeto, no formato do coletor. */
export async function getProjectNewsSources(projectId: string): Promise<NewsSourceConfig[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("project_news_sources")
    .select("source_key, name, company_name, type, url, enabled, priority, category, region")
    .eq("project_id", projectId)
    .eq("enabled", true)
    .order("priority");

  if (error) {
    throw new Error(`Falha ao carregar fontes do projeto: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      `Projeto ${projectId} não tem nenhuma fonte de conteúdo habilitada. Configure em project_news_sources.`,
    );
  }

  return data.map((row) => ({
    id: row.source_key as string,
    name: row.name as string,
    companyName: (row.company_name as string | null) ?? undefined,
    type: row.type as NewsSourceType,
    url: row.url as string,
    enabled: row.enabled as boolean,
    priority: row.priority as 1 | 2,
    category: row.category as NewsSourceConfig["category"],
    region: row.region as NewsSourceConfig["region"],
  }));
}

/**
 * Credenciais do projeto para um provedor. Devolve `null` quando não há
 * registro — quem chama decide se isso é erro.
 */
export async function getProjectCredentials(
  projectId: string,
  provider: ProjectCredentialProvider,
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("project_credentials")
    .select("config, expires_at")
    .eq("project_id", projectId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;

  if (data.expires_at && new Date(data.expires_at as string).getTime() <= Date.now()) {
    console.warn(`[PROJECT] Credencial ${provider} do projeto ${projectId} está vencida.`);
  }

  return (data.config as Record<string, unknown>) ?? null;
}

/**
 * Data corrente no fuso do projeto, no formato AAAA-MM-DD.
 *
 * O pipeline usava `new Date().toISOString()`, que é UTC: qualquer execução
 * depois das 21h no Brasil era gravada com a data do dia seguinte.
 */
export function projectToday(project: Pick<Project, "timezone">, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: project.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
