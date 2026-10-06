import type { AssetVisual, CandidatoRecusado, EntidadeVisual } from "../tipos";
import { MOTIVOS_DE_RECUSA, ehPessoa, normalizarEntidade } from "../tipos";
import { avaliarLicenca } from "../licencas";
import { identidadeDaFoto } from "../../prompt-system/stock";
import { creditoCurto } from "./credito";
import { legendaCita, protagonistaDaLegenda } from "./identidade";
import { BANCOS_OFICIAIS } from "./registro";
import type { DefinicaoDoBanco, FotoDoBanco, PaisDoBanco } from "./tipos";

export { apelidoSemOutroSobrenome, legendaCita, protagonistaDaLegenda, semTrechosDeAssunto } from "./identidade";

/**
 * Os bancos de imagem oficiais, consultados pela ENTIDADE (06/10/2026).
 *
 * O pedido do dono: a linha editorial passou a ter política brasileira (ano de
 * eleição) e gente conhecida, e o Commons tem do Flávio Bolsonaro a foto de
 * 2019, quando tem. A Agência Brasil, a Câmara, o Senado e o Planalto
 * fotografam essas pessoas toda semana, com licença que permite uso comercial
 * com crédito, e é deles que a foto atual sai. Do lado americano, a Casa Branca
 * e os órgãos federais publicam em domínio público.
 *
 * O que este módulo faz, e o que NÃO faz:
 *
 *   - devolve candidatas como `AssetVisual`, com licença conferida pela MESMA
 *     régua do Commons (`avaliarLicenca`: NC e ND recusadas), crédito curto no
 *     formato do dono e tudo o que a origem disse em `metadata`;
 *   - não decide nada: a pontuação, o piso de identidade, a régua de país, a
 *     temporalidade, a conferência visual e a memória de 30 dias são as do
 *     resolvedor, as mesmas de qualquer foto;
 *   - nunca derruba a pauta: banco fora do ar, recusa, resposta ilegível ou
 *     falta de chave viram nota em `fontesConsultadas`, e a resolução segue
 *     para o Commons como antes.
 */

/** Quantas fotos cada banco entrega por busca. A conferência abre no máximo quatro por pauta. */
export const FOTOS_POR_BANCO = 8;

/**
 * Quem pode ganhar foto de banco oficial.
 *
 * Pessoa e instituição pública: é o que esses bancos fotografam. Empresa,
 * lugar e acontecimento ficam fora, porque o banco do governo não é a fonte
 * deles, e a busca por "Nvidia" na Agência Brasil devolveria a reunião de um
 * ministro com a Nvidia, que é foto do ministro.
 */
export function entidadeElegivel(entidade: EntidadeVisual | null): boolean {
  if (!entidade) return false;
  return ehPessoa(entidade.tipo) || entidade.tipo === "institution" || entidade.tipo === "government_agency";
}

/**
 * Os nomes pelos quais a pauta chama a entidade.
 *
 * O Wikidata devolve "Luiz Inácio Lula da Silva"; a pauta e a legenda da
 * Agência Brasil dizem "Lula" ou "presidente Lula". O ator da pauta que divide
 * uma palavra de quatro letras ou mais com o nome resolvido é o mesmo nome,
 * escrito como a imprensa escreve, e é ele que vai para a busca e para a prova
 * de identidade na legenda.
 */
export function nomesDaEntidade(entidade: EntidadeVisual, atores: string[]): string[] {
  const nome = entidade.nome.trim();
  const partes = new Set(normalizarEntidade(nome).split(" ").filter((p) => p.length >= 4));
  const apelidos = atores
    .map((a) => a.trim())
    .filter((a) => a.length >= 4 && normalizarEntidade(a) !== normalizarEntidade(nome))
    .filter((a) => {
      const pa = normalizarEntidade(a).split(" ").filter((p) => p.length >= 4);
      return pa.length > 0 && pa.every((p) => partes.has(p));
    });
  return [nome, ...new Set(apelidos)];
}

/**
 * O que perguntar ao banco.
 *
 * O nome curto que a imprensa usa acha mais: "Lula" no banco da Agência Brasil
 * devolve o presidente em centenas de legendas, e o nome completo do Wikidata
 * acha menos e mais antigo. Nome de pessoa com até três palavras vai como está;
 * acima disso, o apelido da pauta, se houver.
 */
export function consultaParaOBanco(entidade: EntidadeVisual, nomes: string[]): string {
  const completo = entidade.nome.trim();
  if (!ehPessoa(entidade.tipo)) return completo;
  const apelidosComDuas = nomes.slice(1).filter((n) => n.split(/\s+/).length >= 2);
  if (apelidosComDuas[0]) return apelidosComDuas[0];
  if (completo.split(/\s+/).length <= 3) return completo;
  return nomes[1] ?? completo;
}

export type ConversaoDoBanco = { ok: true; asset: AssetVisual } | { ok: false; motivo: string };

export function fotoParaAsset(
  foto: FotoDoBanco,
  banco: Pick<DefinicaoDoBanco, "id" | "nome" | "pais" | "hostsDeImagem">,
  entidade: EntidadeVisual,
  nomes: string[],
  env: Record<string, string | undefined> = process.env,
): ConversaoDoBanco {
  const veredicto = avaliarLicenca(foto.licenca, env);
  if (!veredicto.aceita) return { ok: false, motivo: `licença recusada: ${veredicto.motivo}` };

  /*
   * Host fora da lista do `next/image` derruba a página inteira do portal, e
   * não só a capa (incidente do Commons, fase 2). O teste de hosts liga as
   * duas listas; esta trava é a rede para o banco que mudar de CDN.
   */
  let host = "";
  try {
    host = new URL(foto.imageUrl).hostname;
  } catch {
    return { ok: false, motivo: "endereço da imagem inválido" };
  }
  if (!banco.hostsDeImagem.includes(host)) return { ok: false, motivo: `host ${host} fora da lista de imagens do portal` };
  if (!foto.paginaUrl) return { ok: false, motivo: "sem página da foto, que é onde a licença está provada" };

  const credito = creditoCurto(banco.nome, foto.autor);
  // Citar e ser a protagonista: as duas, e é isso que vale como prova de identidade.
  const cita = legendaCita(foto, nomes) && protagonistaDaLegenda(foto, nomes);
  const agora = new Date().toISOString();

  return {
    ok: true,
    asset: {
      entityName: entidade.nome,
      entityNormalized: entidade.normalizado,
      entityType: entidade.tipo,
      source: "banco_oficial",
      sourceAssetId: `${banco.id}:${foto.id}`,
      imageUrl: foto.imageUrl,
      sourcePageUrl: foto.paginaUrl,
      author: foto.autor || banco.nome,
      license: veredicto.nome,
      licenseUrl: foto.licencaUrl || foto.paginaUrl,
      attribution: credito,
      rightsStatement: `${veredicto.motivo}; declarada pelo banco: ${foto.licenca}`,
      rightsStatus: "verified",
      rightsCheckedAt: agora,
      sourceLastCheckedAt: agora,
      width: foto.largura,
      height: foto.altura,
      mimeType: "image/jpeg",
      storagePath: null,
      perceptualHash: null,
      imageRelevanceScore: 0,
      imageContextType: ehPessoa(entidade.tipo) ? "entity_portrait" : "institution",
      /*
       * A metadata carrega o que as barreiras leem (`data`, `descricao`,
       * `titulo`, `categorias`) e o registro do que a origem disse.
       *
       * `categorias` ganha o nome resolvido da entidade SÓ quando a legenda do
       * banco a cita por um dos nomes dela ("Lula" para "Luiz Inácio Lula da
       * Silva"). É a prova de identidade que a pontuação procura no texto, e
       * ela vem da legenda, nunca da busca: o banco devolve para "Lula" a foto
       * de um ministro que "se reuniu com Lula", e essa foto não ganha o nome.
       */
      metadata: {
        via: "bancos_oficiais",
        provedor: banco.id,
        banco: banco.id,
        banco_nome: banco.nome,
        pais_do_banco: banco.pais,
        autor: foto.autor,
        licenca_declarada: foto.licenca,
        pagina: foto.paginaUrl,
        credito_curto: credito,
        data: foto.data ?? "",
        titulo: foto.titulo,
        descricao: foto.descricao,
        categorias: cita ? `retrata ${entidade.nome}` : "",
        legenda_cita_a_entidade: cita,
      },
    },
  };
}

export type BuscaNosBancos = {
  assets: AssetVisual[];
  recusados: CandidatoRecusado[];
  notas: string[];
};

/**
 * Os bancos na ordem em que a pauta pede.
 *
 * O país da pauta vem primeiro, e o outro também entra: o Lula da pauta
 * americana sobre a reunião com Trump é foto da Agência Brasil, e o Trump da
 * pauta brasileira é foto da Casa Branca. Quem decide é a legenda, não o país.
 */
export function bancosNaOrdem(
  pais: string | undefined,
  bancos: DefinicaoDoBanco[] = BANCOS_OFICIAIS,
): DefinicaoDoBanco[] {
  const daPauta = paisDaPauta(pais);
  if (!daPauta) return [...bancos];
  return [...bancos.filter((b) => b.pais === daPauta), ...bancos.filter((b) => b.pais !== daPauta)];
}

export async function buscarNosBancosOficiais(
  entidade: EntidadeVisual,
  contexto: { atores: string[]; pais?: string },
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    bancos?: DefinicaoDoBanco[];
    quantosPorBanco?: number;
    espaco?: number;
  } = {},
): Promise<BuscaNosBancos> {
  const env = opcoes.env ?? process.env;
  if (!entidadeElegivel(entidade)) {
    return { assets: [], recusados: [], notas: [`${entidade.tipo} não é pessoa nem instituição pública`] };
  }

  const nomes = nomesDaEntidade(entidade, contexto.atores);
  const consulta = consultaParaOBanco(entidade, nomes);
  const bancos = bancosNaOrdem(contexto.pais, opcoes.bancos);

  /*
   * Os bancos são consultados em paralelo, porque são hosts diferentes e a
   * fila da rede já espaça os pedidos ao mesmo host. Um banco lento custa o
   * prazo dele, não a soma de todos.
   */
  const respostas = await Promise.all(
    bancos.map(async (banco) => {
      if (banco.chave && !env[banco.chave]) {
        return { banco, fotos: [] as FotoDoBanco[], nota: `${banco.nome}: sem ${banco.chave}, pulado` };
      }
      try {
        const r = await banco.buscar(consulta, {
          env,
          fetcher: opcoes.fetcher,
          quantos: opcoes.quantosPorBanco ?? FOTOS_POR_BANCO,
          espaco: opcoes.espaco,
        });
        return { banco, fotos: r.fotos, nota: `${banco.nome}: ${r.nota}` };
      } catch (erro) {
        return { banco, fotos: [] as FotoDoBanco[], nota: `${banco.nome}: falhou (${(erro as Error).message})` };
      }
    }),
  );

  const assets: AssetVisual[] = [];
  const recusados: CandidatoRecusado[] = [];
  const vistas = new Set<string>();
  const notas: string[] = [`busca "${consulta}"`];

  for (const { banco, fotos, nota } of respostas) {
    notas.push(nota);
    for (const foto of fotos) {
      const id = identidadeDaFoto(foto.imageUrl);
      if (!id || vistas.has(id)) continue;
      vistas.add(id);
      const conversao = fotoParaAsset(foto, banco, entidade, nomes, env);
      if (!conversao.ok) {
        recusados.push({
          origem: "banco_oficial",
          identificacao: `${banco.id}:${foto.id}`,
          motivo: conversao.motivo.startsWith("licença")
            ? MOTIVOS_DE_RECUSA.LICENCA_DESCONHECIDA
            : MOTIVOS_DE_RECUSA.FONTE_NAO_PERMITIDA,
          detalhe: conversao.motivo,
        });
        continue;
      }
      /*
       * Pessoa: a foto de banco que não a tem como protagonista da legenda
       * sai aqui, e não só da frente da fila. Pela pontuação ela ainda
       * passaria (o sobrenome solto na legenda soma 27 de entidade, e o resto
       * fecha os 70 do piso de pessoa), e foi assim que o senador da
       * entrevista "sobre Moraes" virou a foto do Moraes no primeiro replay.
       */
      if (ehPessoa(entidade.tipo) && conversao.asset.metadata.legenda_cita_a_entidade !== true) {
        recusados.push({
          origem: "banco_oficial",
          identificacao: `${banco.id}:${foto.id}`,
          motivo: MOTIVOS_DE_RECUSA.FIGURA_NAO_CENTRAL,
          detalhe: `a legenda do banco não tem ${entidade.nome} como a pessoa da foto: "${(foto.descricao || foto.titulo).slice(0, 120)}"`,
        });
        continue;
      }
      assets.push(conversao.asset);
    }
  }

  return { assets, recusados, notas };
}

/**
 * O contexto de governo de uma pauta, para a escada da cena (06/10/2026).
 *
 * Quando a pauta é de política ou de governo, o banco oficial tem o lugar onde
 * aquilo acontece: a fachada do Congresso, o Planalto, a Casa Branca. Entra no
 * degrau `editoria`, ao lado da busca de sempre no banco de imagem, e passa
 * pelas mesmas regras da cena: a conferência visual recusa pessoa
 * identificável e texto como assunto, então a foto do plenário cheio cai e a
 * da fachada fica.
 */
const CENA_DE_GOVERNO: Record<PaisDoBanco, Record<string, string>> = {
  BR: {
    politica: "fachada do Congresso Nacional",
    brasil: "fachada do Congresso Nacional",
    economia: "Esplanada dos Ministérios",
  },
  US: {
    politica: "White House exterior",
    economia: "Federal Reserve building",
  },
};

export function paisDaPauta(pais: string | undefined): PaisDoBanco | null {
  const p = (pais ?? "").trim().toLowerCase();
  if (/^brasil$|^brazil$|^br$/.test(p)) return "BR";
  if (/^(eua|estados unidos|us|usa|united states)$/.test(p)) return "US";
  return null;
}

export function cenaDeGovernoPara(categoria: string, pais: string | undefined): { consulta: string; pais: PaisDoBanco } | null {
  const doPais = paisDaPauta(pais) ?? (categoria === "brasil" ? "BR" : null);
  if (!doPais) return null;
  const consulta = CENA_DE_GOVERNO[doPais][categoria];
  return consulta ? { consulta, pais: doPais } : null;
}

/**
 * A busca de CENA nos bancos de um país. Sem entidade: a foto é de contexto, e
 * vai pontuada contra a entidade conceitual da pauta, como o Openverse da
 * escada.
 */
export async function buscarCenaNosBancosOficiais(
  consulta: string,
  pais: PaisDoBanco,
  entidadeDaCena: EntidadeVisual,
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    bancos?: DefinicaoDoBanco[];
    quantosPorBanco?: number;
    espaco?: number;
  } = {},
): Promise<BuscaNosBancos> {
  const env = opcoes.env ?? process.env;
  const bancos = (opcoes.bancos ?? BANCOS_OFICIAIS).filter((b) => b.pais === pais && !(b.chave && !env[b.chave]));
  const assets: AssetVisual[] = [];
  const recusados: CandidatoRecusado[] = [];
  const notas: string[] = [];
  for (const banco of bancos) {
    try {
      const r = await banco.buscar(consulta, {
        env,
        fetcher: opcoes.fetcher,
        quantos: opcoes.quantosPorBanco ?? 6,
        espaco: opcoes.espaco,
      });
      notas.push(`${banco.nome} "${consulta}": ${r.fotos.length}`);
      for (const foto of r.fotos) {
        const conversao = fotoParaAsset(foto, banco, entidadeDaCena, [], env);
        if (!conversao.ok) continue;
        assets.push({ ...conversao.asset, entityType: "conceptual", imageContextType: "conceptual" });
      }
    } catch (erro) {
      notas.push(`${banco.nome} falhou (${(erro as Error).message})`);
    }
  }
  return { assets, recusados, notas };
}

/**
 * A ordem em que as aprovadas são conferidas, quando há foto de banco oficial.
 *
 * A pontuação diz quem PASSA; esta ordem diz quem é aberto primeiro. A foto de
 * banco oficial que a legenda prova ser da entidade vai à frente, da mais
 * recente para a mais antiga (a pessoa como ela está hoje, e não a foto de
 * 2019 que o Commons tem), e depois a fila de sempre, pela nota. No máximo
 * `teto` vão à frente, para a fila de sempre continuar tendo vez dentro do
 * teto de conferências quando as oficiais forem todas recusadas.
 */
export function oficiaisPrimeiro<T extends { item: AssetVisual; nota: { total: number } }>(
  aprovadas: T[],
  teto = 3,
): T[] {
  const oficiais = aprovadas
    .filter((a) => a.item.source === "banco_oficial" && a.item.metadata?.legenda_cita_a_entidade === true)
    .sort((a, b) => {
      const da = String(a.item.metadata?.data ?? "");
      const db = String(b.item.metadata?.data ?? "");
      if (da !== db) return db.localeCompare(da);
      return b.nota.total - a.nota.total;
    })
    .slice(0, teto);
  const resto = aprovadas.filter((a) => !oficiais.includes(a));
  return [...oficiais, ...resto];
}
