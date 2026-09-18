import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssetVisual,
  CandidatoRecusado,
  EntidadeVisual,
  ResultadoVisual,
} from "./tipos";
import { MOTIVOS_DE_RECUSA, ehPessoa } from "./tipos";
import { criarBiblioteca, usadoRecentemente } from "./biblioteca";
import type { AssetGuardado, Biblioteca } from "./biblioteca";
import { escolherEntidadeVisual, entidadeConceitual } from "./entidade-visual";
import { buscarNoCommons, candidatoParaAsset } from "./wikimedia";
import { buscarNoOpenverse, candidatoParaAsset as candidatoDoOpenverse } from "./openverse";
import { buscarEmFonteOficial } from "./fonte-oficial";
import { escolherBandeira } from "./bandeira";
import {
  carregarConfigDeImagem,
  pisoDeRelevancia,
  pontuarImagem,
  temIdentidade,
  type NotaDaImagem,
} from "./relevancia";
import { avaliarLicenca, montarAtribuicao } from "./licencas";
import { bancoConfigurado, buscarFotosDeBanco, identidadeDaFoto } from "../prompt-system/stock";
import { consultaConceitual } from "./conceitual";
import { cenaDaPauta } from "./cena-da-pauta";
import { conferirImagem } from "./conferencia-visual";
import type { VeredictoVisual } from "./conferencia-visual";
import { getAIProviderConfig } from "../newsroom/ai-provider";
import { analisarTemporalidade, figuraNaoCentralNaImagem, retratoNaoCentral } from "./temporalidade";

/**
 * A imagem de uma pauta, resolvida pela entidade.
 *
 * Esta é a porta única: newsletter e, no futuro, Instagram entram por aqui.
 * Dois sistemas de busca de imagem no mesmo projeto viram duas regras de
 * licença diferentes, e uma delas vai estar errada.
 *
 * A ordem não é preferência estética, é hierarquia de direito e de verdade:
 *
 *   biblioteca interna   já validado, já creditado, e ainda não repetido
 *   Wikimedia Commons    licença explícita, arquivo estável, autor conhecido
 *   fonte oficial        só quando a página declara o reuso
 *   press kit            idem, no material que a instituição publica para imprensa
 *   banco conceitual     e SÓ quando a pauta não é sobre uma pessoa
 *
 * Nenhuma imagem é melhor que imagem errada. Quando nada passa, devolve
 * NO_VALID_IMAGE com o motivo, e isso não é falha de pipeline.
 */

export type PautaParaImagem = {
  storyId: string;
  titulo: string;
  /** Resumo da matéria. Entra no contexto que desambigua lugar. */
  resumo?: string;
  categoria: string;
  /** `pais` desempata homônimo: sem ele, "ICE" numa pauta americana vira trem alemão. */
  classificacao: { atores: string[]; lugares: string[]; acontecimento: string[]; pais?: string };
};

export type OpcoesDeResolucao = {
  client?: SupabaseClient;
  biblioteca?: Biblioteca;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Assets já escolhidos nesta mesma edição, para não repetir dentro do dia. */
  jaUsadosNestaEdicao?: Set<string>;
  /**
   * Fotos que já saíram em dias anteriores, por identidade.
   *
   * `jaUsadosNestaEdicao` protege dentro do dia. Esta protege entre dias, e é
   * o que faltava para o banco conceitual, que escolhe por conceito e por isso
   * nunca disputa a chave de entidade da biblioteca.
   */
  jaUsadasRecentemente?: Iterable<string>;
  /** Não grava nada. O dry-run usa isto. */
  somenteLeitura?: boolean;
  /**
   * Quem abre a imagem e diz se ela sustenta a manchete.
   *
   * Injetável para o teste poder decidir o veredicto sem rede. `false` desliga
   * a conferência, e só o dry-run e a medição de capacidade usam isso.
   *
   * Quando não vem nada, o resolvedor usa a conferência de verdade SE houver
   * credencial de modelo configurada. Sem credencial ele pula, e isso não é
   * brecha: o pipeline inteiro morre antes, em `callOpenAIJSON`, porque
   * conteúdo fabricado nunca é resultado aceitável. Em produção a chave existe
   * sempre; em teste não existe nunca.
   */
  conferenciaVisual?: Conferente | false;
};

export type Conferente = (
  asset: AssetVisual,
  pauta: { titulo: string; resumo?: string; eixo?: string },
) => Promise<VeredictoVisual>;

export async function resolveVisualAsset(
  pauta: PautaParaImagem,
  opcoes: OpcoesDeResolucao = {}
): Promise<ResultadoVisual> {
  const env = opcoes.env ?? process.env;
  const config = carregarConfigDeImagem(env);
  const biblioteca = opcoes.biblioteca ?? (opcoes.client ? criarBiblioteca(opcoes.client) : null);
  const usadosAgora = opcoes.jaUsadosNestaEdicao ?? new Set<string>();
  const usadasAntes = new Set(
    [...(opcoes.jaUsadasRecentemente ?? [])].map((u) => identidadeDaFoto(u)).filter(Boolean),
  );
  const jaSaiu = (imageUrl: string) => usadasAntes.has(identidadeDaFoto(imageUrl));

  const fontesConsultadas: ResultadoVisual["fontesConsultadas"] = [];
  const recusados: CandidatoRecusado[] = [];

  /*
   * Sem foto DA PAUTA, mas nunca sem foto.
   *
   * A regra é do dono, de 17/09/2026, depois de um post sair como peça de
   * texto puro: nenhuma peça fica sem imagem. Quando a entidade não tem foto e
   * nem o banco conceitual entrega, entra a bandeira da publicação.
   *
   * O `status` e o `motivo` continuam dizendo a verdade: NO_VALID_IMAGE com a
   * razão real. Isso é deliberado, e tem consequência prática: a newsletter
   * pergunta por `status === "SELECTED"` antes de usar a imagem, então ela
   * segue sem foto neste caso, e só a peça do Instagram recebe a bandeira. O
   * relatório também continua contando este dia como dia sem foto da pauta,
   * que é o número que interessa para melhorar a busca.
   */
  const semFotoDaPauta = (
    entidade: EntidadeVisual | null,
    motivo: ResultadoVisual["motivo"],
  ): ResultadoVisual => {
    const bandeira = escolherBandeira({
      eixo: pauta.categoria,
      evitar: new Set([...usadosAgora, ...(opcoes.jaUsadasRecentemente ?? [])]),
    });

    fontesConsultadas.push({
      fonte: "ultimo_recurso",
      encontrados: 1,
      nota: String(bandeira.metadata?.descricao ?? "bandeira da publicação"),
    });

    return {
      storyId: pauta.storyId,
      entidade,
      asset: bandeira,
      assetSecundario: null,
      status: "NO_VALID_IMAGE",
      motivo,
      fontesConsultadas,
      recusados,
      legenda: "",
    };
  };

  // 1. Quem é o assunto visual.
  const escolha = await escolherEntidadeVisual(
    {
      ...pauta.classificacao,
      titulo: pauta.titulo,
      resumo: pauta.resumo ?? "",
      contexto: `${pauta.titulo} ${pauta.resumo ?? ""} ${pauta.categoria}`,
    },
    { env, fetcher: opcoes.fetcher }
  );

  /*
   * Ambiguidade não vira palpite.
   *
   * Havendo dois lugares plausíveis e nada no contexto que decida, a pauta sai
   * sem imagem. Foto do estado de Washington numa matéria sobre a embaixada em
   * Washington D.C. é um erro que o leitor percebe.
   */
  if (!escolha.entidade && escolha.ambigua) {
    fontesConsultadas.push({
      fonte: "biblioteca_interna",
      encontrados: 0,
      nota: escolha.tentativas.map((t) => t.resultado).join(" ; "),
    });
    return semFotoDaPauta(null, MOTIVOS_DE_RECUSA.ENTIDADE_AMBIGUA);
  }

  const entidade =
    escolha.entidade ?? entidadeConceitual(pauta.classificacao.acontecimento, pauta.categoria);

  fontesConsultadas.push({
    fonte: "biblioteca_interna",
    encontrados: 0,
    nota:
      `entidade: ${entidade.nome} (${entidade.tipo}), confiança ${entidade.confianca}, ` +
      `via ${entidade.origem}`,
  });

  const piso = pisoDeRelevancia(entidade, config);
  const aprovar = (asset: AssetVisual, id?: string, segundo?: AssetVisual | null): ResultadoVisual => ({
    storyId: pauta.storyId,
    entidade,
    asset: {
      ...asset,
      id: id ?? asset.id,
      entityConfidence: entidade.confianca,
      entityEvidence: entidade.evidencias,
    },
    assetSecundario: segundo ?? null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas,
    recusados,
    legenda: asset.attribution,
  });

  // 2. A biblioteca primeiro. O que já foi validado não precisa de busca nova.
  if (biblioteca && entidade.tipo !== "conceptual") {
    try {
      const guardados = await biblioteca.daEntidade(entidade.normalizado);
      const disponiveis: AssetGuardado[] = [];

      for (const g of guardados) {
        const quando = usadoRecentemente(g, config.janelaEmDias);
        if (quando) {
          recusados.push({
            origem: "biblioteca_interna",
            identificacao: g.sourceAssetId,
            motivo: MOTIVOS_DE_RECUSA.USADA_RECENTEMENTE,
            detalhe: `usada em ${quando.slice(0, 10)}, janela de ${config.janelaEmDias} dias`,
          });
          continue;
        }
        if (usadosAgora.has(g.imageUrl)) {
          recusados.push({
            origem: "biblioteca_interna",
            identificacao: g.sourceAssetId,
            motivo: MOTIVOS_DE_RECUSA.USADA_RECENTEMENTE,
            detalhe: "já escolhida por outra pauta desta edição",
          });
          continue;
        }
        disponiveis.push(g);
      }

      fontesConsultadas.push({
        fonte: "biblioteca_interna",
        encontrados: guardados.length,
        nota: `${disponiveis.length} disponível(is) depois da janela de repetição`,
      });

      const { melhor } = melhorPontuado(disponiveis, entidade, piso, recusados, config.larguraMinima, {
        titulo: pauta.titulo,
        resumo: pauta.resumo,
        atores: pauta.classificacao.atores,
      });
      if (melhor) {
        if (!opcoes.somenteLeitura && melhor.id) await biblioteca.registrarUso(melhor.id);
        usadosAgora.add(melhor.imageUrl);
        return aprovar(melhor, melhor.id);
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "biblioteca_interna",
        encontrados: 0,
        nota: `biblioteca indisponível: ${(erro as Error).message}`,
      });
    }
  }

  // 3. Wikimedia Commons.
  const novos: AssetVisual[] = [];
  if (entidade.tipo !== "conceptual") {
    try {
      const busca = await buscarNoCommons(entidade, { env, fetcher: opcoes.fetcher });
      fontesConsultadas.push({
        fonte: "wikimedia_commons",
        encontrados: busca.candidatos.length,
        nota: busca.caminhos.join(" ; "),
      });

      for (const candidato of busca.candidatos) {
        const conversao = candidatoParaAsset(candidato, entidade, env);
        if (!conversao.ok) {
          recusados.push({
            origem: "wikimedia_commons",
            identificacao: candidato.arquivo,
            motivo: conversao.motivo.includes("licença")
              ? MOTIVOS_DE_RECUSA.LICENCA_DESCONHECIDA
              : MOTIVOS_DE_RECUSA.FONTE_NAO_PERMITIDA,
            detalhe: conversao.motivo,
          });
          continue;
        }

        const asset = conversao.asset;
        if (entidade.imagemPrincipal && candidato.arquivo.endsWith(entidade.imagemPrincipal)) {
          asset.metadata = { ...asset.metadata, origem_declarada: true };
        }
        novos.push(asset);
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "wikimedia_commons",
        encontrados: 0,
        nota: `falhou: ${(erro as Error).message}`,
      });
    }
  }

  /*
   * 4. Fonte oficial e press kit.
   *
   * A condição era `novos.length === 0`, e ela é a causa provável da foto
   * genérica que o dono apontou em 16/09/2026. Bastava o Commons devolver UM
   * candidato convertido, ainda que ele fosse recusado depois na pontuação por
   * relevância, resolução ou datação, para o site oficial nunca ser consultado.
   * O resolvedor terminava com um único candidato ruim na mão e devolvia
   * NO_VALID_IMAGE, como se não houvesse foto no mundo.
   *
   * Agora as duas fontes são SOMADAS antes de pontuar: quem escolhe é a nota,
   * e não a ordem de chegada. O banco conceitual continua atrás de todas, e
   * continua sendo o último recurso, porque ele é metáfora e não fato.
   */
  if (entidade.tipo !== "conceptual") {
    const oficial = await buscarEmFonteOficial(entidade, { env, fetcher: opcoes.fetcher, comPressKit: true });
    fontesConsultadas.push({
      fonte: "fonte_oficial",
      encontrados: oficial.assets.length,
      nota: oficial.notas.join(" ; ") || "sem site oficial declarado",
    });
    novos.push(...oficial.assets);
  }

  /*
   * 5. Openverse: um endpoint, cinco acervos.
   *
   * Entra ao lado do Commons e da fonte oficial, e não depois: ele indexa
   * Flickr, Wikimedia, Europeana, Smithsonian e NASA, e é onde mora a foto que
   * o Commons não tem. Quem decide continua sendo a nota.
   *
   * Falha dele não derruba a resolução: o índice é de terceiro, tem limite
   * anônimo de 200 buscas por dia, e um dia sem ele é um dia com as fontes de
   * sempre.
   */
  if (entidade.tipo !== "conceptual") {
    try {
      const busca = await buscarNoOpenverse(entidade, { env, fetcher: opcoes.fetcher });
      let convertidos = 0;

      for (const candidato of busca.candidatos) {
        const conversao = candidatoDoOpenverse(candidato, entidade, env);
        if (!conversao.ok) {
          recusados.push({
            origem: "openverse",
            identificacao: candidato.id,
            motivo: MOTIVOS_DE_RECUSA.LICENCA_DESCONHECIDA,
            detalhe: conversao.motivo,
          });
          continue;
        }
        novos.push(conversao.asset);
        convertidos += 1;
      }

      fontesConsultadas.push({
        fonte: "openverse",
        encontrados: convertidos,
        nota: busca.caminhos.join(" ; "),
      });
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "openverse",
        encontrados: 0,
        nota: `falhou: ${(erro as Error).message}`,
      });
    }
  }

  /*
   * 6. Banco conceitual, e agora ele é ÚLTIMO de verdade.
   *
   * A condição era `novos.length === 0`, ou seja "nenhuma fonte devolveu nada".
   * Com isso, um candidato ruim do Commons que fosse recusado na pontuação
   * impedia o banco de ser consultado, e a pauta saía sem foto nenhuma.
   *
   * Agora a pergunta é outra: alguma das fontes de FATO entregou uma foto que
   * passa na régua? Se passou, o banco não é consultado, que é a regra
   * editorial de sempre (foto de banco é metáfora, não fato). Se não passou, e
   * só então, ele entra.
   *
   * A pontuação aqui é um ENSAIO: as recusas vão para uma lista descartável,
   * porque a pontuação de verdade, a que alimenta o relatório, acontece
   * logo abaixo com a lista completa.
   */
  const ensaio: CandidatoRecusado[] = [];
  const { melhor: jaTemFotoBoa } = melhorPontuado(
    novos.filter((a) => !usadosAgora.has(a.imageUrl) && !jaSaiu(a.imageUrl)),
    entidade,
    piso,
    ensaio,
    config.larguraMinima,
    { titulo: pauta.titulo, resumo: pauta.resumo, atores: pauta.classificacao.atores },
  );

  /*
   * As recusas do ensaio são reais e precisam sobreviver a ele.
   *
   * Sem esta linha, uma pauta sobre pessoa com foto pequena demais sai por um
   * `return` lá dentro do bloco do banco conceitual, e o relatório recebe
   * `recusados` vazio: o motivo de não haver foto some, que é o defeito que
   * este módulo inteiro existe para não cometer. A pontuação de baixo
   * desconta o que já está aqui.
   */
  recusados.push(...ensaio);

  if (!jaTemFotoBoa) {
    if (ehPessoa(entidade.tipo)) {
      fontesConsultadas.push({
        fonte: "banco_conceitual",
        encontrados: 0,
        nota: "bloqueado por regra: pauta sobre pessoa não aceita foto conceitual no lugar",
      });
      return semFotoDaPauta(entidade, MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE);
    }

    if (!bancoConfigurado(env)) {
      fontesConsultadas.push({ fonte: "banco_conceitual", encontrados: 0, nota: "sem chave configurada" });
      return semFotoDaPauta(entidade, MOTIVOS_DE_RECUSA.SEM_IMAGEM_VALIDA);
    }

    try {
      /*
       * A consulta conceitual descreve coisa, não gente.
       *
       * Foto de pessoa anônima não tem como ser verificada: escolher alguém
       * para ilustrar "brasileiros nos EUA" é decidir quem parece brasileiro,
       * e isso é inferir nacionalidade por aparência. O caminho não é acertar
       * melhor, é não fazer.
       */
      /*
       * Primeiro perguntar o que fotografar, e só depois cair no tema fixo.
       *
       * O tema fixo é uma lista de 16 gavetas casadas por radical de palavra,
       * na ordem, primeiro que casar vence. Ela erra de três jeitos medidos em
       * 18/09/2026: radical que não cobre a flexão ("imovel" não casa com
       * "imóveis"), tema anterior que rouba o assunto ("economia" levando uma
       * pauta de aluguel para notas de dólar) e assunto que não tem gaveta
       * nenhuma, caindo no skyline genérico.
       *
       * A pergunta olha a matéria. A lista continua embaixo, como rede: quando
       * a chamada falha, o comportamento é o de antes, e não o vazio.
       */
      const cena = await cenaDaPauta(
        {
          titulo: pauta.titulo,
          resumo: pauta.resumo,
          categoria: pauta.categoria,
          pais: pauta.classificacao.pais,
        },
        { env, fetcher: opcoes.fetcher },
      );
      const consulta = cena.falhou
        ? consultaConceitual(pauta.titulo, pauta.categoria, pauta.classificacao.pais)
        : cena.consulta;

      /*
       * Várias candidatas, e não uma só, porque agora alguém confere a foto.
       *
       * Com uma candidata, a primeira recusa da conferência visual manda a
       * pauta direto para a bandeira. Medido em 18/09/2026: a cena pediu
       * "casas à venda numa rua residencial", o Pexels devolveu uma casa com
       * placa FOR SALE legível, a conferência recusou pela regra de não ter
       * texto na imagem, e a peça saiu com bandeira. A foto seguinte da mesma
       * busca era uma rua residencial limpa.
       *
       * Três é teto de custo: cada candidata é uma chamada ao banco, e a
       * conferência abre no máximo quatro imagens por pauta de qualquer jeito.
       */
      const fotos = await buscarFotosDeBanco(consulta, CANDIDATAS_DO_BANCO, {
        env,
        fetcher: opcoes.fetcher,
        evitar: usadasAntes,
      });
      fontesConsultadas.push({
        fonte: "banco_conceitual",
        encontrados: fotos.length,
        nota: cena.falhou
          ? `tema fixo, consulta "${consulta}" (a cena não veio: ${cena.motivo})`
          : `cena da pauta "${cena.objeto}", consulta "${consulta}"`,
      });

      for (const foto of fotos) {
        const veredicto = avaliarLicenca(
          foto.credito.provedor === "pexels" ? "Pexels License" : "Unsplash License",
          env
        );
        const agora = new Date().toISOString();
        novos.push({
          entityName: entidade.nome,
          entityNormalized: entidade.normalizado,
          entityType: "conceptual",
          source: "banco_conceitual",
          sourceAssetId: foto.imagemUrl,
          imageUrl: foto.imagemUrl,
          sourcePageUrl: foto.credito.fotoUrl,
          author: foto.credito.fotografo,
          // A licença do provedor não está na allowlist do Commons e não
          // precisa estar: ela é do provedor, e o que importa é a obrigação de
          // crédito que ele declara.
          license: foto.credito.provedor === "pexels" ? "Pexels License" : "Unsplash License",
          licenseUrl: foto.credito.fotoUrl,
          attribution: foto.credito.atribuicao ?? "",
          rightsStatement: veredicto.motivo,
          rightsStatus: "verified",
          rightsCheckedAt: agora,
          sourceLastCheckedAt: agora,
          width: 1200,
          height: 800,
          mimeType: "image/jpeg",
          storagePath: null,
          perceptualHash: null,
          imageRelevanceScore: 0,
          imageContextType: "conceptual",
          metadata: { provedor: foto.credito.provedor, conceitual: true },
        });
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "banco_conceitual",
        encontrados: 0,
        nota: `falhou: ${(erro as Error).message}`,
      });
    }
  }

  // 6. Pontuar, filtrar e escolher.
  /*
   * Duas memórias, e as duas cortam aqui.
   *
   * `usadosAgora` impede a mesma foto em duas pautas do mesmo dia. `jaSaiu`
   * impede a mesma foto em dias diferentes, que é o caso que o banco
   * conceitual produzia sozinho.
   */
  const disponiveis = novos.filter((a) => !usadosAgora.has(a.imageUrl) && !jaSaiu(a.imageUrl));
  const desta = [] as CandidatoRecusado[];
  const { aprovadas } = melhorPontuado(disponiveis, entidade, piso, desta, config.larguraMinima, {
    titulo: pauta.titulo,
    resumo: pauta.resumo,
    atores: pauta.classificacao.atores,
  });

  /*
   * 6.1. Alguém abre a imagem antes de ela virar peça.
   *
   * Até aqui nenhuma barreira olhou a foto: todas comparam texto com texto. É o
   * que deixou passar, em 17/09/2026, a Escola Superior de Economia de Perm, na
   * Rússia, numa pauta sobre o programa PERM do Departamento do Trabalho
   * americano, com `semanticContextFit` 100.
   *
   * Por isso a escolha virou LAÇO e não carimbo: a primeira colocada é
   * conferida, e se reprovar a vez passa para a seguinte. A recusa é barata,
   * porque existe a bandeira como reserva; a aprovação errada é cara, porque o
   * perfil publica sozinho.
   */
  const conferir = conferenteDe(opcoes);
  const escolhido = await primeiraAprovada(aprovadas.map((x) => x.item), conferir, pauta, desta, TETO_DE_CONFERENCIAS);
  const vice = await primeiraAprovada(
    escolherVice(aprovadas, escolhido).map((x) => x.item),
    conferir,
    pauta,
    desta,
    TETO_DE_CONFERENCIAS_DA_BOLHA,
  );

  /*
   * Só o que o ensaio ainda não tinha visto.
   *
   * Os mesmos candidatos passam pela pontuação duas vezes, uma no ensaio que
   * decide se o banco conceitual entra e outra aqui. Empurrar as duas listas
   * faria cada recusa aparecer em dobro no relatório, e relatório que conta
   * duas vezes a mesma coisa é relatório que ninguém confere.
   */
  for (const r of desta) {
    if (!recusados.some((x) => x.identificacao === r.identificacao && x.motivo === r.motivo)) {
      recusados.push(r);
    }
  }

  if (!escolhido) {
    return semFotoDaPauta(
      entidade,
      recusados.length > 0 ? MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA : MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE
    );
  }

  usadosAgora.add(escolhido.imageUrl);

  // 7. Guardar na biblioteca. Só o que foi efetivamente escolhido.
  if (biblioteca && !opcoes.somenteLeitura && escolhido.source !== "banco_conceitual") {
    try {
      const guardado = await biblioteca.guardar(escolhido);
      if (guardado?.id) {
        await biblioteca.registrarUso(guardado.id);
        return aprovar(escolhido, guardado.id, vice);
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "biblioteca_interna",
        encontrados: 0,
        nota: `não foi possível guardar: ${(erro as Error).message}`,
      });
    }
  }

  return aprovar(escolhido, undefined, vice);
}

/**
 * Quantas imagens chegam a ser abertas por pauta.
 *
 * O teto existe por custo e por latência, não por confiança: uma pauta cuja
 * quarta colocada ainda é incoerente não tem foto boa, tem lista ruim, e a
 * resposta certa para ela é a bandeira. A bolha ganha teto menor porque ela é
 * opcional: capa sem bolha é peça publicável, capa com bolha errada não é.
 */
/**
 * Quantas fotos o banco conceitual entrega por pauta.
 *
 * Elas existem para a conferência visual ter o que percorrer: com uma só, a
 * primeira recusa manda a pauta para a bandeira. Três é teto de custo, porque
 * cada candidata é uma chamada ao banco e a conferência abre no máximo quatro
 * imagens por pauta de qualquer jeito.
 */
const CANDIDATAS_DO_BANCO = 3;

const TETO_DE_CONFERENCIAS = 4;
const TETO_DE_CONFERENCIAS_DA_BOLHA = 2;

/**
 * Quem confere, considerando o que foi injetado e o que existe no ambiente.
 *
 * `false` desliga. Função injetada manda. Sem nada, usa a conferência de
 * verdade se houver credencial, e pula se não houver: em teste não há chave, e
 * em produção o pipeline já teria morrido antes sem ela.
 */
function conferenteDe(opcoes: OpcoesDeResolucao): Conferente | null {
  if (opcoes.conferenciaVisual === false) return null;
  if (typeof opcoes.conferenciaVisual === "function") return opcoes.conferenciaVisual;
  const env = opcoes.env ?? process.env;
  if (!getAIProviderConfig(env).isConfigured) return null;
  return (asset, contexto) => conferirImagem(asset, contexto, { env, fetcher: opcoes.fetcher });
}

/**
 * A primeira da fila que passa na conferência visual.
 *
 * Sem conferente, devolve a primeira da fila: é o comportamento antigo, e é o
 * que o dry-run e o teste querem.
 */
async function primeiraAprovada<T extends AssetVisual>(
  candidatas: T[],
  conferir: Conferente | null,
  pauta: PautaParaImagem,
  recusados: CandidatoRecusado[],
  teto: number,
): Promise<T | null> {
  if (candidatas.length === 0) return null;
  if (!conferir) return candidatas[0] ?? null;

  const contexto = { titulo: pauta.titulo, resumo: pauta.resumo, eixo: pauta.categoria };

  for (const candidata of candidatas.slice(0, teto)) {
    const veredicto = await conferir(candidata, contexto);

    if (veredicto.aprovada) {
      candidata.conferenciaVisual = {
        descricao: veredicto.descricao,
        motivo: veredicto.motivo,
        paisAparente: veredicto.paisAparente,
        confianca: veredicto.confianca,
      };
      return candidata;
    }

    recusados.push({
      origem: candidata.source,
      identificacao: candidata.sourceAssetId,
      motivo: veredicto.falhou
        ? MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_INDISPONIVEL
        : MOTIVOS_DE_RECUSA.CONFERENCIA_VISUAL_REPROVOU,
      detalhe: veredicto.descricao
        ? `viu "${veredicto.descricao}": ${veredicto.motivo}`
        : veredicto.motivo,
    });
  }

  return null;
}

/**
 * O melhor candidato acima do piso, ou nada.
 *
 * Recusa por resolução vem antes da pontuação porque é objetiva: foto de 300px
 * esticada no bloco do e-mail fica ruim independentemente de ser a foto certa.
 */
function melhorPontuado<T extends AssetVisual>(
  candidatos: T[],
  entidade: EntidadeVisual,
  piso: number,
  recusados: CandidatoRecusado[],
  larguraMinima: number,
  pauta?: { titulo: string; resumo?: string; atores?: string[] }
): { melhor: T | null; vice: T | null; aprovadas: Array<{ item: T; nota: NotaDaImagem }> } {
  /*
   * A vice existe porque a capa quer DUAS imagens.
   *
   * A bolha da capa mostra um segundo assunto ao lado do personagem, e ela
   * precisa de uma foto que tenha passado pelas MESMAS barreiras da primeira:
   * resolução, licença, temporalidade, figura não central e piso de
   * relevância. Pegar a segunda da lista bruta traria de volta exatamente o
   * que cada barreira recusou.
   *
   * Por isso a vice sai daqui, e não de um segundo filtro em outro lugar:
   * quem sabe quais candidatas foram aprovadas é este laço.
   */
  const aprovadas: Array<{ item: T; nota: NotaDaImagem }> = [];

  for (const c of candidatos) {
    // Largura zero significa dimensão desconhecida (fonte oficial não informa),
    // e aí a pontuação decide sozinha.
    if (c.width > 0 && c.width < larguraMinima) {
      recusados.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: MOTIVOS_DE_RECUSA.RESOLUCAO_BAIXA,
        detalhe: `${c.width}px de largura, mínimo ${larguraMinima}`,
      });
      continue;
    }

    /*
     * Tempo e sentido vêm ANTES da pontuação, e é isso que os torna barreira.
     *
     * Se entrassem como peso, a correspondência de entidade compensaria: uma
     * foto perfeita do Bureau of Labor Statistics somaria 45 pontos de
     * entidade e perderia 12 de tempo, e a fotografia de 1937 sobre a QUEDA de
     * 1,5 milhão de empregos continuaria ilustrando a criação de 162 mil.
     * Correspondência de entidade não compensa sentido invertido.
     */
    if (pauta) {
      const temporal = analisarTemporalidade(c, { ...pauta, entidade });

      c.assetDate = temporal.assetDate;
      c.assetAgeYears = temporal.assetAgeYears;
      c.temporalRelevanceScore = temporal.temporalRelevanceScore;
      c.semanticContextFit = temporal.semanticContextFit;
      c.archiveImage = temporal.archiveImage;
      c.historicalEventSpecific = temporal.historicalEventSpecific;

      if (temporal.recusa) {
        recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: temporal.recusa as CandidatoRecusado["motivo"],
          detalhe: temporal.detalhe,
        });
        continue;
      }

      const figura = retratoNaoCentral(c, entidade, entidade.confianca);
      if (figura.recusa) {
        recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: figura.recusa as CandidatoRecusado["motivo"],
          detalhe: figura.detalhe,
        });
        continue;
      }

      /*
       * A mesma regra, para qualquer contexto declarado.
       *
       * `retratoNaoCentral` acima só alcança `official_portrait` e
       * `entity_portrait`. Uma foto de painel de congresso classificada como
       * `institution` passava por ele com quatro pessoas identificáveis
       * dentro, nenhuma delas assunto da pauta. Quem vê o post vê o rosto, não
       * o campo `image_context_type`.
       *
       * As referências são o que a pauta afirma: a entidade visual escolhida
       * mais os atores da classificação.
       */
      const naImagem = figuraNaoCentralNaImagem(c, [
        entidade.nome,
        ...(pauta?.atores ?? []),
        pauta?.titulo ?? "",
        pauta?.resumo ?? "",
      ]);
      if (naImagem.recusa) {
        recusados.push({
          origem: c.source,
          identificacao: c.sourceAssetId,
          motivo: naImagem.recusa as CandidatoRecusado["motivo"],
          detalhe: naImagem.detalhe,
        });
        continue;
      }
    }

    const nota = pontuarImagem(c, entidade);
    c.imageRelevanceScore = nota.total;

    if (nota.total < piso) {
      recusados.push({
        origem: c.source,
        identificacao: c.sourceAssetId,
        motivo: MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA,
        detalhe: `${nota.explicacao}, piso ${piso}`,
      });
      continue;
    }

    aprovadas.push({ item: c, nota });
  }

  aprovadas.sort((a, b) => b.nota.total - a.nota.total);

  /*
   * A vice não pode ser a mesma imagem da vencedora.
   *
   * Duas fontes diferentes devolvem o mesmo arquivo do Commons com frequência,
   * e a capa ficaria com a mesma foto no fundo e dentro do círculo, que é pior
   * que não ter bolha nenhuma.
   */
  const melhor = aprovadas[0]?.item ?? null;
  const vice =
    aprovadas.find(
      (a) =>
        a.item !== melhor &&
        identidadeDaFoto(a.item.imageUrl) !== identidadeDaFoto(melhor?.imageUrl ?? "") &&
        /*
         * A bolha exige MAIS do que a foto de fundo, e não o mesmo.
         *
         * O fundo pode ser a cena: a rua, o prédio, o plano aberto. Ele ocupa
         * a peça inteira e o degradê come metade dele. A bolha é um círculo de
         * 44 por cento de largura no terço superior, e o que não é
         * reconhecível ali vira mancha. Passar na mesma régua do fundo não
         * basta; a vice precisa mostrar quem ou o que a pauta cita.
         */
        temIdentidade(a.nota) &&
        /*
         * E a vice NUNCA é do banco conceitual.
         *
         * O banco conceitual entra como último caso para a foto de fundo: numa
         * pauta sem rosto e sem lugar, uma imagem de apoio ainda é melhor que
         * peça vazia. Para a bolha o cálculo é outro. O círculo é pequeno,
         * fica no terço superior e é a primeira coisa que o olho encontra: ali
         * uma foto genérica de banco não reforça nada, ela anuncia que a peça
         * não tinha o que mostrar. Melhor capa sem bolha do que bolha sem
         * assunto, e foi exatamente esta a correção pedida em 16/09/2026.
         */
        a.item.source !== "banco_conceitual" &&
        a.item.imageContextType !== "conceptual",
    )?.item ?? null;

  return { melhor, vice, aprovadas };
}

/**
 * A vice para uma vencedora que pode não ser a primeira da lista.
 *
 * Quando a conferência visual reprova a primeira colocada, a vencedora passa a
 * ser outra, e a vice tem que ser recalculada contra ELA: senão a bolha pode
 * repetir a mesma foto do fundo, que é o defeito que a régua original já
 * existia para evitar.
 */
function escolherVice<T extends AssetVisual>(
  aprovadas: Array<{ item: T; nota: NotaDaImagem }>,
  vencedora: T | null,
): Array<{ item: T; nota: NotaDaImagem }> {
  return aprovadas.filter(
    (a) =>
      a.item !== vencedora &&
      identidadeDaFoto(a.item.imageUrl) !== identidadeDaFoto(vencedora?.imageUrl ?? "") &&
      temIdentidade(a.nota) &&
      a.item.source !== "banco_conceitual" &&
      a.item.imageContextType !== "conceptual",
  );
}
