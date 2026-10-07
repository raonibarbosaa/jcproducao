import { renderToString } from 'react-dom/server'
import ControleEntrega, { CardControle, TabelaControle } from '../../src/pages/ControleEntrega.jsx'
import Localizar from '../../src/pages/Localizar.jsx'
import AcoesControle from '../../src/components/AcoesControle.jsx'
import { ResumoBaixasEscritorio } from '../../src/pages/Auditoria.jsx'
import { carimbaKeys, keyDoItem, linhasControleEntrega, totaisDoControle, comprometimentoDeCargas } from '../../src/utils.js'

const CAD = [{ produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' }, { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' }]
const ped = (id, cliente, etapas, extra = {}) => {
  const p = carimbaKeys({ idVenda: id, cliente, cidade: 'ITABAIANA', vendedor: 'PAULO', rota: 'ROTA 02', valorTotal: 448,
    status: 'GRAFICA', previsao: '2026-10-10', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500 }, { produto: 'SACOLA PLASTICA 30X40', qtd: 20 }], ...extra })
  p.linhasItens = { [keyDoItem(p, 0)]: 'GRAFICA', [keyDoItem(p, 1)]: 'PRODUCAO' }
  p.etapas = Object.fromEntries(Object.entries(etapas || {}).map(([i, v]) => [keyDoItem(p, Number(i)), v]))
  return p
}
// na fábrica: papel metade na montagem, plástico no silk — nada lançado
const naFabrica = ped('5738', 'BETEK KIDS', { 0: { montagem: 200 } })
// pronto pela fábrica, mas o escritório ainda não lançou: NÃO entra na lista
const prontoFabrica = ped('6999', 'SO FABRICA', { 0: { expedido: 500 }, 1: { expedido: 20 } })
// lançado pelo escritório e na rua
const lancado = ped('6215', 'CREDIMOVEIS', { 0: { expedido: 500 }, 1: { expedido: 20 } },
  { baixaEscritorio: { em: '2026-10-07T12:00:00.000Z', por: 'Anny', motorista: 'MATEUS' },
    saidaEm: '2026-10-07T12:00:00.000Z', saidaMotorista: 'MATEUS' })
// lançado, voltou no caminhão
const voltou = ped('6206', 'BEBE DE MAE', { 0: { expedido: 500 }, 1: { expedido: 20 } },
  { baixaEscritorio: { em: '2026-10-06T09:00:00.000Z', por: 'Anny', motorista: 'PAULO' } })
// já entregue (só remessa)
const remessa = { id: '5900-1', idVenda: '5900', cliente: 'SPAÇO', cidade: 'ITABAIANA', rota: 'ROTA 02', vendedor: 'PAULO', valorTotal: 408,
  remessa: 1, parcial: false, motorista: 'PAULO', entregueEm: '2026-10-03T12:00:00.000Z', itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500 }] }
const MOT = [{ id: 'm1', nome: 'MATEUS' }, { id: 'm2', nome: 'PAULO' }]
const nada = () => {}
const comp = comprometimentoDeCargas([])
const card = (r, props = {}) => renderToString(
  <CardControle r={r} comp={comp} cargas={[]} planos={[]} clientes={[]} itensCad={CAD} termo={r.idVenda}
    veValor podeLancar podeEntregar salvando="" motoristas={MOT} problemas={[]}
    acoes={{ salvando: '', lancar: nada, voltou: nada, sairDeNovo: nada, entregar: nada }} {...props} />)
const linhas = linhasControleEntrega([naFabrica, prontoFabrica, lancado, voltou])   // prontoFabrica ENTRA agora

export function roda() {
  globalThis.__auth = { perfil: 'financeiro', nome: 'Anny', user: { uid: 'u1' } }
  try {
    return {
      ceCasca: renderToString(<ControleEntrega pedidos={[naFabrica, prontoFabrica, lancado, voltou]} problemas={[]} />),
      ceFabrica: card({ idVenda: '5738', p: naFabrica, remessas: [] }),
      ceProntoFabrica: card({ idVenda: '6999', p: prontoFabrica, remessas: [] }),
      ceLancado: card({ idVenda: '6215', p: lancado, remessas: [] }),
      ceVoltou: card({ idVenda: '6206', p: voltou, remessas: [] }),
      ceEntregue: card({ idVenda: '5900', p: null, remessas: [remessa] }),
      // expedição: lança e marca retorno, mas a ENTREGA não é dela
      ceExpedicao: card({ idVenda: '6215', p: lancado, remessas: [] }, { podeEntregar: false, veValor: false }),
      // Localizar com os mesmos botões (Fase C); operador do silk não vê ação nenhuma
      ceLocalizar: renderToString(<Localizar pedidos={[lancado]} problemas={[]} />),
      ceAcoesSemPermissao: renderToString(<AcoesControle p={lancado} motoristas={MOT} podeLancar={false} podeEntregar={false} acoes={{ salvando: '' }} problemas={[]} />) || '<vazio>',
      ceResumoEsc: renderToString(<ResumoBaixasEscritorio regs={[
        { origem: 'escritorio', de: 'GRAFICA', material: 'papel', qtd: 300, idVenda: '5738', quando: '2026-10-07T12:00:00.000Z' },
        { origem: 'escritorio', de: 'montagem', material: 'papel', qtd: 200, idVenda: '5738', quando: '2026-10-07T12:00:00.000Z' },
        { origem: 'escritorio', de: 'PRODUCAO', material: 'plastico', qtd: 20, idVenda: '6000', quando: '2026-10-07T12:00:00.000Z', semPesagem: true },
      ]} />),
      ceTabela: renderToString(<TabelaControle linhas={linhas} totais={totaisDoControle(linhas)} veValor onAbrir={nada} />),
    }
  } finally { globalThis.__auth = undefined }
}
