import { renderToString } from 'react-dom/server'
import ControleEntrega, { CardControle, TabelaControle } from '../../src/pages/ControleEntrega.jsx'
import { carimbaKeys, keyDoItem, linhasControleEntrega, totaisDoControle, comprometimentoDeCargas } from '../../src/utils.js'

const CAD = [{ produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' }, { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' }]
const ped = (id, cliente, etapas, extra = {}) => {
  const p = carimbaKeys({ idVenda: id, cliente, cidade: 'ITABAIANA', vendedor: 'PAULO', rota: 'ROTA 02', valorTotal: 448,
    status: 'GRAFICA', previsao: '2026-10-10', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500 }, { produto: 'SACOLA PLASTICA 30X40', qtd: 20 }], ...extra })
  p.linhasItens = { [keyDoItem(p, 0)]: 'GRAFICA', [keyDoItem(p, 1)]: 'PRODUCAO' }
  p.etapas = Object.fromEntries(Object.entries(etapas || {}).map(([i, v]) => [keyDoItem(p, Number(i)), v]))
  return p
}
// na fábrica: papel metade na montagem, plástico no silk
const naFabrica = ped('5738', 'BETEK KIDS', { 0: { montagem: 200 } })
// pronto, baixado pelo escritório
const pronto = ped('6215', 'CREDIMOVEIS', { 0: { expedido: 500 }, 1: { expedido: 20 } },
  { baixaEscritorio: { em: '2026-10-07T12:00:00.000Z', por: 'Anny' } })
// saiu
const saiu = ped('6206', 'BEBE DE MAE', { 0: { expedido: 500 }, 1: { expedido: 20 } },
  { saidaEm: '2026-10-06T09:00:00.000Z', saidaMotorista: 'MATEUS' })
// já entregue (só remessa)
const remessa = { id: '5900-1', idVenda: '5900', cliente: 'SPAÇO', cidade: 'ITABAIANA', rota: 'ROTA 02', vendedor: 'PAULO', valorTotal: 408,
  remessa: 1, parcial: false, motorista: 'PAULO', entregueEm: '2026-10-03T12:00:00.000Z', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500 }] }
const MOT = [{ id: 'm1', nome: 'MATEUS' }, { id: 'm2', nome: 'PAULO' }]
const nada = () => {}
const comp = comprometimentoDeCargas([])
const card = (r, props = {}) => renderToString(
  <CardControle r={r} comp={comp} cargas={[]} planos={[]} clientes={[]} itensCad={CAD} termo={r.idVenda}
    veValor podeBaixar podeEntregar salvando="" motoristas={MOT} problemas={[]}
    onPronto={nada} onSaida={nada} onCancelarSaida={nada} onEntregar={nada} {...props} />)
const linhas = linhasControleEntrega([pronto, saiu], [remessa])

export function roda() {
  globalThis.__auth = { perfil: 'financeiro', nome: 'Anny', user: { uid: 'u1' } }
  try {
    return {
      ceCasca: renderToString(<ControleEntrega pedidos={[naFabrica, pronto, saiu]} problemas={[]} />),
      ceFabrica: card({ idVenda: '5738', p: naFabrica, remessas: [] }),
      cePronto: card({ idVenda: '6215', p: pronto, remessas: [] }),
      ceSaiu: card({ idVenda: '6206', p: saiu, remessas: [] }),
      ceEntregue: card({ idVenda: '5900', p: null, remessas: [remessa] }),
      // expedição: marca pronto e saída, mas a ENTREGA fica travada com o motivo
      ceExpedicao: card({ idVenda: '6215', p: pronto, remessas: [] }, { podeEntregar: false, veValor: false }),
      ceTabela: renderToString(<TabelaControle linhas={linhas} totais={totaisDoControle(linhas)} veValor onAbrir={nada} />),
    }
  } finally { globalThis.__auth = undefined }
}
