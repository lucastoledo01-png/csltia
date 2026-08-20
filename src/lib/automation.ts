export const safeSources = [
  {
    name: "Hacker News",
    type: "news/community",
    risk: "baixo",
    purpose: "Detectar conversas e links técnicos em alta sobre IA.",
  },
  {
    name: "RSS de blogs oficiais",
    type: "rss",
    risk: "baixo",
    purpose: "Capturar anúncios de labs, ferramentas e empresas de IA com fonte primária.",
  },
  {
    name: "arXiv",
    type: "paper index",
    risk: "baixo",
    purpose: "Encontrar papers relevantes e tendências técnicas antes de virarem notícia popular.",
  },
  {
    name: "YouTube",
    type: "transcrição",
    risk: "médio",
    purpose: "Transformar vídeos confiáveis em briefs, artigos e cortes editoriais.",
  },
];

export const automationStages = [
  {
    name: "Busca de notícias",
    shortName: "Busca de notícias",
    output: "links, fontes, metadados e score bruto",
    guardrail: "não usar fonte sem URL e data",
  },
  {
    name: "Triagem e deduplicação",
    shortName: "Triagem",
    output: "pautas únicas priorizadas",
    guardrail: "remover repetição e claims sem origem",
  },
  {
    name: "Escrita de artigos",
    shortName: "Escrita de artigos",
    output: "rascunho AEO com tom Casaloti",
    guardrail: "separar fato, interpretação e aplicação prática",
  },
  {
    name: "Newsletter",
    shortName: "Newsletter",
    output: "edição pronta para e-mail com assunto, preview e CTA",
    guardrail: "não enviar sem fonte, link canônico e checagem de promessa",
  },
  {
    name: "Instagram",
    shortName: "Instagram",
    output: "legenda, roteiro de carrossel e CTA",
    guardrail: "não prometer resultado sem evidência",
  },
  {
    name: "Publicação com guardrails",
    shortName: "Publicação",
    output: "post publicado, newsletter e log de performance",
    guardrail: "bloquear se faltar fonte, título, slug, CTA ou revisão de segurança",
  },
];

export const automationPrinciples = [
  "Começar em dry-run antes de publicar sozinho.",
  "Publicar automaticamente apenas conteúdo que passe pelos guardrails.",
  "Salvar fontes e decisões editoriais para auditoria.",
  "Medir desempenho para alimentar o próximo ciclo diário.",
];
