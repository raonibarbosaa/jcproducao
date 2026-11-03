# CHEQUES — origem, situação e destino de cada folha (desenho FECHADO em 20/10/2026)

> Pedido do Raoni em 20/10/2026, com dois vídeos das telas de cheque da Zeus
> (*Cadastro de Cheque* em lote e *Localização de cheques* com "Alterar
> situação"). Decisões fechadas no mesmo dia.
> **C1 FEITA em 20/10/2026** (núcleo `src/lib/cheques.js` +
> `tests/cheques.test.mjs`, 122 asserções). **C2 FEITA** (Fornecedores, no ar em
> 26/10/2026). **C3 FEITA em 26/10/2026** (aba Cheques; rules publicadas,
> site no ar em 03/11/2026, commit `099cef6`). Próxima: C4 (repasse).

## O que o controle responde
1. **De onde veio** — qual cliente entregou, em qual pedido, e se o cheque é
   dele ou **de terceiro** (cliente que paga com cheque que recebeu de outro).
2. **Onde está agora** — na gaveta, depositado esperando compensar, compensado,
   devolvido pelo banco…
3. **Para onde foi** — a JC paga fornecedor com cheque de terceiro, e precisa
   saber QUAL fornecedor ficou com QUAL folha. É o que responde quando o cheque
   volta: "o 47470 da MAGALHÃES voltou do fornecedor X, sem fundos".

## Decisões do Raoni (20/10/2026)
| Pergunta | Decisão |
|---|---|
| Liga com cobranças/caixa do Financeiro? | **Não.** É só o controle do cheque: origem, situação e destino. Não dá baixa em parcela nem lança movimento. |
| Reuso | **"Este controle de cheque podemos usar no finance também"** → o núcleo nasce PORTÁTIL (ver abaixo). |
| Destino do repasse | **Cadastro de fornecedores** (sub-aba nova em Cadastros). |
| Quem lança e vê | **Só financeiro e dono** (`veFinanceiro` / `ehFinanceiro()`). ⚠️ **03/11/2026: só o FINANCEIRO, na tela** ("por enquanto tudo de dinheiro apenas financeiro") — as rules seguem aceitando o dono. |
| Cheque de uma empresa pagando fornecedor da outra | **Pode, e fica registrado** (marca "entre empresas"). |
| "Finance" é o quê? | **O TotaliFinance** (`~/Code/Finance`) — o núcleo nasce portátil. |
| Cheques que já estão na Zeus | **Lançados à mão** pelo próprio lançamento em lote. Sem importação. |
| Compensação | **Marcada à mão** pelo financeiro olhando o extrato (vários de uma vez). O OFX pode fazer isso depois. |
| Volume | **50 a 300 folhas por mês** (as duas empresas). |

## O núcleo é PORTÁTIL (para servir ao TotaliFinance também)
O TotaliFinance é outra pilha (React + Tailwind no front, Express + Prisma +
Postgres no back, multi-tenant, com `Customer`, `Supplier` e `BankAccount`). O
que dá para levar de um para o outro não é tela nem banco: é a **regra**.

- **`src/lib/cheques.js` — JS puro, sem import de Firebase, React nem
  `utils.js`.** Situações, transições permitidas, geração das folhas em
  sequência, chave da folha, alíneas de devolução, avisos, agrupamentos e
  totais. Recebe e devolve objetos simples. Copiar o arquivo para o
  `backend/src/modules/cheques/` do TotaliFinance (ou para o front dele) e ele
  roda igual.
- **Os testes (`tests/cheques.test.mjs`) importam só esse arquivo** — vão
  junto e provam que a cópia não quebrou.
- **O documento é desenhado sem nada de Firestore dentro** (sem `Timestamp`,
  datas em ISO, valores em número). No TotaliFinance vira `Cheque` +
  `ChequeEvento` no Prisma, com `customerId` / `supplierId` / `bankAccountId`
  no lugar dos nomes. O mapeamento está na seção "No TotaliFinance".
- O que é do JC (Firestore, rules, a tela, `nomeCliente`, pedidos) fica FORA
  do núcleo.

## O documento — `cheques/{id}`, UMA FOLHA por documento
    {
      empresa: 'sacolas' | 'plastico',          // quem RECEBEU o cheque

      // ---- a folha (o que está escrito no papel) ----
      banco: { codigo: '047', nome: 'Banese' },
      agencia: '0036', conta: '03/100.483-1', numero: '047470',
      valor: 367.00,
      bomPara: '2026-11-20',                     // data combinada (pré-datado)
      emitente: { nome: 'FULANO DE TAL', doc: '123.456.789-00' },
      terceiro: true,                            // emitente ≠ quem entregou
      chave: '047|0036|031004831|47470',         // normalizada; ver abaixo

      // ---- de onde veio ----
      cliente: 'MAGALHAES E CIA LTDA',           // razão, como nos pedidos
      idVenda: '5458' | '',                      // opcional
      recebidoEm: '2026-10-20',
      lote: '<id>', loteN: 2, loteTotal: 4,      // "2 de 4" do mesmo parcelamento

      // ---- onde está (cópia do ÚLTIMO evento, para filtrar) ----
      situacao: 'carteira',
      situacaoEm: '2026-10-20T10:31:00',
      contaDeposito: 'bradesco' | '',            // quando depositado/compensado
      destino: {                                 // quando repassado
        fornecedorId, fornecedorNome, empresaPagadora, referencia, em,
      } | null,

      // ---- a vida do cheque (só cresce) ----
      historico: [
        { n: 1, em, por, porUid, de: '', para: 'carteira', obs: 'lançado' },
        { n: 2, em, por, porUid, de: 'carteira', para: 'depositado', conta: 'bradesco' },
        { n: 3, em, por, porUid, de: 'depositado', para: 'devolvido', alinea: '11' },
        ...
      ],
      criadoEm, criadoPor, criadoUid, obs,
    }

- **Uma folha por documento, não um documento por parcelamento:** cada folha
  tem vida própria. Das 4 do mesmo lote, uma compensa, uma é repassada, uma
  volta. O `lote` só serve para mostrar as irmãs ("as outras folhas deste
  parcelamento").
- **O histórico mora DENTRO do cheque**, e não numa coleção à parte: é pouco
  (5 ou 6 eventos na vida de uma folha), a ficha abre com uma leitura só, e a
  mudança de situação + o evento entram na MESMA escrita — não existe
  situação nova sem rastro (mesma lógica da auditoria no mesmo batch).
- **`situacao` é gravada** (cópia do último evento) porque é por ela que a
  consulta filtra no servidor (ver Desempenho). A verdade é o histórico; a
  tela confere que as duas batem.

### ⚠️ A chave: banco + agência + conta + número
O **número repete entre clientes** — a Localização da Zeus no vídeo mostrou o
47470 em dois clientes, o 47471 em dois, o 47478 em três. Por isso:
- a identidade da folha é `banco|agência|conta|número`, **normalizada**: só
  dígitos, sem zero à esquerda no número (`047470` = `47470`), conta sem
  ponto/traço/barra;
- **buscar pelo número LISTA TODOS** os que batem, nunca "acha o cheque";
- lançar uma folha cuja chave já existe (viva) **avisa e pede confirmação**
  em vez de bloquear — a mesma folha pode voltar legitimamente (cancelado e
  relançado), e quem decide é a pessoa com o papel na mão.

## O ciclo de vida
| Situação | Significa | Pode ir para |
|---|---|---|
| `carteira` | Está na gaveta da JC | depositado · repassado · resgatado · cancelado |
| `depositado` | Foi ao banco (conta X), esperando compensar | compensado · devolvido |
| `compensado` | O dinheiro caiu | devolvido (raro, mas o banco faz) |
| `devolvido` | O banco devolveu (alínea) ou o fornecedor trouxe de volta | depositado (reapresentar) · carteira · repassado · resgatado |
| `repassado` | Foi para um fornecedor (quem, quando, para pagar o quê) | devolvido (voltou do fornecedor) |
| `resgatado` | O cliente pagou de outro jeito e pegou a folha de volta | — |
| `cancelado` | Lançado errado | — |

- **Devolução é rotina, não exceção** — o extrato do Bradesco de abril
  (FINANCEIRO.md, seção 6) mostrou 4 cheques devolvidos, reapresentados e 3
  devolvidos de novo, ao centavo. Por isso `devolvido` é uma situação, não uma
  observação.
- **A devolução grava a ALÍNEA** (o motivo oficial do banco). As comuns:
  11 sem fundos 1ª apresentação · 12 sem fundos 2ª · 13 conta encerrada ·
  21 sustação/contra-ordem · 22 divergência de assinatura · 28 sustado por
  furto/roubo · 31 erro formal · 44 prescrito · e "outra" com texto livre.
  ⚠️ **Depois da alínea 12 o cheque NÃO pode ser reapresentado** (regra do
  sistema de compensação): a tela não oferece "reapresentar" e diz o porquê —
  ali o caminho é resgatar com o cliente ou protestar.
- **Voltou do fornecedor** = `repassado → devolvido` com a marca de onde veio.
  A partir daí ele aparece na fila de devolvidos com as DUAS pontas: o cliente
  que deve à JC e o fornecedor a quem a JC voltou a dever.
- **Depósito antes do "bom para" avisa** (não bloqueia): cheque pré-datado
  depositado antes da data combinada é a reclamação mais comum de cliente, e
  na Justiça gera indenização. O aviso diz quantos dias faltam.
- **Nada se apaga.** Cancelado continua no histórico. `delete: if false`.

## Lançar — em lote, como na Zeus
O caso do Raoni: o cliente parcelou em 4, entregou 4 folhas em sequência
(números 1, 2, 3, 4) para 30, 60, 90 e 120 dias.

**Cabeçalho** (vale para o lote todo):
cliente (busca com apelido, como no resto do sistema) · pedido (opcional; ao
escolher o pedido, o cliente vem dele) · data do recebimento · empresa.

**A primeira folha:** banco (lista com código COMPE + "outro"), agência, conta,
número, emitente + CPF/CNPJ, ☐ cheque de terceiro.

**A repetição:** quantas folhas · valor (total dividido OU valor por folha) ·
1º "bom para" · intervalo: **a cada N dias** (30 → 30/60/90/120) ou **dia fixo
do mês** (todo dia 20).

→ **Gera as folhas** com o número seguindo a sequência (`000123` → `000124`,
preservando os zeros) e as datas calculadas. **Cada linha é editável**: número
que pula, valor diferente numa folha, uma folha de OUTRO emitente (o cliente
juntou um cheque de terceiro no meio) — banco/agência/conta/emitente também
podem mudar por linha.

- ⚠️ **A divisão do valor joga a sobra dos centavos na PRIMEIRA folha**, como
  `geraParcelas` já faz: 1.000,00 em 3 vira 333,34 + 333,33 + 333,33 e o lote
  fecha.
- ⚠️ **Dia fixo em mês curto:** "todo dia 31" em fevereiro vai para o último
  dia do mês, e volta a 31 em março (a data é calculada a partir da PRIMEIRA,
  não da anterior — senão o 31 vira 28 para sempre).
- **Sequência e datas são CONTA sobre o que a pessoa digitou**, não chute:
  não é o atalho proibido do fechamento da montagem. Mesmo assim o rodapé
  pede "confira número, data e valor de cada folha com o papel na mão" antes
  do Salvar, e a soma do lote fica à vista.
- Chave repetida (no lote ou no banco) → linha marcada em vermelho com o
  motivo.

## Repassar a um fornecedor
- Marca uma ou várias folhas (em carteira ou devolvidas) → **Repassar** →
  fornecedor (do cadastro) · data · **referência** (NF, duplicata, "pagamento
  da resina de outubro") · empresa que está pagando (vem a mesma do cheque;
  trocar marca "entre empresas") · observação. O total marcado fica à vista,
  como o "Selecionados 367,00" da Zeus.
- **Recibo de repasse impresso:** a lista das folhas (número, banco, emitente,
  bom para, valor), o total e uma linha de assinatura de quem recebeu pelo
  fornecedor. É a prova de "para onde o cheque foi" — o papel que falta hoje.
- **Entre empresas:** cheque recebido pela JC Sacolas pagando fornecedor da JC
  Plástico fica com chip `⇄ entre empresas` e entra num relatório próprio.
  ⚠️ Nota contábil: isso é dinheiro de uma empresa pagando dívida da outra
  (conta corrente entre empresas). A contabilidade precisa saber disso todo
  mês — o relatório existe para ela.

## Fornecedores — Cadastros › Fornecedores
- **UM documento, `configFinanceiro/fornecedores` = `{ lista }`** (mudou na
  C2: o desenho dizia coleção própria). É lista pequena, lida inteira e só
  pelo financeiro — coleção cobraria uma leitura POR FORNECEDOR a cada
  abertura, e foi exatamente assim que os 1.334 clientes estouraram a cota em
  08/10/2026 (regra 1.2 da skill de desempenho). Conta: 1 leitura por
  abertura × 2 perfis.
- **Fora de `config/`** de propósito: aquele documento é lido por todo perfil
  (operador, vendedor), e CNPJ/telefone de fornecedor é assunto de dinheiro.
  Rule própria, só `ehFinanceiro()`, `delete: if false`.
- **Gravação por transação** (`gravaFornecedores`): lê a lista do SERVIDOR,
  aplica a mudança sobre ela e grava. Nunca regrava a partir de uma lista que
  a tela ainda não recebeu (regra 1.7), e dono + financeiro editando juntos
  não perdem a mudança um do outro. O CNPJ repetido é conferido de novo
  dentro da transação.
- Campos (o subconjunto do `Supplier` do TotaliFinance, para casar os dois):
  `id, nome, documento, telefone, contato, obs, ativo` + quem criou/alterou.
- **O id nunca sai do nome** (`forn_…`): renomear não desliga os cheques que
  já foram para ele. **Não existe excluir** — desativado some da escolha do
  repasse e continua nos cheques antigos.
- CNPJ/CPF opcional, mas com dígito conferido; **CNPJ repetido é erro**,
  **nome repetido é aviso** (nome fantasia pode coincidir).
- Sub-aba visível só para dono e financeiro. Hook `useFornecedores` fica FORA
  do `CadastrosContext` (que todo perfil lê — daria permission-denied ao resto
  da fábrica).
- Fica pronto para o Contas a Pagar (Fase 5 do FINANCEIRO.md).

## A tela — aba `cheques` (dono e financeiro)
Cabeçalho: seletor de empresa (Sacolas · Plástico · Ambas) e os números:
**em carteira** (R$ e qtd) · **depositar nos próximos 7 dias** · **devolvidos a
resolver** · **repassados no mês**.

Sub-abas:
1. **Carteira** — a gaveta, ordenada pelo "bom para". Chip `📅 já pode
   depositar` / `faltam N dias`.
2. **Depositados** — esperando compensar, com a conta e há quantos dias.
   Marcar vários → **Compensado**.
3. **Devolvidos** — a fila de dinheiro a correr atrás: alínea, quantas vezes
   voltou, o cliente, e (se veio de repasse) o fornecedor. Badge no menu.
4. **Repassados** — agrupados por fornecedor, com total e período.
5. **Localizar** — tudo, com os filtros da Zeus: número (pedaço exato, lista
   todos), cliente/emitente (`casaBusca`, nome parecido), pedido, banco,
   período de recebimento, período do bom para, situação, só de terceiro.
   Corte declarado ("Mostrando 60 de N").

Colunas: nº · banco/ag/conta · emitente (`⚠ terceiro`) · cliente (apelido) ·
pedido · bom para · valor · situação · `2 de 4`.

**Ações em lote:** caixas de marcar + barra com o total marcado e só as ações
que valem para TODAS as marcadas (marcar uma em carteira e uma compensada não
oferece "depositar").

**Ficha da folha** (clique na linha): os dados, as irmãs do lote, o histórico
em linha do tempo, as ações possíveis. Corrigir um dado digitado errado é um
evento `corrigido` que guarda o antes e o depois — editar em silêncio apagaria
o que estava escrito.

**Impressões:** conferência da gaveta (o que o sistema diz que está em
carteira, para bater com o papel) e o recibo de repasse.

## Rules
- `cheques`: read/create/update `ehFinanceiro()`; create com
  `criadoUid == request.auth.uid`; `delete: if false`.
- update: o `historico` só pode **crescer em um** e o evento novo tem que ter
  `porUid == request.auth.uid` (quem muda assina). A regra não confere a
  transição em si — quem faz isso é o núcleo, na tela (mesma natureza do
  `etapas`: bom contra engano, não contra má-fé).
- `fornecedores`: read/write `ehFinanceiro()`, `delete: if false` (desativa).
- ⚠️ Publicar ANTES do build, como sempre.

## Desempenho (a conta, antes de codar)
- Volume informado: **50 a 300 folhas por mês** → até ~3.600 por ano.
- **A tela assina só as VIVAS:** `where('situacao', 'in', ['carteira',
  'depositado', 'devolvido'])` — um campo só, sem índice composto. É o que se
  trabalha todo dia, e não cresce com o tempo.
- **O histórico (compensado, repassado, resgatado, cancelado) só é lido sob
  demanda**, por período ou por número, no padrão do `useEntregues`. Assinar a
  coleção inteira faria toda abertura da aba pagar o arquivo morto inteiro.
- Repassados do mês: consulta por `situacao == 'repassado'` + período do
  `destino.em` em memória (é pouco).

## No TotaliFinance (para quando for levar)
| JC (Firestore) | TotaliFinance (Prisma) |
|---|---|
| `cheques/{id}` | `Cheque` (tenantId) |
| `historico[]` | `ChequeEvento` (chequeId, n, de, para, …) |
| `cliente` (razão) | `customerId` → `Customer` |
| `destino.fornecedorId` | `supplierId` → `Supplier` |
| `contaDeposito` | `bankAccountId` → `BankAccount` |
| `empresa` | o próprio `tenantId` (+ `tenantPagadorId` no "entre empresas") |
| `idVenda` | `referenciaOrigem` (texto: no Finance não há pedido) |

O `src/lib/cheques.js` vai como está; muda só quem grava.

## Fases (uma por vez, testando entre elas)
- **C1 — Núcleo + testes.** `src/lib/cheques.js` + `tests/cheques.test.mjs`:
  geração do lote (sequência com zeros, 30 dias × dia fixo, fim de mês,
  centavos), chave normalizada e duplicadas, tabela de transições, alínea 12
  sem reapresentar, aviso de depósito antecipado, ações comuns a uma seleção,
  totais e agrupamento por fornecedor.
  ✅ **FEITA (20/10/2026).** O que o código decidiu além do desenho:
  - **Cancelar vale de QUALQUER situação** (menos de cancelado) e exige o
    porquê: o lançamento errado pode ser descoberto depois que a folha já
    "foi ao banco". Por isso o cancelamento fica fora de `TRANSICOES_CHEQUE`
    e é tratado em `podeIr`.
  - **A gaveta não é atalho:** `devolvido → carteira → depositado` passa pela
    mesma trava do reapresentar. Duas devoluções sem fundos travam mesmo que
    a segunda tenha sido marcada 11 por engano. Alíneas que não deixam voltar
    ao banco: 12, 13, 14, 20, 21, 25, 28, 35, 44.
  - **Cada evento tem duas datas:** `em` (quando foi registrado) e `data`
    (quando aconteceu — o dia do extrato, o dia do depósito antigo da Zeus).
  - **Cheque antigo que já está noutra situação** entra pela gaveta e anda
    até lá pelas regras de sempre (`passosAte`): compensado passa pelo
    depósito, devolvido pelo depósito ou pelo repasse. Não existe cheque
    "compensado" que nunca foi depositado.
  - **Corrigir** é evento `tipo: 'corrigido'` com `antes`/`depois`, sem mudar
    a situação, e recalcula a `chave`.
  - **`aplicaEvento` devolve `patch`** (só o que muda, para o `updateDoc`) e
    não aplica nada quando há problema. **`chequesDoLote` é tudo ou nada.**
  - Devolvido **mantém** `contaDeposito` e `destino` (é o "de onde voltou");
    o histórico guarda todos os depósitos e repasses que já houve.
  - A busca recebe o casamento de texto **injetado** (`casaBusca` no JC), e o
    teste confere que o núcleo não tem nenhum `import`.
- **C2 — Fornecedores.** ✅ **FEITA (20/10/2026)** — documento único em
  `configFinanceiro/fornecedores`, sub-aba em Cadastros, rules, regra pura em
  `src/lib/fornecedores.js` (26 asserções), hook `src/hooks/useFornecedores.js`,
  render em `test:tela`. ✅ **Rules publicadas em 26/10/2026 às 10:19** (`match /configFinanceiro` e
  `match /cheques`), conferidas na API do Firebase. ⚠️ O commit `9c80ffd`
  diz "publicadas" antes da hora: naquele momento a versão no ar ainda era a
  de 07/10.
- **C3 — Aba Cheques.** Lançar lote, Carteira/Depositados/Devolvidos/
  Localizar, ficha com histórico, depositar/compensar/devolver/reapresentar/
  resgatar/cancelar/corrigir. Rules de `cheques`. Render em `test:tela`.
  ✅ **FEITA (26/10/2026).** `src/pages/Cheques.jsx` (aba `cheques`, dono +
  financeiro), `src/hooks/useCheques.js`, rules `match /cheques`, render em
  `test:tela`. Ensaiada no navegador com a tela de verdade e o Firebase trocado
  por memória (lançar o lote de 4, repetição, depósito antecipado, devolver 11
  → reapresentar → devolver 12, gaveta, corrigir, cheque antigo já
  compensado, celular a 375px). O que o código decidiu além do desenho:
  - **Carteira inteira na abertura** (decisão do Raoni em 26/10/2026, sabendo
    do custo — ver Desempenho). O **arquivo** só é lido com "incluir os
    encerrados", no Localizar.
  - **Toda mudança de situação é TRANSAÇÃO** (`aplicaEmLote`): lê cada folha
    no servidor e aplica o evento sobre a versão de lá. O `historico` é
    regravado inteiro, e sobre uma cópia velha o evento de outra pessoa
    sumiria. Uma folha com problema barra a seleção inteira.
  - **Repetição conferida contra o BANCO inteiro** na hora de lançar
    (`chequesComChaves`, `where('chave','in')` de 30 em 30), não só contra o
    que a tela carregou — a folha compensada do mês passado está no arquivo.
  - **Depósito só em conta de BANCO:** Cielo (maquininha) e Caixa interno
    saem da lista (`contasDeDeposito`).
  - **A barra de seleção fica sempre no lugar** e a mensagem de resultado é
    flutuante (`.chq-toast`): as duas, aparecendo no fluxo, empurravam a
    lista e o clique seguinte caía na folha errada (visto no ensaio).
  - **Histórico no passado** (`nomeEvento`: "Depositado", "Reapresentado",
    "Voltou do fornecedor"); o botão de cancelar diz **"Cancelar cheque"**
    para não parecer "fechar a janela".
  - **Cheque antigo da Zeus:** "Situação hoje" carteira · depositado ·
    compensado · devolvido, com as datas de cada passo. O já encerrado vai
    para o arquivo, e o aviso diz onde encontrá-lo.
  - **Repassar ainda não aparece** (é a C4); cheque já repassado é lido.
  - Sem badge no menu: ele exigiria assinar os cheques no App para todo
    perfil. O contador fica nas sub-abas.
- **C4 — Repasse.** Ação de repassar, aba Repassados, recibo impresso, "entre
  empresas" + relatório.
  ✅ **FEITA e no ar (03/11/2026, `3d1a330`).** Sem rule nova (o repasse é mais um evento no
  histórico). Ensaiada no navegador: repassar 2 folhas pagando pela outra
  empresa, recibo impresso, folha que volta do fornecedor, reimpressão,
  cheque antigo já repassado, celular. O que o código decidiu:
  - **O recibo é uma ENTREGA:** mesmo fornecedor + dia + referência +
    empresa pagadora (`chaveRepasse`). Sai do **histórico** (`repassesDe`),
    não do `destino`: a folha que voltou — ou foi repassada de novo a outro —
    continua no recibo daquele dia, porque o papel assinado diz que ela foi.
  - **`repassadoEm`** (data do último repasse, nunca apagada) é gravado no
    cheque e é por ele que a aba Repassados consulta o servidor (um campo, sem
    índice composto). O `destino` se apaga quando a folha volta e é
    reapresentada; consultar por ele faria o repasse sumir da lista.
  - **A aba só lê com ela aberta, e só o período** escolhido (este mês · 90
    dias · 12 meses · todos — regra 1.3).
  - **Empresa pagadora vem a mesma do cheque**; trocar gera o aviso e marca
    "⇄ entre empresas". Folhas das duas empresas na mesma seleção: a pessoa
    escolhe. O bloco "Entre empresas no período" soma por DIREÇÃO
    (`resumoEntreEmpresas`) — é o número que a contabilidade precisa.
  - **Recibo:** fornecedor + CNPJ do cadastro, referência, folhas (nº, banco/
    ag/conta, emitente, de quem a empresa recebeu, bom para, valor), total,
    texto "Recebi de…" e linhas de assinatura. Sai logo depois do repasse
    ("Repasse registrado → 🖨 Imprimir recibo") e reimprime na aba. Na
    impressão a tela inteira fica fora (`screen-only`).
  - Fornecedor **inativo** não aparece na escolha. O mesmo aviso em várias
    folhas vira uma linha ("as 3 folhas: …").
  - O teste de tela pegou uma **tela preta** antes de ir ao ar: com a aba
    Repassados aberta, o bloco das listas simples era desenhado sem lista.
- **C5 — Fechamento.** Conferência da gaveta impressa; no Localizar (só para
  quem `veFinanceiro`) os cheques daquele pedido.
  ✅ **FEITA e no ar (03/11/2026, `1116fcf`).** Sem rule nova.
  - **A gaveta é carteira + DEVOLVIDOS** (`gaveta`): o banco e o fornecedor
    devolvem o papel, e ele fica com a empresa até alguém resolver. Folha
    impressa com um ☐ por folha, os dois blocos, total e "Conferido por /
    Data". Com o filtro de empresa ligado, a folha **declara** que é só
    daquela empresa — senão a folha da outra pareceria "faltando".
  - **Cheques do pedido no Localizar** (`ChequesDoPedido` +
    `useChequesDosPedidos`): linha de resumo ("3 cheque(s) · R$ … — 1 em
    carteira · 1 repassado") e, com o card aberto, folha a folha (repassada
    diz para quem). Consulta `idVenda in [pedidos da tela]` de 30 em 30, **só
    para quem vê dinheiro e só com termo digitado** — para os outros perfis
    ela nem roda. Cancelado não conta.

## Consequências das últimas decisões
- **Lançar os antigos à mão** = o lançamento em lote precisa aceitar **data de
  recebimento no passado** e a folha poder nascer já em outra situação
  (`depositado`, `devolvido` com alínea, `repassado` com fornecedor) — senão
  um cheque que já foi ao banco entraria como "na gaveta". O evento inicial
  registra "lançado depois (veio da Zeus)" para não parecer que a JC recebeu
  aquilo hoje. Sem planilha de importação: nada de formato da Zeus para
  decifrar.
- **Compensação à mão** = Depositados tem "marcar compensado" em lote com a
  data do extrato, e o chip "depositado há N dias" destaca o que passou do
  prazo normal (D+2) sem ninguém marcar — sem presumir nada sozinho.
- **50 a 300 por mês** (até ~3.600 por ano) confirma a escolha de assinar só
  as vivas e ler o arquivo sob demanda.
  ✅ **Decidido em 26/10/2026: a tela abre com a carteira INTEIRA**, sabendo
  do pior caso abaixo; se a cota apertar, o remédio é a janela pelo "bom
  para". A conta que foi apresentada:
  ⚠️ **Conta (regra 1.1):** com pré-datado de até 120 dias, a
  CARTEIRA pode ter 4 meses de folhas ao mesmo tempo — com 300/mês são
  ~1.200 vivas. 1.200 × 2 perfis × ~10 aberturas/dia = 24 mil leituras/dia
  no pior caso, perto da metade da cota gratuita. O cache persistente corta
  isso quando a aba volta em menos de ~30 min, mas não zera. Antes de codar a
  C3, decidir: assinar só depositados + devolvidos (poucos) e ler a carteira
  por janela de "bom para" (ex.: próximos 30 dias + vencidos), com o resto sob
  demanda.
- **Ainda sem resposta (não trava):** os vídeos tinham áudio que não deu para
  ouvir aqui; se havia explicação falada, entra depois.

---

# FASE C6 — CONTAS DO CLIENTE E RECEBIMENTO EM CHEQUE (desenho FECHADO em 03/11/2026)

> Pedido do Raoni em 03/11/2026: "ao cadastrar o cheque, registrar razão
> social/nome, conta e agência do emitente; esta conta fica ligada ao cliente
> que passou o cheque, para os próximos a informação já vir; e selecionar na
> hora de cadastrar o recebimento via cheque". Mostrado no Chrome com um caso
> REAL: a cobrança da **RUBI SEMI JOIAS (#5912)**, lançada pela Jéssica em
> 03/11 em 4 parcelas de R$ 375,00, **todas na forma "Cheque"** — o
> Financeiro já está em uso, e com cheque.

## O buraco que o caso mostrou
Hoje Financeiro e Cheques não se falam (decisão "só controle" de 20/10):
- "Receber" com forma Cheque dá baixa NA HORA e pergunta em que conta o
  dinheiro "entrou" — nenhum cheque nasce;
- lançar a folha em Cheques não toca na parcela;
- cheque que volta sem fundos deixa a parcela "quitada", sem ninguém saber.
Controlar os 4 cheques da RUBI exigiria lançar duas vezes, em telas que divergem.

## Decisões do Raoni (03/11/2026)
| Pergunta | Decisão |
|---|---|
| Como lembrar as contas do cliente | **Pelo histórico** dos cheques que ele já passou — sem cadastro novo |
| Quando a parcela paga com cheque conta como recebida | **Quando o cheque compensa ou é repassado.** Na gaveta, a parcela fica "em cheque"; voltou sem fundos, ela reabre |
| Repasse lança saída no caixa? | **Não — só controle, como hoje.** O pagamento ao fornecedor entra quando houver contas a pagar |

## C6a — as contas do cliente vêm prontas
- No lançamento, escolhido o cliente (ou o pedido, que traz o cliente), o
  sistema lista as **contas que ele já usou**: emitente + CPF/CNPJ + banco +
  agência + conta, de terceiro ou não, com o **último número** e a data.
  Um clique preenche a 1ª folha e sugere o **próximo número** (o maior já
  lançado naquela conta + 1, preservando os zeros).
- **Fonte:** os próprios cheques. Consulta `where('clienteChave','==', …)` —
  um campo, sem índice composto; lê só os cheques daquele cliente.
  `clienteChave` = razão normalizada (sem acento/caixa/espaço duplo), gravada
  em todo cheque novo: "Rubi Semi Joias" e "RUBI SEMI JOIAS" são o mesmo
  cliente. A produção ainda não tem cheque lançado (conferido em 03/11), então
  não há migração.
- Regra pura `contasDoCliente(cheques)` no núcleo portátil: agrupa por
  banco+agência+conta (a chave sem o número), ignora cancelados, ordena pela
  última vez usada.
- Conta nova continua sendo digitada — e aparece da próxima vez.
- ✅ **FEITA (03/11/2026).** Sem rule nova. Ensaiada no navegador com o caso
  da RUBI (folhas 246–249 já compensadas): digitando "rubi semi joias" em
  minúsculas, a conta aparece com "último nº 000249 · próximo 000250", um
  clique preenche tudo e "Gerar folhas" dá 000250–000253. **Uma consulta só**
  ao servidor: a busca espera a pessoa parar de digitar (500 ms) e depende da
  FUNÇÃO de busca, não do objeto `acoes` (recriado a cada render — consultaria
  de novo a cada redesenho, regra 2.2). Junta o que veio do servidor com o que
  a tela já tem (a folha recém-lançada pode não ter voltado). O próximo número
  sai do MAIOR já lançado na conta, não do último lançado.

## C6b — receber a parcela em cheque
- **No Financeiro**, a parcela com forma Cheque ganha **"Lançar cheque(s)"**,
  e a cobrança inteira ganha **"Lançar os cheques de todas as parcelas"** (o
  caso da RUBI: 4 folhas → 4 parcelas). Abre o lançamento de cheques **já
  preenchido**: cliente, pedido, empresa, e por folha o valor e o "bom para"
  da sua parcela. As contas do cliente (C6a) aparecem ali.
- **Cada folha guarda `cobrancaId` + `parcelaN`.** Várias folhas podem pagar a
  mesma parcela.
- **A parcela fica "em cheque"** enquanto a folha está na gaveta ou no banco:
  chip "💳 em cheque · nº 000002 · bom para 13/11". Derivado no render (os
  cheques vivos já são lidos pela tela; regra da fonte única).
- **Compensou ou foi repassada → vira recebimento:** na MESMA transação da
  mudança de situação nasce um `movimento` de entrada (forma `cheque`, conta =
  a do depósito; no repasse, a conta virtual **"Repasse de cheque"**), com
  `chequeId`; o cheque guarda o `movimentoId`. É assim que o "recebido" do
  Financeiro (que soma movimentos) passa a valer sem mudar a conta dele, e o
  OFX da Fase 5 continua conciliando contra `movimentos`.
- **Voltou sem fundos depois de compensado/repassado → o movimento é
  CANCELADO** na mesma transação (cancelar, não apagar — regra do caixa), e a
  parcela reabre sozinha.
- **"Receber" com forma Cheque deixa de dar baixa direto:** a janela leva ao
  lançamento da folha. Baixa direta só com as outras formas.
- Cheque cancelado (lançado errado) solta a parcela; cobrança cancelada com
  cheque ligado avisa antes.
- ⚠️ **Repasse continua só controle** (decisão acima): o recebimento do
  cliente acontece no repasse, mas a saída para o fornecedor não é lançada.

## C6c — "onde está o cheque 246 da RUBI?" (pedido do Raoni, 03/11/2026)
- **O número da folha já é obrigatório** e a sequência já é gerada: "Nº da 1ª
  folha" = 246 → 246, 247, 248, 249 (zeros preservados, cada linha editável se
  o talão pular). Vale também para o lançamento pela cobrança (C6b).
- **O que falta é ACHAR.** Hoje a busca da aba Cheques lê o termo como número
  OU como nome ("246 rubi" não acha nada) e só olha as folhas vivas — o 246 já
  compensado ou repassado só aparece com "incluir os encerrados", que carrega
  o arquivo inteiro.
- **Busca mista:** cada pedaço do termo vale por si — o que é número procura o
  nº da folha (246 = 000246) e o pedido; o que é palavra procura cliente,
  emitente e fornecedor. Todos os pedaços precisam casar (é E, como o
  `casaBusca`).
- **O número procura no BANCO INTEIRO, sozinho:** todo cheque grava
  `numeroChave` (o número sem zeros à esquerda) e a busca por número consulta
  `where('numeroChave','==', …)` — um campo, sem índice composto, lê só as
  folhas daquele número (o número repete entre clientes: lista todas). Sem
  marcar nada, sem carregar o arquivo. Produção ainda sem cheque: sem migração.
- **A resposta é "onde está", numa linha** (`ondeEstaOCheque`, no núcleo
  portátil): "na gaveta desde 03/11 · bom para 13/11" · "depositado no Bradesco
  em 13/11, esperando compensar" · "compensou em 15/11 (Bradesco)" ·
  "repassado a RESINAS em 20/11 · NF 1234" · "voltou do banco em 15/11 · sem
  fundos (11)" · "voltou de RESINAS em 25/11" · "resgatado pelo cliente" ·
  "cancelado". Um clique abre a ficha com o histórico.

## C6d — o cliente quer RESGATAR um cheque que está com o fornecedor (03/11/2026)
> O caso do Raoni: a RUBI passou o 246, a JC repassou o 246 à RESINAS, e a
> RUBI liga querendo pagar em dinheiro e pegar o cheque de volta. A JC precisa
> saber COM QUEM ele está, buscar a folha e acertar com o fornecedor.

**Decisões do Raoni (03/11/2026):**
| Pergunta | Decisão |
|---|---|
| Quem paga o fornecedor no resgate | **A JC paga e busca**; depois o cliente paga a JC e leva a folha (dois passos) |
| O que a JC paga ao fornecedor entra no caixa? | **Não — só controle**, coerente com o repasse |
| Lista de resgates pendentes | **Sim**: "🔁 Resgates a buscar" |

- **Por que é caminho NOVO:** hoje de `repassado` só se sai por "voltou do
  fornecedor" (`devolvido`), que exige ALÍNEA — resgate não é devolução
  bancária, é acerto combinado, e marcá-lo como "sem fundos" sujaria o
  histórico de crédito do emitente.
- **"Resgate pedido"** (folha repassada): evento que só MARCA, sem mudar a
  situação (`tipo: 'resgatePedido'`, data, quem pediu, obs). A folha entra em
  **"🔁 Resgates a buscar"**: nº, valor, cliente, **com quem está** (fornecedor
  + telefone + contato do cadastro), desde quando está com ele e há quantos
  dias o resgate foi pedido. Desmarcar = evento "resgate desistido".
- **"Recolhido do fornecedor"** — transição nova `repassado → carteira`, SEM
  alínea: data, **como a JC pagou o fornecedor** pela folha (dinheiro · PIX ·
  transferência · outro cheque · abatido em conta), valor, quem buscou, obs.
  Só controle (não vira saída de caixa). Some da lista de resgates.
  `podeReapresentar` não é afetado (não houve devolução bancária).
- **"Resgatado pelo cliente"** (que já existe, `carteira|devolvido →
  resgatado`) passa a registrar **quanto e como o cliente pagou** (forma +
  valor).
- **No "onde está" (C6c):** "🤝 com a RESINAS desde 20/11 · 📞 (79) 3431-0000 ·
  resgate pedido há 2 dias".
- **Com a C6b (Financeiro):** a parcela que virou "recebida" no repasse tem o
  movimento CANCELADO no recolhimento (a folha voltou, o cheque não pagou), e
  o resgate do cliente gera o movimento novo com a forma real (dinheiro/PIX) —
  o extrato mostra o que de fato entrou. Antes da C6b, só o controle.
- **No recibo/aba Repassados:** a folha recolhida continua no recibo daquele
  dia (o papel assinado não muda) e aparece como "recolhida em dd/mm".

## Ordem
1. **C6a** (independente, pequena): contas do cliente no lançamento.
2. **C6c** (independente): busca "246 rubi" no banco inteiro + "onde está".
3. **C6d**: resgate de folha repassada (pedido → lista → recolhido → resgatado).
4. **C6b**: ligação com o Financeiro (lançar pela parcela, "em cheque",
   movimento na compensação/repasse, estorno na devolução e no recolhimento).
Cada uma com testes no núcleo + teste de tela + ensaio no navegador, como as
outras fases. Rules: a conferir na C6b (`movimentos` criado junto com o
cheque na transação — a regra atual já aceita, mas será testado).
