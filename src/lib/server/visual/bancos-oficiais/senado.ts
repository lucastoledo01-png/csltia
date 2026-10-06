import { normalizarEntidade } from "../tipos";
import { pedirAoBanco } from "./rede";
import { fotoDoFlickr, type FotoDoFlickr } from "./flickr";
import { protagonistaDaLegenda } from "./identidade";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * O banco de fotos do Senado (www12.senado.leg.br/fotos), pesquisado em
 * 06/10/2026.
 *
 * LICENÇA. A política de uso da Agência Senado: "a reprodução de matérias e
 * fotografias é livre, desde que não haja descaracterização de conteúdo e
 * mediante a citação da Agência Senado e do autor". Por baixo, cada foto tem a
 * licença do Flickr da conta, e ela muda com o ano (CC BY-SA 4.0 nas de 2025 e
 * 2026, CC BY 2.0 nas de 2015 a 2023, CC BY-NC numa de 2013). Vale a da foto,
 * lida no detalhe, e a NC fica de fora.
 *
 * ACESSO. O próprio Senado serve o acervo por um proxy sobre a API do
 * Flickr, sem chave: `busca-fotos` (até 500 fotos, sem licença) e
 * `dadosfotodestaque` (o detalhe, com licença e tamanhos). O robots.txt do
 * www12 não proíbe nada, e o agente honesto recebe 200. A busca é lenta (4 a
 * 10 s) e pesa 1 MB, por isso a memória da rede e o intervalo de 2 s.
 *
 * QUALIDADE. Excelente para senador (Flávio Bolsonaro: 4.982 fotos, todas de
 * 2026 no topo) e para quem passa por comissão do Senado (Haddad na CAE). A
 * ordem do acervo mistura foto de arquivo reenviada, então a data é lida e
 * ordenada aqui.
 */

const BUSCA = "https://www12.senado.leg.br/fotos/busca-fotos";
const DETALHE = "https://www12.senado.leg.br/fotos/dadosfotodestaque";
const DONO = "49143546@N06";
const ESPACO_DO_SENADO_MS = 2_000;

/** Quantos detalhes abrir por busca: cada um é um pedido de ~170 KB. */
const DETALHES_POR_BUSCA = 4;

export function lerBuscaDoSenado(json: string): FotoDoFlickr[] {
  const corpo = JSON.parse(json) as { photo?: FotoDoFlickr[] } | string;
  // O proxy às vezes devolve o JSON dentro de uma string, e o próprio site faz JSON.parse de novo.
  const objeto = typeof corpo === "string" ? (JSON.parse(corpo) as { photo?: FotoDoFlickr[] }) : corpo;
  return (objeto.photo ?? []).filter((f) => !f.owner || f.owner === DONO);
}

/**
 * As fotos da busca cuja legenda cita a consulta, da mais recente para a mais
 * antiga. A busca do acervo casa a palavra em qualquer lugar (tag, título,
 * legenda), e é a legenda que diz quem está na foto.
 */
export function maisRecentesQueCitam(fotos: FotoDoFlickr[], consulta: string): FotoDoFlickr[] {
  const alvo = normalizarEntidade(consulta);
  return fotos
    .filter((f) => {
      const t = typeof f.description === "string" ? f.description : (f.description?._content ?? "");
      const titulo = typeof f.title === "string" ? f.title : (f.title?._content ?? "");
      return ` ${normalizarEntidade(`${titulo} ${t}`)} `.includes(` ${alvo} `);
    })
    .map((f) => ({
      f,
      /*
       * Quem a legenda tem como protagonista vai na frente, ANTES de pagar o
       * detalhe (06/10/2026): as quatro mais recentes que citam "Moraes" eram
       * todas coletivas SOBRE ele, e a foto dele ficava fora dos quatro
       * detalhes abertos.
       */
      protagonista: protagonistaDaLegenda(
        {
          titulo: typeof f.title === "string" ? f.title : (f.title?._content ?? ""),
          descricao: typeof f.description === "string" ? f.description : (f.description?._content ?? ""),
        },
        [consulta],
      ),
    }))
    .sort((a, b) => Number(b.protagonista) - Number(a.protagonista) || (b.f.datetaken ?? "").localeCompare(a.f.datetaken ?? ""))
    .map((x) => x.f);
}

type DetalheDoSenado = [
  { license?: string | number; dates?: { taken?: string }; owner?: { nsid?: string } },
  unknown,
  unknown,
  Array<{ label?: string; source?: string; width?: number | string; height?: number | string }>,
];

/** A licença da foto e o tamanho de 2.048 px, do detalhe. */
export function lerDetalheDoSenado(json: string): { licenca: number | null; k?: { url: string; w: number; h: number } } {
  const d = JSON.parse(json) as DetalheDoSenado | string;
  const arr = (typeof d === "string" ? JSON.parse(d) : d) as DetalheDoSenado;
  const info = arr?.[0];
  if (!info || (info.owner?.nsid && info.owner.nsid !== DONO)) return { licenca: null };
  const tamanhos = Array.isArray(arr[3]) ? arr[3] : [];
  const k = tamanhos.find((t) => t.label === "Large 2048") ?? tamanhos.find((t) => Number(t.width) >= 1600 && Number(t.width) <= 3072);
  const licenca = Number(info.license);
  return {
    licenca: Number.isFinite(licenca) ? licenca : null,
    ...(k?.source ? { k: { url: k.source, w: Number(k.width) || 0, h: Number(k.height) || 0 } } : {}),
  };
}

async function buscar(consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> {
  const rede = { fetcher: opcoes.fetcher, espaco: opcoes.espaco ?? ESPACO_DO_SENADO_MS };
  const todas = lerBuscaDoSenado(
    await pedirAoBanco(BUSCA, {
      ...rede,
      formulario: { inputSearch: JSON.stringify(consulta), inputData: "", inputSenador: "null", inputPartido: "null" },
    }),
  );
  const citam = maisRecentesQueCitam(todas, consulta).slice(0, Math.min(opcoes.quantos, DETALHES_POR_BUSCA));
  const fotos: FotoDoBanco[] = [];
  let semLicenca = 0;
  for (const f of citam) {
    try {
      const detalhe = lerDetalheDoSenado(await pedirAoBanco(DETALHE, { ...rede, formulario: { dataobj: JSON.stringify(f.id) } }));
      if (detalhe.licenca === null) {
        semLicenca += 1;
        continue;
      }
      const comK = detalhe.k ? { ...f, url_k: detalhe.k.url, width_k: detalhe.k.w, height_k: detalhe.k.h } : f;
      const foto = fotoDoFlickr(comK, "senado", "https://www.flickr.com/photos/agenciasenado/", detalhe.licenca);
      if (foto) fotos.push(foto);
    } catch {
      semLicenca += 1;
    }
  }
  return {
    fotos,
    nota: `${todas.length} no acervo, ${citam.length} citam "${consulta}" na legenda, ${fotos.length} com licença lida${semLicenca ? `, ${semLicenca} sem detalhe` : ""}`,
  };
}

export const SENADO: DefinicaoDoBanco = {
  id: "senado",
  nome: "Agência Senado",
  pais: "BR",
  hostsDeImagem: ["live.staticflickr.com"],
  buscar,
};
