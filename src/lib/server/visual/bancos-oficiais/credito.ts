import { limparAutor } from "../licencas";

/**
 * O crédito curto da foto de banco oficial, no formato do dono (06/10/2026):
 *
 *   Foto: Marcelo Camargo/Agência Brasil
 *
 * É o formato que os próprios bancos pedem (a Agência Brasil escreve
 * "Nome/Agência Brasil", a Câmara "Nome/Câmara dos Deputados") e o que a
 * imprensa brasileira imprime. Ele vai em `asset.attribution`, que é o campo
 * que a legenda do post lê (`legendaComCredito`) e o crédito da capa do portal
 * usa como texto.
 *
 * Vai SEMPRE, inclusive na foto de domínio público do governo americano, que
 * não exige crédito: o dono pediu crédito em toda capa, e foto de agência
 * oficial sem o nome de quem fez parece apropriada, não licenciada.
 */
export function creditoCurto(nomeDoBanco: string, autorBruto: string): string {
  const banco = nomeDoBanco.trim();
  let autor = limparAutor(autorBruto)
    // O banco às vezes já escreve o próprio nome junto do autor.
    .replace(new RegExp(`\\s*[/|,-]\\s*${escaparRegex(banco)}\\s*$`, "i"), "")
    .replace(/^(foto|fotos|crédito|credito|photo|photos?\s+by)\s*[:.-]?\s*/i, "")
    .trim();
  // "Divulgação", "Arquivo" e afins não são autor: sobra só o banco.
  if (/^(divulga[çc][ãa]o|arquivo|reprodu[çc][ãa]o|official|oficial)$/i.test(autor)) autor = "";
  return autor ? `Foto: ${autor}/${banco}` : `Foto: ${banco}`;
}

/**
 * Os nomes com que os bancos assinam o crédito, numa lista pura.
 *
 * Existe para a legenda do Instagram (`social/legenda-final.ts`), que monta o
 * crédito curto do autor e tira toda linha de crédito com "/" ("Fulano/
 * Wikimedia"). O "/" seguido do nome de um destes bancos é o formato que o
 * próprio banco exige ("Nome do Fotógrafo/Câmara dos Deputados") e o do dono,
 * e não pode sair. O teste confere que todo banco do registro está aqui.
 */
export const NOMES_DOS_BANCOS = [
  "Câmara dos Deputados",
  "Agência Senado",
  "Palácio do Planalto",
  "STF",
  "Casa Branca",
  "Federal Reserve",
  "NASA",
] as const;

/** "Kayo Magalhães/Câmara dos Deputados" a partir de "Foto: Kayo Magalhães/Câmara dos Deputados", ou vazio. */
export function autorComBanco(atribuicao: string): string {
  const t = (atribuicao ?? "").trim().replace(/^fotos?\s*:\s*/i, "");
  const m = t.match(/^(.+?)\s*\/\s*(.+)$/);
  if (!m) return "";
  const banco = NOMES_DOS_BANCOS.find((b) => b.toLowerCase() === m[2].trim().toLowerCase());
  return banco ? `${m[1].trim()}/${banco}` : "";
}

/** Tira o "/Banco" de um crédito, para quem confere se sobrou "/" de outra origem. */
export function semSufixoDeBanco(texto: string): string {
  let t = texto;
  for (const b of NOMES_DOS_BANCOS) t = t.replace(new RegExp(`\\s*/\\s*${escaparRegex(b)}`, "gi"), "");
  return t;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
