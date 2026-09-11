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
import { linkDaNewsletter } from "@/lib/visamatch";
import {
  bancoConfigurado,
  buscarFotoDeBanco,
  consultaDaNoticia,
} from "../prompt-system/stock";
import { carregarConfigEditorial } from "../editorial/config";
import { criarProvedorOpenAI } from "../editorial/embeddings";
import { criarHistoricoStore, gerarStoryId } from "../editorial/history";
import type { RegistroHistorico } from "../editorial/history";
import { avaliarPautas, registroDaPauta } from "../editorial/guarda";
import { formatarNumerosDaEdicao } from "./numeros-editoriais";
import { rodarSocialDoDia, diagnosticoSocialAusente } from "../social/ciclo-do-dia";
import type { DiagnosticoSocialDoDia } from "../social/ciclo-do-dia";
import { descreverModo, modoDaGuarda } from "../editorial/modo";
import { paraRenderizacao, resolverImagens } from "../editorial/imagens";
import { descreverModoVisual, diagnosticoVazio, modoDoResolvedorVisual } from "../visual/modo";
import type { DiagnosticoVisual } from "../visual/modo";
import { resolveVisualAsset } from "../visual/resolver";
import { criarBiblioteca } from "../visual/biblioteca";
import type { ResultadoVisual } from "../visual/tipos";
import { extrairEntidades } from "../editorial/classificador";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { RankedCandidate } from "./ranker";
import { modoDoPipelineSocial } from "../social/modo";

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

/*
 * Aqui havia cinco fotos fixas do Unsplash, todas de tecnologia, usadas como
 * capa quando a edição não tinha imagem. Era o mesmo mecanismo das seis do
 * coletor, com outro nome: foto sem relação com a pauta, escolhida por
 * posição. A capa da edição agora é a foto da primeira pauta, e quando não
 * existe foto a coluna fica nula.
 */

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
/**
 * Foto de cada pauta, endereçada pela identidade da pauta.
 *
 * Era um array posicional, e a posição mentia. Um `.filter(Boolean)` no meio
 * do caminho deslocava os índices e cada pauta saía ilustrada com a foto da
 * seguinte. Chave é a identidade da pauta, e identidade não desliza.
 */
export type ImagensDaEdicao = Map<string, string>;

/**
 * Crédito por pauta, quando a licença exige.
 *
 * Mapa separado e opcional: sem ele o template desenha exatamente o que
 * desenhava antes. Licença que pede atribuição pede embaixo da foto, e isso
 * não é negociável por estética.
 */
export type LegendasDaEdicao = Map<string, string>;

/** A mesma identidade usada no histórico editorial, para as duas pontas casarem. */
export function identidadeDaPauta(story: { source_url?: string; title: string }): string {
  return gerarStoryId({ url: story.source_url || undefined, titulo: story.title });
}

export function renderEditionToHtml(
  edition: EditionContent,
  imagens: ImagensDaEdicao = new Map(),
  paraWeb = false,
  legendas: LegendasDaEdicao = new Map(),
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
    `<div style="font-family:${fonte};font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${cor};margin:0 0 10px 0;">${escapeHtml(texto)}</div>`;

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
        <td style="padding:0 0 12px 0;font-family:${fonte};font-size:16px;line-height:1.5;color:${TINTA};">
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
      const imagem = safeHttpUrl(imagens.get(identidadeDaPauta(s)) || "", "");
      const credito = legendas.get(identidadeDaPauta(s)) || "";
      const creditoHtml =
        imagem && credito
          ? `<p style="font-family:${fonte};font-size:12px;line-height:1.4;color:#8A8A8F;margin:-8px 0 14px 0;">${escapeHtml(credito)}</p>`
          : "";
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
        <h2 class="titulo-n" style="font-family:${fonte};font-size:22px;line-height:1.32;font-weight:800;letter-spacing:-0.015em;color:${TINTA};margin:0 0 12px 0;">
          ${escapeHtml(s.title)}
        </h2>
        ${
          imagem
            ? `<img src="${escapeHtml(imagem)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;border-radius:10px;margin:0 0 14px 0;" />${creditoHtml}`
            : ""
        }
        <p style="font-family:${fonte};font-size:16px;line-height:1.62;color:${TINTA_SUAVE};margin:0 0 12px 0;">
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

        <h2 class="titulo-1" style="font-family:${fonte};font-size:25px;line-height:1.26;font-weight:800;letter-spacing:-0.02em;color:${TINTA};margin:0 0 16px 0;">
          ${escapeHtml(s.title)}
        </h2>

        ${
          imagem
            ? `<img src="${escapeHtml(imagem)}" alt="" width="600" style="width:100%;max-width:600px;height:auto;display:block;border-radius:10px;margin:0 0 18px 0;" />${creditoHtml}`
            : ""
        }

        <p style="font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 14px 0;">
          ${escapeHtml(s.summary)}
        </p>

        ${/*
          Contexto e relevância no mesmo parágrafo, sem rótulo. O conteúdo do
          "Por que olhar de perto" continua na edição; o que sai é o rótulo
          repetido em toda pauta, que era o que dava cara de formulário.
        */ ""}
        ${
          s.context || s.why_it_matters
            ? `<p style="font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 18px 0;">${[
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
              <p style="font-family:${fonte};font-size:16px;line-height:1.6;color:${TINTA};margin:0;">
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
                (q) => `<p style="font-family:${fonte};font-size:16px;line-height:1.6;color:${TINTA_SUAVE};margin:0 0 10px 0;">
                  <strong style="color:${TINTA};">${escapeHtml(q.title)}</strong> ${escapeHtml(q.text ?? "")}
                </p>`,
              )
              .join("")}
          </td></tr>
        </table>
      </td></tr>`
      : "";

  /*
   * Mobile-first, e aqui isso é literal: os valores inline são os do celular.
   *
   * O que existia era um desktop estreitado. A soma horizontal era 12px do
   * container externo mais 32px do quadro, dos dois lados: 88px de padding num
   * aparelho de 390px, sobrando 302px para o texto. Quem lê no ônibus recebia
   * três quartos da tela.
   *
   * Agora o padrão é 20px de cada lado, sem padding externo lateral: 350px de
   * texto no mesmo aparelho. O `@media (min-width:600px)` devolve o respiro do
   * desktop, e é acréscimo, não requisito — cliente de e-mail que ignora o
   * bloco de estilo continua exibindo a versão do celular, que é a que quase
   * toda a audiência vê.
   *
   * `!important` porque estilo inline vence folha de estilo em CSS, e sem ele a
   * media query não teria efeito nenhum sobre os atributos `style`.
   */
  const estiloResponsivo = `
  <style>
    @media (min-width: 600px) {
      .quadro { padding: 36px 32px 40px 32px !important; }
      .hero { font-size: 34px !important; }
      .titulo-1 { font-size: 28px !important; }
      .titulo-n { font-size: 23px !important; }
    }
    @media (max-width: 359px) {
      .quadro { padding: 22px 16px 26px 16px !important; }
      .hero { font-size: 27px !important; }
      .titulo-1 { font-size: 23px !important; }
    }
  </style>`;

  // --- montagem -------------------------------------------------------------
  return `${paraWeb ? "" : estiloResponsivo}
  <div style="background:#F4F4F5;padding:0;margin:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};background:#F4F4F5;">
      <tr><td align="center" style="padding:16px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;">
          <tr><td class="quadro" style="padding:26px 20px 30px 20px;">

            ${/* No portal a página já mostra título, data e resumo. */ ""}
            ${
              paraWeb
                ? ""
                : `<div style="text-align:center;padding:0 0 26px 0;">
              <div style="font-family:${fonte};font-size:12px;font-weight:700;letter-spacing:0.1em;color:#A1A1AA;margin:0 0 14px 0;">
                ${escapeHtml(dataLonga)}
              </div>
              ${/*
                O logo com o `alt` da marca. Cliente de e-mail que bloqueia
                imagem por padrão mostra o texto alternativo, então o
                cabeçalho continua legível mesmo sem carregar nada.
              */ ""}
              <img src="${MARCA.logoClaro}" alt="${MARCA.nome}" width="200"
                style="width:200px;max-width:60%;height:auto;display:block;margin:0 auto 20px auto;border:0;" />
              <h1 class="hero" style="font-family:${fonte};font-size:30px;line-height:1.22;font-weight:800;letter-spacing:-0.03em;color:${TINTA};margin:0 0 12px 0;">
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
                : `<p style="font-family:${fonte};font-size:17px;line-height:1.6;color:${TINTA_SUAVE};border-left:3px solid ${MARCA.cor};padding:0 0 0 16px;margin:0 0 34px 0;">
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
              Análise de perfil. Vem antes do convite ao Instagram porque é a
              única coisa aqui que responde à pergunta que levou a pessoa a
              assinar: eu consigo? O link carrega a edição no utm_content, então
              dá para saber qual edição converte.
            */ ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SEM_BORDA};margin:0 0 24px 0;">
              <tr><td style="background:${MARCA.fundoRealce};border:1px solid ${MARCA.bordaRealce};border-radius:14px;padding:28px 26px;">
                ${rotulo("Análise de perfil", MARCA.cor)}
                <div style="font-family:${fonte};font-size:21px;line-height:1.3;font-weight:800;color:${MARCA.tintaEscura};margin:0 0 10px 0;">
                  Você pode morar nos Estados Unidos legalmente?
                </div>
                <p style="font-family:${fonte};font-size:15px;line-height:1.65;color:${TINTA_SUAVE};margin:0 0 20px 0;">
                  Responda algumas perguntas sobre formação, profissão e situação atual
                  e veja quais caminhos de visto existem para o seu caso. Leva poucos minutos.
                </p>
                <a href="${escapeHtml(linkDaNewsletter(todayStr))}" target="_blank" style="display:inline-block;background:${MARCA.tintaEscura};color:#FFFFFF;font-family:${fonte};font-size:15px;font-weight:800;padding:14px 30px;border-radius:999px;text-decoration:none;">
                  Fazer a análise de perfil
                </a>
              </td></tr>
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

/**
 * Grava o dia em que a redação rodou e decidiu não publicar.
 *
 * Existe porque a ausência de linha é ambígua: em agosto, `newsroom_runs`
 * vazio significou cron morto, e em setembro significou linha editorial
 * fazendo o trabalho dela. Os dois casos exigem reações opostas, e nenhum dos
 * dois deixava rastro.
 *
 * `cancelled` já está no CHECK da tabela desde a migration original, então
 * isto não pede alteração de schema. O erro da própria gravação é engolido, no
 * mesmo padrão do registro de sucesso: não conseguir anotar o dia não pode
 * virar uma segunda falha em cima da primeira.
 *
 * A chave leva o sufixo `#sem-edicao` porque `idempotency_key` é UNIQUE global.
 * Gravando com a chave canônica, o dia sem edição ocuparia o lugar do dia: uma
 * recuperação bem-sucedida mais tarde perderia o próprio registro de sucesso, e
 * o dia ficaria arquivado como cancelado tendo publicado. Registro que mente é
 * pior que registro ausente, que é o problema que este código veio resolver.
 *
 * Como efeito, a guarda de idempotência não vê este registro, e está certo:
 * dia cancelado por falta de pauta DEVE poder ser tentado de novo.
 */
/**
 * Anexa o desfecho do alerta ao run já gravado.
 *
 * Existe por causa de um beco sem saída da investigação de 06, 07 e 08 de
 * setembro de 2026: os alertas críticos não chegaram, e a única evidência do
 * motivo era um `console.error` dentro do contêiner, que o usuário `deploy` não
 * consegue ler (sem docker, sem sudo). Cinco hipóteses foram eliminadas por
 * medição e a sexta ficou sem prova, porque a prova estava num log inalcançável.
 *
 * Log serve para quem tem acesso ao log. O que sobrevive é o que está no banco.
 * A próxima vez que um alerta falhar, o motivo estará na linha do run.
 */
export async function anexarDesfechoDoAlerta(
  idempotencyKey: string,
  desfecho: { enviado: boolean; motivo: string; status: number | null; descricao: string | null },
  cliente?: ReturnType<typeof getSupabaseAdminClient>,
): Promise<void> {
  try {
    const supabase = cliente ?? getSupabaseAdminClient();
    const chave = `${idempotencyKey}#sem-edicao`;

    const { data } = await supabase
      .from("newsroom_runs")
      .select("error_message")
      .eq("idempotency_key", chave)
      .maybeSingle();

    const anterior = (data?.error_message as string | undefined) ?? "";
    const nota =
      `alerta=${desfecho.enviado ? "entregue" : "FALHOU"} motivo=${desfecho.motivo}` +
      (desfecho.status !== null ? ` status=${desfecho.status}` : "") +
      (desfecho.descricao ? ` descricao=${desfecho.descricao.slice(0, 200)}` : "");

    await supabase
      .from("newsroom_runs")
      .update({ error_message: anterior ? `${anterior} | ${nota}` : nota })
      .eq("idempotency_key", chave);
  } catch (err) {
    console.error("[NEWSROOM DB] Não consegui anexar o desfecho do alerta:", err);
  }
}

export async function registrarDiaSemEdicao(dados: {
  projectId: string;
  startTime: number;
  idempotencyKey: string;
  motivo: string;
  sourcesCount: number;
  candidatesFound: number;
  uniqueCount: number;
  duplicatesCount: number;
  storiesSelected: number;
  dryRun: boolean;
}, cliente?: ReturnType<typeof getSupabaseAdminClient>): Promise<void> {
  if (dados.dryRun) return;

  try {
    const supabase = cliente ?? getSupabaseAdminClient();
    await supabase.from("newsroom_runs").insert({
      project_id: dados.projectId,
      started_at: new Date(dados.startTime).toISOString(),
      finished_at: new Date().toISOString(),
      status: "cancelled",
      sources_count: dados.sourcesCount,
      candidates_found: dados.candidatesFound,
      candidates_filtered: dados.candidatesFound - dados.uniqueCount,
      duplicates_count: dados.duplicatesCount,
      stories_selected: dados.storiesSelected,
      dry_run: false,
      edition_id: null,
      error_message: dados.motivo,
      idempotency_key: `${dados.idempotencyKey}#sem-edicao`,
    });
  } catch (err) {
    console.error("[NEWSROOM DB] Não consegui registrar o dia sem edição:", err);
  }
}

/**
 * Falha técnica da redação também vira linha no banco.
 *
 * Em 10/09/2026 o cron disparou às 09:03:01 UTC, o endpoint respondeu 202, a
 * redação classificou 109 candidatas e aprovou 5, e depois disso não sobrou
 * nada: nem `news_editions`, nem `newsroom_runs`, nem artigo, nem post. A linha
 * do run é gravada UMA vez, no fim do caminho de sucesso, então qualquer
 * exceção entre a aprovação editorial e a edição apaga a própria evidência, e
 * o dia fica indistinguível de cron morto.
 *
 * É a lição de 06, 07 e 08 de setembro com outro rosto. Naquela vez o portão
 * que decidia não publicar sinalizava por `throw`, e a correção foi gravar
 * antes de sinalizar. A correção alcançou o mínimo de pautas e parou ali: o
 * bloqueio do QA em `enforce` continua saindo por exceção, e qualquer erro
 * técnico no mesmo trecho some do mesmo jeito.
 *
 * Esta função não muda decisão nenhuma e não engole erro nenhum: grava e
 * repassa. Ela só garante que, quando o dia quebrar, o motivo esteja onde dá
 * para ler sem docker e sem sudo.
 *
 * A chave leva a hora da falha porque `idempotency_key` é UNIQUE global. Sem
 * isso, a segunda falha do dia não gravaria, e a recuperação bem-sucedida mais
 * tarde disputaria a chave canônica do dia com o registro do erro.
 */
export async function registrarFalhaDaRedacao(
  erro: unknown,
  contexto: {
    startTime: number;
    options: RunNewsroomOptions;
    env: Record<string, string | undefined>;
  },
  cliente?: ReturnType<typeof getSupabaseAdminClient>,
): Promise<void> {
  try {
    const { options, env } = contexto;
    const dryRun =
      options.dryRun ?? (env.DRY_RUN === "true" || env.DRY_RUN === undefined ? true : false);
    if (dryRun) return;

    const project = await requireActiveProject(options.projectId ?? DEFAULT_PROJECT_ID);
    const todayStr = projectToday(project);
    const chaveDoDia = options.idempotencyKey || `daily-edition-${todayStr}`;
    const quando = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    const motivo =
      erro instanceof Error
        ? `RUN_FAILED: ${erro.message}${erro.stack ? ` | ${erro.stack.split("\n")[1]?.trim() ?? ""}` : ""}`
        : `RUN_FAILED: ${String(erro)}`;

    const supabase = cliente ?? getSupabaseAdminClient();
    await supabase.from("newsroom_runs").insert({
      project_id: project.id,
      started_at: new Date(contexto.startTime).toISOString(),
      finished_at: new Date().toISOString(),
      status: "failed",
      dry_run: false,
      edition_id: null,
      error_message: motivo.slice(0, 2000),
      idempotency_key: `${chaveDoDia}#falha-${quando}`,
    });

    console.error(`[NEWSROOM DB] Falha da redação registrada em newsroom_runs: ${motivo.slice(0, 300)}`);
  } catch (dbErr) {
    // Best effort de verdade: não registrar a falha não pode virar uma segunda
    // falha que esconda a primeira.
    console.error("[NEWSROOM DB] Não consegui registrar a falha da redação:", dbErr);
  }
}

export async function runNewsroom(
  options: RunNewsroomOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const startTime = Date.now();

  try {
    return await executarRedacaoDoDia(options, env, fetcher);
  } catch (erro) {
    await registrarFalhaDaRedacao(erro, { startTime, options, env });
    throw erro;
  }
}

async function executarRedacaoDoDia(
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
  const modo = modoDaGuarda(env);
  console.log(`[NEWSROOM] Guarda editorial ${descreverModo(modo)} (EDITORIAL_GUARD=${modo}).`);

  let ranked: RankedCandidate[];
  let pautasDaGuarda: PautaAvaliada[] = [];
  let diagnosticoDeCandidatas: {
    degraded: boolean;
    lidas: number;
    reaproveitadas: number;
    classificadasAgora: number;
    gravadas: number;
    erros: string[];
  } = { degraded: false, lidas: 0, reaproveitadas: 0, classificadasAgora: 0, gravadas: 0, erros: [] };
  // Guardado para a escolha de imagem, que precisa saber o que já foi usado.
  let historicoDaGuarda: RegistroHistorico[] = [];
  /*
   * O que o Instagram fez hoje, no resultado do newsroom.
   *
   * Ele começa como "não rodou" e só muda se rodar. Ficar ausente do resultado
   * seria indistinguível de ter rodado e não produzido nada, que é a diferença
   * que este campo existe para dizer.
   */
  let diagnosticoSocial: DiagnosticoSocialDoDia = diagnosticoSocialAusente(modoDoPipelineSocial(env));

  if (modo !== "off") {
    const store = criarHistoricoStore(getSupabaseAdminClient());
    const historico = await store.janela(project.id, configEditorial.janelaDeDias);
    historicoDaGuarda = historico;
    console.log(
      `[NEWSROOM] ${historico.length} registros no histórico de ${configEditorial.janelaDeDias} dias.`,
    );

    /*
     * A classificação do dia é gravada aqui, e é uma vez só.
     *
     * Sem isto, a newsletter classificava as candidatas, jogava fora, e o
     * canal social classificava as MESMAS candidatas de novo mais tarde. Duas
     * leituras do mesmo fato, com o custo dobrado e, pior, com respostas
     * diferentes: medido, a mesma candidata muda de decisão em 24% das vezes.
     *
     * O que muda para a newsletter: nada de composição. Ela continua com os
     * mesmos tetos, as mesmas 2 a 4 pautas e a mesma guarda. A única coisa
     * diferente é de onde vem a classificação, e o teste de antes e depois
     * prova que a escolha final é a mesma.
     *
     * O verificador de finalistas NÃO entra aqui. Ele é da fase 3 e ainda não
     * foi validado contra o comportamento da newsletter; ligar os dois de uma
     * vez misturaria "compartilhar classificação" com "mudar quem publica".
     */
    const resultado = await avaliarPautas(uniqueGroups, {
      canal: "newsletter",
      historico,
      config: configEditorial,
      provedorDeVetor: criarProvedorOpenAI(env, fetcher),
      env,
      fetcher,
      candidatos: { client: getSupabaseAdminClient(), projectId: project.id },
    });

    if (resultado.reuso.erros.length > 0) {
      console.warn(
        `[NEWSROOM] candidatePersistenceDegraded=true :: ${resultado.reuso.erros.join(" | ")}`,
      );
    }
    diagnosticoDeCandidatas = {
      degraded: resultado.reuso.erros.length > 0,
      lidas: resultado.reuso.candidatasLidas,
      reaproveitadas: resultado.reuso.classificacoesReaproveitadas,
      classificadasAgora: resultado.reuso.classificadasAgora,
      gravadas: resultado.reuso.persistidas,
      erros: resultado.reuso.erros,
    };

    console.log(
      `[NEWSROOM] candidatas: ${resultado.reuso.candidatasLidas} lidas, ` +
        `${resultado.reuso.classificacoesReaproveitadas} reaproveitadas, ` +
        `${resultado.reuso.classificadasAgora} classificadas agora, ` +
        `${resultado.reuso.persistidas} gravadas.`,
    );

    for (const linha of resultado.linhasDeLog) console.log(linha);

    /*
     * O Instagram entra AQUI, e o lugar é a regra de produto.
     *
     * Logo abaixo vem a composição da newsletter e o mínimo de duas pautas, e
     * um dia que não fecha edição sai por um `return` que não executa mais
     * nada. Se o social morasse depois disso, um dia com três pautas aprovadas
     * em que a newsletter leva uma e cancela levaria o feed junto — e esse é
     * exatamente o dia mais comum na capacidade medida.
     *
     * São dois consumidores do mesmo trabalho editorial, não um dentro do
     * outro. O social recebe o `approvedEditorialPool`, que é a camada
     * compartilhada, e daqui para baixo não toca em nada da newsletter.
     *
     * O `try` não é decoração: falha técnica do social não pode derrubar a
     * edição. O motivo vira diagnóstico e alerta, e o e-mail segue.
     */
    try {
      const social = await rodarSocialDoDia(resultado.approvedEditorialPool, {
        projectId: project.id,
        projectSlug: project.slug,
        editionDate: todayStr,
        marca: {
          nome: project.brand.displayName || project.name,
          nicho: project.niche,
          extra: project.editorialPromptExtra ?? "",
          keyword: String(project.settings?.instagram_keyword ?? "").trim(),
        },
        historico,
        config: configEditorial,
        client: getSupabaseAdminClient(),
        persistenciaDegradada: resultado.reuso.erros.length > 0,
        env,
        fetcher,
      });

      diagnosticoSocial = social.diagnostico;
      for (const l of social.ciclo?.linhasDeLog ?? []) console.log(l);

      if (social.diagnostico.mode !== "off") {
        console.log(
          `[NEWSROOM] socialV2 ${social.diagnostico.mode}: ` +
            `${social.diagnostico.candidates} candidatas, ${social.diagnostico.verified} verificadas, ` +
            `${social.diagnostico.selected} post(s), ${social.diagnostico.scheduled} agendado(s), ` +
            `${social.diagnostico.skipped} descartada(s).`,
        );
      }
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      diagnosticoSocial = { ...diagnosticoSocialAusente(modoDoPipelineSocial(env)), errors: [motivo] };
      console.error(`[NEWSROOM] socialV2 falhou, e a newsletter segue: ${motivo}`);
      await sendAlert(
        "warning",
        "Social V2 falhou no ciclo do newsroom",
        `A edição de ${todayStr} segue pelo caminho normal.\n${motivo}`,
      );
    }

    const daGuarda: RankedCandidate[] = resultado.selecionadas.map((p) => ({
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

    if (modo === "dry_run") {
      // Observação: a guarda rodou inteira e o log acima diz o que ela faria.
      // A edição continua saindo pelo caminho antigo, então nada do que ela
      // decidiu chega ao leitor. O histórico também não é gravado aqui: quem
      // publicou foi o fluxo antigo, e o backfill recupera essas edições
      // quando a guarda assumir.
      console.log(
        `[NEWSROOM] Em observação, a guarda escolheria ${resultado.selecionadas.length} pauta(s) ` +
          `e recusaria ${resultado.recusadas.length}. A edição de hoje segue pelo fluxo antigo.`,
      );
      if (!resultado.viavel) {
        console.log(`[NEWSROOM] Em enforce, a edição de hoje não sairia: ${resultado.motivoDaInviabilidade}.`);
      }

      ranked = rankAndFilterCandidates(uniqueGroups);
      if (ranked.length < 4) {
        throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
      }
    } else {
      if (!resultado.viavel) {
        /*
         * Sem pauta suficiente, a edição não sai. A alternativa seria completar
         * com o que o filtro recusou, e completar com o que o filtro recusou é
         * não ter filtro. Isso não muda.
         *
         * O que muda é COMO isso é dito. Antes era `throw`, e um throw aqui
         * acontece antes de qualquer escrita: `news_editions` na linha 916 e
         * `newsroom_runs` na 1158 nunca eram alcançados. O resultado é que três
         * dias de decisão editorial CORRETA (06, 07 e 08 de setembro de 2026)
         * não deixaram uma linha em lugar nenhum, e ficaram indistinguíveis de
         * um cron morto, que é exatamente o incidente de agosto. Ainda por
         * cima, o `.catch` da rota classificava a decisão como
         * "Redação falhou", em nível crítico.
         *
         * Dia sem pauta é resultado, não exceção. Ele é gravado com status
         * `cancelled`, que já existe no CHECK da tabela, e devolvido como
         * `ok: false` com motivo próprio, para o alerta sair como aviso e o
         * watchdog continuar sabendo que a chamada chegou à aplicação.
         */
        const detalhe =
          `${resultado.motivoDaInviabilidade}. ` +
          `${resultado.recusadas.length} pautas recusadas pela linha editorial.`;

        console.log(`[NEWSROOM] Edição não fecha hoje: ${detalhe}`);

        await registrarDiaSemEdicao({
          projectId: project.id,
          startTime,
          idempotencyKey,
          motivo: `EDITORIAL_MINIMUM_NOT_MET: ${detalhe}`,
          sourcesCount: collectionResult.sourcesAttempted,
          candidatesFound: collectionResult.candidates.length,
          uniqueCount: uniqueGroups.length,
          duplicatesCount,
          storiesSelected: resultado.selecionadas.length,
          dryRun,
        });

        return {
          ok: false as const,
          reason: "editorial_minimum_not_met" as const,
          detail: detalhe,
          approvedCount: resultado.selecionadas.length,
          rejectedCount: resultado.recusadas.length,
          minimumRequired: configEditorial.minimoDePautas,
          /*
           * O social sai NESTE retorno também, e é o caso que mais importa.
           *
           * Este é o dia em que a newsletter não fecha. Se o diagnóstico do
           * Instagram só aparecesse no caminho de sucesso, o dia em que ele
           * mais tem valor seria o dia em que ninguém saberia se ele rodou.
           */
          socialV2: diagnosticoSocial,
          idempotencyKey,
        };
      }

      pautasDaGuarda = resultado.selecionadas;
      ranked = daGuarda;
    }
  } else {
    ranked = rankAndFilterCandidates(uniqueGroups);
    console.log(`[NEWSROOM] ${ranked.length} pautas classificadas pelo ranker antigo.`);

    if (ranked.length < 4) {
      throw new Error(`Número insuficiente de notícias qualificadas coletadas (${ranked.length}, mínimo 4).`);
    }
  }

  /*
   * Pacote factual das pautas escolhidas.
   *
   * Só existe quando a guarda selecionou: é ela que traz o texto da matéria
   * enriquecido, e sem esse texto o extrator leria a manchete de novo.
   */
  const pacotes = new Map<string, PacoteFactual>();
  if (pautasDaGuarda.length > 0) {
    const r = await montarPacotesDasPautas(
      pautasDaGuarda.map((p) => ({
        url: p.grupo.primary.url,
        titulo: p.grupo.primary.title,
        texto: p.enriquecimento.texto,
        urls: [p.grupo.primary.url, ...p.grupo.secondary_urls],
      })),
      env,
      fetcher,
    );

    for (const [url, pacote] of r.pacotes) pacotes.set(url, pacote);
    console.log(`[NEWSROOM] Pacote factual montado para ${r.pacotes.size} de ${pautasDaGuarda.length} pautas.`);
    for (const falha of r.falhas) console.warn(`[NEWSROOM] Pacote factual falhou: ${falha}`);
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
    // Quando quem selecionou foi o fluxo antigo, os limites antigos valem:
    // ele não passou por filtro editorial e continua entregando de 4 a 6.
    pautasDaGuarda.length > 0
      ? { minimo: configEditorial.minimoDePautas, maximo: configEditorial.maximoDePautas }
      : { minimo: 4, maximo: 6 },
    pacotes,
    configEditorial.maximoDeReparos,
    configEditorial.notaMinimaDeQA,
  );

  /*
   * Números viram apresentação humana AQUI, e não antes.
   *
   * Depois da geração e de todo o reparo: a conferência de ancoragem compara o
   * texto contra o pacote factual, e ela precisa ver o número como a fonte o
   * escreveu. Arredondar antes faria "R$ 5,0857" virar "R$ 5,09" e a
   * conferência acusar um valor que não está no pacote — a correção derrubaria
   * a edição.
   *
   * Depois daqui o número é só apresentação. O pacote factual e o que fica
   * gravado em `news_editions` continuam com o valor da fonte: se alguém
   * contestar amanhã, o que se confere é o dado, não o texto do e-mail.
   */
  pipelineResult.edition = formatarNumerosDaEdicao(pipelineResult.edition);

  /*
   * Afirmação sem sustentação é bloqueio, não apontamento.
   *
   * A conferência é determinística e roda depois do auditor: ela compara nome
   * próprio, número e data do texto contra o pacote. Em enforce, uma única
   * afirmação sem lastro impede a edição de sair, mesmo com nota alta. Errar
   * um requisito de imigração custa o status migratório de alguém, e nota 90
   * não conserta um número inventado.
   */
  if (pipelineResult.tentativasDeReparo > 0) {
    console.log(
      `[NEWSROOM] Ciclo de correção: ${pipelineResult.tentativasDeReparo} tentativa(s).`,
    );
    for (const r of pipelineResult.rodadasDeReparo) {
      console.log(
        `[NEWSROOM] tentativa ${r.tentativa}: recebeu ${r.problemasRecebidos.length}, ` +
          `restaram ${r.problemasRestantes.length}`,
      );
    }
  }

  /*
   * O veredito final da guarda.
   *
   * Três conferências, e as três precisam passar: ancoragem dura (nome, número
   * e data), claims semânticas (consequência, impacto, causa, comparação,
   * tendência, previsão) e o auditor. Uma edição pode ter nota alta e ainda
   * afirmar que uma medida encarece compras quando o material não diz o que a
   * medida faz. Nota não conserta isso.
   */
  const semLastro = pipelineResult.ancoragem.filter((a) => !a.ancorado);
  const claimsSoltas = pipelineResult.claimsSemanticas.naoSustentadas;

  if (semLastro.length > 0) {
    const detalhe = semLastro
      .map((a) => `"${a.titulo}": ${a.naoSustentadas.map((c) => `${c.tipo} ${c.valor}`).join(", ")}`)
      .join(" | ");
    console.error(`[NEWSROOM] Afirmações sem lastro no pacote factual: ${detalhe}`);
  }

  if (claimsSoltas.length > 0) {
    console.error(
      `[NEWSROOM] Conclusões sem sustentação: ` +
        claimsSoltas.map((c) => `${c.tipo}: "${c.trecho}"`).join(" | "),
    );
  }

  if (pipelineResult.claimsSemanticas.erro) {
    console.error(
      `[NEWSROOM] Auditoria de conclusões não rodou: ${pipelineResult.claimsSemanticas.erro}. ` +
        "Isso NÃO é aprovação.",
    );
  }

  if (pipelineResult.problemasRestantes.length > 0) {
    // Imprecisão que sobrou depois do reparo. Não bloqueia, mas fica no log:
    // é o que aparece na errata de amanhã se ninguém olhar.
    for (const p of pipelineResult.problemasRestantes) {
      console.warn(`[NEWSROOM] apontamento não resolvido: ${p.descricao}`);
    }
  }

  if (!pipelineResult.aprovado && modo === "enforce") {
    throw new Error(
      `Edição bloqueada depois de ${pipelineResult.tentativasDeReparo} tentativa(s) de correção ` +
        `(QA ${pipelineResult.qaResult.score}): ${pipelineResult.bloqueios.join(" | ")}`,
    );
  }

  /*
   * Uma foto por pauta, endereçada pela identidade da pauta.
   *
   * Dois caminhos, e nunca os dois decidindo ao mesmo tempo. O da fase 1
   * escolhe por assunto no banco de imagem. O V2 escolhe pela entidade da
   * pauta, com licença verificada. Quem manda é `VISUAL_RESOLVER_V2`, e em
   * `enforce` a decisão final vem só de `resolveVisualAsset`.
   */
  const modoVisual = modoDoResolvedorVisual(env);
  console.log(`[NEWSROOM] Resolvedor de imagem ${descreverModoVisual(modoVisual)} (VISUAL_RESOLVER_V2=${modoVisual}).`);

  const diagnosticoVisual: DiagnosticoVisual = diagnosticoVazio();
  const resultadosVisuais: ResultadoVisual[] = [];
  const imagensV2: ImagensDaEdicao = new Map();
  const legendasV2: LegendasDaEdicao = new Map();

  if (modoVisual !== "off") {
    /*
     * A entidade vem da classificação que a guarda já fez.
     *
     * Quando a guarda não rodou (ela pode estar em dry_run ou off), a
     * classificação não existe, e aí as entidades são extraídas das próprias
     * matérias, numa chamada só. É o mesmo extrator da fase 1.
     */
    const classificacaoPorUrl = new Map(
      pautasDaGuarda.map((p) => [p.grupo.primary.url, p.classificacao]),
    );

    const semClassificacao = pipelineResult.edition.stories
      .map((story, i) => ({ story, i }))
      .filter(({ story }) => !classificacaoPorUrl.has(story.source_url));

    let extraidas = new Map<string, { atores: string[]; lugares: string[]; acontecimento: string[] }>();
    if (semClassificacao.length > 0) {
      const r = await extrairEntidades(
        semClassificacao.map(({ story, i }) => ({
          id: String(i),
          titulo: story.title,
          resumo: `${story.summary} ${story.context ?? ""}`.slice(0, 800),
          fonte: story.source_name,
        })),
        env,
        fetcher,
      );
      extraidas = r.entidades;
      if (r.falhas.length > 0) {
        console.warn(`[NEWSROOM] Entidades não extraídas: ${r.falhas.join(" | ")}`);
      }
    }

    const biblioteca = criarBiblioteca(getSupabaseAdminClient());
    const usadosNestaEdicao = new Set<string>();

    for (const [i, story] of pipelineResult.edition.stories.entries()) {
      const daGuarda = classificacaoPorUrl.get(story.source_url);
      const classificacao = daGuarda
        ? {
            atores: daGuarda.atores,
            lugares: daGuarda.lugares,
            acontecimento: daGuarda.acontecimento,
            pais: daGuarda.pais,
          }
        : (extraidas.get(String(i)) ?? { atores: [], lugares: [], acontecimento: [] });

      const resultado = await resolveVisualAsset(
        {
          storyId: identidadeDaPauta(story),
          titulo: story.title,
          resumo: story.summary,
          categoria: story.category,
          classificacao,
        },
        {
          client: getSupabaseAdminClient(),
          biblioteca,
          env,
          fetcher,
          jaUsadosNestaEdicao: usadosNestaEdicao,
          // Grava só quando o V2 manda de verdade e a execução publica.
          somenteLeitura: modoVisual !== "enforce" || dryRun,
        },
      );

      resultadosVisuais.push(resultado);
      diagnosticoVisual.storiesProcessed += 1;

      if (resultado.status === "SELECTED" && resultado.asset) {
        diagnosticoVisual.assetsSelected += 1;
        const fonte = resultado.asset.source;
        diagnosticoVisual.sourcesUsed[fonte] = (diagnosticoVisual.sourcesUsed[fonte] ?? 0) + 1;
        imagensV2.set(identidadeDaPauta(story), resultado.asset.imageUrl);
        if (resultado.asset.attribution) legendasV2.set(identidadeDaPauta(story), resultado.asset.attribution);
      } else {
        diagnosticoVisual.noValidImage += 1;
        if (resultado.motivo === "AMBIGUOUS_ENTITY") diagnosticoVisual.ambiguousEntity += 1;
      }

      console.log(
        `[NEWSROOM] imagem V2 ${resultado.status} :: ${story.title.slice(0, 55)} :: ` +
          `entidade ${resultado.entidade?.nome ?? "nenhuma"} (${resultado.entidade?.tipo ?? "n/d"})` +
          (resultado.asset
            ? ` :: ${resultado.asset.source}, ${resultado.asset.license}, contexto ${resultado.asset.imageContextType}`
            : ` :: ${resultado.motivo}`),
      );
    }
  }

  /*
   * O caminho da fase 1 só roda quando o V2 não está no comando.
   *
   * Em `enforce`, a decisão final vem de uma interface só. Encadear os dois
   * resolvedores mais um fallback é como a foto errada aparecia antes: cada
   * camada tapando o buraco da anterior com o que tivesse à mão.
   */
  let imagensDaEdicao: ImagensDaEdicao;
  let legendasDaEdicao: LegendasDaEdicao = new Map();

  if (modoVisual === "enforce") {
    imagensDaEdicao = imagensV2;
    legendasDaEdicao = legendasV2;
  } else {
    const escolhasDeImagem = await resolverImagens(
      pipelineResult.edition.stories.map((story, i) => ({
        titulo: story.title,
        categoria: story.category,
        sourceUrl: story.source_url,
        imagemDoFeed: pipelineResult.selectedCandidates[i]?.image_url ?? "",
      })),
      { historico: historicoDaGuarda, janelaEmDias: configEditorial.janelaDeImagemEmDias, env },
    );

    for (const escolha of escolhasDeImagem.values()) {
      console.log(
        `[NEWSROOM] imagem ${escolha.imageSource} :: ${escolha.titulo.slice(0, 60)} :: ${escolha.motivo}` +
          (escolha.descartadaPorRepeticao ? ` :: descartada: ${escolha.descartadaPorRepeticao}` : ""),
      );
    }

    imagensDaEdicao = paraRenderizacao(escolhasDeImagem);
  }

  const htmlContent = renderEditionToHtml(pipelineResult.edition, imagensDaEdicao, false, legendasDaEdicao);
  // Versão sem o cromo de e-mail, para o corpo do artigo no portal.
  const htmlParaPortal = renderEditionToHtml(pipelineResult.edition, imagensDaEdicao, true, legendasDaEdicao);
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
          const visualPorStory = new Map(resultadosVisuais.map((r) => [r.storyId, r]));

          const registros = pipelineResult.edition.stories
            .map((story) => {
              const pauta = porUrl.get(story.source_url);
              if (!pauta) return null;

              const identidade = identidadeDaPauta(story);
              const visual = visualPorStory.get(identidade);
              const asset = modoVisual === "enforce" ? (visual?.asset ?? null) : null;

              const registro = registroDaPauta(pauta, {
                projectId: project.id,
                canal: "newsletter",
                newsletterId: editionId,
                imagemUrl: imagensDaEdicao.get(identidade) || null,
                publicadoEm: new Date().toISOString(),
              });

              /*
               * Com o V2 no comando, a publicação guarda de onde a foto veio e
               * sob que licença. Antes só a URL era gravada, e uma URL sozinha
               * não responde se a imagem podia ser publicada.
               */
              if (asset) {
                registro.visualAssetId = asset.id ?? null;
                registro.imagemFonte = asset.source;
                registro.imagemLicenca = asset.license;
                registro.imagemAutor = asset.author;
                registro.imagemCredito = asset.attribution;
                registro.imagemAssetId = asset.sourceAssetId;
                registro.imagemUrlCanonica = asset.imageUrl;
              }

              return registro;
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
      /*
       * Capa do artigo: a foto da primeira pauta desta edição, ou nada.
       *
       * O upsert casa por (project_id, slug), e o slug é a data. Quando a
       * coluna não recebia valor confiável, a linha existente ficava com a
       * capa da execução anterior, e a edição de hoje aparecia no portal com
       * a foto de ontem. Escrever `null` explicitamente é o que impede essa
       * herança: ausência de foto passa a ser um valor, não a omissão que
       * deixa o valor velho no lugar.
       */
      const primaryCoverImage =
        imagensDaEdicao.get(identidadeDaPauta(pipelineResult.edition.stories[0])) || null;

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

  /*
   * O agendador LEGADO, e por que ele agora tem um portão.
   *
   * Ele agenda uma vaga por pauta da NEWSLETTER e o worker gera o roteiro na
   * hora de publicar. Isso funcionava quando era o único caminho. Com o Social
   * V2 em `enforce`, os dois passam a criar linhas `scheduled` para o MESMO dia
   * a partir do MESMO trabalho editorial, e o mesmo worker publica as duas.
   *
   * Foi o que aconteceu em 09/09: o V2 publicou "Regra permite residência para
   * crianças nascidas nos EUA" às 11:00 e o legado publicou "Registro de
   * residência para crianças nascidas nos EUA" às 12:30. Mesmo assunto, duas
   * vezes, no mesmo perfil, no mesmo dia.
   *
   * O portão é a flag que JÁ existe, e é de propósito: `INSTAGRAM_AUTO_POST`
   * governa a PUBLICAÇÃO dos dois ramos, lá no serviço que publica, então
   * desligá-la mataria o V2 junto. `SOCIAL_PIPELINE_V2` governa a GERAÇÃO do
   * V2, e é exatamente a pergunta certa: se o V2 está publicando o dia, o
   * legado não tem o que agendar.
   *
   * Nada do legado é apagado: o código fica, o ramo do worker fica, e as linhas
   * históricas ficam. O que para é a criação automática de vaga nova.
   */
  const modoSocialV2 = modoDoPipelineSocial(env);
  const legadoCede = modoSocialV2 === "enforce";

  let scheduledPosts: ScheduledPostSlot[] = [];

  if (legadoCede) {
    console.log(
      "[NEWSROOM INSTAGRAM] agendador legado NÃO rodou: SOCIAL_PIPELINE_V2=enforce, " +
        "e o feed do dia é do Social V2. Nenhuma vaga legada foi criada.",
    );
  }

  if (!dryRun && !legadoCede) {
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
    /*
     * O modo que o processo REALMENTE leu, normalizado.
     *
     * Sem isto, distinguir "variável não configurada" de "escrita errada" de
     * "contêiner subiu com o ambiente antigo" exigia inferir pelo formato da
     * edição, e a inferência falha justamente quando mais importa. Vai o modo
     * normalizado, nunca o valor bruto da variável.
     */
    editorialGuardMode: modo,
    /**
     * A camada de candidatas funcionou nesta execução?
     *
     * Falha aqui não derruba a edição, e por isso ela precisa aparecer: uma
     * degradação silenciosa faria o canal social reclassificar tudo amanhã
     * sem ninguém perceber que o cache parou de existir.
     */
    candidatePersistence: diagnosticoDeCandidatas,
    /** Modo efetivo do resolvedor de imagem, normalizado, lido pelo processo. */
    visualResolverMode: modoVisual,
    visualResolution: diagnosticoVisual,
    /**
     * O que o Instagram fez hoje.
     *
     * `executed: false` com `mode: "off"` é o estado normal enquanto a flag
     * não for ligada. `executed: false` com `mode: "dry_run"` significa que a
     * flag está ligada e o ciclo NÃO foi alcançado — que é a diferença que este
     * campo existe para tornar visível.
     */
    socialV2: diagnosticoSocial,
    minEditorialQaScore: configEditorial.notaMinimaDeQA,
    maxEditorialRepairAttempts: configEditorial.maximoDeReparos,
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
