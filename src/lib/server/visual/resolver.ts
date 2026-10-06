import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssetVisual,
  CaminhoDaFoto,
  CandidatoRecusado,
  DegrauDaCena,
  EntidadeVisual,
  ResultadoVisual,
} from "./tipos";
import { MOTIVOS_DE_RECUSA, ehPessoa, normalizarEntidade } from "./tipos";
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
import { cenaDaPauta, type CenaDaPauta } from "./cena-da-pauta";
import { conferirImagem } from "./conferencia-visual";
import type { VeredictoVisual } from "./conferencia-visual";
import { getAIProviderConfig } from "../newsroom/ai-provider";
import { analisarTemporalidade, figuraNaoCentralNaImagem, retratoNaoCentral } from "./temporalidade";
import type { Acervo } from "./acervo/acervo";
import { paisDoAcervo } from "./acervo/catalogo-de-cenas";
import {
  anotarFalta,
  assetDoAcervo,
  assuntosDaEntidade,
  escolherDoAcervo,
  marcarUso,
  type ContextoDaBusca,
} from "./acervo/na-resolucao";

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
  /**
   * O acervo próprio (decisão de 29/09/2026), ou nada.
   *
   * Ausente ou `null` é o caminho de antes, byte a byte: nenhuma consulta a
   * mais, e a pergunta da cena sai com o prompt de sempre. Quem decide se ele
   * vem é a capacidade `acervo` do projeto, em `acervo/acervo.ts`.
   */
  acervo?: Acervo | null;
  /**
   * Por que o editor recusou fotos NESTE canal (06/10/2026, aprendizado da
   * fila). Vai para a pergunta da cena, para a busca mudar de assunto e não só
   * de arquivo. Ausente ou vazio, a pergunta sai byte a byte como antes.
   */
  recusasDoEditor?: string[];
};

export type Conferente = (
  asset: AssetVisual,
  pauta: { titulo: string; resumo?: string; eixo?: string; uso?: "fundo" | "bolha"; papel?: "assunto" | "cena" },
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
  /*
   * ATUALIZADO em 06/10/2026: ambiguidade continua não virando palpite sobre
   * a ENTIDADE, mas deixou de matar a pauta. Ela segue como pauta sem
   * entidade, pela escada da cena: a foto de contexto não afirma qual das duas
   * Washington é, e é por isso que ela pode ficar. Medido no catálogo do
   * evergreen: "paridade regional" morria aqui toda vez.
   */
  if (!escolha.entidade && escolha.ambigua) {
    fontesConsultadas.push({
      fonte: "biblioteca_interna",
      encontrados: 0,
      nota: `entidade ambígua, a pauta segue pela cena: ${escolha.tentativas.map((t) => t.resultado).join(" ; ")}`,
    });
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

  /*
   * Quem confere as imagens, decidido uma vez e usado em dois lugares.
   *
   * Ele governa as DUAS chamadas de modelo deste módulo: a pergunta sobre o
   * que fotografar, lá no banco conceitual, e a conferência que abre a imagem,
   * aqui embaixo. Ficava declarado só antes da segunda, e a primeira nasceu
   * sem interruptor nenhum: o `dry-run-imagens`, que roda sobre até 40 pautas
   * reais para medir sem custo, passaria a gastar 40 chamadas invisíveis.
   */
  const conferir = conferenteDe(opcoes);
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
    // A etapa da cena sobrescreve; aqui é a foto que veio pela entidade, ou a cena da pauta sem entidade.
    caminho: entidade.tipo === "conceptual" ? "cena" : "entidade",
  });

  /*
   * 1.5. O acervo próprio, pela ENTIDADE (decisão de 29/09/2026).
   *
   * Entidade nomeada e o acervo tem: sai daqui, sem conferência visual, porque
   * a foto foi conferida na entrada. Entidade nomeada e o acervo não tem: a
   * falta vai para a lista de compras e a resolução segue para as fontes de
   * sempre. A CENA não é consultada aqui de propósito: ela só entra depois de a
   * entidade falhar nos dois lados, senão uma foto genérica de "tecnologia"
   * mascararia a falta da foto do produto que a pauta cita.
   */
  const acervo = opcoes.acervo ?? null;
  const buscaNoAcervo: ContextoDaBusca = {
    storyId: pauta.storyId,
    titulo: pauta.titulo,
    janelaEmDias: config.janelaEmDias,
    usadosAgora,
    jaSaiu,
  };
  const daPrateleira = async (
    candidatas: Awaited<ReturnType<Acervo["porTag"]>>,
    tipo: "cena" | "entidade",
    chave: string,
    pais: string,
  ): Promise<ResultadoVisual | null> => {
    const busca = escolherDoAcervo(candidatas, buscaNoAcervo);
    const notas = [`${tipo} "${chave}": ${busca.nota}`];

    if (!busca.escolhida) {
      const anotada = await anotarFalta(acervo!, tipo, chave, pais, busca.falta ?? "vazio", buscaNoAcervo);
      if (anotada) notas.push(anotada);
      fontesConsultadas.push({ fonte: "acervo_proprio", encontrados: busca.encontradas, nota: notas.join(" ; ") });
      return null;
    }

    if (acervo!.modo !== "enforce") {
      fontesConsultadas.push({
        fonte: "acervo_proprio",
        encontrados: busca.encontradas,
        nota: `${notas.join(" ; ")} ; ENSAIO (dry_run): escolheria esta, e a cadeia externa segue decidindo`,
      });
      return null;
    }

    const uso = await marcarUso(acervo!, busca.escolhida);
    if (uso) notas.push(uso);
    fontesConsultadas.push({ fonte: "acervo_proprio", encontrados: busca.encontradas, nota: notas.join(" ; ") });
    usadosAgora.add(busca.escolhida.urlPublica);
    // Foto de CENA nunca leva o nome da entidade, nem quando a pauta tem uma e chegou aqui pela etapa da cena.
    return aprovar(assetDoAcervo(busca.escolhida, tipo === "cena" || entidade.tipo === "conceptual" ? null : entidade));
  };

  if (acervo && entidade.tipo !== "conceptual") {
    const chaves = assuntosDaEntidade(entidade);
    try {
      const candidatas = await acervo.porAssunto(chaves);
      const doAcervo = await daPrateleira(candidatas, "entidade", chaves[0] ?? entidade.normalizado, "");
      if (doAcervo) return doAcervo;
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "acervo_proprio",
        encontrados: 0,
        nota: `acervo indisponível: ${(erro as Error).message}`,
      });
    }
  }

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
   * 6. As fontes de FATO decidem primeiro, e sozinhas.
   *
   * Até 06/10/2026 o banco conceitual entrava aqui misturado com as fontes de
   * fato, pontuado contra a ENTIDADE nomeada. Uma foto de banco nunca tem o
   * nome do Fed no arquivo, então somava 33 pontos (qualidade, proporção,
   * licença e origem) contra o piso de 45, e caía como LOW_RELEVANCE sem
   * ninguém abrir a imagem. E quando a foto do órgão passava na pontuação e a
   * conferência visual a recusava, o banco nem era consultado. Nos dois casos a
   * pauta com entidade morria em NO_VALID_IMAGE, enquanto a pauta SEM entidade
   * ganhava a foto da cena. Foi isso que fez o catálogo do evergreen tirar a
   * entidade de credit score, 401(k), aluguel e Artemis.
   *
   * Agora são duas etapas. Esta é a da entidade, com a régua de sempre. A
   * seguinte é a da cena, que só roda quando esta não entregou foto aprovada.
   */
  const disponiveisDeFato = novos.filter((a) => !usadosAgora.has(a.imageUrl) && !jaSaiu(a.imageUrl));
  const desta = [] as CandidatoRecusado[];
  const { aprovadas: aprovadasDeFato } = melhorPontuado(disponiveisDeFato, entidade, piso, desta, config.larguraMinima, {
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
  const escolhidoDeFato = await primeiraAprovada(
    aprovadasDeFato.map((x) => x.item),
    conferir,
    pauta,
    desta,
    TETO_DE_CONFERENCIAS,
  );
  const vice = escolhidoDeFato
    ? await primeiraAprovada(
        escolherVice(aprovadasDeFato, escolhidoDeFato).map((x) => x.item),
        conferir,
        pauta,
        desta,
        TETO_DE_CONFERENCIAS_DA_BOLHA,
        "bolha",
      )
    : null;

  /*
   * Recusas sem duplicata.
   *
   * O mesmo arquivo pode chegar por duas fontes (Commons e Openverse) e ser
   * recusado duas vezes pelo mesmo motivo. Relatório que conta duas vezes a
   * mesma coisa é relatório que ninguém confere.
   */
  const anotarRecusas = (lista: CandidatoRecusado[]) => {
    for (const r of lista) {
      if (!recusados.some((x) => x.identificacao === r.identificacao && x.motivo === r.motivo)) recusados.push(r);
    }
  };
  anotarRecusas(desta);

  if (escolhidoDeFato) {
    usadosAgora.add(escolhidoDeFato.imageUrl);

    // 7. Guardar na biblioteca. Só o que foi efetivamente escolhido.
    if (biblioteca && !opcoes.somenteLeitura) {
      try {
        const guardado = await biblioteca.guardar(escolhidoDeFato);
        if (guardado?.id) {
          await biblioteca.registrarUso(guardado.id);
          return aprovar(escolhidoDeFato, guardado.id, vice);
        }
      } catch (erro) {
        fontesConsultadas.push({
          fonte: "biblioteca_interna",
          encontrados: 0,
          nota: `não foi possível guardar: ${(erro as Error).message}`,
        });
      }
    }

    return aprovar(escolhidoDeFato, undefined, vice);
  }

  if (ehPessoa(entidade.tipo) && pessoaNaManchete(entidade, pauta.titulo)) {
    /*
     * Pessoa continua sem cena no lugar, e isso não mudou com a etapa da cena.
     *
     * Foto conceitual no lugar de uma pessoa é a mentira mais fácil de cometer
     * (`TIPOS_DE_PESSOA`, em `tipos.ts`): a matéria sobre um político ilustrada
     * com o prédio onde ele trabalha sugere que o prédio é o assunto.
     *
     * ATUALIZADO em 06/10/2026: a regra vale para a pauta SOBRE a pessoa, e a
     * prova disso é a manchete nomeá-la. No replay de 60 pautas reais, as
     * únicas que ainda ficavam sem foto eram de pessoa que a manchete não cita
     * ("EUA flexibilizam normas sobre economia de combustível", com Trump
     * entre os atores): a conferência recusava a foto dele porque ele não está
     * na manchete, e a regra recusava a cena porque ele era a entidade. Quando
     * a manchete não nomeia a pessoa, a pauta é sobre o fato, e o fato tem cena.
     */
    fontesConsultadas.push({
      fonte: "banco_conceitual",
      encontrados: 0,
      nota: "bloqueado por regra: pauta sobre pessoa não aceita foto conceitual no lugar",
    });
    return semFotoDaPauta(
      entidade,
      aprovadasDeFato.length > 0 ? MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA : MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE,
    );
  }

  /*
   * 8. A CENA, para a pauta sem entidade e, desde 06/10/2026, para a pauta cuja
   * entidade não deu foto.
   *
   * Pedido do dono depois das amostras do evergreen: o órgão citado (o Fed, o
   * IRS) não pode ser motivo de a pauta morrer sem foto quando a mesma pauta,
   * sem o nome do órgão, ganharia a foto da cena. As barreiras são as mesmas
   * da pauta sem entidade, sem desconto nenhum: a cena descrita pelo conteúdo
   * (sem pessoa identificável e sem texto, na instrução e no filtro), o acervo
   * pela tag com a régua de país, e a conferência visual abrindo a imagem.
   *
   * A pontuação desta etapa é contra a ENTIDADE CONCEITUAL da pauta, e não
   * contra o órgão: a foto da cena não tem o nome do Fed, e cobrar isso dela é
   * exatamente o defeito que esta etapa corrige. O resultado continua dizendo
   * qual é a entidade da pauta, porque é ela que a bolha procura.
   */
  const depoisDaEntidade = entidade.tipo !== "conceptual";
  const entidadeDaCena = depoisDaEntidade
    ? entidadeConceitual(pauta.classificacao.acontecimento, pauta.categoria)
    : entidade;
  const caminhoDaCena: CaminhoDaFoto = depoisDaEntidade ? "cena_depois_da_entidade" : "cena";
  if (depoisDaEntidade) {
    const motivoDaEntidade =
      aprovadasDeFato.length > 0
        ? `${Math.min(aprovadasDeFato.length, TETO_DE_CONFERENCIAS)} foto(s) da entidade reprovada(s) na conferência visual`
        : "nenhuma foto da entidade passou na pontuação";
    fontesConsultadas.push({
      fonte: "banco_conceitual",
      encontrados: 0,
      nota: `fallback de cena: ${entidade.nome} sem foto aprovada (${motivoDaEntidade}); a pauta segue pela cena`,
    });
  }

  const aprovarDaCena = (asset: AssetVisual, degrau: DegrauDaCena): ResultadoVisual => {
    const r = aprovar(asset, undefined, null);
    return {
      ...r,
      asset: {
        ...r.asset!,
        entityConfidence: entidadeDaCena.confianca,
        entityEvidence: entidadeDaCena.evidencias,
        metadata: { ...r.asset!.metadata, degrau, ...(depoisDaEntidade ? { fallback_de_cena: true } : {}) },
      },
      caminho: caminhoDaCena,
      degrau,
    };
  };

  let cenaPerguntada: CenaDaPauta | null = null;

  /*
   * 8.1. O acervo próprio, pela CENA (decisão de 29/09/2026).
   *
   * Chega aqui a pauta sem entidade, ou com entidade que falhou no acervo E
   * nas fontes externas: é exatamente a ordem da decisão, em que a cena só
   * é consultada depois de a entidade falhar nos dois lados.
   *
   * A pergunta da cena é feita AQUI quando há acervo, antes do teste de
   * chave do banco de terceiro: o acervo não depende do Pexels, e sem esta
   * antecipação um deploy sem `PEXELS_API_KEY` nunca consultaria o nosso.
   * A mesma resposta é reaproveitada lá embaixo, então a pergunta continua
   * sendo UMA por pauta.
   */
  if (acervo && conferir) {
    cenaPerguntada = await cenaDaPauta(
      {
        titulo: pauta.titulo,
        resumo: pauta.resumo,
        categoria: pauta.categoria,
        pais: pauta.classificacao.pais,
      },
      { env, fetcher: opcoes.fetcher, comTag: true, recusasDoEditor: opcoes.recusasDoEditor },
    );
    const pais = paisDoAcervo(pauta.classificacao.pais);
    if (!cenaPerguntada.tag) {
      fontesConsultadas.push({
        fonte: "acervo_proprio",
        encontrados: 0,
        // `undefined` é "a chamada nem voltou"; `null` é "voltou sem cena no cardápio".
        nota: cenaPerguntada.tag === undefined
          ? `sem tag de cena: ${cenaPerguntada.motivo}`
          : "o modelo não achou cena do cardápio para esta pauta",
      });
    } else {
      try {
        const candidatas = await acervo.porTag(cenaPerguntada.tag, pais);
        const doAcervo = await daPrateleira(candidatas, "cena", cenaPerguntada.tag, pais);
        if (doAcervo) return { ...doAcervo, caminho: caminhoDaCena, degrau: "acervo" };
      } catch (erro) {
        fontesConsultadas.push({
          fonte: "acervo_proprio",
          encontrados: 0,
          nota: `acervo indisponível: ${(erro as Error).message}`,
        });
      }
    }
  } else if (acervo) {
    fontesConsultadas.push({
      fonte: "acervo_proprio",
      encontrados: 0,
      nota: "cena não perguntada: chamadas de modelo desligadas, e sem a tag não há busca por cena",
    });
  }

  if (!bancoConfigurado(env)) {
    fontesConsultadas.push({ fonte: "banco_conceitual", encontrados: 0, nota: "sem chave configurada" });
    return semFotoDaPauta(entidade, MOTIVOS_DE_RECUSA.SEM_IMAGEM_VALIDA);
  }

  /*
   * 8.2. A ESCADA da cena (06/10/2026).
   *
   * Pedido do dono, com estas palavras: "o ideal é que nunca haja falha de
   * imagem; sempre tem que ter foto de contexto". Até aqui a cena era UMA
   * busca de três fotos, feitas em três chamadas iguais ao banco, e a pauta
   * morria quando a conferência recusava as três. Medido no catálogo do
   * evergreen: todas as pautas que ficaram sem foto tinham exatamente três
   * candidatas recusadas, e nenhum outro lugar onde procurar.
   *
   * Agora a cena desce degraus, do mais específico para o mais largo, e para
   * no primeiro que entrega foto aprovada:
   *
   *   cena        a busca que descreve o objeto da pauta
   *   cena_ampla  o ambiente do mesmo assunto, mais o tema fixo, e o Openverse
   *   editoria    o contexto da editoria (o Capitólio para política, servidores
   *               para tecnologia), que serve a qualquer pauta dela
   *   reuso       os mesmos pedidos, aceitando foto que saiu nos últimos 30
   *               dias; nunca a que saiu hoje
   *
   * As regras duras NÃO descem com a escada. Toda candidata passa pela mesma
   * pontuação e pela conferência visual, que abre a imagem e recusa pessoa
   * identificável, texto como assunto, outro país e logotipo de terceiro. O
   * que muda é a pergunta: a conferência sabe que a foto é de CONTEXTO
   * (`papel: "cena"`), e "é genérica" ou "não mostra o órgão" deixam de ser
   * motivo de recusa, porque não é isso que se pede a uma foto de contexto.
   */
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
  /*
   * O mesmo interruptor das duas chamadas de modelo deste módulo.
   *
   * `conferenciaVisual: false` desliga a conferência, e o comentário do
   * tipo diz para que serve: dry-run e medição de capacidade, que rodam
   * sobre dezenas de pautas reais e não devem gastar chamada cobrada.
   * A pergunta da cena nasceu sem interruptor, e o `dry-run-imagens` roda
   * sobre até 40 pautas: seriam 40 chamadas a mais, invisíveis, num script
   * feito justamente para medir sem custo.
   *
   * Reusar o interruptor que existe é melhor que inventar o segundo: quem
   * desliga as chamadas de modelo do visual desliga as duas, e não fica
   * uma ligada por descuido.
   */
  const cena = cenaPerguntada
    ? cenaPerguntada
    : conferir
    ? await cenaDaPauta(
        {
          titulo: pauta.titulo,
          resumo: pauta.resumo,
          categoria: pauta.categoria,
          pais: pauta.classificacao.pais,
        },
        { env, fetcher: opcoes.fetcher, recusasDoEditor: opcoes.recusasDoEditor },
      )
    : { consulta: "", objeto: "", falhou: true, motivo: "chamadas de modelo desligadas", custoUsd: 0 };
  const temaFixo = consultaConceitual(pauta.titulo, pauta.categoria, pauta.classificacao.pais);
  const especifica = cena.falhou ? temaFixo : cena.consulta;
  const contextoDaEditoria = contextoDaEditoriaPara(pauta.categoria, pauta.classificacao.pais);

  const degraus: Array<{ degrau: DegrauDaCena; consultas: string[]; openverse?: string; reuso?: boolean }> = [
    { degrau: "cena", consultas: [especifica] },
    {
      degrau: "cena_ampla",
      consultas: [cena.falhou ? "" : (cena.consultaAmpla ?? ""), cena.falhou ? "" : temaFixo],
      openverse: (!cena.falhou && cena.consultaAmpla) || especifica,
    },
    { degrau: "editoria", consultas: [contextoDaEditoria] },
    { degrau: "reuso", consultas: [especifica, contextoDaEditoria], reuso: true },
  ];

  const pedidas = new Set<string>();
  const vistas = new Set<string>();
  const recusasDaCena = [] as CandidatoRecusado[];
  let conferidasNaEscada = 0;

  for (const passo of degraus) {
    if (conferidasNaEscada >= TETO_DE_CONFERENCIAS_DA_ESCADA) break;
    const daCena: AssetVisual[] = [];
    const notas: string[] = [];

    for (const consulta of passo.consultas) {
      const chave = `${passo.reuso ? "reuso:" : ""}${consulta.trim().toLowerCase()}`;
      if (!consulta.trim() || pedidas.has(chave)) continue;
      pedidas.add(chave);
      try {
        /*
         * No degrau de reuso, a régua de 30 dias sai e só a do dia fica: a
         * foto que saiu hoje em outra pauta continua proibida, a que saiu na
         * semana passada passa a valer. É o último degrau de propósito:
         * repetir foto é melhor que pauta sem foto, e pior que foto nova.
         */
        const evitar = passo.reuso ? [...usadosAgora, ...vistas] : [...usadasAntes, ...usadosAgora, ...vistas];
        const fotos = await buscarFotosDeBanco(consulta, CANDIDATAS_DO_BANCO, { env, fetcher: opcoes.fetcher, evitar });
        notas.push(`"${consulta}": ${fotos.length}`);
        for (const foto of fotos) daCena.push(assetDoBanco(foto, entidadeDaCena, env));
      } catch (erro) {
        notas.push(`"${consulta}": falhou (${(erro as Error).message})`);
      }
    }

    if (passo.openverse) {
      try {
        const busca = await buscarNoOpenverse({ ...entidadeDaCena, nome: passo.openverse }, { env, fetcher: opcoes.fetcher });
        let convertidos = 0;
        for (const c of busca.candidatos) {
          const conversao = candidatoDoOpenverse(c, entidadeDaCena, env);
          if (!conversao.ok) continue;
          daCena.push({ ...conversao.asset, entityType: "conceptual", imageContextType: "conceptual" });
          convertidos += 1;
        }
        notas.push(`openverse "${passo.openverse}": ${convertidos}`);
      } catch (erro) {
        notas.push(`openverse falhou: ${(erro as Error).message}`);
      }
    }

    /*
     * Duas memórias, e as duas cortam aqui.
     *
     * `usadosAgora` impede a mesma foto em duas pautas do mesmo dia. `jaSaiu`
     * impede a mesma foto em dias diferentes, que é o caso que o banco
     * conceitual produzia sozinho, e só o degrau de reuso a dispensa.
     */
    const disponiveis = daCena.filter((a) => {
      const id = identidadeDaFoto(a.imageUrl);
      if (!id || vistas.has(id) || usadosAgora.has(a.imageUrl)) return false;
      if (!passo.reuso && jaSaiu(a.imageUrl)) return false;
      vistas.add(id);
      return true;
    });

    fontesConsultadas.push({
      fonte: "banco_conceitual",
      encontrados: disponiveis.length,
      nota:
        `${depoisDaEntidade ? "fallback de cena, " : ""}degrau ${passo.degrau}: ${notas.join(" ; ") || "nada a pedir"}` +
        (passo.degrau === "cena"
          ? cena.falhou
            ? ` (tema fixo: a cena não veio, ${cena.motivo})`
            : ` (cena da pauta "${cena.objeto}", custo ${cena.custoUsd.toFixed(5)} USD)`
          : ""),
    });

    const { aprovadas } = melhorPontuado(
      disponiveis,
      entidadeDaCena,
      pisoDeRelevancia(entidadeDaCena, config),
      recusasDaCena,
      config.larguraMinima,
      { titulo: pauta.titulo, resumo: pauta.resumo, atores: pauta.classificacao.atores },
    );
    const teto = Math.min(TETO_DE_CONFERENCIAS, TETO_DE_CONFERENCIAS_DA_ESCADA - conferidasNaEscada);
    conferidasNaEscada += conferir ? Math.min(aprovadas.length, teto) : 0;
    const escolhido = await primeiraAprovada(
      aprovadas.map((x) => x.item),
      conferir,
      pauta,
      recusasDaCena,
      teto,
      "fundo",
      "cena",
    );

    if (escolhido) {
      anotarRecusas(recusasDaCena);
      usadosAgora.add(escolhido.imageUrl);
      // Foto de banco não vai para a biblioteca: ela indexa por entidade, e esta foto é de conceito.
      return aprovarDaCena(escolhido, passo.degrau);
    }
  }

  anotarRecusas(recusasDaCena);
  return semFotoDaPauta(
    entidade,
    recusados.length > 0 ? MOTIVOS_DE_RECUSA.RELEVANCIA_BAIXA : MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE
  );
}

/**
 * A manchete nomeia a pessoa? Basta o sobrenome ou qualquer parte do nome com
 * mais de três letras ("Trump", "Altman"), sem acento nem caixa.
 */
function pessoaNaManchete(entidade: EntidadeVisual, titulo: string): boolean {
  const manchete = ` ${normalizarEntidade(titulo)} `;
  return normalizarEntidade(entidade.nome)
    .split(" ")
    .filter((parte) => parte.length > 3)
    .some((parte) => manchete.includes(` ${parte} `));
}

/**
 * O contexto de uma editoria inteira, para o degrau em que a pauta já não tem
 * cena própria que renda.
 *
 * Lugar e objeto, nunca gente nem letreiro: as mesmas regras da cena. Cada
 * consulta foi escolhida para servir a QUALQUER pauta da editoria sem afirmar
 * nada que a pauta não diz. Pauta do Brasil ganha cena do Brasil, pela régua de
 * país.
 */
const CONTEXTO_DA_EDITORIA: Record<string, string> = {
  economia: "new york financial district buildings",
  trabalho: "modern office interior empty desks",
  tecnologia: "data center server racks",
  custo_de_vida: "american suburban neighborhood houses",
  politica: "united states capitol building washington",
  seguranca: "american city street night",
  cultura: "american city street daytime",
  brasil: "brasilia national congress building",
};

export function contextoDaEditoriaPara(eixo: string, pais?: string): string {
  if (/brasil/i.test(pais ?? "") && eixo !== "brasil") return "brazil city skyline";
  return CONTEXTO_DA_EDITORIA[eixo] ?? "american flag waving blue sky";
}

function assetDoBanco(
  foto: Awaited<ReturnType<typeof buscarFotosDeBanco>>[number],
  entidade: EntidadeVisual,
  env: Record<string, string | undefined>,
): AssetVisual {
  const licenca = foto.credito.provedor === "pexels" ? "Pexels License" : "Unsplash License";
  const veredicto = avaliarLicenca(licenca, env);
  const agora = new Date().toISOString();
  return {
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
    license: licenca,
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
  };
}

/**
 * Quantas conferências a escada inteira pode abrir.
 *
 * Quatro por degrau e doze no total: o pior caso de uma pauta que desce os
 * quatro degraus custa doze chamadas de visão, e só acontece quando nada
 * antes serviu. O caso comum para no primeiro degrau, como antes.
 */
const TETO_DE_CONFERENCIAS_DA_ESCADA = 12;

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
/*
 * ATUALIZADO em 06/10/2026: seis, e numa chamada só por provedor. O custo por
 * candidata deixou de existir quando `buscarFotosDeBanco` passou a usar a
 * resposta inteira da busca, e três candidatas recusadas eram exatamente o
 * perfil de toda pauta do evergreen que ficava sem foto.
 */
const CANDIDATAS_DO_BANCO = 6;

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
  uso: "fundo" | "bolha" = "fundo",
  papel: "assunto" | "cena" = "assunto",
): Promise<T | null> {
  if (candidatas.length === 0) return null;
  if (!conferir) return candidatas[0] ?? null;

  const contexto = { titulo: pauta.titulo, resumo: pauta.resumo, eixo: pauta.categoria, uso, papel };

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

/**
 * Quantas imagens a busca extra da bolha abre na conferência visual.
 *
 * O dobro do teto da vice comum, e só quando é a vez da bolha: é aqui que a
 * alternância deixa de ser acaso e vira alvo (pedido do dono, 06/10/2026).
 */
const TETO_DE_CONFERENCIAS_DA_BUSCA_EXTRA = 4;

/** Quantos arquivos o Commons devolve na busca extra, contra 12 da busca comum. */
const LIMITE_DO_COMMONS_NA_BUSCA_EXTRA = 30;

export type SegundaFotoBuscada = { asset: AssetVisual | null; nota: string };

/**
 * Mais uma tentativa de achar a foto do círculo, quando é a vez da bolha.
 *
 * Em 06/10/2026 só 1 das 12 últimas capas tinha bolha, e parte da causa está
 * neste arquivo: a vice só existia no caminho das fontes externas. Quando a
 * foto de fundo saía do acervo ou da biblioteca, a resolução terminava ali e
 * ninguém procurava segunda foto; e no caminho externo a vice tinha duas
 * conferências e doze arquivos do Commons.
 *
 * A régua NÃO muda, e esse é o ponto. A busca é mais funda, não mais frouxa:
 *
 *   - só para pauta com entidade nomeada (a bolha mostra quem a pauta cita);
 *   - o acervo primeiro, pelo assunto da entidade, que é identidade por
 *     construção e foi conferido na entrada;
 *   - depois biblioteca, Commons (30 arquivos) e Openverse, somados, pelas
 *     MESMAS barreiras da vice: resolução, tempo, figura não central, piso de
 *     relevância e o piso de identidade, nunca banco conceitual;
 *   - e a conferência visual abrindo até quatro delas. Sem conferente (sem
 *     chave), nada é aprovado: falha de conferência é recusa.
 *
 * Nunca devolve a foto de fundo nem foto já usada hoje ou na janela.
 */
export async function buscarSegundaFoto(
  pauta: PautaParaImagem,
  principal: Pick<AssetVisual, "imageUrl">,
  entidade: EntidadeVisual | null,
  opcoes: OpcoesDeResolucao = {},
): Promise<SegundaFotoBuscada> {
  if (!entidade || entidade.tipo === "conceptual") {
    return { asset: null, nota: "pauta sem entidade nomeada: a bolha mostra quem a pauta cita, e aqui não há quem" };
  }

  const env = opcoes.env ?? process.env;
  const config = carregarConfigDeImagem(env);
  const usadosAgora = opcoes.jaUsadosNestaEdicao ?? new Set<string>();
  const usadasAntes = new Set(
    [...(opcoes.jaUsadasRecentemente ?? [])].map((u) => identidadeDaFoto(u)).filter(Boolean),
  );
  const daFotoDeFundo = identidadeDaFoto(principal.imageUrl);
  const livre = (url: string) =>
    Boolean(url) &&
    identidadeDaFoto(url) !== daFotoDeFundo &&
    !usadosAgora.has(url) &&
    !usadasAntes.has(identidadeDaFoto(url));

  const notas: string[] = [];

  // 1. O acervo, pelo assunto da entidade.
  if (opcoes.acervo && opcoes.acervo.modo === "enforce") {
    try {
      const imagens = await opcoes.acervo.porAssunto(assuntosDaEntidade(entidade));
      const livres = imagens.filter((i) => livre(i.urlPublica));
      notas.push(`acervo: ${imagens.length} da entidade, ${livres.length} livre(s)`);
      if (livres[0]) return { asset: assetDoAcervo(livres[0], entidade), nota: notas.join(" ; ") };
    } catch (erro) {
      notas.push(`acervo indisponível: ${(erro as Error).message}`);
    }
  }

  const conferir = conferenteDe(opcoes);
  if (!conferir) {
    notas.push("sem conferência visual: a busca externa não aprova nada sem alguém olhar");
    return { asset: null, nota: notas.join(" ; ") };
  }

  // 2. Biblioteca, Commons e Openverse, somados antes de pontuar.
  const candidatos: AssetVisual[] = [];
  const biblioteca = opcoes.biblioteca ?? (opcoes.client ? criarBiblioteca(opcoes.client) : null);
  if (biblioteca) {
    try {
      const guardados = (await biblioteca.daEntidade(entidade.normalizado)).filter(
        (g) => !usadoRecentemente(g, config.janelaEmDias),
      );
      candidatos.push(...guardados);
      notas.push(`biblioteca: ${guardados.length}`);
    } catch (erro) {
      notas.push(`biblioteca indisponível: ${(erro as Error).message}`);
    }
  }
  try {
    const busca = await buscarNoCommons(entidade, {
      env,
      fetcher: opcoes.fetcher,
      limite: LIMITE_DO_COMMONS_NA_BUSCA_EXTRA,
    });
    let convertidos = 0;
    for (const c of busca.candidatos) {
      const conversao = candidatoParaAsset(c, entidade, env);
      if (conversao.ok) {
        candidatos.push(conversao.asset);
        convertidos += 1;
      }
    }
    notas.push(`commons: ${convertidos}`);
  } catch (erro) {
    notas.push(`commons falhou: ${(erro as Error).message}`);
  }
  try {
    const busca = await buscarNoOpenverse(entidade, { env, fetcher: opcoes.fetcher });
    let convertidos = 0;
    for (const c of busca.candidatos) {
      const conversao = candidatoDoOpenverse(c, entidade, env);
      if (conversao.ok) {
        candidatos.push(conversao.asset);
        convertidos += 1;
      }
    }
    notas.push(`openverse: ${convertidos}`);
  } catch (erro) {
    notas.push(`openverse falhou: ${(erro as Error).message}`);
  }

  const vistos = new Set<string>();
  const disponiveis = candidatos.filter((c) => {
    const id = identidadeDaFoto(c.imageUrl);
    if (!livre(c.imageUrl) || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });

  const recusados: CandidatoRecusado[] = [];
  const { aprovadas } = melhorPontuado(
    disponiveis,
    entidade,
    pisoDeRelevancia(entidade, config),
    recusados,
    config.larguraMinima,
    { titulo: pauta.titulo, resumo: pauta.resumo, atores: pauta.classificacao.atores },
  );
  const comIdentidade = escolherVice(aprovadas, { imageUrl: principal.imageUrl } as AssetVisual);
  notas.push(`${disponiveis.length} candidata(s), ${comIdentidade.length} com identidade`);

  const vice = await primeiraAprovada(
    comIdentidade.map((x) => x.item),
    conferir,
    pauta,
    recusados,
    TETO_DE_CONFERENCIAS_DA_BUSCA_EXTRA,
    "bolha",
  );
  if (!vice) {
    const conferidas = Math.min(comIdentidade.length, TETO_DE_CONFERENCIAS_DA_BUSCA_EXTRA);
    notas.push(`${conferidas} conferida(s), nenhuma aprovada`);
  }
  return { asset: vice, nota: notas.join(" ; ") };
}
