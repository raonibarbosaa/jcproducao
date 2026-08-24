// VOLUMES — o pacote físico. Depois da montagem o item anda por volume.
import {
  fechaMontagemEmVolumes, desfazEmbalagem, podeDesembalar, temVolumes,
  volumesDoItem, volumesNaEtapa, qtdEmVolumes, movePorVolume,
  mapaEtapasComQtd, mapaEtapasMovendoVolumes, distribuicaoDoItem, itensParaCarga,
  carimbaTempos, qtdNaEtapa, moveQtdItem,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const um = (etapas = {}) => pedido({
  itens: [{ produto: 'SACOLA PLASTICA 30X40', qtd: 100, linha: 'PRODUCAO' }], etapas: { 0: etapas },
})

// ---------- fechar a montagem cria os volumes ----------
// `em` de 3 dias atrás: é o que o relógio usa como início quando ainda não há
// carimbo próprio (todo item no dia em que o relógio entrou no ar)
const TRES_DIAS = new Date(Date.now() - 3 * 86400000).toISOString()
const base = um({ montagem: 100, em: TRES_DIAS })
// ⚠️ devolve a ENTRADA do item, não o mapa — é a tela que monta o mapa
const entrada = fechaMontagemEmVolumes(base, 0, [{ qtd: 48.2 }, { qtd: 50.1 }], 100, 'Ana')
const pf = { ...base, etapas: { [k(base)]: entrada } }

t('a SOMA dos volumes é a quantidade real produzida', qtdEmVolumes(pf, 0, 'expedicao'), 98.3)
t('`produzido` guarda as unidades PEDIDAS baixadas do lote', entrada.produzido, 100)
t('A QUEBRA DE PROCESSO é a diferença entre os dois',
  Math.round((entrada.produzido - qtdEmVolumes(pf, 0, 'expedicao')) * 10) / 10, 1.7)

// O BUG QUE ISSO PEGOU (15/08/2026): `fechaMontagemEmVolumes` estava envolvida
// por `carimbaTempos`, que espera um MAPA — carimbar uma entrada é no-op, e o
// tempo da montagem deixava de ser contado neste caminho, sem erro nenhum.
const comRelogio = carimbaTempos(base, { [k(base)]: entrada })
t('fechar a montagem ENCERRA o relógio dela, com os 3 dias que ela esperou',
  Math.round(comRelogio[k(base)].tempos.montagem / 86400000), 3)
ok('e ABRE o da expedição', !!comRelogio[k(base)].desde.expedicao)
ok('o item passa a ter volumes', temVolumes(pf, 0))
t('cada volume ganha número próprio', volumesDoItem(pf, 0).map((v) => v.n), [1, 2])

// ---------- ⚠️ o avanço por quantidade NÃO pode apagar os volumes ----------
const viaQtd = mapaEtapasComQtd(pf, [{ idx: 0, de: 'expedicao', para: 'expedido', qtd: 10 }], 'Ana')
ok('O QUE ISSO EVITA: perder o que a balança registrou',
  Array.isArray(viaQtd[k(base)].volumes) && viaQtd[k(base)].volumes.length === 2)

// ---------- mover por volume ----------
const ids = volumesNaEtapa(pf, 0, 'expedicao')
const movido = mapaEtapasMovendoVolumes(pf, [{ idx: 0, ids: [ids[0]], para: 'expedido' }], 'Ana')
const pm = { ...pf, etapas: movido }
t('um volume vai, o outro fica', [qtdEmVolumes(pm, 0, 'expedido'), qtdEmVolumes(pm, 0, 'expedicao')], [48.2, 50.1])
t('destino fora das etapas de volume é recusado', movePorVolume(pf, 0, ids, 'GRAFICA', 'Ana'), null)

// ---------- desembalar devolve a quantidade PEDIDA ----------
ok('dá para desembalar enquanto nada saiu', podeDesembalar(pf, 0))
// também devolve a ENTRADA — quem monta o mapa é quem chama
const pd = { ...pf, etapas: { [k(base)]: desfazEmbalagem(pf, 0, 'Ana') } }
t('O QUE ISSO PRESERVA: volta 100 (o pedido), não 98,3 (a soma dos volumes)',
  distribuicaoDoItem(pd, 0).montagem, 100)
ok('e os volumes deixam de existir', !temVolumes(pd, 0))

t('com volume JÁ expedido não desembala — não há resposta certa para "quanto volta"',
  podeDesembalar(pm, 0), false)
t('e a função recusa em vez de inventar', desfazEmbalagem(pm, 0, 'Ana'), null)

// ---------- carga: um registro por VOLUME ----------
const expedido = { ...pf, etapas: mapaEtapasMovendoVolumes(pf, [{ idx: 0, ids, para: 'expedido' }], 'Ana') }
const paraCarga = itensParaCarga(expedido)
t('cada volume é uma linha da carga', paraCarga.length, 2)
t('com o volume identificado, senão ele entraria em duas cargas',
  paraCarga.every((x) => !!x.volumeId), true)

// item legado (expedido antes de existir volume) entra como volume único
const legado = um({ expedido: 100 })
t('legado vira um volume só, sem id', itensParaCarga(legado).map((x) => [x.volumeId, x.qtd]), [['', 100]])


// ---------- ITEM MEIO EMBALADO: o resto do lote tem que continuar andando ----------
// Bug de produção (#5458, 24/08/2026): 227 de 500 fecharam em volume e foram
// expedidas; as 273 restantes continuavam na GRÁFICA. Clicar em
// "Concluir -> Montagem Papel" devolvia "Não dá para voltar: já há volume
// expedido ou entregue neste item" — a tela tratava QUALQUER destino 'montagem'
// como desembalar, sem olhar de ONDE o item vinha. E mesmo passando, o mapa
// preservava a entrada inteira por ela ter volumes: no-op silencioso.
const meio = pedido({
  id: '5458', itens: [{ produto: 'SACOLA PAPEL TAM. P02', qtd: 500, linha: 'GRAFICA' }],
  etapas: { 0: {
    montagem: 0, produzido: 227,
    volumes: [{ id: 'v1', qtd: 227, et: 'expedido' }],
  } },
})
t('o resto do lote está na linha, não sumiu',
  [qtdNaEtapa(meio, 0, 'GRAFICA'), qtdNaEtapa(meio, 0, 'expedido')], [273, 227])

const avancou = { ...meio, etapas: mapaEtapasComQtd(meio, [{ idx: 0, de: 'GRAFICA', para: 'montagem', qtd: 273 }], 'PATRICIA') }
t('as 273 avançam da gráfica para a montagem',
  [qtdNaEtapa(avancou, 0, 'GRAFICA'), qtdNaEtapa(avancou, 0, 'montagem')], [0, 273])
t('⚠️ e o volume já expedido continua intacto',
  [volumesDoItem(avancou, 0).length, qtdNaEtapa(avancou, 0, 'expedido')], [1, 227])
ok('o volume não mudou de etapa', volumesDoItem(avancou, 0)[0].et === 'expedido')

// e o caminho de volta pela quantidade também vale: montagem -> linha
const voltou = { ...avancou, etapas: mapaEtapasComQtd(avancou, [{ idx: 0, de: 'montagem', para: 'GRAFICA', qtd: 273 }], 'PATRICIA') }
t('e volta para a linha sem tocar no volume',
  [qtdNaEtapa(voltou, 0, 'GRAFICA'), qtdNaEtapa(voltou, 0, 'montagem'), qtdNaEtapa(voltou, 0, 'expedido')],
  [273, 0, 227])

// ⚠️ etapa de VOLUME continua fora do alcance da quantidade: ali quem anda é o
// volume, e mexer por quantidade apagaria o que a balança pesou.
t('mover por quantidade a partir de uma etapa de volume é recusado',
  moveQtdItem(meio, 0, 'expedido', 'expedicao', 227), null)
t('e para uma etapa de volume também',
  moveQtdItem(meio, 0, 'montagem', 'expedicao', 10), null)
const intacto = { ...meio, etapas: mapaEtapasComQtd(meio, [{ idx: 0, de: 'expedido', para: 'expedicao', qtd: 227 }], 'X') }
t('a entrada fica como estava quando o movimento é recusado',
  [volumesDoItem(intacto, 0).length, qtdNaEtapa(intacto, 0, 'expedido')], [1, 227])

export default resultado('volumes')
