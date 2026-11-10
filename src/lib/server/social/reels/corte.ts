import { execFileSync } from "node:child_process";

/**
 * O corte automático do vídeo de origem (28/10/2026).
 *
 * O vídeo que bomba em outro perfil chega com a marca dele: logotipo no canto,
 * legenda gravada, faixa de manchete. O que essas coisas têm em comum é que
 * NÃO MEXEM enquanto o vídeo mexe, e têm contraste. Então:
 *
 *   1. o ffmpeg tira 12 quadros pequenos, em tons de cinza;
 *   2. o pixel que quase não varia entre os quadros E tem borda forte perto é
 *      sobreposição;
 *   3. o corte é o maior retângulo sem sobreposição, na proporção do molde.
 *
 * Onde erra: vídeo de câmera parada (entrevista com fundo liso) parece todo
 * sobreposição nas bordas do cenário; por isso o Claude vê o corte desenhado
 * na folha de quadros e pode trocar. Sem sobreposição achada, não há corte, e
 * o molde encaixa o vídeo inteiro.
 */

export type Corte = { x: number; y: number; largura: number; altura: number };

/** Proporção do lugar do vídeo em cada molde: A é a moldura (992x537), B a tela cheia. */
export const ASPECTO_DO_MOLDE = { a: 992 / 537, b: 1080 / 1920, q: 1 } as const;

/*
 * A faixa limpa da transmissão (09/11/2026), para vídeo de canal de TV, que o
 * dono não quer com marca de terceiro nenhuma: logotipo do canal, faixa de
 * manchete, "LIVE", relógio, nome do programa. A TV põe o logotipo e o relógio
 * nos cantos de cima (até 14% da altura) e a faixa de manchete e o "LIVE" no
 * terço de baixo (a partir de 74%). O corte do canal (`corteDoCanalNaGrade`)
 * fica sempre dentro dela, ache a máscara alguma coisa ou não.
 */
export const FAIXA_LIMPA_DA_TRANSMISSAO = { topo: 0.14, base: 0.74, lados: 0.06 } as const;

/**
 * Pura: dos quadros (cinza, um byte por pixel) à máscara de sobreposição.
 * `variacao` é o desvio padrão máximo para contar como parado; `borda` é o
 * gradiente mínimo no quadro médio para contar como desenho.
 */
export function mascaraDeSobreposicao(
  quadros: Uint8Array[],
  largura: number,
  altura: number,
  opcoes: { variacao?: number; borda?: number } = {},
): boolean[][] {
  const limiteDeVariacao = opcoes.variacao ?? 6;
  const limiteDeBorda = opcoes.borda ?? 40;
  const n = quadros.length;
  const media = new Float64Array(largura * altura);
  const desvio = new Float64Array(largura * altura);
  for (let i = 0; i < largura * altura; i++) {
    let soma = 0;
    for (const q of quadros) soma += q[i];
    const m = soma / n;
    let var_ = 0;
    for (const q of quadros) var_ += (q[i] - m) ** 2;
    media[i] = m;
    desvio[i] = Math.sqrt(var_ / n);
  }
  const em = (x: number, y: number) => media[Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x))];
  const parado: boolean[][] = [];
  for (let y = 0; y < altura; y++) {
    const linha: boolean[] = [];
    for (let x = 0; x < largura; x++) {
      const gradiente = Math.max(Math.abs(em(x + 1, y) - em(x - 1, y)), Math.abs(em(x, y + 1) - em(x, y - 1)));
      linha.push(desvio[y * largura + x] <= limiteDeVariacao && gradiente >= limiteDeBorda);
    }
    parado.push(linha);
  }
  // Dilata um pixel: a borda do desenho é o que tem gradiente, o miolo da letra também é desenho.
  return parado.map((linha, y) =>
    linha.map((_, x) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (parado[y + dy]?.[x + dx]) return true;
      return false;
    }),
  );
}

/**
 * Pura: o maior retângulo na proporção pedida que não toca a máscara, na grade
 * da máscara. Percorre os retângulos máximos livres (histograma por linha) e
 * encaixa em cada um o maior retângulo da proporção, centralizado.
 */
export function maiorRetanguloLivre(mascara: boolean[][], aspecto: number): Corte | null {
  const altura = mascara.length;
  const largura = mascara[0]?.length ?? 0;
  if (!altura || !largura) return null;
  const alturas = new Array<number>(largura).fill(0);
  let melhor: Corte | null = null;
  const considerar = (x0: number, x1: number, yBase: number, h: number) => {
    const w = x1 - x0;
    let lw = w;
    let lh = Math.floor(w / aspecto);
    if (lh > h) {
      lh = h;
      lw = Math.floor(h * aspecto);
    }
    if (lw <= 0 || lh <= 0) return;
    if (!melhor || lw * lh > melhor.largura * melhor.altura) {
      melhor = { x: x0 + Math.floor((w - lw) / 2), y: yBase - h + 1 + Math.floor((h - lh) / 2), largura: lw, altura: lh };
    }
  };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) alturas[x] = mascara[y][x] ? 0 : alturas[x] + 1;
    const pilha: number[] = [];
    for (let x = 0; x <= largura; x++) {
      const h = x < largura ? alturas[x] : 0;
      let inicio = x;
      while (pilha.length && alturas[pilha[pilha.length - 1]] >= h) {
        const topo = pilha.pop()!;
        const esquerda = pilha.length ? pilha[pilha.length - 1] + 1 : 0;
        if (alturas[topo] > 0) considerar(esquerda, x, y, alturas[topo]);
        inicio = esquerda;
      }
      void inicio;
      pilha.push(x);
    }
  }
  return melhor;
}

/**
 * Pura: o corte em pixels do vídeo original, ou `null` quando a máscara está
 * limpa (o molde encaixa o vídeo inteiro) ou quando sobra pouco demais
 * (menos de 35% do maior retângulo da proporção que caberia no quadro
 * inteiro: é melhor o Claude decidir olhando).
 */
export function corteDaMascara(
  mascara: boolean[][],
  aspecto: number,
  original: { largura: number; altura: number },
): Corte | null {
  const algum = mascara.some((l) => l.some(Boolean));
  if (!algum) return null;
  const r = maiorRetanguloLivre(mascara, aspecto);
  const gh = mascara.length;
  const gw = mascara[0].length;
  const cheio = maiorRetanguloLivre(mascara.map((l) => l.map(() => false)), aspecto);
  if (!r || !cheio || (r.largura * r.altura) / (cheio.largura * cheio.altura) < 0.35) return null;
  const ex = original.largura / gw;
  const ey = original.altura / gh;
  // Arredonda para dentro e para par (o x264 pede dimensão par): nunca um pixel na sobreposição.
  const x = Math.ceil((r.x * ex) / 2) * 2;
  const y = Math.ceil((r.y * ey) / 2) * 2;
  const largura = Math.floor(((r.x + r.largura) * ex - x) / 2) * 2;
  const altura = Math.floor(((r.y + r.altura) * ey - y) / 2) * 2;
  return { x, y, largura, altura };
}

export function medidasDoVideo(arquivo: string): { largura: number; altura: number; segundos: number } {
  const saida = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", arquivo,
  ]).toString();
  const j = JSON.parse(saida) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  return { largura: j.streams?.[0]?.width ?? 0, altura: j.streams?.[0]?.height ?? 0, segundos: Number(j.format?.duration ?? 0) };
}

/** Mede o corte de um arquivo: 12 quadros de 64 px de largura, pelo ffmpeg. */
/** Os quadros pequenos, em cinza, que a máscara e a atividade leem. */
type Grade = { quadros: Uint8Array[]; gw: number; gh: number; original: { largura: number; altura: number; segundos: number } };

function gradeDoVideo(arquivo: string): Grade | null {
  const m = medidasDoVideo(arquivo);
  if (!m.largura || !m.altura) return null;
  const gw = 64;
  const gh = Math.max(8, Math.round((m.altura / m.largura) * gw / 2) * 2);
  const fps = 12 / Math.max(1, m.segundos);
  const bruto = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", arquivo, "-vf", `fps=${fps.toFixed(4)},scale=${gw}:${gh},format=gray`, "-frames:v", "12", "-f", "rawvideo", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const tamanho = gw * gh;
  const quadros: Uint8Array[] = [];
  for (let i = 0; i + tamanho <= bruto.length; i += tamanho) quadros.push(new Uint8Array(bruto.subarray(i, i + tamanho)));
  return quadros.length < 4 ? null : { quadros, gw, gh, original: m };
}

export function medirCorte(
  arquivo: string,
  aspecto: number,
): { corte: Corte | null; original: { largura: number; altura: number } } {
  const g = gradeDoVideo(arquivo);
  if (!g) return { corte: null, original: medidasDoVideo(arquivo) };
  return { corte: corteDaMascara(mascaraDeSobreposicao(g.quadros, g.gw, g.gh), aspecto, g.original), original: g.original };
}

/** Pura: o quanto cada pixel varia entre os quadros (o desvio padrão). É onde a cena mexe: a pessoa falando. */
export function atividadeDosQuadros(quadros: Uint8Array[], largura: number, altura: number): Float64Array {
  const n = quadros.length;
  const saida = new Float64Array(largura * altura);
  for (let i = 0; i < largura * altura; i++) {
    let soma = 0;
    for (const q of quadros) soma += q[i];
    const m = soma / n;
    let v = 0;
    for (const q of quadros) v += (q[i] - m) ** 2;
    saida[i] = Math.sqrt(v / n);
  }
  return saida;
}

/**
 * Pura: o corte do vídeo de canal, na grade (09/11/2026).
 *
 * O maior retângulo livre (`maiorRetanguloLivre`) não olha o conteúdo: no
 * primeiro teste real (Powell em Harvard, CNBC), ele escolheu a coluna escura
 * à esquerda do palco, e o Reel saiu sem ninguém. Aqui o corte:
 *
 *   1. fica dentro da faixa limpa da transmissão (sem logotipo, relógio, "LIVE"
 *      nem faixa de manchete, que moram nas bordas de cima e de baixo), mesmo
 *      quando a máscara não acha nada: a legenda gravada que muda a cada frase
 *      não é "parada", e a máscara não a vê;
 *   2. não toca a máscara (o que é parado e tem borda);
 *   3. é centrado, na horizontal, onde a cena mexe (o centro de massa da
 *      atividade), e desliza para os lados só o quanto a máscara obrigar;
 *   4. é o mais alto possível, e entre os de mesma altura, o mais de cima
 *      (a cabeça fica no alto do quadro).
 *
 * Sem retângulo livre de pelo menos metade da faixa, vale a faixa inteira
 * centrada na atividade, sem olhar a máscara.
 */
export function corteDoCanalNaGrade(
  mascara: boolean[][],
  atividade: Float64Array,
  aspecto: number,
  original: { largura: number; altura: number },
): Corte {
  const gh = mascara.length;
  const gw = mascara[0]?.length ?? 0;
  const f = FAIXA_LIMPA_DA_TRANSMISSAO;
  const y0 = Math.ceil(gh * f.topo);
  const y1 = Math.floor(gh * f.base);
  const x0 = Math.ceil(gw * f.lados);
  const x1 = Math.floor(gw * (1 - f.lados));
  const ex = original.largura / gw;
  const ey = original.altura / gh;

  // O centro da cena: média das colunas pesada pela atividade acima do ruído, dentro da faixa e fora da máscara.
  let peso = 0;
  let somaX = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (mascara[y][x]) continue;
      const a = Math.max(0, atividade[y * gw + x] - 8);
      peso += a;
      somaX += a * (x + 0.5);
    }
  }
  const cx = peso > 0 ? somaX / peso : (x0 + x1) / 2;

  // Soma acumulada da máscara, para saber em O(1) se um retângulo está livre.
  const acum: number[][] = Array.from({ length: gh + 1 }, () => new Array<number>(gw + 1).fill(0));
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      acum[y + 1][x + 1] = acum[y][x + 1] + acum[y + 1][x] - acum[y][x] + (mascara[y][x] ? 1 : 0);
    }
  }
  const livre = (x: number, y: number, w: number, h: number) => acum[y + h][x + w] - acum[y][x + w] - acum[y + h][x] + acum[y][x] === 0;

  const paraPixels = (x: number, y: number, w: number, h: number): Corte => {
    const par = (n: number) => Math.floor(n / 2) * 2;
    const px = Math.ceil((x * ex) / 2) * 2;
    const py = Math.ceil((y * ey) / 2) * 2;
    // Largura e altura na proporção exata, em pixels, dentro do retângulo da grade.
    let largura = par((x + w) * ex - px);
    let altura = par((y + h) * ey - py);
    if (largura / altura > aspecto) largura = par(altura * aspecto);
    else altura = par(largura / aspecto);
    return { x: px, y: py, largura, altura };
  };

  const alturaDaFaixa = y1 - y0;
  for (let h = alturaDaFaixa; h >= Math.max(2, Math.ceil(alturaDaFaixa / 2)); h--) {
    const w = Math.floor((aspecto * h * ey) / ex);
    if (w < 2 || w > x1 - x0) continue;
    const base = Math.round(cx - w / 2);
    for (let d = 0; d <= x1 - x0; d++) {
      for (const sinal of d === 0 ? [0] : [-1, 1]) {
        const x = Math.min(x1 - w, Math.max(x0, base + sinal * d));
        for (let y = y0; y + h <= y1; y++) if (livre(x, y, w, h)) return paraPixels(x, y, w, h);
      }
    }
  }
  // Nada livre: a faixa inteira, centrada na cena.
  const h = alturaDaFaixa;
  const w = Math.min(x1 - x0, Math.floor((aspecto * h * ey) / ex));
  const hh = Math.min(h, Math.floor((w * ex) / (aspecto * ey)));
  const x = Math.min(x1 - w, Math.max(x0, Math.round(cx - w / 2)));
  return paraPixels(x, y0 + Math.floor((h - hh) / 2), w, hh);
}

/** Mede o corte de um vídeo de canal: a mesma grade de 12 quadros, com a atividade da cena. */
export function medirCorteDoCanal(arquivo: string, aspecto: number): Corte | null {
  const g = gradeDoVideo(arquivo);
  if (!g) return null;
  const mascara = mascaraDeSobreposicao(g.quadros, g.gw, g.gh);
  return corteDoCanalNaGrade(mascara, atividadeDosQuadros(g.quadros, g.gw, g.gh), aspecto, g.original);
}

/**
 * A folha de quadros: seis quadros em 3x2, com o corte desenhado em amarelo.
 * É o que o Claude vê no chat (o chat não toca vídeo) e o painel mostra ao lado
 * do vídeo.
 */
export function folhaDeQuadros(arquivo: string, saida: string, corte: Corte | null): string {
  const m = medidasDoVideo(arquivo);
  const fps = 6 / Math.max(1, m.segundos);
  const caixa = corte ? `drawbox=x=${corte.x}:y=${corte.y}:w=${corte.largura}:h=${corte.altura}:color=yellow@0.9:t=8,` : "";
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", arquivo,
    "-vf", `fps=${fps.toFixed(4)},${caixa}scale=360:-2,tile=3x2:padding=6:color=white`,
    "-frames:v", "1", "-q:v", "4", saida,
  ]);
  return saida;
}

/*
 * Os cortes de cena do vídeo (09/11/2026), em segundos.
 *
 * O dono reprovou dois Reels do Trump em que o trecho começava ainda na cena
 * da apresentadora e terminava já na cena do entrevistador ou do deputado que
 * respondia. A fala era do Trump, a imagem não. A transcrição diz QUANDO
 * alguém fala; quem decide o que aparece é a troca de cena, medida aqui pelo
 * ffmpeg (diferença entre quadros acima de 0,25).
 */
export function cortesDeCena(arquivo: string, limiar = 0.25): number[] {
  let saida = "";
  try {
    saida = execFileSync(
      "ffmpeg",
      ["-hide_banner", "-i", arquivo, "-vf", `select='gt(scene,${limiar})',showinfo`, "-an", "-f", "null", "-"],
      { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    ).toString();
  } catch (e) {
    saida = String((e as { stderr?: Buffer }).stderr ?? "");
  }
  return tempoDosCortes(saida);
}

/** Pura: os tempos `pts_time` da saída do `showinfo`, em ordem e com 2 casas. */
export function tempoDosCortes(saidaDoShowinfo: string): number[] {
  const tempos = [...saidaDoShowinfo.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Math.round(Number(m[1]) * 100) / 100);
  return [...new Set(tempos.filter((t) => Number.isFinite(t) && t > 0))].sort((a, b) => a - b);
}

/**
 * Pura: encosta cada trecho nos cortes de cena vizinhos (09/11/2026).
 *
 * Se uma troca de cena cai logo depois do início (até `janela` segundos), o
 * trecho começa depois dela: o pedaço antes é a cena anterior, quase sempre o
 * apresentador. Se cai logo antes do fim, o trecho termina antes dela. A folga
 * de 0,04 s é um quadro, para não pegar o quadro da troca. Trecho que ficaria
 * com menos de 1 s volta como veio.
 */
export function ajustarAosCortesDeCena(
  trechos: Array<{ inicio: number; fim: number }>,
  cortes: number[],
  janela = 0.7,
): Array<{ inicio: number; fim: number }> {
  const QUADRO = 0.04;
  return trechos.map((t) => {
    let { inicio, fim } = t;
    const aposInicio = cortes.filter((c) => c > inicio && c <= inicio + janela);
    if (aposInicio.length) inicio = Math.max(...aposInicio) + QUADRO;
    const antesDoFim = cortes.filter((c) => c < fim && c >= fim - janela);
    if (antesDoFim.length) fim = Math.min(...antesDoFim) - QUADRO;
    if (fim - inicio < 1) return t;
    return { inicio: Math.round(inicio * 100) / 100, fim: Math.round(fim * 100) / 100 };
  });
}

/*
 * O vídeo que já chega em pé (10/11/2026).
 *
 * O Reel do Trump que a ABC postou no X chegou em 480x852, bem enquadrado,
 * com o logotipo "abc NEWS" no canto de cima. Para tirar o logotipo, o corte
 * começou abaixo dele, e a cabeça do Trump saiu junto. Vídeo em pé não é
 * cortado: entra inteiro no molde B, e a marca de terceiro é apagada no
 * próprio quadro (o `delogo` do ffmpeg), caixa por caixa.
 */
export const PROPORCAO_EM_PE = 1.6;

/** Pura: o vídeo já está em pé (9:16 ou perto disso), e qualquer corte só tiraria cabeça ou pé. */
export function videoEmPe(original: { largura: number; altura: number }): boolean {
  return original.largura > 0 && original.altura / original.largura >= PROPORCAO_EM_PE;
}

/**
 * Pura: as caixas da marca de terceiro a apagar, em pixels do vídeo original.
 *
 * Cada mancha conectada da máscara vira uma caixa, com uma célula de folga.
 * Só sai a caixa que mora inteira num CANTO do quadro (até 28% da largura a
 * partir da borda e até 22% da altura), onde canal e perfil põem o logotipo.
 * Medido no vídeo da ABC: a máscara também acha o cenário parado (o painel da
 * Casa Branca, a borda do púlpito), e apagar aquilo borraria o vídeo inteiro.
 * Mancha de uma célula é ruído. No máximo quatro caixas, as maiores.
 */
export function caixasParaApagar(mascara: boolean[][], original: { largura: number; altura: number }): Corte[] {
  const gh = mascara.length;
  const gw = mascara[0]?.length ?? 0;
  if (!gh || !gw) return [];
  const visto = mascara.map((l) => l.map(() => false));
  const manchas: Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!mascara[y][x] || visto[y][x]) continue;
      const pilha: Array<[number, number]> = [[x, y]];
      visto[y][x] = true;
      const m = { x0: x, y0: y, x1: x, y1: y, n: 0 };
      while (pilha.length) {
        const [cx, cy] = pilha.pop()!;
        m.n += 1;
        m.x0 = Math.min(m.x0, cx);
        m.y0 = Math.min(m.y0, cy);
        m.x1 = Math.max(m.x1, cx);
        m.y1 = Math.max(m.y1, cy);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || visto[ny][nx] || !mascara[ny][nx]) continue;
            visto[ny][nx] = true;
            pilha.push([nx, ny]);
          }
        }
      }
      manchas.push(m);
    }
  }
  const ex = original.largura / gw;
  const ey = original.altura / gh;
  const area = (c: { x0: number; y0: number; x1: number; y1: number }) => (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1);
  return manchas
    .filter((m) => m.n >= 2)
    .map((m) => ({ x0: Math.max(0, m.x0 - 1), y0: Math.max(0, m.y0 - 1), x1: Math.min(gw - 1, m.x1 + 1), y1: Math.min(gh - 1, m.y1 + 1) }))
    .filter((c) => {
      const nasLaterais = (c.x1 + 1) / gw <= 0.28 || c.x0 / gw >= 0.72;
      const noAltoOuEmbaixo = (c.y1 + 1) / gh <= 0.22 || c.y0 / gh >= 0.78;
      return nasLaterais && noAltoOuEmbaixo;
    })
    .sort((a, b) => area(b) - area(a))
    .slice(0, 4)
    .map((c) => {
      // O delogo recusa caixa que encosta na borda do quadro: um pixel de margem.
      const x = Math.max(1, Math.floor(c.x0 * ex));
      const y = Math.max(1, Math.floor(c.y0 * ey));
      const largura = Math.min(original.largura - 2 - x, Math.ceil((c.x1 + 1) * ex) - x);
      const altura = Math.min(original.altura - 2 - y, Math.ceil((c.y1 + 1) * ey) - y);
      return { x, y, largura, altura };
    })
    .filter((c) => c.largura >= 4 && c.altura >= 4);
}

/** Mede as caixas a apagar de um arquivo, pela mesma grade de 12 quadros. */
export function medirCaixasParaApagar(arquivo: string): Corte[] {
  const g = gradeDoVideo(arquivo);
  if (!g) return [];
  return caixasParaApagar(mascaraDeSobreposicao(g.quadros, g.gw, g.gh), g.original);
}
