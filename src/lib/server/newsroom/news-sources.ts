export type NewsSourceType = "rss" | "atom" | "html" | "api";

export type NewsSourceConfig = {
  id: string;
  name: string;
  companyName?: string;
  type: NewsSourceType;
  url: string;
  enabled: boolean;
  priority: 1 | 2;
  category: "lab" | "tech_media" | "research" | "general_ai";
};

export const defaultNewsSources: NewsSourceConfig[] = [
  // Prioridade 1: Laboratórios e Empresas de IA Oficiais
  {
    id: "openai-blog",
    name: "OpenAI Official Blog",
    companyName: "OpenAI",
    type: "rss",
    url: "https://openai.com/news/rss.xml",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "anthropic-news",
    name: "Anthropic News & Research",
    companyName: "Anthropic",
    type: "rss",
    url: "https://www.anthropic.com/feed.xml",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "google-deepmind",
    name: "Google DeepMind Blog",
    companyName: "Google",
    type: "rss",
    url: "https://deepmind.google/blog/rss.xml",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "meta-ai-blog",
    name: "Meta AI Blog",
    companyName: "Meta",
    type: "rss",
    url: "https://ai.meta.com/blog/rss/",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "microsoft-ai-blog",
    name: "Microsoft Official AI Blog",
    companyName: "Microsoft",
    type: "rss",
    url: "https://blogs.microsoft.com/ai/feed/",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "huggingface-blog",
    name: "Hugging Face Blog",
    companyName: "Hugging Face",
    type: "rss",
    url: "https://huggingface.co/blog/feed.xml",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "github-blog-ai",
    name: "GitHub AI Blog",
    companyName: "GitHub",
    type: "rss",
    url: "https://github.blog/category/ai/feed/",
    enabled: true,
    priority: 1,
    category: "lab",
  },
  {
    id: "aws-ai-blog",
    name: "AWS Machine Learning Blog",
    companyName: "Amazon",
    type: "rss",
    url: "https://aws.amazon.com/blogs/machine-learning/feed/",
    enabled: true,
    priority: 1,
    category: "lab",
  },

  // Prioridade 2: Mídia e Veículos de Tecnologia de Alta Credibilidade
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    type: "rss",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    enabled: true,
    priority: 2,
    category: "tech_media",
  },
  {
    id: "arstechnica-ai",
    name: "Ars Technica AI",
    type: "rss",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    enabled: true,
    priority: 2,
    category: "tech_media",
  },
  {
    id: "venturebeat-ai",
    name: "VentureBeat AI",
    type: "rss",
    url: "https://venturebeat.com/category/ai/feed/",
    enabled: true,
    priority: 2,
    category: "tech_media",
  },
  {
    id: "mit-tech-review",
    name: "MIT Technology Review AI",
    type: "rss",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    enabled: true,
    priority: 2,
    category: "tech_media",
  },
  {
    id: "theverge-ai",
    name: "The Verge AI",
    type: "rss",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    enabled: true,
    priority: 2,
    category: "tech_media",
  },
];
