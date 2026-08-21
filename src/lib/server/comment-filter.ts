const PROFANITY_BLACKLIST = [
  "caralho", "porra", "merda", "bosta", "puta", "puto", "cainho", "arrombado", "foder", "fodeu", "foda",
  "desgraça", "vagabundo", "cadela", "filho da puta", "fdp", "viado", "cabrão", "otario", "otário",
  "corno", "cacete", "buceta", "pica", "pau", "cu", "piranha", "siririca", "pica", "rola"
];

const SPAM_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /\.com|\.ru|\.xyz|\.top|\.online|\.site|\.info/i,
  /casino|betting|apostas|tigrinho|slots|poker|crypto|bitcoin|telegram|whatsapp|ganhar dinheiro rápido/i,
];

export function evaluateCommentContent(content: string, name: string): { status: "approved" | "rejected" | "pending"; reason?: string } {
  const normalized = `${name} ${content}`.toLowerCase();

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(normalized)) {
      return { status: "rejected", reason: "Filtro anti-spam ativado (links ou palavras promocionais detectadas)." };
    }
  }

  for (const word of PROFANITY_BLACKLIST) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(normalized)) {
      return { status: "rejected", reason: "Palavra ofensiva ou imprópria detectada." };
    }
  }

  return { status: "approved" };
}
