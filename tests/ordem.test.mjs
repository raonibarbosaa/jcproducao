// Ordem de Fabricação (fase B). O que se protege aqui:
//  - só entra na espera o plástico triado, com cor, com saldo na LINHA e sem OF viva;
//  - agrupa por linha + produto + cor (duas cores em qualquer ordem = mesmo grupo);
//  - a OF é por linha + COR e junta vários produtos (bloco), nunca duas cores;
//  - OF cancelada solta o item (vínculo velho não prende);
//  - a situação da OF sai da quantidade VIVA dos pedidos;
//  - o número nunca se repete.
import {
  itensAguardandoOF, agrupaParaOF, docOF, situacaoDaOF, ofDoItem, idsDeOFsVivas,
  proximoNumeroOF, fmtNumeroOF, ofsComVinculo, plasticoSemCor, chaveGrupoOF, STATUS_OF,
  chaveOF, blocosParaOF, tamanhoDoProduto, ordemProdutoOF, produtosDaOF, fmtProdutosOF, itensPorProdutoOF,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const CAD = [
  { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PLASTICA 40X50', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' },
]
const PL = 'SACOLA PLASTICA 30X40'

function comCor(p, idx, cores) {
  return { ...p, cores: { ...(p.cores || {}), [k(p, idx)]: cores } }
}

const a = comCor(pedido({ id: '10', cliente: 'ANA', previsao: '2026-09-20',
  itens: [{ produto: PL, qtd: 10, linha: 'PRODUCAO' }, { produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' }] }),
  0, ['preto'])
const b = comCor(pedido({ id: '11', cliente: 'BIA', previsao: '2026-09-18',
  itens: [{ produto: PL, qtd: 6, linha: 'PRODUCAO' }] }), 0, ['preto'])
const c = comCor(pedido({ id: '12', cliente: 'CAIO', previsao: '2026-09-25',
  itens: [{ produto: PL, qtd: 4, linha: 'GLICHE' }] }), 0, ['preto'])                // outra linha
const d = comCor(pedido({ id: '13', cliente: 'DUDA', previsao: '2026-09-19',
  itens: [{ produto: PL, qtd: 3, linha: 'PRODUCAO' }] }), 0, ['dourado', 'preto'])
const e = comCor(pedido({ id: '14', cliente: 'EVA', previsao: '2026-09-30',
  itens: [{ produto: PL, qtd: 2, linha: 'PRODUCAO' }] }), 0, ['preto', 'dourado'])   // mesma dupla, outra ordem
const semCor = pedido({ id: '15', itens: [{ produto: PL, qtd: 5, linha: 'PRODUCAO' }] })
const naTriagem = { ...comCor(pedido({ id: '16', itens: [{ produto: PL, qtd: 5, linha: 'PRODUCAO' }] }), 0, ['rosa']), status: '' }
const jaSaiu = comCor(pedido({ id: '17', itens: [{ produto: PL, qtd: 5, linha: 'PRODUCAO' }],
  etapas: { 0: { montagem: 5 } } }), 0, ['rosa'])                                   // nada na linha

const todos = [a, b, c, d, e, semCor, naTriagem, jaSaiu]

// ---------- quem espera OF ----------
const esp = itensAguardandoOF(todos, CAD, new Set())
t('só o plástico triado, com cor e com saldo na linha', esp.map((x) => x.idVenda).sort(), ['10', '11', '12', '13', '14'])
ok('papel nunca entra', !esp.some((x) => x.produto.includes('PAPEL')))
t('quantidade é a da LINHA', esp.find((x) => x.idVenda === '10').qtd, 10)
t('unidade do plástico', esp[0].unidade, 'kg')
t('um sem cor é contado à parte', plasticoSemCor(todos, CAD), 1)

// parcial: 4 dos 10 já foram para a montagem → só 6 esperam OF
const aParcial = { ...a, etapas: { [k(a, 0)]: { montagem: 4 } } }
t('saldo parcial: só o que ficou na linha', itensAguardandoOF([aParcial], CAD, new Set())[0].qtd, 6)

// ---------- agrupamento ----------
const grupos = agrupaParaOF(esp)
t('3 grupos: silk preto, silk preto+dourado, clichê preto', grupos.length, 3)
const silkPreto = grupos.find((g) => g.chave === chaveGrupoOF('PRODUCAO', PL, ['preto']))
t('silk preto soma os dois pedidos', [silkPreto.total, silkPreto.pedidos], [16, 2])
t('dentro do grupo, o mais urgente primeiro', silkPreto.itens.map((x) => x.idVenda), ['11', '10'])
const dupla = grupos.find((g) => g.chave === chaveGrupoOF('PRODUCAO', PL, ['preto', 'dourado']))
t('duas cores em ordem diferente caem juntas', dupla.itens.map((x) => x.idVenda), ['13', '14'])
t('grupos pelo prazo mais urgente', grupos.map((g) => g.previsao), ['2026-09-18', '2026-09-19', '2026-09-25'])
ok('mesma sacola em outra linha não mistura',
  grupos.find((g) => g.linha === 'GLICHE').itens.every((x) => x.idVenda === '12'))

// ---------- documento ----------
const of = docOF({ numero: 7, grupo: silkPreto, escolhidos: silkPreto.itens,
  quem: { nome: 'Dono', uid: 'd' }, agora: '2026-09-16T10:00:00.000Z' })
t('cabeçalho', [of.numero, of.status, of.linha, of.material, of.cores, of.unidade, of.total],
  [7, 'liberada', 'PRODUCAO', 'plastico', ['preto'], 'kg', 16])
t('um produto só no resumo', of.produtos, [{ produto: PL, produtoKey: 'SACOLA PLASTICA 30X40', qtd: 16 }])
t('itens com retrato da liberação (e o produto em cada um)',
  of.itens.map((x) => [x.idVenda, x.qtd, x.cliente, x.produto]), [['11', 6, 'BIA', PL], ['10', 10, 'ANA', PL]])
t('quem soltou', [of.criadaPor, of.criadaUid], ['Dono', 'd'])
const soUm = docOF({ numero: 8, grupo: silkPreto, escolhidos: [silkPreto.itens[1]], quem: {} })
t('o gestor pode deixar pedido para depois', [soUm.itens.length, soUm.total], [1, 10])

// ---------- numeração ----------
t('próximo número', proximoNumeroOF([{ numero: 3 }, { numero: 9, status: 'cancelada' }]), 10)
t('primeira OF', proximoNumeroOF([]), 1)
t('formato', fmtNumeroOF(7), 'OF 0007')

// ---------- vínculo ----------
const ordens = [{ id: 'o1', status: STATUS_OF.LIBERADA }, { id: 'o2', status: STATUS_OF.CANCELADA }]
const vivos = idsDeOFsVivas(ordens)
const comOF = { ...a, ofs: ofsComVinculo(a, k(a, 0), 'o1') }
t('item com OF viva', ofDoItem(comOF, 0, vivos), 'o1')
t('e sai da espera', itensAguardandoOF([comOF], CAD, vivos).length, 0)
const comOFCancelada = { ...a, ofs: { [k(a, 0)]: 'o2' } }
t('OF cancelada NÃO prende', ofDoItem(comOFCancelada, 0, vivos), '')
t('o item volta para a espera', itensAguardandoOF([comOFCancelada], CAD, vivos).length, 1)
t('tirar o vínculo', ofsComVinculo(comOF, k(a, 0), null), {})
t('vínculo não mexe nos outros itens', Object.keys(ofsComVinculo({ ofs: { X: 'o9' } }, 'Y', 'o1')).sort(), ['X', 'Y'])

// ---------- situação viva ----------
const porId = { 10: a, 11: b }
t('recém-solta', situacaoDaOF(of, porId).st, 'liberada')
t('falta tudo', situacaoDaOF(of, porId).falta, 16)
const bAndou = { ...b, etapas: { [k(b, 0)]: { montagem: 6 } } }
const meio = situacaoDaOF(of, { 10: a, 11: bAndou })
t('um pedido saiu da linha: em produção', [meio.st, meio.feito, meio.falta], ['em_producao', 6, 10])
const aAndou = { ...a, etapas: { [k(a, 0)]: { montagem: 10 } } }
t('tudo saiu: concluída', situacaoDaOF(of, { 10: aAndou, 11: bAndou }).st, 'concluida')
const semPedido = situacaoDaOF(of, { 10: a })
ok('pedido que sumiu (entregue) conta como feito', semPedido.itens.find((x) => x.idVenda === '11').sumiu)
t('e não trava a OF', semPedido.falta, 10)
t('cancelada', situacaoDaOF({ ...of, status: 'cancelada' }, porId).st, 'cancelada')
const aMais = { ...a, itens: [{ ...a.itens[0], qtd: 15 }, a.itens[1]] }
const cresceu = situacaoDaOF(of, { 10: aMais, 11: b })
t('reimport aumentou: a falta mostra o que ESTÁ na linha (nada invisível)', cresceu.falta, 21)
t('e avisa o excedente', [cresceu.excedente, cresceu.itens.find((x) => x.idVenda === '10').excedente], [5, 5])
t('sem aumento, sem aviso', situacaoDaOF(of, porId).excedente, 0)

// ---------- BLOCO por cor: vários produtos na mesma OF ----------
const P2 = 'SACOLA PLASTICA 40X50'
const P3 = 'SACOLA PLASTICA CAMISETA 30X40 REC'
const f = comCor(pedido({ id: '18', cliente: 'FLA', previsao: '2026-09-17',
  itens: [{ produto: P2, qtd: 8, linha: 'PRODUCAO' }] }), 0, ['preto'])
const g2 = comCor(pedido({ id: '19', cliente: 'GIL', previsao: '2026-09-28',
  itens: [{ produto: P3, qtd: 5, linha: 'PRODUCAO' }] }), 0, ['preto'])
const rosa = comCor(pedido({ id: '20', cliente: 'HUGO', previsao: '2026-09-10',
  itens: [{ produto: P2, qtd: 1, linha: 'PRODUCAO' }] }), 0, ['rosa'])
const blocos = blocosParaOF(agrupaParaOF(itensAguardandoOF([...todos, f, g2, rosa], CAD, new Set())))
t('um bloco por linha + cor', blocos.map((x) => x.chave).sort(),
  [chaveOF('GLICHE', ['preto']), chaveOF('PRODUCAO', ['dourado', 'preto']), chaveOF('PRODUCAO', ['preto']), chaveOF('PRODUCAO', ['rosa'])].sort())
const bPreto = blocos.find((x) => x.chave === chaveOF('PRODUCAO', ['preto']))
t('o bloco Silk Preto junta os 3 produtos', bPreto.grupos.map((x) => x.produto), [PL, P3, P2])
t('e soma tudo', [bPreto.total, bPreto.pedidos, bPreto.previsao], [29, 4, '2026-09-17'])
ok('rosa NÃO entra no bloco preto (cor nunca mistura)', !bPreto.itens.some((x) => x.idVenda === '20'))
t('blocos pelo prazo mais urgente', blocos[0].chave, chaveOF('PRODUCAO', ['rosa']))
t('cor dupla é bloco próprio', blocos.find((x) => x.chave === chaveOF('PRODUCAO', ['dourado', 'preto'])).pedidos, 2)

// ordem dos produtos: pelo tamanho, os parecidos vizinhos
t('tamanho no nome', [tamanhoDoProduto('SACOLA PLÁSTICA BOCA PALHAÇO 30X40 REC'), tamanhoDoProduto('SACOLA PLASTICA CAMISETA 60 x 80'), tamanhoDoProduto('SACOLA PP')],
  [[30, 40], [60, 80], null])
t('30X40 antes de 40X50, e o sem tamanho no fim',
  ['SACOLA 40X50', 'SACOLA PP', 'CAMISETA 30X40 REC', 'BOCA PALHACO 30X40'].sort(ordemProdutoOF),
  ['BOCA PALHACO 30X40', 'CAMISETA 30X40 REC', 'SACOLA 40X50', 'SACOLA PP'])

// OF com dois produtos: o gestor desmarcou o terceiro
const escolhidos = bPreto.itens.filter((x) => x.produto !== P3)
const ofMulti = docOF({ numero: 9, grupo: bPreto, escolhidos, quem: { nome: 'Dono', uid: 'd' } })
t('resumo por produto, na ordem de tamanho', ofMulti.produtos, [
  { produto: PL, produtoKey: 'SACOLA PLASTICA 30X40', qtd: 16 },
  { produto: P2, produtoKey: 'SACOLA PLASTICA 40X50', qtd: 8 },
])
t('total do bloco escolhido', [ofMulti.total, ofMulti.itens.length, ofMulti.cores], [24, 3, ['preto']])
ok('sem `produto` no cabeçalho: a OF não é mais de um produto só', !('produto' in ofMulti))
t('produtosDaOF lê o doc novo', produtosDaOF(ofMulti).map((x) => x.produto), [PL, P2])
t('fmtProdutosOF: vários', fmtProdutosOF(ofMulti), '2 produtos')
t('fmtProdutosOF: um só', fmtProdutosOF(of), PL)
// doc ANTIGO (uma OF = um produto): continua lendo, sem migração
const antiga = { numero: 1, produto: PL, produtoKey: 'SACOLA PLASTICA 30X40', total: 5, itens: [{ idVenda: '10', itemKey: k(a, 0), qtd: 5 }] }
t('OF antiga vira lista de um produto', produtosDaOF(antiga), [{ produto: PL, produtoKey: 'SACOLA PLASTICA 30X40', qtd: 5 }])
t('item antigo herda o produto do cabeçalho', itensPorProdutoOF(antiga, antiga.itens).map((x) => [x.produto, x.total]), [[PL, 5]])
// situação por produto
const sMulti = situacaoDaOF(ofMulti, { 10: a, 11: bAndou, 18: f })
t('por produto: 30X40 em produção, 40X50 inteiro na linha',
  sMulti.produtos.map((x) => [x.produto, x.total, x.falta, x.feito]), [[PL, 16, 10, 6], [P2, 8, 8, 0]])
t('e a OF inteira', [sMulti.st, sMulti.total, sMulti.falta], ['em_producao', 24, 18])
const ficha = itensPorProdutoOF(ofMulti, ofMulti.itens)
t('ficha: itens por produto, pelo prazo dentro do produto', ficha.map((x) => [x.produto, x.itens.map((y) => y.idVenda)]),
  [[PL, ['11', '10']], [P2, ['18']]])

// ---------- virada: o que já estava na fila não espera OF ----------
const aLegado = { ...a, semOF: { [k(a, 0)]: true } }
t('já estava na fila: fora da espera (decisão do dono)', itensAguardandoOF([aLegado], CAD, new Set()).length, 0)
t('e não conta como "sem cor" que falta para OF', plasticoSemCor([{ ...semCor, semOF: { [k(semCor, 0)]: true } }], CAD), 0)

export default resultado('ordem')
