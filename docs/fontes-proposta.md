# Fontes de notícia, auditoria e proposta

Levantamento feito com a coleta real de 05/09/2026, uma janela de 24h, 211
candidatas e 198 grupos depois da deduplicação do dia. Cada feed candidato
abaixo foi buscado antes de entrar nesta lista: os números de itens são o que a
URL devolveu no teste, não estimativa.

## O que a auditoria mostrou

| fonte | coletadas | aprovadas | US negativa | baixa relevância |
| --- | --- | --- | --- | --- |
| Google News, ICE / immigration court / asylum | 62 | 1 | 43 | 14 |
| Google News, STF e crise institucional | 50 | 0 | 0 | 34 |
| Google News, reforma tributária | 25 | 0 | 0 | 20 |
| G1 Política | 20 | 1 | 0 | 11 |
| Google News, câmbio e juros | 13 | 0 | 2 | 2 |
| Google News, USCIS / green card / H-1B | 10 | 1 | 6 | 2 |
| Google News, visto americano (PT) | 5 | 0 | 5 | 0 |
| Google News, deportação / ICE (PT) | 5 | 0 | 5 | 0 |
| Google News, visa bulletin / priority date | 2 | 0 | 1 | 0 |
| CBS, NPR, e as demais | 1 cada | 0 | 1 cada | 0 |

Cinco fontes habilitadas não trouxeram nada na janela: Federal Register de
imigração, State Dept de avisos de viagem, G1 Mundo, G1 Economia e a busca de
asilo em português. Não é falha delas: são fontes de baixa frequência, e a
janela de 24h corta o que elas publicam a cada dois ou três dias.

## Manter

- **G1 Política**. Melhor fonte do eixo Brasil, e foi de onde saiu a pauta
  aprovada do dia.
- **Google News, USCIS policy / fees / processing**. Uma coletada, uma
  aprovada.
- **Google News, USCIS / green card / H-1B**. Rende, apesar do ruído.
- **Federal Register de imigração** e **State Dept de avisos**. Fonte primária,
  volume baixo por natureza. Valem pela confiabilidade, não pelo volume.

## Reduzir ou remover

- **Google News, ICE / immigration court / asylum**. É a pior relação da lista:
  62 pautas, 1 aprovada, 43 recusadas por serem desfavoráveis aos EUA. Além
  disso, o termo solto "ICE" casa com gelo, e por isso entraram sorvete de
  morango, hóquei e som sob o gelo do Ártico. Se ficar, precisa perder o termo
  solto e ganhar aspas nos termos compostos.
- **Google News, deportação / ICE (PT)** e **visto americano / green card
  (PT)**. Dez pautas somadas, dez recusadas, todas desfavoráveis. A imprensa
  brasileira cobre imigração americana quase só pelo ângulo do drama.
- **Google News, reforma tributária**. Vinte e cinco pautas, nenhuma aprovada:
  o que chega é palestra municipal do Sebrae e obrigação acessória de campo de
  nota fiscal. A query precisa mirar mudança de alíquota, tributação de
  investimento, herança e patrimônio.
- **Google News, STF**. Cinquenta pautas, nenhuma aprovada, porque o que chega
  é bastidor e disputa de cargo. O G1 Política cobre o mesmo eixo com muito
  menos ruído.
- **CBS e NPR**. Uma pauta cada, ambas recusadas. Feed nacional genérico não
  entrega o recorte da publicação.

## Adicionar

Todos testados hoje. O número é o que a URL devolveu na hora do teste.

| fonte | itens | por que |
| --- | --- | --- |
| Google News, `site:uscis.gov` | 100 | Anúncio oficial do USCIS indexado. Resolve o feed próprio do USCIS, que responde 200 e vem vazio. |
| Google News, `"visa bulletin" OR "priority date"` | 24 | Fila e avanço de data, que é o que muda o plano de quem espera. |
| Google News, `H-1B OR "EB-2" OR "EB-3" OR "national interest waiver"` | 100 | Imigração profissional, o caminho do público. |
| Google News, `"EB-5" OR "investor visa" OR "O-1 visa"` | 100 | Investidor e talento extraordinário. |
| Federal Register, agência USCIS | 3 | Regra publicada, fonte primária. |
| Federal Register, termo USCIS | 14 | Pega o que a agência não assina sozinha. |
| Federal Register, Employment and Training Administration | 11 | PERM, H-2A e H-2B saem por aqui. |
| state.gov, press releases | 10 | Consulado e política de visto. |
| trade.gov | 10 | Negócio e investimento nos EUA. |

## Testadas e indisponíveis

Estas bloqueiam ou não existem no endereço esperado. Não há solução sem chave
de API ou sem contornar o bloqueio, e nenhuma das duas coisas vou fazer por
conta própria:

- Department of Labor, `dol.gov/rss/releases.xml`: 403.
- Bureau of Labor Statistics, `bls.gov/feed/news_release.rss`: 403. Existe API
  pública, com chave.
- Department of Commerce: 403.
- Bureau of Economic Analysis e SBA: 404 no endereço público de RSS. A BEA tem
  API com chave.
- SelectUSA: a resposta chega, mas a conexão fecha de um jeito que o cliente
  não conclui.
- USCIS, feed próprio `uscis.gov/news/rss-feed/59`: responde 200 com o canal
  vazio, sem nenhum item.

## Uma correção que não é de fonte

A janela de coleta é de 24h e só abre para 36h ou 48h quando sobram menos de
quatro candidatas no total. Como as buscas de fiscalização trazem sessenta
itens por dia sozinhas, esse limite nunca é atingido, e as fontes boas de baixa
frequência ficam de fora justamente nos dias em que teriam algo.

O ajuste é a janela por fonte: 24h para agregador de alto volume, 72h para
fonte primária. Fica registrado aqui como proposta, sem mexer no código antes
de você decidir.

---

# Composição aplicada em 05/09/2026

A auditoria acima virou mudança no banco. Nada foi apagado: o que saiu está com
`enabled=false` e pode voltar numa linha.

## Desligadas

| fonte | por quê |
| --- | --- |
| Google News, ICE / immigration court / asylum | 62 coletadas, 1 aprovada, 43 recusadas como desfavoráveis. Trazia sorvete e hóquei junto. |
| Google News, deportação / ICE (PT) | 5 coletadas, 5 recusadas. |
| Google News, visto americano / green card (PT) | 5 coletadas, 5 recusadas. |
| Google News, imigração Estados Unidos (PT) | 1 coletada, 1 recusada. |
| CBS News, política EUA | 1 coletada, 1 recusada. Feed nacional genérico. |
| NPR, nacional EUA | 1 coletada, 1 recusada. Mesmo motivo. |
| State Dept, press releases | Responde 403 para o nosso agente. A alternativa seria fingir ser navegador. |

## Ligadas

Visto profissional e processo: USCIS oficial via busca indexada, EB-1 a EB-3
com NIW e H-1B, EB-5 com O-1 e L-1, visa bulletin com priority date e backlog.

Economia e trabalho: emprego e salário nos EUA, fábrica e investimento com
vagas, InfoMoney para tributação e câmbio.

Fonte primária: Federal Register por agência USCIS, por termo USCIS e pela
Employment and Training Administration, que é por onde saem PERM, H-2A e H-2B.
International Trade Administration para negócio e investimento.

Análise com texto: Murthy Law Firm e Visalaw. As duas publicam matéria com
corpo e URL direta, que é o que o enriquecimento precisa.

## O que a mudança produziu, medido

| | antes | depois |
| --- | --- | --- |
| fontes ativas | 19 | 27 |
| candidatas por rodada | 211 | 207 |
| candidatas que já chegam com texto | 28 | 72 |
| candidatas com URL que dá para buscar | 29 | 74 |

O volume ficou parecido e a composição mudou: a coleta deixou de ser dominada
por fiscalização e passou a trazer material que dá para escrever.

## O que ainda falta

Metade da coleta ainda vem do Google News, que entrega manchete e um link que
não é o da matéria. Para essas, o enriquecimento não tem o que buscar e a pauta
é recusada por falta de fatos. Resolver isso exige feed direto dos veículos que
mais aparecem, um a um. Google News segue útil para DESCOBRIR o assunto, não
para escrever sobre ele.
