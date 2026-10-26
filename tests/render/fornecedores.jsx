import { renderToString } from 'react-dom/server'
import { AbaFornecedores, PainelFornecedores, FormFornecedor } from '../../src/pages/Cadastros.jsx'

const nada = async () => {}
const LISTA = [
  { id: 'f1', nome: 'Resinas do Nordeste', documento: '11.222.333/0001-81', telefone: '(79) 3431-0000', contato: 'Marcos', obs: 'resina', ativo: true },
  { id: 'f2', nome: 'Tintas Sergipe', documento: '', ativo: false },
]

export function roda() {
  const out = {
    fnLista: renderToString(<PainelFornecedores lista={LISTA} pronto erro="" onSalvar={nada} onAlternar={nada} />),
    fnVazio: renderToString(<PainelFornecedores lista={[]} pronto erro="" onSalvar={nada} onAlternar={nada} />),
    // ainda não chegou do servidor: espera, e o "+ Novo" fica travado
    fnCarregando: renderToString(<PainelFornecedores lista={[]} pronto={false} erro="" onSalvar={nada} onAlternar={nada} />),
    fnNegado: renderToString(<PainelFornecedores lista={[]} pronto={false} erro="permission-denied" onSalvar={nada} onAlternar={nada} />),
    fnForm: renderToString(<FormFornecedor lista={LISTA} inicial={LISTA[0]} onSalvar={nada} onCancelar={nada} />),
  }
  // a aba com o hook de verdade (o stub nunca responde): monta e espera
  globalThis.__auth = { perfil: 'financeiro', nome: 'Anny', user: { uid: 'u1' } }
  try { out.fnAba = renderToString(<AbaFornecedores />) } finally { globalThis.__auth = undefined }
  globalThis.__auth = { perfil: 'designer', nome: 'Davi', user: { uid: 'u2' } }
  try { out.fnDesigner = renderToString(<AbaFornecedores />) } finally { globalThis.__auth = undefined }
  return out
}
