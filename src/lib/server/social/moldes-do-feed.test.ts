import { describe, expect, it } from "vitest";
import { MOLDES_DO_FEED, TODOS_OS_MOLDES, moldesDeclarados, moldesLigados } from "./moldes-do-feed";
import { alternarGramatica } from "./ritmo-do-recorte";
import { alternarBolha } from "./ritmo-da-bolha";

/**
 * "Esses templates são os que a IA vai trabalhar e gerar as notícias, então
 * eles têm uma configuração que a gente pode desabilitar."
 *
 * A frase é do dono, em 21/09/2026, e ela define o que estes testes prendem:
 * desligar no painel tem que alcançar a esteira. Um interruptor que só muda a
 * tela é pior que nenhum, porque promete controle e não entrega.
 */

const COM_FOTO = { eixo: "custo_de_vida", temFoto: true, cabeNoRecorte: true };
const SEM_FOTO = { eixo: "politica", temFoto: false, cabeNoRecorte: false };

describe("o que o projeto declara", () => {
  /** A regra que torna isto seguro de subir: sem declaração, nada muda. */
  it("projeto que não declara nada tem todos os moldes ligados", () => {
    expect(moldesLigados(null)).toEqual(TODOS_OS_MOLDES);
    expect(moldesLigados({ settings: {} })).toEqual(TODOS_OS_MOLDES);
    expect(moldesLigados({ settings: { moldes: {} } })).toEqual(TODOS_OS_MOLDES);
  });

  it("só o false booleano desliga", () => {
    const ligados = moldesLigados({ settings: { moldes: { recorte: false } } });
    expect(ligados.recorte).toBe(false);
    expect(ligados.jornal).toBe(true);
  });

  /**
   * O valor vem de um jsonb que outras mãos editam. Aceitar formas aproximadas
   * de "não" faria um erro de digitação apagar um molde em silêncio, e o lado
   * seguro do erro aqui é continuar publicando.
   */
  it("valor torto não desliga nada", () => {
    for (const torto of ["false", 0, null, "off"]) {
      expect(moldesLigados({ settings: { moldes: { recorte: torto } } }).recorte).toBe(true);
    }
  });

  it("separa o declarado do padrão, para a tela não mentir", () => {
    const declarados = moldesDeclarados({ settings: { moldes: { recorte: false } } });
    expect(declarados).toEqual({ recorte: false });
    expect(Object.keys(declarados)).toHaveLength(1);
  });

  it("o cardápio cobre os quatro desenhos que existem", () => {
    expect([...MOLDES_DO_FEED]).toEqual(["jornal", "jornal_bolha", "recorte", "sem_foto"]);
  });
});

describe("desligar alcança a escolha da peça", () => {
  it("recorte desligado devolve jornal mesmo no eixo que pede recorte", () => {
    const decisoes = alternarGramatica([COM_FOTO, COM_FOTO], 0, {
      ...TODOS_OS_MOLDES,
      recorte: false,
    });
    expect(decisoes).toEqual(["jornal", "jornal"]);
  });

  it("jornal desligado empurra a peça com foto para o recorte", () => {
    const decisoes = alternarGramatica([COM_FOTO], 0, { ...TODOS_OS_MOLDES, jornal: false });
    expect(decisoes).toEqual(["recorte"]);
  });

  /**
   * O teto de recortes seguidos é ritmo, não regra dura. Sem jornal não há
   * para onde alternar, e obedecer ao teto significaria não publicar a peça
   * por causa de uma regra de variedade.
   */
  it("sem jornal, o teto de recortes seguidos deixa de valer", () => {
    const decisoes = alternarGramatica([COM_FOTO, COM_FOTO, COM_FOTO], 2, {
      ...TODOS_OS_MOLDES,
      jornal: false,
    });
    expect(decisoes).toEqual(["recorte", "recorte", "recorte"]);
  });

  /**
   * O caso que custa uma edição inteira: `sem_foto` é a rede de todos os
   * outros, e em 18/09/2026 foi a edição inteira.
   */
  it("sem_foto desligado deixa a peça sem foto fora do feed", () => {
    const decisoes = alternarGramatica([SEM_FOTO], 0, { ...TODOS_OS_MOLDES, sem_foto: false });
    expect(decisoes).toEqual([null]);
  });

  it("peça cujo texto não cabe no recorte cai fora quando o jornal está desligado", () => {
    const decisoes = alternarGramatica(
      [{ eixo: "custo_de_vida", temFoto: true, cabeNoRecorte: false }],
      0,
      { ...TODOS_OS_MOLDES, jornal: false },
    );
    expect(decisoes).toEqual([null]);
  });

  it("todos desligados é um dia sem post, e não um dia com o molde errado", () => {
    const decisoes = alternarGramatica([COM_FOTO, SEM_FOTO], 0, {
      jornal: false,
      jornal_bolha: false,
      recorte: false,
      sem_foto: false,
    });
    expect(decisoes).toEqual([null, null]);
  });

  /** Peça que não sai não entra no ritmo de quem sai. */
  it("peça descartada não conta para o teto da seguinte", () => {
    const decisoes = alternarGramatica([SEM_FOTO, COM_FOTO, COM_FOTO], 0, {
      ...TODOS_OS_MOLDES,
      sem_foto: false,
    });
    expect(decisoes).toEqual([null, "recorte", "recorte"]);
  });

  it("sem configuração, a decisão é exatamente a de antes", () => {
    expect(alternarGramatica([COM_FOTO, COM_FOTO, COM_FOTO], 0)).toEqual([
      "recorte",
      "recorte",
      "jornal",
    ]);
  });
});

describe("a bolha obedece ao interruptor", () => {
  it("desligada, nenhuma peça leva bolha", () => {
    const decisoes = alternarBolha(
      [{ temSegundaFoto: true }, { temSegundaFoto: true }],
      false,
      false,
    );
    expect(decisoes).toEqual([false, false]);
  });

  it("ligada, o ritmo continua alternando como antes", () => {
    expect(alternarBolha([{ temSegundaFoto: true }, { temSegundaFoto: true }], false)).toEqual([
      true,
      false,
    ]);
  });
});
