import type { TopicoEvergreen } from "./tipos";

/**
 * O estoque editorial do evergreen.
 *
 * Cada tópico é um assunto que não vence, e cada ângulo é uma pergunta
 * diferente sobre ele. A distinção é o que impede o feed de repetir: "o que é o
 * EB-2 NIW" e "que trajetória costuma aparecer nesse pedido" são conteúdos
 * diferentes; "o que é" e "entenda o" seriam o mesmo post com dois títulos.
 *
 * As fontes são só de domínio oficial, e cada URL foi conferida por requisição
 * antes de entrar aqui. Notícia não ancora regra permanente: uma matéria
 * descreve o estado de um dia, e o evergreen afirma o que vale em geral.
 *
 * O que deliberadamente NÃO está aqui: Visa Bulletin do mês, priority date
 * atual, tempo de processamento, valor de taxa, prazo em aberto. Tudo isso
 * muda em semanas e pertence ao News V2. "Como o Visa Bulletin funciona" é
 * permanente; "o Visa Bulletin de outubro" não é.
 */
export const CATALOGO_EVERGREEN: TopicoEvergreen[] = [
  {
    id: "eb2-niw",
    nome: "EB-2 NIW (isencao por interesse nacional)",
    familia: "visa_explainer",
    programa: "EB-2 NIW",
    resumo: "Green card em que a propria pessoa faz o pedido, sem empresa patrocinando, mostrando que o trabalho dela serve ao interesse nacional americano.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-5",
      "https://www.uscis.gov/i-140",
    ],
    angulos: [
      {
        id: "o-que-e-quem-serve",
        pergunta: "O que e o EB-2 NIW e quem consegue pedir green card sem ter empresa americana contratando?",
        personas: ["pesquisadores", "medicos", "engenheiros", "empreendedores"],
      },
      {
        id: "perfil-que-aparece",
        pergunta: "Que tipo de trajetoria profissional costuma aparecer num pedido de EB-2 NIW?",
        personas: ["pesquisadores", "tecnologia", "medicos"],
      },
      {
        id: "niw-vs-eb2-com-empregador",
        pergunta: "Qual a diferenca entre o EB-2 comum, que depende de empregador e de teste do mercado de trabalho, e o EB-2 NIW, que dispensa os dois?",
        personas: ["engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "eb1a",
    nome: "EB-1A (habilidade extraordinaria)",
    familia: "visa_explainer",
    programa: "EB-1A",
    resumo: "Green card para quem ja tem reconhecimento nacional ou internacional na sua area e pode apresentar o pedido sozinho.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-2",
    ],
    angulos: [
      {
        id: "o-que-e-habilidade-extraordinaria",
        pergunta: "O que o governo americano chama de habilidade extraordinaria no EB-1A?",
        personas: ["pesquisadores", "executivos", "tecnologia"],
      },
      {
        id: "como-a-prova-e-avaliada",
        pergunta: "Por que bater tres criterios do EB-1A nao significa aprovacao garantida?",
        personas: ["pesquisadores", "tecnologia"],
      },
      {
        id: "eb1a-vs-eb2niw",
        pergunta: "EB-1A ou EB-2 NIW: qual a diferenca real entre os dois caminhos em que voce mesmo faz o pedido?",
        personas: ["pesquisadores", "medicos", "empreendedores"],
      },
    ],
  },
  {
    id: "o1a",
    nome: "O-1A (visto temporario de habilidade extraordinaria)",
    familia: "visa_explainer",
    programa: "O-1A",
    resumo: "Visto de trabalho temporario para quem tem destaque comprovado em ciencia, educacao, negocios ou esporte, sempre com alguem nos EUA apresentando o pedido.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/o-1-visa-individuals-with-extraordinary-ability-or-achievement",
      "https://www.uscis.gov/policy-manual/volume-2-part-m-chapter-4",
      "https://www.uscis.gov/i-129",
    ],
    angulos: [
      {
        id: "o-que-e-e-quem-patrocina",
        pergunta: "O que e o visto O-1A e por que ele sempre precisa de um empregador ou agente nos EUA apresentando o pedido?",
        personas: ["tecnologia", "pesquisadores", "executivos"],
      },
      {
        id: "perfil-por-area",
        pergunta: "Que tipo de profissional entra pelo O-1A em ciencia, negocios, esporte e tecnologia?",
        personas: ["tecnologia", "pesquisadores", "executivos"],
      },
      {
        id: "o1a-vs-eb1a",
        pergunta: "O-1A e EB-1A cobram provas parecidas, entao por que um da visto temporario e o outro da green card?",
        personas: ["pesquisadores", "tecnologia"],
      },
    ],
  },
  {
    id: "h1b",
    nome: "H-1B (ocupacao especializada)",
    familia: "visa_explainer",
    programa: "H-1B",
    resumo: "Visto de trabalho temporario para cargos que exigem diploma especifico, pedido pela empresa e limitado por um numero anual de vagas.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
      "https://www.uscis.gov/i-129",
    ],
    angulos: [
      {
        id: "o-que-e-ocupacao-especializada",
        pergunta: "O que e o H-1B e o que faz uma vaga ser considerada ocupacao especializada?",
        personas: ["tecnologia", "engenheiros"],
      },
      {
        id: "por-que-tem-sorteio",
        pergunta: "Por que existe sorteio no H-1B e como funciona o limite anual de vagas?",
        personas: ["tecnologia", "engenheiros", "estudantes"],
      },
      {
        id: "h1b-vs-o1a",
        pergunta: "H-1B ou O-1A: quando o caminho do diploma serve e quando o caminho do destaque serve?",
        personas: ["tecnologia", "pesquisadores"],
      },
    ],
  },
  {
    id: "f1",
    nome: "F-1 (estudante academico)",
    familia: "visa_explainer",
    programa: "F-1",
    resumo: "Visto de estudante para curso academico, com regras proprias sobre carga de estudo e sobre quando da para trabalhar.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
      "https://www.uscis.gov/policy-manual/volume-2-part-f-chapter-1",
    ],
    angulos: [
      {
        id: "o-que-e-e-o-que-exige",
        pergunta: "O que e o visto F-1 e o que ele exige de voce enquanto estiver estudando?",
        personas: ["estudantes", "familias"],
      },
      {
        id: "trabalhar-durante-e-depois",
        pergunta: "Quando um estudante F-1 pode trabalhar legalmente durante o curso e depois de formado?",
        personas: ["estudantes", "tecnologia"],
      },
      {
        id: "f1-vs-m1",
        pergunta: "F-1 ou M-1: o que muda quando o curso e academico e quando ele e tecnico?",
        personas: ["estudantes"],
      },
    ],
  },
  {
    id: "l1",
    nome: "L-1 (transferencia dentro da mesma empresa)",
    familia: "visa_explainer",
    programa: "L-1",
    resumo: "Visto para funcionario transferido de uma empresa no exterior para uma unidade ligada a ela nos Estados Unidos.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager",
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1b-intracompany-transferee-specialized-knowledge",
      "https://www.uscis.gov/policy-manual/volume-2-part-l-chapter-2",
    ],
    angulos: [
      {
        id: "o-que-e-e-o-vinculo-entre-empresas",
        pergunta: "O que e o visto L-1 e por que ele so existe quando as duas empresas tem vinculo comprovado?",
        personas: ["executivos", "empreendedores"],
      },
      {
        id: "l1a-vs-l1b",
        pergunta: "L-1A ou L-1B: qual a diferenca entre transferir quem gerencia e transferir quem domina um conhecimento especifico?",
        personas: ["executivos", "tecnologia", "engenheiros"],
      },
      {
        id: "novo-escritorio",
        pergunta: "Como uma empresa de fora usa o L-1 para colocar alguem nos EUA abrindo um escritorio novo?",
        personas: ["empreendedores", "executivos"],
      },
    ],
  },
  {
    id: "eb3",
    nome: "EB-3 (trabalhadores qualificados, profissionais e outros)",
    familia: "visa_explainer",
    programa: "EB-3",
    resumo: "Green card por emprego para profissionais com diploma, trabalhadores qualificados e trabalhadores sem qualificacao especifica, com o empregador conduzindo o processo.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-third-preference-eb-3",
      "https://www.uscis.gov/policy-manual/volume-6-part-e-chapter-2",
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers",
    ],
    angulos: [
      {
        id: "o-que-e-e-tres-subgrupos",
        pergunta: "O que e o EB-3 e quais sao os tres tipos de trabalhador que cabem nele?",
        personas: ["familias", "engenheiros"],
      },
      {
        id: "papel-do-empregador",
        pergunta: "Por que o EB-3 quase sempre depende de o empregador provar que nao encontrou trabalhador americano para a vaga?",
        personas: ["familias", "empreendedores"],
      },
      {
        id: "eb3-vs-eb2",
        pergunta: "EB-3 ou EB-2: o que muda no seu caminho quando voce tem mestrado em vez de bacharelado?",
        personas: ["engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "e2",
    nome: "E-2 (investidor de pais com tratado)",
    familia: "visa_explainer",
    programa: "E-2",
    resumo: "Visto para quem investe num negocio nos Estados Unidos e e cidadao de pais que tem tratado de comercio e investimento com os EUA.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/e-2-treaty-investors",
      "https://www.uscis.gov/i-129",
    ],
    angulos: [
      {
        id: "o-que-e-e-o-tratado",
        pergunta: "O que e o visto E-2 e por que ele depende do pais do seu passaporte?",
        personas: ["empreendedores"],
      },
      {
        id: "investimento-substancial",
        pergunta: "O E-2 nao fixa valor minimo, entao o que conta como investimento substancial?",
        personas: ["empreendedores"],
      },
      {
        id: "e2-vs-eb5",
        pergunta: "E-2 ou EB-5: qual a diferenca entre investir para morar com visto temporario e investir para conseguir green card?",
        personas: ["empreendedores", "executivos", "familias"],
      },
    ],
  },
  {
    id: "eb5",
    nome: "EB-5 (green card por investimento)",
    familia: "visa_explainer",
    programa: "EB-5",
    resumo: "Green card para quem investe capital num negocio nos EUA e gera empregos, dentro das regras do programa de investidor imigrante.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/eb-5-immigrant-investor-program",
      "https://www.uscis.gov/policy-manual/volume-6-part-g-chapter-2",
      "https://www.uscis.gov/i-526e",
    ],
    angulos: [
      {
        id: "tres-exigencias",
        pergunta: "O que e o EB-5 e quais sao as tres exigencias que todo pedido tem que sustentar?",
        personas: ["empreendedores", "familias"],
      },
      {
        id: "criacao-de-empregos",
        pergunta: "Por que o EB-5 exige criacao de empregos e como esses empregos sao contados?",
        personas: ["empreendedores"],
      },
      {
        id: "direto-ou-centro-regional",
        pergunta: "Investir no proprio negocio ou por meio de um centro regional: o que muda no EB-5?",
        personas: ["empreendedores", "executivos"],
      },
    ],
  },
  {
    id: "j1",
    nome: "J-1 (visitante de intercambio)",
    familia: "visa_explainer",
    programa: "J-1",
    resumo: "Visto de visitante de intercambio, sempre ligado a um programa patrocinador, que vai de pesquisador e professor a au pair e monitor de acampamento.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/exchange-visitors",
      "https://www.uscis.gov/i-612",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors",
    ],
    angulos: [
      {
        id: "o-que-e-e-o-patrocinador",
        pergunta: "O que e o visto J-1 e por que ele sempre passa por um programa patrocinador?",
        personas: ["estudantes", "pesquisadores", "medicos"],
      },
      {
        id: "regra-de-voltar-dois-anos",
        pergunta: "O que e a exigencia de voltar dois anos para o pais de origem depois do J-1 e quem cai nela?",
        personas: ["medicos", "pesquisadores"],
      },
      {
        id: "j1-vs-f1",
        pergunta: "J-1 ou F-1: qual a diferenca entre vir por um programa de intercambio e vir matriculado por conta propria?",
        personas: ["estudantes", "pesquisadores"],
      },
    ],
  },
  {
    id: "tn",
    nome: "TN (profissionais do USMCA)",
    familia: "visa_explainer",
    programa: "TN",
    resumo: "Visto de trabalho reservado a cidadaos do Canada e do Mexico em profissoes que estao numa lista do acordo comercial da America do Norte.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/tn-usmca-professionals",
      "https://www.uscis.gov/i-129",
    ],
    angulos: [
      {
        id: "o-que-e-e-para-quem",
        pergunta: "O que e o status TN e por que ele existe apenas para canadenses e mexicanos?",
      },
      {
        id: "lista-fechada-de-profissoes",
        pergunta: "Por que o TN vale so para profissoes de uma lista fechada e o que isso deixa de fora?",
        personas: ["engenheiros", "tecnologia"],
      },
      {
        id: "tn-vs-h1b",
        pergunta: "TN ou H-1B: por que um nao passa por sorteio e o outro passa?",
        personas: ["engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "b1-b2",
    nome: "B-1 e B-2 (negocios e turismo)",
    familia: "visa_explainer",
    programa: "B-1/B-2",
    resumo: "O visto de visitante para negocios e turismo, o que ele permite fazer e o que realmente define quanto tempo voce pode ficar.",
    fontesCanonicas: [
      "https://www.cbp.gov/travel/international-visitors",
      "https://www.cbp.gov/travel/international-visitors/i-94",
      "https://www.uscis.gov/policy-manual/volume-2-part-a-chapter-4",
    ],
    angulos: [
      {
        id: "b1-vs-b2",
        pergunta: "B-1 e B-2 vem juntas no mesmo visto, entao o que cada uma dessas letras deixa voce fazer?",
        personas: ["familias", "empreendedores"],
      },
      {
        id: "quem-decide-o-prazo",
        pergunta: "Quem decide quanto tempo voce pode ficar nos EUA: o visto no passaporte ou o oficial na entrada?",
        personas: ["familias"],
      },
      {
        id: "trocar-de-status-sem-sair",
        pergunta: "Da para trocar o visto de turista por status de estudante ou de trabalho sem sair dos Estados Unidos?",
        personas: ["estudantes", "familias"],
      },
    ],
  },
  {
    id: "priority-date",
    nome: "Priority date (data de prioridade)",
    familia: "glossary",
    resumo: "O termo que define o lugar da pessoa na fila do green card e de onde essa data vem.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates",
      "https://www.uscis.gov/i-140",
      "https://www.uscis.gov/tools/glossary",
    ],
    angulos: [
      {
        id: "o-que-significa-priority-date",
        pergunta: "O que quer dizer priority date e por que todo mundo fala tanto dessa data?",
      },
      {
        id: "de-onde-vem-a-minha-data",
        pergunta: "De onde sai a minha priority date e em que papel eu consigo ver ela?",
        personas: ["familias", "engenheiros", "pesquisadores"],
      },
      {
        id: "por-que-a-data-fica-parada",
        pergunta: "Por que a priority date de algumas pessoas fica parada por anos e de outras nao?",
      },
    ],
  },
  {
    id: "visa-bulletin-como-funciona",
    nome: "Visa Bulletin (boletim de vistos)",
    familia: "glossary",
    resumo: "Como funciona o boletim mensal que libera a fila do green card, olhando o mecanismo e nunca o numero do mes.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates",
      "https://www.uscis.gov/i-485",
    ],
    angulos: [
      {
        id: "o-que-e-o-visa-bulletin",
        pergunta: "O que e o Visa Bulletin e por que ele sai de novo todo mes?",
      },
      {
        id: "as-duas-tabelas",
        pergunta: "Por que o Visa Bulletin tem duas tabelas de datas e para que serve cada uma?",
      },
      {
        id: "como-ler-a-minha-linha",
        pergunta: "Como eu acho e leio a linha do Visa Bulletin que fala do meu caso?",
        personas: ["familias", "engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "adjustment-of-status",
    nome: "Adjustment of status (ajuste de status)",
    familia: "glossary",
    programa: "I-485",
    resumo: "O caminho de virar residente permanente sem precisar sair dos Estados Unidos.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/adjustment-of-status",
      "https://www.uscis.gov/i-485",
      "https://www.uscis.gov/tools/glossary",
    ],
    angulos: [
      {
        id: "o-que-significa-ajustar-status",
        pergunta: "O que quer dizer adjustment of status em portugues comum?",
      },
      {
        id: "vida-com-pedido-pendente",
        pergunta: "O que muda no meu dia a dia enquanto o pedido de ajuste de status esta em analise?",
        personas: ["familias", "estudantes"],
      },
      {
        id: "etapas-e-documentos",
        pergunta: "Quais etapas e exames aparecem dentro de um pedido de ajuste de status?",
      },
    ],
  },
  {
    id: "consular-processing",
    nome: "Consular processing (processamento consular)",
    familia: "glossary",
    resumo: "O caminho em que o green card e finalizado no consulado americano, fora dos Estados Unidos.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
      "https://www.uscis.gov/green-card",
      "https://www.uscis.gov/tools/glossary",
    ],
    angulos: [
      {
        id: "o-que-significa-consular-processing",
        pergunta: "O que quer dizer consular processing e por que o meu caso vai para o consulado?",
      },
      {
        id: "como-e-a-vida-de-quem-espera-fora",
        pergunta: "Como e a rotina de quem esta esperando o green card morando fora dos EUA?",
        personas: ["familias"],
      },
      {
        id: "diferenca-na-pratica",
        pergunta: "Na pratica, o que muda entre resolver no consulado e resolver dentro dos EUA?",
        personas: ["engenheiros", "medicos", "executivos"],
      },
    ],
  },
  {
    id: "petition-petitioner-beneficiary",
    nome: "Petition, petitioner e beneficiary",
    familia: "glossary",
    resumo: "Os tres termos da imigracao americana que dizem quem pede, quem recebe e o que exatamente foi pedido.",
    fontesCanonicas: [
      "https://www.uscis.gov/i-130",
      "https://www.uscis.gov/i-140",
      "https://www.uscis.gov/tools/glossary",
    ],
    angulos: [
      {
        id: "petition-nao-e-visto",
        pergunta: "O que e uma petition e por que ela nao e o visto nem o green card?",
      },
      {
        id: "quem-e-o-petitioner",
        pergunta: "Quem e o petitioner e o que essa pessoa ou empresa assume no processo?",
        personas: ["familias", "executivos", "empreendedores"],
      },
      {
        id: "quem-e-o-beneficiary",
        pergunta: "Quem e o beneficiary e por que ele depende de outra pessoa para andar com o caso?",
        personas: ["familias", "engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "rfe",
    nome: "RFE (Request for Evidence)",
    familia: "glossary",
    resumo: "A carta em que a USCIS pede mais provas antes de decidir o caso.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6",
      "https://www.uscis.gov/forms/filing-guidance",
      "https://www.uscis.gov/tools/glossary",
    ],
    angulos: [
      {
        id: "o-que-e-um-rfe",
        pergunta: "O que e um RFE e por que receber um nao quer dizer que o caso foi negado?",
      },
      {
        id: "o-que-a-uscis-quer-ver",
        pergunta: "O que costuma cair num RFE e o que a USCIS esta querendo enxergar ali?",
        personas: ["medicos", "pesquisadores", "engenheiros", "empreendedores"],
      },
      {
        id: "e-se-eu-nao-responder",
        pergunta: "O que acontece com o meu caso se eu nao responder o RFE dentro do prazo da carta?",
      },
    ],
  },
  {
    id: "noid",
    nome: "NOID (Notice of Intent to Deny)",
    familia: "glossary",
    resumo: "A carta que avisa que a USCIS pretende negar e abre uma ultima chance de resposta.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6",
      "https://www.uscis.gov/tools/glossary",
    ],
    angulos: [
      {
        id: "o-que-e-um-noid",
        pergunta: "O que e um NOID e em que ele e diferente de um RFE?",
      },
      {
        id: "o-que-o-noid-revela",
        pergunta: "Recebi um NOID. O que isso diz sobre como a USCIS esta lendo o meu caso?",
        personas: ["pesquisadores", "empreendedores", "medicos"],
      },
    ],
  },
  {
    id: "status",
    nome: "Status (status de imigracao)",
    familia: "glossary",
    resumo: "A diferenca entre ter um visto no passaporte e estar regular dentro dos Estados Unidos.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-2-part-a-chapter-4",
      "https://www.uscis.gov/visit-the-united-states/extend-your-stay",
      "https://www.uscis.gov/i-539",
    ],
    angulos: [
      {
        id: "visto-nao-e-status",
        pergunta: "Qual a diferenca entre ter visto e estar em status?",
      },
      {
        id: "perder-o-status",
        pergunta: "O que significa perder o status e onde isso comeca a doer na vida da pessoa?",
        personas: ["estudantes", "familias"],
      },
      {
        id: "extension-e-change-of-status",
        pergunta: "O que sao extension of stay e change of status e quando cada um entra na conversa?",
        personas: ["estudantes", "familias", "tecnologia"],
      },
    ],
  },
  {
    id: "green-card",
    nome: "Green Card (residencia permanente)",
    familia: "glossary",
    resumo: "O que o cartao verde de fato garante e o que ele nao garante.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card",
      "https://www.uscis.gov/green-card/after-we-grant-your-green-card",
      "https://www.uscis.gov/i-90",
    ],
    angulos: [
      {
        id: "o-que-e-green-card",
        pergunta: "O que e o Green Card e por que ele nao e a mesma coisa que cidadania?",
      },
      {
        id: "o-que-muda-na-vida",
        pergunta: "O que muda de verdade na vida de quem recebe o Green Card?",
        personas: ["familias", "engenheiros", "medicos"],
      },
      {
        id: "validade-do-cartao",
        pergunta: "Se a residencia e permanente, por que o cartao tem data de validade?",
      },
    ],
  },
  {
    id: "public-charge",
    nome: "Public charge (encargo publico)",
    familia: "glossary",
    resumo: "O termo que trata de depender de ajuda do governo americano e de como isso entra na analise de um pedido de imigracao.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/public-charge",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/public-charge/public-charge-resources",
    ],
    angulos: [
      {
        id: "o-que-quer-dizer-public-charge",
        pergunta: "O que quer dizer public charge em portugues comum?",
      },
      {
        id: "onde-isso-aparece-no-processo",
        pergunta: "Em que momento do processo alguem olha isso e o que e levado em conta?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "ead",
    nome: "EAD (Employment Authorization Document)",
    familia: "glossary",
    programa: "I-765",
    resumo: "O documento que autoriza trabalhar nos Estados Unidos e que nao e visto nem green card.",
    fontesCanonicas: [
      "https://www.uscis.gov/i-765",
      "https://www.uscis.gov/forms/explore-my-options/employment-authorization-document",
      "https://www.uscis.gov/i-9-central/form-i-9-acceptable-documents",
    ],
    angulos: [
      {
        id: "o-que-e-o-ead",
        pergunta: "O que e o EAD e por que ele nao e um visto de trabalho?",
      },
      {
        id: "onde-eu-uso-o-ead",
        pergunta: "Onde eu uso o EAD no dia a dia, na hora de ser contratado e depois?",
        personas: ["familias", "estudantes"],
      },
      {
        id: "quando-o-ead-entra-no-processo",
        pergunta: "Em que processos maiores o pedido de EAD aparece como um passo do meio?",
        personas: ["familias", "estudantes"],
      },
    ],
  },
  {
    id: "i-94",
    nome: "I-94 (registro de entrada e saida)",
    familia: "glossary",
    resumo: "O registro que diz ate quando a pessoa pode ficar no pais, e que pesa mais que a data impressa no visto.",
    fontesCanonicas: [
      "https://www.cbp.gov/travel/international-visitors/i-94",
      "https://www.uscis.gov/i-9-central/form-i-9-acceptable-documents",
      "https://www.uscis.gov/visit-the-united-states/extend-your-stay",
    ],
    angulos: [
      {
        id: "i-94-manda-mais-que-o-visto",
        pergunta: "O que e o I-94 e por que ele manda mais que a validade do meu visto?",
      },
      {
        id: "onde-vejo-e-erro-no-dado",
        pergunta: "Onde eu vejo o meu I-94 e o que fazer quando os dados dele estao errados?",
      },
      {
        id: "quem-pede-o-i-94",
        pergunta: "Quem pede o I-94 na vida real, fora da imigracao?",
        personas: ["estudantes", "familias"],
      },
    ],
  },
  {
    id: "premium-processing",
    nome: "Premium processing (analise acelerada)",
    familia: "glossary",
    programa: "I-907",
    resumo: "O servico pago que compromete a USCIS a dar uma resposta mais rapida, e o que ele nao acelera.",
    fontesCanonicas: [
      "https://www.uscis.gov/i-907",
      "https://www.uscis.gov/forms/all-forms/how-do-i-request-premium-processing",
    ],
    angulos: [
      {
        id: "o-que-o-premium-acelera",
        pergunta: "O que e premium processing e o que exatamente ele acelera?",
      },
      {
        id: "quando-nao-ajuda",
        pergunta: "Em que situacoes pagar por analise acelerada nao ajuda em nada?",
        personas: ["executivos", "empreendedores", "tecnologia"],
      },
    ],
  },
  {
    id: "dual-intent",
    nome: "Dual intent (intencao dupla)",
    familia: "glossary",
    resumo: "A ideia de estar num visto temporario e ao mesmo tempo querer morar de vez nos Estados Unidos.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-2-part-l-chapter-1",
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations/faqs-for-individuals-in-h-1b-nonimmigrant-status",
    ],
    angulos: [
      {
        id: "o-que-e-dual-intent",
        pergunta: "O que e dual intent e por que alguns vistos aceitam essa ideia e outros nao?",
      },
      {
        id: "quero-green-card-estando-em-visto-temporario",
        pergunta: "Estou num visto temporario e quero o green card. Isso pode me atrapalhar?",
        personas: ["tecnologia", "engenheiros", "executivos", "estudantes"],
      },
    ],
  },
  {
    id: "dar-entrada-dentro-ou-fora",
    nome: "Dar entrada morando dentro ou fora dos EUA",
    familia: "faq",
    resumo: "Os dois caminhos para receber o green card: ajuste de status, feito com o USCIS por quem já está nos EUA, e processo consular, feito no consulado por quem está fora.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/adjustment-of-status",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
      "https://www.uscis.gov/i-485",
    ],
    angulos: [
      {
        id: "pedir-sem-sair-do-pais",
        pergunta: "Dá para pedir o green card sem sair dos Estados Unidos?",
      },
      {
        id: "quem-decide-cada-etapa",
        pergunta: "Que parte do processo acontece no consulado e que parte acontece com o USCIS?",
      },
      {
        id: "esperar-nos-eua-ou-no-brasil",
        pergunta: "O que muda na vida de quem espera o green card morando nos EUA e de quem espera no Brasil?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "quem-pode-pedir-por-familiar",
    nome: "Quem pode pedir green card por familiar",
    familia: "faq",
    resumo: "Quais parentes um cidadão americano pode pedir, quais um residente permanente pode pedir, e como o parentesco é comprovado no pedido.",
    fontesCanonicas: [
      "https://www.uscis.gov/family/family-of-us-citizens",
      "https://www.uscis.gov/family/family-of-green-card-holders-permanent-residents",
      "https://www.uscis.gov/i-130",
    ],
    angulos: [
      {
        id: "lista-de-parentes-permitidos",
        pergunta: "Quais parentes um cidadão americano pode pedir e quais um residente não pode?",
        personas: ["familias"],
      },
      {
        id: "como-provar-o-parentesco",
        pergunta: "Como se prova que a pessoa é realmente sua mãe, seu filho ou seu irmão num pedido de green card?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "green-card-por-casamento",
    nome: "Casamento com americano e green card",
    familia: "faq",
    programa: "CR1/IR1",
    resumo: "O que o casamento com cidadão americano faz e não faz pela imigração, incluindo a residência condicional de dois anos e o pedido para retirar a condição.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-immediate-relatives-of-us-citizen",
      "https://www.uscis.gov/green-card/after-we-grant-your-green-card/conditional-permanent-residence",
      "https://www.uscis.gov/i-751",
    ],
    angulos: [
      {
        id: "casar-nao-e-automatico",
        pergunta: "Casar com americano dá green card na hora?",
        personas: ["familias"],
      },
      {
        id: "green-card-de-dois-anos",
        pergunta: "Por que o green card do casamento às vezes vem com validade curta e o que precisa ser feito depois?",
        personas: ["familias"],
      },
      {
        id: "provar-casamento-de-verdade",
        pergunta: "O que o governo americano olha para acreditar que o casamento é de verdade?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "filho-americano-e-os-pais",
    nome: "Filho nascido nos EUA e a situação dos pais",
    familia: "faq",
    programa: "IR5",
    resumo: "O que a cidadania do filho nascido nos EUA representa para os pais e a partir de quando esse filho pode pedir por eles.",
    fontesCanonicas: [
      "https://www.uscis.gov/family/family-of-us-citizens",
      "https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-immediate-relatives-of-us-citizen",
      "https://www.uscis.gov/i-130",
    ],
    angulos: [
      {
        id: "filho-pedir-pelos-pais",
        pergunta: "Filho nascido nos Estados Unidos pode pedir green card para os pais?",
        personas: ["familias"],
      },
      {
        id: "filho-nao-muda-status-dos-pais",
        pergunta: "Ter filho americano muda a situação de imigração dos pais de imediato?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "trabalhar-enquanto-espera",
    nome: "Autorização de trabalho enquanto o processo corre",
    familia: "faq",
    programa: "EAD",
    resumo: "Como funciona o documento que permite trabalhar nos EUA durante um processo de imigracao em andamento e como o empregador confere esse direito.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/information-for-employers-and-employees/employer-information/employment-authorization",
      "https://www.uscis.gov/i-765",
      "https://www.uscis.gov/i-9-central",
    ],
    angulos: [
      {
        id: "trabalhar-durante-o-processo",
        pergunta: "Dá para trabalhar legalmente enquanto o pedido de green card ainda está em análise?",
      },
      {
        id: "ead-nao-e-green-card",
        pergunta: "Autorização de trabalho e green card são a mesma coisa?",
      },
      {
        id: "como-o-empregador-confere",
        pergunta: "Como a empresa americana confere quem está autorizado a trabalhar no país?",
        personas: ["empreendedores", "executivos"],
      },
    ],
  },
  {
    id: "estudar-nos-eua",
    nome: "O que é preciso para estudar nos EUA",
    familia: "faq",
    programa: "F-1",
    resumo: "O caminho do estudante estrangeiro: escola autorizada, documento da escola, e o que a lei permite em termos de trabalho durante e depois do curso.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
    ],
    angulos: [
      {
        id: "requisitos-para-entrar-estudando",
        pergunta: "O que uma pessoa precisa ter na mão para entrar nos EUA como estudante?",
        personas: ["estudantes"],
      },
      {
        id: "estudante-pode-trabalhar",
        pergunta: "Estudante estrangeiro pode trabalhar nos Estados Unidos?",
        personas: ["estudantes"],
      },
      {
        id: "faculdade-ou-curso-tecnico",
        pergunta: "Qual a diferença entre estudar numa faculdade e fazer um curso técnico, na hora do visto?",
        personas: ["estudantes"],
      },
    ],
  },
  {
    id: "levar-conjuge-e-filhos",
    nome: "Levar cônjuge e filhos como dependentes",
    familia: "faq",
    resumo: "Como a família acompanha quem vai com visto de trabalho temporário e o que os dependentes podem fazer nos EUA.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-nonimmigrant-workers",
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager",
      "https://www.uscis.gov/i-539",
    ],
    angulos: [
      {
        id: "familia-vai-junto",
        pergunta: "Quando eu vou com visto de trabalho, meu cônjuge e meus filhos podem ir comigo?",
        personas: ["familias", "tecnologia"],
      },
      {
        id: "dependente-pode-trabalhar-ou-estudar",
        pergunta: "O cônjuge que vai como dependente pode trabalhar ou estudar nos EUA?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "visto-vencido-e-i-94",
    nome: "Visto vencido, estadia vencida e o registro I-94",
    familia: "faq",
    resumo: "A diferença entre a validade do visto e o tempo autorizado de permanência, onde esse prazo é registrado, e o efeito de ficar além do autorizado.",
    fontesCanonicas: [
      "https://www.cbp.gov/travel/international-visitors/i-94",
      "https://www.uscis.gov/visit-the-united-states/extend-your-stay",
      "https://www.uscis.gov/policy-manual/volume-8-part-o-chapter-6",
    ],
    angulos: [
      {
        id: "visto-vencido-nao-e-estadia-vencida",
        pergunta: "Visto vencido e estadia vencida são a mesma coisa?",
      },
      {
        id: "onde-ver-ate-quando-posso-ficar",
        pergunta: "Onde eu vejo até quando posso ficar nos Estados Unidos nesta viagem?",
      },
      {
        id: "efeito-de-ficar-alem-do-prazo",
        pergunta: "O que acontece com quem fica mais tempo do que podia e depois sai do país?",
      },
    ],
  },
  {
    id: "manter-green-card-morando-fora",
    nome: "Manter o green card passando temporadas fora",
    familia: "faq",
    resumo: "O green card exige morar nos EUA de fato, e existe um pedido específico para quem precisa passar um longo período fora sem abandonar a residência.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/after-we-grant-your-green-card/maintaining-permanent-residence",
      "https://www.uscis.gov/green-card/after-we-grant-your-green-card/international-travel-as-a-permanent-resident",
      "https://www.uscis.gov/i-131",
    ],
    angulos: [
      {
        id: "residente-pode-morar-fora",
        pergunta: "Quem tem green card pode continuar morando fora dos Estados Unidos?",
        personas: ["familias", "executivos"],
      },
      {
        id: "o-que-fazer-antes-de-viagem-longa",
        pergunta: "O que o residente precisa resolver antes de passar um longo período fora dos EUA?",
        personas: ["executivos", "empreendedores"],
      },
    ],
  },
  {
    id: "virar-cidadao-americano",
    nome: "Do green card à cidadania americana",
    familia: "faq",
    programa: "N-400",
    resumo: "Os requisitos gerais da naturalização, o que é cobrado no exame e como ausências longas dos EUA afetam o pedido.",
    fontesCanonicas: [
      "https://www.uscis.gov/citizenship/apply-for-citizenship",
      "https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test",
      "https://www.uscis.gov/policy-manual/volume-12-part-d-chapter-3",
    ],
    angulos: [
      {
        id: "quando-posso-pedir-cidadania",
        pergunta: "Depois de tirar o green card, quando dá para pedir a cidadania americana?",
      },
      {
        id: "o-que-cai-na-prova",
        pergunta: "O que cai na prova de cidadania americana?",
      },
      {
        id: "viagens-longas-atrasam",
        pergunta: "Passar muito tempo fora dos EUA pode atrasar o pedido de cidadania?",
        personas: ["executivos", "familias"],
      },
    ],
  },
  {
    id: "eb1a-x-eb2-niw",
    nome: "EB-1A comparado ao EB-2 NIW",
    familia: "comparison",
    programa: "EB-1A x EB-2 NIW",
    resumo: "Comparacao entre os dois caminhos de green card por trabalho em que a propria pessoa pode entrar com o pedido, sem depender de uma empresa que a contrate.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-5",
    ],
    angulos: [
      {
        id: "semelhancas-e-diferencas",
        pergunta: "Em que o EB-1A e o EB-2 NIW se parecem e onde eles de fato se separam?",
        personas: ["pesquisadores", "medicos", "engenheiros", "tecnologia"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que tipo de trajetoria profissional costuma se encaixar em cada um desses dois caminhos?",
        personas: ["pesquisadores", "medicos", "executivos"],
      },
      {
        id: "tipo-de-prova-de-cada-um",
        pergunta: "Que tipo de prova cada um desses dois pedidos costuma exigir da pessoa?",
        personas: ["pesquisadores", "engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "h1b-x-o1a",
    nome: "H-1B comparado ao O-1A",
    familia: "comparison",
    programa: "H-1B x O-1A",
    resumo: "Comparacao entre dois vistos temporarios de trabalho que a mesma pessoa qualificada as vezes cogita, mas que partem de logicas diferentes.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/o-1-visa-individuals-with-extraordinary-ability-or-achievement",
      "https://www.uscis.gov/policy-manual/volume-2-part-m-chapter-4",
    ],
    angulos: [
      {
        id: "semelhancas-e-diferencas",
        pergunta: "H-1B e O-1A servem para a mesma coisa? Onde os dois se encontram e onde se separam?",
        personas: ["tecnologia", "engenheiros", "pesquisadores"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que tipo de situacao de trabalho aponta para o H-1B e que tipo aponta para o O-1A?",
        personas: ["tecnologia", "executivos", "engenheiros"],
      },
      {
        id: "papel-da-empresa",
        pergunta: "Quem entra com o pedido em cada um dos dois, e o que muda no papel da empresa?",
        personas: ["executivos", "tecnologia"],
      },
    ],
  },
  {
    id: "ajuste-de-status-x-processo-consular",
    nome: "Ajuste de status comparado ao processo consular",
    familia: "comparison",
    resumo: "Comparacao entre as duas formas de chegar ao green card depois que o pedido base foi aprovado: terminar o processo dentro dos EUA ou termina-lo num consulado americano fora do pais.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/adjustment-of-status",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
      "https://www.uscis.gov/policy-manual/volume-7-part-b-chapter-2",
    ],
    angulos: [
      {
        id: "semelhancas-e-diferencas",
        pergunta: "Ajuste de status e processo consular levam ao mesmo green card? Onde os dois caminhos se separam?",
        personas: ["familias", "estudantes", "tecnologia"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que tipo de situacao leva a pessoa para o ajuste de status e que tipo leva para o consulado?",
        personas: ["familias", "estudantes"],
      },
      {
        id: "vida-durante-a-espera",
        pergunta: "O que muda no dia a dia de quem espera dentro dos EUA e de quem espera fora do pais?",
        personas: ["familias", "estudantes"],
      },
    ],
  },
  {
    id: "visto-imigrante-x-nao-imigrante",
    nome: "Visto de imigrante comparado ao visto de nao imigrante",
    familia: "comparison",
    resumo: "Comparacao entre as duas grandes familias de visto americano, que e a divisao que organiza praticamente todo o resto do assunto.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card",
      "https://www.uscis.gov/working-in-the-united-states/temporary-nonimmigrant-workers",
      "https://www.uscis.gov/green-card/green-card-eligibility-categories",
    ],
    angulos: [
      {
        id: "qual-a-diferenca-real",
        pergunta: "Qual e a diferenca real entre um visto de imigrante e um visto de nao imigrante?",
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que tipo de plano de vida aponta para cada uma dessas duas familias de visto?",
      },
      {
        id: "intencao-dupla",
        pergunta: "Existe visto temporario que aceita quem tambem pretende ficar de vez nos EUA?",
        personas: ["tecnologia", "executivos", "estudantes"],
      },
    ],
  },
  {
    id: "green-card-trabalho-x-familia",
    nome: "Green Card por trabalho comparado ao Green Card por familia",
    familia: "comparison",
    resumo: "Comparacao entre as duas portas de entrada mais usadas para a residencia permanente americana: a profissional e a familiar.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-eligibility-categories",
      "https://www.uscis.gov/green-card/green-card-eligibility/green-card-for-employment-based-immigrants",
      "https://www.uscis.gov/family/family-of-us-citizens",
    ],
    angulos: [
      {
        id: "semelhancas-e-diferencas",
        pergunta: "Green card por trabalho e green card por familia dao o mesmo documento no fim? Onde os dois se separam?",
        personas: ["familias"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que tipo de situacao de vida aponta para o caminho do trabalho e que tipo aponta para o da familia?",
        personas: ["familias", "empreendedores", "tecnologia"],
      },
      {
        id: "quem-patrocina",
        pergunta: "Quem precisa de alguem patrocinando o pedido em cada um desses dois caminhos?",
        personas: ["familias", "executivos"],
      },
    ],
  },
  {
    id: "f1-opt-x-h1b",
    nome: "F-1 com OPT comparado ao H-1B",
    familia: "comparison",
    programa: "F-1 OPT x H-1B",
    resumo: "Comparacao entre as duas formas mais comuns de um recem formado trabalhar legalmente nos EUA, uma ligada ao curso e a outra ligada a empresa.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
      "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment",
    ],
    angulos: [
      {
        id: "semelhancas-e-diferencas",
        pergunta: "OPT e H-1B sao a mesma coisa? Em que os dois se parecem e onde diferem?",
        personas: ["estudantes", "tecnologia"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que momento da vida do estudante aponta para o OPT e qual aponta para o H-1B?",
        personas: ["estudantes"],
      },
      {
        id: "de-quem-depende",
        pergunta: "Cada uma dessas duas autorizacoes depende de quem: da faculdade, da empresa ou do governo?",
        personas: ["estudantes", "tecnologia", "executivos"],
      },
    ],
  },
  {
    id: "e2-x-eb5",
    nome: "E-2 comparado ao EB-5",
    familia: "comparison",
    programa: "E-2 x EB-5",
    resumo: "Comparacao entre os dois caminhos americanos ligados a investimento, um temporario e ligado a um negocio que a pessoa opera, o outro voltado a residencia permanente.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/e-2-treaty-investors",
      "https://www.uscis.gov/eb-5",
    ],
    angulos: [
      {
        id: "semelhancas-e-diferencas",
        pergunta: "E-2 e EB-5 sao os dois vistos de investidor? Em que se parecem e onde se separam?",
        personas: ["empreendedores", "executivos"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que tipo de projeto de negocio aponta para cada um desses dois caminhos?",
        personas: ["empreendedores", "executivos"],
      },
      {
        id: "peso-da-nacionalidade",
        pergunta: "A nacionalidade da pessoa muda o acesso a esses dois caminhos? Por que isso importa para brasileiro.",
        personas: ["empreendedores"],
      },
    ],
  },
  {
    id: "eb2-niw-x-eb2-com-perm",
    nome: "EB-2 NIW comparado ao EB-2 com oferta de emprego",
    familia: "comparison",
    programa: "EB-2 NIW x EB-2 PERM",
    resumo: "Comparacao entre as duas rotas dentro da mesma categoria EB-2, uma que passa pela empresa e pelo teste de mercado de trabalho e outra que pede a dispensa desse teste.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-5",
      "https://www.dol.gov/agencies/eta/foreign-labor/programs/permanent",
    ],
    angulos: [
      {
        id: "e-visto-separado-ou-variacao",
        pergunta: "O EB-2 NIW e um visto separado ou uma variacao do EB-2? O que exatamente ele dispensa?",
        personas: ["pesquisadores", "medicos", "engenheiros", "tecnologia"],
      },
      {
        id: "situacao-tipica-de-cada-um",
        pergunta: "Que situacao profissional aponta para o EB-2 com oferta de emprego e qual aponta para o NIW?",
        personas: ["pesquisadores", "medicos", "engenheiros"],
      },
      {
        id: "teste-de-mercado-de-trabalho",
        pergunta: "O que e esse teste de mercado de trabalho que aparece no EB-2 comum e nao aparece no NIW?",
        personas: ["executivos", "engenheiros", "tecnologia"],
      },
    ],
  },
  {
    id: "etapas-green-card-por-emprego",
    nome: "As etapas de um green card por emprego",
    familia: "process_explainer",
    programa: "EB",
    resumo: "A sequencia completa de um pedido de residencia baseado em trabalho, da primeira etapa ate o cartao chegar pelo correio.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures",
      "https://www.dol.gov/agencies/eta/foreign-labor/programs/permanent",
    ],
    angulos: [
      {
        id: "sequencia-das-etapas",
        pergunta: "Quais sao as etapas, em ordem, de um green card conseguido pelo trabalho?",
        personas: ["engenheiros", "tecnologia", "executivos"],
      },
      {
        id: "tres-orgaos-do-governo",
        pergunta: "Por que o meu processo passa por tres orgaos diferentes do governo americano antes de terminar?",
        personas: ["engenheiros", "tecnologia", "pesquisadores"],
      },
    ],
  },
  {
    id: "peticao-e-peticionario",
    nome: "A peticao e quem a apresenta",
    familia: "process_explainer",
    resumo: "O que e a peticao de imigrante, primeiro passo do pedido de green card, quem assina e qual o papel de quem vai imigrar.",
    fontesCanonicas: [
      "https://www.uscis.gov/i-140",
      "https://www.uscis.gov/i-130",
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers",
    ],
    angulos: [
      {
        id: "o-que-e-uma-peticao",
        pergunta: "O que e uma peticao de imigrante e por que ela vem antes de qualquer outra coisa?",
      },
      {
        id: "peticionario-vs-beneficiario",
        pergunta: "Qual a diferenca entre peticionario e beneficiario, e por que isso mexe com o meu poder de decisao no processo?",
        personas: ["engenheiros", "tecnologia", "executivos"],
      },
      {
        id: "posso-me-peticionar",
        pergunta: "Existe caminho em que eu mesmo apresento o pedido, sem empresa e sem parente?",
        personas: ["pesquisadores", "medicos", "empreendedores"],
      },
    ],
  },
  {
    id: "certificacao-de-trabalho-dol",
    nome: "A etapa da certificacao de trabalho (PERM)",
    familia: "process_explainer",
    programa: "PERM",
    resumo: "Por que boa parte dos pedidos por emprego passa antes pelo Departamento do Trabalho e o que essa etapa examina.",
    fontesCanonicas: [
      "https://www.dol.gov/agencies/eta/foreign-labor/programs/permanent",
      "https://www.dol.gov/agencies/eta/foreign-labor",
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers",
    ],
    angulos: [
      {
        id: "por-que-existe-essa-etapa",
        pergunta: "Por que existe uma etapa no Departamento do Trabalho antes do pedido de green card?",
      },
      {
        id: "o-que-a-empresa-precisa-provar",
        pergunta: "O que a empresa precisa provar nessa etapa, e o que isso exige dela na pratica?",
        personas: ["engenheiros", "tecnologia", "executivos"],
      },
      {
        id: "quem-nao-passa-por-ela",
        pergunta: "Quais caminhos pulam essa etapa do Departamento do Trabalho?",
        personas: ["pesquisadores", "medicos", "empreendedores"],
      },
    ],
  },
  {
    id: "depois-da-peticao-aprovada",
    nome: "O que acontece depois da peticao aprovada",
    familia: "process_explainer",
    resumo: "Peticao aprovada nao e green card: dali o caso segue por dentro dos EUA ou pelo consulado, com orgaos diferentes cuidando dele.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/adjustment-of-status",
      "https://www.uscis.gov/i-485",
    ],
    angulos: [
      {
        id: "aprovacao-nao-e-o-cartao",
        pergunta: "Minha peticao foi aprovada. Isso ja e o green card?",
      },
      {
        id: "dentro-dos-eua-ou-no-consulado",
        pergunta: "O que decide se eu termino o processo dentro dos EUA ou no consulado do meu pais?",
        personas: ["estudantes", "engenheiros", "tecnologia"],
      },
      {
        id: "quem-cuida-do-caso-agora",
        pergunta: "Depois da aprovacao, quem passa a cuidar do meu caso: o USCIS, o centro nacional de vistos ou o consulado?",
      },
    ],
  },
  {
    id: "entrevista-consular",
    nome: "A entrevista no consulado",
    familia: "process_explainer",
    resumo: "Como funciona a etapa da entrevista consular, quem convoca e o que esta sendo decidido naquele dia.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/adjustment-of-status",
    ],
    angulos: [
      {
        id: "como-funciona-o-dia",
        pergunta: "Como funciona a entrevista no consulado, do agendamento ate sair a resposta?",
        personas: ["familias"],
      },
      {
        id: "o-que-o-oficial-decide",
        pergunta: "O que o oficial esta decidindo na entrevista, e o que ele nao decide?",
      },
      {
        id: "consulado-vs-uscis",
        pergunta: "Entrevista no consulado e entrevista do USCIS dentro dos EUA sao a mesma coisa?",
        personas: ["estudantes", "engenheiros"],
      },
    ],
  },
  {
    id: "exame-medico-imigracao",
    nome: "O exame medico da imigracao",
    familia: "process_explainer",
    resumo: "A etapa do exame medico obrigatorio: para que serve, quem pode fazer e por que o resultado vem lacrado.",
    fontesCanonicas: [
      "https://www.uscis.gov/i-693",
      "https://www.uscis.gov/tools/designated-civil-surgeons",
      "https://www.uscis.gov/policy-manual/volume-8-part-b-chapter-3",
    ],
    angulos: [
      {
        id: "para-que-serve",
        pergunta: "Por que a imigracao exige exame medico e o que exatamente ele examina?",
        personas: ["familias"],
      },
      {
        id: "quem-pode-fazer",
        pergunta: "Por que nao vale o exame feito pelo meu medico de sempre?",
        personas: ["medicos"],
      },
      {
        id: "envelope-lacrado",
        pergunta: "Por que o resultado vem num envelope lacrado que eu nao posso abrir?",
      },
    ],
  },
  {
    id: "taxa-de-imigrante-uscis",
    nome: "A taxa de imigrante do USCIS",
    familia: "process_explainer",
    resumo: "A etapa de pagamento que aparece depois do visto de imigrante aprovado e antes do cartao ser produzido.",
    fontesCanonicas: [
      "https://www.uscis.gov/forms/filing-fees/uscis-immigrant-fee",
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
    ],
    angulos: [
      {
        id: "por-que-existe-essa-cobranca",
        pergunta: "Meu visto de imigrante saiu. Por que ainda aparece uma taxa antes de eu viajar?",
        personas: ["familias"],
      },
      {
        id: "e-se-eu-nao-pagar",
        pergunta: "O que acontece com o meu cartao, e com a minha situacao, se essa taxa nao for paga?",
      },
    ],
  },
  {
    id: "chegada-aos-eua",
    nome: "A chegada aos EUA com visto de imigrante",
    familia: "process_explainer",
    resumo: "O que acontece na primeira entrada com o visto na mao, como a entrada fica registrada e o que vale enquanto o cartao nao chega.",
    fontesCanonicas: [
      "https://www.uscis.gov/green-card/green-card-processes-and-procedures/consular-processing",
      "https://www.cbp.gov/travel/international-visitors/i-94",
      "https://www.uscis.gov/forms/filing-fees/uscis-immigrant-fee",
    ],
    angulos: [
      {
        id: "no-aeroporto",
        pergunta: "O que acontece no aeroporto quando eu chego com o visto de imigrante na mao?",
        personas: ["familias"],
      },
      {
        id: "quem-decide-a-entrada",
        pergunta: "Quem decide de verdade se eu entro nos EUA: o consulado que deu o visto ou o oficial do aeroporto?",
      },
      {
        id: "prova-antes-do-cartao",
        pergunta: "O cartao vem pelo correio depois. O que prova que eu sou residente enquanto ele nao chega?",
        personas: ["familias", "estudantes"],
      },
    ],
  },
  {
    id: "cartas-de-recomendacao",
    nome: "Cartas de recomendacao e cartas de especialista",
    familia: "evidence_education",
    resumo: "O que sao as cartas de terceiros que acompanham uma peticao de imigracao, quem as escreve e que peso elas tem diante de prova documental independente.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-2",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-5",
      "https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6",
    ],
    angulos: [
      {
        id: "quem-escreve-e-o-que-a-carta-mostra",
        pergunta: "Quem deve escrever uma carta de recomendacao num pedido de imigracao e o que essa carta precisa mostrar sobre o meu trabalho?",
        personas: ["pesquisadores", "medicos", "engenheiros", "tecnologia"],
      },
      {
        id: "carta-nao-substitui-prova-independente",
        pergunta: "Se eu juntar muitas cartas elogiosas, isso resolve? Por que carta nao substitui prova que existe fora dela?",
        personas: ["pesquisadores", "empreendedores", "executivos"],
      },
    ],
  },
  {
    id: "publicacoes-premios-e-reconhecimento",
    nome: "Publicacoes, citacoes e premios como prova de reconhecimento",
    familia: "evidence_education",
    resumo: "Como o reconhecimento externo no seu campo entra numa peticao de imigracao: o que voce publicou, o que foi publicado sobre voce, citacoes e premios.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-2",
      "https://www.uscis.gov/policy-manual/volume-2-part-m-chapter-4",
    ],
    angulos: [
      {
        id: "artigo-meu-versus-materia-sobre-mim",
        pergunta: "Qual a diferenca entre um artigo que eu escrevi e uma materia publicada sobre mim, e como as citacoes entram nessa conta?",
        personas: ["pesquisadores", "medicos", "estudantes"],
      },
      {
        id: "o-que-faz-um-premio-contar",
        pergunta: "Premio da propria empresa, premio de associacao, premio internacional: o que faz um reconhecimento contar como prova e o que tende a pesar pouco?",
        personas: ["pesquisadores", "engenheiros", "tecnologia", "empreendedores"],
      },
    ],
  },
  {
    id: "curriculo-diploma-e-experiencia",
    nome: "Curriculo, diploma estrangeiro e comprovacao de experiencia",
    familia: "evidence_education",
    resumo: "Os documentos que descrevem a sua trajetoria numa peticao de imigracao: o curriculo, o diploma tirado fora dos EUA e a prova dos anos de trabalho.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-5",
      "https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6",
    ],
    angulos: [
      {
        id: "cv-para-peticao-nao-e-cv-de-vaga",
        pergunta: "O que e um curriculo feito para um pedido de imigracao e por que ele nao e o mesmo curriculo que eu mando para uma vaga?",
        personas: ["pesquisadores", "engenheiros", "tecnologia", "medicos"],
      },
      {
        id: "diploma-de-fora-e-anos-de-trabalho",
        pergunta: "Como eu comprovo um diploma feito no Brasil e os anos de experiencia que eu tenho na minha area?",
        personas: ["engenheiros", "medicos", "estudantes", "tecnologia"],
      },
    ],
  },
  {
    id: "contratos-e-ofertas-de-trabalho",
    nome: "Contrato, oferta de trabalho e itinerario",
    familia: "evidence_education",
    resumo: "Como o vinculo de trabalho nos EUA aparece nos documentos de um pedido de imigracao: o que o contrato ou a oferta precisa dizer, como o empregador mostra que consegue pagar e o que se apresenta quando nao existe um empregador fixo.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/o-1-visa-individuals-with-extraordinary-ability-or-achievement",
      "https://www.uscis.gov/policy-manual/volume-2-part-m-chapter-3",
      "https://www.uscis.gov/policy-manual/volume-6-part-e-chapter-4",
    ],
    angulos: [
      {
        id: "o-que-o-contrato-precisa-dizer",
        pergunta: "O que precisa estar escrito no contrato ou na oferta de trabalho que vai junto com a peticao, e o que acontece quando o acordo foi so verbal?",
        personas: ["executivos", "tecnologia", "engenheiros"],
      },
      {
        id: "empresa-prova-que-consegue-pagar",
        pergunta: "Como a empresa que me contrata prova que tem dinheiro para pagar o salario que ela prometeu?",
        personas: ["executivos", "empreendedores", "tecnologia"],
      },
      {
        id: "sem-empregador-fixo-agente-e-itinerario",
        pergunta: "Eu trabalho por projeto, com varios contratantes. Como se documenta isso quando nao ha um empregador unico?",
        personas: ["empreendedores", "tecnologia"],
      },
    ],
  },
  {
    id: "comprovacao-de-investimento",
    nome: "Comprovacao da origem do dinheiro investido",
    familia: "evidence_education",
    programa: "EB-5",
    resumo: "O que significa demonstrar que o capital investido veio de origem licita e como se documenta o caminho do dinheiro desde onde ele foi ganho.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-6-part-g-chapter-2",
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/eb-5-immigrant-investor-program",
      "https://www.uscis.gov/i-526e",
    ],
    angulos: [
      {
        id: "o-que-e-origem-licita-do-dinheiro",
        pergunta: "O que quer dizer provar que o dinheiro do investimento tem origem licita, e que tipo de documento mostra isso?",
        personas: ["empreendedores", "executivos"],
      },
      {
        id: "caminho-do-dinheiro-venda-emprestimo-doacao",
        pergunta: "Vendi um imovel, peguei emprestimo ou recebi dinheiro de um familiar. Como se mostra o caminho desse dinheiro ate o investimento?",
        personas: ["empreendedores", "executivos", "familias"],
      },
    ],
  },
  {
    id: "renda-do-patrocinador",
    nome: "Comprovacao de renda de quem patrocina",
    familia: "evidence_education",
    programa: "I-864",
    resumo: "Como funciona a prova de que o patrocinador tem renda suficiente para sustentar o imigrante num pedido de green card, e que documentos financeiros entram nessa demonstracao.",
    fontesCanonicas: [
      "https://www.uscis.gov/i-864",
      "https://www.uscis.gov/i-864p",
    ],
    angulos: [
      {
        id: "documentos-de-renda-do-patrocinador",
        pergunta: "Que documentos o patrocinador precisa apresentar para mostrar quanto ele ganha, e por que a declaracao de imposto e o centro disso?",
        personas: ["familias"],
      },
      {
        id: "quando-a-renda-nao-alcanca-o-minimo",
        pergunta: "A renda de quem me patrocina nao alcanca o minimo exigido. Que outras provas a regra admite nesse caso?",
        personas: ["familias"],
      },
    ],
  },
  {
    id: "traducao-de-documentos",
    nome: "Traducao e formato de documentos estrangeiros",
    familia: "evidence_education",
    resumo: "A exigencia da imigracao americana de traducao completa para o ingles com certificacao do tradutor, e a diferenca entre mandar copia e mandar documento original.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-1-part-e-chapter-6",
    ],
    angulos: [
      {
        id: "juramentada-ou-certificada",
        pergunta: "Documento em portugues precisa de traducao juramentada para os EUA, ou o que se exige e outra coisa?",
      },
      {
        id: "copia-ou-original",
        pergunta: "Eu mando copia dos meus documentos ou preciso enviar o original?",
      },
    ],
  },
  {
    id: "medicos-caminhos",
    nome: "Médicos formados fora dos EUA: caminhos que costumam aparecer",
    familia: "professional_education",
    resumo: "Panorama dos caminhos migratórios que mais aparecem na vida de quem se formou em medicina fora dos EUA e quer atuar como médico lá.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-6",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/conrad-30-waiver-program",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/exchange-visitors",
    ],
    angulos: [
      {
        id: "quais-caminhos-medico",
        pergunta: "Que caminhos aparecem com mais frequência para quem se formou em medicina fora dos EUA?",
        personas: ["medicos"],
      },
      {
        id: "area-carente-por-que-aparece",
        pergunta: "Por que trabalhar em região com falta de médico aparece tanto na conversa de imigração médica?",
        personas: ["medicos"],
      },
      {
        id: "residencia-como-etapa",
        pergunta: "Onde entra a residência americana nessa história, e por que ela costuma ser uma etapa e não um atalho?",
        personas: ["medicos", "estudantes"],
      },
    ],
  },
  {
    id: "medicos-licenca-certificacao",
    nome: "Licença e certificação para exercer medicina nos EUA",
    familia: "professional_education",
    resumo: "Como funcionam, como conceito, a certificação de médico formado no exterior e a licença estadual para atuar nos EUA, e por que nada disso é a mesma coisa que visto.",
    fontesCanonicas: [
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-6",
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/health-care-worker-certification",
    ],
    angulos: [
      {
        id: "quem-da-a-licenca",
        pergunta: "Quem dá a licença para um médico atuar nos EUA, e por que ela não vem junto com o visto?",
        personas: ["medicos"],
      },
      {
        id: "reconhecer-diploma-medicina",
        pergunta: "O que os EUA costumam pedir para reconhecer um diploma de medicina feito fora do país?",
        personas: ["medicos"],
      },
      {
        id: "licenca-por-estado",
        pergunta: "Se eu tiver licença em um estado americano, ela vale nos outros?",
        personas: ["medicos"],
      },
    ],
  },
  {
    id: "engenheiros",
    nome: "Engenheiros",
    familia: "professional_education",
    resumo: "Caminhos migratórios que costumam aparecer para engenheiros e o tipo de comprovação de formação e experiência que aparece nesses processos.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-second-preference-eb-2",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-5",
    ],
    angulos: [
      {
        id: "quais-caminhos-engenheiro",
        pergunta: "Que caminhos migratórios aparecem com mais frequência para engenheiro?",
        personas: ["engenheiros"],
      },
      {
        id: "diploma-e-experiencia",
        pergunta: "Como os EUA costumam olhar um diploma de engenharia brasileiro e os anos de experiência?",
        personas: ["engenheiros"],
      },
    ],
  },
  {
    id: "pesquisadores-academicos",
    nome: "Pesquisadores e professores universitários",
    familia: "professional_education",
    resumo: "Caminhos que costumam aparecer para quem faz pesquisa ou dá aula em universidade, e o que costuma servir de prova de reconhecimento na área.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-3",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/exchange-visitors",
    ],
    angulos: [
      {
        id: "quais-caminhos-pesquisador",
        pergunta: "Que caminhos aparecem com mais frequência para pesquisador e professor universitário?",
        personas: ["pesquisadores"],
      },
      {
        id: "prova-de-reconhecimento",
        pergunta: "O que costuma valer como prova de que um pesquisador é reconhecido na área dele?",
        personas: ["pesquisadores"],
      },
      {
        id: "bolsa-e-intercambio",
        pergunta: "Vir com bolsa ou como pesquisador visitante muda a conversa de ficar de vez?",
        personas: ["pesquisadores", "estudantes"],
      },
    ],
  },
  {
    id: "profissionais-tecnologia",
    nome: "Profissionais de tecnologia",
    familia: "professional_education",
    resumo: "Caminhos migratórios que costumam aparecer para quem trabalha em tecnologia e o peso que diploma, área de formação e cargo têm nesses processos.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
      "https://www.uscis.gov/policy-manual/volume-2-part-h",
      "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-extension-for-stem-students-stem-opt",
    ],
    angulos: [
      {
        id: "quais-caminhos-tech",
        pergunta: "Que caminhos aparecem com mais frequência para quem trabalha em tecnologia?",
        personas: ["tecnologia"],
      },
      {
        id: "sem-diploma-na-area",
        pergunta: "Quem é autodidata ou fez faculdade de outra área tem o mesmo tipo de caminho de quem é formado em computação?",
        personas: ["tecnologia"],
      },
      {
        id: "do-estudo-ao-emprego",
        pergunta: "Como funciona, como conceito, a ponte entre estudar tecnologia nos EUA e trabalhar lá depois?",
        personas: ["tecnologia", "estudantes"],
      },
    ],
  },
  {
    id: "executivos-e-gerentes",
    nome: "Executivos e gerentes",
    familia: "professional_education",
    resumo: "Caminhos migratórios que costumam aparecer para quem é transferido por empresa ou ocupa cargo de gestão, e o que os EUA entendem por gerente e executivo nesse contexto.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/l-1a-intracompany-transferee-executive-or-manager",
      "https://www.uscis.gov/policy-manual/volume-2-part-l-chapter-3",
      "https://www.uscis.gov/policy-manual/volume-6-part-f-chapter-4",
    ],
    angulos: [
      {
        id: "quais-caminhos-executivo",
        pergunta: "Que caminhos aparecem com mais frequência para executivo transferido pela própria empresa?",
        personas: ["executivos"],
      },
      {
        id: "o-que-e-ser-gerente",
        pergunta: "O que os EUA entendem por gerente e executivo quando olham um cargo de gestão?",
        personas: ["executivos", "empreendedores"],
      },
    ],
  },
  {
    id: "empreendedores-e-fundadores",
    nome: "Empreendedores e fundadores de empresa",
    familia: "professional_education",
    resumo: "Caminhos que costumam aparecer para quem quer abrir, comprar ou levar um negócio para os EUA, e por que ter empresa não é a mesma coisa que ter caminho migratório.",
    fontesCanonicas: [
      "https://www.uscis.gov/working-in-the-united-states/options-for-noncitizen-entrepreneurs-to-work-in-the-united-states",
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/e-2-treaty-investors",
      "https://www.uscis.gov/eb-5",
    ],
    angulos: [
      {
        id: "quais-caminhos-empreendedor",
        pergunta: "Que caminhos aparecem com mais frequência para quem quer empreender nos EUA?",
        personas: ["empreendedores"],
      },
      {
        id: "empresa-nao-e-visto",
        pergunta: "Abrir uma empresa nos EUA dá direito a morar lá?",
        personas: ["empreendedores"],
      },
      {
        id: "investidor-por-tratado",
        pergunta: "Por que o caminho de investidor por tratado depende do país do passaporte?",
        personas: ["empreendedores"],
      },
    ],
  },
];
