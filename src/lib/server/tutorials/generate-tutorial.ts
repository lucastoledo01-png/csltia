import { callOpenAIJSON, getAIProviderConfig, type AITokenUsage } from "../newsroom/ai-provider";
import { normalizeAdminArticleDraft, type AdminArticleDraft } from "../editorial-quality";

/**
 * Gera um rascunho de tutorial evergreen (ex: "como usar a skill X no Claude
 * Code"), diferente do resumo diário de notícias: o modelo escreve passo a
 * passo original a partir do tema, não sintetiza itens coletados de fontes.
 *
 * Sempre volta como rascunho (status "draft") — precisa de revisão humana
 * antes de publicar, igual a qualquer edição criada no CMS.
 */
export async function generateTutorialDraft(
  topic: string,
  referenceUrls: string[] = [],
): Promise<{ draft: AdminArticleDraft; usage: AITokenUsage }> {
  const { editorModel } = getAIProviderConfig();

  const referencesBlock = referenceUrls.length
    ? `\n\nReferências que o autor deve consultar e citar como fonte:\n${referenceUrls.map((u) => `- ${u}`).join("\n")}`
    : "";

  const systemPrompt = `Você é o redator sênior de tutoriais da "desbuguei.ia", a mesma marca que escreve a newsletter e os carrosséis do Instagram — mesmo tom, mesmo público: criadores de conteúdo, gestores de redes sociais, empreendedores e curiosos por IA que não são programadores experientes.

TOM & ESTILO (igual ao resto da desbuguei.ia):
- Informal, direto, com personalidade — nada de texto de manual técnico ou documentação fria.
- Linguagem de rede social: gancho forte logo na primeira frase de cada seção, frases curtas, ritmo de quem tá contando uma sacada pro amigo, não lendo um manual.
- PROIBIDO clichê de texto gerado por IA: "Em um mundo onde...", "Não é apenas X, é Y", "Vale ressaltar...", "Desvendando...", "Na era da inteligência artificial...".
- Sem jargão técnico sem tradução — se usar um termo técnico, explica na mesma frase o que ele significa na prática.
- Cada seção deve deixar claro POR QUE aquilo gera resultado (economiza tempo, cria conteúdo mais rápido, dá vantagem competitiva) — não é tutorial por tutorial, é tutorial que gera buzz porque o leitor sai sabendo fazer algo que poucos sabem.
- Passo a passo real: comandos exatos, nomes de arquivo, telas reais — nunca genérico ou vago.

Escreva tutoriais completos em português do Brasil sobre Claude Code, repositórios do GitHub relevantes e skills/ferramentas de IA. O leitor não é necessariamente programador experiente.

Devolva APENAS um objeto JSON com este formato exato:
{
  "title": "string, mínimo 20 caracteres, título humano e específico",
  "slug": "string em kebab-case, minúsculas, sem acentos",
  "excerpt": "string, resumo curto e atrativo (1-2 frases)",
  "description": "string, igual ao excerpt ou levemente expandido",
  "category": "Tutorial",
  "tags": ["array de 3 a 6 palavras-chave relevantes"],
  "sourceUrls": ["array com pelo menos 1 URL https:// de referência oficial"],
  "seoTitle": "string entre 20 e 70 caracteres",
  "seoDescription": "string entre 70 e 170 caracteres, promessa clara do que o leitor aprende",
  "aeoQuestions": [{"question": "pergunta direta que o leitor faria (mín 10 caracteres)", "answer": "resposta direta e completa (mín 30 caracteres)"}],
  "ageSummary": "string com no mínimo 80 caracteres: resumo denso pensado para motores de busca com IA (AI Overviews, Perplexity, etc)",
  "sections": [
    {"heading": "string, título da seção", "paragraphs": ["array de parágrafos em texto corrido, sem HTML"]}
  ]
}

O tutorial deve ter entre 4 e 8 seções, cobrindo: o que é / para que serve, pré-requisitos, passo a passo prático, e um fechamento com dica ou próximo passo. Seja específico — comandos, nomes de arquivos, telas reais — nunca genérico.`;

  const userPrompt = `Escreva um tutorial completo sobre: "${topic}"${referencesBlock}`;

  const { data, usage } = await callOpenAIJSON<Record<string, unknown>>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    editorModel,
  );

  const draft = normalizeAdminArticleDraft({ ...data, status: "draft", category: "Tutorial" });

  return { draft, usage };
}
