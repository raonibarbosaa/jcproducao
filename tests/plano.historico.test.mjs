// A PREVISÃO NÃO É MAIS APAGADA — e é isso que impede o número de se repetir.
// Antes, excluir fazia deleteDoc: `proximoNumeroPlano` é maior+1 sobre o que
// existe, então apagar a #15 (a mais alta) fazia a próxima nascer #15 de novo, e
// o histórico ficava com duas viagens diferentes com o mesmo número.
import {
  STATUS_PLANO, proximoNumeroPlano, planosAbertos, planosFechados, pedidosEmPlanos,
  statusDoPlano, nomeStatusPlano, fechamentoDoPlano, rotuloCarga, agrupaRomaneioPorRota,
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

export default resultado('plano-historico')
