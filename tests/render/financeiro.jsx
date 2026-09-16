import { renderToString } from 'react-dom/server'
import F, { AbaCobrar, AbaAberto, AbaCaixa, ModalCobranca, ModalReceber }
  from '../../src/pages/Financeiro.jsx'
import { entregasParaCobrar, situacaoDaCobranca, geraParcelas, parcelasDaCobranca }
  from '../../src/utils.js'

const CAD=[{produto:'SACOLA PAPEL P02',preco:4},{produto:'SACOLA PLASTICA 30X40',preco:32}]
const pedidos=[{idVenda:'5458',cliente:'INGRID MODAS',valorTotal:500,
  itens:[{produto:'SACOLA PAPEL P02',qtd:100,key:'A#1'},{produto:'SACOLA PLASTICA 30X40',qtd:10,key:'B#1'}]}]
// duas remessas do mesmo pedido: força o RATEIO (e não o caminho exato)
const entregues=[
  {id:'5458-1',idVenda:'5458',remessa:1,parcial:true,valorTotal:500,cliente:'INGRID MODAS',
   cidade:'ITABAIANA',motorista:'JUNINHO',entregueEm:'2026-08-20T10:00:00',
   itens:[{produto:'SACOLA PAPEL P02',qtd:100,qtdItem:100,key:'A#1'}]},
  {id:'5458-2',idVenda:'5458',remessa:2,parcial:false,valorTotal:500,cliente:'INGRID MODAS',
   cidade:'ITABAIANA',entregueEm:'2026-08-28T10:00:00',
   itens:[{produto:'SACOLA PLASTICA 30X40',qtd:10,qtdItem:10,key:'B#1'}]},
  // sem preço no cadastro: tem que cair no "valor a digitar", não estimar
  {id:'77-1',idVenda:'77',remessa:1,parcial:true,valorTotal:900,cliente:'DAMALI',
   entregueEm:'2026-08-29T10:00:00',itens:[{produto:'PRODUTO SEM PRECO',qtd:5,qtdItem:9}]},
]
const cobrancas=[{id:'c1',empresa:'sacolas',idVenda:'5458',remessa:1,cliente:'INGRID MODAS',
  valor:200,status:'aberta',criadaPor:'Anny',criadaEm:'2026-08-21T09:00:00',obs:'entrega parcial',
  parcelas:geraParcelas(200,3,'2026-08-25',30,'boleto')}]
const movimentos=[
  {id:'m1',empresa:'sacolas',tipo:'entrada',data:'2026-08-25',valor:66.68,forma:'pix',
   conta:'bradesco',cobrancaId:'c1',parcelaN:1,cliente:'INGRID MODAS',idVenda:'5458',por:'Anny'},
  {id:'m2',empresa:'sacolas',tipo:'entrada',data:'2026-08-26',valor:999,forma:'cheque',
   conta:'cielo',cliente:'OUTRO',por:'Anny',cancelado:true,canceladoPor:'Anny'},
]
const aCobrar=entregasParaCobrar(entregues,cobrancas,pedidos,CAD)
const sit=situacaoDaCobranca(cobrancas[0],movimentos,'2026-10-01')
const pcs=parcelasDaCobranca(cobrancas[0],movimentos)
const hoje=new Date()
const MES=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`
movimentos[0].data=`${MES}-05`; movimentos[1].data=`${MES}-06`
const nada=()=>{}
const de=(id)=>aCobrar.find(e=>String(e.idVenda)===id)

export function roda(){
  return {
    casca:   renderToString(<F pedidos={pedidos} />),
    cobrar:  renderToString(<AbaCobrar lista={aCobrar} empresa="sacolas" clientes={[]} onLancar={nada} />),
    plast:   renderToString(<AbaCobrar lista={[]} empresa="plastico" clientes={[]} onLancar={nada} />),
    aberto:  renderToString(<AbaAberto cobrancas={cobrancas} movimentos={movimentos} clientes={[]} nome="Anny" onReceber={nada} />),
    caixa:   renderToString(<AbaCaixa movimentos={movimentos} empresa="sacolas" clientes={[]} nome="Anny" />),
    mCobr:   renderToString(<ModalCobranca entrega={de('5458')} empresa="sacolas" pedidos={pedidos}
               entregues={entregues} cobrancas={cobrancas} itensCad={CAD} clientes={[]}
               nome="Anny" uid="u1" onFechar={nada} />),
    mSemPreco: renderToString(<ModalCobranca entrega={de('77')} empresa="sacolas"
               pedidos={pedidos} entregues={entregues} cobrancas={cobrancas} itensCad={CAD} clientes={[]}
               nome="Anny" uid="u1" onFechar={nada} />),
    mManual: renderToString(<ModalCobranca entrega={{manual:true}} empresa="plastico" pedidos={pedidos}
               entregues={entregues} cobrancas={cobrancas} itensCad={CAD} clientes={[]}
               nome="Anny" uid="u1" onFechar={nada} />),
    mReceber: renderToString(<ModalReceber alvo={{cob:cobrancas[0],parcela:pcs[1],total:3}}
               empresa="sacolas" nome="Anny" uid="u1" clientes={[]} onFechar={nada} />),
    _sit: sit,
  }
}
