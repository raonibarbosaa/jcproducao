// RELÓGIO DA FILA — base da estatística de produção.
import {
  carimbaTempos, tempoNaEtapa, desdeNaEtapa, idadeDoItem, idadeDoPedido,
  fmtDuracao, diasDe, mapaEtapasComQtd, mapaEtapasMovendoVolumes, mapaEtapasCom,
  fechaMontagemEmVolumes,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k, MS_DIA } from './_harness.mjs'

const T0 = '2026-08-01T08:00:00.000Z'
const T1 = '2026-08-04T08:00:00.000Z'   // +3 dias
const T2 = '2026-08-06T08:00:00.000Z'   // +2 dias

const um = (etapas = {}, extra = {}) => pedido({
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' }],
  etapas: { 0: etapas }, importadoEm: T0, ...extra,
})

// ---------- entrar e sair de etapa ----------
const p0 = um()
const m1 = carimbaTempos(p0, { [k(p0)]: { montagem: 100 } }, T1)
t('ao ENTRAR na montagem, carimba a hora', m1[k(p0)].desde.montagem, T1)
t('e fecha a gráfica com os 3 dias que ela esperou', m1[k(p0)].tempos.GRAFICA, 3 * MS_DIA)
t('a gráfica deixa de ter relógio aberto', m1[k(p0)].desde.GRAFICA, undefined)

const p1 = { ...p0, etapas: m1 }
const m2 = carimbaTempos(p1, { [k(p0)]: { ...m1[k(p0)], montagem: 0, expedicao: 100 } }, T2)
t('a montagem fecha com 2 dias', m2[k(p0)].tempos.montagem, 2 * MS_DIA)
t('e a gráfica não é recontada', m2[k(p0)].tempos.GRAFICA, 3 * MS_DIA)

// ---------- ⚠️ O CASO QUE EXIGE RELÓGIO POR ETAPA ----------
const parcial = carimbaTempos(p0, { [k(p0)]: { montagem: 40 } }, T1)
t('item DIVIDIDO: as duas etapas têm relógio ao mesmo tempo',
  [parcial[k(p0)].desde.GRAFICA, parcial[k(p0)].desde.montagem], [T0, T1])
t('a gráfica NÃO fecha, porque ainda tem 60 lá', parcial[k(p0)].tempos.GRAFICA, undefined)

// ⚠️ E não pode REINICIAR: os 60 que ficaram não acabaram de chegar
t('O QUE ISSO PROTEGE: a etapa que continua cheia preserva o início',
  parcial[k(p0)].desde.GRAFICA, T0)

// ---------- legado: sem carimbo, aproxima em vez de zerar ----------
const legado = um({ montagem: 100, em: T1 })
t('cai na última movimentação', desdeNaEtapa(legado, 0, 'montagem'), T1)
t('e o tempo sai aproximado, não zero', tempoNaEtapa(legado, 0, 'montagem', T2), 2 * MS_DIA)
t('sem etapa nenhuma, começa na importação', desdeNaEtapa(um(), 0, 'GRAFICA'), T0)

// ---------- idade ----------
t('a idade do item conta desde a IMPORTAÇÃO (inclui a triagem)', idadeDoItem(um(), 0, T1), 3 * MS_DIA)
t('a do pedido é a do item mais antigo em produção', idadeDoPedido(um(), T1), 3 * MS_DIA)
t('pedido sem nada em produção não "espera"', idadeDoPedido(um({ entregue: 100 }), T1), null)

// ---------- formatação ----------
t('dias e horas', fmtDuracao(3 * MS_DIA + 4 * 3600000), '3d 4h')
t('horas e minutos', fmtDuracao(5 * 3600000 + 20 * 60000), '5h 20min')
t('menos de um minuto', fmtDuracao(30000), 'agora')
t('nulo não quebra', fmtDuracao(null), '—')
t('dias inteiros', [diasDe(3 * MS_DIA + 4 * 3600000), diasDe(null)], [3, null])

// ---------- o carimbo entra pelo caminho normal ----------
const viaMapa = mapaEtapasComQtd(um(), [{ idx: 0, de: 'GRAFICA', para: 'montagem', qtd: 100 }], 'Ana')
ok('mapaEtapasComQtd devolve o mapa JÁ com relógio', !!viaMapa[k(um())].desde.montagem)



// ---------- ⚠️ MOVER NÃO PODE ZERAR O RELÓGIO (bug de 07/10/2026) ----------
// Os construtores remontam a entrada sem `desde`/`tempos`; o carimbo tem que
// vir da entrada ANTIGA. Antes, mover UM item zerava o relógio dele E o dos
// vizinhos do mesmo pedido — a estatística de fila saía subnotificada em todo
// pedido com 2+ itens.
const dois = (etapas) => pedido({
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' }, { produto: 'SACOLA PLASTICA 30X40', qtd: 50, linha: 'PRODUCAO' }],
  etapas, importadoEm: T0,
})
const comRelogio = dois({
  0: { montagem: 100, desde: { montagem: T1 }, tempos: { GRAFICA: 3 * MS_DIA } },
  1: { montagem: 50, desde: { montagem: T1 }, tempos: { PRODUCAO: MS_DIA } },
})
// (a) por QUANTIDADE: move o item 1, o item 0 fica
const q = mapaEtapasComQtd(comRelogio, [{ idx: 1, de: 'montagem', para: 'expedicao', qtd: 50 }], 'Ana')
t('vizinho congelado mantém o desde', q[k(comRelogio, 0)].desde.montagem, T1)
t('vizinho congelado mantém o tempos', q[k(comRelogio, 0)].tempos.GRAFICA, 3 * MS_DIA)
t('o MOVIDO mantém o tempos acumulado da linha', q[k(comRelogio, 1)].tempos.PRODUCAO, MS_DIA)
ok('e fecha a montagem com o tempo real (desde T1), não zero', q[k(comRelogio, 1)].tempos.montagem > 0)
// (b) por VOLUME
const emb = dois({
  0: { montagem: 0, produzido: 100, volumes: [{ id: 'a', qtd: 98, et: 'expedicao' }], desde: { expedicao: T1 }, tempos: { GRAFICA: 2 * MS_DIA, montagem: MS_DIA } },
  1: { montagem: 50, desde: { montagem: T1 }, tempos: { PRODUCAO: MS_DIA } },
})
const v = mapaEtapasMovendoVolumes(emb, [{ idx: 0, ids: ['a'], para: 'expedido' }], 'Ana')
t('volume movido: tempos da gráfica e da montagem continuam', [v[k(emb, 0)].tempos.GRAFICA, v[k(emb, 0)].tempos.montagem], [2 * MS_DIA, MS_DIA])
t('vizinho do volume mantém o desde', v[k(emb, 1)].desde.montagem, T1)
// (c) mapaEtapasCom (destino inteiro)
const c = mapaEtapasCom(comRelogio, [1], 'expedicao', 'Ana')
t('mapaEtapasCom: vizinho mantém tempos', c[k(comRelogio, 0)].tempos.GRAFICA, 3 * MS_DIA)
// (d) fechar a montagem em volumes (entrada; quem carimba é a tela, no mapa)
const fechado = fechaMontagemEmVolumes(comRelogio, 0, [{ qtd: 99 }], 100, 'Ana')
const mapaFechado = carimbaTempos(comRelogio, { ...comRelogio.etapas, [k(comRelogio, 0)]: fechado }, T2)
t('fechar a montagem preserva o tempos da gráfica', mapaFechado[k(comRelogio, 0)].tempos.GRAFICA, 3 * MS_DIA)
t('e fecha a montagem com os 2 dias (T1→T2)', mapaFechado[k(comRelogio, 0)].tempos.montagem, 2 * MS_DIA)

export default resultado('relogio')
