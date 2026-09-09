# Backlog do social V2

Coisas notadas durante a fase 3 que NÃO foram implementadas, com o motivo.
Nenhuma delas bloqueia o rollout: bloqueio é publicação duplicada, publicação
incorreta, caminho legado errado, CTA quebrado, chamada indevida à Meta ou
exposição de segredo. Estas não são nenhuma dessas coisas.

## Worker legado ainda lê a keyword da configuração do projeto

`worker-service.ts` monta a keyword com `project.settings.instagram_keyword`
e padrão `"NEWS"`. O V2 passou a resolver pela campanha evergreen, que é a
fonte que o listener consome.

Não foi unificado porque o legado é o caminho que publica hoje, e em produção
as duas coincidem em `VISA`. Mexer nele agora troca risco conhecido por risco
novo sem ganho imediato. Quando o V2 assumir, o legado sai de cena.

## Proporção 3:4 fora da faixa documentada da Meta

O canvas é 1080x1440, proporção 0.75. A documentação da API de publicação diz
4:5 (0.8) a 1.91:1. Doze posts já foram publicados com essa proporção, então na
prática a Meta aceita — provavelmente cortando. Vale medir o corte antes de
mudar o canvas, porque mudar mexe em todo o desenho.

## Bytes da foto não amarrados ao arquivo no Commons

Depois do congelamento isto deixou de importar para a publicação: a foto entra
no PNG quando a peça é aprovada. Continua valendo para auditoria — provar,
meses depois, que o arquivo do Commons era aquele. Exigiria guardar um hash
perceptual no momento da aprovação.

## `slugDoProjeto` não é passado pelo funil

`rodarCicloSocial` aceita `slugDoProjeto` para montar o caminho no Storage e cai
no `projectId` quando ele falta. O caminho fica com UUID em vez do slug: feio de
ler, e sem efeito nenhum sobre o que é publicado.

## Alerta por post quando a leitura da linha falha

Se o banco cair, cada post do lote dispara um alerta crítico — até cinco por
giro. Não é laço infinito, e a informação está certa. Vale agrupar se
acontecer.

## Órfã em `generated` no caminho legado

O legado tem a mesma propriedade que o V2 tinha: reivindica a vaga gravando
`generated` e, se o processo morrer, `findDuePosts` não a devolve. A
recuperação implementada filtra explicitamente por `generation_version =
social-v2`, porque alargá-la para o legado aumentaria risco de republicação em
troca de nada.

## SOCIAL_READER_LANGUAGE_ALIGNMENT

O post do Instagram agendado para 09/09 às 21:30 saiu com o mesmo defeito da
newsletter: "Na Califórnia, acordos nupciais geralmente não encerram o I-864",
com o corpo dizendo que "a obrigação federal de suporte permanece no centro da
análise". Foi retirado da fila (`status = draft`, linha mantida para
auditoria).

O que isso mostra: as regras de linguagem que entraram na newsletter — público,
ordem de prioridade, jargão explicado, título orientado a impacto — valem igual
para o social, e o Social Guard tem molde próprio, separado do guard editorial.

Não foi feito nesta rodada por decisão de escopo: primeiro estabilizar a
newsletter, depois aplicar o mesmo princípio ao social reaproveitando o que
fizer sentido. Reconstruir o Social V2 agora seria abrir uma frente antes de a
primeira estar validada em produção.

## Rodapé do e-mail ainda denso no celular

O item 25 pedia rodapé mais compacto no mobile. A largura, o padding, os
títulos e as imagens foram corrigidos e medidos, mas o pé da edição continua
com quatro blocos empilhados: cartão de análise de perfil, cartão do Instagram,
assinatura e "quem somos" com o aviso legal inteiro. Não é enorme, e não estava
entre os defeitos que estragavam a leitura, então ficou para a próxima passada.
