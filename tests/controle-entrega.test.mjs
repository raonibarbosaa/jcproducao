// CONTROLE DE ENTREGA — a baixa do ESCRITÓRIO (a planilha vira tela).
// O que se protege aqui: a baixa é uma baixa normal (mapa + auditoria com
// origem), nunca inventa volume, recusa com motivo o que não dá para mover,
// não entrega duas vezes, e a tabela do mês é VISÃO sobre o banco.
import {
  baixaEscritorio, situacaoBaixa, podeBaixarNoControle, podeEntregarNoControle,
  preparaRemessa, linhasControleEntrega, mesesDoControle, totaisDoControle,
  origemDaBaixa, mesDe, rotuloMes, ORIGEM_BAIXA, lancarControle, lancadoNoControle,
  avisosEntregaAbertos, fechaAvisoPeloLancamento, podeFecharAviso, resumoBaixasEscritorio, fmtPorMaterial,
  qtdNaEtapa, volumesDoItem, idxProntos, itensParaCarga, temTrabalhoNaProducao,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const CAD = [
  { produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' },
  { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' },
]
const QUEM = { porUid: 'u1', porNome: 'Ana (escritório)', porEmail: 'ana@jc', perfil: 'financeiro', ip: '1.1.1.1' }
const AGORA = '2026-10-07T14:00:00.000Z'

// ---------- 1. pedido inteiro na fábrica, sem nenhuma baixa (o caso da planilha) ----------
const p1 = pedido({
  id: '5738', cliente: 'BETEK KIDS', valorTotal: 448, importadoEm: '2026-09-30T12:00:00.000Z',
  itens: [
    { produto: 'SACOLA PAPEL P02', qtd: 500, linha: 'GRAFICA' },
    { produto: 'SACOLA PLASTICA 30X40', qtd: 20, linha: 'PRODUCAO' },
  ],
  etapas: { 0: { montagem: 200 } },     // metade do papel já na montagem, resto na gráfica
})
const s1 = situacaoBaixa(p1, CAD)
t('item 0: 300 na gráfica + 200 na montagem = 500 soltas', s1[0].solta, 500)
t('item 0: onde está, por etapa', s1[0].onde.map((o) => `${o.etapa}:${o.qtd}`), ['GRAFICA:300', 'montagem:200'])
ok('item 0 é baixável', s1[0].baixavel)
t('item 1 (plástico) inteiro no silk', s1[1].onde, [{ etapa: 'PRODUCAO', qtd: 20 }])

const b1 = baixaEscritorio(p1, null, QUEM, CAD, AGORA)
t('moveu os 2 itens', b1.movidos.length, 2)
t('nada recusado', b1.recusados, [])
const d1 = { ...p1, etapas: b1.etapas }
t('tudo do item 0 virou expedido', qtdNaEtapa(d1, 0, 'expedido'), 500)
t('e nada ficou na montagem', qtdNaEtapa(d1, 0, 'montagem'), 0)
t('item 1 também expedido', qtdNaEtapa(d1, 1, 'expedido'), 20)
t('o pedido saiu da produção', temTrabalhoNaProducao(d1), false)
t('e a Rota o enxerga inteiro', idxProntos(d1), [0, 1])
ok('NÃO inventou volume', !volumesDoItem(d1, 0).length && !volumesDoItem(d1, 1).length)
t('na carga entra como volume único sem id (caminho do legado)',
  itensParaCarga(d1).map((x) => x.volumeId), ['', ''])
t('um registro de auditoria por item × etapa de ORIGEM', b1.registros.length, 3)
t('registros dizem de onde o escritório tirou', b1.registros.map((r) => `${r.de}>${r.para}:${r.qtd}`),
  ['GRAFICA>expedido:300', 'montagem>expedido:200', 'PRODUCAO>expedido:20'])
ok('todos com origem escritório', b1.registros.every((r) => r.origem === ORIGEM_BAIXA.ESCRITORIO))
ok('e assinados por quem baixou', b1.registros.every((r) => r.porUid === 'u1'))
t('o pedido ganha o carimbo da baixa', b1.campos.baixaEscritorio.por, 'Ana (escritório)')
t('origem lida do carimbo', origemDaBaixa({ ...p1, ...b1.campos }), 'escritorio')
t('sem carimbo é da fábrica', origemDaBaixa(p1), 'fabrica')
t('o `por` da etapa é quem baixou', b1.etapas[k(p1, 0)].por, 'Ana (escritório)')
ok('o relógio fechou a montagem (tempos gravado)', 'montagem' in (b1.etapas[k(p1, 0)].tempos || {}))

// só UM item marcado: o outro fica onde está
const b1b = baixaEscritorio(p1, [0], QUEM, CAD, AGORA)
t('com [0] marcado só ele anda', b1b.movidos.map((m) => m.idx), [0])
t('o item 1 continua no silk', qtdNaEtapa({ ...p1, etapas: b1b.etapas }, 1, 'PRODUCAO'), 20)

// ---------- 2. item já EMBALADO pela fábrica: anda por volume, o solto é recusado ----------
const p2 = pedido({
  id: '5458',
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500, linha: 'GRAFICA' }],
  etapas: { 0: { montagem: 0, produzido: 227, volumes: [{ id: 'a', qtd: 120, et: 'expedicao' }, { id: 'b', qtd: 107, et: 'expedicao' }] } },
})
const s2 = situacaoBaixa(p2, CAD)
ok('item embalado', s2[0].embalado)
t('2 volumes esperando o ✓ Expedir', s2[0].volumesParaExpedir, ['a', 'b'])
t('273 soltas na gráfica são RECUSADAS (sem pesagem)', s2[0].recusa, { qtd: 273, motivo: 'sem-pesagem' })
const b2 = baixaEscritorio(p2, null, QUEM, CAD, AGORA)
t('os volumes foram para expedido', volumesDoItem({ ...p2, etapas: b2.etapas }, 0).map((v) => v.et), ['expedido', 'expedido'])
t('a parte solta continua na gráfica', qtdNaEtapa({ ...p2, etapas: b2.etapas }, 0, 'GRAFICA'), 273)
t('e a recusa é declarada', b2.recusados.map((r) => r.qtd), [273])
t('auditoria do volume: de expedição, 227 em 2 volumes', [b2.registros[0].de, b2.registros[0].qtd, b2.registros[0].volumes], ['expedicao', 227, 2])

// ---------- 3. nada a fazer: já expedido / já entregue ----------
const p3 = pedido({ id: '6000', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 10 }], etapas: { 0: { expedido: 10 } } })
const b3 = baixaEscritorio(p3, null, QUEM, CAD, AGORA)
t('pedido já pronto: nada se move', b3.movidos, [])
t('e não ganha carimbo de baixa', b3.campos, {})
ok('situação diz concluído', situacaoBaixa(p3, CAD)[0].concluido)

// ---------- 4. a baixa NÃO apaga o relógio dos itens vizinhos ----------
const p4 = pedido({
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100 }, { produto: 'SACOLA PLASTICA 30X40', qtd: 50 }],
  etapas: { 0: { montagem: 100, desde: { montagem: '2026-10-01T00:00:00.000Z' }, tempos: { GRAFICA: 5000 } }, 1: { montagem: 50 } },
})
const b4 = baixaEscritorio(p4, [1], QUEM, CAD, AGORA)
t('o item 0 (não movido) mantém o desde', b4.etapas[k(p4, 0)].desde.montagem, '2026-10-01T00:00:00.000Z')
t('e mantém o tempos acumulado', b4.etapas[k(p4, 0)].tempos.GRAFICA, 5000)

// ---------- 5. permissões ----------
ok('financeiro baixa', podeBaixarNoControle('financeiro'))
ok('expedição baixa', podeBaixarNoControle('expedicao'))
ok('operador de expedição baixa (2º eixo)', podeBaixarNoControle('operador', ['expedicao']))
t('operador do silk não', podeBaixarNoControle('operador', ['PRODUCAO']), false)
t('vendedor não', podeBaixarNoControle('vendedor'), false)
t('entrega: dono e financeiro, só', ['dono', 'designer', 'financeiro', 'expedicao'].map(podeEntregarNoControle), [true, false, true, false])

// ---------- 6. a remessa (extraída da Rota) ----------
const r1 = preparaRemessa(d1, 'MATEUS', 'Ana', AGORA)
t('doc da remessa', r1.docId, '5738-1')
ok('acabou (tudo entregue)', r1.acabou)
t('remessa leva os 2 itens com qtd e qtdItem', r1.remessa.itens.map((i) => `${i.qtd}/${i.qtdItem}`), ['500/500', '20/20'])
t('motorista e data', [r1.remessa.motorista, r1.remessa.entregueEm], ['MATEUS', AGORA])
ok('`id` do pedido NÃO vai dentro da remessa', !('id' in r1.remessa))
t('nada expedido = null', preparaRemessa(p1, 'MATEUS', 'Ana', AGORA), null)
// parcial: só o item 0 pronto
const parcial = { ...p1, etapas: b1b.etapas }
const r2 = preparaRemessa(parcial, 'MATEUS', 'Ana', AGORA)
t('remessa parcial', [r2.acabou, r2.remessa.parcial, r2.remessa.itensPendentes], [false, true, 1])
t('o item 1 continua pendente no pedido', qtdNaEtapa({ ...parcial, etapas: r2.etapas }, 1, 'PRODUCAO'), 20)
// misto: um por volume, outro por quantidade
const p6 = pedido({
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100 }, { produto: 'SACOLA PLASTICA 30X40', qtd: 50 }],
  etapas: { 0: { montagem: 0, produzido: 100, volumes: [{ id: 'a', qtd: 98, et: 'expedido' }] }, 1: { expedido: 50 } },
})
const r6 = preparaRemessa(p6, 'PAULO', 'Ana', AGORA)
ok('misto: acabou', r6.acabou)
t('volume virou entregue', volumesDoItem({ ...p6, etapas: r6.etapas }, 0)[0].et, 'entregue')
t('quantidade virou entregue', qtdNaEtapa({ ...p6, etapas: r6.etapas }, 1, 'entregue'), 50)

// ---------- 7. o LANÇAMENTO (uma ação só: finalizado + saiu) ----------
t('sem motorista não lança', lancarControle(p1, QUEM, '', CAD, AGORA), null)
const l1 = lancarControle(p1, QUEM, 'MATEUS', CAD, AGORA)
ok('lançou e moveu os 2 itens', l1.gravaEtapas && l1.movidos.length === 2)
t('campos: carimbo + saída com o motorista', [l1.campos.baixaEscritorio.motorista, l1.campos.saidaMotorista, l1.campos.saidaEm], ['MATEUS', 'MATEUS', AGORA])
ok('fica lançado', lancadoNoControle({ ...p1, ...l1.campos }))
// pedido que a fábrica JÁ tinha baixado: lança igual, sem mexer em etapas
const l3 = lancarControle(p3, QUEM, 'PAULO', CAD, AGORA)
t('já pronto: nada se move, mas lança', [l3.gravaEtapas, l3.movidos.length, !!l3.campos.baixaEscritorio], [false, 0, true])
// INTEIRO: a parte solta do item embalado vira volume SEM PESAGEM
const l2 = lancarControle(p2, QUEM, 'MATEUS', CAD, AGORA)
t('inteiro: nada recusado', l2.recusados, [])
const d2 = { ...p2, etapas: l2.etapas }
t('tudo expedido (227 pesadas + 273 declaradas)', qtdNaEtapa(d2, 0, 'expedido'), 500)
t('nada ficou na gráfica', qtdNaEtapa(d2, 0, 'GRAFICA'), 0)
const volsL2 = l2.etapas[k(p2, 0)].volumes
t('3 volumes: 2 da balança + 1 sem pesagem', volsL2.map((v) => !!v.semPesagem), [false, false, true])
t('o volume declarado leva a quantidade PEDIDA', volsL2[2].qtd, 273)
t('produzido fecha o lote', l2.etapas[k(p2, 0)].produzido, 500)
ok('auditoria marca a parte sem pesagem', l2.registros.some((r) => r.semPesagem && r.de === 'GRAFICA' && r.qtd === 273))

// ---------- 8. a lista: TUDO que está pronto, fábrica e escritório lado a lado ----------
t('mesDe usa partes locais', mesDe('2026-10-07T14:00:00.000Z').length, 7)
t('rótulo como a aba da planilha', rotuloMes('2026-10'), 'OUTUBRO 2026')
const lancado = { ...d1, ...l1.campos }
const voltou = { ...lancado, idVenda: '6215' }
delete voltou.saidaEm; delete voltou.saidaMotorista
const soFabrica = pedido({ id: '7000', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 10 }], etapas: { 0: { expedido: 10 } }, valorTotal: 50 })
const fabricaSaiu = { ...pedido({ id: '7002', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 10 }], etapas: { 0: { expedido: 10 } } }), saidaEm: '2026-10-05T10:00:00.000Z', saidaMotorista: 'PAULO' }
const naFabricaAinda = pedido({ id: '7001', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 10 }] })
const linhas = linhasControleEntrega([lancado, voltou, soFabrica, fabricaSaiu, naFabricaAinda])
t('entra tudo que está pronto; o que ainda está na fábrica, não', linhas.map((l) => l.idVenda).sort(), ['5738', '6215', '7000', '7002'])
t('situação: na rua × pronto sem saída × voltou', Object.fromEntries(linhas.map((l) => [l.idVenda, l.situacao])),
  { 5738: 'sera', 6215: 'voltou', 7000: 'pronto', 7002: 'sera' })
t('origem diz de quem foi a baixa', Object.fromEntries(linhas.map((l) => [l.idVenda, l.origem])),
  { 5738: 'escritorio', 6215: 'escritorio', 7000: 'fabrica', 7002: 'fabrica' })
t('motorista: quem está levando, ou quem levou da última vez', Object.fromEntries(linhas.map((l) => [l.idVenda, l.motorista])),
  { 5738: 'MATEUS', 6215: 'MATEUS', 7000: '', 7002: 'PAULO' })
t('filtro por situação', linhasControleEntrega([lancado, voltou, soFabrica], { situacao: 'pronto' }).map((l) => l.idVenda), ['7000'])
t('filtro por origem', linhasControleEntrega([lancado, voltou, soFabrica], { origem: 'fabrica' }).map((l) => l.idVenda), ['7000'])
const tot = totaisDoControle(linhas)
t('totais', [tot.linhas, tot.sera, tot.pronto, tot.voltou, tot.escritorio], [4, 2, 1, 1, 2])
t('valor somado', tot.valor, 448 + 448 + 50)
t('meses', mesesDoControle(linhas), ['2026-10'])
// entregue SAI da lista: depois da remessa inteira o pedido some de `pedidos`
const r8 = preparaRemessa(lancado, 'MATEUS', 'Anny', AGORA)
ok('remessa inteira apaga o pedido (acabou)', r8.acabou)
ok('e a remessa guarda o carimbo do lançamento (origem para relatórios)', !!r8.remessa.baixaEscritorio)

// ---------- 9. Fase C: o lançamento responde ao aviso "já foi entregue" ----------
const avisos = [
  { id: 'a1', campo: 'entregue', status: 'aberto' },
  { id: 'a2', campo: 'entregue', status: 'resolvido' },
  { id: 'a3', campo: 'qtd', status: 'aberto' },
]
t('só o aviso de ENTREGA que está ABERTO fecha', avisosEntregaAbertos(avisos).map((x) => x.id), ['a1'])
const f = fechaAvisoPeloLancamento('MATEUS', QUEM, AGORA)
t('fecha como resolvido, dizendo o que aconteceu', [f.status, f.resolvidoPor, f.resolvidoEm], ['resolvido', 'Ana (escritório)', AGORA])
ok('a resolução nomeia o motorista', f.resolucao.includes('MATEUS'))
t('quem fecha o aviso é staff (a rule de problemas só aceita staff)',
  ['dono', 'designer', 'financeiro', 'expedicao', 'operador'].map(podeFecharAviso), [true, true, true, false, false])

// ---------- 10. Fase D: baixas do escritório por setor × mês ----------
const regsD = [
  ...l1.registros,                                     // 5738: GRAFICA 300, montagem 200 (papel), PRODUCAO 20 (plástico)
  ...l2.registros.map((r) => ({ ...r, quando: '2026-09-15T10:00:00.000Z' })),   // 5458 em setembro
  { origem: 'fabrica', de: 'montagem', para: 'expedicao', qtd: 99, idVenda: '1', quando: AGORA },   // da fábrica: fora
]
const rd = resumoBaixasEscritorio(regsD)
t('meses, do mais novo para o mais velho', rd.meses, ['2026-10', '2026-09'])
const out = resumoBaixasEscritorio(regsD, { mes: '2026-10' })
t('outubro: 3 itens de 1 pedido (a fábrica não entra)', [out.totais.itens, out.totais.pedidos], [3, 1])
t('setores pelo nome do chão de fábrica (um item cada)', out.setores.map((g) => `${g.onde}:${g.itens}`).sort(), ['GRÁFICA:1', 'Montagem Papel:1', 'SILK SCREEN:1'])
// com itens diferentes, o setor que MAIS deixa de baixar vem primeiro
const muitos = resumoBaixasEscritorio([...l1.registros, ...l1.registros.filter((r) => r.de === 'montagem')], { mes: '2026-10' })
t('maior primeiro', muitos.setores[0].onde, 'Montagem Papel')
t('quantidade por material, nunca somada', fmtPorMaterial(out.setores.find((g) => g.etapa === 'PRODUCAO').porMaterial), '20 kg Plástico')
const set = resumoBaixasEscritorio(regsD, { mes: '2026-09' })
t('setembro: a parte sem pesagem é contada', [set.totais.itens, set.totais.semPesagem], [2, 1])

export default resultado('controle-entrega')
