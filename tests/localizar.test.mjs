// LOCALIZAR — a busca de "onde está este pedido".
//
// As invariantes que quebram em silêncio aqui:
//  - o pedido totalmente ENTREGUE some de `pedidos`: se a busca só olhasse essa
//    coleção, responderia "não encontrado" para o pedido que acabou de sair —
//    que é exatamente o caso que evita carregar de novo o que já foi;
//  - a conta de "o que está livre para carregar" tem que ser a MESMA da aba
//    Entregas, senão uma tela manda carregar o que a outra já deu por carregado;
//  - o RETORNO de um pedido que voltou no caminhão precisa soltar o volume sem
//    reescrever a viagem (o romaneio impresso já diz que ele foi).
import {
  buscaGlobal, paradasDoItem, localizacaoDoPedido, resumoLocalizacao,
  comprometimentoDeCargas, volumesLivresDoPedido, situacaoEntrega,
  cargasDoPedido, planosDoPedido, ondeProcurar, indexaEntreguesPorPedido, ordemEtapaLocal,
  STATUS_CARGA, STATUS_PLANO, chaveCarga, itensParaCarga, keyDoItem,
} from '../src/utils.js'
import { pedido, k, ok, t, resultado } from './_harness.mjs'

// ---------- onde cada item está ----------
// Produção parcial: 60 na montagem, 40 ainda no silk. Devolver UMA etapa
// mandaria a expedição procurar no posto errado a metade que já está pronta.
const dividido = pedido({
  id: '5257', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'PRODUCAO' }],
  etapas: { 0: { montagem: 60 } },
})
const par = paradasDoItem(dividido, 0, '2026-08-24T12:00:00.000Z')
t('item dividido aparece nas DUAS etapas', par.map((x) => [x.etapa, x.qtd]),
  [['PRODUCAO', 40], ['montagem', 60]])

const soLinha = pedido({
  id: '5001', itens: [{ produto: 'SACOLA PLAST', qtd: 50, linha: 'GRAFICA' }],
})
t('sem nada avançado, tudo está na linha do item',
  paradasDoItem(soLinha, 0).map((x) => x.etapa), ['GRAFICA'])

// item sem linha definida ainda: a parada é a TRIAGEM, não "etapa vazia" —
// pedido que ninguém classificou está no escritório, e é lá que se procura
const semLinha = pedido({ id: '5002', itens: [{ produto: 'ETIQUETA', qtd: 10 }] })
semLinha.linhasItens = {}
semLinha.status = ''   // `linhaDoItem` cai no status do pedido quando o mapa não tem
t('item sem classificação cai em triagem',
  paradasDoItem(semLinha, 0).map((x) => x.etapa), ['triagem'])

// ---------- o POSTO, não a etapa ----------
// A montagem é um campo só no banco e três postos no chão de fábrica.
const cadItens = [
  { produto: 'SACOLA PAPEL P02', tipo: 'papel' },
  { produto: 'SACOLA PLAST 40', tipo: 'plastico' },
]
t('montagem quebra por material', ondeProcurar('montagem', 'papel'), 'Montagem Papel')
t('montagem de plástico é outro posto', ondeProcurar('montagem', 'plastico'), 'Montagem Plástico')
t('material que o cadastro não conhece não é escondido',
  ondeProcurar('montagem', ''), 'Montagem (material não cadastrado)')
t('"expedido" é a prateleira do galpão, não uma etapa',
  ondeProcurar('expedido'), 'Pronto no galpão')

const misto = pedido({
  id: '5300',
  itens: [
    { produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' },
    { produto: 'SACOLA PLAST 40', qtd: 50, linha: 'PRODUCAO' },
  ],
  etapas: { 0: { montagem: 100 }, 1: { montagem: 50 } },
})
const res = resumoLocalizacao(localizacaoDoPedido(misto, cadItens))
t('mesmo "montagem" no banco, dois postos na tela',
  res.map((g) => [g.onde, g.itens]), [['Montagem Papel', 1], ['Montagem Plástico', 1]])

// ---------- o que está livre para carregar ----------
// Um item embalado em 2 volumes, ambos expedidos.
const comVolume = pedido({
  id: '5400', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' }],
  etapas: {
    0: {
      montagem: 0, produzido: 100,
      volumes: [{ id: 'v1', qtd: 50, et: 'expedido' }, { id: 'v2', qtd: 50, et: 'expedido' }],
    },
  },
})
t('dois volumes prontos, nenhuma carga: os dois estão livres',
  volumesLivresDoPedido(comVolume, comprometimentoDeCargas([])).length, 2)

const doVolume = itensParaCarga(comVolume)
const cargaSaiu = {
  id: 'c1', numero: 12, status: STATUS_CARGA.SAIU, motorista: 'JUNINHO',
  pedidos: ['5400'], itens: [{ ...doVolume[0], conferido: true }],
}
t('volume numa carga que saiu não entra noutra viagem',
  volumesLivresDoPedido(comVolume, comprometimentoDeCargas([cargaSaiu])).map((v) => v.volumeId),
  ['v2'])

// ⚠️ o RETORNO é o que solta o volume — e sem reescrever a viagem: a carga
// continua com o item na lista, porque ela realmente o levou.
const voltouParcial = { ...cargaSaiu, retornados: [{ idVenda: '5400', em: '2026-08-24T10:00:00.000Z', por: 'Raoni' }] }
t('pedido que voltou no caminhão solta os volumes',
  volumesLivresDoPedido(comVolume, comprometimentoDeCargas([voltouParcial])).length, 2)
t('e a viagem CONTINUA registrando que o levou',
  (voltouParcial.itens || []).length, 1)

// carga cancelada/concluída nunca prendeu nada
t('carga cancelada não prende volume',
  volumesLivresDoPedido(comVolume,
    comprometimentoDeCargas([{ ...cargaSaiu, status: STATUS_CARGA.CANCELADA }])).length, 2)

// legado sem volume: a conta é por QUANTIDADE (expediram 40, depois mais 60)
const legado = pedido({
  id: '5500', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' }],
  etapas: { 0: { expedido: 100 } },
})
const itLeg = itensParaCarga(legado)[0]
const cargaLeg = {
  id: 'c2', numero: 13, status: STATUS_CARGA.SAIU, pedidos: ['5500'],
  itens: [{ ...itLeg, qtd: 40 }],
}
t('legado: sobra o que ainda não foi em carga nenhuma',
  volumesLivresDoPedido(legado, comprometimentoDeCargas([cargaLeg])).map((x) => x.qtd), [60])

// ---------- a situação de entrega ----------
t('pronto e sem previsão: aparece na lista de Entregas',
  situacaoEntrega(comVolume, { cargas: [], planos: [] }).naListaDeEntregas, true)

const planoAberto = { id: 'p1', numero: 15, status: STATUS_PLANO.ABERTO, dataEntrega: '2026-08-25', pedidos: ['5400'] }
const s1 = situacaoEntrega(comVolume, { cargas: [], planos: [planoAberto] })
t('reservado numa previsão aberta sai da lista de prontos', s1.naListaDeEntregas, false)
t('…e a previsão é NOMEADA, para a pessoa saber onde ele está', s1.planosAbertos.length, 1)

t('previsão encerrada não reserva mais nada',
  planosDoPedido([{ ...planoAberto, status: STATUS_PLANO.ENCERRADA }], '5400').length, 0)

// ⚠️ com UM volume na viagem e outro parado, o pedido CONTINUA na lista de
// Entregas — com o volume que ficou. É o caso real: expediram 50, foram; os
// outros 50 podem ir na viagem seguinte.
const s2a = situacaoEntrega(comVolume, { cargas: [cargaSaiu], planos: [] })
t('viagem levou metade: o resto continua disponível',
  [s2a.naListaDeEntregas, s2a.volumesLivres], [true, 1])

// levando TUDO, aí sim ele some da lista — e é este o estado que trava o pedido
// que voltou no caminhão sem ser entregue
const cargaCheia = { ...cargaSaiu, itens: doVolume.map((it) => ({ ...it, conferido: true })) }
const s2 = situacaoEntrega(comVolume, { cargas: [cargaCheia], planos: [] })
t('preso numa viagem que saiu: some da lista e a viagem é nomeada',
  [s2.naListaDeEntregas, s2.cargasVivas.length], [false, 1])
const cargaVoltou = { ...cargaCheia, retornados: [{ idVenda: '5400', em: '2026-08-24T10:00:00.000Z', por: 'Raoni' }] }
const s3 = situacaoEntrega(comVolume, { cargas: [cargaVoltou], planos: [] })
t('depois do retorno ele volta para a lista de Entregas', s3.naListaDeEntregas, true)
t('e a viagem passa a ser só histórico', s3.cargasAntigas.length, 1)

// ---------- a busca em si ----------
const vivos = [
  { ...pedido({ id: '5257', cliente: 'NAIRA CRUZ', itens: [{ produto: 'SACOLA PAPEL TAM MINI', qtd: 1500, linha: 'GRAFICA' }] }) },
  { ...pedido({ id: '5111', cliente: 'LUX BEACH WEAR', itens: [{ produto: 'SACOLA PLAST 40', qtd: 200, linha: 'PRODUCAO' }] }) },
]
// pedido entregue por inteiro: SÓ existe como remessa
const remessas = [
  { id: '5090-1', idVenda: '5090', cliente: 'ATUAL MODAS', remessa: 1, motorista: 'JUNINHO',
    entregueEm: '2026-08-12T10:00:00.000Z', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 300 }] },
]

const b1 = buscaGlobal('5090', { pedidos: vivos, entregues: remessas })
t('pedido que já saiu de `pedidos` continua achável', b1.total, 1)
t('…e vem sem pedido vivo, só com a remessa',
  [b1.itens[0].p, b1.itens[0].remessas.length], [null, 1])

t('número casa por pedaço exato: 5111 não traz 5118',
  buscaGlobal('5118', { pedidos: vivos, entregues: remessas }).total, 0)
t('nome parecido acha (é a mesma busca do resto do sistema)',
  buscaGlobal('beachwear', { pedidos: vivos, entregues: remessas }).total, 1)
t('acha pelo PRODUTO também', buscaGlobal('TAM MINI', { pedidos: vivos, entregues: remessas }).total, 1)
t('uma letra não vira busca (traria tudo)',
  buscaGlobal('5', { pedidos: vivos, entregues: remessas }).curto, true)
t('busca vazia não devolve nada', buscaGlobal('', { pedidos: vivos, entregues: remessas }).total, 0)

// o número digitado INTEIRO vem primeiro: é quase sempre o que se procura
const b2 = buscaGlobal('511', { pedidos: [...vivos, { ...pedido({ id: '511', cliente: 'X' }) }], entregues: [] })
t('o número exato encabeça a lista', b2.itens[0].idVenda, '511')

// corte visível: lista truncada em silêncio passa por lista completa
const muitos = Array.from({ length: 40 }, (_, i) => pedido({ id: `6${100 + i}`, cliente: 'LOJA TESTE' }))
const b3 = buscaGlobal('LOJA TESTE', { pedidos: muitos, entregues: [], limite: 30 })
t('o corte é declarado, não silencioso', [b3.total, b3.itens.length, b3.cortado], [40, 30, 10])

// duas remessas do mesmo pedido são UM resultado, não dois
const duas = [
  { id: '5091-1', idVenda: '5091', cliente: 'LOJA A', remessa: 1, itens: [] },
  { id: '5091-2', idVenda: '5091', cliente: 'LOJA A', remessa: 2, itens: [] },
]
t('remessas do mesmo pedido se juntam num resultado só',
  buscaGlobal('5091', { pedidos: [], entregues: duas }).total, 1)
t('e vêm na ordem da remessa',
  indexaEntreguesPorPedido(duas).get('5091').map((x) => x.remessa), [1, 2])

// ⚠️ a ordem de leitura NÃO pode sair de `posNoFluxo`: ele devolve 0 para as
// três linhas, para 'triagem' E para 'entregue', então o que já saiu apareceria
// antes da montagem — a folha diria que a fila está antes do fim dela.
t('a ordem é a do fluxo, com triagem no começo e entregue no fim',
  ['entregue', 'montagem', 'triagem', 'GRAFICA', 'expedido']
    .sort((a, b) => ordemEtapaLocal(a) - ordemEtapaLocal(b)),
  ['triagem', 'GRAFICA', 'montagem', 'expedido', 'entregue'])

export default resultado('localizar')
