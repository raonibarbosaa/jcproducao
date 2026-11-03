import { renderToString } from 'react-dom/server'
import Cheques, { TelaCheques, ModalLancar, ModalEvento, FichaCheque, BarraSelecao, numBR,
  ModalReciboPronto, ReciboRepasse, reciboDoRepasse, ConferenciaGaveta, ContasDoCliente, ListaCheques } from '../../src/pages/Cheques.jsx'
import { ChequesDoPedido } from '../../src/pages/Localizar.jsx'
import { chequesDoLote, geraFolhas, aplicaEvento, contasDoCliente, ondeEstaOCheque, marcaResgate } from '../../src/lib/cheques.js'

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
const FORN = [{ id: 'f1', nome: 'RESINAS NE', documento: '11.222.333/0001-81', ativo: true },
  { id: 'f2', nome: 'TINTAS VELHAS', ativo: false }]
// C4: a folha 4 foi para a RESINAS pagando conta da Plástico (entre empresas)
const REP = { para: 'repassado', fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', empresaPagadora: 'plastico',
  referencia: 'NF 1234', data: '2026-10-24' }
const rep4 = ev({ ...lote[3], id: 'c5', numero: '047474' }, REP)   // uma 5ª folha, que já foi
const repassados = { pronto: true, erro: '', lista: [rep4] }
// C6d: a RUBI pediu o resgate do 047474, que está com a RESINAS
const comResgate = marcaResgate(rep4, { porUid: 'u1', por: 'Anny', data: '2026-10-23' }).cheque
const arq = { pronto: false, erro: '', lista: [] }
const base = { vivos, arquivo: arq, arquivoLigado: false, onArquivo: () => {}, pedidos: [], clientes: [{ razao: 'INGRID MODAS', nome: 'INGRID' }],
  quem: QUEM, hoje: HOJE, acoes, fornecedores: FORN, repassados, periodoRep: '90', onPeriodoRep: () => {}, onAba: () => {} }

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
    chRepassados: renderToString(<TelaCheques {...base} abaInicial="repassados" />),
    chRepassar: renderToString(<ModalEvento para="repassado" cheques={[lote[0]]} hoje={HOJE} fornecedores={FORN}
      onConfirmar={nada} onFechar={() => {}} />),
    chReciboPronto: renderToString(<ModalReciboPronto repasse={reciboDoRepasse([lote[3]], REP)} onImprimir={() => {}} onFechar={() => {}} />),
    chRecibo: renderToString(<ReciboRepasse repasse={reciboDoRepasse([lote[3]], REP)} fornecedores={FORN} clientes={base.clientes} />),
    chGaveta: renderToString(<ConferenciaGaveta cheques={[...vivos.lista, rep4]} empresa="" clientes={base.clientes} hoje={HOJE} />),
    chGavetaSac: renderToString(<ConferenciaGaveta cheques={vivos.lista} empresa="sacolas" clientes={base.clientes} hoje={HOJE} />),
    chLocFechado: renderToString(<ChequesDoPedido cheques={[lote[0], dep, rep4]} aberto={false} />),
    chLocAberto: renderToString(<ChequesDoPedido cheques={[lote[0], dep, rep4]} aberto />),
    chContas: renderToString(<ContasDoCliente contas={contasDoCliente(lote)} usada="" onUsar={() => {}} cliente="INGRID" />),
    chContasVazio: renderToString(<ContasDoCliente contas={[]} usada="" onUsar={() => {}} cliente="INGRID" />) || '<vazio>',
    chOnde: renderToString(<ListaCheques cheques={[rep4, dev]} marcados={[]} onMarcar={() => {}} onAbrir={() => {}}
      clientes={base.clientes} hoje={HOJE} vazio="" ondeDe={(c) => ondeEstaOCheque(c, {
        nomeConta: (id) => id, contatoFornecedor: () => ({ telefone: '(79) 3431-0000', contato: 'Marcos' }) })} />),
    chFichaOnde: renderToString(<FichaCheque cheque={rep4} todos={vivos.lista} clientes={base.clientes} hoje={HOJE}
      ondeDe={(c) => ondeEstaOCheque(c, {})} onAcao={() => {}} onCorrigir={nada} onFechar={() => {}} />),
    chResgates: renderToString(<TelaCheques {...base} abaInicial="resgates"
      resgates={{ pronto: true, erro: '', lista: [comResgate] }} />),
    chRecolher: renderToString(<ModalEvento para="carteira" cheques={[comResgate]} hoje={HOJE} onConfirmar={nada} onFechar={() => {}} />),
    chResgatar: renderToString(<ModalEvento para="resgatado" cheques={[lote[0]]} hoje={HOJE} onConfirmar={nada} onFechar={() => {}} />),
    chFichaRep: renderToString(<FichaCheque cheque={rep4} todos={vivos.lista} clientes={base.clientes} hoje={HOJE}
      onAcao={() => {}} onCorrigir={nada} onResgate={nada} onFechar={() => {}} />),
    chFichaResg: renderToString(<FichaCheque cheque={comResgate} todos={vivos.lista} clientes={base.clientes} hoje={HOJE}
      onAcao={() => {}} onCorrigir={nada} onResgate={nada} onFechar={() => {}} />),
    chNumBR: JSON.stringify([numBR('1.468,00'), numBR('367,5'), numBR('1468.5'), Number.isNaN(numBR(''))]),
  }
  globalThis.__auth = { perfil: 'designer', nome: 'Davi', user: { uid: 'u2' } }
  try { out.chDesigner = renderToString(<Cheques pedidos={[]} />) } finally { globalThis.__auth = undefined }
  globalThis.__auth = { perfil: 'dono', nome: 'Dono', user: { uid: 'd' } }
  try { out.chDono = renderToString(<Cheques pedidos={[]} />) } finally { globalThis.__auth = undefined }
  out.chFinanceiro = renderToString(<Cheques pedidos={[]} />)
  return out
}
