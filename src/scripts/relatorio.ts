import fs from "node:fs";
import path from "node:path";

/**
 * Escreve o relatório criando a pasta se ela não existir.
 *
 * `--saida=preview/relatorio.md` abortava com ENOENT na ÚLTIMA linha do
 * script, depois de gastar a rodada inteira de classificação, copy e imagem.
 * Perder o trabalho por causa de um diretório é o tipo de falha que não devia
 * existir, e ela existia em dez scripts.
 */
export function escreverRelatorio(saida: string, conteudo: string): string {
  const caminho = path.resolve(process.cwd(), saida);
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, conteudo, "utf-8");
  return caminho;
}
