import { renderToString } from 'react-dom/server'
import { AbaCores, FormCor } from '../../src/pages/Cadastros.jsx'
import { CardTriagem } from '../../src/pages/Triagem.jsx'
import { CORES_PADRAO, definirCores } from '../../src/utils.js'

const nada = () => {}
const CAD = [{ produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' }]
const p = { idVenda: '8001', cliente: 'LOJA', vendedor: 'SERGIO', rota: 'ROTA 01', cidade: 'X', valorTotal: 1,
  status: 'PRODUCAO', itens: [{ produto: 'SACOLA PLASTICA 30X40', qtd: 5, key: 'PL#1' }],
  linhasItens: { 'PL#1': 'PRODUCAO' }, cores: { 'PL#1': ['rosa'] } }

export function roda() {
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  try {
    const out = {
      cAba: renderToString(<AbaCores />),
      cNova: renderToString(<FormCor lista={CORES_PADRAO} inicial={null} onSalvar={nada} onCancelar={nada} />),
      cEdit: renderToString(<FormCor lista={CORES_PADRAO} inicial={CORES_PADRAO[8]} onSalvar={nada} onCancelar={nada} />),
    }
    // cadastro com uma cor nova e a Rosa DESATIVADA — mas este item já usa rosa
    definirCores([{ id: 'preto', nm: 'Preto', hex: '#000000' }, { id: 'verde-limao', nm: 'Verde Limão', hex: '#aaff00' },
      { id: 'rosa', nm: 'Rosa Choque', hex: '#ff0099', ativo: false }])
    out.cTriagem = renderToString(<CardTriagem p={p} onSalvar={nada} onCidade={nada} onExcluir={null}
      clientes={[]} itensCad={CAD} />)
    return out
  } finally {
    definirCores([])
    globalThis.__auth = undefined
  }
}
