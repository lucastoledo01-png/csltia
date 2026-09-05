import { bancoConfigurado, buscarFotoDeBanco, consultaDaNoticia } from "../prompt-system/stock";
import type { CreditoDaFoto } from "../prompt-system/stock";
import { imagemJaUsada, identidadeDeImagem } from "./repeticao";
import type { RegistroHistorico } from "./history";
import { gerarStoryId } from "./history";

/**
 * Qual foto ilustra qual pauta.
 *
 * Aqui moravam três bugs que produziam a mesma cena, uma pauta ilustrada com
 * outra coisa: foto sorteada por hash do título, foto endereçada por posição
 * num array que um filtro deslocava, e capa herdada da execução anterior
 * porque a coluna não recebia valor.
 *
 * O que este módulo garante:
 *
 *   - a chave é a identidade da pauta, nunca a posição;
 *   - foto vem do assunto da pauta, buscada no banco de imagem;
 *   - a do feed é reserva, e só quando existe;
 *   - foto usada nos últimos dias não volta;
 *   - sem foto adequada, a pauta sai sem foto.
 *
 * A última regra é a que mais importa. Ilustração aleatória em notícia de
 * imigração não é decoração: é uma informação errada ao lado de uma certa.
 */

export type OrigemDaImagem = "banco_de_imagem" | "feed_da_fonte" | "nenhuma";

export type EscolhaDeImagem = {
  storyId: string;
  titulo: string;
  imagemUrl: string;
  imageSource: OrigemDaImagem;
  /** Identidade da foto: host mais caminho, sem os parâmetros de tamanho. */
  imagemCanonica: string;
  credito: CreditoDaFoto | null;
  motivo: string;
  /** Quando a foto já apareceu antes e por isso foi descartada. */
  descartadaPorRepeticao: string | null;
};

export type PautaComImagem = {
  titulo: string;
  categoria: string;
  sourceUrl: string;
  /** Imagem que veio no feed, quando veio. */
  imagemDoFeed: string;
};

export type OpcoesDeImagem = {
  historico?: RegistroHistorico[];
  janelaEmDias?: number;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Injetável para teste. Por padrão, o banco de imagem de verdade. */
  buscar?: typeof buscarFotoDeBanco;
};

export async function resolverImagens(
  pautas: PautaComImagem[],
  opcoes: OpcoesDeImagem = {}
): Promise<Map<string, EscolhaDeImagem>> {
  const historico = opcoes.historico ?? [];
  const janela = opcoes.janelaEmDias ?? 30;
  const env = opcoes.env ?? process.env;
  const buscar = opcoes.buscar ?? buscarFotoDeBanco;
  const usarBanco = bancoConfigurado(env);

  const escolhas = new Map<string, EscolhaDeImagem>();
  // Duas pautas do mesmo dia não podem receber a mesma foto: o banco devolve
  // a mesma imagem para consultas vizinhas, e a edição sairia com a página
  // repetida.
  const usadasNestaEdicao = new Set<string>();

  for (const pauta of pautas) {
    const storyId = gerarStoryId({ url: pauta.sourceUrl || undefined, titulo: pauta.titulo });
    let escolha: EscolhaDeImagem = {
      storyId,
      titulo: pauta.titulo,
      imagemUrl: "",
      imageSource: "nenhuma",
      imagemCanonica: "",
      credito: null,
      motivo: "banco de imagem não configurado e feed sem imagem",
      descartadaPorRepeticao: null,
    };

    if (usarBanco) {
      try {
        const consulta = consultaDaNoticia(pauta.titulo, pauta.categoria);
        const foto = await buscar(consulta, { env, fetcher: opcoes.fetcher });

        if (foto) {
          const canonica = identidadeDeImagem(foto.imagemUrl);
          const jaSaiu = imagemJaUsada(foto.imagemUrl, historico, janela);
          const nestaEdicao = usadasNestaEdicao.has(canonica);

          if (jaSaiu || nestaEdicao) {
            escolha = {
              ...escolha,
              motivo: `foto do banco descartada, já usada${jaSaiu ? "" : " nesta edição"}`,
              descartadaPorRepeticao: jaSaiu
                ? `saiu em "${jaSaiu.titulo}" (${jaSaiu.publicadoEm?.slice(0, 10) ?? "?"})`
                : "outra pauta desta mesma edição",
            };
          } else {
            escolha = {
              storyId,
              titulo: pauta.titulo,
              imagemUrl: foto.imagemUrl,
              imageSource: "banco_de_imagem",
              imagemCanonica: canonica,
              credito: foto.credito,
              motivo: `busca no banco pelo assunto: "${consulta}"`,
              descartadaPorRepeticao: null,
            };
          }
        } else {
          escolha = { ...escolha, motivo: "banco de imagem não encontrou foto para o assunto" };
        }
      } catch (erro) {
        // Banco fora do ar não pode custar a edição, e também não pode virar
        // foto errada: a pauta segue sem imagem.
        escolha = { ...escolha, motivo: `banco de imagem falhou: ${(erro as Error).message}` };
      }
    }

    if (escolha.imageSource === "nenhuma" && pauta.imagemDoFeed) {
      const canonica = identidadeDeImagem(pauta.imagemDoFeed);
      const jaSaiu = imagemJaUsada(pauta.imagemDoFeed, historico, janela);

      if (!jaSaiu && !usadasNestaEdicao.has(canonica)) {
        escolha = {
          storyId,
          titulo: pauta.titulo,
          imagemUrl: pauta.imagemDoFeed,
          imageSource: "feed_da_fonte",
          imagemCanonica: canonica,
          credito: null,
          motivo: "reserva: imagem que a própria fonte publicou com a matéria",
          descartadaPorRepeticao: escolha.descartadaPorRepeticao,
        };
      }
    }

    if (escolha.imagemCanonica) usadasNestaEdicao.add(escolha.imagemCanonica);
    escolhas.set(storyId, escolha);
  }

  return escolhas;
}

/** O que a renderização espera: identidade da pauta para URL. */
export function paraRenderizacao(escolhas: Map<string, EscolhaDeImagem>): Map<string, string> {
  const saida = new Map<string, string>();
  for (const [id, e] of escolhas) {
    if (e.imagemUrl) saida.set(id, e.imagemUrl);
  }
  return saida;
}
