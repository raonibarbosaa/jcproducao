// O ID DO DOCUMENTO GANHA DO CAMPO `id` GRAVADO DENTRO DELE.
// Bug real (18/08/2026): a remessa em `entregues` nasce de um `...pedido` que já
// carrega o `id` do doc de `pedidos`. Lido com `{ id: d.id, ...d.data() }`, o
// campo vencia e `p.id` virava "5001" num documento chamado "5001-1" — cancelar
// a entrega apagava `entregues/5001`, que não existe. O Firestore não reclama de
// apagar o que não há: a quantidade voltava para o pedido, o registro ficava, e
// cancelar duas vezes devolveria a quantidade duas vezes.
import { doDoc } from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

// imita o snapshot do Firestore
const snap = (id, dados) => ({ id, data: () => dados })

t('o id do doc vence o campo gravado',
  doDoc(snap('5001-1', { id: '5001', idVenda: '5001', remessa: 1 })).id, '5001-1')
t('sem campo `id` continua valendo o do doc',
  doDoc(snap('5001-1', { idVenda: '5001' })).id, '5001-1')
t('o resto dos dados passa inteiro',
  doDoc(snap('5001-1', { id: '5001', idVenda: '5001' })).idVenda, '5001')

// a ordem ERRADA (a intuitiva) — fica aqui como lembrete do que não fazer
const errado = (d) => ({ id: d.id, ...d.data() })
ok('a ordem invertida realmente perde o id do documento',
  errado(snap('5001-1', { id: '5001' })).id === '5001')

// duas remessas do mesmo pedido precisam de chaves DIFERENTES: com a mesma
// `key` o React reaproveita o card e desenha pedido trocado na tela
const remessas = [
  snap('5001-1', { id: '5001', idVenda: '5001', remessa: 1 }),
  snap('5001-2', { id: '5001', idVenda: '5001', remessa: 2 }),
].map(doDoc)
t('duas remessas, dois ids', new Set(remessas.map((r) => r.id)).size, 2)

export default resultado('doc-id')
