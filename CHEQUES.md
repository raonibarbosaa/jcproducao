# CHEQUES — origem, situação e destino de cada folha (desenho FECHADO em 20/10/2026)

> Pedido do Raoni em 20/10/2026, com dois vídeos das telas de cheque da Zeus
> (*Cadastro de Cheque* em lote e *Localização de cheques* com "Alterar
> situação"). Decisões fechadas no mesmo dia.
> **C1 FEITA em 20/10/2026** (núcleo `src/lib/cheques.js` +
> `tests/cheques.test.mjs`, 122 asserções). Próxima: C2 (Fornecedores).

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
| Quem lança e vê | **Só financeiro e dono** (`veFinanceiro` / `ehFinanceiro()`). |
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
- **Coleção própria `fornecedores/{id}`**, não array em `config/cadastros`:
  a lição dos clientes (07/10/2026) — array em documento único reenvia tudo a
  cada edição e esbarra no limite de 1 MiB.
- Campos (o subconjunto do `Supplier` do TotaliFinance, para casar os dois):
  `nome, documento, telefone, contato, obs, ativo`. Inativo some da seleção e
  fica no histórico (padrão dos motoristas).
- Sub-aba visível só para dono e financeiro.
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
- **C2 — Fornecedores.** Coleção, sub-aba em Cadastros, rules.
- **C3 — Aba Cheques.** Lançar lote, Carteira/Depositados/Devolvidos/
  Localizar, ficha com histórico, depositar/compensar/devolver/reapresentar/
  resgatar/cancelar/corrigir. Rules de `cheques`. Render em `test:tela`.
- **C4 — Repasse.** Ação de repassar, aba Repassados, recibo impresso, "entre
  empresas" + relatório.
- **C5 — Fechamento.** Conferência da gaveta impressa; no Localizar (só para
  quem `veFinanceiro`) os cheques daquele pedido.

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
- **Ainda sem resposta (não trava):** os vídeos tinham áudio que não deu para
  ouvir aqui; se havia explicação falada, entra depois.
