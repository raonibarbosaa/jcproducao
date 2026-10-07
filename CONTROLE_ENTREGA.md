# CONTROLE DE ENTREGA — a planilha do escritório vira tela (desenho, 07/10/2026)

> **Status: DESENHO FECHADO em 07/10/2026.** Decisões do dono registradas
> abaixo. **Fases A e B FEITAS em 07/10/2026 e REVISADAS no mesmo dia** depois
> que o dono viu a 1ª versão no ar (ver "Revisão de 07/10/2026"). ⚠️ A revisão
> exige publicar `firestore.rules` (campo `baixaEscritorio` para a expedição)
> ANTES do build (✅ publicadas em 07/10/2026). **Fase C FEITA em 07/10/2026.**
> Fase D é a próxima. Fases A → D no fim.

## O problema real (visto na foto da planilha `CONTROLE DE ENTRGA 2026`)

A fábrica **não dá baixa nas etapas** do quadro. O pedido fica, no sistema,
parado no Silk/Montagem enquanto na vida real já está pronto, já saiu e às vezes
já foi entregue. Quando o pedido termina, a **nota fiscal sobe para o
escritório**, e é o escritório que registra numa planilha do Google Sheets
(uma aba por mês) o que o sistema deveria saber:

| coluna da planilha | o que é | onde já mora no sistema |
|---|---|---|
| Nº do pedido | chave | `pedidos/{idVenda}` (ou `entregues/{idVenda}-n` se já foi) |
| Cliente | razão social (às vezes "(EXPED)") | `p.cliente` + apelido via `nomeCliente()` |
| Valor | total do pedido | `p.valorTotal` (`veValor` = só dono/financeiro) |
| Status | **SERÁ ENTREGUE / ENTREGUE / NÃO ENTREGOU** / em branco | `expedido` · `entregues` · `cancelarSaida` |
| Quem entregou | MATEUS PIX, PAULO… | `saidaMotorista` / `entregues.motorista` (cadastro de Motoristas) |
| Cidade | ARACAJU, ITABAIANA… | `p.cidade` (+ rota via `rotaDe`) |
| linhas soltas "RECEBER CHEQUE" | observação de cobrança | hoje não existe no pedido |

Resultado: **duas verdades** — o quadro diz "na linha", a planilha diz
"entregue" — e "eles estão se batendo". É o mesmo buraco que a Conciliação
tapa DEPOIS, no atacado, e que o "já foi entregue" do vendedor tapa pelo lado
do cliente. Falta a entrada do ESCRITÓRIO, na hora em que a nota chega.

## O que a tela faz (em uma frase)

**Digita o número do pedido → a tela puxa cliente, cidade, valor, vendedor,
rota e ONDE o sistema acha que ele está → um clique declara "pronto" (vai para
`expedido`), outro "saiu para entrega" (motorista), outro "entregue".** Embaixo,
a lista do mês igual à planilha — mas derivada do banco, não digitada.

## Princípios (decisões que o código tem que respeitar)

1. **Nada de coleção nova para a "planilha".** A linha da planilha é um
   pedido em `expedido`/saiu ou uma remessa em `entregues`. A tabela do mês
   é uma **VISÃO** sobre o que já existe (`pedidos` + `entregues`), com filtro
   de período. Se virasse coleção própria, nasceria a TERCEIRA verdade.
2. **A baixa do escritório é uma baixa NORMAL de etapa**, gravada com
   `mapaEtapasComQtd`/`mapaEtapasMovendoVolumes` + registros de `auditoria`
   no mesmo `writeBatch` (regra da casa: movimento sem rastro não existe).
   Diferença: o registro leva **`origem: 'escritorio'`** e o `por` da etapa é
   quem está no escritório. É esse campo que depois mostra **qual setor não
   está dando baixa** — o relatório que ataca a causa, não o sintoma.
3. **Sem balança, sem volume.** O escritório não pesou nada, então o item
   anda **por QUANTIDADE** (caminho do item legado: `volumeId: ''` em
   `itensParaCarga`, `semPeso` no peso da viagem). ⚠️ **Não inventar volumes
   nem peso** — é a mesma regra do atalho removido no `FecharMontagem`. O que
   se perde (declarado): contagem de volumes, peso real, quebra de processo
   e o tempo de fila da montagem (o relógio fecha linha→expedido num salto).
   Item que a fábrica JÁ embalou (tem volumes em `expedicao`) anda por volume
   (`movePorVolume` → `expedido`), e aí nada se perde.
4. **"Pronto" = `expedido`, não `expedicao`.** Na linguagem do dono "deixar o
   pedido em expedição" quer dizer "pronto para sair". No sistema `expedicao`
   é a coluna do quadro (embalado, esperando o ✓ Expedir) e **`expedido` é o
   que a Rota, a aba Entregas e o Localizar leem como "pronto no galpão"**.
   SERÁ ENTREGUE da planilha ⇔ `expedido`. Parar em `expedicao` obrigaria um
   segundo clique no quadro — que é exatamente o clique que ninguém dá.
5. **Nunca cria pedido.** Número que não existe em `pedidos` nem em
   `entregues` → "não importado: importe a planilha do Posseidon". Mesma regra
   da Conciliação.
6. **Nunca entrega duas vezes.** Número que já tem remessa não parcial em
   `entregues` → a tela mostra "✅ entregue em dd/mm por X" e não oferece
   nada além de "ver em Entregues". Com remessa PARCIAL mostra as duas partes.
7. **Por ITEM com padrão TUDO MARCADO** (o mesmo padrão do `itensFora` da
   previsão): a nota fiscal normalmente é do pedido inteiro, mas o card lista
   os itens com a situação de cada um e um checkbox já marcado; desmarcar é a
   exceção para quando parte continua mesmo na fábrica. Item já `expedido`,
   já saiu ou já `entregue` aparece cinza, sem checkbox.
8. **Ações seguem as permissões que JÁ existem**, sem rule nova:
   - **Pronto** e **Saiu / Cancelar saída**: dono, designer, financeiro e
     expedição (os dois eixos). As rules de `pedidos` já aceitam `etapas` +
     `saidaEm/saidaMotorista/saidaPor` dela e `auditoria` já aceita `create`.
   - **Entregue**: só dono, designer, financeiro (`podeEntregar` da Rota —
     é o que abre a cobrança). Decisão do dono em 07/10/2026.
   - Valor: só quem tem `veValor`.
9. **Saída direta NÃO cria carga.** Já é assim na Rota (`marcarSaida`). A
   carga continua sendo a viagem planejada (plano → carga → romaneio). A tela
   mostra se o pedido está numa previsão/carga e, nesse caso, **manda marcar
   a saída pela carga** em vez de duplicar — mesmo bloco `Logistica` do
   Localizar.
10. **Data é a de agora.** Sem retroagir na v1: a tela é para usar na hora em
    que a nota chega. Retroativo tem o caminho do "já foi entregue" (que
    exige data digitada e observação) e a Conciliação.

## A tela — `ControleEntrega.jsx`, aba `controle` ("📋 Controle de entrega")

```
┌ Nº do pedido [ 5738 ]  (busca por pedaço exato de número; nome via casaBusca) ┐
│                                                                                │
│ #5738 · BETEK KIDS (apelido) · ITABAIANA · ROTA 02 · PAULO (vend.) · R$ 448,00 │
│ 📍 Onde o sistema acha que está:  2 itens na Montagem Papel · 1 no Silk        │
│    (resumoLocalizacao — a montagem quebra por material, é um posto cada)       │
│ ⚠ faixa vermelha se há `problemas` tipo `entregue` aberto (vendedor avisou)     │
│                                                                                │
│ ☑ SACOLA PAPEL P02 · 500 un · Montagem Papel                                   │
│ ☑ ETIQUETA 5x5 · 1.000 un · Silk                                               │
│ ▫ ALÇA TORCIDA · 500 un · ✅ já pronto (2 volumes)                              │
│                                                                                │
│ [ ✅ Marcar PRONTO (SERÁ ENTREGUE) ]  → move marcados para `expedido`          │
│ Motorista [ MATEUS ▾ ]  [ 🚚 Saiu para entrega ]  [ ↩ Não entregou ]           │
│ [ 📦 ENTREGUE ]  (só staff; exige motorista; usa a mesma gravarEntrega da Rota)│
└────────────────────────────────────────────────────────────────────────────────┘

Mês [ OUTUBRO 2026 ▾ ]  Situação [ todos | será entregue | saiu | entregue ]  🖨 / CSV
┌──────┬──────────────────┬────────────┬──────┬───────────┬────────────┬───────────────┬────────┐
│ nº   │ cliente          │ cidade     │ rota │ valor     │ situação   │ quem/quando    │ origem │
│ 5738 │ BETEK KIDS       │ ITABAIANA  │ R02  │ R$ 448,00 │ 🚚 saiu    │ MATEUS 07/10  │ 🏢 esc.│
│ 6215 │ CREDIMOVEIS      │ ITABAIANA  │ R02  │ R$1.443,20│ ✅ entregue│ PAULO 03/10   │ 🏭 fáb.│
└──────┴──────────────────┴────────────┴──────┴───────────┴────────────┴───────────────┴────────┘
```

- **Linha de lançamento no topo** (o campo de número já com foco ao abrir a
  aba e depois de cada gravação — o fluxo é "nota na mão, digita, clica,
  próxima"). Enter no número abre o card; se o número casar com um só
  pedido, abre direto.
- **Card** reaproveita `buscaGlobal`, `situacaoEntrega`, `localizacaoDoPedido`
  e `resumoLocalizacao` do Localizar e o bloco `Logistica` (previsão/carga/
  saída). Não reescrever: duas contas de "onde está" divergem em silêncio.
- **Tabela do mês**: `linhasControleEntrega(pedidos, entregues, {mes})` em
  utils. Entra: pedido vivo com algum item `expedido` (SERÁ ENTREGUE) ou com
  `saidaEm` (saiu), e remessa de `entregues` com `entregueEm` no mês. Pedido
  com remessa parcial aparece **duas vezes** (uma linha por estado), como na
  planilha quando o pedido vai em duas viagens. A coluna **origem** diz se a
  baixa para `expedido` foi da fábrica (quadro) ou do escritório — sai da
  `auditoria`? **Não**: a auditoria só o dono lê. Sai de um carimbo no
  pedido: `baixaEscritorio: { em, por }` (gravado no mesmo batch; `deleteField`
  se o pedido voltar para a produção). É um campo, não uma coleção.
- **Impressão/CSV do mês** com o mesmo layout da planilha, para o período de
  transição em que o escritório ainda vai querer "a planilha".
- **Situação "NÃO ENTREGOU"** = `cancelarSaida` (volta para pronto) e, se
  quiser registrar o motivo, um `problemas` do tipo existente. Não é estado
  novo no banco: estado novo em `pedidos` teria que entrar em todas as rules
  e telas que leem `saidaEm`.

## Como se conecta com o resto (o que muda em cada tela, e o que NÃO muda)

| tela | efeito |
|---|---|
| **Quadro** (`QuadroProducao`) | o item marcado pronto **some da fila** — é o objetivo: a fábrica para de ver o que já saiu. O `⏱` da etapa fecha. Nada a editar no quadro. |
| **Lista de Produção** | `temTrabalhoNaProducao` fica falso → o pedido sai da lista sozinho. |
| **Rota** | o pedido aparece como pronto (lê `expedido` via `fatiaProntos`); o `🚚 saiu` e o motorista aparecem no chip que já existe. Mesmos campos. |
| **Entregas / Planejamento** (`Carga.jsx`) | entra em "Prontos sem previsão" como volume único `volumeId: ''`, peso `semPeso` (contado à parte, nunca somado como zero). Se o escritório já marcou saída, `situacaoEntrega.saiu` deixa à vista. |
| **Localizar** | passa a mostrar "pronto no galpão · baixado pelo escritório em dd/mm" — e ganha os mesmos botões do card (Fase C), porque hoje ele é só leitura para desbloquear. |
| **Entregues** | remessas criadas pelo botão ENTREGUE desta tela são iguais às da Rota (`gravarEntrega` sai de `Rota.jsx` para utils e as duas chamam a mesma). Baixa financeira continua lá. |
| **Meus Pedidos / Quadro do vendedor** | o vendedor vê o pedido andar (`etapaVend` = pronto/saiu/entregue). O botão "já foi entregue" dele some sozinho quando `naProducao` cai. |
| **Erros** | aviso "já foi entregue" do vendedor aparece no card da tela e **é fechado pelo escritório no ato** (opcional, Fase C): a baixa é a resposta ao aviso. |
| **Auditoria** | registros com `origem: 'escritorio'`, `de` = etapa real de cada item, `para: 'expedido'`. Filtro novo "origem". |
| **Relatórios** (Fase D) | **"Baixas pelo escritório por setor × mês"**: quantos itens o escritório teve que baixar e de qual etapa saíram. É o número que diz quem não está usando o tablet — e é o que resolve "se batendo" na raiz. |
| **Financeiro** | nada muda agora: `cobrancas` nasce da remessa, como hoje. "Receber cheque" é o módulo de cheques (decisão 4); quando existir, a tabela do mês mostra o chip vindo de `cobrancas`. |
| **Import do Posseidon** | nada muda: `etapas` não é sobrescrito pelo import; `baixaEscritorio` também não (campos do pedido fora de `itens`). |

## O que fica de fora de propósito

- **Não substitui o tablet do posto.** A tela é a rede de segurança; se ela
  virar o caminho normal, o relógio da fila e a quebra de processo morrem. Por
  isso a coluna "origem" e o relatório da Fase D existem desde o começo.
- **Não dá baixa financeira** — isso é Entregues/Financeiro.
- **Não cria carga nem romaneio** — isso é a aba Entregas.
- **Não retroage data** na v1.

## Decisões do dono (07/10/2026)

1. ✅ **"Pronto" cai em `expedido`** (Rota/Entregas/Localizar já leem como pronto). Não para na coluna Expedição do quadro.
2. ✅ **A ENTREGA é só do escritório** (dono/designer/financeiro). **Pronto e Saída: a EXPEDIÇÃO também** (perfil `expedicao` e operador com setor `expedicao|entrega` — os dois eixos, como a aba Entregas). Rules já cobrem: `etapas` + campos de saída + `auditoria.create`.
3. ✅ **"MATEUS PIX", "PAULO" são MOTORISTAS** → seletor do cadastro de Motoristas, grava `saidaMotorista`/`entregues.motorista`, como a Rota.
4. ✅ **"RECEBER CHEQUE" é assunto do MÓDULO DE CHEQUES do Financeiro** (Fase 2 do FINANCEIRO.md), **não** observação solta no pedido. Na tela de controle não entra campo de observação; quando o módulo de cheques existir, a linha da tabela mostra um chip "💵 cheque" vindo de `cobrancas`. ⏳ detalhe a decidir lá: o cheque é recebido NA ENTREGA pelo motorista — a baixa da remessa é o gancho natural.
5. ❌ **NÃO rodar a Conciliação antes** (decisão do dono). A tela nasce com o quadro como está; o passado é baixado pedido a pedido conforme a nota aparece, ou pela Conciliação quando o dono quiser.
6. → virou a 4.
7. ❌ idem 5.
8. Nome da aba: **"Controle de entrega"** (o nome da planilha deles).

Decisão derivada de 4: `obsEntrega` SAI do desenho. Decisão derivada de 2: `ACESSO.controle` = dono, designer, financeiro, expedicao; `abasDoUsuario` abre a aba para operador com setor expedicao|entrega; `podeEntregar` só staff.

## Revisão de 07/10/2026 — o dono viu a 1ª versão no ar e corrigiu o rumo

A 1ª versão listava TUDO que estava em `expedido` (77 baixas da fábrica) e
misturava o histórico de entregas por mês. Não era isso. O que vale agora:

1. **Só entra na lista o que o ESCRITÓRIO lançou** (`baixaEscritorio.em`).
   Pedido que a fábrica baixou sozinha não aparece até alguém digitar o número.
   A lista é a FILA DO QUE ESTÁ NA RUA, não um arquivo mensal — por isso o
   filtro de mês saiu.
2. **Lançar é UMA ação:** nº do pedido + motorista (obrigatório) = pedido
   finalizado e SAIU. `lancarControle` = `baixaEscritorio(..., {inteiro:true})`
   + carimbo + `saidaEm/saidaMotorista/saidaPor`, num batch só com a auditoria.
   Pedido já pronto pela fábrica também é lançado (só carimbo + saída).
3. **Lançar leva o pedido INTEIRO** (decisão do dono): sem checkbox por item.
   ⚠️ A parte solta de item que a fábrica já tinha embalado vira um **volume
   declarado** com a quantidade PEDIDA e `semPesagem: true` (também na
   auditoria). Não é peso de balança e o campo diz isso — mas sem ele o resto
   ficaria preso na fábrica contra o que o escritório acabou de declarar.
   Hoje `volumesDoItem`/`movePorVolume` não carregam a flag adiante: ela vive
   no doc até o próximo movimento do item e na auditoria.
4. **Entregue SAI da lista.** O histórico é a aba Entregues. **ENTREGUE é do
   FINANCEIRO e do DONO** (`podeEntregarNoControle`), não do designer.
5. **Situações = as da planilha:** SERÁ ENTREGUE (lançado, na rua) ·
   NÃO ENTREGOU (voltou; saída apagada, continua na lista; "🚚 Saiu de novo")
   · ENTREGUE (some daqui).
6. **Rules:** `baixaEscritorio` entrou no `hasOnly` da expedição e do operador
   de expedição/entrega em `pedidos` — sem isso o lançamento da expedição cai
   em permission-denied. ⚠️ **Publicar ANTES do build.** (O login do Firebase
   nesta máquina expirou em 07/10/2026: `npx firebase login --reauth`.)
7. "Fica depois da etapa da montagem": é o lugar do controle no fluxo —
   Montagem → lançamento do escritório → rua → entregue.

## Fases

- ✅ **A — helpers + testes (utils, sem tela) — FEITA 07/10/2026:** `baixaEscritorio(p, idxs, quem)`
  → `{ etapas, auditoria[], campos }` (quantidade para o que está solto,
  volume para o que já está embalado em `expedicao`; recusa item já
  `expedido`/`entregue`; `origem: 'escritorio'`; `baixaEscritorio: {em, por}`);
  `linhasControleEntrega(pedidos, entregues, {mes})`; `mesesDisponiveis`.
  `gravarEntrega` sai de `Rota.jsx` para utils (`montaRemessa`) sem mudar
  comportamento — a Rota passa a chamar a versão de utils. Testes:
  `tests/controle-entrega.test.mjs` (pedido todo na linha; misto com volume;
  parcial com remessa; já entregue → recusa; reimport não apaga o carimbo).
- ✅ **B — a tela — FEITA 07/10/2026** (`ControleEntrega.jsx`: `CardControle`,
  `TabelaControle`, CSV, impressão só da tabela). A ENTREGUE já entrou aqui
  (era da Fase C) porque `preparaRemessa` ficou pronta na A — para a expedição
  o botão aparece desabilitado com o motivo, não escondido. Campo de número +
  card + PRONTO + SAIU/CANCELAR + tabela do mês + impressão/CSV. Aba `controle` no `ACESSO` (dono, designer, financeiro, expedicao) e em
  `abasDoUsuario` para operador de expedição/entrega (decisão 2).
  `test:tela` cobre o card com um pedido na linha e um já entregue.
- ✅ **C — FEITA 07/10/2026:** as ações saíram da página para
  `src/components/AcoesControle.jsx` (`useAcoesControle` + o bloco de botões),
  fonte única da aba Controle e do **Localizar** — quem acha o pedido lá lança,
  marca retorno e entrega sem trocar de aba. O lançamento **fecha no mesmo
  batch** o aviso "já foi entregue" do vendedor (`avisosEntregaAbertos` +
  `fechaAvisoPeloLancamento`), e a confirmação diz quantos fecha. ⚠️ Só quando
  quem lança é STAFF (`podeFecharAviso`): a rule de `problemas` só aceita update
  de staff, e pôr o fechamento no batch da expedição derrubaria o lançamento
  inteiro — o aviso dela fica aberto para o escritório fechar. Sem rule nova.
- **D — relatório "baixas pelo escritório por setor × mês"** (Relatórios) e
  filtro de origem na Auditoria.

**Rules: nada a publicar nas fases A–C** (os campos novos são do pedido e staff
já grava tudo; expedição só toca `etapas` + saída, já liberados). Se a Fase D
precisar de leitura agregada da `auditoria` por outro perfil, aí sim.

## Armadilhas achadas na Fase A

- **Item de pedido com 2+ itens: mover um ZERA o relógio dos outros.** Os três
  congelamentos (`mapaEtapasComQtdCru`, `mapaEtapasMovendoVolumesCru`,
  `mapaEtapasComCru`) gravam o item não movido sem `desde`/`tempos`, e o
  `carimbaTempos` recomeça o relógio dele. `baixaEscritorio` preserva os dois
  no próprio congelamento (coberto por teste); o conserto dos três construtores
  antigos ficou como tarefa à parte.
- **Sem `importadoEm`/`dataVenda` o fechamento de etapa não grava `tempos`**
  (fallback cai em "agora", duração zero). Nos testes, dar data ao pedido.
- **Baixa parcial não gera linha "pronto" sozinha:** a remessa parcial só
  deixa linha de SERÁ ENTREGUE se o resto também estiver `expedido`; resto na
  fábrica é linha nenhuma (está na produção, não na planilha). É o esperado.

## Armadilhas da Fase B

- **`Realce` quebra o texto em `<mark>`**: no `test:tela`, esperar `5738` e não
  `#5738` (o `#` fica fora da marca).
- **A impressão é SÓ da tabela** (`@media print` esconde card e busca): o papel
  que o escritório quer é a planilha do mês, não o pedido digitado.
- **Depois de gravar, o número fica no campo** e o foco volta para ele: a
  pessoa confere o resultado no card (que muda sozinho pelo onSnapshot) e
  digita o próximo por cima. Limpar o campo esconderia o que acabou de
  acontecer.
- **Pedido em carga viva não ganha o botão SAIU** — a saída dele é pela carga,
  em Entregas; marcar aqui duplicaria a verdade.
- **O card escolhe sozinho** quando a busca devolve 1 pedido ou quando o número
  digitado casa inteiro com o primeiro; senão mostra a lista para tocar.
