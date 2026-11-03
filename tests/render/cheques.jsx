import { renderToString } from 'react-dom/server'
import Cheques, { TelaCheques, ModalLancar, ModalEvento, FichaCheque, BarraSelecao, numBR } from '../../src/pages/Cheques.jsx'
import { chequesDoLote, geraFolhas, aplicaEvento } from '../../src/lib/cheques.js'

const HOJE = '2026-10-26'
const QUEM = { por: 'Anny', porUid: 'u1', agora: '2026-10-20T10:00:00Z', hoje: HOJE }
const nada = async () => {}
const acoes = { novoLoteId: () => 'L', gravaLote: nada, chequesComChaves: async () => [], aplicar: nada, corrigir: nada }

// o caso do Raoni: 4 folhas em sequência, 30/60/90/120
const folhas = geraFolhas({ quantas: 4, valor: { modo: 'folha', valor: 367 }, primeiroBomPara: '2026-10-25',
  intervalo: { tipo: 'dias', dias: 30 }, numeroInicial: '047470',
  base: { banco: { codigo: '047' }, agencia: '0036', conta: '03/100.483-1', emitente: { nome: 'JOAO TERCEIRO' }, terceiro: true } })
const lote = chequesDoLote({ empresa: 'sacolas', cliente: 'INGRID MODAS', idVenda: '5458', recebidoEm: '2026-10-20' },
  folhas, { loteId: 'L1', ...QUEM }).cheques.map((c, i) => ({ ...c, id: `c${i + 1}` }))
const ev = (c, e) => aplicaEvento(c, { porUid: 'u1', por: 'Anny', ...e }, QUEM).cheque
const dep = ev(lote[1], { para: 'depositado', conta: 'bradesco', data: '2026-10-20' })
const dev = ev(ev(lote[2], { para: 'depositado', conta: 'bradesco', data: '2026-10-21' }),
  { para: 'devolvido', alinea: '12', data: '2026-10-23' })
const vivos = { pronto: true, erro: '', lista: [lote[0], dep, dev, lote[3]] }
const arq = { pronto: false, erro: '', lista: [] }
const base = { vivos, arquivo: arq, arquivoLigado: false, onArquivo: () => {}, pedidos: [], clientes: [{ razao: 'INGRID MODAS', nome: 'INGRID' }],
  quem: QUEM, hoje: HOJE, acoes }

export function roda() {
  const out = {
    chCarteira: renderToString(<TelaCheques {...base} />),
    chDepositados: renderToString(<TelaCheques {...base} abaInicial="depositados" />),
    chDevolvidos: renderToString(<TelaCheques {...base} abaInicial="devolvidos" />),
    chLocalizar: renderToString(<TelaCheques {...base} abaInicial="localizar" />),
    chCarregando: renderToString(<TelaCheques {...base} vivos={{ pronto: false, erro: '', lista: [] }} />),
    chNegado: renderToString(<TelaCheques {...base} vivos={{ pronto: false, erro: 'permission-denied', lista: [] }} />),
    chLancar: renderToString(<ModalLancar pedidos={[]} clientes={[]} existentes={[]} quem={QUEM} hoje={HOJE}
      empresaInicial="sacolas" acoes={acoes} onFeito={() => {}} onFechar={() => {}} />),
    chDepositar: renderToString(<ModalEvento para="depositado" cheques={[lote[3]]} hoje={HOJE} onConfirmar={nada} onFechar={() => {}} />),
    chDevolver: renderToString(<ModalEvento para="devolvido" cheques={[dep]} hoje={HOJE} onConfirmar={nada} onFechar={() => {}} />),
    chFichaDev: renderToString(<FichaCheque cheque={dev} todos={vivos.lista} clientes={base.clientes} hoje={HOJE}
      onAcao={() => {}} onCorrigir={nada} onFechar={() => {}} />),
    chBarraMista: renderToString(<BarraSelecao cheques={[lote[0], dep]} onAcao={() => {}} onLimpar={() => {}} />),
    chNumBR: JSON.stringify([numBR('1.468,00'), numBR('367,5'), numBR('1468.5'), Number.isNaN(numBR(''))]),
  }
  globalThis.__auth = { perfil: 'designer', nome: 'Davi', user: { uid: 'u2' } }
  try { out.chDesigner = renderToString(<Cheques pedidos={[]} />) } finally { globalThis.__auth = undefined }
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  try { out.chDono = renderToString(<Cheques pedidos={[]} />) } finally { globalThis.__auth = undefined }
  out.chFinanceiro = renderToString(<Cheques pedidos={[]} />)
  return out
}
