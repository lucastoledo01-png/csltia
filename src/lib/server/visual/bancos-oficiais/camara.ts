import { normalizarEntidade } from "../tipos";
import { medirImagemDoBanco, pedirAoBanco } from "./rede";
import { protagonistaDaLegenda } from "./identidade";
import type { BuscaNoBanco, DefinicaoDoBanco, FotoDoBanco, OpcoesDaBusca } from "./tipos";

/**
 * O banco de imagens da Câmara dos Deputados (camara.leg.br/banco-imagens),
 * pesquisado em 06/10/2026.
 *
 * LICENÇA. O rodapé da própria página de busca: "Todas as imagens [...]
 * podem ser livremente utilizadas, sem custo e sem necessidade de
 * autorização, de acordo com a licença Creative Commons BY, que apenas exige
 * que seja dado o crédito no formato 'Nome do Fotógrafo/Câmara dos
 * Deputados'". É CC BY, comercial com crédito, e o crédito curto do dono é
 * exatamente esse formato.
 *
 * ACESSO. Sem API: a busca é HTML montado no servidor, por EVENTO (três por
 * página). O robots.txt não proíbe `/banco-imagens`, e o agente honesto recebe
 * 200 sem desafio. Não há página por foto: a página que prova a licença é a
 * da busca.
 *
 * QUALIDADE. Foto de sessão e de evento, com o nome na legenda ("Senador,
 * Flávio Bolsonaro (PL - RJ)"). Homônimo é comum: "Lula" acha o deputado Lula
 * da Fonte, "Tarcísio" o deputado Tarcísio Motta. Quem separa é a legenda
 * (`legendaCita`, que recusa o apelido seguido de outro sobrenome).
 *
 * ARQUIVO. O mesmo nome em três tamanhos: `...PEQ.jpg` (320 px), `...MED.jpg`
 * (1.000 px) e sem sufixo (o original, 3 a 5 mil px). Vai o original, com a
 * medida lida do próprio JPEG.
 */

const PESQUISA = "https://www.camara.leg.br/banco-imagens/pesquisar";
const MEDIDAS_POR_BUSCA = 4;

function desfazer(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function lerBuscaDaCamara(html: string, paginaUrl: string): FotoDoBanco[] {
  const fotos: FotoDoBanco[] = [];
  for (const m of html.matchAll(/<div\b[^>]*class="caixa-destaque-texto"[^>]*>/gi)) {
    const tag = m[0];
    const attr = (nome: string) => desfazer(tag.match(new RegExp(`\\s${nome}="([^"]*)"`, "i"))?.[1] ?? "");
    const miniatura = attr("src");
    if (!/PEQ\.jpe?g$/i.test(miniatura)) continue;
    const evento = attr("data-evn");
    const data = evento.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    fotos.push({
      banco: "camara",
      id: attr("data-idenv") || miniatura,
      titulo: evento.replace(/^\d{2}\/\d{2}\/\d{4}\s*-\s*/, ""),
      descricao: attr("alt"),
      imageUrl: miniatura.replace(/PEQ(\.jpe?g)$/i, "$1"),
      paginaUrl,
      // "Kayo Magalhães / Câmara dos Deputados" vira o nome; o banco entra no crédito.
      autor: attr("data-autor").split(/\s*\/\s*/)[0].trim(),
      data: data ? `${data[3]}-${data[2]}-${data[1]}` : null,
      largura: 0,
      altura: 0,
      licenca: "CC BY (Câmara dos Deputados)",
      // A licença está provada no rodapé da própria página de busca.
      licencaUrl: paginaUrl,
    });
  }
  return fotos;
}

async function buscar(consulta: string, opcoes: OpcoesDaBusca): Promise<BuscaNoBanco> {
  const rede = { fetcher: opcoes.fetcher, espaco: opcoes.espaco, aceitar: "text/html" };
  const url = `${PESQUISA}?buscar=${encodeURIComponent(consulta)}`;
  const html = await pedirAoBanco(url, rede);
  const total = Number(html.match(/id="totalEventos"\s+value="(\d+)"/)?.[1] ?? 0);
  const alvo = ` ${normalizarEntidade(consulta)} `;
  const todas = lerBuscaDaCamara(html, url);
  // A legenda que nomeia a consulta vem primeiro; dentro dela, a mais recente.
  const ordenadas = todas
    .map((f) => ({
      f,
      cita: ` ${normalizarEntidade(f.descricao)} `.includes(alvo),
      // A protagonista da legenda primeiro: o "Hugo Motta e Lula" é foto do Hugo Motta.
      protagonista: protagonistaDaLegenda(f, [consulta]),
    }))
    .sort(
      (a, b) =>
        Number(b.cita && b.protagonista) - Number(a.cita && a.protagonista) ||
        Number(b.cita) - Number(a.cita) ||
        (b.f.data ?? "").localeCompare(a.f.data ?? ""),
    )
    .map((x) => x.f)
    .slice(0, Math.min(opcoes.quantos, MEDIDAS_POR_BUSCA));
  const fotos: FotoDoBanco[] = [];
  for (const f of ordenadas) {
    const medida = await medirImagemDoBanco(f.imageUrl, rede);
    fotos.push(medida ? { ...f, largura: medida.largura, altura: medida.altura } : f);
  }
  return { fotos, nota: `${total} evento(s), ${todas.length} foto(s) na primeira página` };
}

export const CAMARA: DefinicaoDoBanco = {
  id: "camara",
  nome: "Câmara dos Deputados",
  pais: "BR",
  hostsDeImagem: ["www.camara.leg.br"],
  buscar,
};
