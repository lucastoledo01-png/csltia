/**
 * Em que estado a leitura dos perfis de referência roda, por projeto.
 *
 * Criado em 05/10/2026 para o RF-16 e o RF-17. Segue o contrato de
 * `capacidades.ts`, com uma diferença deliberada: não existe variável de
 * ambiente por trás. As outras capacidades nasceram como flag de ambiente e
 * migraram para o projeto; esta nasce no projeto. Sem declaração, `off`.
 *
 *   off       nada é lido, nada é gravado, nada é cobrado
 *   dry_run   lê os perfis, extrai o assunto, busca a fonte primária,
 *             classifica e GRAVA a leitura, mas não entrega pauta nenhuma
 *             ao pool do Instagram
 *   enforce   o mesmo, e as pautas aprovadas vão para o pool
 *
 * O `dry_run` existe porque a primeira semana com uma fonte nova é de
 * observação: o operador vê no painel o que cada perfil teria trazido antes
 * de deixar isso chegar a um post.
 */

import { resolverCapacidade } from "../../capacidades";
import type { EstadoDaCapacidade, ProjetoComCapacidades } from "../../capacidades";

export type ModoDosPerfis = EstadoDaCapacidade;

export function modoDosPerfisDeReferencia(projeto?: ProjetoComCapacidades | null): ModoDosPerfis {
  return resolverCapacidade("perfis_referencia", () => "off", projeto);
}
