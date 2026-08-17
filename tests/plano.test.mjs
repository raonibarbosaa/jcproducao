// PLANO DE ENTREGA — a previsão da viagem (guarda pedidos; a carga guarda volumes).
import {
  STATUS_PLANO, proximoNumeroPlano, planosAbertos, pedidosEmPlanos,
  pendenciasDoPedido, itensPendentesDoPedido, pendenciasPorEtapa,
  resumePendencias, SEM_MATERIAL,
  situacaoNoPlano, itensParaCarga, rotasDoVendedor, ordemRota,
  doPlano, entregaAte, diaDaPrevisao, rotuloPlano, planoPorData, agrupaPlanoPorRota,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const CAD = [{ produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un', pesoUnit: 0.01 }]

const tres = (etapas = {}) => pedido({
  itens: [
    { produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' },
    { produto: 'SACOLA PAPEL P03', qtd: 200, linha: 'GRAFICA' },
    { produto: 'SACOLA PAPEL P04', qtd: 300, linha: 'GRAFICA' },
  ],
  etapas,
})

t('numeração continua do maior', proximoNumeroPlano([{ numero: 2 }, { numero: 7 }]), 8)
t('plano sem status conta como ABERTO (não some da tela)',
  planosAbertos([{ id: 'a' }, { id: 'b', status: 'encerrado' }]).map((p) => p.id), ['a'])

// ⚠️ um pedido não pode estar em dois planos abertos
const planos = [
  { id: 'p1', numero: 1, pedidos: ['900', '901'], status: STATUS_PLANO.ABERTO },
  { id: 'p3', numero: 3, pedidos: ['903'], status: STATUS_PLANO.ENCERRADO },
]
const m = pedidosEmPlanos(planos)
t('O QUE ISSO EVITA: duas viagens contando com a mesma mercadoria', m.get('900')?.numero, 1)
t('plano encerrado não prende mais o pedido', m.has('903'), false)
t('o próprio plano não conta como conflito', pedidosEmPlanos(planos, 'p1').has('900'), false)

// ---------- onde o que falta está parado ----------
const misto = tres({ 0: { expedido: 100 }, 1: { montagem: 200 } })
t('O MOTIVO DA TELA EXISTIR: diz em que setor o que falta está',
  pendenciasDoPedido(misto), [
    { etapa: 'GRAFICA', nome: 'GRÁFICA', itens: 1 },
    { etapa: 'montagem', nome: 'Montagem', itens: 1 },
  ])
t('o item já expedido não aparece como pendência',
  pendenciasDoPedido(misto).some((x) => x.etapa === 'expedido'), false)
t('pedido intocado: tudo na linha, num grupo só',
  pendenciasDoPedido(tres()), [{ etapa: 'GRAFICA', nome: 'GRÁFICA', itens: 3 }])

// ---------- situação: pronto E devendo ao mesmo tempo ----------
const s = situacaoNoPlano(misto, itensParaCarga(misto), CAD)
t('conta os volumes prontos', s.volumes, 1)
ok('marca como carregável', s.pronto)
t('o peso vem do cadastro (100 × 0,01)', s.peso.kg, 1)
t('e ainda lista o que falta', s.pendencias.length, 2)

const nada = situacaoNoPlano(tres(), [], CAD)
t('sem volume livre não está pronto', nada.pronto, false)
t('mas continua no plano com a pendência visível', nada.pendencias.length, 1)

// ---------- rotas do seletor vêm do CADASTRO ----------
const VEND = [{ nome: 'X', rotas: [{ nome: 'SERTAO' }, { nome: 'AGRESTE' }] }]
t('POR QUE NÃO SAI DOS PEDIDOS: dá para programar rota cuja mercadoria ainda nem existe',
  rotasDoVendedor('X', VEND), ['SERTAO', 'AGRESTE'])
t('a ordem é a do cadastro (a sequência real da viagem), não alfabética',
  [ordemRota('X', 'SERTAO', VEND), ordemRota('X', 'AGRESTE', VEND)], [0, 1])
t('vendedor fora do cadastro não quebra', rotasDoVendedor('Fulano', VEND), [])

// ---------- a FOLHA DE PENDÊNCIAS que vai para o chão de fábrica ----------
// O resumo ("1 em Montagem") não serve para cobrar serviço: quem vai buscar
// precisa saber QUAL produto e QUANTO falta.
const det = itensPendentesDoPedido(misto)
t('detalha o produto pendente, não só a etapa',
  det.map((x) => [x.produto, x.qtd, x.etapa]),
  [['SACOLA PAPEL P04', 300, 'GRAFICA'], ['SACOLA PAPEL P03', 200, 'montagem']])
t('e o que já saiu continua fora da folha',
  det.some((x) => x.produto === 'SACOLA PAPEL P02'), false)

// A folha é por SETOR — quem cobra anda de posto em posto, não de pedido em pedido.
const outro = pedido({ id: '901', itens: [{ produto: 'ETIQUETA', qtd: 50, linha: 'PRODUCAO' }] })
const grupos = pendenciasPorEtapa([misto, outro])
t('agrupa os pedidos por etapa, na ordem do fluxo',
  grupos.map((g) => [g.etapa, g.itens.length]),
  [['PRODUCAO', 1], ['GRAFICA', 1], ['montagem', 1]])
t('cada linha carrega o pedido de origem (é o que se cobra na fábrica)',
  grupos[0].itens[0].p.idVenda, '901')
t('lista vazia não quebra a impressão', pendenciasPorEtapa([]), [])

// Dentro do setor, quem faz papel não é quem faz plástico.
const mistoMat = pedido({
  id: '902',
  itens: [
    { produto: 'SACOLA PLASTICA 30X40', qtd: 10, linha: 'PRODUCAO' },
    { produto: 'SACOLA PAPEL P02', qtd: 20, linha: 'PRODUCAO' },
    { produto: 'CAIXA XYZ', qtd: 30, linha: 'PRODUCAO' },
  ],
})
const [silk] = pendenciasPorEtapa([mistoMat])
t('quebra o setor por material, na ordem de MATERIAIS',
  silk.materiais.map((m) => [m.id, m.itens.length]),
  [['plastico', 1], ['papel', 1], ['', 1]])
t('material que o cadastro não conhece APARECE (trabalho invisível é o que atrasa)',
  silk.materiais.at(-1).nome, SEM_MATERIAL)
t('o cadastro manda no material inferido pelo nome',
  pendenciasPorEtapa([mistoMat], [{ produto: 'CAIXA XYZ', tipo: 'papel' }])[0]
    .materiais.map((m) => [m.id, m.itens.length]),
  [['plastico', 1], ['papel', 2]])
t('o resumo do card sai da MESMA lista que ele mostra',
  resumePendencias(itensPendentesDoPedido(mistoMat).filter((x) => x.material === 'papel')),
  [{ etapa: 'PRODUCAO', nome: 'SILK SCREEN', itens: 1 }])

// ---------- A PREVISÃO É DO DIA (antes era vendedor + rota) ----------
// data local, do jeito que o app grava (meia-noite local → ISO)
const emDia = (d) => new Date(d + 'T00:00:00').toISOString()
const comData = (id, d, resto = {}) => pedido({ id, previsao: d ? emDia(d) : null, ...resto })

t('o dia sai das partes LOCAIS (em UTC-3 o ISO cairia no dia anterior)',
  diaDaPrevisao(comData('1', '2026-08-20')), '2026-08-20')
t('pedido sem data não inventa dia', diaDaPrevisao(comData('1', null)), null)

const viagem = { dataEntrega: '2026-08-20', pedidos: [] }
t('O MOTIVO DA MUDANÇA: a viagem do dia 20 leva o ATRASADO do dia 05',
  doPlano(comData('1', '2026-08-05'), viagem), true)
t('leva o que vence no próprio dia', doPlano(comData('2', '2026-08-20'), viagem), true)
t('não leva o que só vence depois', doPlano(comData('3', '2026-09-03'), viagem), false)
t('pedido SEM data entra (sumir do planejamento é pior do que aparecer a mais)',
  doPlano(comData('4', null), viagem), true)
t('a viagem do dia atravessa vendedor',
  doPlano(comData('5', '2026-08-20', { vendedor: 'Outro', rota: 'ROTA 09' }), viagem), true)

// ⚠️ as previsões antigas (vendedor + rota, sem dataEntrega) NÃO mudam
const antiga = { vendedor: 'Michele', rota: 'ROTA 01', pedidos: [] }
t('previsão antiga continua casando por vendedor + rota',
  doPlano(comData('6', '2026-09-03'), antiga), true)
t('e continua recusando quem é de outra rota',
  doPlano(comData('7', '2026-08-20', { rota: 'ROTA 07' }), antiga), false)
t('e quem é de outro vendedor',
  doPlano(comData('8', '2026-08-20', { vendedor: 'Sérgio' }), antiga), false)
t('sem plano nenhum, ninguém pertence', doPlano(comData('9', '2026-08-20'), null), false)
t('o rótulo diz de que tipo é a previsão',
  [planoPorData(viagem), rotuloPlano(viagem), rotuloPlano(antiga)],
  [true, '📅 20/08/2026', '📍 ROTA 01 · Michele'])
t('sem data, `entregaAte` não filtra nada', entregaAte(comData('1', '2026-09-03'), ''), true)

// ⚠️ rota de mesmo nome em vendedores diferentes NÃO é fundida
const VEND2 = [
  { nome: 'GLAYCE', rotas: [{ nome: 'ROTA 02' }, { nome: 'ROTA 01' }] },
  { nome: 'Sérgio', rotas: [{ nome: 'ROTA 01' }] },
]
const gs = agrupaPlanoPorRota([
  comData('10', '2026-08-20', { vendedor: 'GLAYCE', rota: 'ROTA 02', cidade: 'TOBIAS BARRETO' }),
  comData('11', '2026-08-20', { vendedor: 'Sérgio', rota: 'ROTA 01', cidade: 'ARACAJU' }),
  comData('12', '2026-08-19', { vendedor: 'GLAYCE', rota: 'ROTA 02', cidade: 'RIO REAL' }),
  comData('13', '2026-08-20', { vendedor: 'GLAYCE', rota: 'ROTA 01', cidade: 'ITABAIANA' }),
], VEND2)
t('NÃO funde rota de mesmo nome de vendedores diferentes, e põe as duas LADO A LADO',
  gs.map((g) => [g.rota, g.vendedor, g.pedidos.length]),
  [['ROTA 01', 'Sérgio', 1], ['ROTA 01', 'GLAYCE', 1], ['ROTA 02', 'GLAYCE', 2]])
t('as cidades ficam à vista (é o que diz se a ROTA 01 dele é a mesma dela)',
  [gs[0].cidades, gs[1].cidades], [['ARACAJU'], ['ITABAIANA']])
t('mesmo nome, quem roda primeiro no cadastro vem antes', gs[0].vendedor, 'Sérgio')
t('dentro do grupo, a ordem é o prazo', gs[2].pedidos.map((p) => p.idVenda), ['12', '10'])

export default resultado('plano')
