import { CAMARA } from "./camara";
import { CASA_BRANCA } from "./casa-branca";
import { FEDERAL_RESERVE } from "./federal-reserve";
import { PLANALTO, STF } from "./flickr";
import { NASA } from "./nasa";
import { SENADO } from "./senado";
import type { DefinicaoDoBanco } from "./tipos";

/**
 * Os bancos que o resolvedor consulta, pesquisados em 06/10/2026.
 *
 * Entra só banco cuja licença permite uso comercial com crédito, conferida na
 * página da própria foto ou do próprio banco, e que responde ao agente
 * honesto. Planalto e STF estão no Flickr, cujo robots.txt proíbe tudo fora
 * da API: entram só com `FLICKR_API_KEY`, e sem ela são pulados com nota.
 *
 * Os que ficaram de fora, e por quê (Agência Brasil, Fiocruz, Agência Gov,
 * Library of Congress, senate.gov, DVIDS sem chave...), estão em "Os bancos
 * de imagem oficiais" no `decisoes.md`.
 */
export const BANCOS_OFICIAIS: DefinicaoDoBanco[] = [CAMARA, SENADO, PLANALTO, STF, CASA_BRANCA, FEDERAL_RESERVE, NASA];
