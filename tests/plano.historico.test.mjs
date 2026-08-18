// A PREVISÃO NÃO É MAIS APAGADA — e é isso que impede o número de se repetir.
// Antes, excluir fazia deleteDoc: `proximoNumeroPlano` é maior+1 sobre o que
// existe, então apagar a #15 (a mais alta) fazia a próxima nascer #15 de novo, e
// o histórico ficava com duas viagens diferentes com o mesmo número.
import {
  STATUS_PLANO, proximoNumeroPlano, planosAbertos, planosFechados, pedidosEmPlanos,
  statusDoPlano, nomeStatusPlano, fechamentoDoPlano, rotuloCarga, agrupaRomaneioPorRota,
  cargasEmMontagem, cargaAberta, CARGA_SEGURA_ITENS,
} from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

const plano = (numero, extra = {}) => ({
  id: `p${numero}`, numero, status: STATUS_PLANO.ABERTO, pedidos: [], cargas: [], ...extra,
})

// ---------- o número queimado ----------
const antes = [plano(13), plano(14), plano(15)]
t('próximo número com tudo aberto', proximoNumeroPlano(antes), 16)
const excluida = antes.map((p) => (p.numero === 15
  ? { ...p, status: STATUS_PLANO.EXCLUIDA } : p))
t('excluir NÃO libera o número', proximoNumeroPlano(excluida), 16)
t('apagar de verdade liberaria (o bug antigo)',
  proximoNumeroPlano(antes.filter((p) => p.numero !== 15)), 15)

// ---------- pedidos voltam a ficar livres ----------
const comPedidos = [plano(20, { pedidos: ['5001', '5002'] })]
t('previsão aberta reserva os pedidos', pedidosEmPlanos(comPedidos).size, 2)
const apos = comPedidos.map((p) => ({ ...p, status: STATUS_PLANO.EXCLUIDA }))
t('excluída solta os pedidos', pedidosEmPlanos(apos).size, 0)
t('e sai da lista de abertas', planosAbertos(apos).length, 0)
t('mas continua no histórico', planosFechados(apos).length, 1)

// ---------- legado ----------
t('o status antigo `encerrado` continua legível',
  statusDoPlano({ status: 'encerrado' }), STATUS_PLANO.ENCERRADA)
t('previsão sem status é aberta', statusDoPlano({}), STATUS_PLANO.ABERTO)
ok('e o nome sai traduzido', nomeStatusPlano({ status: 'encerrado' }).includes('encerrada'))
t('quem fechou sai do campo antigo também',
  fechamentoDoPlano({ status: 'encerrado', encerradoPor: 'Ana' }).por, 'Ana')
t('excluída diz quem excluiu',
  fechamentoDoPlano({ status: STATUS_PLANO.EXCLUIDA, excluidaPor: 'Raoni' }).por, 'Raoni')

// ---------- o número que o motorista lê ----------
t('viagem única herda o número da previsão',
  rotuloCarga({ numero: 7, planoNumero: 15, viagem: 1 }), '#15')
t('segunda viagem da mesma previsão',
  rotuloCarga({ numero: 8, planoNumero: 15, viagem: 2 }), '#15-2')
t('carga antiga (sem previsão) mantém o número próprio',
  rotuloCarga({ numero: 4 }), '#4')

// ---------- romaneio por rota ----------
// ⚠️ rota de mesmo NOME de vendedores diferentes não é a mesma rota
const cad = [
  { nome: 'Elaine', rotas: [{ nome: 'ROTA 01' }, { nome: 'ROTA 02' }] },
  { nome: 'Willy', rotas: [{ nome: 'ROTA 01' }] },
]
const g = (idVenda, rota, vendedor, cidade, itens = 1) => ({
  idVenda, p: { rota, vendedor, cidade }, itens: Array.from({ length: itens }, (_, i) => ({ i })),
})
const blocos = agrupaRomaneioPorRota([
  g('1', 'ROTA 02', 'Elaine', 'ESTANCIA'),
  g('2', 'ROTA 01', 'Elaine', 'LAGARTO', 3),
  g('3', 'ROTA 01', 'Willy', 'ARACAJU'),
  g('4', 'ROTA 01', 'Elaine', 'ITABAIANINHA'),
], cad)
t('um bloco por rota × vendedor', blocos.length, 3)
t('a ROTA 01 da Elaine vem antes da ROTA 02 dela', blocos[0].rota, 'ROTA 01')
t('e junta as paradas dela', blocos[0].paradas.length, 2)
t('somando os volumes do bloco', blocos[0].volumes, 4)
ok('com as cidades do bloco à vista',
  blocos[0].cidades.includes('LAGARTO') && blocos[0].cidades.includes('ITABAIANINHA'))
ok('rota homônima de outro vendedor fica separada',
  blocos.filter((b) => b.rota === 'ROTA 01').length === 2)

// ---------- mais de uma carga em montagem ----------
// A trava de "uma por vez" existia para a segunda não nascer escondida atrás da
// conferência da primeira — o que se resolve MOSTRANDO as duas. Travar a
// liberação parava o planejamento inteiro por causa de uma carga esquecida.
const cargas = [
  { id: 'c1', numero: 5, status: 'montando', criadaEm: '2026-08-18T10:00:00Z' },
  { id: 'c2', numero: 6, status: 'montando', criadaEm: '2026-08-18T14:00:00Z' },
  { id: 'c3', numero: 4, status: 'saiu', criadaEm: '2026-08-17T09:00:00Z' },
  { id: 'c4', numero: 3, status: 'cancelada', criadaEm: '2026-08-16T09:00:00Z' },
]
t('as duas em montagem aparecem', cargasEmMontagem(cargas).length, 2)
t('na ordem em que nasceram', cargasEmMontagem(cargas)[0].id, 'c1')
t('e a primeira continua sendo a "atual" por padrão', cargaAberta(cargas).id, 'c1')
// ⚠️ o que impede volume repetido não é a trava, é o comprometimento: carga que
// está montando E carga que já saiu seguram item; cancelada e concluída soltam
ok('montando prende item', CARGA_SEGURA_ITENS('montando'))
ok('que já saiu também', CARGA_SEGURA_ITENS('saiu'))
ok('cancelada solta', !CARGA_SEGURA_ITENS('cancelada'))
ok('concluída solta', !CARGA_SEGURA_ITENS('concluida'))

export default resultado('plano-historico')
