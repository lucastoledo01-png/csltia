/**
 * A rede dos bancos oficiais: agente honesto, prazo, espaço entre pedidos e
 * memória curta (06/10/2026).
 *
 * Três regras, e cada uma tem um motivo medido ou declarado pelo próprio
 * banco:
 *
 *   AGENTE. Todo pedido sai com `eua.journal/1.0`, nunca disfarçado de
 *   navegador. É a mesma regra da leitura das fontes da matéria e do
 *   evergreen: banco que recusa o agente declarado fica de fora, e não é
 *   contornado.
 *
 *   ESPAÇO. Um pedido por vez por host, com intervalo mínimo entre eles. Os
 *   bancos públicos não publicam cota, e rajada é o jeito mais rápido de
 *   transformar "o banco tem a foto" em "o banco recusou". Foi o que aconteceu
 *   com o Pexels em 06/10/2026: uma rajada recusada virou "não há foto".
 *
 *   MEMÓRIA. A mesma busca dentro de dez minutos devolve a resposta guardada.
 *   A newsletter, o portal e o post resolvem a mesma pauta em sequência, e o
 *   carrossel pergunta pelo mesmo protagonista várias vezes: sem memória,
 *   seriam quatro buscas iguais ao mesmo banco em um minuto. A falha NÃO fica
 *   guardada, para o pedido seguinte tentar de novo.
 */

export const AGENTE_DOS_BANCOS = "eua.journal/1.0 (+https://casaloti.ia.br)";

/** Quanto tempo uma resposta vale na memória. */
export const VALIDADE_DA_MEMORIA_MS = 10 * 60_000;

/** Prazo de cada pedido. Banco lento não segura a resolução da pauta. */
export const PRAZO_DO_PEDIDO_MS = 12_000;

/** Intervalo mínimo entre dois pedidos ao mesmo host. */
export const ESPACO_ENTRE_PEDIDOS_MS = 1_100;

/** Teto da memória, para o processo longo do worker não crescer sem limite. */
const TETO_DA_MEMORIA = 300;

type Guardado = { quando: number; corpo: string };

const memoria = new Map<string, Guardado>();
const filaPorHost = new Map<string, Promise<void>>();
const ultimoPedidoPorHost = new Map<string, number>();

/** Só para teste: a memória e a fila são do módulo e vazariam de um caso para o outro. */
export function esquecerRedeDosBancos(): void {
  memoria.clear();
  medidas.clear();
  filaPorHost.clear();
  ultimoPedidoPorHost.clear();
}

export class RecusaDoBanco extends Error {
  constructor(
    readonly host: string,
    readonly status: number,
  ) {
    super(`${host} respondeu ${status}`);
  }
}

export type OpcoesDaRede = {
  fetcher?: typeof fetch;
  /** Para o teste não esperar o intervalo real. */
  espaco?: number;
  agora?: () => number;
  aceitar?: string;
  /**
   * Formulário para POST, quando o banco só busca assim (o Senado). Entra na
   * chave da memória junto com o endereço: duas buscas diferentes no mesmo
   * endereço não são a mesma resposta.
   */
  formulario?: Record<string, string>;
};

/**
 * A medida de um JPEG, lida do marcador SOF nos primeiros bytes.
 *
 * Existe para o banco que não declara a medida da foto (a galeria do Fed). Sem
 * medida, a pontuação dá zero de qualidade e zero de proporção, e o retrato
 * oficial do presidente do Fed perdia para o piso de pessoa por falta de um
 * número que o próprio arquivo tem.
 */
export function medidaDoJpeg(bytes: Uint8Array): { largura: number; altura: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marcador = bytes[i + 1];
    const tamanho = (bytes[i + 2] << 8) + bytes[i + 3];
    // SOF0 a SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: (bytes[i + 5] << 8) + bytes[i + 6], largura: (bytes[i + 7] << 8) + bytes[i + 8] };
    }
    i += 2 + tamanho;
  }
  return null;
}

/** A medida de uma imagem do banco, com memória e pela mesma fila do host. */
const medidas = new Map<string, { largura: number; altura: number } | null>();
export async function medirImagemDoBanco(
  url: string,
  opcoes: OpcoesDaRede = {},
): Promise<{ largura: number; altura: number } | null> {
  if (medidas.has(url)) return medidas.get(url) ?? null;
  const host = new URL(url).host;
  const espaco = opcoes.espaco ?? ESPACO_ENTRE_PEDIDOS_MS;
  const fetcher = opcoes.fetcher ?? fetch;
  const anterior = filaPorHost.get(host) ?? Promise.resolve();
  let liberar!: () => void;
  const minhaVez = new Promise<void>((r) => (liberar = r));
  filaPorHost.set(host, anterior.then(() => minhaVez));
  await anterior;
  try {
    const agora = opcoes.agora ?? Date.now;
    const espera = Math.max(0, (ultimoPedidoPorHost.get(host) ?? 0) + espaco - agora());
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimoPedidoPorHost.set(host, agora());
    const r = await fetcher(url, {
      headers: { "User-Agent": AGENTE_DOS_BANCOS, Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(PRAZO_DO_PEDIDO_MS),
    });
    if (!r.ok) return null;
    const medida = medidaDoJpeg(new Uint8Array(await r.arrayBuffer()));
    medidas.set(url, medida);
    return medida;
  } catch {
    return null;
  } finally {
    liberar();
  }
}

/**
 * O corpo da resposta, em texto, passando pela memória e pela fila do host.
 *
 * Lança `RecusaDoBanco` para status fora de 2xx e o erro da rede para o resto;
 * quem chama transforma isso em nota, e a resolução segue para o banco
 * seguinte. Nada aqui derruba a pauta.
 */
export async function pedirAoBanco(url: string, opcoes: OpcoesDaRede = {}): Promise<string> {
  const agora = opcoes.agora ?? Date.now;
  const corpoDoPedido = opcoes.formulario ? new URLSearchParams(opcoes.formulario).toString() : null;
  const chave = corpoDoPedido ? `${url}#${corpoDoPedido}` : url;
  const guardado = memoria.get(chave);
  if (guardado && agora() - guardado.quando < VALIDADE_DA_MEMORIA_MS) return guardado.corpo;

  const host = new URL(url).host;
  const espaco = opcoes.espaco ?? ESPACO_ENTRE_PEDIDOS_MS;
  const fetcher = opcoes.fetcher ?? fetch;

  /*
   * A fila por host é uma corrente de promessas: cada pedido espera o
   * anterior terminar e o intervalo passar. Pedidos a hosts diferentes não
   * esperam um pelo outro.
   */
  const anterior = filaPorHost.get(host) ?? Promise.resolve();
  let liberar!: () => void;
  const minhaVez = new Promise<void>((r) => (liberar = r));
  filaPorHost.set(
    host,
    anterior.then(() => minhaVez),
  );

  await anterior;
  try {
    const ultimo = ultimoPedidoPorHost.get(host) ?? 0;
    const espera = Math.max(0, ultimo + espaco - agora());
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimoPedidoPorHost.set(host, agora());

    const resposta = await fetcher(url, {
      method: corpoDoPedido ? "POST" : "GET",
      ...(corpoDoPedido ? { body: corpoDoPedido } : {}),
      headers: {
        "User-Agent": AGENTE_DOS_BANCOS,
        Accept: opcoes.aceitar ?? "application/json, text/html;q=0.9",
        ...(corpoDoPedido ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(PRAZO_DO_PEDIDO_MS),
    });
    if (!resposta.ok) throw new RecusaDoBanco(host, resposta.status);
    const corpo = await resposta.text();

    if (memoria.size >= TETO_DA_MEMORIA) {
      const maisAntiga = memoria.keys().next().value;
      if (maisAntiga !== undefined) memoria.delete(maisAntiga);
    }
    memoria.set(chave, { quando: agora(), corpo });
    return corpo;
  } finally {
    liberar();
  }
}
