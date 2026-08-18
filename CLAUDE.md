# JC Sacolas — Sistema de Controle de Produção

> Memória viva do projeto. Atualizar este arquivo quando o estado mudar
> (feature concluída, decisão nova, armadilha descoberta).

## O que é
Sistema web de controle de produção para a **JC Sacolas** — indústria de embalagens
personalizadas em Itabaiana-SE. Importa a planilha de expedição do ERP **Posseidon**
(que não gera relatório de produção) e organiza a produção por linha, rota e prazo.

**Fluxo:** `Importar Excel do Posseidon → Triagem → Produção → Rota → Entregues`
**Linhas de produção:** Produção (silk) / Clichê / Gráfica
**Perfis:** designer · financeiro · dono

> **Processo real da fábrica** (acabamento, montagem, prazo × etapas): ver
> [`FLUXO_PRODUCAO.md`](FLUXO_PRODUCAO.md) (fluxo do mundo real) e
> [`PRODUCAO_SISTEMA.md`](PRODUCAO_SISTEMA.md) (como isso entra no sistema: setores,
> acabamentos por item, permissões/perfil Operador, fases A–D).

## RELÓGIO DA FILA — tempo por item × etapa (14/08/2026)
> Base da estatística de produção. O que se mede é quase todo FILA, não trabalho:
> em produção por encomenda a peça passa a maior parte do tempo esperando, e é a
> fila que dá para atacar.

- **Onde mora:** dentro de `etapas[key]`, junto do resto (o import sobrescreve
  `itens`) — `desde: { <etapa>: iso }` (passagem em aberto) e
  `tempos: { <etapa>: ms }` (passagens já encerradas). Mais `importadoEm` no
  pedido, gravado **só na primeira** importação: reimportar não pode zerar a
  espera de um pedido parado há duas semanas.
- **Por item × ETAPA, não um relógio por item** (decisão do dono): com produção
  parcial o mesmo item fica em duas etapas ao mesmo tempo (50 na montagem, 50 no
  silk). Um relógio só devolveria "última movimentação", que não diz onde a fila
  está — e achar a fila é o objetivo.
- **`carimbaTempos` roda num lugar só:** todo construtor de mapa
  (`mapaEtapasComQtd`, `mapaEtapasCom`, `mapaEtapasMovendoVolumes`,
  `fechaMontagemEmVolumes`, `desfazEmbalagem`) virou um invólucro sobre a versão
  `...Cru`. Espalhar o carimbo por cada caminho deixaria algum de fora, e um
  relógio que às vezes não conta é pior que nenhum — ninguém desconfia de um
  número que existe.
- ⚠️ **Duas armadilhas que os testes pegaram** (`smoke29`):
  1. Sem carimbo (todo item no dia da virada), fechar uma etapa dava **zero**.
     Agora cai em `em` → `importadoEm` → `dataVenda`, e a fila que já existia
     entra na conta aproximada em vez de sumir.
  2. Etapa que **continuava** com quantidade era remarcada como recém-chegada
     quando outra parte do item se movia. Só carimba `agora` quando a etapa
     estava vazia antes; senão preserva o início.
- **Leitura:** `tempoNaEtapa`, `desdeNaEtapa`, `idadeDoItem` (desde a importação —
  inclui a triagem, que some de todo relatório de chão de fábrica),
  `idadeDoPedido` (o item mais antigo ainda em produção), `fmtDuracao`, `diasDe`.
- **Tempo CORRIDO**, não útil (decisão do dono): é o que o cliente sente — ele
  espera 5 dias, não 3 dias úteis.
- **No quadro:** chip `⏱` por card com o tempo parado NAQUELE setor; amarelo a
  partir de 3 dias, vermelho a partir de 7.
- **FALTA: o relatório de gargalo** (mediana e P85 por etapa/linha, aging WIP).
  A `auditoria` já é um registro de eventos com `de`/`para`/`quando` desde
  11/08/2026 e serve de base histórica; faltam os eventos de importação,
  classificação na triagem e entrega para fechar a cadeia.

## VOLUMES — o pacote físico (13/08/2026)
> O motorista conta volume, não pesa kg. Depois da montagem o item deixa de andar
> por quantidade solta e passa a andar por VOLUME.

- **Onde mora:** `etapas[key] = { montagem, produzido, volumes: [{id, qtd, et}], por, em }`.
  `et` do volume ∈ `expedicao|expedido|entregue` (`ETAPAS_VOLUME`).
- **A SOMA dos volumes é a quantidade REAL produzida** — não existe campo "quanto deu",
  criar os volumes já declara. Pode ficar acima ou abaixo do pedido.
- **`produzido` é outra coisa:** as unidades PEDIDAS baixadas do lote. A diferença entre
  `produzido` e a soma dos volumes é a **quebra de processo**, e é o que o financeiro cobra.
  `linha = qtd − montagem − produzido`.
- **Fechamento (`FecharMontagem.jsx`)**: "+ Criar volume" com o restante descontando e a
  pergunta da sobra **só quando sobra**. ⚠️ **NÃO existe atalho que preencha o volume com a
  quantidade pedida** — havia um ("tudo num volume só") e foi removido: é justamente a
  quantidade pedida que pode estar errada, e o atalho deixaria o operador registrar 100 kg
  sem ninguém ter pesado. O rótulo segue o material: **plástico → "Peso do volume (kg)",
  papel/etiqueta/alça → "Quantidade do volume (un)"** — encerrar o item (baixa o
  lote inteiro) × deixar pendente (baixa só o embalado). É essa escolha que mantém a entrega
  parcial viva. Fechar é **por ITEM**: cada produto é embalado separado.
- **Depois de embalado o item anda por volume:** `mapaEtapasMovendoVolumes`,
  `volumesNaEtapa`, `movePorVolume`. O quadro, a carga e a entrega detectam com `temVolumes`
  e caem no caminho de quantidade quando o item é legado.
- ⚠️ **`mapaEtapasComQtd` PRESERVA a entrada de item embalado.** Sem isso um avanço por
  quantidade apagaria o array de volumes — perda silenciosa do que a balança registrou.
- **Voltar da expedição para a montagem é DESEMBALAR** (`desfazEmbalagem`), não mover
  volume: os volumes deixam de existir e a quantidade **PEDIDA** que tinha sido baixada
  (`produzido`) volta para a montagem. Devolver a soma dos volumes perderia a quebra —
  fechou 100 pedidas com 98,3 reais, e a montagem receberia 98,3, sumindo com 1,7.
  ⚠️ Só desembala quando **nada saiu** (`podeDesembalar`); com volume já expedido não há
  resposta certa para "quanto volta", e a tela recusa com aviso em vez de inventar.
  Bug que originou isto: `movePorVolume` recusa destino fora de `ETAPAS_VOLUME`, então
  voltar devolvia `null` e **nada acontecia, sem erro na tela**.
- **Carga por volume:** `itensParaCarga` devolve **um registro por volume** (com `volumeId`
  e `volumeN`); `chaveCarga` inclui o volume, então volume já carregado não entra noutra
  carga. Item legado entra como volume único com `volumeId: ''` e a conta antiga por
  quantidade. A conferência conta volumes; o romaneio imprime "N volume(s)" e o volume de
  cada linha.

## A Lista de Produção mostra só o SERVIÇO A FAZER (14/08/2026)
- `categorizados` filtrava por `p.status` e **nunca** por "ainda tem trabalho", então
  pedido já expedido continuava listado até ser entregue (#5276 aparecia na lista e em
  nenhuma coluna do quadro). É o espelho do bug do 5001: lá a Rota mostrava o que não
  estava pronto; aqui a Lista mostrava o que já tinha ficado.
- **`qtdEmProducao` usa a MESMA fronteira do quadro:** linha, montagem e expedição são
  painéis; `expedido` e `entregue` não são — por isso o item some do quadro ao ser
  expedido. `temTrabalhoNaProducao` é o filtro da lista.
- **A quantidade do card passa a ser a que FALTA:** de 500 com 200 expedidas, a folha
  impressa diz 300 (e "de 500" ao lado). Dizia 500, e a fábrica repetiria o que já saiu.
- Pedido sem itens cai no campo antigo `p.etapa`; **na dúvida o pedido FICA** — sumir da
  lista de produção é pior do que aparecer a mais.

## Produção PARCIAL por QUANTIDADE (12/08/2026)
> O item deixou de andar inteiro. De 100 sacolas, 50 podem estar na montagem e 50 na
> linha, e essa metade segue sozinha até a entrega e a baixa financeira.

- **Onde mora:** `etapas[key] = { montagem, expedicao, expedido, entregue, por, em }`.
  Guarda **só o que avançou**; a quantidade na linha é o RESTO (`qtd do item − soma`).
  Se um reimport mudar a quantidade (100 → 120), a linha vira 70 sozinha — guardar os
  dois lados deixaria o total em desacordo com as partes, e ninguém veria.
  **Não partir o item em dois no array `itens`:** todo import sobrescreve `itens`.
- **Helpers (utils):** `distribuicaoDoItem`, `qtdNaEtapa`, `qtdPendente`, `moveQtdItem`,
  `mapaEtapasComQtd(p, [{idx,de,para,qtd}], quem)`, `itemTodoEntregue`,
  `pedidoTodoEntregue`, `arredondaQtd` (3 casas — plástico é kg, e 0.1+0.2 deixaria
  "resta 0.00000001 kg" pendente para sempre).
- **`qtdNoPainel` é a fonte única** de "quanto deste item está nesta coluna";
  `itemPertenceAoPainel` é só `> 0`. Por isso o quadro e os contadores não divergem.
  O mesmo item aparece em VÁRIAS colunas — a premissa antiga ("some da fila ao
  avançar") não vale mais.
- **`etapaDoItem` devolve a etapa mais ATRASADA com quantidade** — é onde o trabalho
  está. Existe para quem precisa de UM valor (quadro do vendedor, badge, auditoria).
- **Quadro:** campo de quantidade por item, já preenchido com o total daquela etapa
  (quem concluiu tudo continua com um clique). O botão vira "Concluir parte →" quando
  alguém digita menos. Auditoria grava `qtd`, `qtdItem` e o `de` da COLUNA (não de
  `etapaDoItem`, que com o item dividido aponta outra etapa).
- **Entrega:** a remessa grava `qtd` (o que saiu) e `qtdItem` (o total). Entregar move
  `expedido → entregue`; **o item NÃO sai de `itens`** — apagá-lo levaria junto a
  quantidade ainda em produção. O pedido só é apagado quando `pedidoTodoEntregue`.
- **Cancelar entrega** move `entregue → expedido|expedicao` de volta. Se o pedido já
  tinha sido apagado, é recriado com as quantidades originais e o que veio de OUTRAS
  remessas continua como `entregue` — senão reapareceria na produção.
- **Contadores continuam contando ITENS** com quantidade pendente: kg e unidade não
  somam, então um número único misturando os dois não significaria nada.

## Produção POR ITEM (o item é a unidade de produção) — em obras
> Reescreve as Fases A–D: o pedido não anda mais como bloco. Cada item percorre
> **[linha do item] → Montagem → Expedição → expedido**, e itens do mesmo pedido que
> estão na mesma etapa se agrupam num card só. Entrega parcial é o objetivo final.

- **Chave estável do item (FEITO):** todo mapa por item é indexado por
  `keyDoItem(p,i)` = `normaliza(produto)#ocorrência` (ex.: `SACOLA PAPEL TAM. P02#1`),
  gravada em `it.key` no import (`carimbaKeys`, chamada por `agrupaPedidos`/`...Zeus`).
  Antes era a POSIÇÃO no array — e como todo import sobrescreve `itens`, mudar a ordem
  na planilha migrava linha/acabamento/etapa para o item errado. `doMapaDoItem(mapa,p,i)`
  lê pela chave e só cai no índice quando não achou (legado); quem salva na Triagem
  regrava o mapa já no formato novo. Vale para `linhasItens`, `acabamentos` e `etapas`.
- **Etapas por item (FEITO):** `pedidos/{id}.etapas = { <key>: { et, por, em } }`, com
  `et` ∈ `PRODUCAO|GLICHE|GRAFICA|montagem|expedicao|expedido`. Helpers em utils:
  `COLUNAS_QUADRO` (3 linhas + Montagem + Expedição), `etapaDoItem`, `proximaEtapaItem`,
  `etapaAnteriorItem`, `nomeEtapaItem`, `mapaEtapasCom(p,idxs,destino,quem)` (materializa
  o mapa inteiro, congelando o legado, e aceita destino função p/ voltar cada item pra
  SUA linha), `logEtapaItem`, `itemExpedido`. O campo antigo `p.etapa` (pedido inteiro)
  virou só fallback de leitura: `montagem/expedicao/expedido` valem para todos os itens,
  `grafica` vira a coluna da linha do item.
- **Quadro = UMA FILA POR SETOR (FEITO)** — substituiu o kanban por linha.
  `PAINEIS_QUADRO` (utils) = 7 painéis: as 3 linhas + **3 montagens** + Expedição.
  `QuadroProducao.jsx` recebe uma **lista** de painéis e desenha uma coluna por painel:
  1 painel = a fila daquele posto ("o que está na minha mão agora"), todos = a aba
  **▦ Visão geral** (só dono/designer, o fluxo inteiro lado a lado). O item **some** da
  fila assim que avança — quem trabalha na linha não vê o que já foi pra montagem.
  Aba inicial: staff abre na Visão geral, operador na fila dele que tem serviço.
  **Todo** item entra (papel, plástico, alça torcida, etiqueta). Card = `pedido × painel`;
  chip "N de M itens" quando o pedido está dividido. Botão grande move o card inteiro;
  com 2+ itens, cada item tem `←`/`→` para andar sozinho (é o que divide o card). O
  "Concluir →" diz a montagem de destino quando o card inteiro vai pra mesma.
  **Trava da laminação por ITEM:** item de gráfica sem laminação não entra (os outros
  itens do mesmo pedido entram normal) e o quadro conta quantos faltam.
- **Fila AGRUPADA por Data → Vendedor → Rota (FEITO):** a fila de cada setor era uma
  lista solta ordenada só pela previsão, e os pedidos de uma mesma rota ficavam
  espalhados — chegava o dia do caminhão e faltavam pedidos da rota que ninguém viu que
  eram do mesmo bolo. Agora cada coluna quebra em grupos com faixa de **data**
  (`.qc-data`, some quando repete; vermelha se atrasada) e faixa de **rota + vendedor**
  (`.qc-rota`). **Data vem PRIMEIRO de propósito**: com vendedor na frente, a rota que
  sai daqui a três semanas apareceria antes da que sai sexta. As rotas seguem
  `ordemRota()` = a **posição no cadastro do vendedor** (a sequência real em que ele
  roda), não alfabético — alfabético só coincide enquanto elas se chamarem ROTA 01/02/03.
  O card mostra a **cidade** (a rota já está na faixa).
- **Contador de rota por setor (FEITO):** `progressoNoPainel()` na faixa da rota —
  "4 de 7" = itens daquela rota que já passaram DESTE setor. O total conta a rota
  INTEIRA, inclusive itens que ainda nem chegaram ao setor e os travados na laminação:
  é isso que denuncia rota incompleta ANTES da data. Agrupar sozinho junta os pedidos,
  mas não avisa o que falta. Helpers: `posNoFluxo` (linha 0 → montagem 1 → expedição 2 →
  expedido 3), `itemPassaPeloPainel` (por linha / por material / expedição pega todos),
  `jaPassouDoPainel`. Respeita o filtro de material do operador (o contador bate com o
  que ele vê).
- **Montagem POR MATERIAL (FEITO):** quem monta sacola de papel não é quem monta a de
  plástico. `MONTAGENS` (utils) = papel · plástico · etiq./alça. **A etapa gravada
  continua `'montagem'`** — a divisão é DERIVADA no render por `materialDoItem`
  (cadastro de Itens + inferência pelo nome), então corrigir o `tipo` de um produto
  realoca o item sozinho, inclusive os que já estão parados na montagem. Nada de etapa
  nova no banco, nada de migração. Item cujo material o cadastro não conhece aparece nas
  **três** montagens com tag ⚠ e banner de aviso — entre duplicar e sumir, sumir é pior.
  Voltar da montagem usa destino-função: cada item retorna para a SUA linha.
- **Permissão em 2 EIXOS (FEITO):** `setores` (o que faço) × `materiais` (com o que
  trabalho), ambos em `usuarios/{uid}`. `materiais` **vazio = todos** (não quebra quem
  já estava cadastrado). `paineisVisiveis({perfil,setores,materiais})` decide as abas;
  `podeNoMaterial` filtra os itens dentro de cada fila (vale também nas linhas). Item sem
  material passa por todo filtro — trabalho que ninguém vê é trabalho que atrasa.
  Cadastro em Usuários: bloco "Materiais liberados" no perfil Operador.
- **Auditoria (FEITO):** coleção `auditoria`, **append-only**, um doc por ITEM movido
  (`idVenda, cliente, itemKey, produto, qtd, linha, material, de, para, porUid, porNome,
  porEmail, perfil, ip, quando`). Gravada no **mesmo `writeBatch`** da mudança de etapa:
  ou o item anda E fica registrado, ou nada acontece — nunca existe movimento sem rastro.
  `registrosAuditoria()` em utils. Aba **Auditoria** (`Auditoria.jsx`) só do dono, só
  leitura, últimos 500 movimentos, filtros por pessoa/setor/período/busca; o filtro de
  setor casa origem E destino. Rules: cria quem pode mover, lê só o dono,
  `update/delete: if false` — nem o dono edita (log corrigível não prova nada).
- **Selo da linha (FEITO):** `src/components/SeloLinha.jsx` — quadradinho colorido
  `S`/`G`/`Gr` (`SIGLA_LINHA` + `MODO_COR`), o mesmo símbolo marcado na Triagem, colado
  no nome do produto em TODA tela por onde o item passa: quadro (todas as colunas), lista
  de produção, Rota, Entregues e os dois romaneios impressos. No `@media print` vira
  quadrado branco com moldura preta (impressora P&B). `fatiaProntos` carimba `_linha` em
  cada item porque depois da fatia o índice muda.
- **Valor:** `veValor` = **só dono e financeiro** (designer e expedição não veem mais).
  `valorDosItens(p,idxs)` soma `it.valor` — a planilha do Posseidon **não traz valor por
  item** (a coluna `Valor` repete o total do pedido), então hoje devolve `null` e o card
  mostra o total do pedido rotulado. Ligar valor por item depende de mapear uma coluna
  de valor unitário no import (pendente de confirmação do cliente).
- **Setores/permissões:** `SETORES_PROD` (em utils) = etapas do quadro + Entrega (a
  montagem é UM setor só; quem divide por material é o eixo `materiais`). `normSetor`
  traduz o `grafica` minúsculo do cadastro antigo para `GRAFICA`. `firestore.rules`:
  operador/expedição só mexem em `etapas` (+ campos antigos) — a regra não confere item a
  item (mapa), o controle fino é o `podeMoverEtapa` da tela. ✅ Rules com a coleção
  `auditoria` publicadas (11/08/2026). ⚠️ Se um dia mexer nas rules da `auditoria`,
  publicar ANTES do build: o log vai no mesmo batch da etapa, então rules velhas
  derrubam o movimento no quadro inteiro.
- **Voz:** "quantos pedidos na montagem/gráfica/silk/gliche" agora conta **itens** por
  etapa e diz em quantos pedidos ("Tem 3 itens na montagem, de 2 pedidos").
- **Rota por item + ENTREGA PARCIAL (FEITO):** helpers `idxProntos` e `fatiaProntos`
  (devolve o pedido só com os itens `expedido`, guardando `_todos`, `_idxs` e
  `_pendentes`). A Rota mostra **só o que foi expedido**, ponto.
  ⚠️ **`pedidoSemEtapa` foi REMOVIDO (12/08/2026) — não recolocar.** Ele dizia "pedido
  que nunca passou pelo quadro conta como pronto", para a Rota não esvaziar no dia da
  virada para produção por item. Com o sistema em uso virou o contrário do que protegia:
  declarava pronto tudo que ninguém tinha movido, e a Rota listava ~458 pedidos ainda na
  linha (o dono percebeu pelo pedido 5001, parado no silk e aparecendo na Rota). O campo
  antigo `p.etapa = 'expedido'` continua valendo, via fallback do `etapaDoItem`.
  A tela vazia agora explica o motivo ("Nenhum pedido expedido ainda — N continua(m) na
  produção") em vez de dizer que o filtro não achou nada.
  Chip "⏳ faltam N item(ns) em produção" na parada e faixa "⚠ ENTREGA PARCIAL" no
  romaneio impresso; os totais por rota só somam o que está saindo.
- **Remessas (FEITO):** entregar grava `entregues/{idVenda}-{n}` com
  `{idVenda, itens (só os que saíram), remessa, parcial, itensPendentes, motorista}`.
  Se sobrou item, o pedido CONTINUA em `pedidos` só com o resto (`itens`, `etapas`
  sem as chaves entregues, `remessas: n`); quando não sobra nada, o doc é apagado
  (comportamento antigo). Em **Entregues** cada remessa é um card (chip "entrega
  parcial", "#id · remessa N"), a baixa financeira é por remessa e o total do
  cabeçalho conta o valor do pedido UMA vez só (sem valor por item, não dá pra
  ratear). Cancelar entrega / retornar p/ Expedição usam `devolverAoPedido`, que
  faz merge dos itens de volta no pedido (ou recria o pedido se ele já sumiu) e
  marca a etapa dos que voltaram (`expedido` × `expedicao`).
- **Import x remessa:** a checagem de "já entregue" consulta `entregues` por
  `documentId()` (docs antigos) E por campo `idVenda` (remessas novas); só ignora o
  pedido quando existe remessa NÃO parcial. Pedido com remessa parcial continua no
  fluxo e o import NÃO devolve os itens já entregues (mantém `itens`/`remessas` do
  que está no banco quando `ja.remessas` existe).
- **FALTA:** valor por item no import (depende de o Posseidon exportar coluna de
  valor unitário/subtotal — pendente de confirmação do cliente).
- **Fase B (no ar, ajustada pelo item):** perfil **`operador`** (chão de fábrica). `AuthContext` expõe `setores`
  (array liberado, lido de `usuarios/{uid}.setores`). Cadastro de Usuários tem o perfil
  Operador + seleção de setores (Gráfica/Montagem/Expedição/Entrega); designer também acessa
  Usuários. No quadro, `podeMoverEtapa`: dono/designer movem tudo, operador só nos setores
  liberados (o de ORIGEM). Operador só acessa a aba **Produção** (não vê R$; voz oculta —
  voz só dono/designer/financeiro). `firestore.rules`: operador lê pedidos e faz update só de
  `etapas` (mapa por item) — ver a seção de produção por item. ✅ Rules publicadas
  (11/08/2026). Lembrete: rules NÃO vão pelo deploy do Pages — publicar sempre com
  `npx firebase deploy --only firestore:rules` depois de editar `firestore.rules`.
- **Fase C (no ar):** acabamentos POR ITEM (fluxo da gráfica). Helpers em utils:
  `LAMINACOES` (nenhuma/fosca/brilho), `acabamentoDoItem(p,idx)`, `fmtAcabamento`. Gravado em
  `pedidos/{idVenda}.acabamentos` (map idx → {laminacao, furo}), via `updateDoc` (substitui o
  objeto inteiro, como `linhasItens`). Na **Triagem**, os controles Laminação (Nenhuma/Fosca/
  Brilho) + Furo (Sim/Não) aparecem em **todo item de papel** (`materialDoItem === 'papel'`,
  qualquer linha) e em qualquer item da linha **Gráfica** — só na Gráfica a laminação é
  obrigatória (é ela que libera o pedido pro quadro, via `acabamentosCompletos`). No **Quadro**,
  cada item da gráfica mostra a tag 🏷 com o acabamento (`fmtAcabamento`).
- **Fase D (no ar):** cauda de entrega. No **Quadro**, a Expedição ganha "✓ Expedir"
  (`etapa='expedido'`) — o pedido sai do quadro e segue pelo fluxo atual de **Rota** (motorista,
  romaneio, entregar → coleção `entregues`, como já era). Em **Entregues**, o Financeiro/Dono
  dá a **baixa** (`pago`/`pagoPor`/`pagoEm` no doc de `entregues`), com chip "💰 pago" ×
  "⏳ pendente de baixa", filtro "só pendentes" e contador no cabeçalho. Regras: `entregues` já
  é gravável por staff (financeiro incluso). Rota NÃO foi filtrada por etapa (evita esconder
  legado) — se quiserem que a Rota mostre só os expedidos, é um ajuste posterior.
- **Fluxo completo (gráfica):** Triagem → Gráfica → Montagem → Expedição → (Expedir) → Rota
  (entrega/motorista) → Entregues → (baixa financeira) → quitado. Fases A–D concluídas.

## Stack e deploy
- **Repo:** `raonibarbosaa/jcproducao` (público). Branch `main` = fonte (React 18 + Vite),
  `gh-pages` = build publicado.
- **Hospedagem:** GitHub Pages · domínio `jcproducao.totalicontabilidade.com.br`
- **Backend:** Firebase (projeto `producaojcsacolas`, Auth + Firestore)
- **Deploy manual (worktree):**
  1. `npm run build`
  2. copiar `CNAME` de `origin/gh-pages` pro `dist/`
  3. `git worktree add -f /tmp/ghp origin/gh-pages`
  4. limpar branch → copiar `dist` → commit → push
  5. conferir via API do Pages após ~45s
  - ⚠️ Setar `git config user.email` / `user.name` a cada sessão.
- **Zeus** (segundo ERP): detecção implementada, mas **confirmado como NÃO usado**.

## Já feito (no ar)
- **Triagem com rascunho + botão Salvar:** o `CardTriagem` NÃO grava mais a cada clique.
  Linha do item (S/G/Gr e botões grandes) e acabamentos vão pro estado local `draft`
  (`semear()` materializa o que está no banco, resolvendo o fallback de `p.status`, e `pView`
  é o pedido "como está na tela"). O rodapé mostra "● alterações não salvas" + Descartar +
  💾 Salvar triagem; `sujo` compara `JSON.stringify(draft)` com o estado salvo, então desfazer
  na mão zera o aviso. Só o Salvar chama `salvarTriagem()` no pai, que grava
  `linhasItens`/`acabamentos`/`status` num único `updateDoc` (status = `linhaPredominante`
  quando `pedidoCompleto`). Cidade e apelido continuam gravando na hora.
- **Filtros na Triagem:** `FiltrosBar` (cliente/apelido, nº pedido, vendedor, período de
  entrega) igual Produção/Rota; combina com "Só sem definição", conta "N exibido(s)" no
  título e o resumo entra no cabeçalho da impressão.
- **Apelidos de cliente (de/para):** aba Clientes em Cadastros, resolução dinâmica no
  render via `nomeCliente()` + `normaliza()`; botão ✎ no CardTriagem. Captura automática
  de novas razões sociais em todo import.
- **Linha de produção por item:** botões P/G/Gr por item + botão "aplicar a todos";
  pedido só sai da Triagem com todos os itens classificados (`pedidoCompleto()`); na
  Produção, pedido dividido vira vários cards (um por linha). Dados em `linhasItens` no
  Firestore, gravados com `updateDoc` (nunca `setDoc`+merge).
- **Modal de resultado do import** agrupado por status, com captura de clientes inline.
- **Data de entrega dinâmica** via `previsaoDe()` (calculada no render pelo calendário do
  Cadastros, não congelada no import). Exibida na Rota e Produção.
- **Valor do pedido** no cabeçalho de cada parada da Rota.
- **Usuários** (página restrita ao dono), `FiltrosBar`, layouts de impressão de Produção e
  Rota, chips de cidade, exclusão em lote/individual (chunk 450).
- **Cadastros carregam no início:** `CadastrosProvider` só assina `config/cadastros` após o
  login (depende de `user?.uid`) — antes o `onSnapshot` disparava sem auth e morria com
  permission-denied (falso aviso "Nenhum vendedor cadastrado").
- **Motoristas:** aba Cadastros › Motoristas (CRUD; nome, telefone, ativo/inativo — placa
  NÃO entra, é do carro). Inativo some da seleção mas fica no histórico.
- **Motorista na entrega:** na Rota, seletor de motorista por rota + botão "Entregar rota
  toda"; o "✓ Entregue" individual também exige o motorista. Gravado em `entregues` no campo
  `motorista` e exibido no romaneio impresso.
- **Entregues:** mostra o motorista (chip 🚚) + filtro por motorista (inclui "sem motorista"
  e o total acompanha o filtro). Botão "↩ Cancelar entrega" devolve o pedido ao fluxo —
  visível só para **dono** e **designer**. Designer agora enxerga a aba Entregues.
- **Filtro Papel × Plástico na Lista de Produção:** seletor "Todos os materiais / Só
  Papel / Só Plástico" (`filtroMaterial` em `Producao.jsx`), ao lado do filtro de linha,
  aplicado **item a item** via `materialDoItem`. Pré-filtra a lista (pedido que tem algum
  item do material) e, dentro de cada card, fatia só os itens do material — pedido misto
  imprime só a parte escolhida; card sem o material some. Combina com vendedor/cliente/
  período/linha; totais de rodapé (rota/linha) somam só o filtrado. Cabeçalho da impressão
  indica "— só Papel". Para imprimir a produção só do papel (ou só do plástico).
- **Data de entrega manual (dono/designer):** campo `previsaoManual` no pedido (+
  `previsaoManualPor`/`previsaoManualEm` de auditoria), gravado com `updateDoc`; limpar =
  `deleteField()` ("↺ voltar ao automático"). `previsaoDe()` dá precedência à manual, então
  Produção/Rota/Meus Pedidos/Ciência reagrupam sozinhas no render (onSnapshot). UI: chip de
  data editável `src/components/DataEntrega.jsx` (✎ só p/ dono/designer; 📌 marca data manual)
  nos cards de Produção e Rota. Contador de atrasados no App.jsx considera a manual.
- **Assistente de voz (acessibilidade — Opção A, local, sem LLM):** botão flutuante 🎤
  (`src/components/AssistenteVoz.jsx`) em todas as telas. Voz→texto e texto→voz pelo
  navegador (Web Speech API, pt-BR; reconhecimento bom no Chrome, instável no Safari —
  por isso há campo de texto de reserva). O cérebro é `responderPergunta()` em `utils.js`:
  reconhece padrões (vendedor, rota, linha, atraso, produto/sacola, valor, cliente-top,
  listar clientes da rota/vendedor) e responde com os dados reais (apelidos resolvidos);
  quando não bate, diz "não entendi" com sugestões. Para o
  empresário com deficiência visual. **Opção B (LLM Claude real) planejada** — exige backend
  para proteger a API key (Firebase Functions/Blaze ou serverless) + custo por uso.

- **Materiais (fonte única `MATERIAIS` em utils):** plástico(kg), papel(un), etiquetas(un),
  alça torcida(un) — id/nome/unidade/cor. `TIPOS_ITEM`, `UNID_POR_MATERIAL`, `TOTAIS_ZERO`,
  `somaTotais`, `totaisPorMaterial`, `fmtTotais` são todos derivados/genéricos (N materiais).
  Cadastro de Itens, filtro de material da Produção e Relatórios (cards/colunas + seleção de
  itens por material + "Por item") iteram `MATERIAIS`. Inferência por nome em `materialDoItem`
  (ETIQUETA→etiquetas, "ALCA TORCIDA"→alça, PLAST→plástico, PAPEL→papel; etiqueta/alça antes).
  Assistente de voz por produto generalizado por material (mapaProdutosMaterial + FALA_MATERIAL).
  Para acrescentar material novo: só adicionar em `MATERIAIS`.

## Em andamento — Fase 1 (desenho aprovado, nesta ordem)
1. **Nova navegação + Cadastros como hub** ← COMEÇAR POR AQUI. Menu de topo mantém
   Triagem/Produção/Rota/Entregues/Relatórios/Cadastros; Cadastros vira hub com sub-abas
   (Clientes, Itens, Motoristas, Vendedores/Rotas/Cidades, Usuários).
2. **Cadastro de Itens** — mapeia produto → unidade (kg, unidade, milheiro) + tipo de
   material (deixar o campo preparado pro custo da Fase 2). Captura automática no import
   (padrão do Clientes) + filtro "sem unidade" com badge contador. Quantidade vem do Posseidon.
3. ✅ **Totais nos rodapés + módulo de Relatórios** FEITO. Regra de unidade fixa:
   **plástico → kg, papel → unidade**. Material vem do cadastro de Itens (`tipo`) com
   fallback pela inferência do nome (`materialDoItem` em utils: /PLAST/→plástico,
   /PAPEL/→papel). Helpers `totaisPorMaterial`/`somaTotais`/`fmtTotais`/`fmtQtd`.
   Produção: rodapé por rota (`.rota-totais`) e por linha (`.linha-foot`), tela+impressão.
   Rota: total por rota na banda + no romaneio. Relatórios (`Relatorios.jsx`, recebe
   `pedidos`): consumo físico por período (data de entrega/previsão viva), filtros de
   vendedor/linha/rota, quebra por linha e por rota, total geral em cards. Item explode
   por `linhaDoItem` (respeita pedido dividido).
4. **Motoristas + financeiro + Entregues editável** — ✅ cadastro de Motoristas e escolha do
   motorista na entrega FEITOS (ver "Já feito"); ✅ Entregues já editável no sentido de
   cancelar entrega. FALTA: controle financeiro por pedido (valor total → entrada → recebido
   na entrega → saldo, status quitado/pendente) + cadastro de Motoristas ligado a esse fluxo.
5. ✅ **Renomear linha "Produção" → "SILK SCREEN"** FEITO — só rótulo via `MODO_NM.PRODUCAO`
   (status no Firestore segue `PRODUCAO`); sigla do item P→S. A aba/página "Produção" (lista)
   continua com esse nome. FALTA: romaneio de conferência no fim da lista por vendedor/dia
   (data que o vendedor passou o pedido, data de entrega prevista, assinatura sua e dele).

## SEGURANÇA — falha aberta corrigida (15/08/2026)
> Achado numa revisão de segurança. Três coisas somadas expunham a base comercial
> na internet; nenhuma delas isolada parecia grave.

- **O cadastro público do Firebase está ATIVO** e o repositório é público, então
  a `apiKey` é conhecida: qualquer pessoa cria uma conta válida. (Verificado sem
  criar conta: `accounts:signUp` com senha curta responde `WEAK_PASSWORD`, e não
  `ADMIN_ONLY_OPERATION`.)
- **`AuthContext` dava `perfil = 'dono'` a quem não tem doc em `usuarios`** — o
  comentário dizia "fallback seguro p/ admin" e era o contrário. Quem se
  cadastrasse entrava com a INTERFACE DE DONO. Agora falha fechado (`semPerfil`),
  e o `App` mostra "Acesso não liberado" antes de qualquer aba. ⚠️ O
  `ACESSO[perfil] || ACESSO.dono` do App era o mesmo buraco por outro caminho.
- **`config/{doc}` era legível com `logado()`** — e é onde moram a carteira de
  clientes, a tabela de preços, as rotas de cada vendedor e o telefone dos
  motoristas. Virou `temPerfil()`: conta recém-criada não tem doc em `usuarios`,
  então não lê nada. ⚠️ A regra de `usuarios` **tem** que continuar aceitando
  `logado()` para o próprio uid, senão ninguém descobre o próprio perfil e o
  login inteiro trava.
- **`auditoria` não conferia quem assinava** — dava para gravar movimento em nome
  de outra pessoa. Agora exige `porUid == request.auth.uid`. Os 3 pontos de
  escrita (todos no `QuadroProducao`) já mandavam o uid do usuário logado.
- ⚠️ **Continua em aberto (aceito):** o registro de auditoria vai no mesmo
  `writeBatch` montado no navegador, então uma chamada direta à API move a etapa
  SEM gravar o log. Fechar isso exige Cloud Functions (plano Blaze). **O log é
  bom contra engano, não contra má-fé.**
- ⚠️ **Continua em aberto (aceito):** operador com qualquer setor reescreve o
  mapa `etapas` de QUALQUER pedido — a regra valida o mapa como bloco, não item
  a item.

## Perfil Vendedor + segurança (Fase B — em produção)
- **Perfil `vendedor`:** acesso só à aba "Meus Pedidos" (`MeusPedidos.jsx`), vê apenas os
  pedidos do próprio vendedor. Vínculo via campo `vendedorNome` em `usuarios/{uid}` (casado
  com `p.vendedor`). Criado em Usuários (dropdown do cadastro de vendedores). Assistente de
  voz oculto para esse perfil.
- **App.jsx:** consulta de pedidos filtra `where('vendedor','==', vendedorNome)` quando o
  perfil é vendedor. `AuthContext` expõe `vendedorNome`.
- **Segurança real:** `firestore.rules` reescrito — staff (dono/designer/financeiro) total;
  vendedor lê só os próprios pedidos; coleção `ciencias` preparada. ✅ Publicadas (11/08/2026).
  ✅ `entregues` com `allow read` para o vendedor (`resource.data.vendedor ==
  meuVendedor()`) publicado (11/08/2026). Lembrete: regra libera o DOCUMENTO inteiro, não
  campo a campo — o vendedor enxerga também a baixa financeira (`pago`/`pagoEm`) dos
  pedidos dele. Foi decisão deliberada.
- **Impressão da Triagem (Fase A):** botão 🖨 + layout `print-only` (ImpressaoTriagem) por
  vendedor→rota.
- **CIÊNCIA: só o VENDEDOR assina, um pedido por vez (17/08/2026).**
  - O atalho **"dar ciência na rota inteira" foi REMOVIDO** — não recolocar: um
    clique assinava dezenas de pedidos que ninguém tinha olhado, e a ciência
    existe para provar que o vendedor viu AQUELE pedido.
  - **Dono e designer NÃO dão ciência.** O botão "✓ Conferir" saiu da aba
    Ciência (que virou só leitura) e a rule passou a aceitar `create` apenas de
    `ehVendedor()`, em nome do próprio `vendedorNome` e com
    `porUid == request.auth.uid` — tirar o botão sem fechar a regra seria
    esconder o caminho, não trancá-lo. `update: if false` (registro de
    assinatura corrigível não prova nada).
  - **Conferências antigas (`tipo: 'designer'`) continuam aparecendo** como
    histórico, no card e no contador. Apagar registro que existiu é reescrever o
    passado; o que não existe mais é o caminho para criar outro.
  - "Pendente" passou a significar só "sem ciência do vendedor": cobrar uma
    conferência que ninguém pode mais dar deixaria a tela vermelha para sempre.
  - A aba mostra **nome, e-mail, data/hora e IP** de quem assinou (`.ci-bloco`).
    Já era gravado; cabia espremido num chip de uma linha.
  - **A lista do vendedor é a FILA DO QUE FALTA ASSINAR:** abre em "⏳ Só sem
    ciência", e o pedido **sai dali no instante em que ele assina**. O botão
    "☰ Ver todos" reexibe os assinados — some da fila não pode virar some do
    sistema, e ele precisa poder voltar a um pedido que acabou de assinar.
    Ganhou também a `FiltrosBar` das outras telas (sem o seletor de vendedor).
    ⚠️ O contador da faixa (`N de M com ciência`) conta a **rota inteira**, não
    o que sobrou na tela: com a fila filtrada ele diria sempre "0 de N".
  - **Aba Ciência = duas listas, não um interruptor:** "⏳ Sem ciência" (a
    cobrança) × "✓ Conferidos pelo vendedor" (o arquivo, com os blocos já
    abertos — ali o que interessa é ler quem assinou).
- **Ciência POR PEDIDO (FEITO — era por rota):** a ciência de rota gravava `pedidoIds`
  num **retrato do momento**; pedido que entrasse na rota depois ficava coberto por um
  "✓ ciente" que nunca o viu. Agora o **pedido é a unidade**: `ciencias` guarda
  `{tipo:'vendedor'|'designer', vendedor, rota, idVenda, porUid, porEmail, porNome, ip,
  quando}` e o botão da rota é só um atalho em lote (writeBatch, chunk 450) que dá
  ciência **nos que faltam**. Helpers: `indexaCienciasPorPedido` (que **também lê os
  registros de rota antigos**, expandindo `pedidoIds` — zero migração),
  `cienciaDoPedido`, `semCiencia`, `docCiencia`. `indexaCiencias`/`cienciaDe` foram
  REMOVIDOS de propósito: reusá-los reintroduz o bug do retrato.
  Vendedor em "Meus Pedidos" (faixa "44 de 51 com ciência" + botão por pedido);
  designer/dono na aba **Ciência**, com duas barras por rota (Vendedor × Conferido),
  botão por pedido ou em lote e filtro **"só pendentes"**. Regra de `ciencias`: vendedor
  lê/cria só as do próprio `vendedorNome`.
- **Saída para entrega (FEITO):** era o estado que faltava entre `expedido` (pronto,
  parado na expedição) e o doc de `entregues`. Campos no PEDIDO — `saidaEm`,
  `saidaMotorista`, `saidaPor` — porque o caminhão leva tudo que estava pronto; helper
  `saiuParaEntrega(p)`. Na **Rota**: botão "🚚 Saiu para entrega" por rota (exige o
  motorista, como a entrega), chip por pedido e "↩" para desfazer. **Entrega parcial
  LIMPA esses campos** do que sobrou (`deleteField`) — o resto continua na fábrica e não
  pode herdar a saída da remessa que foi. Hoje só dono/designer/financeiro marcam a
  saída **a EXPEDIÇÃO também marca** (`podeMarcarSaida` = dono/designer/financeiro +
  expedição) — é quem carrega o caminhão e sabe a hora que ele saiu. Na Rota ela vê o
  seletor de motorista, o botão de saída e o "↩ Cancelar saída", mas **não** o "✓ Entregue"
  nem o "Entregar rota toda" (a entrega é que move o pedido para `entregues`). Nas rules,
  o `allow update` da expedição ganhou `saidaEm`/`saidaMotorista`/`saidaPor` no `hasOnly`
  — o `deleteField` do cancelamento também passa, porque `affectedKeys()` inclui campo
  removido.
- **Quadro do VENDEDOR — BLOCOS POR ROTA (FEITO; era 11 colunas):**
  `src/components/QuadroVendedor.jsx`, aba "▦ Acompanhar" dentro de Meus Pedidos (a
  lista com a ciência continua em "☰ Meus pedidos"). Não é mais um kanban: o nível de
  cima é a **ROTA** (na ordem do cadastro, `ordemRota`) e dentro dela cada **DATA** é uma
  viagem daquela rota, com o **pipeline resumido numa linha** (`ETAPAS_VENDEDOR`, só as
  etapas que têm item) e os pedidos embaixo, cada ITEM com a etapa onde está. A rota vem
  primeiro porque é assim que o vendedor pensa ("como está minha ROTA 01") — com a data
  no topo, a mesma rota se espalhava por vários blocos. O cabeçalho da rota soma a rota
  inteira; o pipeline é por viagem. (Na PRODUÇÃO é o contrário — lá a data vem primeiro,
  porque quem produz prioriza por prazo.) A pergunta do vendedor não é "o que está na montagem", é
  "como está a rota do meu cliente" — 11 colunas obrigavam a varrer a tela para
  responder isso, e no celular era rolagem horizontal. Cabe em 375px (media query em
  `.qv-itens li` joga a etapa para a linha de baixo).
  **Só leitura** — e a segurança não depende disso: o App consulta com
  `where('vendedor','==')` e a regra impõe o mesmo no servidor.
- **Filtro "Onde está" + relógio no quadro do vendedor (17/08/2026):** barra de
  etapas no topo (e os chips do pipeline de cada viagem viraram botões) — clicar
  em SILK SCREEN mostra só os itens que estão lá, sem perder a organização por
  rota. É filtro de ITEM: o pedido fica se tiver algum item na etapa e o card
  mostra só esses. ⚠️ **Os contadores saem sempre do TOTAL, nunca da lista já
  filtrada** — tirados do que está na tela, escolher "Silk" zeraria as outras
  etapas e não daria mais para trocar direto para elas (é o mesmo erro que o
  seletor de vendedor do planejamento cometeu).
  Cada item mostra **desde quando está parado ali** (`entradaNaEtapa` em utils,
  levado ao vendedor por `unificaPedidosVendedor` em `desde`/`desdeExato`):
  data, hora e o tempo corrido. ⚠️ O `~` marca carimbo **aproximado** — item
  parado antes de o relógio existir cai no fallback (última movimentação →
  importação → venda), e hora cravada que não é cravada vira discussão no chão
  de fábrica.
- **`unificaPedidosVendedor` (utils) junta as DUAS coleções:** o pedido do vendedor
  vivia partido — o que está em produção em `pedidos`, o que saiu em `entregues` (e
  pedido entregue por inteiro **some** de `pedidos`, existe só como remessa). O helper
  devolve UM objeto por `idVenda` com todos os itens, cada um com `etapaVend`. Pedido
  vivo é a base quando existe (dados mais atuais); senão a remessa. Duas remessas do
  mesmo pedido = um card só. `contaEtapasVendedor` faz o pipeline.
- **`ETAPAS_VENDEDOR` é o fluxo na linguagem de quem VENDE:** triagem → 3 linhas →
  **Montagem (uma só)** → expedição → pronto → saiu → entregue. As 3 montagens viram uma:
  a divisão por material é assunto interno da fábrica e não muda nada para o vendedor
  (por isso a tela dele não precisa mais do cadastro de Itens). `etapaVendedor()` usa a
  linha ATUAL do item, não a etapa gravada — mesma regra de `itemPertenceAoPainel`.
- **Filtros no quadro do vendedor (FEITO):** `FiltrosBar` ganhou `semVendedor` (na tela
  dele todos os pedidos são dele, o seletor não separaria nada) e `rotas` (seletor novo,
  `f.rota` em `filtraPedidos`/`resumoFiltros`) — a rota manda na tela, então é o filtro
  mais natural ali. O filtro roda **depois** da unificação, então alcança também o que
  já foi entregue.
- **`itemPertenceAoPainel` (utils) é a fonte ÚNICA de "onde este item está"** — usada
  pelo quadro da fábrica, pelo badge das abas e pelo quadro do vendedor, para os três
  nunca discordarem. Ela conserta um bug ANTIGO: etapa de linha (`PRODUCAO`/`GLICHE`/
  `GRAFICA`) significa só "ainda não saiu da linha", e quem diz QUAL linha é o
  `linhasItens` atual. Antes, trocar a linha do item na Triagem depois que ele já tinha
  andado e voltado fazia o item **sumir do quadro** (o painel da linha velha cobrava a
  linha nova; o da nova cobrava a etapa nova).

## "JÁ FOI ENTREGUE" — o vendedor reporta erro (18/08/2026)
> O pedido que já chegou ao cliente e continua ocupando o quadro. Quem descobre
> é o VENDEDOR — o cliente liga para ele, não para a fábrica —, e até aqui ele
> só podia telefonar. É o mesmo buraco que a Conciliação tapa DEPOIS, no atacado.

- **Reusa a coleção `problemas`** (o "reportar erro" da fábrica), com um tipo
  novo em `CAMPOS_ERRO`: `entregue`, marcado com `entrega: true` e lido por
  `ehErroEntrega`. Coleção nova exigiria rule nova, aba nova e uma segunda fila
  de pendências para o escritório vigiar.
- **Os campos MUDAM com o tipo:** "no sistema × no papel" não descreve uma
  entrega que aconteceu fora do sistema. Vira `entregueEm` + `entreguePor`, e
  `docProblema` só grava esses dois **quando o tipo é `entregue`** — campo vazio
  em todo doc ninguém sabe depois se quer dizer "não sei" ou "não se aplica".
- ⚠️ **A data NÃO vem preenchida com hoje.** Um clique gravaria uma data que
  ninguém conferiu, e é justamente por ela que o escritório vai procurar a
  entrega (mesmo motivo do atalho removido no fechamento da montagem). Quem não
  lembra o dia põe o mais próximo e explica na observação — é obrigatória.
- **É AVISO, não baixa.** Não move etapa, não cria `entregues`, não mexe em
  volume. A entrega segue com dono/designer/financeiro na aba **Rota**, e é ela
  que abre a cobrança: vendedor dando baixa sozinho fecharia o financeiro sem
  ninguém conferir o que saiu. A tela de **Erros** diz isso na ação e o modal
  avisa antes de enviar.
- **Onde fica:** botão no card do quadro **▦ Acompanhar** (`QuadroVendedor`, que
  deixou de ser só leitura para isto e só para isto) e no card de **☰ Meus
  pedidos**. `campoInicial="entregue"` abre o modal já no tipo certo — os outros
  tipos continuam ali para quem enxergar outra coisa.
- **Só aparece enquanto o sistema acha que não foi entregue** (`naProducao` = tem
  item não entregue) e vira "⚠ já avisado" (desabilitado) depois — cobrar de novo
  uma baixa já pedida só gera aviso repetido na fila do escritório.
- **Vai como erro do PEDIDO INTEIRO** (`itemKey: ''`), e `problemaDoItem` mostra
  esse aviso em TODOS os itens de propósito: ele reporta olhando o pedido, não o
  produto.
- **Badge de `erros` no menu** (`contadores.errosAbertos`): aviso que ninguém vê
  não serve para nada, e quem resolve não passa na aba por acaso.
- No card do vendedor o texto deixou de ser "a fábrica reportou" — metade dos
  avisos agora é dele mesmo, e cada linha diz de quem é e quando.
- **Rules: nada a publicar.** `problemas` já é `create: if temPerfil()` e o
  vendedor já lê os dos próprios pedidos (`resource.data.vendedor`).
- **Quem VÊ o aviso (18/08/2026):** dono e designer já tinham a aba; a
  **EXPEDIÇÃO** entrou pelos DOIS eixos — perfil `expedicao` no `ACESSO` e
  operador com setor `expedicao|entrega` em `abasDoUsuario` (mesmo par da aba
  Entregas). Liberar só um deixaria metade da expedição sem enxergar.
- ⚠️ **Para a expedição a tela é SÓ LEITURA**, e não por educação: as rules de
  `problemas` (update) e de `pedidos.correcoes` só aceitam staff, então os botões
  de resolver dariam `permission-denied` na cara de quem clicasse. `podeResolver`
  esconde as ações e o título diz "só leitura".
- **No QUADRO da fábrica o "já foi entregue" vira faixa vermelha no card**
  (`.qcard-entregue`), não tooltip: é o aviso que evita produzir de novo — e
  recarregar — o que já saiu. Os outros tipos de erro seguem no ⚠ do item.
- Testes em `tests/problemas.test.mjs` (inclui a aba da expedição pelos 2 eixos).

## Conciliação com a planilha de entregas (MIGRAÇÃO — pode sair depois de usada)
Aba **Conciliação** (`Conciliacao.jsx`), só do dono. O sistema entrou no ar com pedidos
que já tinham sido entregues na vida real e ficaram parados na produção; a planilha
manual (`CONTROLE DE ENTRGA 2026.xlsx`, uma aba por mês) diz quais são.
Fluxo obrigatório: **planilha → prévia → BAIXAR BACKUP → aplicar**. O botão de aplicar
fica travado até o backup (JSON com o estado completo dos pedidos que vão sair) ser
baixado — a operação apaga de `pedidos`, e desfazer 2.000 entregas na mão não é opção.
O que os dados exigiram (medido no arquivo de 2026 — helpers e testes em utils):
- **A planilha NÃO é só de entregues:** 4.652 ENTREGUE, mas também 744 "SERÁ ENTREGUE",
  327 "NÃO ENTREGOU" e 130 em branco na MESMA coluna. `normStatusPlanilha` +
  `entradasDaPlanilha` só deixam passar ENTREGUE — marcar tudo apagaria 1.205 pedidos vivos.
- **Duas numerações:** a nossa (curta) e uma de 44.000+ de outro sistema (43% do arquivo).
  `LIMITE_SERIE_CURTA = 40000` descarta a longa. Não há sobreposição de faixa, então a
  longa simplesmente não casaria com nada.
- **A coluna do número tem lixo:** 124 células de DATA e 35 de texto (linhas de separação).
  Por isso a leitura usa `raw: true` e só aceita inteiro positivo.
- **O mesmo número aparece com clientes diferentes** (297 casos). `casaCliente` confere o
  nome antes de aplicar (tolerante: um contém o outro, mínimo 3 letras); o que não bate vai
  para uma lista de revisão em CSV, nunca é aplicado. Sem isso marcaríamos o pedido errado.
- **Data de entrega:** `fimDoMesDaAba` → último dia do mês da aba (a planilha não tem data
  por linha). Reconhece 'MARÇO 2026', 'FEVEREIRO2026', 'abril 2026', 'MAIO2026 '.
- Pedido que **não existe** no sistema é só reportado — nunca criado.
- Cada entrega criada leva `origem: 'conciliacao-planilha'` + `conciliadoDe/Por/Em`: é o que
  permite achar (e desfazer) só o que veio da planilha. Baixa financeira fica **pendente**
  (a planilha tem valor, mas não diz o que foi pago).
- **Cruzamento real feito em 12/08/2026** (planilha × CSV de 516 pedidos na produção):
  só **58** dos 516 aparecem na planilha como entregues — 18 casaram pelo nome e 40 têm o
  nome escrito diferente. 458 seguem na produção. Dos 2.070 da planilha, 2.012 não estão
  na produção, e **175 deles estão na faixa de numeração do sistema** — ou seja, já foram
  entregues pelo próprio sistema. O problema era MUITO menor do que parecia.
- **Cruzar SÓ PELO NÚMERO (padrão, decisão do dono em 12/08/2026):** número igual na
  planilha = baixa, sem conferir o nome do cliente. A conferência de nome vira só
  informação: as linhas divergentes seguem destacadas em amarelo e podem ser desmarcadas
  uma a uma. O interruptor na tela desliga isso e volta a marcar apenas o que o nome
  confirma. O risco foi apresentado com os casos reais (`#5306 SAF FUNERARIA` × `ATUAL
  MODAS`, e mais 4) e a escolha foi consciente — o backup cobre o desfazer.
- **Por isso a tela é de MARCAÇÃO, não automática:** com 58 candidatos, insistir em casar
  nome por algoritmo é pior do que deixar a pessoa marcar. `Candidatos` mostra os dois
  lados numa tabela com checkbox — pré-marcado o que casou, desmarcado e destacado o que
  divergiu. `casaCliente` tolera "(EXPEDIÇÃO)", pontuação, LTDA/ME e diferença de espaço
  ("LUX BEACHWEAR" × "LUX BEACH WEAR"), mas **não é fuzzy**: "SAF FUNERARIA" × "ATUAL
  MODAS" (mesmo número, cliente outro) tem que continuar caindo na revisão.

## PENDENTE — próxima sessão
1. **Expedição controlando a aba Entregas** (pedido do dono em 12/08/2026, para depois).
   Hoje a expedição já vê a aba e faz montar → conferir → marcar saída; o que ela NÃO faz
   é confirmar a entrega, e isso foi decisão explícita do próprio dono na mesma conversa
   ("a expedição não dá a baixa de entrega"). Então o pedido novo provavelmente é **voltar
   atrás nisso**. Confirmar qual das duas leituras antes de mexer:
   (a) a expedição passa a dar a ENTREGA também (hoje só dono/designer/financeiro, na tela
       de Rota) — é o que move o pedido para `entregues` e abre a cobrança;
   (b) a expedição ganha acesso à aba **Entregues** (histórico + baixa financeira), que é
       outra tela e envolve dinheiro.
   Se for (a): `podeEntregar` em `Rota.jsx` + o `allow update`/`create` de `entregues` nas
   rules (hoje `entregues` é write só de staff).
2. **Fechamento da montagem por quantidade REAL** — desenho já fechado com o dono:
   o operador informa quanto do lote está fechando e quanto deu de verdade (pesado/contado),
   e marca se aquilo **encerra o item**. Encerrando, a diferença some do pendente (quebra de
   processo); sem encerrar, o resto continua na fila — é isso que preserva a entrega parcial.
   Modelo combinado: **antes da montagem a quantidade é a PEDIDA, depois é a REAL**; a
   pesagem é a fronteira. Guardar em `etapas` (nunca em `itens`, que o import sobrescreve).
   O preço já está no cadastro de Itens (`precoDoItem`/`valorDaQtd`), pronto para o valor.
3. **Importar planilha de preços** — possibilidade levantada pelo dono; decidir depois de
   ver quantos produtos estão sem preço com o campo já no ar.

## Controle de entregas — a CARGA é a viagem (12/08/2026)
Aba **Entregas** (`Carga.jsx`), para **expedição** + staff. A tela de Rota mostra o que
está pronto AGORA (uma foto do momento); a carga é o documento de uma viagem.
- **Coleção `cargas`:** `{numero, status, motorista, itens[], pedidos[], rotas[], criadaEm,
  criadaPor, saiuEm, saiuPor}`. `status` ∈ `montando|saiu|concluida` (`STATUS_CARGA`).
  Item da carga = `{idVenda, itemKey, produto, qtd, qtdItem, linha, conferido}` — snapshot
  de propósito: o que for expedido depois NÃO entra numa carga já montada.
- **Fluxo:** montar (escolhe pedido a pedido, pode misturar rotas e deixar para trás) →
  conferir item a item ao carregar → 🚚 marcar saída (carimba `saidaEm/saidaMotorista/
  saidaPor` nos pedidos, o mesmo campo que o quadro do vendedor lê) → romaneio impresso.
- **Aba por SETOR, não só por perfil:** `abasDoUsuario(perfil, setores, base)` acrescenta
  a aba Entregas ao **operador** que tem `expedicao` ou `entrega` liberado. Sem isso a
  permissão de dois eixos ficava pela metade: o setor liberava o que ele move no quadro,
  mas não a tela onde o trabalho de carga acontece. ⚠️ As **rules acompanham** —
  `trabalhaComCarga()` (cargas) e o `allow update` de `pedidos` com os campos de saída
  para operador com esses setores. Liberar só a aba faria a tela aparecer e nada
  funcionar.
- **A coluna Expedição lista os VOLUMES** (`.vol-fila`): cada um com número, peso e um →
  próprio, porque é o volume que a pessoa pega e põe no caminhão. O → do item continua
  expedindo todos de uma vez. Com volumes, o campo de quantidade do item some — quem anda
  é o volume, e o campo só confundiria.
- ⚠️ **Item expedido SOME do quadro** — a coluna Expedição só mostra o que está *em*
  expedição, e o ✓ Expedir joga os volumes para `expedido`. Não havia caminho de volta.
  Por isso a lista de Entregas tem **"↩ devolver p/ expedição"** por pedido: devolve os
  volumes (ou a quantidade, no legado) para `expedicao`, o item reaparece no quadro, e de
  lá o ← desembala para a montagem. O caminho completo é em dois passos, em duas telas.
- **Tirar UM pedido da carga em montagem** (`↩ tirar da carga`, no card da conferência):
  ele volta para a lista de disponíveis com os volumes dele. Antes só existia "cancelar
  carga", que é tudo ou nada — e o caso real é um pedido não caber ou o cliente pedir para
  adiar. Tirando o último pedido, a carga é apagada: carga sem item não tem razão de ser.
- **Retornar carga que já saiu (só DONO):** botão no histórico. Os pedidos perdem
  `saidaEm/saidaMotorista/saidaPor` e os volumes voltam a ficar livres para outra viagem.
  A carga vira `cancelada` e **continua no histórico** — apagar esconderia que a viagem
  chegou a ser registrada. `CARGA_SEGURA_ITENS(status)` é quem decide o que ainda prende
  item: `montando` e `saiu` prendem; `cancelada` e `concluida` liberam.
  Pedido já entregue (que saiu de `pedidos`) é ignorado no retorno — o batch só toca no
  que ainda existe, senão a atualização inteira falharia por causa de um doc apagado.
- **A expedição NÃO dá a entrega.** Ela monta, confere e marca a saída; a entrega (que
  abre a cobrança) segue com dono/designer/financeiro na tela de Rota. Rules: `cargas`
  create/update para staff + expedição, delete só staff.
- **MAIS DE UMA CARGA EM MONTAGEM (18/08/2026):** a trava de "uma por vez" caiu.
  Ela existia para a segunda não nascer escondida atrás da conferência da
  primeira — e isso se resolve **mostrando as duas**, não proibindo a segunda:
  a aba ganhou uma régua de cargas (`#15 · 3/8 · JUNINHO`) e o rodapé do
  planejamento avisa `📦 N carga(s) já em montagem` em vez de desabilitar o
  botão. Uma carga esquecida em montagem **parava o planejamento inteiro**, e o
  motivo só aparecia no tooltip de um botão desabilitado (o dono perguntou "por
  que não está liberando a entrega?" em 18/08/2026).
  ⚠️ **O que impede volume repetido nunca foi a trava** — é o comprometimento,
  contado sobre TODAS as cargas vivas (`CARGA_SEGURA_ITENS`), não sobre "a
  aberta". Por isso soltar a trava é seguro.
- ⚠️ **Pedido não pode entrar em duas cargas.** A tela desconta, item a item, o que já
  está comprometido com carga `montando` ou `saiu`. E o caso inverso é real: expediram 40
  (foram numa carga), depois expediram os outros 60 — esses 60 PODEM ir numa carga nova,
  por isso a conta é por quantidade e não por "item já usado".
- **Numeração:** `proximoNumeroCarga` = max + 1 da lista carregada. Volume é de poucas por
  dia com um operador só; se duas telas criarem no mesmo segundo o rótulo repete (o id do
  documento continua único).
- Helpers em utils: `itensParaCarga`, `cargaAberta`, `progressoConferencia`,
  `cargaConferida`, `pedidosDaCarga`, `agrupaCargaPorPedido`.

## LOGÍSTICA — o PLANO de entrega (14/08/2026)
> **A carga NASCE de um plano.** A montagem direta (marcar pedidos numa lista
> solta e clicar "Montar carga") foi REMOVIDA — decisão do dono em 14/08/2026.

- **Duas camadas, e a diferença é a razão de existirem:**
  - **PLANO** (`planos`) guarda **números de pedido**. Na hora de planejar o
    volume ainda nem existe e metade da viagem continua na produção.
  - **CARGA** (`cargas`) guarda **volumes**. É o que o motorista conta e a
    conferência marca.
  Misturar faria a conferência cobrar item que não está no caminhão.
- **`planos/{id}`** = `{numero, status(aberto|encerrado), dataEntrega,
  saidaPrevista, pedidos:[idVenda], cargas:[cargaId], criadoEm/Por}` (+ `vendedor`
  e `rota`, hoje só nas previsões antigas).

## ENTREGA PARCIAL DELIBERADA — segurar item pronto (18/08/2026)
> A carga já saía parcial SOZINHA: `itensParaCarga` só devolve o que está em
> `expedido`, então pedido com 1 de 3 itens prontos já ia com 1. Faltava o
> VOLANTE (dizer "essa sacola vai, a etiqueta espera") e a tela dizer a verdade.

- **Onde mora:** `planos/{id}.itensFora: ["5001|SACOLA PAPEL P02#1"]` —
  `chaveItemPlano(idVenda, keyDoItem)`. Campo ausente = nada segurado, então toda
  previsão que já existe continua igual. ⚠️ A chave usa `keyDoItem`, não a
  POSIÇÃO: o import sobrescreve `itens`, e segurar a sacola grande viraria segurar
  a etiqueta no dia seguinte.
- **Gravado na previsão, não no estado da tela** (decisão do dono): outra pessoa
  precisa ver a mesma viagem, e segurar às vezes é decidido num dia e a carga sai
  no outro.
- **Padrão é TUDO MARCADO** — segurar é a exceção, feita a dedo. Nada marcado
  transformaria toda liberação simples em vários cliques, e um esquecimento
  deixaria mercadoria pronta para trás.
- **Por ITEM, não por volume** (decisão do dono): a linha é o produto, que é como
  o pedido é falado. Os volumes daquele produto vão juntos.
- ⚠️ **O pedido só SAI da previsão quando não sobra NADA dele** (`sobrouNoPedido`
  = tem saldo na produção OU tem item segurado). Antes ele saía inteiro assim que
  mandava qualquer coisa, **levando junto os itens que continuavam na linha** — e
  a pessoa tinha que reincluir o pedido na viagem a cada entrega parcial, que é
  justamente o fluxo normal agora.
- **A tela parou de mentir:** `situacaoNoPlano` ganhou `parcial`, `segurados`,
  `itensProntos`/`itensTotal`. O chip vira `◑ parcial · 1 de 3 itens prontos` em
  vez de `✅ pronto` (que dizia isso porque existia UM volume). O rodapé conta
  `N sai(em) PARCIAL` e a confirmação de liberar NOMEIA quem sai pela metade —
  senão quem descobre é o cliente.
- **Peso e totais descontam o segurado**: contar o que fica faria o peso mentir
  para cima, e é assim que o caminhão passa do limite.
- `itensFora` é limpo na liberação (some quem saiu da previsão), senão a lista só
  cresce. **Rules: nada a publicar** — é update em `planos`.
- Testes em `tests/parcial.test.mjs`.

## CICLO DE VIDA DA PREVISÃO (18/08/2026)
> `aberta → 🚚 virou viagem | ✓ encerrada | 🗑 excluída`. A previsão **nunca mais
> é apagada** — excluir é mudar de status.

- ⚠️ **É o soft delete que impede o NÚMERO de se repetir.** `proximoNumeroPlano`
  é `maior + 1` sobre os documentos que existem: apagando a #15 (a mais alta), a
  previsão seguinte nascia **#15 de novo** e o histórico ficava com duas viagens
  diferentes com o mesmo número. Ninguém desconfia de um número que existe.
- **Os pedidos voltam a ficar livres sozinhos:** a reserva (`pedidosEmPlanos`) só
  olha previsão ABERTA. Excluir não mexe na etapa dos pedidos nem desfaz as
  viagens que a previsão já gerou — aquilo aconteceu.
- **Status:** `STATUS_PLANO` = aberto · concretizada · encerrada · excluida.
  ⚠️ A chave legada `ENCERRADO: 'encerrado'` **fica no objeto de propósito**:
  tirá-la não daria erro, `STATUS_PLANO.ENCERRADO` viraria `undefined`, e status
  indefinido é lido como ABERTA — a previsão voltaria a prender os pedidos,
  calada. `statusDoPlano` normaliza o valor antigo na leitura.
- **Liberar tudo ENCERRA a previsão sozinha** (decisão do dono em 18/08/2026):
  aberta com zero pedido ela só ocupava a tela e escondia as que têm serviço. O
  "Encerrar" manual continua, para quando SOBRA pedido e mesmo assim se fecha.
- **A viagem HERDA o número da previsão** (`rotuloCarga`): `#15`, e `#15-2` na
  segunda liberação da mesma previsão (`viagem` = ordem da liberação). Carga
  antiga, nascida antes de existir previsão, mantém o número próprio — papel já
  impresso não se renumera.
- **Histórico:** a aba ganhou a tabela **Previsões encerradas** (nº · data ·
  pedidos que sobraram · viagens geradas · situação · quem fechou e quando),
  via `planosFechados` e `fechamentoDoPlano`. Antes não existia rastro nenhum:
  encerrar já sumia com o plano da tela para sempre.
- **Romaneio = UM BLOCO POR ROTA** (`agrupaRomaneioPorRota`): com a previsão
  sendo do DIA, quase toda viagem leva 2+ rotas, e na lista corrida o motorista
  separava de cabeça. Não força folha nova (duas rotas pequenas gastariam duas
  folhas). A **sequência das cidades continua não existindo** — quem decide na
  estrada é ele.
- Testes em `tests/plano.historico.test.mjs`.
- 🐛 De brinde: `onTirar` nunca era passado para `<Conferencia>`, então o
  "↩ tirar da carga" quebrava ao clicar (a armadilha das props não passadas).

## A PREVISÃO É DO DIA (17/08/2026) — antes era de um vendedor + uma rota
> O caminhão não sai por vendedor: sai num DIA, e nesse dia leva o que está
> prometido para aquela data — inclusive pedidos de vendedores diferentes que
> rodam a mesma região.

- **Cria-se pela DATA DE ENTREGA.** O formulário perdeu Vendedor e Rota; sobrou
  Data de entrega (+ saída prevista) e uma linha viva com o tamanho do dia
  ("34 pedidos até 20/08 · 12 prontos · 4 rotas") antes de criar.
- **`doPlano(p, pl)` é a fonte ÚNICA de "este pedido é do bolo natural desta
  viagem"** — substituiu o `daRotaDo` que vivia dentro de `Carga.jsx`. Quem
  decide o critério é o campo que o plano TEM: com `dataEntrega`, anda por data;
  sem ele (as previsões antigas), continua vendedor + rota, **sem migração**.
- **Entrega ATÉ a data, não a data exata** (decisão do dono): o pedido atrasado é
  justamente quem não pode perder mais um caminhão. ⚠️ **Pedido SEM data também
  entra** — sumir do planejamento é pior do que aparecer a mais.
- **`diaDaPrevisao` usa as partes LOCAIS da data**, não `toISOString()`: em UTC-3
  o ISO cai no dia anterior e a viagem inteira mudaria de dia por causa do fuso.
- **Vendedor e rota viraram FILTRO e AGRUPAMENTO**, não a chave. Dentro da
  previsão as duas colunas quebram em faixas **ROTA × VENDEDOR** com as
  **cidades** do grupo (`agrupaPlanoPorRota`), e a `FiltrosBar` passa a mostrar o
  seletor de vendedor (continua escondido nas previsões antigas, onde não
  separaria nada).
- ⚠️ **Rota de mesmo nome de vendedores diferentes NÃO é fundida** — "às vezes
  coincide" (decisão do dono em 17/08/2026). O sistema põe as homônimas **lado a
  lado** com as cidades à vista e quem monta decide. Por isso, e só aqui, a ordem
  dos grupos é pelo **NOME** da rota: com vários vendedores não existe UMA
  sequência (a posição 0 de um não vem antes da posição 0 do outro), e o
  `ordemRota` do cadastro só desempata.
- **"Prontos sem previsão" agrupa por DATA** (com as rotas do dia em chips) e o
  botão vira "+ Criar previsão do dia 20/08". Grupo sem data de entrega não cria
  viagem — o botão explica em vez de sumir.
- **"pôr todos" confirma acima de 20 pedidos**, e cada faixa de rota tem o seu
  "+ pôr os N": com o dia inteiro na lista, um clique arrastava 100 pedidos.
- A segunda aba vira **"🔍 Outras datas"** e o aviso de trazer de fora passa a
  dizer o que "fora" significa ali ("entrega em 03/09, depois desta viagem").
- **A tela é uma prancheta, não um relatório.** Escolhe a data (antes era
  vendedor + rota) e mostra DUAS colunas: "Nesta viagem" × "Disponíveis até
  &lt;data&gt;". Cada linha diz onde o
  pedido está — ✅ pronto (volumes + peso) ou ⏳ **em que setor** o que falta está
  parado (`pendenciasDoPedido`). Esse segundo dado é o motivo da tela existir:
  sem ele, planejar é chutar. ⚠️ A primeira versão disto foi um painel de
  "viagens sugeridas" (cards com o resumo de cada bolo) e foi **rejeitada pelo
  dono**: mostrava e não deixava fazer. Não recolocar.
- **Liberar para entrega solta o que está PRONTO e o plano CONTINUA aberto**
  com o resto. Uma rota rende várias viagens; encerrar a cada carga obrigaria a
  refazer o planejamento e o que ficou para trás sumiria de vista. `plano.cargas`
  acumula as viagens que saíram.
- **Ordem da tela: PREVISÕES em cima, "Prontos sem previsão" embaixo.** Invertido
  (como nasceu), seis previsões sumiam atrás de dezenas de cards de estoque e o
  dono perguntou "como vejo os 6 pedidos que estão em planejamento?" (14/08/2026).
  A previsão é o documento de trabalho, o que a pessoa volta para abrir; o estoque
  pronto é matéria-prima.
- ⚠️ **"Prontos sem previsão" é obrigatório na tela.** Ao trocar a montagem direta
  pelo plano, TODO o estoque já expedido sumiu da tela de uma vez — não havia
  plano nenhum, então não havia onde vê-lo (bug relatado pelo dono em 14/08/2026:
  "todos os itens que já estavam em entregas saíram do painel"). O bloco lista o
  que está expedido e fora de qualquer plano, agrupado por vendedor+rota, com
  "+ Criar previsão com estes" (ou "+ Pôr na previsão #N" quando já existe uma
  para aquela rota). É também o ponto de partida natural: a previsão nasce do que
  já está no galpão.
- **Trazer pedido de FORA da rota (14/08/2026):** a coluna da direita tem dois
  modos — "Desta rota" (a fila natural) e "🔍 Outras rotas" (busca livre em todo
  o sistema, incluindo outros vendedores). Fica separado de propósito: puxar de
  fora é DECISÃO, não rotina, e a fila da rota não pode ficar poluída com o
  sistema inteiro. ⚠️ A lista aparece **sempre**, mesmo sem filtro: a primeira
  versão exigia um filtro ativo e escolher "Todos vendedores" — que é a AUSÊNCIA
  de filtro — devolvia tela vazia (relatado pelo dono em 14/08/2026). O tamanho
  é resolvido com **corte visível** (`LIMITE_BUSCA = 40` + rodapé "Mostrando 40
  de N"), nunca escondendo tudo: lista truncada sem aviso passa a impressão de
  que aquilo é tudo que existe. Pôr um pedido de fora pede confirmação, mais forte quando
  é de outro vendedor. Depois disso ele é marcado em TODA parte: chip
  `⚠ ROTA · VENDEDOR` na linha, `+N de fora` no cabeçalho da viagem e
  `⚠ N de outras rotas` no card da lista — a viagem muda de itinerário, e
  ninguém pode descobrir isso só na hora de carregar.
- **Clicar no pedido abre os PRODUTOS** (`LinhaPlano`), fechado por padrão: a
  lista precisa caber na tela para escolher a viagem, e tudo aberto viraria uma
  parede de texto. Cada produto mostra o selo da linha, os volumes prontos com
  peso e, quando falta, quanto e em que setor — "3 volumes" não diz se é a sacola
  grande ou a etiqueta, e é o produto que decide o que sobe no caminhão.
- **Folha de PENDÊNCIAS impressa (`🖨 Pendências`, na previsão aberta):** o que
  ainda está em produção nos pedidos da tela, para levar ao chão de fábrica e
  cobrar. **Agrupada por SETOR, não por pedido** — quem cobra anda de posto em
  posto; por pedido, obrigaria a varrer a folha inteira para saber o que é da
  montagem. Cada linha: quadradinho de marcar, selo da linha + produto,
  `#pedido cliente · cidade`, quantidade que falta e o prazo (a ordem dentro do
  setor é a previsão). Helpers em utils: `itensPendentesDoPedido` (detalhe por
  item — `pendenciasDoPedido` virou o resumo dele), `pendenciasPorEtapa`,
  `ordemPendencia` (desempata as 3 linhas, que têm o mesmo `posNoFluxo`).
  Dentro do setor a folha **quebra por MATERIAL** (`pendenciasPorEtapa` devolve
  `materiais`, na ordem de `MATERIAIS`): quem faz papel não é quem faz plástico,
  e a mesma folha vai para postos diferentes. Material que o cadastro não
  reconhece sai num grupo próprio (`SEM_MATERIAL`), nunca escondido.
  ⚠️ Imprime **exatamente o que está na tela** (a viagem + a lista da direita
  como está filtrada) e a folha declara isso no cabeçalho: impressa com filtro
  ligado ela é PARTE do que existe, e sem o aviso passaria por lista completa.
- **Filtro de MATERIAL na previsão** (seletor ao lado dos chips de situação,
  iterando `MATERIAIS`): é filtro de ITEM, igual ao da Lista de Produção —
  o pedido fica se tiver algum item do material e, dentro do card, só esses
  itens aparecem (produtos e o resumo `⏳ N em Montagem`). ⚠️ O resumo sai da
  MESMA lista filtrada (`resumePendencias`, fonte única do agrupamento), senão a
  linha diria 3 e a lista aberta logo abaixo mostraria 1. **O bloco `✅ pronto ·
  N volume(s)` NÃO é filtrado** de propósito: é o que sobe no caminhão, e pôr o
  pedido na viagem leva o pedido INTEIRO — filtrar ali faria a tela prometer uma
  carga menor do que a que sai.
- **Filtro por SITUAÇÃO** (`SITUACOES`: Todos · ✅ Prontos · 📦 Na montagem ·
  🏭 Na linha) nas duas listas do plano. "O que já dá para levar" e "o que sai da
  montagem a tempo" são perguntas diferentes, e a lista misturada não responde
  nenhuma. ⚠️ O "pôr todos" usa a lista VISÍVEL — com um filtro ligado, acrescentar
  também os escondidos seria uma ação maior do que a tela mostra.
- ⚠️ **Os seletores da tela saem de TODOS os pedidos, não dos prontos.** Vendedor
  sem nada pronto no momento sumia do filtro, e com ele as rotas dele. (O
  formulário de nova previsão não tem mais seletor de rota — nasce pela data —,
  mas o motivo original vale para os filtros: programar a viagem de uma rota
  cujos pedidos estão TODOS na produção é justamente quando planejar vale a pena.
  `rotasDoVendedor` continua alimentando o filtro da lista de previsões.)
- ⚠️ **Um pedido só pode estar num plano aberto por vez** (`pedidosEmPlanos`) —
  senão duas viagens se planejam contando com a mesma mercadoria. A linha do
  outro plano aparece com o `+` travado e a tag "no plano #N".
- **Liberar fica travado enquanto existe carga em montagem** — só uma carga
  aberta por vez, senão a segunda nasce escondida atrás da conferência.
- **PESO (`pesoDaQtd`/`pesoDaLista`/`fmtPeso`):** o volume de **plástico já é kg**
  — foi à balança no fechamento da montagem. O de papel/etiqueta/alça guarda
  QUANTIDADE, e o peso sai do campo **`pesoUnit`** (kg por unidade) do cadastro de
  Itens: 500 un × 0,012 = 6 kg. **Sem peso próprio vale `PESO_PADRAO`** — papel
  40 g, alça torcida 45 g (médias informadas pelo dono em 14/08/2026) — e o
  resultado vem com `padrao: true`: a média genérica e o peso medido daquele
  produto são as duas estimativas, mas não valem a mesma coisa numa conferência.
  O peso cadastrado no produto SEMPRE ganha da média. **ETIQUETA segue sem
  média**: sem chute, continua contada à parte em vez de entrar no total com um
  número inventado.
  O resultado diz se é `estimado` (a tela põe `~`),
  porque somar pesado com estimado sem avisar faz o operador carregar confiando
  numa conta que ninguém verificou. ⚠️ **Produto sem `pesoUnit` NÃO entra na
  soma** e é contado à parte (`semPeso`): um total que ignora volumes em silêncio
  mente **para baixo**, e é aí que o caminhão passa do limite.
- **Capacidade:** `config/cadastros.logistica.capacidadeKg`, editável no
  cabeçalho de Entregas só por staff. É **aviso, não trava** — quem olha o
  caminhão é quem carrega.
- **Sequência de cidades: não existe** — o motorista decide na hora (decisão do
  dono). O romaneio continua agrupado por cidade, sem impor ordem.
- **Rules:** `planos` com a mesma regra da carga (`trabalhaComCarga`) — quem
  monta a viagem é quem planeja. ⚠️ Publicar as rules ANTES do build: sem elas a
  aba Planejamento abre e o onSnapshot morre com permission-denied.

## BUSCA POR NOME PARECIDO (18/08/2026)
> "Por nome de cliente só abre se estiver idêntico" (relatado pelo dono). O
> filtro já ignorava acento e maiúscula, mas casava por SUBSTRING exata.

- **`casaBusca(termo, ...textos)` (utils) é a fonte única** — usada por
  `filtraPedidos` (cliente), Auditoria, Cadastros › Clientes e Cadastros › Itens.
  Cada PALAVRA digitada precisa aparecer, em qualquer ordem, colada ou separada,
  com até um erro de digitação: `BEACHWEAR`→`LUX BEACH WEAR`, `MODAS ATUAL`→
  `ATUAL MODAS`, `JESICA`→`JESSICA CLOSET`.
- **É E, não OU:** digitar mais palavras tem que ESTREITAR — senão a lista cresce
  justo quando a pessoa tenta ser específica.
- **Erro de digitação só a partir de 4 letras** (`cabeEmErros`, Levenshtein com
  corte): abaixo disso a tolerância vira coringa — "ANA" casaria com "ANO",
  "UVA", "AVA".
- ⚠️ **NÃO confundir com `casaCliente` (Conciliação), que continua NÃO sendo
  fuzzy.** A diferença não é de rigor, é de consequência: a busca só desenha
  candidatos e QUEM DECIDE É A PESSOA; o `casaCliente` marca pedido como entregue
  sozinho, e nome parecido por acaso daria baixa no pedido de outro cliente
  (`SAF FUNERARIA` × `ATUAL MODAS`, mesmo número, caso real).
- **O número do pedido continua substring exata** — dígito não tem "parecido".
- Testes em `tests/busca.test.mjs`.

## CANCELAR ENTREGA — dois bugs somados (18/08/2026)
> "Ao clicar em cancelar entrega ele não some da lista" (dono). Eram DOIS
> problemas, e o primeiro explica também cards trocados na tela.

- **O `id` do DOCUMENTO tem que ganhar do campo `id` gravado dentro dele.**
  `doDoc(d)` (utils) é a leitura correta; `{ id: d.id, ...d.data() }` — a ordem
  intuitiva — faz o contrário. A remessa em `entregues` nascia de um `...pedido`
  que já carregava o `id` do doc de `pedidos`, então `p.id` virava `5001` num
  documento chamado `5001-1`: o cancelamento apagava `entregues/5001`, que não
  existe, e **o Firestore não reclama de apagar o que não há** — a quantidade
  voltava para o pedido e o registro ficava na tela (cancelar duas vezes
  devolveria a quantidade duas vezes). Duas remessas do mesmo pedido também
  ficavam com a **mesma `key`** no React, que aí desenha card trocado.
  A Conciliação já tirava o `id` (`// é do snapshot, não do documento`); a
  **Rota** não — por isso só travava o que ela gravou. Corrigido nos dois lados:
  a Rota parou de gravar e a leitura passou a mandar. Teste: `tests/doc-id.test.mjs`.
- **A tela não tinha `try/catch`:** qualquer falha morria no console e o clique
  parecia não valer. É o que escondeu o bug acima por semanas.
- **Cancelar devolve para a EXPEDIÇÃO** (decisão do dono em 18/08/2026), não para
  `expedido`: em `expedido` o pedido reaparece na Rota como pronto para sair de
  novo, sem ninguém ter conferido o que voltou no caminhão. O botão "Retornar
  para Expedição" (que só aparecia em pedido de gráfica) foi **fundido** no
  "Cancelar entrega" — mesmo destino, era a mesma ação com dois nomes.
- ⚠️ **Devolver item embalado é por VOLUME, não por quantidade.** `devolve()`
  aplica `mapaEtapasMovendoVolumes` no que tem volume e `mapaEtapasComQtd` no
  resto (pedido misto é normal). Só por quantidade era **no-op silencioso**:
  `mapaEtapasComQtd` PRESERVA a entrada que tem volumes, então a entrega sumia do
  histórico e o item continuava marcado como entregue.
- **Pedido que já tinha sido apagado é recriado a partir das `etapas` guardadas
  na própria remessa** (o retrato de ANTES da entrega) — é o que traz os volumes
  de volta. Sem esse retrato (remessas antigas/da conciliação), cai na
  reconstrução por quantidade.
- ⚠️ **Nenhum item casando = ERRO, não gravação.** Gravar o mapa nesse caso
  apagaria as etapas do pedido inteiro.

## ENTREGUES — o pedido procurado fica DESTACADO (18/08/2026)
- O dono digitou `5111` na busca e ainda assim usou o **⌘F do navegador** para
  achar o card. A tela filtrava certo e não dizia QUAL era o pedido.
- **Só destaca quando o termo é NÚMERO e casa com o id inteiro** (`.card-alvo`,
  moldura âmbar + `scrollIntoView`): buscar "MODAS" não tem alvo, tem resultado,
  e pintar todos os cards de destaque não destaca nada.
- O trecho digitado sai marcado no nome e no número (`<mark class="hl">`,
  componente `Realce`) — o recorte é feito no texto ORIGINAL pelas posições do
  texto normalizado, senão o cliente apareceria sem acento na tela.
- ⚠️ **Alvo escondido por OUTRO filtro** (só pendentes, motorista) não pode dizer
  "não existe": a linha avisa que o pedido está entregue, mas fora dos filtros —
  senão a pessoa vai procurá-lo em outra tela enquanto ele está atrás de um
  checkbox.
- A busca da tela passou a usar `casaBusca` (nome parecido); o **número continua
  por pedaço exato**, então 5111 nunca traz 5118.

## Navegação / usabilidade
- **`PainelEdicao` (FEITO):** em Cadastros o formulário de edição é renderizado no TOPO
  da página. Quem clicava em "Editar" num card lá embaixo não via nada acontecer e achava
  que o botão estava quebrado. O componente traz o formulário para a tela ao abrir e o faz
  piscar uma vez. Envolve os 4 formulários de Cadastros (vendedor, motorista, cliente,
  item); **Usuários não precisa** — lá o form abre no lugar do próprio card.
  ⚠️ A posição sai de `scrollIntoView` + `scroll-margin-top: 84px` (`.painel-edicao`), e
  **não** de conta na mão com `getBoundingClientRect`: o formulário entra ACIMA da lista,
  empurra o conteúdo e o navegador reajusta a rolagem (scroll anchoring) depois que a
  conta já foi feita — testado, rolava para o lado errado. O `scroll-margin-top` é o que
  impede o título de ficar embaixo do cabeçalho sticky.
- **`VoltarAoTopo` (FEITO):** botão flutuante em TODAS as telas (renderizado no `Layout`),
  aparece depois de 400px de rolagem. `desviaDaVoz` sobe para `bottom: 110px` quando o
  🎤 do assistente está na tela (o FAB da voz tem 78px) — `veAssistenteVoz(perfil)` em
  utils é a fonte única para App e Layout não divergirem.
- Os dois respeitam `prefers-reduced-motion`. O `PainelEdicao` ainda tem rede de segurança:
  se a rolagem suave não executar (ambiente sem animação), ele vai direto — senão o
  usuário cai de novo no "cliquei e nada aconteceu", que é o bug que isto conserta.

## Design / identidade
- **Dashboards (Produção e Rota):** linha de produção = faixa colorida forte
  (`.linha-bloco`/`.linha-head`, cor de `MODO_COR`), rota = badge/banda destacada
  (`.rota-badge` na Produção, `.rota-band` na Rota) — divisão linha × rota bem evidente.
- **Rodapé Totali:** `src/components/Footer.jsx` (renderizado no `Layout`, em todas as telas) —
  "Solução desenvolvida por" (texto branco) + logo oficial. Assets em `src/assets/`:
  `totali-branca.png` (fundo escuro, em uso) e `totali-preta.png` (fundo claro/impressão).
  Logos baixadas/fornecidas pelo cliente (imagotipo "totali Soluções Contábeis").

## Fase 2 (projeto à parte, depois da base rodando)
**Módulo de custo / ficha técnica (BOM):** insumos diretos por produto (resina em kg p/
plástico, folha por tamanho p/ papel) + insumos secundários por rateio (tinta, energia) →
apuração de custo por pedido/linha/produto e margem. Depende do cadastro de Itens maduro.
> Lembrete contábil: critério de rateio e apuração (custo de estoque/CMV) tem implicação
> fiscal — validar o método com a contabilidade da JC antes de virar número oficial.

## TESTES — `npm test` (15/08/2026)
- **Onde:** `tests/*.test.mjs` + `tests/_run.mjs`, sem dependência (ESM puro no
  `node`). Antes viviam em pasta temporária e **se perderam** numa troca de
  sessão; agora são versionados.
- **O que cobrem:** as invariantes cuja quebra é SILENCIOSA — quantidade que
  some, volume apagado, relógio que zera, correção que o import desfaz, rota
  congelada, peso que mente para baixo. Não cobrem React nem Firestore.
- **`tests/import.test.mjs` faz ida e volta por uma planilha de verdade** e é a
  prova de fogo da biblioteca `xlsx`: se ela for trocada, é ali que se valida.
- ⚠️ O arreio é **um módulo só** para todos os arquivos, então `resultado()`
  reporta o DELTA desde a chamada anterior — senão os números acumulam.
- ⚠️ No arreio, entrada de etapa **vazia não entra no mapa**: um `{}` já conta
  como "formato novo" e esconde o fallback do campo antigo `p.etapa`.

## ⚠️ `fechaMontagemEmVolumes` e `desfazEmbalagem` devolvem ENTRADA, não mapa
Bug achado ao escrever os testes (15/08/2026): as duas estavam envolvidas por
`carimbaTempos`, que espera um MAPA indexado por chave de item. Carimbar uma
entrada é **no-op** — ele procura chaves de item num objeto que não é mapa e
devolve tudo igual, sem erro. Resultado: **fechar a montagem em volumes não
contava o tempo da montagem**, e a estatística sairia subnotificada justo no
setor que se quer medir. Hoje o carimbo é aplicado por quem monta o mapa
(`QuadroProducao`, no fechamento). Regra: **só envolva com `carimbaTempos`
função que devolve MAPA**.

## Dependências — o que o `npm audit` não diz (15/08/2026)
- **`xlsx` migrada para a distribuição oficial da SheetJS** (`0.20.3` via
  cdn.sheetjs.com). A versão do npm parou na `0.18.5`, que tem prototype
  pollution e ReDoS — e é a ÚNICA biblioteca que processa arquivo vindo de fora
  (a planilha do Posseidon). Validada pelo `tests/import.test.mjs`.
- **`react-router-dom` fica na 6.30.4.** Os advisories de open redirect cobrem
  toda a 6.x e a 7.x até 7.17, e só saem na 7.18 (major com quebra). ⚠️ **Não é
  alcançável aqui**: o app tem exatamente 3 destinos de navegação
  (`App.jsx` ×2, `Layout.jsx` ×1), todos interpolando nomes de aba vindos de
  `ACESSO[perfil]` — listas literais, nunca dado do usuário. E não há SSR, o que
  descarta o advisory de hidratação. Migrar major em produção por vulnerabilidade
  inalcançável é trocar risco real por risco teórico.
- **Os 13 alertas restantes são `undici`/`protobufjs`**, dependências do Firebase
  para Node. **Não chegam ao bundle do navegador** (verificado: 0 ocorrências em
  `dist`). São ruído neste projeto.

## Armadilhas recorrentes do código (LER ANTES DE EDITAR)
- **Props não declaradas na assinatura** de subcomponentes (`CardTriagem`, `CardProd`,
  `ImpressaoProducao`) causam **tela preta** — o build do Vite não pega. Sempre declarar a
  prop na função, não só passar no JSX.
- **`updateDoc` ≠ `setDoc`+merge:** para substituir o objeto `linhasItens` inteiro, usar
  `updateDoc` (o merge profundo do Firestore impede DELETE de chaves).
- **Datas no SheetJS:** arquivos de teste precisam de `Date` nativo + `cellDates: true` no
  `json_to_sheet` e no `writeFile`.
- **CNAME** tem que ir pro `dist/` antes de sobrescrever o `gh-pages`, senão cai o domínio.
- **Recalcular no render** (data, nome, **ROTA**) em vez de congelar no import.
  A rota já foi vítima disso: `detectaRota` rodava uma vez no import e gravava
  `p.rota`, então mover uma cidade de rota no cadastro não corrigia nenhum pedido
  já importado (CEDRO DE SÃO JOÃO passou para a ROTA 03 e os pedidos antigos
  continuaram aparecendo no planejamento da ROTA 01 — relatado pelo dono em
  14/08/2026). Agora `rotaDe(p, vendedores)` recalcula, aplicada num ponto só no
  `App.jsx` (`useMemo` sobre os pedidos), como `aplicaCorrecoes`.
  ⚠️ **`rotaDe` só substitui quando o cadastro sabe responder**: cidade fora de
  qualquer rota devolve 'FORA DE ROTA', e trocar uma rota real por isso apagaria
  informação por causa de um buraco no cadastro.
  ⚠️ Com a rota viva, quem já está num plano de entrega é listado a partir de
  `todos`, não dos candidatos da rota — senão o pedido que mudou de cidade sumiria
  da previsão continuando dentro de `plano.pedidos`, invisível.

## Método de trabalho
Fechar o desenho antes de codar. Implementar **uma feature por vez** e testar/ajustar
entre uma e outra. Token do GitHub compartilhado na sessão é revogado depois.
