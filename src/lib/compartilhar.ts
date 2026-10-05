/**
 * O link de compartilhar no WhatsApp (06/10/2026).
 *
 * Até esta data a mensagem era "Confira esta leitura no eua.journal: <título>",
 * SEM o endereço da matéria: quem recebia não tinha onde clicar. E o endereço
 * não pode vir escrito no código, porque o domínio já mudou de nome uma vez e
 * pode mudar de novo. Por isso ele é montado na hora do clique, do endereço que
 * o próprio navegador está mostrando (origem mais caminho, sem consulta e sem
 * âncora, para não levar parâmetro de campanha nem posição de rolagem). O
 * `href` renderizado no servidor usa o canônico, e só serve a quem está sem
 * JavaScript.
 */

export function mensagemDeCompartilhamento(marca: string, titulo: string, url: string): string {
  return `Confira esta leitura no ${marca}: ${titulo}\n${url}`;
}

export function linkDoWhatsApp(marca: string, titulo: string, url: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(mensagemDeCompartilhamento(marca, titulo, url))}`;
}

/** O endereço da página aberta, sem consulta e sem âncora. */
export function enderecoDaPaginaAtual(local: Pick<Location, "origin" | "pathname">): string {
  return `${local.origin}${local.pathname}`;
}
