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
import { buscarEmFonteOficial } from "./fonte-oficial";
import { carregarConfigDeImagem, pisoDeRelevancia, pontuarImagem } from "./relevancia";
import { avaliarLicenca, montarAtribuicao } from "./licencas";
import { bancoConfigurado, buscarFotoDeBanco } from "../prompt-system/stock";
import { consultaConceitual } from "./conceitual";
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
  /** Não grava nada. O dry-run usa isto. */
  somenteLeitura?: boolean;
};

export async function resolveVisualAsset(
  pauta: PautaParaImagem,
  opcoes: OpcoesDeResolucao = {}
): Promise<ResultadoVisual> {
  const env = opcoes.env ?? process.env;
  const config = carregarConfigDeImagem(env);
  const biblioteca = opcoes.biblioteca ?? (opcoes.client ? criarBiblioteca(opcoes.client) : null);
  const usadosAgora = opcoes.jaUsadosNestaEdicao ?? new Set<string>();

  const fontesConsultadas: ResultadoVisual["fontesConsultadas"] = [];
  const recusados: CandidatoRecusado[] = [];

  const semImagem = (entidade: EntidadeVisual | null, motivo: ResultadoVisual["motivo"]): ResultadoVisual => ({
    storyId: pauta.storyId,
    entidade,
    asset: null,
    status: "NO_VALID_IMAGE",
    motivo,
    fontesConsultadas,
    recusados,
    legenda: "",
  });

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
    return semImagem(null, MOTIVOS_DE_RECUSA.ENTIDADE_AMBIGUA);
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
  const aprovar = (asset: AssetVisual, id?: string): ResultadoVisual => ({
    storyId: pauta.storyId,
    entidade,
    asset: {
      ...asset,
      id: id ?? asset.id,
      entityConfidence: entidade.confianca,
      entityEvidence: entidade.evidencias,
    },
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

      const melhor = melhorPontuado(disponiveis, entidade, piso, recusados, config.larguraMinima, {
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

  // 4. Fonte oficial e press kit, quando o Commons não resolveu.
  if (novos.length === 0 && entidade.tipo !== "conceptual") {
    const oficial = await buscarEmFonteOficial(entidade, { env, fetcher: opcoes.fetcher, comPressKit: true });
    fontesConsultadas.push({
      fonte: "fonte_oficial",
      encontrados: oficial.assets.length,
      nota: oficial.notas.join(" ; ") || "sem site oficial declarado",
    });
    novos.push(...oficial.assets);
  }

  // 5. Banco conceitual, e só quando a pauta não é sobre gente.
  if (novos.length === 0) {
    if (ehPessoa(entidade.tipo)) {
      fontesConsultadas.push({
        fonte: "banco_conceitual",
        encontrados: 0,
        nota: "bloqueado por regra: pauta sobre pessoa não aceita foto conceitual no lugar",
      });
      return semImagem(entidade, MOTIVOS_DE_RECUSA.SEM_IMAGEM_DA_ENTIDADE);
    }

    if (!bancoConfigurado(env)) {
      fontesConsultadas.push({ fonte: "banco_conceitual", encontrados: 0, nota: "sem chave configurada" });
      return semImagem(entidade, MOTIVOS_DE_RECUSA.SEM_IMAGEM_VALIDA);
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
      const consulta = consultaConceitual(pauta.titulo, pauta.categoria, pauta.classificacao.pais);
      const foto = await buscarFotoDeBanco(consulta, { env, fetcher: opcoes.fetcher });
      fontesConsultadas.push({
        fonte: "banco_conceitual",
        encontrados: foto ? 1 : 0,
        nota: `consulta "${consulta}"`,
      });

      if (foto) {
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
  const disponiveis = novos.filter((a) => !usadosAgora.has(a.imageUrl));
  const escolhido = melhorPontuado(disponiveis, entidade, piso, recusados, config.larguraMinima, {
    titulo: pauta.titulo,
    resumo: pauta.resumo,
    atores: pauta.classificacao.atores,
  });

  if (!escolhido) {
    return semImagem(
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
        return aprovar(escolhido, guardado.id);
      }
    } catch (erro) {
      fontesConsultadas.push({
        fonte: "biblioteca_interna",
        encontrados: 0,
        nota: `não foi possível guardar: ${(erro as Error).message}`,
      });
    }
  }

  return aprovar(escolhido);
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
): T | null {
  let melhor: T | null = null;
  let melhorNota = -1;

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

    if (nota.total > melhorNota) {
      melhorNota = nota.total;
      melhor = c;
    }
  }

  return melhor;
}
