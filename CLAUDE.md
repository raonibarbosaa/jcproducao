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
- **Rota por item + ENTREGA PARCIAL (FEITO):** helpers `pedidoSemEtapa`, `idxProntos`,
  `fatiaProntos` (devolve o pedido só com os itens `expedido`, guardando `_todos`,
  `_idxs` e `_pendentes`). A Rota mostra só o que foi expedido; pedido legado (sem
  `etapa` nem `etapas`) entra inteiro — senão a Rota esvaziava no dia da virada.
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
- Números reais do arquivo: 2.762 entradas válidas → **2.070 pedidos distintos** (692 eram
  repetição). Quantos existem de fato em `pedidos` só se sabe rodando na tela.

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

## Armadilhas recorrentes do código (LER ANTES DE EDITAR)
- **Props não declaradas na assinatura** de subcomponentes (`CardTriagem`, `CardProd`,
  `ImpressaoProducao`) causam **tela preta** — o build do Vite não pega. Sempre declarar a
  prop na função, não só passar no JSX.
- **`updateDoc` ≠ `setDoc`+merge:** para substituir o objeto `linhasItens` inteiro, usar
  `updateDoc` (o merge profundo do Firestore impede DELETE de chaves).
- **Datas no SheetJS:** arquivos de teste precisam de `Date` nativo + `cellDates: true` no
  `json_to_sheet` e no `writeFile`.
- **CNAME** tem que ir pro `dist/` antes de sobrescrever o `gh-pages`, senão cai o domínio.
- **Recalcular no render** (data, nome) em vez de congelar no import.

## Método de trabalho
Fechar o desenho antes de codar. Implementar **uma feature por vez** e testar/ajustar
entre uma e outra. Token do GitHub compartilhado na sessão é revogado depois.
