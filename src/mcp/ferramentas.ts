import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * As ferramentas do MCP do eua.journal, independentes do caminho (27/10/2026).
 *
 * O mesmo conjunto chega ao Claude por dois caminhos:
 *
 * - online, em `/api/mcp` (Streamable HTTP), que é o caminho do produto: o
 *   Claude do usuário, no Mac ou no Windows, só precisa da URL e do token;
 * - local, por stdio (`servidor.ts`), para desenvolvimento.
 *
 * Quem muda entre os dois é o `Backend`: online ele chama a camada de serviço
 * direto; local ele chama as rotas por HTTP. A descrição das ferramentas, as
 * instruções e o formato das respostas são um só.
 *
 * O que nenhum dos dois faz, por decisão do dono: aprovar, reprovar ou cancelar
 * peça. Isso é só do painel. O Claude produz e corrige; quem decide é uma pessoa.
 */

export const NOMES_DAS_FERRAMENTAS = [
  "estado_do_dia",
  "ver_fila",
  "pautas_disponiveis",
  "iniciar_post",
  "proxima_tarefa",
  "entregar_tarefa",
  "montar_post",
  "agendar_post",
  "reels_sugeridos",
  "produzir_reel",
  "ver_reel",
  "fazer_o_dia",
  "aguardar",
  "complementar_o_dia",
  "pauta_do_link",
  "buscar_imagens",
  "ver_imagem",
  "imagens_da_pagina",
  "trocar_imagem",
] as const;

export type NomeDaFerramenta = (typeof NOMES_DAS_FERRAMENTAS)[number];

/** Chama a plataforma e devolve o corpo da resposta. Recusa LANÇA, com a mensagem que o Claude deve ler. */
export type Backend = (nome: NomeDaFerramenta, args: Record<string, unknown>) => Promise<unknown>;

export class RecusaDaPlataforma extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

const DATA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Data da edição, AAAA-MM-DD, no fuso do projeto. Sem data, hoje.");

const PAUTA = z.string().min(1).describe("O story_id da pauta, como `pautas_disponiveis` devolve.");
const FORMATO = z
  .enum(["reel", "estatico", "carrossel"])
  .optional()
  .describe("reel: Reel de foto de 10 s (o padrão); carrossel: notícia em slides com foto; estatico: peça de imagem única. Sem informar, vale o do plano do dia.");
const FOCO = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .optional()
  .describe("Só no Reel: onde está o rosto ou o assunto na foto (0 a 1). O vídeo corta a foto em 9:16 em volta deste ponto.");

export const INSTRUCOES_DO_MCP = [
  "PARA FAZER O DIA INTEIRO SOZINHO: chame fazer_o_dia. Ele devolve UM passo: uma tarefa (faça e entregue com entregar_tarefa; a resposta já traz o passo seguinte em `proximo`), \"aguardar\" (chame aguardar e repita até mudar; é o dono aprovando o plano no painel) ou \"pronto\". Siga até \"pronto\" sem esperar nova ordem. Se a conversa encher, abra outra e chame fazer_o_dia: o dia continua de onde parou.",
  "Você faz o trabalho de modelo do eua.journal: escreve, audita e corrige os posts, e a plataforma confere com as mesmas guardas da esteira automática.",
  "Quando o dono pedir o dia, as pautas, o que produzir hoje ou \"faça o dia\", use SEMPRE fazer_o_dia: a triagem lê as notícias das últimas 24 horas. Não use pautas_disponiveis para isso.",
  "O DIA NÃO FECHA: depois do plano aprovado, e mesmo com o dia pronto, dá para pôr mais pautas. O alvo é 5 peças no Instagram por dia; quando o dono reprova ou cancela e o dia fica abaixo disso, chame fazer_o_dia de novo (ele abre o complemento sozinho) ou complementar_o_dia (com quantas e o pedido do dono). Vale para qualquer data, inclusive sábado e domingo: passe a data do dia pedido, nunca troque por outro dia.",
  "FORA DO PLANO, com autonomia: quando o dono mandar o link de uma notícia, ou pedir que você ache uma (use a sua busca na web), chame pauta_do_link com o link, o título e o resumo que você leu na página. Ela vira post, matéria do blog e, se couber, newsletter do dia, e o retorno traz o primeiro passo: siga até \"pronto\". Vídeo: produzir_reel com url (YouTube, Instagram, X). Arquivo de vídeo arrastado no chat não chega à plataforma: peça o link.",
  "Todo post do MCP vira também matéria do blog e entra na newsletter do dia, até 4 pautas na newsletter; o que passar disso fica só no post e na matéria.",
  "Caminho avulso antigo, só se o dono pedir um post de uma pauta específica de pautas_disponiveis: iniciar_post, proxima_tarefa e entregar_tarefa até ficar pronto, montar_post, agendar_post.",
  "Cada tarefa traz a instrução (system e user), o material e o esquema JSON da resposta. Siga a instrução ao pé da letra e entregue SÓ o JSON do esquema.",
  "Quando a entrega volta com motivos, a tarefa está em reparo: peça a próxima tarefa e corrija só o apontado. Não invente para tapar buraco.",
  "Na auditoria, julgue só pelo pacote factual que vem na tarefa, como se não tivesse escrito o texto; se puder, audite numa conversa separada.",
  "POSTS EM REEL: o post do Instagram sai, por padrão, como Reel de foto de 10 segundos (a foto vertical com zoom lento, o chapéu e a manchete com o destaque em vermelho, trilha). No plano do dia, dê o formato de cada post em `formatos` (pelo menos metade em \"reel\", e um \"carrossel\" por dia na pauta com mais material). No carrossel, a tarefa da foto pede também as fotos dos slides em `extras`, todas diferentes da capa. Ao escolher a foto, prefira a que aguenta recorte vertical e diga em `foco` onde está o rosto. A manchete curta (até umas 12 palavras) com um `destaque` forte rende o melhor Reel.",
  "PAUTAS QUENTES: prefira o que está todo mundo contando (as marcadas QUENTE no plano) e NARRATIVAS que andam (personagem conhecido, conflito, virada, número que surpreende). Pode usar a sua busca na web do chat para conferir o que está quente agora. Comunicado frio e serviço só completam o dia.",
  "Reels de vídeo de terceiros: reels_sugeridos, produzir_reel com o id escolhido, ver_reel para a folha de quadros com o corte, proxima_tarefa com tipo escrever_reel, entregar_tarefa, e ver_reel de novo para conferir o Reel pronto. O chat não toca vídeo: a folha de quadros é a sua prévia, e o vídeo fica no painel. " +
    "Vídeo de canal de notícia (CNBC, Bloomberg, Casa Branca...) vem com a TRANSCRIÇÃO da fala com tempo: escolha em `trechos` só a fala que conta a notícia (15 a 45 s somados) e escreva em `legendas` a tradução fiel para o português, em pedaços de até 7 palavras, com o tempo do Reel montado. O crédito do canal entra sozinho na legenda do post.",
  "FOTO: você tem autonomia total para achar e trocar a foto de qualquer matéria ou post na fila, e deve se esforçar ao máximo antes de desistir. Pauta sem foto não vira post.",
  "Como achar: use a sua busca na web do chat livremente (site e sala de imprensa da empresa ou do órgão, notícias sobre o fato, agências, Wikipedia, Flickr, perfis oficiais). Achou uma página com a foto: imagens_da_pagina tira as fotos grandes dela. Achou o link direto do arquivo: ver_imagem (aceita vários links de uma vez, para comparar). buscar_imagens cobre Commons, Pexels e Unsplash. Tente várias consultas e fontes, em inglês e português.",
  "A foto certa mostra o assunto da manchete: a pessoa certa, a marca ou o nome legível, o prédio ou o produto citado; sem logotipo de terceiro, sem marca d'água. Se não houver, uma cena real que ambiente o fato é melhor que nenhuma.",
  "Quem pediu decide: quando houver mais de uma boa opção, ou dúvida, mostre de 2 a 4 opções no chat (numeradas, com fonte e o que se vê em cada) e pergunte qual prefere antes de trocar. Se o pedido já for claro, troque e mostre o resultado.",
  "Quando o dono reprova a foto no painel, a peça espera por você (estado_do_dia e ver_fila mostram o motivo): busque alternativas que resolvam o motivo, mostre as opções e troque com trocar_imagem (aprovacao_id de ver_fila; imagem_id de buscar_imagens ou imagem_url com autor, fonte e pagina). Nunca diga que não tem autonomia para isso.",
  "Você não aprova nem publica. Tudo o que agendar espera aprovação manual do dono no painel.",
].join("\n");

type ImagemDaResposta = { mime: string; base64: string };

/**
 * A resposta em texto, com as fotos à parte como imagem (29/10/2026): a
 * tarefa `escolher_foto` precisa que o Claude VEJA as candidatas, e base64
 * dentro do JSON seria só texto para ele.
 */
function texto(dados: unknown) {
  const imagens: ImagemDaResposta[] = [];
  const tirar = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const r = o as { imagens?: unknown; proximo?: unknown };
    if (Array.isArray(r.imagens)) {
      imagens.push(...(r.imagens as ImagemDaResposta[]));
      delete r.imagens;
    }
    tirar(r.proximo);
  };
  tirar(dados);
  return {
    content: [
      ...imagens.map((i) => ({ type: "image" as const, data: i.base64, mimeType: i.mime })),
      { type: "text" as const, text: JSON.stringify(dados, null, 2) },
    ],
  };
}

function falha(erro: unknown) {
  const mensagem =
    erro instanceof RecusaDaPlataforma
      ? `A plataforma recusou (HTTP ${erro.status}): ${erro.message}`
      : erro instanceof Error
        ? erro.message
        : String(erro);
  return { isError: true, content: [{ type: "text" as const, text: mensagem }] };
}

export function criarServidorMcp(backend: Backend, versao = "0.4.0"): McpServer {
  const servidor = new McpServer({ name: "euajournal", version: versao }, { instructions: INSTRUCOES_DO_MCP });

  const chamar = async (nome: NomeDaFerramenta, args: Record<string, unknown>) => {
    try {
      return texto(await backend(nome, args));
    } catch (erro) {
      return falha(erro);
    }
  };

  servidor.registerTool(
    "estado_do_dia",
    {
      title: "Estado do dia",
      description:
        "Mostra o que falta fazer no dia: peças reprovadas pelo dono esperando correção, tarefas abertas e em reparo, " +
        "e se a fila de aprovação está aceitando entregas. Para produzir o dia, use fazer_o_dia.",
      inputSchema: { data: DATA },
      annotations: { readOnlyHint: true },
    },
    ({ data }) => chamar("estado_do_dia", { data }),
  );

  servidor.registerTool(
    "ver_fila",
    {
      title: "Ver a fila de aprovação",
      description:
        "Lista as peças na fila de aprovação, com estado, motivo de reprovação e o link do painel. " +
        "Só leitura: aprovar e reprovar é feito pelo dono no painel.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => chamar("ver_fila", {}),
  );

  servidor.registerTool(
    "pautas_disponiveis",
    {
      title: "Pautas disponíveis",
      description:
        "Caminho avulso: lista os posts que a esteira já produziu (com pacote e foto) e que o Claude pode refazer. " +
        "Não é a pauta do dia: para o dia, use fazer_o_dia.",
      inputSchema: {
        dias: z.number().int().min(1).max(60).optional().describe("Quantos dias para trás procurar. Padrão 2."),
      },
      annotations: { readOnlyHint: true },
    },
    ({ dias }) => chamar("pautas_disponiveis", { dias }),
  );

  servidor.registerTool(
    "iniciar_post",
    {
      title: "Iniciar um post",
      description:
        "Abre a tarefa de escrita do post de uma pauta. Depois, use proxima_tarefa para receber a instrução e entregar_tarefa para entregar.",
      inputSchema: { story_id: PAUTA, data: DATA },
    },
    ({ story_id, data }) => chamar("iniciar_post", { story_id, data }),
  );

  servidor.registerTool(
    "proxima_tarefa",
    {
      title: "Próxima tarefa",
      description:
        "Devolve a próxima tarefa que espera você (reparo antes de nova), com instrução, material, esquema da resposta e, num reparo, os motivos.",
      inputSchema: {
        tipo: z
          .enum([
            "classificar",
            "propor_plano",
            "propor_complemento",
            "escolher_foto",
            "extrair_pacote",
            "escrever_post",
            "auditar_post",
            "escrever_artigo",
            "auditar_artigo",
            "escrever_newsletter",
            "auditar_newsletter",
            "escrever_reel",
          ])
          .optional()
          .describe("Só tarefas deste tipo."),
      },
      annotations: { readOnlyHint: true },
    },
    ({ tipo }) => chamar("proxima_tarefa", { tipo }),
  );

  servidor.registerTool(
    "entregar_tarefa",
    {
      title: "Entregar tarefa",
      description:
        "Entrega o resultado de uma tarefa: o JSON do esquema dela. A plataforma confere e responde o que vem em seguida: auditar, reparar, pronto ou descartado.",
      inputSchema: {
        id: z.string().min(1).describe("O id da tarefa."),
        resultado: z.record(z.string(), z.unknown()).describe("O JSON da resposta, no esquema da tarefa."),
      },
    },
    ({ id, resultado }) => chamar("entregar_tarefa", { id, resultado }),
  );

  servidor.registerTool(
    "montar_post",
    {
      title: "Montar o post",
      description:
        "Renderiza a peça e a legenda de um post pronto, para você olhar antes de agendar. Não grava nada. No Reel de foto, a imagem é o primeiro quadro do vídeo.",
      inputSchema: { story_id: PAUTA, data: DATA, formato: FORMATO, foco: FOCO },
      annotations: { readOnlyHint: true },
    },
    async ({ story_id, data, formato, foco }) => {
      try {
        const r = (await backend("montar_post", { story_id, data, formato, foco })) as {
          formato?: string;
          nota?: string;
          manchete: string;
          legenda: string;
          imagem: { mime: string; base64: string };
          telas?: Array<{ mime: string; base64: string }>;
        };
        return {
          content: [
            { type: "image" as const, data: r.imagem.base64, mimeType: r.imagem.mime },
            ...(r.telas ?? []).map((t) => ({ type: "image" as const, data: t.base64, mimeType: t.mime })),
            {
              type: "text" as const,
              text: `FORMATO: ${r.formato ?? "estatico"}${r.nota ? `\n${r.nota}` : ""}\n\nMANCHETE: ${r.manchete}\n\nLEGENDA:\n${r.legenda}`,
            },
          ],
        };
      } catch (erro) {
        return falha(erro);
      }
    },
  );

  servidor.registerTool(
    "agendar_post",
    {
      title: "Agendar o post",
      description:
        "Congela a arte (ou monta o Reel de foto), grava o post na próxima vaga livre do Instagram e o põe na fila de aprovação. Ele só vai ao ar depois de o dono aprovar no painel.",
      inputSchema: { story_id: PAUTA, data: DATA, formato: FORMATO, foco: FOCO },
    },
    ({ story_id, data, formato, foco }) => chamar("agendar_post", { story_id, data, formato, foco }),
  );

  servidor.registerTool(
    "fazer_o_dia",
    {
      title: "Fazer o dia",
      description:
        "Começa ou retoma o dia inteiro: triagem das notícias, plano do dia (que o dono aprova no painel), fotos, fatos, posts, Reels, " +
        "matérias e newsletter. Devolve o próximo passo: uma tarefa, aguardar, ou pronto. Siga os passos até pronto.",
      inputSchema: { data: DATA },
    },
    ({ data }) => chamar("fazer_o_dia", { data }),
  );

  servidor.registerTool(
    "aguardar",
    {
      title: "Aguardar o dono",
      description:
        "Espera até 50 segundos o dono aprovar o plano no painel e devolve o próximo passo. Repita enquanto o passo for aguardar.",
      inputSchema: { data: DATA, segundos: z.number().int().min(5).max(50).optional() },
      annotations: { readOnlyHint: true },
    },
    ({ data, segundos }) => chamar("aguardar", { data, segundos }),
  );

  servidor.registerTool(
    "complementar_o_dia",
    {
      title: "Complementar o dia",
      description:
        "Mais pautas para um dia cujo plano já foi aprovado, mesmo que o dia esteja pronto: abre uma tarefa propor_complemento com as pautas da triagem " +
        "que o dia ainda não tem (ou uma triagem nova, se acabaram) e os vídeos sugeridos. Cada post escolhido vira post, matéria e, se couber, newsletter. " +
        "Não passa de novo pela aprovação do plano; cada peça espera aprovação no painel. Use quando o Instagram do dia ficou abaixo de 5 peças ou o dono pedir mais.",
      inputSchema: {
        data: DATA,
        quantas: z.number().int().min(1).max(5).optional().describe("Quantas peças a mais. Sem informar, o que falta para o alvo do dia (5)."),
        pedido: z.string().max(500).optional().describe("O que o dono pediu, nas palavras dele (um assunto, uma editoria, \"algo de tecnologia\")."),
      },
    },
    ({ data, quantas, pedido }) => chamar("complementar_o_dia", { data, quantas, pedido }),
  );

  servidor.registerTool(
    "pauta_do_link",
    {
      title: "Pauta a partir de um link",
      description:
        "Põe no dia a notícia de um link, fora do plano: o dono mandou, ou pediu que você achasse uma. Leia a página antes e mande o título e o resumo. " +
        "A notícia vira post (no formato pedido), matéria do blog e, se couber, newsletter do dia, com foto, fatos e as mesmas guardas de qualquer pauta. " +
        "Funciona com o plano fechado e em dia que não começou. Devolve o primeiro passo da produção: siga até pronto.",
      inputSchema: {
        url: z.string().url().describe("O link da notícia."),
        titulo: z.string().min(8).describe("O título da notícia, como está na página."),
        resumo: z.string().max(2000).optional().describe("O que a notícia diz, em 2 a 5 frases, do que você leu na página."),
        eixo: z.enum(["economia", "trabalho", "custo_de_vida", "politica", "tecnologia", "cultura", "seguranca", "brasil", "outro"]).optional(),
        pais: z.enum(["EUA", "Brasil", "outro"]).optional().describe("De que país é a notícia. Padrão EUA."),
        atores: z.array(z.string()).max(8).optional().describe("Pessoas e organizações no centro da notícia, com o nome completo: guiam a busca da foto."),
        formato: FORMATO,
        cena: z.string().max(200).optional().describe("Uma busca em inglês de foto de contexto, sem pessoa identificável nem texto."),
        data: DATA,
      },
    },
    ({ url, titulo, resumo, eixo, pais, atores, formato, cena, data }) =>
      chamar("pauta_do_link", { url, titulo, resumo, eixo, pais, atores, formato, cena, data }),
  );

  servidor.registerTool(
    "reels_sugeridos",
    {
      title: "Reels sugeridos",
      description:
        "Os vídeos que estão rendendo no Instagram e no YouTube e casam com o nicho, do melhor para o pior, com métricas, " +
        "link de origem e a história do termômetro com que casaram. Só leitura.",
      inputSchema: { limite: z.number().int().min(1).max(20).optional().describe("Quantos. Padrão 8.") },
      annotations: { readOnlyHint: true },
    },
    ({ limite }) => chamar("reels_sugeridos", { limite }),
  );

  servidor.registerTool(
    "produzir_reel",
    {
      title: "Produzir um Reel",
      description:
        "Escolhe um vídeo de reels_sugeridos (candidato_id) ou produz o vídeo de um link que o dono mandou ou que você achou (url: YouTube, Instagram, X). " +
        "A plataforma baixa, mede o corte que tira a marca de quem publicou e abre a tarefa escrever_reel; do YouTube vem a fala transcrita, para a legenda em português. " +
        "Num Reel que falhou, tenta de novo com o texto já entregue. " +
        "Nada vai ao ar sem aprovação no painel.",
      inputSchema: {
        candidato_id: z.string().min(1).optional().describe("O id que reels_sugeridos devolve."),
        url: z.string().url().optional().describe("Ou o link do vídeo. Arquivo arrastado no chat não chega: peça o link."),
        idioma: z.enum(["en", "pt"]).optional().describe("Só com url: o idioma da fala (en pede legenda traduzida). Padrão en."),
        credito: z.string().max(80).optional().describe("Só com url: quem publicou (o canal), para o crédito na legenda do post. Do YouTube, lido sozinho."),
        titulo: z.string().max(200).optional().describe("Só com url fora do YouTube: do que o vídeo trata."),
      },
    },
    ({ candidato_id, url, idioma, credito, titulo }) => chamar("produzir_reel", { candidato_id, url, idioma, credito, titulo }),
  );

  servidor.registerTool(
    "ver_reel",
    {
      title: "Ver o Reel",
      description:
        "Mostra em que etapa o Reel está e a folha de quadros: antes do texto, a do vídeo de origem com o corte proposto em amarelo; " +
        "depois do render, a do Reel pronto, com a legenda e o link do painel.",
      inputSchema: { candidato_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ candidato_id }) => {
      try {
        const r = (await backend("ver_reel", { candidato_id })) as { imagem?: { mime: string; base64: string } | null } & Record<string, unknown>;
        const { imagem, ...resto } = r;
        return {
          content: [
            ...(imagem ? [{ type: "image" as const, data: imagem.base64, mimeType: imagem.mime }] : []),
            { type: "text" as const, text: JSON.stringify(resto, null, 2) },
          ],
        };
      } catch (erro) {
        return falha(erro);
      }
    },
  );

  servidor.registerTool(
    "buscar_imagens",
    {
      title: "Buscar imagens",
      description:
        "Busca fotos com licença conferida no Wikimedia Commons, no Pexels e no Unsplash e devolve as candidatas como imagens, cada uma com um id. " +
        "Use para escolher a foto de uma peça e depois chame trocar_imagem com o id. Você também pode achar a foto na web pelo chat e usar ver_imagem e trocar_imagem com imagem_url.",
      inputSchema: {
        consulta: z.string().min(2).describe("O que procurar: nome da pessoa, empresa, prédio, produto ou cena. Em inglês costuma render mais."),
        fonte: z.enum(["todas", "commons", "banco"]).optional().describe("commons = Wikimedia Commons; banco = Pexels e Unsplash. Padrão: todas."),
        quantas: z.number().int().min(1).max(8).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ consulta, fonte, quantas }) => chamar("buscar_imagens", { consulta, fonte, quantas }),
  );

  servidor.registerTool(
    "ver_imagem",
    {
      title: "Ver uma imagem da web",
      description:
        "Baixa imagens da web pelo link DIRETO do arquivo (uma ou até 8) e as mostra para você, com largura e altura. Use para conferir e comparar opções antes de trocar_imagem.",
      inputSchema: {
        url: z.string().optional().describe("Link direto do arquivo da imagem (jpg, png, webp)."),
        urls: z.array(z.string()).max(8).optional().describe("Vários links diretos, para comparar opções lado a lado."),
        pagina: z.string().optional().describe("A página onde a foto está, se o site exigir (proteção de hotlink)."),
      },
      annotations: { readOnlyHint: true },
    },
    ({ url, urls, pagina }) => chamar("ver_imagem", { url, urls, pagina }),
  );

  servidor.registerTool(
    "imagens_da_pagina",
    {
      title: "Fotos de uma página",
      description:
        "Abre uma página da web que você achou (notícia, sala de imprensa, perfil, Wikipedia) e devolve as fotos grandes dela como imagens, com o link direto de cada uma, " +
        "pronto para trocar_imagem. Use quando a sua busca na web achar a página, mas não o arquivo da foto.",
      inputSchema: {
        url: z.string().min(8).describe("O endereço da página."),
        quantas: z.number().int().min(1).max(8).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ url, quantas }) => chamar("imagens_da_pagina", { url, quantas }),
  );

  servidor.registerTool(
    "trocar_imagem",
    {
      title: "Trocar a imagem de uma peça",
      description:
        "Troca a foto de uma matéria (capa, crédito e legenda) ou de um post (foto, crédito na legenda e arte recongelada) que está na fila. " +
        "Passe imagem_id (de buscar_imagens) OU imagem_url (link direto achado na web) com autor e fonte para o crédito. " +
        "A plataforma guarda a imagem no próprio Storage. A peça continua esperando a aprovação do dono no painel; devolve a prévia para você conferir.",
      inputSchema: {
        aprovacao_id: z.string().min(1).describe("O id da peça, como ver_fila devolve."),
        imagem_id: z.string().optional().describe("O id de uma candidata de buscar_imagens."),
        imagem_url: z.string().optional().describe("Link direto do arquivo da foto achada na web."),
        autor: z.string().optional().describe("Foto da web: quem fotografou, ou a instituição dona da foto. Obrigatório com imagem_url."),
        fonte: z.string().optional().describe("Foto da web: o site ou a agência de onde ela veio. Obrigatório com imagem_url."),
        pagina: z.string().optional().describe("Foto da web: a página onde a foto está publicada."),
        licenca: z.string().optional().describe("Foto da web: a licença, se a página informar."),
        legenda: z.string().max(220).optional().describe("Matéria: o que a foto mostra, em uma frase, sem afirmar nada que você não viu."),
      },
    },
    (args) => chamar("trocar_imagem", args as Record<string, unknown>),
  );

  return servidor;
}
