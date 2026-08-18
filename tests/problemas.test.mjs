// O aviso de erro — e em especial o "já foi entregue", que é o VENDEDOR dizendo
// que a mercadoria já está com o cliente e o pedido continua na produção.
// O que se protege aqui: o aviso do pedido inteiro tem que aparecer em TODOS os
// itens (é o pedido que está errado, não um produto), e a data da entrega não
// pode virar campo vazio num tipo de erro que não a usa — campo vazio depois
// ninguém sabe se quer dizer "não sei" ou "não se aplica".
import {
  docProblema, ehErroEntrega, nomeCampoErro, CAMPOS_ERRO,
  indexaProblemas, problemasDoPedido, problemaDoItem,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const p = pedido({
  id: '5276',
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500 }, { produto: 'ETIQUETA', qtd: 1000 }],
})
const quem = { porUid: 'u1', porNome: 'Michele', porEmail: 'm@x.com', perfil: 'vendedor', ip: '1.2.3.4' }

// ---------- o tipo novo ----------
ok('"já foi entregue" existe em CAMPOS_ERRO', CAMPOS_ERRO.some((c) => c.id === 'entregue'))
ok('e é reconhecido como aviso de entrega', ehErroEntrega('entregue'))
ok('os outros tipos NÃO são', !ehErroEntrega('quantidade') && !ehErroEntrega('outro'))
ok('nome legível', nomeCampoErro('entregue').includes('entregue'))
ok('o "entregue" NÃO corrige nada sozinho',
  CAMPOS_ERRO.find((c) => c.id === 'entregue').corrige !== true)

// ---------- o documento ----------
const aviso = docProblema({
  p, idx: null, campo: 'entregue', entregueEm: '2026-08-12',
  entreguePor: 'levei eu mesmo', obs: 'cliente retirou no balcão', quem,
})
t('data e quem entregou vão para o doc',
  [aviso.entregueEm, aviso.entreguePor], ['2026-08-12', 'levei eu mesmo'])
t('sem item escolhido, o aviso é do PEDIDO inteiro', aviso.itemKey, '')
t('nasce aberto', aviso.status, 'aberto')
t('carrega vendedor e rota — é por vendedor que a regra do Firestore filtra',
  [aviso.vendedor, aviso.rota], ['Michele', 'ROTA 01'])
t('e quem assinou', aviso.porUid, 'u1')

const qtd = docProblema({ p, idx: 0, campo: 'quantidade', noSistema: '500 un', noPapel: '300 un', quem })
ok('erro de quantidade NÃO ganha campos de entrega vazios',
  !('entregueEm' in qtd) && !('entreguePor' in qtd))
t('e aponta o item certo', qtd.itemKey, k(p, 0))

// ---------- onde o aviso aparece ----------
const mapa = indexaProblemas([{ ...aviso, id: 'a1' }, { ...qtd, id: 'a2', status: 'resolvido' }])
t('resolvido some do mapa — o ⚠ é do que está em aberto',
  problemasDoPedido(mapa, '5276').map((x) => x.id), ['a1'])
t('O QUE ISSO PROTEGE: aviso do pedido inteiro acende em TODOS os itens',
  [problemaDoItem(mapa, '5276', k(p, 0)).length, problemaDoItem(mapa, '5276', k(p, 1)).length],
  [1, 1])
t('pedido sem aviso não inventa nada', problemasDoPedido(mapa, '9999'), [])

export default resultado('problemas')
