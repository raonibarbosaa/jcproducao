import { renderToString } from 'react-dom/server'
import U, { CardUsuario, FormUsuario, FormEdicao } from '../../src/pages/Usuarios.jsx'

const joao = { uid: 'j', nome: 'João Souza', email: 'joao.souza@jcsacolas.app', perfil: 'operador',
  setores: ['PRODUCAO'], materiais: [], ativo: true }
const nada = () => {}
export function roda() {
  return {
    uCasca: renderToString(<U />),
    uCard: renderToString(<CardUsuario u={joao} pin={{ ativo: true }}
      onEditar={nada} onAtivo={nada} onSenha={nada} onRemoverPin={nada} />),
    uCardOff: renderToString(<CardUsuario u={{ ...joao, ativo: false, email: 'j@gmail.com' }} pin={{ ativo: false }}
      onEditar={nada} onAtivo={nada} onSenha={nada} onRemoverPin={nada} />),
    uNovo: renderToString(<FormUsuario emails={[]} onSalvar={nada} onCancelar={nada} />),
    uEdit: renderToString(<FormEdicao u={joao} temPin onSalvar={nada} onCancelar={nada} />),
    uEditSem: renderToString(<FormEdicao u={joao} temPin={false} onSalvar={nada} onCancelar={nada} />),
  }
}
