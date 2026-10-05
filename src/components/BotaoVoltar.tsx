"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type MouseEvent } from "react";

/**
 * Volta para de onde a pessoa veio, e não para uma lista fixa.
 *
 * Pedido do dono em 05/10/2026: quem abriu a matéria pela home deve voltar à
 * home, e quem veio de outra matéria, a ela.
 *
 * `document.referrer` não serve sozinho: o Next troca de página sem recarregar,
 * e o referrer continua sendo o de quando a aba abriu (o Google, o WhatsApp).
 * Então cada página do portal anota, na sessão da aba, que a pessoa já passou
 * por aqui (`MarcadorDeNavegacao`, montado na moldura). Com anotação, o botão
 * volta pelo histórico; sem ela, a pessoa chegou direto na matéria e vai para a
 * home. Sem JavaScript, o link leva à home.
 */
const CHAVE = "eua:caminho";

function lerCaminho(): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(CHAVE) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function MarcadorDeNavegacao() {
  const caminho = usePathname();
  useEffect(() => {
    try {
      const lista = lerCaminho();
      if (lista[lista.length - 1] !== caminho) {
        window.sessionStorage.setItem(CHAVE, JSON.stringify([...lista, caminho].slice(-20)));
      }
    } catch {
      // Sessão bloqueada (janela privada, cookies de terceiros): o botão cai na home.
    }
  }, [caminho]);
  return null;
}

/** Houve página deste site antes da atual, nesta aba? */
export function veioDeDentroDoSite(lista: string[], atual: string): boolean {
  const indice = lista.lastIndexOf(atual);
  return indice > 0;
}

export function BotaoVoltar({ className = "" }: { className?: string }) {
  const voltar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (veioDeDentroDoSite(lerCaminho(), window.location.pathname) && window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    }
  };

  return (
    <Link className={className} href="/" onClick={voltar}>
      <span aria-hidden="true">←</span> Voltar
    </Link>
  );
}
