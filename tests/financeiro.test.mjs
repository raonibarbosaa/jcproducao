// FINANCEIRO — Fase 1, contas a receber.
// Cobre as invariantes cuja quebra é SILENCIOSA: valor que infla, entrega
// cobrada duas vezes, recebimento que cai na parcela errada, cobrança que nunca
// quita, movimento cancelado que continua contando.
import {
  valorDeTabela, fatorDesconto, valorDaEntrega, itensDoPedidoInteiro,
  entregasCobertas, entregaJaCobrada, entregasParaCobrar, indexaPorVenda,
  geraParcelas, somaDias, dataDeISO, diaISO,
  recebidoDaCobranca, recebidoDaParcela, parcelaTemMovimento,
  situacaoDaCobranca, parcelasVencendo, totaisReceber, arredondaMoeda,
  contasDaEmpresa, veFinanceiro,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const CAD = [
  { produto: 'SACOLA PAPEL P02', preco: 4, tipo: 'papel', unidade: 'un' },
  { produto: 'SACOLA PLASTICA 30X40', preco: 32, tipo: 'plastico', unidade: 'kg' },
  { produto: 'ETIQUETA G', preco: 2, tipo: 'etiquetas', unidade: 'un' },
]
const SEM_PRECO = [{ produto: 'SACOLA PAPEL P02', preco: 4 }]   // falta o resto

// pedido de 500,00 vendido, tabela 1000,00 → 50% de desconto (número redondo
// de propósito: o que se testa é o rateio, não a aritmética)
const p1 = pedido({
  id: '5458',
  itens: [
    { produto: 'SACOLA PAPEL P02', qtd: 100 },          // tabela 400
    { produto: 'SACOLA PLASTICA 30X40', qtd: 10 },      // tabela 320
    { produto: 'ETIQUETA G', qtd: 140 },                // tabela 280
  ],
  valorTotal: 500,
})
const itens1 = itensDoPedidoInteiro('5458', [p1], [])

// ---------- valor de tabela e desconto ----------
t('tabela soma preço × quantidade', valorDeTabela(itens1, CAD), 1000)
t('faltando preço em UM item, a tabela é null (não estima)', valorDeTabela(itens1, SEM_PRECO), null)
t('o desconto vem em fator', fatorDesconto(500, 1000), 0.5)
t('sem tabela não há fator', fatorDesconto(500, null), null)

// ---------- entrega ÚNICA: o valor é o do pedido, sem conta ----------
const inteira = { idVenda: '5458', remessa: 1, parcial: false, valorTotal: 500, itens: [] }
t('saiu tudo de uma vez: valor exato do pedido', valorDaEntrega(inteira, itens1, CAD, 1).valor, 500)
ok('e a tela pode dizer que é exato', valorDaEntrega(inteira, itens1, CAD, 1).exato)
t('pedido sem valor no import não vira cobrança automática',
  valorDaEntrega({ ...inteira, valorTotal: 0 }, itens1, CAD, 1).motivo, 'sem-valor')

// ---------- entrega PARCIAL: rateio pela tabela, com o mesmo desconto ----------
// remessa 1 leva o papel inteiro (tabela 400) → 50% → 200,00
const r1 = {
  idVenda: '5458', remessa: 1, parcial: true, valorTotal: 500,
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, qtdItem: 100, key: k(p1, 0) }],
}
// remessa 2 leva plástico + etiqueta (tabela 600) → 50% → 300,00
const r2 = {
  idVenda: '5458', remessa: 2, parcial: false, valorTotal: 500,
  itens: [
    { produto: 'SACOLA PLASTICA 30X40', qtd: 10, qtdItem: 10, key: k(p1, 1) },
    { produto: 'ETIQUETA G', qtd: 140, qtdItem: 140, key: k(p1, 2) },
  ],
}
t('remessa 1 rateada', valorDaEntrega(r1, itens1, CAD, 2).valor, 200)
t('remessa 2 rateada', valorDaEntrega(r2, itens1, CAD, 2).valor, 300)
t('⚠️ a SOMA das remessas fecha exatamente o valor do pedido',
  arredondaMoeda(valorDaEntrega(r1, itens1, CAD, 2).valor + valorDaEntrega(r2, itens1, CAD, 2).valor), 500)
t('sem preço em todos os itens, o rateio se recusa e a tela pede o valor',
  valorDaEntrega(r1, itens1, SEM_PRECO, 2).motivo, 'sem-preco')

// ---------- o pedido apagado (entregue por inteiro) ainda tem tabela ----------
// ⚠️ pedido totalmente entregue SOME de `pedidos`; sem juntar as remessas a
// tabela sairia menor e o rateio inflaria a cobrança
const reconstruido = itensDoPedidoInteiro('5458', [], [r1, r2])
t('itens reconstruídos das remessas', reconstruido.length, 3)
t('o índice dá a mesma resposta que a varredura',
  itensDoPedidoInteiro('5458', [], [r1, r2], indexaPorVenda([], [r1, r2])).length, 3)
t('e a tabela continua a mesma', valorDeTabela(reconstruido, CAD), 1000)
// duas remessas do MESMO item (parcial por quantidade): não pode somar
const meio1 = { idVenda: '77', remessa: 1, itens: [{ produto: 'SACOLA PAPEL P02', qtd: 40, qtdItem: 100 }] }
const meio2 = { idVenda: '77', remessa: 2, itens: [{ produto: 'SACOLA PAPEL P02', qtd: 60, qtdItem: 100 }] }
t('item que saiu em duas remessas conta UMA vez, pelo total',
  itensDoPedidoInteiro('77', [], [meio1, meio2]).map((i) => i.qtd), [100])

// ---------- A TRAVA: nada cobrado duas vezes ----------
const cobPedido = { id: 'c1', idVenda: '5458', remessa: null, valor: 500, parcelas: [] }
const cobRemessa = { id: 'c2', idVenda: '5458', remessa: 1, valor: 200, parcelas: [] }
const cortePedido = entregasCobertas([cobPedido])
ok('cobrança do PEDIDO cobre a remessa 1', entregaJaCobrada(cortePedido, '5458', 1))
ok('e cobre também a remessa 2', entregaJaCobrada(cortePedido, '5458', 2))
const corteRemessa = entregasCobertas([cobRemessa])
ok('cobrança da remessa 1 trava a remessa 1', entregaJaCobrada(corteRemessa, '5458', 1))
ok('mas a remessa 2 continua livre', !entregaJaCobrada(corteRemessa, '5458', 2))
const corteCancelada = entregasCobertas([{ ...cobPedido, status: 'cancelada' }])
ok('cobrança CANCELADA não trava nada', !entregaJaCobrada(corteCancelada, '5458', 1))
t('a fila "a cobrar" desconta o que já foi cobrado',
  entregasParaCobrar([r1, r2], [cobRemessa], [], CAD).map((e) => e.remessa), [2])
// ⚠️ a baixa ANTIGA (`entregues.pago`) já acertou aquela entrega no fluxo velho.
// Sem esta exclusão, no primeiro dia a tela mostraria o histórico inteiro da
// fábrica como dívida em aberto.
t('entrega com a baixa antiga NÃO volta a ser cobrada',
  entregasParaCobrar([{ ...r1, pago: true }, r2], [], [], CAD).map((e) => e.remessa), [2])
// (sem `entregueEm` nas fixtures a ordenação por data empata e mantém a ordem)
t('e sem a baixa antiga as duas entram',
  entregasParaCobrar([r1, r2], [], [], CAD).map((e) => e.remessa), [1, 2])

// ---------- parcelas ----------
const pcs = geraParcelas(100, 3, '2026-10-05', 30)
t('a soma das parcelas fecha o valor (a sobra vai na primeira)',
  arredondaMoeda(pcs.reduce((s, x) => s + x.valor, 0)), 100)
t('primeira parcela carrega o centavo', pcs[0].valor, 33.34)
t('vencimentos espaçados', pcs.map((x) => x.venc), ['2026-10-05', '2026-11-04', '2026-12-04'])
t('numeração começa em 1 e é a identidade', pcs.map((x) => x.n), [1, 2, 3])
// ⚠️ fuso: 'YYYY-MM-DD' no `new Date()` cairia no dia anterior em UTC-3
t('a data não escorrega de dia', diaISO(dataDeISO('2026-09-04')), '2026-09-04')
t('somaDias atravessa o mês', somaDias('2026-01-31', 30), '2026-03-02')

// ---------- recebimentos ----------
// parcelas propositalmente FORA DE ORDEM no array: o que identifica é o `n`
const cob = {
  id: 'c9', idVenda: '5458', valor: 300, empresa: 'sacolas',
  parcelas: [
    { n: 2, valor: 100, venc: '2026-11-04' },
    { n: 1, valor: 100, venc: '2026-10-05' },
    { n: 3, valor: 100, venc: '2026-12-04' },
  ],
}
const movs = [
  { id: 'm1', cobrancaId: 'c9', parcelaN: 1, valor: 100, data: '2026-10-05', tipo: 'entrada' },
  { id: 'm2', cobrancaId: 'c9', parcelaN: 2, valor: 40, data: '2026-11-06', tipo: 'entrada' },
  { id: 'm3', cobrancaId: 'c9', parcelaN: 2, valor: 500, data: '2026-11-06', tipo: 'entrada', cancelado: true },
  { id: 'm4', cobrancaId: 'OUTRA', parcelaN: 1, valor: 999, data: '2026-11-06', tipo: 'entrada' },
]
t('⚠️ o recebimento acha a parcela pelo NÚMERO, não pela posição no array',
  recebidoDaParcela('c9', 1, movs), 100)
t('parcela recebida pela metade', recebidoDaParcela('c9', 2, movs), 40)
t('movimento CANCELADO não conta', recebidoDaCobranca('c9', movs), 140)
t('e movimento de outra cobrança não vaza', recebidoDaParcela('OUTRA', 1, movs), 999)
ok('parcela com movimento é bloqueada para edição', parcelaTemMovimento('c9', 1, movs))
ok('parcela sem movimento continua editável', !parcelaTemMovimento('c9', 3, movs))

// ---------- situação, derivada ----------
const s1 = situacaoDaCobranca(cob, movs, '2026-11-10')
t('recebeu parte e tem parcela vencida → vencida', s1.st, 'vencida')
t('saldo é o que falta', s1.saldo, 160)
// a parcela 1 está quitada: a vencida mais velha é a 2ª (04/11), não a 1ª
t('e diz há quantos dias, contando da parcela ABERTA mais velha', s1.diasAtraso, 6)
const s2 = situacaoDaCobranca(cob, movs, '2026-10-20')
t('antes do vencimento da 2ª, é só parcial', s2.st, 'parcial')
t('a próxima a vencer é a 2ª', s2.proxima, '2026-11-04')
const s3 = situacaoDaCobranca(cob, [], '2026-10-01')
t('sem nenhum recebimento, aberta', s3.st, 'aberta')
// quitação com resíduo de centavo: 100/3 nunca fecha em ponto flutuante
const cobRes = { id: 'cr', valor: 100, parcelas: geraParcelas(100, 3, '2026-10-05', 30) }
const movsRes = cobRes.parcelas.map((pc, i) => ({
  id: 'r' + i, cobrancaId: 'cr', parcelaN: pc.n, valor: pc.valor, data: '2026-10-05', tipo: 'entrada',
}))
t('⚠️ cobrança dividida em 3 QUITA (não fica com resíduo pendente para sempre)',
  situacaoDaCobranca(cobRes, movsRes, '2026-12-31').st, 'quitada')
t('cancelada é o único estado gravado',
  situacaoDaCobranca({ ...cob, status: 'cancelada' }, movs, '2026-11-10').st, 'cancelada')

// ---------- listas e totais ----------
// a 1ª está quitada e a 3ª vence 04/12: sobra a 2ª
t('o que vence até 30/11 e ainda tem saldo', parcelasVencendo([cob], movs, '2026-11-30').map((x) => x.n), [2])
t('sem corte, todas as que têm saldo', parcelasVencendo([cob], movs, '').map((x) => x.n), [2, 3])
const tot = totaisReceber([cob], movs, '2026-11-10')
t('em aberto = o saldo', tot.aberto, 160)
t('vencido acompanha', tot.vencido, 160)
// 40 desta cobrança + 999 de outra. O livro-caixa conta o que ENTROU no mês,
// não o que estas cobranças receberam — e os 500 cancelados ficam de fora.
t('recebido no mês sai dos MOVIMENTOS: toda entrada do mês, menos as canceladas',
  tot.recebidoNoMes, 1039)

// ---------- permissão e contas ----------
ok('financeiro entra', veFinanceiro('financeiro'))
ok('dono entra', veFinanceiro('dono'))
ok('⚠️ o DESIGNER não vê dinheiro, mesmo sendo staff', !veFinanceiro('designer'))
ok('vendedor não vê', !veFinanceiro('vendedor'))
t('as contas da JC Plástico', contasDaEmpresa('plastico').map((c) => c.id),
  ['bradesco', 'banese', 'nordeste', 'caixa'])
t('as da JC Sacolas', contasDaEmpresa('sacolas').map((c) => c.id),
  ['bradesco', 'cielo', 'caixa'])

export default resultado('financeiro')
