import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarConfigEditorial } from "../editorial/config";
import type { RegistroHistorico } from "../editorial/history";
import type { PautaAvaliada } from "../editorial/guarda";
import {
  comHistoricoDoFeed,
  foraDoFeed,
  foraDoFeedDaEdicao,
  lerHistoricoDoFeed,
  registroDoPost,
  registrosDoFeed,
} from "./historico-do-feed";
import type { LinhaDoFeed } from "./historico-do-feed";

/**
 * O feed não repete o que ele mesmo levou.
 *
 * Os casos abaixo são os pares REAIS da leitura de 06/10/2026: 21 dos últimos
 * 60 posts contavam 9 pautas em dias seguidos, e a mesma leitura feita no
 * feed inteiro achou uma décima, de 15 e 16/09, fora daquela janela. A linha do dia anterior é
 * montada como `social_posts` a grava, com a manchete em português que a copy
 * escreveu naquele dia; a pauta do dia seguinte chega como o pool a entrega,
 * com o título da fonte e a classificação refeita, cuja impressão do
 * acontecimento saiu DIFERENTE (é o que os dados mostram em seis dos nove
 * casos). Pela lição de 16/09, nada aqui é construído com a chave que o
 * código compara: as manchetes são as reescritas de verdade, e os casos de
 * outro endereço e de outro veículo vêm escritos de outro jeito.
 */

const PROJ = "00000000-0000-4000-8000-000000000001";
const config = carregarConfigEditorial({});

type Real = {
  storyId: string;
  url: string;
  tituloDaFonte: string;
  dominio: string;
  /** A manchete do post que saiu primeiro, e a data dele. */
  ontem: { data: string; manchete: string; atores: string[]; termos: string[] };
  /** A manchete que saiu de novo, e a classificação refeita naquele dia. */
  hoje: { data: string; manchete: string; atores: string[]; termos: string[] };
};

const PARES_REAIS: Real[] = [
  {
    storyId: "u_671f76d956b3f8c3de7e",
    url: "https://g1.globo.com/mundo/noticia/2026/09/14/juiz-dos-eua-derruba-regra-de-trump-que-reduzia-prazo-de-permanencia-de-estudantes-e-jornalistas-estrangeiros.ghtml",
    tituloDaFonte: "Juiz derruba regra de Trump que reduzia prazo de permanência de estudantes e jornalistas estrangeiros nos EUA",
    dominio: "g1.globo.com",
    ontem: { data: "2026-09-15", manchete: "Juiz suspende regra de permanência nos EUA", atores: ["F. Dennis Saylor", "tribunal federal"], termos: ["suspensão", "derrubada de regra"] },
    hoje: { data: "2026-09-16", manchete: "Nova regra de permanência nos EUA é suspensa um dia antes de vigorar", atores: ["F. Dennis Saylor", "governo Trump"], termos: ["suspensão"] },
  },
  {
    storyId: "u_9870eac96c6cd259f599",
    url: "https://www.axios.com/2026/09/16/us-economy-income-census",
    tituloDaFonte: "Household income hits record, but lower earners lose ground",
    dominio: "axios.com",
    ontem: { data: "2026-09-17", manchete: "Quem ganha menos quase não participou do recorde de renda familiar em 2025", atores: ["Census Bureau"], termos: ["divulgação de dados"] },
    hoje: { data: "2026-09-18", manchete: "Quem ganha menos compartilha pouco do recorde de renda domiciliar dos EUA em 2025", atores: ["Census Bureau"], termos: ["divulgação de dados"] },
  },
  {
    storyId: "u_0a3ec9b5e6e7681e7f3b",
    url: "https://www.pbs.org/newshour/economy/claims-for-unemployment-benefits-drop-to-197000-the-lowest-since-mid-july-as-layoffs-remain-rare",
    tituloDaFonte: "Claims for unemployment benefits drop to 197,000, the lowest since mid-July as layoffs remain rare",
    dominio: "pbs.org",
    ontem: { data: "2026-09-25", manchete: "Quem trabalha nos EUA vê pedidos de desemprego caírem para 197.000, menor nível desde meados de julho", atores: ["Labor Department", "FactSet", "empregadores"], termos: ["queda", "divulgação", "estabilidade"] },
    hoje: { data: "2026-09-27", manchete: "Quem trabalha nos EUA vê pedidos de desemprego no menor nível desde meados de julho", atores: ["FactSet", "Labor Department"], termos: ["estabilidade do emprego", "queda de pedidos"] },
  },
  {
    storyId: "u_b3801c2f439619ed536f",
    url: "https://www.axios.com/2026/09/28/economic-legacy-biden-immigration-surge",
    tituloDaFonte: "The economic legacy of the Biden immigration surge",
    dominio: "axios.com",
    ontem: { data: "2026-09-29", manchete: "Onda migratória de Biden impulsionou o crescimento e afetou pouco trabalhadores nascidos nos EUA", atores: ["Brookings Institution", "Joe Biden"], termos: ["pesquisa", "onda migratória"] },
    hoje: { data: "2026-09-30", manchete: "Trabalhadores nascidos nos EUA tiveram pouca perturbação enquanto imigração impulsionou economia", atores: ["Brookings Institution", "imigrantes"], termos: ["crescimento", "pesquisa"] },
  },
  {
    storyId: "u_f0acb033593689d23669",
    url: "https://techcrunch.com/2026/10/02/sanders-introduces-bill-to-ban-the-federal-government-from-using-flock/",
    tituloDaFonte: "Sanders introduces bill to ban the federal government from using Flock",
    dominio: "techcrunch.com",
    ontem: { data: "2026-10-03", manchete: "Órgãos federais podem ser proibidos de usar leitores de placas: Sanders apresentou projeto", atores: ["Bernie Sanders", "Flock Safety"], termos: ["apresentação de projeto de lei", "restrição de vigilância"] },
    hoje: { data: "2026-10-04", manchete: "Agências federais deixariam de usar leitores de placas em projeto apresentado por Sanders", atores: ["Bernie Sanders", "Congresso dos Estados Unidos"], termos: ["apresentação de projeto", "proibição proposta"] },
  },
  {
    storyId: "u_a478a99ef18b48daa021",
    url: "https://www.cnbc.com/2026/10/02/lilly-novo-amylin-obesity-drugs.html",
    tituloDaFonte: "Why Lilly and Novo are betting on amylin to power a new wave of obesity drugs after GLP-1s",
    dominio: "cnbc.com",
    ontem: { data: "2026-10-03", manchete: "Pacientes com obesidade tiveram 23,3% de perda com amilina combinada à tirzepatide", atores: ["Eli Lilly", "Novo Nordisk"], termos: ["resultado de estudo"] },
    hoje: { data: "2026-10-04", manchete: "Pacientes com obesidade e diabetes perderam 23,3% em 48 semanas com eloralintide e tirzepatide", atores: ["Eli Lilly", "David Risinger"], termos: ["combinação terapêutica", "resultado de estudo"] },
  },
  {
    storyId: "u_5547492555690873b55d",
    url: "https://www.axios.com/2026/10/03/trumps-cabinet-camp-david-iran-war-yemen-houthis",
    tituloDaFonte: "Scoop: Trump's top national security aides meet secretly at Camp David on Iran, Yemen",
    dominio: "axios.com",
    ontem: { data: "2026-10-03", manchete: "Principais assessores de Trump discutem Irã e Iêmen por horas em Camp David", atores: ["Donald Trump", "J.D. Vance"], termos: ["reunião", "discussão"] },
    hoje: { data: "2026-10-04", manchete: "Quem acompanha a política dos EUA vê Vance presidir reunião de horas sobre Irã e Iêmen", atores: ["Donald Trump", "J.D. Vance"], termos: ["reunião", "discussão"] },
  },
  {
    storyId: "u_5839961a59fb532ee18c",
    url: "https://www.bls.gov/news.release/archives/empsit_10022026.htm",
    tituloDaFonte: "Both payroll employment (+29,000) and unemployment rate (4.2%) change little in September",
    dominio: "bls.gov",
    ontem: { data: "2026-10-03", manchete: "Emprego nos EUA cresce e desemprego fica em 4,2% em setembro", atores: ["BLS"], termos: ["divulgação de dados", "estabilidade do emprego"] },
    hoje: { data: "2026-10-04", manchete: "Emprego em folha de pagamento aumenta e desemprego fica em 4,2% em setembro", atores: ["BLS"], termos: ["desemprego", "divulgação", "emprego"] },
  },
  {
    storyId: "u_d0240c04986676a052fa",
    url: "https://www.axios.com/2026/10/02/supreme-court-state-climate-lawsuits-preemption",
    tituloDaFonte: "What to watch in the Supreme Court's big climate case",
    dominio: "axios.com",
    ontem: { data: "2026-10-04", manchete: "Governos estaduais e locais levam indenizações climáticas a tribunal, com bilhões em jogo", atores: ["Suprema Corte", "empresas de petróleo"], termos: ["julgamento", "disputa"] },
    hoje: { data: "2026-10-05", manchete: "Governos estaduais e locais defendem indenizações climáticas, com bilhões em jogo na Suprema Corte", atores: ["Suprema Corte", "governos estaduais e locais"], termos: ["julgamento", "preempção"] },
  },
  {
    storyId: "u_3d6273c1c5df632fa0ec",
    url: "https://techcrunch.com/2026/10/03/spotify-billionaires-body-scan-startup-has-come-to-america/",
    tituloDaFonte: "Spotify billionaire’s body scan startup has come to America",
    dominio: "techcrunch.com",
    ontem: { data: "2026-10-04", manchete: "Quem busca prevenção em Nova York pode fazer exame de uma hora por US$ 500", atores: ["Neko Health", "David Ek"], termos: ["lançamento", "expansão"] },
    hoje: { data: "2026-10-05", manchete: "Quem busca prevenção pode fazer exame corporal da Neko Health em Nova York por US$ 500", atores: ["Neko Health", "Hjalmar Nilsonne"], termos: ["chegada ao mercado", "lançamento de serviço"] },
  },
];

function linhaDoFeed(r: Real, over: Partial<LinhaDoFeed> = {}, vetor: number[] | null = null): LinhaDoFeed {
  return {
    id: `post-${r.storyId}-${r.ontem.data}`,
    platform: "instagram",
    edition_date: r.ontem.data,
    title: r.ontem.manchete,
    status: "published",
    scheduled_at: `${r.ontem.data}T14:00:00Z`,
    published_at: `${r.ontem.data}T14:01:00Z`,
    story_id: r.storyId,
    event_fingerprint: `${r.ontem.atores.join("+").toLowerCase()}|estados unidos|${r.ontem.termos.join("+")}`,
    candidate_id: `cand-${r.storyId}`,
    news_candidates: {
      url: r.url,
      canonical_url: r.url,
      title: r.tituloDaFonte,
      source_domain: r.dominio,
      actors: r.ontem.atores,
      places: ["Estados Unidos"],
      event_terms: r.ontem.termos,
      embedding: vetor,
    },
    ...over,
  };
}

function pautaDoPool(
  over: { storyId: string; url: string; titulo: string; atores?: string[]; termos?: string[]; vetor?: number[] | null },
): PautaAvaliada {
  return {
    storyId: over.storyId,
    grupo: { primary: { title: over.titulo, url: over.url, source_name: "fonte", published_at: "2026-10-05T10:00:00Z" }, secondary_sources: [] },
    classificacao: {
      eixo: "economia",
      pais: "EUA",
      atores: over.atores ?? [],
      lugares: ["Estados Unidos"],
      acontecimento: over.termos ?? [],
    },
    enriquecimento: { texto: "" },
    vetor: over.vetor ?? null,
    pontuacao: { total: 60 },
  } as unknown as PautaAvaliada;
}

describe("as pautas repetidas de verdade no feed", () => {
  it.each(PARES_REAIS.map((r) => [r.hoje.manchete, r] as const))(
    "a pauta que voltou no dia seguinte fica fora do feed: %s",
    (_titulo, r) => {
      const historico = registrosDoFeed([linhaDoFeed(r)], PROJ, { excetoData: r.hoje.data });
      const pauta = pautaDoPool({
        storyId: r.storyId,
        url: r.url,
        titulo: r.tituloDaFonte,
        atores: r.hoje.atores,
        termos: r.hoje.termos,
      });

      const { pool, repetidas } = foraDoFeed([pauta], historico, config);

      expect(pool).toHaveLength(0);
      expect(repetidas).toHaveLength(1);
      expect(repetidas[0].storyId).toBe(r.storyId);
    },
  );

  it("antes da correção, a régua do canal olhava um histórico sem nenhuma linha do Instagram", () => {
    /*
     * O defeito em uma linha: o mesmo pool, comparado ao histórico da
     * newsletter (que é o que o ciclo recebia), deixa todas passarem.
     */
    const daNewsletter: RegistroHistorico[] = [
      { projectId: PROJ, storyId: "outra", canal: "newsletter", titulo: "Fed mantém juros", urlCanonica: "axios.com/fed" },
    ];
    const pool = PARES_REAIS.map((r) =>
      pautaDoPool({ storyId: r.storyId, url: r.url, titulo: r.tituloDaFonte, atores: r.hoje.atores, termos: r.hoje.termos }),
    );
    expect(foraDoFeed(pool, daNewsletter, config).pool).toHaveLength(PARES_REAIS.length);

    const doFeed = registrosDoFeed(PARES_REAIS.map((r) => linhaDoFeed(r)), PROJ);
    expect(foraDoFeed(pool, comHistoricoDoFeed(daNewsletter, doFeed), config).pool).toHaveLength(0);
  });
});

describe("a mesma pauta escrita de outro jeito", () => {
  const empregos = PARES_REAIS.find((r) => r.storyId === "u_5839961a59fb532ee18c")!;

  it("o mesmo artigo com outro endereço de rastreio e outra identidade continua repetido (URL canônica)", () => {
    const historico = registrosDoFeed([linhaDoFeed(empregos)], PROJ);
    const pauta = pautaDoPool({
      storyId: "u_outra_identidade",
      url: "https://bls.gov/news.release/archives/empsit_10022026.htm/?utm_source=newsletter&utm_medium=email",
      titulo: "Employment Situation Summary: payrolls and jobless rate little changed",
    });
    const { repetidas } = foraDoFeed([pauta], historico, config);
    expect(repetidas).toHaveLength(1);
    expect(repetidas[0].motivo).toMatch(/URL/);
  });

  it("o mesmo relatório contado por outro veículo, com outras palavras, cai pelo vetor (0.85, o limiar histórico)", () => {
    // O vetor da linha gravada e o da pauta nova: cosseno 0.96.
    const historico = registrosDoFeed([linhaDoFeed(empregos, {}, [0.9, 0.3, 0.1])], PROJ);
    const pauta = pautaDoPool({
      storyId: "u_apnews_jobs",
      url: "https://apnews.com/article/jobs-report-september-2026-unemployment",
      titulo: "US employers added just 29,000 jobs last month as unemployment rate held at 4.2%",
      vetor: [0.85, 0.4, 0.2],
    });
    const { repetidas } = foraDoFeed([pauta], historico, config);
    expect(repetidas).toHaveLength(1);
    expect(repetidas[0].motivo).toMatch(/semelhança 0\.9/);
  });

  it("assunto vizinho, abaixo da faixa de suspeita, segue para o feed", () => {
    const historico = registrosDoFeed([linhaDoFeed(empregos, {}, [0.9, 0.3, 0.1])], PROJ);
    const pauta = pautaDoPool({
      storyId: "u_fed_juros",
      url: "https://www.cnbc.com/2026/10/05/fed-rate-decision.html",
      titulo: "Fed officials weigh another rate cut as inflation cools",
      vetor: [0.2, 0.3, 0.93],
    });
    expect(foraDoFeed([pauta], historico, config).pool).toHaveLength(1);
  });
});

describe("o que conta como já estar no feed", () => {
  const r = PARES_REAIS[0];
  const pauta = () => pautaDoPool({ storyId: r.storyId, url: r.url, titulo: r.tituloDaFonte });

  it("o dia corrente fica de fora: a reexecução não troca as pautas que ela mesma agendou", () => {
    const historico = registrosDoFeed([linhaDoFeed(r)], PROJ, { excetoData: r.ontem.data });
    expect(historico).toHaveLength(0);
    expect(foraDoFeed([pauta()], historico, config).pool).toHaveLength(1);
  });

  it.each(["cancelled", "failed"])("post %s não foi ao feed e não bloqueia", (status) => {
    const historico = registrosDoFeed([linhaDoFeed(r, { status })], PROJ);
    expect(foraDoFeed([pauta()], historico, config).pool).toHaveLength(1);
  });

  it.each(["draft", "scheduled", "published"])("post %s bloqueia", (status) => {
    const historico = registrosDoFeed([linhaDoFeed(r, { status })], PROJ);
    expect(foraDoFeed([pauta()], historico, config).pool).toHaveLength(0);
  });

  it("o título do registro é o da fonte, não a manchete reescrita do post", () => {
    const [h] = registrosDoFeed([linhaDoFeed(r)], PROJ);
    expect(h.titulo).toBe(r.tituloDaFonte);
    expect(h.canal).toBe("instagram");
    expect(h.urlCanonica).toContain("g1.globo.com/mundo/noticia/2026/09/14");
  });

  it("linha legada, sem candidata, ainda conta pela identidade e pelo título", () => {
    const [h] = registrosDoFeed([linhaDoFeed(r, { news_candidates: null })], PROJ);
    expect(h.titulo).toBe(r.ontem.manchete);
    expect(foraDoFeed([pauta()], [h], config).pool).toHaveLength(0);
  });

  it("as linhas instagram do histórico editorial saem: a régua do feed é o feed", () => {
    const editorial: RegistroHistorico[] = [
      { projectId: PROJ, storyId: "antiga", canal: "instagram", titulo: "linha do backfill de 05/09" },
      { projectId: PROJ, storyId: "n1", canal: "newsletter", titulo: "pauta do e-mail" },
    ];
    const junto = comHistoricoDoFeed(editorial, registrosDoFeed([linhaDoFeed(r)], PROJ));
    expect(junto.map((h) => h.storyId).sort()).toEqual(["n1", r.storyId].sort());
  });
});

describe("a leitura do banco", () => {
  it("lê social_posts do projeto, com a candidata junto, da janela de repetição", async () => {
    const chamadas: Array<[string, ...unknown[]]> = [];
    const client = {
      from(tabela: string) {
        chamadas.push(["from", tabela]);
        const c = {
          select(colunas: string) {
            chamadas.push(["select", colunas]);
            return c;
          },
          eq(coluna: string, valor: unknown) {
            chamadas.push(["eq", coluna, valor]);
            return c;
          },
          async gte(coluna: string, valor: unknown) {
            chamadas.push(["gte", coluna, valor]);
            return { data: [linhaDoFeed(PARES_REAIS[1])], error: null };
          },
        };
        return c;
      },
    } as unknown as SupabaseClient;

    const lidos = await lerHistoricoDoFeed(client, PROJ, 30, { agoraMs: Date.parse("2026-10-06T12:00:00Z") });

    expect(chamadas[0]).toEqual(["from", "social_posts"]);
    expect(String(chamadas[1][1])).toContain("news_candidates(");
    expect(chamadas).toContainEqual(["eq", "project_id", PROJ]);
    expect(chamadas).toContainEqual(["gte", "edition_date", "2026-09-06"]);
    expect(lidos).toHaveLength(1);
    expect(lidos[0].storyId).toBe(PARES_REAIS[1].storyId);
  });
});

describe("o agendador legado", () => {
  it("não agenda a história da edição que o feed já levou, nem com rastreio no endereço", () => {
    const r = PARES_REAIS[7];
    const historico = registrosDoFeed([linhaDoFeed(r)], PROJ);
    const { historias, repetidas } = foraDoFeedDaEdicao(
      [
        { title: "Emprego fica estável e desemprego segue em 4,2%", source_url: `${r.url}?utm_campaign=edicao`, summary: "" },
        { title: "Fed sinaliza mais um corte", source_url: "https://www.cnbc.com/2026/10/05/fed.html", summary: "" },
      ],
      historico,
      config,
    );
    expect(historias.map((h) => h.title)).toEqual(["Fed sinaliza mais um corte"]);
    expect(repetidas).toHaveLength(1);
  });
});

describe("o registro do post no histórico editorial", () => {
  it("é do canal instagram, aponta para a linha do post e não carrega foto", () => {
    const r = PARES_REAIS[2];
    const p = pautaDoPool({ storyId: r.storyId, url: r.url, titulo: r.tituloDaFonte, vetor: [1, 0, 0] });
    const reg = registroDoPost(p, { projectId: PROJ, socialPostId: "sp-1", publicadoEm: "2026-09-25T14:00:00Z" });
    expect(reg).toMatchObject({
      canal: "instagram",
      storyId: r.storyId,
      url: r.url,
      instagramPostId: "sp-1",
      publicadoEm: "2026-09-25T14:00:00Z",
      procedencia: "pipeline",
    });
    expect(reg.imagemUrl ?? null).toBeNull();
  });
});

describe("a troca de pauta do post na fila", () => {
  it("com o feed no histórico, a candidata que o feed levou ontem sai como REPETIDA_NO_CANAL", async () => {
    const { motivoDeFora } = await import("../aprovacao/contexto-de-producao");
    const r = PARES_REAIS[5];
    const candidata = {
      storyId: r.storyId,
      status: "approved",
      title: r.tituloDaFonte,
      url: r.url,
      canonicalUrl: r.url,
      summary: "",
      eventFingerprint: "eli lilly+david risinger|estados unidos|combinacao terapeutica",
      embedding: null,
      classificacao: { eixo: "tecnologia", imigracao: false, atores: r.hoje.atores, lugares: [], acontecimento: r.hoje.termos },
    };
    const canal = { storyIds: new Set<string>(), vetores: [], impressoes: new Set<string>() };

    // Antes: o canal instagram do histórico estava vazio, e a candidata passava.
    expect(motivoDeFora(candidata as never, canal, { registros: [], canal: "instagram", config }, 0.7)).toBeNull();

    const registros = comHistoricoDoFeed([], registrosDoFeed([linhaDoFeed(r)], PROJ));
    expect(motivoDeFora(candidata as never, canal, { registros, canal: "instagram", config }, 0.7)).toBe(
      "REPETIDA_NO_CANAL",
    );
  });
});
