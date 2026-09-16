import { renderToString } from 'react-dom/server'
import PostoFaixa, { TecladoPin } from '../../src/components/PostoFaixa.jsx'
import QuadroProducao from '../../src/components/QuadroProducao.jsx'
import { PAINEIS_QUADRO } from '../../src/utils.js'

const nada = () => {}
const pins = {
  a: { nome: 'Pedro Alves', setores: ['PRODUCAO'], ativo: true, hash: 'h' },
  b: { nome: 'Ana Lima', setores: ['PRODUCAO'], ativo: true, hash: 'h' },
  c: { nome: 'Caio Desligado', setores: ['PRODUCAO'], ativo: false, hash: 'h' },
  d: { nome: 'Davi Grafica', setores: ['GRAFICA'], ativo: true, hash: 'h' },
}
const joaos = {
  j1: { nome: 'João Souza', setores: ['PRODUCAO'], ativo: true, hash: 'h' },
  j2: { nome: 'João Pedro Lima', setores: ['PRODUCAO'], ativo: true, hash: 'h' },
  m: { nome: 'Maria Silva', setores: ['PRODUCAO'], ativo: true, hash: 'h' },
}
const vazio = { pins, executor: null, resta: 0, sair: nada, entrar: nada, renova: nada }
const ativo = { ...vazio, executor: { uid: 'a', nome: 'Pedro Alves', ultimo: Date.now() }, resta: 272000 }

const silk = PAINEIS_QUADRO.filter((pa) => pa.etapa === 'PRODUCAO')
const pedido = {
  idVenda: '5001', cliente: 'INGRID MODAS', vendedor: 'SERGIO', rota: 'ROTA 01', cidade: 'ITABAIANA',
  status: 'PRODUCAO', linhasItens: { 'SACOLA PAPEL P02#1': 'PRODUCAO' },
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 500, key: 'SACOLA PAPEL P02#1' }],
}
function quadro(posto) {
  globalThis.__auth = { perfil: 'operador', posto: true, nome: 'Tablet Silk', setores: ['PRODUCAO'],
    materiais: [], user: { uid: 't' } }
  try {
    return renderToString(<QuadroProducao pedidos={[pedido]} clientes={[]} itensCad={[]}
      paineis={silk} problemas={{}} posto={posto} />)
  } finally { globalThis.__auth = undefined }
}

export function roda() {
  return {
    fVazia: renderToString(<PostoFaixa posto={vazio} setores={['PRODUCAO']} />),
    fAtiva: renderToString(<PostoFaixa posto={ativo} setores={['PRODUCAO']} />),
    fJoaos: renderToString(<PostoFaixa posto={{ ...vazio, pins: joaos }} setores={['PRODUCAO']} />),
    fNinguem: renderToString(<PostoFaixa posto={{ ...vazio, pins: {} }} setores={['PRODUCAO']} />),
    teclado: renderToString(<TecladoPin pessoa={{ uid: 'a', nome: 'Pedro Alves', hash: 'h' }} onOk={nada} onCancelar={nada} />),
    qTravado: quadro(vazio),
    qLivre: quadro(ativo),
  }
}
