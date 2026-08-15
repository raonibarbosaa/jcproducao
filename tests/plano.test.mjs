// PLANO DE ENTREGA — a previsão da viagem (guarda pedidos; a carga guarda volumes).
import {
  STATUS_PLANO, proximoNumeroPlano, planosAbertos, pedidosEmPlanos,
  pendenciasDoPedido, situacaoNoPlano, itensParaCarga, rotasDoVendedor, ordemRota,
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

export default resultado('plano')
