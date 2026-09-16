# O modelo de título do usa.journal

Levantado em 16/09/2026, depois de o dono ler a manchete "O-1B para designer de
cenários do México: USCIS aprova com processamento premium" e perguntar o que o
México tem a ver com uma publicação sobre os EUA escrita para brasileiros.

A resposta curta: nada. E o problema não era a forma, era quem ocupava a frase.

## O que foi medido

**As nossas**, 79 manchetes reais de `social_posts`, `news_editions` e
`articles`:

```
25 de 79   o sujeito é uma instituição ou um ato jurídico
25 de 79   o leitor não aparece de nenhuma forma
15 de 79   sigla ou termo em inglês cru
 9 de 79   o protagonista é estrangeiro de terceiro país, um estado ou um país
 4 de 79   aparece "quem", "você" ou "brasileiro"
```

**Not Journal**, 25 manchetes do site e 30 posts do Instagram:

```
11,5 palavras e 66,9 caracteres em média, no site
 2 de 25   usam dois-pontos
 9 de 25   abrem com nome próprio
24 palavras na abertura da legenda do Instagram, 18 de 30 com nome próprio
```

**Brazil Journal**, Instagram: a legenda abre com um chapéu de uma a três
palavras em caixa alta seguido de ponto, e depois o lide. "REALITY CHECK.",
"JUNIOR OIL.", "DATA CENTERS.", "SÓ A URNA SALVA." O chapéu não é a editoria, é
uma palavra de voz editorial.

## O que os dois fazem e nós não fazíamos

A primeira metade da frase entrega **ator reconhecível mais verbo no presente**,
e não a ficha cadastral do personagem.

```
TST garante adesão a PDV durante aviso-prévio indenizado
Bancos usam dados de telecom para evitar fraudes no Pix
Governo sanciona fim da taxa de 20% sobre compras internacionais
```

E quando a notícia é dos Estados Unidos, o efeito aqui entra **no próprio
título**:

```
Chuvas nos EUA e alta do petróleo elevam preço da soja
O que Bill Gates quer reservar, o Brasil reserva desde 1933
O boom da IA está levando quem trabalha com tech para os EUA com o visto O-1
```

Repare no último: o leitor se identifica pela PROFISSÃO, nunca pela
nacionalidade de um terceiro.

## Os gabaritos

**1. O que continua valendo, para quem, até quando.** O padrão, e cobre decisão
judicial, liminar, regra nova, adiamento e prazo.

```
ruim   Corte federal adia regra sobre D/S
bom    Quem tem visto de estudante segue no prazo até 27 de outubro: decisão em Boston adiou a regra
```

**2. A profissão é o protagonista, a nacionalidade nunca.**

```
ruim   O-1B para designer de cenários do México: USCIS aprova com processamento premium
bom    Designer de cenários aprovado no O-1B, o visto de quem trabalha com arte, pelo processamento premium
```

**3. Jurisdição no fim, como virada.** O leitor precisa saber se aquilo o
alcança antes de saber onde foi decidido.

```
ruim   Na Califórnia, acordos nupciais geralmente não encerram o I-864
bom    Quem assinou o compromisso de sustentar um imigrante costuma seguir responsável depois do divórcio, na Califórnia
```

**4. As duas situações do leitor, lado a lado.** Para pauta de explicação, no
lugar do título de dicionário.

```
ruim   Green Card: ajuste ou consulado
bom    Quem está nos EUA pode pedir o green card sem sair; quem está no Brasil passa pelo consulado
```

**5. Retomada com o dado novo.** Quando a mesma história volta.

```
ruim   Liminar impede regra sobre duration of status
bom    Regra de prazo fixo segue suspensa e o prazo aberto continua valendo para estudantes
```

## As regras que entraram no código

1. **Destinatário obrigatório.** Todo título nomeia quem sente a mudança, com o
   grupo que a própria fonte descreve.
2. **Nacionalidade de terceiro país nunca entra.** Sai o gentílico, entra a
   profissão, a área ou a etapa. O país só fica quando é o OBJETO da regra.
3. **Órgão e ato jurídico não abrem.** Corte, tribunal, liminar, USCIS e DHS
   entram depois, como fiança do fato.
4. **Jurisdição no fim.**
5. **Sigla nunca sozinha.**
6. **Dois-pontos é opção, não padrão.** Só 2 das 25 manchetes de referência usam.
7. **Retomada carrega o dado novo.**

A regra 2 tem conferência determinista em `leitor.ts`, com lista de gentílicos,
e ela é APONTAMENTO de reparo, nunca bloqueio: quando o país é o objeto da
regra, como no TPS de El Salvador, o gentílico é legítimo, e quem decide é a
reescrita com o pacote factual na mão.

## O que NÃO muda

- A régua anti-alucinação. Nomear o leitor é obrigação de forma, não licença
  para inventar alcance: o grupo afetado sai da fonte, e continua proibido
  escrever que algo "muda o cenário para brasileiros" quando o pacote não diz.
- A proibição de afirmar comportamento das pessoas.
- As faixas de tamanho, que já estavam certas.
- As proibições de pergunta, promessa de resultado e adjetivo no lugar do fato.
