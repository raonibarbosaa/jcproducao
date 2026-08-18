// ENTREGA PARCIAL DELIBERADA — segurar um item que JÁ está pronto.
// A carga já saía parcial sozinha (itensParaCarga só devolve o que está em
// `expedido`); o que faltava era o volante e a tela dizer a verdade.
import {
  situacaoNoPlano, volumesQueVao, itensSeguradosDoPlano, itemSegurado,
  chaveItemPlano, sobrouNoPedido, itensParaCarga,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const CAD = [{ produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un', pesoUnit: 0.01 }]

// pedido de 3 itens: o 1º pronto (expedido), o 2º na montagem, o 3º na linha
const tres = (etapas) => pedido({
  id: '5001',
  itens: [
    { produto: 'SACOLA PAPEL P02', qtd: 100 },
    { produto: 'SACOLA PLASTICA 30X40', qtd: 200 },
    { produto: 'ETIQUETA G', qtd: 50 },
  ],
  etapas,
})
const p = tres({ 0: { expedido: 100 }, 1: { montagem: 200 } })
const livres = itensParaCarga(p)
const chaveDoPrimeiro = k(p, 0)

// ---------- sem segurar nada: exatamente o comportamento de hoje ----------
const semNada = new Set()
t('previsão sem `itensFora` não segura nada', itensSeguradosDoPlano({}).size, 0)
t('e o que vai é tudo que está pronto', volumesQueVao(livres, '5001', semNada).length, livres.length)
const s0 = situacaoNoPlano(p, livres, CAD, semNada)
ok('o pedido está carregável', s0.pronto)
ok('MAS é PARCIAL: 2 itens continuam na produção', s0.parcial)
t('e a tela diz quantos itens estão prontos', `${s0.itensProntos} de ${s0.itensTotal}`, '1 de 3')

// ---------- segurando o item pronto ----------
const seg = itensSeguradosDoPlano({ itensFora: [chaveItemPlano('5001', chaveDoPrimeiro)] })
ok('o item aparece como segurado', itemSegurado(seg, '5001', chaveDoPrimeiro))
t('e some do que sobe no caminhão', volumesQueVao(livres, '5001', seg).length, 0)
const s1 = situacaoNoPlano(p, livres, CAD, seg)
t('o pedido deixa de estar pronto p/ esta viagem', s1.pronto, false)
t('o peso desconta o segurado', s1.peso.kg, 0)
t('e a tela conta o que ficou', s1.segurados, livres.length)

// ⚠️ segurar de OUTRO pedido não pode afetar este: a chave leva o idVenda
const doOutro = itensSeguradosDoPlano({ itensFora: [chaveItemPlano('9999', chaveDoPrimeiro)] })
t('chave é por pedido', volumesQueVao(livres, '5001', doOutro).length, livres.length)

// ---------- quem SAI da previsão depois de liberar ----------
// Antes o pedido saía inteiro assim que mandava qualquer coisa, levando junto os
// itens que continuavam na linha — e era preciso reincluir a cada entrega parcial.
ok('pedido com saldo na produção FICA na previsão', sobrouNoPedido(p, livres, semNada))
const soPronto = tres({ 0: { expedido: 100 }, 1: { expedido: 200 }, 2: { expedido: 50 } })
const livresTudo = itensParaCarga(soPronto)
t('pedido que mandou tudo SAI', sobrouNoPedido(soPronto, livresTudo, semNada), false)
ok('mas se um item foi segurado, ele fica',
  sobrouNoPedido(soPronto, livresTudo, itensSeguradosDoPlano({
    itensFora: [chaveItemPlano('5001', k(soPronto, 0))],
  })))

// ---------- pedido inteiro pronto e nada segurado NÃO é parcial ----------
const s2 = situacaoNoPlano(soPronto, livresTudo, CAD, semNada)
ok('tudo pronto = pronto de verdade', s2.pronto)
t('e não é parcial', s2.parcial, false)

export default resultado('parcial')
