import { DeduplicatedGroup } from "./deduplicator";

export type RankedCandidate = {
  group: DeduplicatedGroup;
  score: number;
  breakdown: {
    impact: number;
    novelty: number;
    utility: number;
    credibility: number;
  };
  reasoning: string;
};

const HIGH_IMPACT_KEYWORDS = ["model", "gpt", "claude", "gemini", "llama", "deepmind", "api", "benchmark", "release", "launch", "agent", "reasoning", "open source", "weights"];
const PRACTICAL_UTILITY_KEYWORDS = ["tool", "feature", "code", "python", "developer", "workflow", "price", "free", "discount", "update", "integration", "prompt"];

export function scoreCandidate(group: DeduplicatedGroup): RankedCandidate {
  const item = group.primary;
  const titleLower = item.title.toLowerCase();
  const descLower = item.description.toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // 1. Credibilidade (20%) - Fontes Prioridade 1 ganham 20; Prioridade 2 ganham 14
  let credibility = item.priority === 1 ? 20 : 14;
  if (group.secondary_sources.length > 0) credibility = Math.min(20, credibility + 3);

  // 2. Novidade (25%) - Notícias mais recentes nas últimas 12h ganham nota máxima
  const ageHours = (Date.now() - new Date(item.published_at).getTime()) / (1000 * 60 * 60);
  let novelty = 25;
  if (ageHours > 24) novelty = 15;
  if (ageHours > 36) novelty = 10;

  // 3. Impacto (35%) - Palavras-chave de alto impacto de mercado/modelos
  let impact = 15;
  for (const kw of HIGH_IMPACT_KEYWORDS) {
    if (combined.includes(kw)) impact += 4;
  }
  impact = Math.min(35, impact);

  // 4. Utilidade Prática (20%) - Ferramentas, preço, código, fluxos de trabalho
  let utility = 8;
  for (const kw of PRACTICAL_UTILITY_KEYWORDS) {
    if (combined.includes(kw)) utility += 3;
  }
  utility = Math.min(20, utility);

  const totalScore = Math.round(impact + novelty + utility + credibility);

  return {
    group,
    score: totalScore,
    breakdown: { impact, novelty, utility, credibility },
    reasoning: `Score ${totalScore}: Imp=${impact}, Nov=${novelty}, Util=${utility}, Cred=${credibility}`,
  };
}

export function rankAndFilterCandidates(
  groups: DeduplicatedGroup[],
  alreadyPublishedUrls: string[] = []
): RankedCandidate[] {
  const publishedSet = new Set(alreadyPublishedUrls.map((u) => u.toLowerCase()));

  // 1. Filtrar já publicadas
  const freshGroups = groups.filter((g) => !publishedSet.has(g.primary.url.toLowerCase()));

  // 2. Pontuar cada candidata
  const scored = freshGroups.map((g) => scoreCandidate(g));

  // 3. Ordenar por score decrescente
  scored.sort((a, b) => b.score - a.score);

  // 4. Aplicar limite de diversidade: máximo de 2 pautas por empresa por edição
  const companyCounts: Record<string, number> = {};
  const selected: RankedCandidate[] = [];

  for (const item of scored) {
    const company = item.group.primary.company_name?.toLowerCase() || item.group.primary.source_name.toLowerCase();
    const currentCount = companyCounts[company] || 0;

    if (currentCount < 2) {
      companyCounts[company] = currentCount + 1;
      selected.push(item);
    }
  }

  return selected;
}
