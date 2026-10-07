// ABA CLIENTES — um doc por cliente + a faixa de migração do formato antigo
// (correção 5, 07/10/2026). Com legado: faixa e botão "Migrar N"; sem legado: nada.
import { renderToString } from 'react-dom/server'
import { AbaClientes } from '../../src/pages/Cadastros.jsx'

const naColecao = { id: 'INGRID MODAS', razao: 'INGRID MODAS', nome: 'Ingrid' }
const soNoArray = { razao: 'LOJA VELHA LTDA', nome: 'Velha', _legado: true }

function aba(cad) {
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  globalThis.__cad = cad
  try { return renderToString(<AbaClientes />) } finally { globalThis.__cad = undefined; globalThis.__auth = undefined }
}

export function roda() {
  return {
    cliLegado: aba({ clientes: [naColecao, soNoArray], clientesLegado: [{ razao: 'LOJA VELHA LTDA', nome: 'Velha' }, { razao: 'INGRID MODAS', nome: 'Ingrid Antiga' }] }),
    cliLimpo: aba({ clientes: [naColecao], clientesLegado: [] }),
  }
}
