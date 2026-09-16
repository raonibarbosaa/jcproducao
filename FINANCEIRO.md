# FINANCEIRO — desenho fechado (04/09/2026)

> Módulo financeiro do sistema JC. **A FASE 1 ESTÁ IMPLEMENTADA** (04/09/2026) —
> aba `financeiro`, coleções `cobrancas` e `movimentos`. As fases 2 a 5 continuam
> só como desenho, no fim deste arquivo.
> ⚠️ **As rules da Fase 1 ainda NÃO foram publicadas** (as credenciais do
> firebase-tools expiraram na sessão). Rodar
> `npx firebase login --reauth && npx firebase deploy --only firestore:rules`
> ANTES de qualquer build/deploy: sem elas a aba abre e todo onSnapshot morre
> com permission-denied.
> Acesso: **dono e financeiro**. O designer fica de fora (hoje `ehStaff()` o
> inclui — vai precisar de `ehFinanceiro()`).

Origem: papel manuscrito do dono ("Arquitetura do financeiro") + as telas de
cheque do ERP Zeus, que é onde esse controle vive hoje.

## O buraco central
Hoje "pago" é um **interruptor** por remessa (`entregues.pago/pagoPor/pagoEm`).
Não existe *quanto*, *quando*, *como*, *o que falta*, *em qual banco caiu*.
Cheque, comissão, conciliação de OFX e canhoto assinado são todos satélites de
uma peça que não existe: a **COBRANÇA**. Construir qualquer um antes dela é
construir no ar.

## Decisões do dono (04/09/2026)
| Pergunta | Decisão |
|---|---|
| Fato gerador da comissão | **Faturamento** (`dataVenda`), não entrega nem recebimento |
| Base da comissão | **Valor vendido** (`p.valorTotal` do Posseidon) |
| Por onde começar | **Contas a Receber** |
| Empresas | **JC Sacolas e JC Plástico desde o começo** |
| Unidade da cobrança | **Pedido OU remessa** — quem lança escolhe |
| Parcelamento | **Sim**, com parcelas |
| Condição de pagamento | **Digitada a cada entrega** (sem padrão no cadastro) |
| Quem dá baixa | **Só financeiro e dono** |

## O desconto sai de graça
O papel diz: *"determina % de comissão; se o desconto for maior, comissão menor"*.
O sistema **já tem as duas pontas**, sem nenhuma coluna nova no import:

    valor de tabela = Σ (preço do cadastro de Itens × qtd)
    valor vendido   = p.valorTotal (Posseidon)
    fator           = vendido ÷ tabela        ← o desconto do pedido

Esse mesmo `fator` serve para DUAS coisas: a faixa de comissão (Fase 3) e o
rateio do valor quando a entrega é parcial (Fase 1).

⚠️ **Pedido com qualquer item sem preço cadastrado não é calculável.** Fica
marcado, nunca estimado. `itensSemPreco` já conta isso e vira o painel de
pendência do financeiro.

---

# FASE 1 — CONTAS A RECEBER  ✅ NO CÓDIGO

**Onde ficou:** `src/pages/Financeiro.jsx` (tela + os dois modais), a seção
FINANCEIRO no fim de `src/utils.js` (todos os helpers), `firestore.rules`
(`ehFinanceiro()` + as duas coleções), `tests/financeiro.test.mjs` (54
asserções) e `tests/render/` (o arreio de render — `npm run test:tela`).
`ACESSO.financeiro` abre na aba nova; o dono também a vê.

**O que ficou de fora da Fase 1, de propósito:** editar uma cobrança já lançada
(hoje se cancela e lança outra) e imprimir carnê/recibo. O helper
`parcelaTemMovimento` já existe e é testado, para quando a edição entrar.

## Vocabulário (o que o dono fala)
- **Cobrança** — o documento do que o cliente deve. Nasce de um pedido inteiro
  OU de uma remessa.
- **Parcela** — cada vencimento da cobrança.
- **Recebimento** — o dinheiro que entrou. É um **movimento**.

## Duas coleções, e por que são duas

### `cobrancas/{id}` — quem me deve
    {
      empresa: 'sacolas' | 'plastico',
      origem:  'entrega' | 'manual',      // manual = JC Plástico, sem pedido no sistema
      idVenda: '5458' | '',
      remessa: 1 | null,                  // null = cobra o PEDIDO inteiro
      cliente, vendedor, rota, cidade,    // retrato, para lista e filtro
      valor, valorAuto: true|false,       // false = digitado (faltava preço)
      parcelas: [ { n: 1, venc: '2026-10-05', valor: 617.25, forma: 'boleto' }, ... ],
      status: 'aberta' | 'cancelada',     // só isso é gravado
      emitidaEm, criadaPor, criadaEm, obs,
    }

**`aberta/parcial/quitada/vencida` NÃO são gravados** — são derivados no render,
como `etapaDoItem` e `situacaoNoPlano`. Só o cancelamento é um fato.

### `movimentos/{id}` — o livro-caixa
    {
      empresa, tipo: 'entrada'|'saida', data, valor,
      forma: 'dinheiro'|'pix'|'boleto'|'cheque'|'cartao'|'transferencia',
      conta: 'bradesco'|'banese'|'nordeste'|'cielo'|'caixa-interno',
      cobrancaId, parcelaN,               // vazio quando não vem de cobrança
      cliente, idVenda,                   // retrato
      por, porUid, quando,
      cancelado, canceladoPor, canceladoEm,
      conciliado: false,                  // Fase 5 (OFX)
    }

**Por que `movimentos` nasce junto e não depois:** com duas empresas, o controle
de pagamentos (Nordeste, Bradesco, Banese, Cielo) desemboca num livro-caixa, e é
o mesmo lugar onde o recebimento cai. O OFX da Fase 5 concilia contra ele e as
SAÍDAS entram sem migração. Mesmo argumento do eixo `empresa`: não se enxerta
depois. Na Fase 1 só existem entradas.

⚠️ **Movimento não se edita nem se apaga — se CANCELA.** Corrigir um recebimento
lançado errado é cancelar e lançar de novo; o cancelado aparece riscado na tela.
Mesma linha da carga retornada que continua no histórico e da previsão excluída
por status: apagar esconde que aconteceu. Nas rules, `delete: if false` e o
`update` só nos campos de cancelamento.

## Helpers (utils, fonte única)
- `valorDeTabela(p, itensCad)` — Σ preço × qtd; `null` se falta preço.
- `fatorDesconto(p, itensCad)` — `valorTotal ÷ tabela`. Serve à comissão também.
- `valorDaRemessa(p, itensDaRemessa, itensCad)` — o rateio abaixo.
- `comprometimentoDeCobrancas(idVenda, cobrancas)` — quanto já está coberto.
- `valorLivreDoPedido(p, cobrancas)` — o que ainda dá para cobrar.
- `recebidoDaCobranca` · `saldoDaCobranca` · `situacaoDaCobranca(cob, movs, hoje)`
- `parcelasVencendo(cobrancas, movimentos, ate)`

### O rateio da entrega parcial
O pedido sai em duas remessas e o Posseidon só dá o total. O rateio honesto é
pelo valor de tabela, com o mesmo desconto do pedido:

    fator        = valorTotal ÷ Σ(preço × qtdItem)
    valorRemessa = fator × Σ(preço × qtd entregue nesta remessa)

A soma das remessas fecha **exatamente** o `valorTotal` quando tudo sai.
⚠️ **Nunca ratear por quantidade bruta**: kg e unidade não somam (a regra já
está no CLAUDE.md). Sem preço em todos os itens, a cobrança nasce com
**valor a definir** e o financeiro digita — melhor pedir um número do que
inventar um.

### A trava do "já cobrado"
Uma remessa não pode ser cobrada duas vezes, nem por remessa E dentro de uma
cobrança do pedido inteiro. `valorLivreDoPedido` é quem responde, e a tela
desconta — **exatamente o padrão de `comprometimentoDeCargas` /
`volumesLivresDoPedido`**, que já existe e o dono já entende. Duas contas de "o
que está livre" divergem em silêncio.

## A tela — aba `financeiro`, sub-abas (padrão `SubTabs` do Cadastros)
Cabeçalho: seletor de **empresa** + totais *a receber · vencido · recebido no mês*.

1. **A cobrar** — entregas sem cobrança. É a fila de trabalho: `#pedido`,
   cliente, remessa, valor sugerido pelo rateio (ou `⚠ sem preço — digite o
   valor`) e o botão **Lançar cobrança**.
2. **Em aberto** — o que o cliente deve, agrupado por cliente, ordenado por
   vencimento. Chips `⏰ vence hoje` · `🔴 atrasada há N dias` · `◑ parcial`.
3. **Recebimentos** — extrato do que entrou, por dia / forma / conta. É a
   semente da conciliação da Fase 5.

### Lançar cobrança (modal)
- escolhe **pedido inteiro** × **esta remessa** — aparece só o que está livre;
- valor sugerido e editável, com o rateio explicado ao lado
  ("desconto de 8% aplicado");
- condição digitada: nº de parcelas + 1º vencimento + intervalo → gera as
  parcelas, cada uma editável.

⚠️ **Nada de condição vem preenchido.** Mostra ao lado *"da última vez este
cliente foi 30/60"* como INFORMAÇÃO, não preenche o campo. É a mesma regra do
fechamento da montagem, onde o atalho que preenchia a quantidade pedida foi
removido: campo preenchido com número que ninguém conferiu é como o erro entra.

### Baixa (receber)
- por parcela; valor sugerido = saldo da parcela, **editável** (recebimento
  parcial é normal, não exceção);
- **forma e conta obrigatórias** — sem elas o extrato não fecha e a conciliação
  da Fase 5 nasce quebrada;
- gera `movimentos`; desfazer = **cancelar o movimento**, nunca apagar.

## Permissão e rules
- `ehFinanceiro()` = `dono | financeiro`. **Designer fora** — hoje `ehStaff()` o
  inclui e ele não deve ver dinheiro.
- `cobrancas` e `movimentos`: read/write `ehFinanceiro()`;
  `movimentos.update` só nos campos de cancelamento; `delete: if false`.
- `ACESSO.financeiro` e `ACESSO.dono` ganham `'financeiro'`.
- ⚠️ **Publicar as rules ANTES do build** (regra da casa): rules velhas derrubam
  a tela nova em produção.

## Duas coisas que só apareceram com dado real (e já estão no código)
- ⚠️ **Entrega com a BAIXA ANTIGA (`entregues.pago`) não entra na fila.** Sem
  isso, no primeiro dia a tela mostraria o histórico inteiro da fábrica como
  dívida em aberto — o número mais visível do sistema seria uma mentira. O
  interruptor velho continua valendo como "já acertado no fluxo antigo".
- ⚠️ **`indexaPorVenda` existe por causa da escala:** a fila resolve os itens de
  CADA entrega, e varrer `pedidos` + `entregues` inteiros a cada uma é O(n²).
  Com o histórico real de entregas isso trava a tela.
- A fila tem **corte declarado** (60 + "Mostrando 60 de N · ver todas"), como o
  `LIMITE_BUSCA` do Localizar: lista truncada em silêncio passa por completa.

## Armadilhas (LER ANTES DE CODAR)
1. **A parcela não pode ser identificada pela POSIÇÃO no array.** É o bug do
   `keyDoItem` outra vez: editar as parcelas renumera e os recebimentos passam a
   apontar para a parcela errada. `n` é fixo, nunca reordenado, e **parcela com
   movimento não é editável**.
2. **Cancelar entrega com cobrança recebida.** Hoje o cancelamento apaga a
   remessa; com dinheiro atrás, a cobrança tem que sobreviver — a tela avisa e o
   financeiro decide. Nunca apagar em silêncio.
3. **Não gravar "quanto já recebi" na cobrança.** Soma no render a partir dos
   movimentos; total desnormalizado diverge em silêncio (regra da fonte única,
   como `qtdNoPainel`).
4. **Pedido totalmente entregue SOME de `pedidos`.** A lista "a cobrar" tem que
   ler `entregues` também — é lá que mora a entrega que gera a cobrança.
5. **Nunca ratear por quantidade.** kg e unidade não somam.

---

# ROADMAP — as outras fases

## Fase 2 — CHEQUES (hoje só existem na Zeus)
Cheque tem vida própria: recebido → carteira → **depositado** ou **repassado a
terceiro** → compensado | devolvido → reapresentado. Histórico **append-only**,
igual ao da tela da Zeus (data/hora, usuário, situação, observação).
⚠️ **Número de cheque REPETE entre clientes** — a própria tela de localização da
Zeus mostrou quatro cheques com o mesmo número, de clientes diferentes. A chave é
`banco+agência+conta+número`, e buscar por número tem que **listar todos**, nunca
"achar o cheque". O cheque entra como forma de recebimento (Fase 1) e como forma
de pagamento a terceiro (Fase 5) — é a ponte entre as duas pontas.

## Fase 3 — COMISSÕES
- Faixas de % por faixa de desconto, cadastradas no vendedor.
- Base = `p.valorTotal`; fato gerador = `dataVenda`.
- Fechamento mensal `comissoes/{vendedor}-{AAAA-MM}` — e **aqui congela**, ao
  contrário da rota: é documento de pagamento, tem que provar o que foi pago no
  dia 10 do mês seguinte.
- ⚠️ **Precisa de uma fonte de faturamento própria.** Comissão por faturamento
  não pode ter como base o que está na produção: pedido vendido que nunca foi
  importado é comissão devida que o sistema não enxerga. É a linha do papel —
  *"conferir os pedidos por vendedor pois podem não ter sido passados para
  produção"*. A tela é um cruzamento **vendido × existe no sistema**, e exige
  importar a listagem de vendas do Posseidon.
- `unificaPedidosVendedor` já junta `pedidos` + `entregues` e serve de base.

## Fase 4 — COMPROVANTE DE ENTREGA (foto do canhoto assinado)
⚠️ O **Firebase Storage não está ligado** no projeto (só o bucket no config, sem
`getStorage` em lugar nenhum) e em projeto novo exige plano Blaze. Alternativa
sem custo: comprimir no navegador (~800px, JPEG) e gravar num doc próprio — cabe
no limite de 1 MB do Firestore. Decisão do dono foi que **só financeiro e dono
dão baixa**, então o vendedor não recebe: ele no máximo AVISA, no padrão do
`⚠ já foi entregue` que já usa hoje (coleção `problemas`).

## Fase 5 — CONTAS A PAGAR · BANCOS · OFX
Funcionários, fornecedores, cheques repassados. Contas bancárias cadastradas por
empresa (do papel: **JC Plástico** → Nordeste/boletos, Bradesco, Banese;
**JC Sacolas** → Bradesco, Cielo, cartão). Import de OFX conciliando contra
`movimentos` (que já nasce com `conciliado: false` na Fase 1).
É o pedaço mais pesado e o **menos ligado ao pedido** — deixar por último, ou
manter na contabilidade.

---

# O QUE OS DOCUMENTOS REAIS PROVARAM (04/09/2026)
> Analisados: `VENDAS POSSEIDON PLAST JULHO.PDF` (relatório analítico de pedidos
> por vendedor), `BRADESCO PLAST ABRIL` (extrato em OFX e em PDF, mesma conta e
> mesmo período) e a lista de comissão manuscrita do vendedor **Sérgio**.
> Vários pendentes antigos caíram aqui.

## 1. O VALOR POR ITEM EXISTE — o pendente mais antigo do projeto caiu
O CLAUDE.md dizia há semanas: *"FALTA: valor por item no import (depende de o
Posseidon exportar coluna de valor unitário/subtotal — pendente de confirmação
do cliente)"*. **Existe.** O relatório *Listagem de Pedido — Analítico Mod.02*
traz, por item: `Preço Unitário · Preço Líquido · Desconto Efetivo · Valor
Líquido`. Também traz **código do cliente**, **forma de pagamento** e o **status
OCT (pedido) × OCE (entregue)**.

⚠️ **Mas veio em PDF.** Antes de contar com isso: o Posseidon exporta esse mesmo
relatório em Excel/CSV? É um `.rdlc` da DPSistemas, que normalmente exporta —
mas ler valor de dinheiro por raspagem de PDF é frágil demais para fechar
comissão. **Pergunta em aberto, e é a que mais importa agora.**

## 2. ⚠️ A QUANTIDADE do relatório é ARREDONDADA; o VALOR é a verdade
Medido item a item no relatório de julho:

| Mostra | × preço | daria | valor real | quantidade real |
|---|---|---|---|---|
| 6 KG | 32,00 | 192,00 | **201,60** | 6,3 kg |
| 17 KG | 32,00 | 544,00 | **528,00** | 16,5 kg |
| 9 KG | 32,00 | 288,00 | **297,60** | 9,3 kg |
| 10 KG | 32,00 | 320,00 | **323,20** | 10,1 kg |
| 174 UND | 4,40 | 765,60 | **765,60** | 174 ✓ |
| 293 UND | 2,00 | 586,00 | **586,00** | 293 ✓ |

Papel e unidade fecham exato. **Plástico não fecha nunca** — a coluna
Quantidade vem arredondada para inteiro e o faturamento é sobre o peso real com
casas decimais. É o mesmo mundo do `arredondaQtd` de 3 casas que já existe no
sistema.
**Regra: no import desse relatório, NUNCA recalcular `valor = qtd × preço`.**
Ler o `Valor Líquido` e, se precisar da quantidade real, derivá-la por
`valor ÷ preço unitário`.

## 3. O desconto NÃO está na coluna de desconto
`Desconto Efetivo` veio **0,00 em todos os itens**, e mesmo assim há desconto: o
produto 321 (BOCA PALHAÇO 20X30 REC) saiu a **32,00** no pedido 5192 e a
**30,00** no 5497. O desconto é dado **abaixando o preço unitário**, não
lançando desconto.
→ Confirma a fórmula do desenho: o desconto é **preço de tabela × preço
praticado**. E agora o preço praticado vem pronto no relatório, não precisa ser
inferido. O preço de tabela continua sendo o do cadastro de Itens.

## 4. A comissão é POR PEDIDO, e mistura as duas empresas
Da lista manuscrita do Sérgio:
- algumas linhas trazem **`4%`** escrito ao lado; a maioria não traz nada — ou
  seja, existe uma **taxa padrão** e exceções por linha. A comissão **não é uma
  taxa única do vendedor**.
- algumas linhas trazem **`Plast`** — o vendedor mistura vendas da **JC Sacolas
  e da JC Plástico na mesma lista de comissão**. Isso confirma, por outro
  caminho, que `empresa` tinha mesmo que ser eixo desde o primeiro lançamento; e
  acrescenta um requisito: **a comissão fecha por vendedor, atravessando as duas
  empresas**, mesmo com o financeiro separado.
- ⚠️ não dá para parear nome × valor com segurança pela foto (as linhas estão
  deslocadas). Irrelevante para o desenho — o que importa são as duas regras
  acima.

## 5. ⚠️ O rodapé do relatório NÃO é o total do vendedor
O detalhe do MARQUINHO em julho são **7 pedidos = 5.892,00**. O bloco final
"Total Vendas Outras Formas" fecha **44.708,20 em 76 pedidos** — é outro escopo
(a empresa inteira). Quem ler o último número da folha como base de comissão
paga sete vezes o devido. A tela tem que somar os pedidos listados, nunca o
rodapé.

## 6. O extrato conta a vida do cheque inteira — e ela FECHA
Do Bradesco da JC Plástico, abril:

    08/04  DEP CHEQUE CAIXA AG                     +22.748,75
    09/04  4 devoluções "S/FUNDOS 1ª APRES."        −6.015,62   (4.300,62 · 1.100,00 · 282,00 · 333,00)
    13/04  DEP CHEQUE CAIXA AG                      +6.015,62   ← exatamente os mesmos 4, reapresentados
    14/04  3 devoluções "S/FUNDOS 2ª APRES."        −5.682,62   (o de 333,00 compensou)

Bate ao centavo. Duas conclusões para a Fase 2:
- **devolução de cheque é rotina, não exceção** — o ciclo
  `depositado → devolvido → reapresentado → devolvido/compensado` tem que ser
  estado de primeira classe, não observação;
- a conciliação identifica a devolução por **número do documento + valor**, que
  o extrato traz nos dois formatos. O `CHECKNUM` do OFX é o número do cheque.
- o PDF ainda mostra **Total Bloqueado 7.429,60**, que é o depósito de cheque de
  13/05 ainda não liberado: existe um estado **"depositado, não compensado"**.

## 7. ⚠️ O OFX do Bradesco é fora do padrão — o parser tem que ser tolerante
- **decimal com VÍRGULA** (`<TRNAMT>-4300,62`). A especificação do OFX manda
  ponto; parser genérico lê `-4300` ou quebra.
- `<DTSERVER>00000000000000` e `<DTASOF>00000000` — **datas inválidas** no
  cabeçalho.
- `<DTSTART>`/`<DTEND>` vêm **os dois com a data da extração**, não o período.
- o arquivo pedido como "abril" **contém lançamentos até 13/05**. 
  → **Filtrar por `DTPOSTED`, nunca confiar no período declarado pelo arquivo.**
- OFX e PDF do mesmo mês batem lançamento a lançamento — dá para usar o OFX como
  fonte e deixar o PDF como conferência humana.

## 8. Forma de pagamento existe, mas não serve como vencimento
O Posseidon traz `A Prazo` e `A Prazo / Deposito - Transferencia`. É a
**modalidade**, sem prazo, sem parcelas, sem data. Confirma a decisão do dono:
**o vencimento é digitado**, porque não existe de onde puxá-lo.

---

# EM ABERTO (responder antes de codar cada fase)
- Nome jurídico exato das duas empresas e quais contas bancárias são de cada uma.
- A tabela real de faixas de comissão (% por faixa de desconto).
- ✅ **A planilha traz condição de pagamento** — mas só a modalidade (`A Prazo`),
  sem prazo nem parcelas. A decisão de digitar o vencimento fica de pé.
- ✅ **Existe listagem de vendas por vendedor e período** (Listagem de Pedido —
  Analítico Mod.02), com valor POR ITEM. É a base da Fase 3.
- ❗ **O relatório analítico sai em Excel/CSV, ou só em PDF?** É a pergunta mais
  importante em aberto: fechar comissão raspando PDF é frágil demais.
- ❗ **Qual a taxa padrão de comissão** (a lista do Sérgio marca `4%` só nas
  exceções) e o que faz uma venda cair na exceção?
- ❗ **Pedido com status OCT (ainda não entregue) entra na comissão do mês?**
  O relatório lista OCT e OCE juntos; a decisão foi "por faturamento", e é
  preciso confirmar se faturado quer dizer OCT+OCE ou só OCE.
