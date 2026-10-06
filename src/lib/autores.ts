import { MARCA } from "@/lib/marca";
import { editoriaPeloId, hrefDaEditoria } from "@/lib/editorias";

/**
 * Os autores do portal (06/10/2026).
 *
 * Até aqui toda matéria era da "Redação eua.journal", e o JSON-LD dizia isso
 * com uma Organization. O dono aprovou autores com nome: uma pessoa com
 * página própria, cargo, minibio e redes, que assina as matérias que o dono
 * atribuir a ela. A matéria sem autor continua da Redação, e é o padrão de
 * tudo o que a esteira automática publica: inventar pessoa para texto da
 * máquina seria o dado com cara de medida que o projeto recusa.
 *
 * Este arquivo é puro (sem banco), para a página, o painel e os testes usarem
 * as MESMAS regras de slug, de redes e de link.
 */

export type RedesDoAutor = {
  instagram?: string;
  linkedin?: string;
  x?: string;
  site?: string;
};

export type Autor = {
  id: string;
  project_id: string;
  slug: string;
  nome: string;
  cargo: string;
  minibio: string;
  foto_url: string | null;
  /** O id de uma editoria (`economia`, `governo`...) ou texto livre. */
  area: string;
  redes: RedesDoAutor;
  ativo: boolean;
  criado_em?: string;
};

/** O que a página da matéria precisa do autor: a assinatura e o JSON-LD. */
export type AutorDaAssinatura = {
  slug: string;
  nome: string;
  cargo: string;
  foto_url: string | null;
  redes: RedesDoAutor;
};

export const ASSINATURA_DA_REDACAO = `Redação ${MARCA.nome}`;

export function hrefDoAutor(slug: string): string {
  return `/autor/${slug}`;
}

export function urlDoAutor(slug: string): string {
  return `${MARCA.site}${hrefDoAutor(slug)}`;
}

/** Minúsculas, sem acento, palavras ligadas por hífen. Vazio quando não sobra letra nem número. */
export function slugDoAutor(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function urlHttps(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const comEsquema = /^[a-z]+:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}

function handle(texto: string, hosts: string[]): string | null {
  const t = texto.trim();
  if (!t) return null;
  let h = t;
  // "joao.silva" é perfil com ponto, não endereço: só é link com barra ou com o domínio da rede.
  const pareceLink = t.includes("/") || hosts.some((d) => t.toLowerCase().includes(d));
  const url = pareceLink ? urlHttps(t) : null;
  if (pareceLink && !url) return null;
  if (url) {
    const u = new URL(url);
    if (!hosts.includes(u.hostname.replace(/^www\./, ""))) return null;
    h = u.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  h = h.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : null;
}

/**
 * Cada rede na forma canônica de URL, ou `null` quando o que veio não é dela.
 * Aceita "@perfil" e o link inteiro para Instagram e X; LinkedIn só pelo link
 * (o perfil de lá não tem forma curta confiável); site é qualquer https.
 */
export function normalizarRede(rede: keyof RedesDoAutor, texto: string): string | null {
  switch (rede) {
    case "instagram": {
      const h = handle(texto, ["instagram.com"]);
      return h ? `https://www.instagram.com/${h}/` : null;
    }
    case "x": {
      const h = handle(texto, ["x.com", "twitter.com"]);
      return h ? `https://x.com/${h}` : null;
    }
    case "linkedin": {
      const u = urlHttps(texto);
      if (!u) return null;
      const url = new URL(u);
      if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
      if (!/^\/(in|company)\/[^/]+/.test(url.pathname)) return null;
      return `https://www.linkedin.com${url.pathname.replace(/\/+$/, "")}`;
    }
    case "site":
      return urlHttps(texto);
  }
}

export const REDES: ReadonlyArray<{ id: keyof RedesDoAutor; rotulo: string }> = [
  { id: "instagram", rotulo: "Instagram" },
  { id: "linkedin", rotulo: "LinkedIn" },
  { id: "x", rotulo: "X" },
  { id: "site", rotulo: "Site" },
];

/** As redes gravadas, na ordem fixa, só as que são URL válida. Serve à página e ao `sameAs`. */
export function linksDasRedes(redes: RedesDoAutor | null | undefined): Array<{ id: keyof RedesDoAutor; rotulo: string; url: string }> {
  if (!redes || typeof redes !== "object") return [];
  return REDES.flatMap((r) => {
    const bruto = redes[r.id];
    const url = typeof bruto === "string" ? normalizarRede(r.id, bruto) : null;
    return url ? [{ ...r, url }] : [];
  });
}

/** A área do autor: editoria com link quando o texto é um id de editoria, senão texto puro. */
export function areaDoAutor(area: string | null | undefined): { nome: string; href: string | null } | null {
  const a = (area ?? "").trim();
  if (!a) return null;
  const editoria = editoriaPeloId(a);
  return editoria ? { nome: editoria.nome, href: hrefDaEditoria(editoria.id) } : { nome: a, href: null };
}

export type EntradaDoAutor = {
  slug?: unknown;
  nome?: unknown;
  cargo?: unknown;
  minibio?: unknown;
  foto_url?: unknown;
  area?: unknown;
  redes?: unknown;
  ativo?: unknown;
};

export type CamposDoAutor = Omit<Autor, "id" | "project_id" | "criado_em">;

const LIMITES = { nome: 120, cargo: 120, minibio: 1200, area: 80 } as const;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Valida o que o painel mandou. `parcial` é a edição: só o que veio é
 * conferido e devolvido. A recusa é na entrada, com a mensagem que o dono
 * entende, e não no CHECK do banco.
 */
export function validarAutor(
  e: EntradaDoAutor,
  parcial = false,
): { ok: true; campos: Partial<CamposDoAutor> } | { ok: false; erro: string } {
  const campos: Partial<CamposDoAutor> = {};
  const veio = (k: keyof EntradaDoAutor) => !parcial || e[k] !== undefined;

  if (veio("nome")) {
    const nome = texto(e.nome);
    if (!nome) return { ok: false, erro: "informe o nome" };
    if (nome.length > LIMITES.nome) return { ok: false, erro: `nome com mais de ${LIMITES.nome} caracteres` };
    campos.nome = nome;
  }

  if (veio("slug") || (!parcial && campos.nome)) {
    const slug = texto(e.slug) ? slugDoAutor(texto(e.slug)) : slugDoAutor(campos.nome ?? "");
    if (!slug || !SLUG_VALIDO.test(slug)) return { ok: false, erro: "endereço (slug) inválido: use letras, números e hífen" };
    campos.slug = slug;
  }

  for (const k of ["cargo", "minibio", "area"] as const) {
    if (!veio(k)) continue;
    const v = texto(e[k]);
    if (v.length > LIMITES[k]) return { ok: false, erro: `${k} com mais de ${LIMITES[k]} caracteres` };
    campos[k] = v;
  }

  if (veio("foto_url")) {
    const f = texto(e.foto_url);
    if (!f) campos.foto_url = null;
    else {
      const url = /^https:\/\//i.test(f) ? urlHttps(f) : null;
      if (!url) return { ok: false, erro: "a foto precisa ser um link https" };
      campos.foto_url = url;
    }
  }

  if (veio("redes")) {
    const bruto = (e.redes && typeof e.redes === "object" ? e.redes : {}) as Record<string, unknown>;
    const redes: RedesDoAutor = {};
    for (const r of REDES) {
      const v = texto(bruto[r.id]);
      if (!v) continue;
      const url = normalizarRede(r.id, v);
      if (!url) return { ok: false, erro: `${r.rotulo}: endereço não reconhecido` };
      redes[r.id] = url;
    }
    campos.redes = redes;
  }

  if (e.ativo !== undefined) {
    if (typeof e.ativo !== "boolean") return { ok: false, erro: "ativo precisa ser verdadeiro ou falso" };
    campos.ativo = e.ativo;
  } else if (!parcial) {
    campos.ativo = true;
  }

  if (parcial && Object.keys(campos).length === 0) return { ok: false, erro: "nada para mudar" };
  return { ok: true, campos };
}

/**
 * O autor como Person, para o NewsArticle e para o ProfilePage. `sameAs` só
 * com as redes que o dono gravou: perfil que não existe não entra.
 */
export function pessoaDoAutor(a: AutorDaAssinatura): Record<string, unknown> {
  const sameAs = linksDasRedes(a.redes).map((r) => r.url);
  return {
    "@type": "Person",
    "@id": `${urlDoAutor(a.slug)}#pessoa`,
    name: a.nome,
    url: urlDoAutor(a.slug),
    ...(a.cargo ? { jobTitle: a.cargo } : {}),
    ...(a.foto_url ? { image: a.foto_url } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    worksFor: { "@id": `${MARCA.site}/#organizacao` },
  };
}
