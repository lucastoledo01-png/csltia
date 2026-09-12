"use client";

import { useEffect, useState } from "react";
import "./painel.css";

/**
 * Os projetos da plataforma, um card cada.
 *
 * Primeira tela de projeto que este painel tem. Até aqui ele operava
 * implicitamente sobre um único projeto e nunca oferecia escolha, apesar de o
 * banco ser multi-projeto desde agosto.
 *
 * Cada card mostra o que o projeto liga. O interruptor grava direto em
 * `projects.settings.capacidades`, que é o que a Fase 0 tirou das variáveis de
 * ambiente: antes, mudar isto significava editar o painel da hospedagem e
 * esperar o contêiner reiniciar, com efeito sobre todos os projetos ao mesmo
 * tempo.
 */

const ESTADOS = ["off", "dry_run", "enforce"] as const;
type Estado = (typeof ESTADOS)[number];

const ROTULO: Record<string, string> = {
  coleta: "Coleta de notícias",
  newsletter: "Newsletter",
  social: "Posts no Instagram",
  evergreen: "Conteúdo permanente",
  visual: "Imagem com licença",
  keyword: "Funil de keyword",
  landing: "Landing page",
};

const ROTULO_DO_ESTADO: Record<Estado, string> = {
  off: "Desligado",
  dry_run: "Ensaio",
  enforce: "No ar",
};

type Projeto = {
  id: string;
  slug: string;
  nome: string;
  status: string;
  nicho: string;
  timezone: string;
  marca: { nome: string; cor: string; logoUrl: string | null };
  capacidades: Partial<Record<string, Estado>>;
};

export default function PainelDeProjetos() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [capacidades, setCapacidades] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState<string>("");

  useEffect(() => {
    /*
     * A guarda de desmontagem não é zelo: a resposta pode chegar depois de a
     * tela sair, e atualizar estado de componente desmontado é o vazamento
     * clássico. Também é o que o lint do React cobra aqui.
     */
    let ativo = true;

    void (async () => {
      try {
        const r = await fetch("/api/admin/projetos");
        const corpo = await r.json();
        if (!ativo) return;
        if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);
        setProjetos(corpo.projetos ?? []);
        setCapacidades(corpo.capacidades ?? []);
        setErro("");
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar os projetos.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  async function alternar(projetoId: string, capacidade: string, estado: Estado) {
    const chave = `${projetoId}:${capacidade}`;
    setGravando(chave);
    try {
      const r = await fetch(`/api/admin/projetos/${projetoId}/capacidades`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacidade, estado }),
      });
      const corpo = await r.json();
      if (!r.ok || !corpo.ok) throw new Error(corpo.error ?? `HTTP ${r.status}`);

      /*
       * O estado vem da resposta, não do que eu pedi.
       *
       * Pintar o botão com o valor enviado e sincronizar depois mostra o
       * clique como se ele tivesse valido, inclusive quando a gravação
       * falhou. O que o banco confirmou é o que a tela mostra.
       */
      setProjetos((atuais) =>
        atuais.map((p) => (p.id === projetoId ? { ...p, capacidades: corpo.capacidades } : p)),
      );
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar.");
    } finally {
      setGravando("");
    }
  }

  return (
    <div className="pn">
      <div className="pn-largura">
        <header className="pn-topo">
          <h1 className="pn-titulo">Projetos</h1>
          <p className="pn-sub">
            Cada projeto liga o que quer. O que não estiver declarado aqui segue a configuração do
            servidor.
          </p>
        </header>

        {erro ? <div className="pn-aviso pn-erro">{erro}</div> : null}

        {carregando ? (
          <div className="pn-vazio">Carregando…</div>
        ) : projetos.length === 0 ? (
          <div className="pn-vazio">Nenhum projeto cadastrado.</div>
        ) : (
          <div className="pn-grade">
            {projetos.map((p) => (
              <article key={p.id} className="pn-card">
                <div className="pn-card-topo">
                  <div>
                    <div className="pn-nome">{p.marca.nome || p.nome}</div>
                    <div className="pn-slug">
                      {p.slug} · {p.timezone}
                    </div>
                  </div>
                  <span className="pn-estado">
                    <span className={`pn-ponto${p.status === "active" ? " vivo" : ""}`} />
                    {p.status === "active" ? "Ativo" : p.status}
                  </span>
                </div>

                <div className="pn-capacidades">
                  {capacidades.map((c) => {
                    const atual = p.capacidades?.[c];
                    const chave = `${p.id}:${c}`;
                    return (
                      <div key={c} className="pn-cap">
                        <span className="pn-cap-nome">{ROTULO[c] ?? c}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                          {atual === undefined ? <span className="pn-herda">herda do servidor</span> : null}
                          <span className="pn-seg">
                            {ESTADOS.map((e) => (
                              <button
                                key={e}
                                type="button"
                                data-on={atual === e}
                                disabled={gravando === chave}
                                onClick={() => alternar(p.id, c, e)}
                                title={ROTULO_DO_ESTADO[e]}
                              >
                                {ROTULO_DO_ESTADO[e]}
                              </button>
                            ))}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="pn-rodape">
          <a className="pn-link" href="/admin">
            Voltar ao painel
          </a>
        </footer>
      </div>
    </div>
  );
}
