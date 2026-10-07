// AS PÁGINAS montam? Produção (lista e quadro), Rota, Entregues e Entregas
// (Carga). A correção 2 (07/10/2026) reescreveu o corpo delas em blocos de
// useMemo; variável que sumisse no caminho daria tela preta sem o build
// reclamar. O SSR não roda efeitos: as coleções assinadas (cargas, planos,
// entregues) ficam vazias e a tela mostra a casca + o que vem de `pedidos`.
import { renderToString } from 'react-dom/server'
import Producao from '../../src/pages/Producao.jsx'
import Rota from '../../src/pages/Rota.jsx'
import Entregues from '../../src/pages/Entregues.jsx'
import Carga from '../../src/pages/Carga.jsx'

const pa = { produto: 'SACOLA PAPEL P02', qtd: 500, key: 'PA#1' }
const pl = { produto: 'SACOLA PLASTICA 30X40', qtd: 10, key: 'PL#1' }
const pedidos = [
  { idVenda: '7001', cliente: 'INGRID MODAS', vendedor: 'SERGIO', rota: 'ROTA 01', cidade: 'ITABAIANA',
    valorTotal: 100, status: 'GRAFICA', itens: [pa, pl],
    linhasItens: { 'PA#1': 'GRAFICA', 'PL#1': 'PRODUCAO' },
    acabamentos: { 'PA#1': { laminacao: 'fosca', furo: false } },
    // 200 das 500 já expedidas: a lista tem que dizer que faltam 300
    etapas: { 'PA#1': { expedido: 200 } } },
  { idVenda: '7002', cliente: 'BIA CALCADOS', vendedor: 'MICHELE', rota: 'ROTA 02', cidade: 'CARIRA',
    valorTotal: 50, status: '', itens: [pl], linhasItens: {} },   // sem triagem: fora da produção
]
const problemas = [{ id: 'x', idVenda: '7001', itemKey: 'PA#1', status: 'aberto', campo: 'qtd', obs: 'conferir' }]

const DONO = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' }, setores: [], materiais: [] }
function monta(auth, el) {
  globalThis.__auth = auth
  try { return renderToString(el) } finally { globalThis.__auth = undefined }
}
const pagina = (auth) => monta(auth, <Producao pedidos={pedidos} problemas={problemas} ordens={[]} producaoCfg={{}} />)

export function roda() {
  return {
    // dono abre na LISTA: só o 7001 (categorizado), com a quantidade que FALTA
    prLista: pagina({ perfil: 'dono', nome: 'Dono', user: { uid: 'd' }, setores: [], materiais: [] }),
    // operador do silk abre no QUADRO, na fila dele (o plástico do 7001)
    prQuadroOp: pagina({ perfil: 'operador', nome: 'Caio', user: { uid: 'o' }, setores: ['PRODUCAO'], materiais: [] }),
    // expedição abre no quadro; sem nada expedido na fila dela, a aba automática
    // cai no primeiro painel visível
    prQuadroExp: pagina({ perfil: 'expedicao', nome: 'Exp', user: { uid: 'e' }, setores: [], materiais: [] }),
    // Rota: só o que foi EXPEDIDO (as 200 do papel), com o aviso do que falta
    rota: monta(DONO, <Rota pedidos={pedidos} />),
    // Entregues assina a coleção num efeito: no SSR é a casca
    entregues: monta(DONO, <Entregues />),
    // Entregas/Carga: sem previsão nenhuma, o que está expedido aparece em
    // "Prontos sem previsão"
    carga: monta(DONO, <Carga pedidos={pedidos} />),
  }
}
