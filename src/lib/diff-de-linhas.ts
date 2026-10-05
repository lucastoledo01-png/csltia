/**
 * Diferença linha a linha entre duas versões de uma instrução.
 *
 * Existe para o painel de instruções (05/10/2026): antes de ativar uma versão
 * ou voltar para outra, o dono precisa ver o que muda, e um texto de 14 mil
 * caracteres lado a lado não mostra isso. LCS clássico, O(n x m) em memória:
 * as instruções têm no máximo algumas centenas de linhas, então isto custa
 * menos que uma dependência nova.
 */

export type LinhaDoDiff = { tipo: "igual" | "saiu" | "entrou"; texto: string };

export function diffDeLinhas(antes: string, depois: string): LinhaDoDiff[] {
  const a = antes.split("\n");
  const b = depois.split("\n");
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const saida: LinhaDoDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      saida.push({ tipo: "igual", texto: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      saida.push({ tipo: "saiu", texto: a[i] });
      i += 1;
    } else {
      saida.push({ tipo: "entrou", texto: b[j] });
      j += 1;
    }
  }
  while (i < n) saida.push({ tipo: "saiu", texto: a[i++] });
  while (j < m) saida.push({ tipo: "entrou", texto: b[j++] });
  return saida;
}
