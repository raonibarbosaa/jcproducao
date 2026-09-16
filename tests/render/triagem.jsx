import { renderToString } from 'react-dom/server'
import { CardTriagem } from '../../src/pages/Triagem.jsx'
import QuadroProducao from '../../src/components/QuadroProducao.jsx'
import { PAINEIS_QUADRO } from '../../src/utils.js'

const CAD = [
  { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' },
]
const pl = { produto: 'SACOLA PLASTICA 30X40', qtd: 10, key: 'PL#1' }
const pa = { produto: 'SACOLA PAPEL P02', qtd: 100, key: 'PA#1' }
const base = { idVenda: '7001', cliente: 'INGRID MODAS', vendedor: 'SERGIO', rota: 'ROTA 01',
  cidade: 'ITABAIANA', valorTotal: 100, itens: [pa, pl],
  linhasItens: { 'PA#1': 'GRAFICA', 'PL#1': 'PRODUCAO' },
  acabamentos: { 'PA#1': { laminacao: 'fosca', furo: false } } }
const nada = () => {}
const card = (p, filtroItem) => renderToString(<CardTriagem p={p} onSalvar={nada} onCidade={nada}
  onExcluir={null} clientes={[]} itensCad={CAD} filtroItem={filtroItem} />)

export function roda() {
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  try {
    return {
      tNovo: card({ ...base, status: '' }),
      tLegado: card({ ...base, status: 'PRODUCAO' }),
      tDuas: card({ ...base, status: 'PRODUCAO', cores: { 'PL#1': ['preto', 'dourado'] } }),
      tSoPapel: card({ ...base, itens: [pa], linhasItens: { 'PA#1': 'GRAFICA' }, status: 'GRAFICA' }),
      tFiltroPlast: card({ ...base, status: '' }, { material: 'plastico' }),
      tFiltroPapel: card({ ...base, status: '' }, { material: 'papel' }),
      tFiltroCor: card({ ...base, status: 'PRODUCAO' }, { faltaCor: true }),
      tQuadroCor: renderToString(<QuadroProducao
        pedidos={[{ ...base, status: 'PRODUCAO', cores: { 'PL#1': ['rosa'] } }]}
        clientes={[]} itensCad={CAD} problemas={{}}
        paineis={PAINEIS_QUADRO.filter((x) => x.etapa === 'PRODUCAO')} posto={null} />),
    }
  } finally { globalThis.__auth = undefined }
}
