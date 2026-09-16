import { renderToString } from 'react-dom/server'
import { CorpoMeuPin } from '../../src/components/MeuPin.jsx'
import Layout from '../../src/components/Layout.jsx'
import { MemoryRouter } from 'react-router-dom'

const nada = () => {}
function comAuth(a) {
  globalThis.__auth = a
  try {
    return renderToString(<MemoryRouter><Layout abas={['producao']} contadores={{}}>x</Layout></MemoryRouter>)
  } finally { globalThis.__auth = undefined }
}
export function roda() {
  return {
    pCarrega: renderToString(<CorpoMeuPin pin={undefined} onSalvar={nada} onFechar={nada} />),
    pSem: renderToString(<CorpoMeuPin pin={null} onSalvar={nada} onFechar={nada} />),
    pOff: renderToString(<CorpoMeuPin pin={{ ativo: false }} onSalvar={nada} onFechar={nada} />),
    pForm: renderToString(<CorpoMeuPin pin={{ ativo: true, hash: 'h' }} onSalvar={nada} onFechar={nada} />),
    // o stub do Auth é perfil financeiro: o botão NÃO pode aparecer
    lay: renderToString(<MemoryRouter><Layout abas={['financeiro']} contadores={{}}>x</Layout></MemoryRouter>),
    layOp: comAuth({ perfil: 'operador', nome: 'João', user: { uid: 'j' } }),
    layPosto: comAuth({ perfil: 'operador', posto: true, nome: 'Tablet Silk', user: { uid: 't' } }),
  }
}
