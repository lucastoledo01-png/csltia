import { escapeHtml, safeHttpUrl } from "../html";
import { createListmonkClient } from "../listmonk";
import {
  scheduleEditionPosts,
  type ScheduledPostSlot,
} from "../social/instagram/scheduler";
import {
  DEFAULT_PROJECT_ID,
  getProjectNewsSources,
  projectToday,
  requireActiveProject,
} from "../projects";
import { getSupabaseAdminClient } from "../supabase-admin";
import { collectAllNews } from "./collector";
import { deduplicateCandidates } from "./deduplicator";
import { runNewsroomPipeline } from "./pipeline";
import { rankAndFilterCandidates } from "./ranker";
import { EditionContent } from "./schemas";
import { sendAlert } from "../alerts";
import { MARCA } from "@/lib/marca";
import {
  bancoConfigurado,
  buscarFotoDeBanco,
  consultaDaNoticia,
} from "../prompt-system/stock";
import { carregarConfigEditorial } from "../editorial/config";
import { criarProvedorOpenAI } from "../editorial/embeddings";
import { criarHistoricoStore } from "../editorial/history";
import { avaliarPautas, registroDaPauta } from "../editorial/guarda";
import type { PautaAvaliada } from "../editorial/guarda";
import type { RankedCandidate } from "./ranker";

export type RunNewsroomOptions = {
  /** Projeto para o qual a edição é produzida. Sem valor, usa o projeto semente. */
  projectId?: string;
  dryRun?: boolean;
  timeWindowHours?: number;
  idempotencyKey?: string;
  publishToPortal?: boolean;
  createNewsletterCampaign?: boolean;
  autoSend?: boolean;
};

const fallbackImages = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1200&q=80",
];

/**
 * HTML da edição.
 *
 * `paraWeb` decide o que fica de fora, e a distinção não é cosmética: a mesma
 * string ia para a caixa de entrada **e** para o corpo do artigo no portal.
 * Na página, o resultado era a edição duplicada, porque a página desenha o próprio
 * cabeçalho (título, data, resumo) e logo abaixo aparecia o cabeçalho do
 * e-mail com os mesmos dados, mais o índice repetindo todos os títulos, mais
 * o rodapé com "powered by" e o link de descadastro. Foi o que apareceu como
 * "repetindo um monte de parte".
 *
 * O que sai no modo web é só o que a página já provê ou o que só faz sentido
 * numa caixa de entrada. As pautas em si são idênticas nos dois.
 */
export function renderEditionToHtml(
  edition: EditionContent,
  coverImages: string[] = [],
  paraWeb = false,
): string {
  const todayStr = new Date().toISOString().split("T")[0];

  const dataLonga = new Date()
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase();

  // --- paleta e medidas -----------------------------------------------------
  //
  // Tudo o que é texto fica em #1A1A1A ou #4A4A4A sobre branco. A auditoria do
  // template anterior achou o oposto disso: rótulo vermelho sobre cinza claro,
  // caixa amarela com texto âmbar, cinza médio sobre cinza claro. Cor de marca
  // aqui é acento (fio, número, rótulo curto), nunca corpo de texto.
  const TINTA = "#1A1A1A";
  const TINTA_SUAVE = "#4A4A4A";
  const LINHA = "#E4E4E7";

  const fonte =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  /*
   * Anula a borda que o template padrao do Listmonk aplica em TODA tabela
   * (`table { border: 1px solid #ddd }` no CSS dele). Como este layout usa
   * tabela para diagramar, cada bloco saiu com uma caixa cinza em volta, e o
   * indice "Nesta edicao" ficou dentro de um retangulo.
   *
   * Estilo inline vence a folha de estilo, entao a correcao vale mesmo se o
   * template mudar.
   */
  const SEM_BORDA = "border:0;border-collapse:collapse";

  const rotulo = (texto: string, cor: string) =>
    `<div style="font-family:${fonte};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${cor};margin:0 0 10px 0;">${escapeHtml(texto)}</div>`;

  // --- índice ---------------------------------------------------------------
  //
  // Numerado, sem emoji e sem caixa cinza. O emoji por categoria vinha de um
  // mapa da vertical antiga ("Redes Sociais", "Vendas") e caía num raio ⚡ para
  // toda pauta de imigração, decoração que não informa nada.
  const tocHtml = edition.stories
    .map(
      (s, i) => `
      <tr>
        <td style="padding:0 0 12px 0;vertical-align:top;width:28px;">
          <span style="font-family:${fonte};font-size:15px;font-weight:800;color:${MARCA.cor};">${i + 1}</span>
        </td>
        <td style="padding:0 0 12px 0;font-family:${fonte};font-size:15px;line-height:1.45;color:${TINTA};">
          ${escapeHtml(s.title)}
        </td>
      </tr>`,
    )
    .join("");

  // --- pautas ---------------------------------------------------------------
  //
  // A primeira pauta tem tratamento de capa. As demais são mais curtas.
  //
  // Antes, toda pauta trazia os mesmos dois blocos rotulados ("O que muda na
  // prática" e "Por que olhar de perto"), na mesma ordem, com o mesmo tamanho.
  // Cinco vezes seguidas isso deixa de ser estrutura e vira cadência de robô:
  // o leitor aprende o formato na segunda pauta e passa a rolar as outras.
  //
  // Só a pauta principal ganha o box destacado. Nas demais o impacto prático
  // entra como uma frase no fim do parágrafo, sem rótulo. Um texto com ritmo
  // variado se lê; um formulário repetido não.
  const storiesHtml = edition.stories
    .map((s, index) => {
      const principal = index === 0;
      const whatsappText = encodeURIComponent(
        `${s.title}\n\n${MARCA.site}/artigos/edicao-${todayStr}`,
      );
      const imagem = safeHttpUrl(coverImages[index] || "", "");
      const fonteUrl = safeHttpUrl(s.source_url);

      const linhaDaFonte = `
        <p style="font-family:${fonte};font-size:13px;line-height:1.5;color:#71717A;margin:0;">
          Fonte:
          <a href="${escapeHtml(fonteUrl)}" target="_blank" rel="noopener noreferrer" style="color:#71717A;text-decoration:underline;">${escapeHtml(s.source_name)}</a>
          &nbsp;·&nbsp;
          <a href="https://wa.me/?text=${whatsappText}" target="_blank" style="color:${MARCA.cor};text-decoration:none;font-weight:700;">Compartilhar</a>
        </p>`;

      if (!principal) {
        return `
      <tr><td style="padding:0 0 34px 0;border:0;">
        ${rotulo(s.category, MARCA.cor)}
        <h2 style="font-family:${fonte};font-size:21px;line-height:1.3;font-weight:800;letter-spacing:-0.015em;color:${TINTA};margin:0 0 12px 0;">
          ${escapeHtml(s.title)}
        </h2>
        ${
          imagem
            ? `<img src="${escapeHtml(imagem)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;border-radius:10px;margin:0 0 14px 0;" />`
            : ""
        }
        <p style="font-family:${fonte};font-size:15px;line-height:1.7;color:${TINTA_SUAVE};margin:0 0 12px 0;">
          ${escapeHtml(s.summary)}${
            s.practical_impact ? ` <strong style="color:${TINTA};">${escapeHtml(s.practical_impact)}</strong>` : ""
          }
        </p>
        ${linhaDaFonte}
      </td></tr>`;
      }

      return `
      <tr><td style="padding:0 0 40px 0;border:0;">
        ${rotulo(s.category, MARCA.cor)}

        <h2 style="font-family:${fonte};font-size:27px;line-height:1.22;font-weight:800;letter-spacing:-0.02em;color:${TINTA};margin:0 0 16px 0;">
          ${escapeHtml(s.title)}
        </h2>

        ${
          imagem
            ? `<img src="${escapeHtml(imagem)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;border-radius:10px;margin:0 0 18px 0;" />`
            : ""
        }

        <p style="font-family:${fonte};font-size:16px;line-height:1.72;color:${TINTA_SUAVE};margin:0 0 14px 0;">
          ${escapeHtml(s.summary)}
        </p>

        ${/*
          Contexto e relevância no mesmo parágrafo, sem rótulo. O conteúdo do
          "Por que olhar de perto" continua na edição; o que sai é o rótulo
          repetido em toda pauta, que era o que dava cara de formulário.
        */ ""}
        ${
          s.context || s.why_it_matters
            ? `<p style="font-family:${fonte};font-size:16px;line-height:1.72;color:${TINTA_SUAVE};margin:0 0 18px 0;">${[
                escapeHtml(s.context ?? ""),
                escapeHtml(s.why_it_matters ?? ""),
              ]
                .filter(Boolean)
                .join(" ")}</p>`
            : ""
        }

        ${
          s.practical_impact
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};margin:0 0 18px 0;">
          <tr>
            <td style="background:${MARCA.fundoRealce};border:0;border-left:3px solid ${MARCA.tintaEscura};border-radius:0 8px 8px 0;padding:16px 18px;">
              ${rotulo("O que muda na prática", MARCA.tintaEscura)}
              <p style="font-family:${fonte};font-size:15px;line-height:1.65;color:${TINTA};margin:0;">
                ${escapeHtml(s.practical_impact)}
              </p>
            </td>
          </tr>
        </table>`
            : ""
        }

        ${linhaDaFonte}
      </td></tr>`;
    })
    .join("");

  // --- giro rápido ----------------------------------------------------------
  const quickBitsHtml =
    edition.quick_bits && edition.quick_bits.length > 0
      ? `
      <tr><td style="padding:0 0 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">
          <tr><td style="background:#FAFAFA;border:1px solid ${LINHA};border-radius:12px;padding:22px 24px;">
            ${rotulo("Giro rápido", TINTA_SUAVE)}
            ${edition.quick_bits
              .map(
                (q) => `<p style="font-family:${fonte};font-size:15px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 10px 0;">
                  <strong style="color:${TINTA};">${escapeHtml(q.title)}</strong> ${escapeHtml(q.text ?? "")}
                </p>`,
              )
              .join("")}
          </td></tr>
        </table>
      </td></tr>`
      : "";

  // --- montagem -------------------------------------------------------------
  return `
  <div style="background:#F4F4F5;padding:0;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};background:#F4F4F5;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;">
          <tr><td style="padding:36px 32px 40px 32px;">

            ${/* No portal a página já mostra título, data e resumo. */ ""}
            ${
              paraWeb
                ? ""
                : `<div style="text-align:center;padding:0 0 26px 0;">
              <div style="font-family:${fonte};font-size:11px;font-weight:700;letter-spacing:0.12em;color:#A1A1AA;margin:0 0 14px 0;">
                ${escapeHtml(dataLonga)}
              </div>
              ${/*
                O logo com o `alt` da marca. Cliente de e-mail que bloqueia
                imagem por padrão mostra o texto alternativo, então o
                cabeçalho continua legível mesmo sem carregar nada.
              */ ""}
              <img src="${MARCA.logoClaro}" alt="${MARCA.nome}" width="200"
                style="width:200px;max-width:60%;height:auto;display:block;margin:0 auto 20px auto;border:0;" />
              <h1 style="font-family:${fonte};font-size:30px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:${TINTA};margin:0 0 12px 0;">
                ${escapeHtml(edition.headline)}
              </h1>
              <p style="font-family:${fonte};font-size:16px;line-height:1.6;color:${TINTA_SUAVE};margin:0;">
                ${escapeHtml(edition.preheader)}
              </p>
            </div>`
            }

            ${
              paraWeb
                ? ""
                : `<p style="font-family:${fonte};font-size:16px;line-height:1.72;color:${TINTA_SUAVE};border-left:3px solid ${MARCA.cor};padding:0 0 0 16px;margin:0 0 34px 0;">
              ${escapeHtml(edition.intro)}
            </p>`
            }

            ${/*
              Índice. Fora do portal: numa página de rolagem contínua ele só
              repete os títulos que vêm logo abaixo, e foi metade da duplicação
              relatada pelo leitor.
            */ ""}
            ${
              paraWeb
                ? ""
                : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};margin:0 0 40px 0;">
              <tr><td style="border-top:1px solid ${LINHA};border-bottom:1px solid ${LINHA};padding:22px 0;">
                ${rotulo("Nesta edição", TINTA_SUAVE)}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">${tocHtml}</table>
              </td></tr>
            </table>`
            }

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">
              ${storiesHtml}
              ${quickBitsHtml}
            </table>

            ${/*
              Convite ao Instagram. Depois do conteúdo: quem chegou aqui leu a
              edição, e é a essa pessoa que vale pedir o seguir.
            */ ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};margin:0 0 32px 0;">
              <tr><td align="center" style="background:${MARCA.tintaEscura};border-radius:14px;padding:30px 26px;">
                <div style="font-family:${fonte};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#9DB4D8;margin:0 0 10px 0;">
                  Todo dia no Instagram
                </div>
                <div style="font-family:${fonte};font-size:21px;line-height:1.3;font-weight:800;color:#FFFFFF;margin:0 0 10px 0;">
                  A notícia do dia em uma imagem
                </div>
                <p style="font-family:${fonte};font-size:15px;line-height:1.6;color:#C8D6EC;margin:0 0 20px 0;">
                  Mudança de regra, prazo e decisão que afeta brasileiros nos EUA, no
                  formato que dá para ler no ônibus e mandar para quem precisa.
                </p>
                <a href="${MARCA.instagram}" target="_blank" style="display:inline-block;background:${MARCA.cor};color:#FFFFFF;font-family:${fonte};font-size:15px;font-weight:800;padding:14px 30px;border-radius:999px;text-decoration:none;">
                  Seguir ${MARCA.instagramHandle}
                </a>
              </td></tr>
            </table>

            ${
              paraWeb
                ? ""
                : `<p style="font-family:${fonte};font-size:16px;line-height:1.7;color:${TINTA};font-weight:700;margin:0 0 32px 0;">
              ${escapeHtml(edition.final_line)}
            </p>`
            }

            ${/*
              Rodapé de caixa de entrada: quem somos, redes e descadastro. No
              portal é ruído, e o link de descadastro chega a ser errado, porque a
              página é pública e o visitante não assina lista nenhuma.
            */ ""}
            ${
              paraWeb
                ? ""
                : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA}">
              <tr><td style="border-top:1px solid ${LINHA};padding:28px 0 0 0;">
                ${rotulo("Quem somos", "#A1A1AA")}
                <p style="font-family:${fonte};font-size:14px;line-height:1.65;color:${TINTA_SUAVE};margin:0 0 14px 0;">
                  A <strong style="color:${TINTA};">${MARCA.nome}</strong> é uma newsletter diária e gratuita
                  sobre imigração para os Estados Unidos: mudanças de regra, prazos, decisões
                  e o que elas significam para brasileiros, sempre com a fonte oficial ao lado.
                </p>
                <p style="font-family:${fonte};font-size:12px;line-height:1.6;color:#8A8A8F;margin:0 0 20px 0;">
                  Conteúdo informativo, não orientação jurídica. Regras de imigração mudam e cada
                  caso tem particularidades. Confirme na fonte citada ou com um advogado
                  licenciado antes de tomar qualquer decisão.
                </p>
                <p style="font-family:${fonte};font-size:13px;margin:0 0 16px 0;">
                  <a href="${MARCA.instagram}" target="_blank" style="color:${TINTA};font-weight:700;text-decoration:none;">${MARCA.instagramHandle} no Instagram</a>
                </p>
                <p style="font-family:${fonte};font-size:12px;line-height:1.6;color:#A1A1AA;margin:0;">
                  Atualize suas <a href="{{ UnsubscribeURL }}" style="color:#71717A;">preferências</a>
                  ou <a href="{{ UnsubscribeURL }}" style="color:#71717A;">cancele a assinatura</a>.<br />
                  © 2026 ${MARCA.nome}
                </p>
              </td></tr>
            </table>`
            }

          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

export async function runNewsroom(
  options: RunNewsroomOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
) {
  const dryRun = options.dryRun ?? (env.DRY_RUN === "true" || env.DRY_RUN === undefined ? true : false);
  const publishToPortal = options.publishToPortal ?? !dryRun;
  const createNewsletterCampaign = options.createNewsletterCampaign ?? !dryRun;
  const autoSend = options.autoSend ?? (env.NEWSLETTER_AUTO_SEND === "true" || (!dryRun && env.NEWSLETTER_AUTO_SEND !== "false"));

  const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);

  // A data vem do fuso do projeto. Com UTC, toda execução depois das 21h no
  // Brasil era gravada com a data do dia seguinte.
  const todayStr = projectToday(project);
  const idempotencyKey = options.idempotencyKey || `daily-edition-${todayStr}`;

  console.log(`[NEWSROOM] Iniciando run da redação de ${project.slug} (dry_run: ${dryRun}, auto_send: ${autoSend}, key: ${idempotencyKey})...`);

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: existingRun } = await supabase
        .from("newsroom_runs")
        .select("id, status, edition_id")
        .eq("project_id", project.id)
        .eq("idempotency_key", idempotencyKey)
        .single();

      if (existingRun && existingRun.status === "success") {
        console.log(`[NEWSROOM] Run já executado com sucesso hoje (${idempotencyKey}). Cancelando duplicação.`);
        return { ok: false, reason: "already_executed_today", idempotencyKey };
      }
    } catch {
      // continua em caso de primeiro registro
    }
  }

  const startTime = Date.now();

  // As fontes vêm do banco, por projeto. Antes eram um array fixo no código,
  // então um projeto de outro segmento exigiria editar o fonte e fazer deploy.
  const sources = await getProjectNewsSources(project.id);

  console.log(`[NEWSROOM] Coletando notícias de ${sources.length} fontes configuradas para ${project.slug}...`);
  const collectionResult = await collectAllNews(sources, fetcher);
  console.log(`[NEWSROOM] ${collectionResult.candidates.length} candidatas encontradas na janela de ${collectionResult.windowHours}h em ${collectionResult.sourcesAttempted} fontes.`);

  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(collectionResult.candidates);
  console.log(`[NEWSROOM] ${uniqueGroups.length} grupos únicos após deduplicação (${duplicatesCount} duplicatas removidas).`);

  /*
   * A seleção do dia.
   *
   * Com a guarda ligada, quem escolhe é a camada editorial: classificação de
   * país e leitura, filtro da linha editorial, verificação de repetição contra
   * os últimos 30 dias e nota que não depende de vocabulário de vertical.
   *
   * Sem ela, segue o ranker antigo, que soma ocorrência de "model", "gpt" e
   * "benchmark". Numa publicação de imigração isso empata todas as pautas no
   * piso e a seleção vira a ordem do feed. A chave existe para o período de
   * validação, não para ser um modo de operação permanente.
   */
  const configEditorial = carregarConfigEditorial(env);
  const guardaLigada = env.EDITORIAL_GUARD !== "off";

  let ranked: RankedCandidate[];
  let pautasDaGuarda: PautaAvaliada[] = [];

  if (guardaLigada) {
    const store = criarHistoricoStore(getSupabaseAdminClient());
    const historico = await store.janela(project.id, configEditorial.janelaDeDias);
    console.log(
      `[NEWSROOM] Guarda editorial ligada. ${historico.length} registros no histórico de ${configEditorial.janelaDeDias} dias.`,
    );

    const resultado = await avaliarPautas(uniqueGroups, {
      canal: "newsletter",
      historico,
      config: configEditorial,
      provedorDeVetor: criarProvedorOpenAI(env, fetcher),
      env,
      fetcher,
    });

    for (const linha of resultado.linhasDeLog) console.log(linha);

    if (!resultado.viavel) {
      // Sem pauta suficiente, a edição não sai. A alternativa seria completar
      // com o que o filtro recusou, e completar com o que o filtro recusou é
      // não ter filtro.
      throw new Error(
        `Edição não fecha hoje: ${resultado.motivoDaInviabilidade}. ` +
          `${resultado.recusadas.length} pautas recusadas pela linha editorial.`,
      );
    }

    pautasDaGuarda = resultado.selecionadas;
    ranked = pautasDaGuarda.map((p) => ({
      group: p.grupo,
      score: p.pontuacao.total,
      breakdown: {
        impact: p.pontuacao.partes.relevancia,
        novelty: p.pontuacao.partes.ineditismo,
        utility: 0,
        credibility: p.pontuacao.partes.credibilidade,
      },
      reasoning: `${p.pontuacao.explicacao} | ${p.classificacao.pais} | ${p.classificacao.eixo}`,
    }));
  } else {
    ranked = rankAndFilterCandidates(uniqueGroups);
    console.log(`[NEWSROOM] ${ranked.length} pautas classificadas pelo ranker antigo.`);

    if (ranked.length < 4) {
      throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
    }
  }

  console.log("[NEWSROOM] Executando pipeline editorial da OpenAI...");

  // A voz da edição vem do projeto, não de uma constante no código. Sem isto,
  // trocar a vertical no banco mudava as fontes e não mudava o texto: o
  // sistema coletava imigração e escrevia como se fosse notícia de IA.
  const pipelineResult = await runNewsroomPipeline(
    ranked,
    env,
    fetcher,
    {
      nome: project.brand.displayName || project.name,
      nicho: project.niche,
      extra: project.editorialPromptExtra,
      assinatura:
        String(project.settings?.final_line ?? "").trim() ||
        `Até amanhã. Equipe ${project.brand.displayName || project.name}.`,
    },
    { minimo: configEditorial.minimoDePautas, maximo: configEditorial.maximoDePautas },
  );

  /*
   * Uma foto por pauta, na ordem das pautas.
   *
   * Duas coisas estavam erradas aqui.
   *
   * A primeira: a imagem vinha do RSS, e feed de agregador traz a arte
   * genérica do publicador, e foi assim que uma matéria sobre custódia do ICE
   * saiu com uma estante de livros e outra sobre o USCIS com uma placa de
   * circuito. Agora a foto sai do banco de imagem, buscada pelo assunto da
   * pauta; a do feed vira reserva.
   *
   * A segunda, mais silenciosa: `.filter(Boolean)` removia os vazios e
   * **deslocava os índices**. Se a pauta 1 não tinha imagem e a 2 tinha, a
   * foto da 2 aparecia na 1, cada pauta seguinte ilustrada com a foto de
   * outra. O array agora é posicional e admite vazio.
   */
  const usarBanco = bancoConfigurado();
  const coverImages = await Promise.all(
    pipelineResult.edition.stories.map(async (story, i) => {
      const doFeed = pipelineResult.selectedCandidates[i]?.image_url ?? "";

      if (usarBanco) {
        try {
          const foto = await buscarFotoDeBanco(consultaDaNoticia(story.title, story.category));
          if (foto) return foto.imagemUrl;
        } catch {
          /* banco fora do ar não pode custar a edição */
        }
      }

      return doFeed;
    }),
  );
  const htmlContent = renderEditionToHtml(pipelineResult.edition, coverImages);
  // Versão sem o cromo de e-mail, para o corpo do artigo no portal.
  const htmlParaPortal = renderEditionToHtml(pipelineResult.edition, coverImages, true);
  const wordCount = htmlContent.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const executionTimeMs = Date.now() - startTime;

  console.log(`[NEWSROOM] Pipeline concluído com sucesso em ${executionTimeMs}ms! (QA score: ${pipelineResult.qaResult.score}/100, Palavras: ${wordCount})`);

  let createdArticleSlug: string | undefined;
  let createdCampaignId: number | undefined;
  let campaignStatus: string = "draft";
  let editionId: string | undefined;

  // A edição precisa ficar gravada antes de qualquer publicação: é dela que o
  // pipeline do Instagram tira as pautas dos posts do dia. A tabela
  // news_editions existia com 18 colunas e nenhum insert em todo o código, e o
  // serviço do Instagram, ao não encontrar a edição, caía num conteúdo de
  // demonstração escrito no próprio arquivo.
  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();

      const { count } = await supabase
        .from("news_editions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id);

      const { data: editionRow, error: editionErr } = await supabase
        .from("news_editions")
        .upsert(
          {
            project_id: project.id,
            edition_date: todayStr,
            edition_number: (count ?? 0) + 1,
            slug: `edicao-${todayStr}`,
            subject: pipelineResult.edition.subject,
            subject_options: pipelineResult.edition.subject_options,
            preheader: pipelineResult.edition.preheader,
            headline: pipelineResult.edition.headline,
            intro: pipelineResult.edition.intro,
            stories: pipelineResult.edition.stories,
            quick_bits: pipelineResult.edition.quick_bits ?? [],
            closing: pipelineResult.edition.closing,
            final_line: pipelineResult.edition.final_line,
            content_html: htmlContent,
            word_count: wordCount,
            qa_passed: pipelineResult.qaResult.passed,
            qa_score: pipelineResult.qaResult.score,
            qa_hallucination_risk: pipelineResult.qaResult.hallucination_risk,
            qa_issues: pipelineResult.qaResult.issues,
            status: "published",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,edition_date" },
        )
        .select("id")
        .single();

      if (editionErr) throw new Error(editionErr.message);
      editionId = editionRow?.id;
      console.log(`[NEWSROOM] Edição ${todayStr} gravada em news_editions (${editionId}).`);

      /*
       * Histórico editorial da edição.
       *
       * Sem esta gravação a verificação de repetição nunca aprende: ela
       * consulta uma tabela que ninguém alimenta, que foi exatamente o que
       * aconteceu com `news_candidates.dedupe_key`, coluna existente e vazia
       * desde sempre.
       *
       * Escreve depois da edição gravada, e só o que de fato entrou nela. E
       * não derruba o dia se falhar: a edição já está publicada, e o preço de
       * um registro perdido é uma pauta que pode se repetir, não uma edição
       * que não sai.
       */
      if (pautasDaGuarda.length > 0) {
        try {
          const store = criarHistoricoStore(supabase);
          const porUrl = new Map(pautasDaGuarda.map((p) => [p.grupo.primary.url, p]));

          // Percorre as pautas da edição, não as da guarda: a foto é indexada
          // pela ordem das pautas publicadas, e casar por posição em outra
          // lista foi o que já ilustrou uma pauta com a foto de outra.
          const registros = pipelineResult.edition.stories
            .map((story, i) => {
              const pauta = porUrl.get(story.source_url);
              if (!pauta) return null;
              return registroDaPauta(pauta, {
                projectId: project.id,
                canal: "newsletter",
                newsletterId: editionId,
                imagemUrl: coverImages[i] || null,
                publicadoEm: new Date().toISOString(),
              });
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          const gravados = await store.registrar(registros);
          console.log(
            `[NEWSROOM] Histórico editorial: ${gravados} de ${registros.length} pautas registradas.`,
          );
        } catch (histErr) {
          console.error(
            `[NEWSROOM] Histórico editorial não gravado: ${histErr instanceof Error ? histErr.message : String(histErr)}`,
          );
        }
      }
    } catch (edErr) {
      // Sem a edição gravada os posts do dia não têm de onde sair, então a
      // falha interrompe em vez de seguir para a publicação.
      throw new Error(
        `Falha ao gravar a edição do dia: ${edErr instanceof Error ? edErr.message : String(edErr)}`,
      );
    }
  }

  if (publishToPortal) {
    try {
      const supabase = getSupabaseAdminClient();
      const articleSlug = `edicao-${todayStr}`;
      const primaryCoverImage = coverImages[0] || fallbackImages[0];

      const { data: articleData, error: articleErr } = await supabase
        .from("articles")
        .upsert(
          {
            project_id: project.id,
            slug: articleSlug,
            title: pipelineResult.edition.headline,
            excerpt: pipelineResult.edition.preheader,
            description: pipelineResult.edition.intro,
            cover_image: primaryCoverImage,
            content_html: htmlParaPortal,
            content: pipelineResult.edition.stories,
            status: "published",
            category: "Edição Diária",
            author: MARCA.nome,
            reading_minutes: Math.ceil(wordCount / 200),
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,slug" }
        )
        .select("id, slug")
        .single();

      if (!articleErr && articleData) {
        createdArticleSlug = articleData.slug;
        console.log(`[NEWSROOM PORTAL] Edição publicada no portal com sucesso em /artigos/${createdArticleSlug}`);

        await supabase.from("article_revisions").insert({
          project_id: project.id,
          article_id: articleData.id,
          title: pipelineResult.edition.headline,
          body: pipelineResult.edition as any,
          created_by: "newsroom_bot",
        });
      }
    } catch (pubErr) {
      console.error("[NEWSROOM PORTAL ERROR] Falha ao publicar edição no portal:", pubErr);
    }
  }

  if (createNewsletterCampaign) {
    try {
      const listmonk = createListmonkClient(env, fetcher);
      const campaignName = `${MARCA.nome}, edição ${todayStr}`;
      // O portão olha `hallucination_risk`, não `passed`.
      //
      // `passed` é o veredito genérico que o checador autodeclara, e ele
      // reprova por tom, gramática ou qualquer implicância, custando a
      // newsletter inteira do dia. O dano que justifica não enviar é um só:
      // fato inventado chegando à lista. Isso não se desfaz com errata.
      //
      // Vírgula errada é recuperável e não vale um dia sem edição. Número de
      // benchmark que não estava na fonte, não.
      const retidoPorAlucinacao = pipelineResult.qaResult.hallucination_risk;
      const campaignResult = await listmonk.createCampaign({
        name: campaignName,
        subject: pipelineResult.edition.subject,
        body: htmlContent,
        autoSend: autoSend && !retidoPorAlucinacao,
      });

      if (campaignResult.ok && campaignResult.id) {
        createdCampaignId = campaignResult.id;
        campaignStatus = campaignResult.status || (autoSend && !retidoPorAlucinacao ? "running" : "draft");
        console.log(`[NEWSROOM LISTMONK] Campanha criada no Listmonk ID #${createdCampaignId} (status: ${campaignStatus})`);
      }

      if (retidoPorAlucinacao) {
        // Campanha retida sem aviso é indistinguível de campanha que não foi
        // criada. Quem precisa revisar tem que saber no mesmo minuto.
        await sendAlert(
          "warning",
          "Newsletter retida: risco de alucinação",
          `Edição ${todayStr} ficou em rascunho no Listmonk (campanha #${createdCampaignId ?? "?"}). ` +
            `QA ${pipelineResult.qaResult.score}/100. Apontamentos: ` +
            (pipelineResult.qaResult.issues.join(" · ") || "nenhum detalhado"),
        );
      }
    } catch (lmErr) {
      console.error("[NEWSROOM LISTMONK ERROR] Falha ao criar campanha no Listmonk:", lmErr);
    }
  }

  // Os posts do dia são agendados aqui, não gerados. A edição vira várias
  // vagas (uma pauta por post, espalhadas ao longo do dia) e o worker de
  // renderização processa cada uma no horário. A geração exige Chromium, que
  // não roda na hospedagem que serve o site.
  let scheduledPosts: ScheduledPostSlot[] = [];

  if (!dryRun) {
    try {
      scheduledPosts = await scheduleEditionPosts({
        project,
        editionId,
        editionDate: todayStr,
        articleSlug: createdArticleSlug || `edicao-${todayStr}`,
        stories: pipelineResult.edition.stories,
      });
    } catch (agErr) {
      // Falhar no agendamento não pode desfazer a newsletter que já saiu.
      console.error("[NEWSROOM INSTAGRAM] Falha ao agendar os posts do dia:", agErr);
    }
  }

  if (!dryRun) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from("newsroom_runs")
        .insert({
          project_id: project.id,
          started_at: new Date(startTime).toISOString(),
          finished_at: new Date().toISOString(),
          status: "success",
          sources_count: collectionResult.sourcesAttempted,
          candidates_found: collectionResult.candidates.length,
          candidates_filtered: collectionResult.candidates.length - uniqueGroups.length,
          duplicates_count: duplicatesCount,
          stories_selected: pipelineResult.selectedCandidates.length,
          tokens_input: pipelineResult.totalUsage.promptTokens,
          tokens_output: pipelineResult.totalUsage.completionTokens,
          cost_estimate_usd: pipelineResult.totalUsage.estimatedCostUsd,
          dry_run: false,
          edition_id: editionId,
          idempotency_key: idempotencyKey,
        });
    } catch (dbErr) {
      console.error("[NEWSROOM DB] Erro ao gravar histórico no Supabase:", dbErr);
    }
  }

  return {
    ok: true,
    projectId: project.id,
    projectSlug: project.slug,
    dryRun,
    publishedToPortal: Boolean(createdArticleSlug),
    articleSlug: createdArticleSlug,
    listmonkCampaignId: createdCampaignId,
    campaignStatus,
    idempotencyKey,
    editionId,
    scheduledPosts,
    executionTimeMs,
    sourcesAttempted: collectionResult.sourcesAttempted,
    candidatesFound: collectionResult.candidates.length,
    duplicatesCount,
    windowHours: collectionResult.windowHours,
    rankedCandidatesCount: ranked.length,
    selectedStoriesCount: pipelineResult.selectedCandidates.length,
    edition: pipelineResult.edition,
    qaResult: pipelineResult.qaResult,
    htmlContent,
    wordCount,
    tokens: pipelineResult.totalUsage,
  };
}
