export type AeoQuestion = {
  question: string;
  answer: string;
};

export type ArticleSectionDraft = {
  heading: string;
  paragraphs: string[];
};

export type AdminArticleDraft = {
  title: string;
  slug: string;
  description: string;
  excerpt: string;
  status: "draft" | "scheduled" | "published" | "archived";
  category: string;
  tags: string[];
  sourceUrls: string[];
  seoTitle: string;
  seoDescription: string;
  aeoQuestions: AeoQuestion[];
  ageSummary: string;
  sections: ArticleSectionDraft[];
};

export type EditorialCheck = {
  id: string;
  group: "seo" | "aeo" | "age" | "safety" | "editorial";
  label: string;
  passed: boolean;
};

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeAeoQuestions(value: unknown): AeoQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        question: String(record.question ?? "").trim(),
        answer: String(record.answer ?? "").trim(),
      };
    })
    .filter((item): item is AeoQuestion => Boolean(item?.question && item.answer));
}

function normalizeSections(value: unknown): ArticleSectionDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        heading: String(record.heading ?? "").trim(),
        paragraphs: toStringArray(record.paragraphs),
      };
    })
    .filter((item): item is ArticleSectionDraft => Boolean(item?.heading && item.paragraphs.length));
}

export function normalizeAdminArticleDraft(input: Record<string, unknown>): AdminArticleDraft {
  const status = String(input.status ?? "draft");

  return {
    title: String(input.title ?? "").trim(),
    slug: String(input.slug ?? "").trim().toLowerCase(),
    description: String(input.description ?? "").trim(),
    excerpt: String(input.excerpt ?? "").trim(),
    status: ["draft", "scheduled", "published", "archived"].includes(status)
      ? (status as AdminArticleDraft["status"])
      : "draft",
    category: String(input.category ?? "ia").trim() || "ia",
    tags: toStringArray(input.tags),
    sourceUrls: toStringArray(input.sourceUrls ?? input.source_urls),
    seoTitle: String(input.seoTitle ?? input.seo_title ?? "").trim(),
    seoDescription: String(input.seoDescription ?? input.seo_description ?? "").trim(),
    aeoQuestions: normalizeAeoQuestions(input.aeoQuestions ?? input.aeo_questions),
    ageSummary: String(input.ageSummary ?? input.age_summary ?? "").trim(),
    sections: normalizeSections(input.sections),
  };
}

export function buildEditorialReadiness(draft: AdminArticleDraft) {
  const checks: EditorialCheck[] = [
    {
      id: "title",
      group: "editorial",
      label: "Título humano e claro",
      passed: draft.title.length >= 20,
    },
    {
      id: "slug",
      group: "seo",
      label: "Slug legível para busca",
      passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug),
    },
    {
      id: "seo-title",
      group: "seo",
      label: "SEO title com tamanho seguro",
      passed: draft.seoTitle.length >= 20 && draft.seoTitle.length <= 70,
    },
    {
      id: "seo-description",
      group: "seo",
      label: "Meta description com promessa clara",
      passed: draft.seoDescription.length >= 70 && draft.seoDescription.length <= 170,
    },
    {
      id: "source-url",
      group: "safety",
      label: "Fonte registrada antes de publicar",
      passed: draft.sourceUrls.some((url) => /^https:\/\//.test(url)),
    },
    {
      id: "aeo-answer",
      group: "aeo",
      label: "Pergunta e resposta direta para answer engines",
      passed: draft.aeoQuestions.some((item) => item.question.length >= 10 && item.answer.length >= 30),
    },
    {
      id: "age-summary",
      group: "age",
      label: "Resumo para motores generativos",
      passed: draft.ageSummary.length >= 80,
    },
    {
      id: "body",
      group: "editorial",
      label: "Corpo com seção editável",
      passed: draft.sections.some((section) => section.paragraphs.join(" ").length >= 60),
    },
  ];

  const passed = checks.filter((check) => check.passed).length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    canPublish: checks.every((check) => check.passed),
    score,
    checks,
  };
}
