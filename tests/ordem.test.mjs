// Ordem de Fabricação (fase B). O que se protege aqui:
//  - só entra na espera o plástico triado, com cor, com saldo na LINHA e sem OF viva;
//  - agrupa por linha + produto + cor (duas cores em qualquer ordem = mesmo grupo);
//  - OF cancelada solta o item (vínculo velho não prende);
//  - a situação da OF sai da quantidade VIVA dos pedidos;
//  - o número nunca se repete.
import {
  itensAguardandoOF, agrupaParaOF, docOF, situacaoDaOF, ofDoItem, idsDeOFsVivas,
  proximoNumeroOF, fmtNumeroOF, ofsComVinculo, plasticoSemCor, chaveGrupoOF, STATUS_OF,
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
t('cabeçalho', [of.numero, of.status, of.linha, of.material, of.produto, of.cores, of.unidade, of.total],
  [7, 'liberada', 'PRODUCAO', 'plastico', PL, ['preto'], 'kg', 16])
t('itens com retrato da liberação', of.itens.map((x) => [x.idVenda, x.qtd, x.cliente]), [['11', 6, 'BIA'], ['10', 10, 'ANA']])
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

// ---------- virada: o que já estava na fila não espera OF ----------
const aLegado = { ...a, semOF: { [k(a, 0)]: true } }
t('já estava na fila: fora da espera (decisão do dono)', itensAguardandoOF([aLegado], CAD, new Set()).length, 0)
t('e não conta como "sem cor" que falta para OF', plasticoSemCor([{ ...semCor, semOF: { [k(semCor, 0)]: true } }], CAD), 0)

export default resultado('ordem')
