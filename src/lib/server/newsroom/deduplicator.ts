import { NewsCandidate } from "./collector";

export type DeduplicatedGroup = {
  primary: NewsCandidate;
  secondary_sources: string[];
  secondary_urls: string[];
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = tokenize(textA);
  const setB = tokenize(textB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export function deduplicateCandidates(candidates: NewsCandidate[]): {
  uniqueGroups: DeduplicatedGroup[];
  duplicatesCount: number;
} {
  const groups: DeduplicatedGroup[] = [];
  let duplicatesCount = 0;

  for (const candidate of candidates) {
    let matchedGroup: DeduplicatedGroup | null = null;

    for (const group of groups) {
      // 1. Chave de deduplicação direta ou URL
      if (group.primary.url === candidate.url || group.primary.dedupe_key === candidate.dedupe_key) {
        matchedGroup = group;
        break;
      }

      // 2. Similaridade de título > 65%
      const similarity = calculateJaccardSimilarity(group.primary.title, candidate.title);
      if (similarity >= 0.65) {
        matchedGroup = group;
        break;
      }
    }

    if (matchedGroup) {
      duplicatesCount++;
      matchedGroup.secondary_sources.push(candidate.source_name);
      matchedGroup.secondary_urls.push(candidate.url);

      // Se o candidato for de fonte oficial (Prioridade 1) e o grupo atual for Prioridade 2, promove a fonte oficial a principal
      if (candidate.priority === 1 && matchedGroup.primary.priority > 1) {
        matchedGroup.secondary_urls.push(matchedGroup.primary.url);
        matchedGroup.secondary_sources.push(matchedGroup.primary.source_name);
        matchedGroup.primary = candidate;
      }
    } else {
      groups.push({
        primary: candidate,
        secondary_sources: [],
        secondary_urls: [],
      });
    }
  }

  return { uniqueGroups: groups, duplicatesCount };
}
