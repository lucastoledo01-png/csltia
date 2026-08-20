export type PageviewInput = {
  path?: unknown;
  referrer?: unknown;
};

export type SignupInput = {
  email?: unknown;
  source?: unknown;
};

export function normalizePageview(input: PageviewInput) {
  if (typeof input.path !== "string" || !input.path.startsWith("/") || input.path.startsWith("//")) {
    throw new Error("path invalido");
  }

  return {
    path: input.path.slice(0, 300),
    referrer: typeof input.referrer === "string" ? input.referrer.slice(0, 500) : null,
  };
}

export function normalizeSignupEvent(input: SignupInput) {
  if (typeof input.email !== "string" || !input.email.includes("@")) {
    throw new Error("email invalido");
  }

  return {
    email: input.email.trim().toLowerCase().slice(0, 320),
    source: typeof input.source === "string" ? input.source.slice(0, 80) : "site",
  };
}
