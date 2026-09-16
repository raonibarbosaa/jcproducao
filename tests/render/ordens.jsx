import { renderToString } from 'react-dom/server'
import OF, { GrupoEspera, CardOF, HistoricoOF, FichaOF } from '../../src/pages/OrdensFabricacao.jsx'
import { itensAguardandoOF, agrupaParaOF, docOF, situacaoDaOF, carimbaKeys } from '../../src/utils.js'

const PL = 'SACOLA PLASTICA 30X40'
const ped = (id, cliente, qtd, previsao, cores) => {
  const p = carimbaKeys({ idVenda: id, cliente, cidade: 'ITABAIANA', vendedor: 'SERGIO', rota: 'ROTA 01',
    status: 'PRODUCAO', previsao, itens: [{ produto: PL, qtd }] })
  p.linhasItens = { [p.itens[0].key]: 'PRODUCAO' }
  p.cores = { [p.itens[0].key]: cores }
  return p
}
const pedidos = [
  ped('10', 'ANA MODAS', 10, '2026-09-20', ['preto']),
  ped('11', 'BIA CALCADOS', 6, '2026-09-18', ['preto']),
  ped('12', 'CAIO', 3, '2026-09-19', ['dourado', 'preto']),
]
const CAD = [{ produto: PL, tipo: 'plastico', unidade: 'kg' }]
const grupos = agrupaParaOF(itensAguardandoOF(pedidos, CAD, new Set()))
const g = grupos.find((x) => x.cores.length === 1)
const o = { id: 'o1', ...docOF({ numero: 12, grupo: g, escolhidos: g.itens, quem: { nome: 'Dono', uid: 'd' } }) }
const porId = Object.fromEntries(pedidos.map((p) => [p.idVenda, p]))
const cancelada = { ...o, id: 'o2', numero: 13, status: 'cancelada', motivo: 'cliente desistiu',
  canceladaPor: 'Dono', canceladaEm: '2026-09-16T12:00:00.000Z' }
const nada = () => {}

export function roda() {
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  try {
    return {
      ofCasca: renderToString(<OF pedidos={pedidos} />),
      ofGrupo: renderToString(<GrupoEspera g={g} clientes={[]} onSoltar={nada} abertoInicial />),
      ofCard: renderToString(<CardOF o={o} s={situacaoDaOF(o, porId)} clientes={[]} onFicha={nada} onCancelar={nada} abertoInicial />),
      ofHist: renderToString(<HistoricoOF lista={[{ o: cancelada, s: situacaoDaOF(cancelada, porId) }]} onFicha={nada} />),
      ofFicha: renderToString(<FichaOF o={o} s={situacaoDaOF(o, porId)} clientes={[]} />),
    }
  } finally { globalThis.__auth = undefined }
}
