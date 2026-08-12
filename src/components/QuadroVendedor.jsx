import {
  PAINEIS_QUADRO, etapaDoItem, linhaDoItem, materialDoItem, itemPertenceAoPainel,
  nomeCliente, fmtData, fmtDataHora, fmtMoeda, situacaoPrazo, saiuParaEntrega,
} from '../utils.js'
import SeloLinha from './SeloLinha.jsx'

// Quadro do VENDEDOR: acompanhamento, do pedido recém-importado até a entrega.
// É SÓ LEITURA — nenhum botão move nada, e a segurança não depende disso: o
// App consulta os pedidos com where('vendedor','==') e a regra do Firestore
// impõe o mesmo no servidor, então o vendedor não alcança pedido de outro.
//
// Duas diferenças de propósito em relação ao quadro da fábrica:
//  · nada some. Item de gráfica sem laminação continua aparecendo na coluna da
//    gráfica (na fábrica ele fica fora até o designer fechar o acabamento) e
//    pedido sem triagem tem a coluna dele. Some da tela = vendedor achando que
//    o pedido se perdeu.
//  · item sem material cai numa montagem só (a primeira que serve), em vez de
//    aparecer nas três: para o vendedor a informação é "está na montagem".
const COLUNAS = [
  { id: 'triagem', nome: 'Em triagem' },
  ...PAINEIS_QUADRO,
  { id: 'expedido', nome: 'Pronto p/ sair' },
  { id: 'saiu', nome: 'Saiu para entrega' },
  { id: 'entregue', nome: 'Entregue' },
]

export default function QuadroVendedor({ pedidos, entregues, clientes, itensCad }) {
  const porColuna = {}
  for (const c of COLUNAS) porColuna[c.id] = []

  for (const p of pedidos || []) {
    // pedido ainda sem classificação de linha: fica visível na primeira coluna
    if (!p.status) {
      porColuna.triagem.push({ p, idxs: (p.itens || []).map((_, i) => i) })
      continue
    }
    const grupos = {}
    ;(p.itens || []).forEach((_, i) => {
      const et = etapaDoItem(p, i)
      let alvo
      if (et === 'expedido') {
        alvo = saiuParaEntrega(p) ? 'saiu' : 'expedido'
      } else {
        const mat = materialDoItem(p.itens[i], itensCad)
        alvo = PAINEIS_QUADRO.find((pa) => itemPertenceAoPainel(pa, p, i, mat))?.id
      }
      if (alvo) (grupos[alvo] ??= []).push(i)
    })
    for (const [id, idxs] of Object.entries(grupos)) porColuna[id]?.push({ p, idxs })
  }

  // cada remessa entregue é um card (pedido pode ter saído em partes)
  for (const e of entregues || []) {
    porColuna.entregue.push({ p: e, idxs: (e.itens || []).map((_, i) => i), entregue: true })
  }

  for (const c of COLUNAS) {
    porColuna[c.id].sort((a, b) => (a.p.previsao || '').localeCompare(b.p.previsao || ''))
  }

  const total = COLUNAS.reduce((s, c) => s + porColuna[c.id].length, 0)
  if (!total) {
    return <div className="empty"><div className="big">📦</div>Nenhum pedido para acompanhar no momento.</div>
  }

  return (
    <div className="quadro">
      {COLUNAS.map((c) => (
        <div key={c.id} className="quadro-col">
          <div className="qc-head">
            {c.nome} <span className="qc-count">{porColuna[c.id].length}</span>
          </div>
          <div className="qc-body">
            {porColuna[c.id].length === 0 && <div className="qc-vazio">— nada aqui —</div>}
            {porColuna[c.id].map(({ p, idxs, entregue }, n) => {
              const atrasado = !entregue && situacaoPrazo(p.previsao) === 'atrasado'
              const parcial = idxs.length < (p.itens || []).length
              return (
                <div key={`${p.idVenda}|${c.id}|${n}`} className={`qcard ${atrasado ? 'atrasado' : ''}`}>
                  <div className="qcard-top">
                    <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
                    <span className="idv">#{p.idVenda}</span>
                  </div>
                  <div className="qcard-meta">
                    <span className="chip">📍 {p.rota || p.cidade || '—'}</span>
                    {entregue
                      ? <span className="chip" style={{ color: 'var(--ok)' }}>
                          ✓ {fmtData(p.entregueEm)}{p.motorista ? ` · 🚚 ${p.motorista}` : ''}
                        </span>
                      : <span className={`chip ${atrasado ? 'atrasado' : ''}`}>{fmtData(p.previsao)}</span>}
                    {entregue && p.remessa > 1 && <span className="chip">remessa {p.remessa}</span>}
                    {entregue && (p.pago
                      ? <span className="chip" style={{ color: 'var(--ok)' }}>💰 pago</span>
                      : <span className="chip rota-warn">⏳ pendente de baixa</span>)}
                    {!entregue && parcial && (
                      <span className="chip" title="Os outros itens deste pedido estão em outra etapa">
                        {idxs.length} de {(p.itens || []).length} itens
                      </span>
                    )}
                  </div>
                  {c.id === 'saiu' && p.saidaEm && (
                    <div className="qcard-log">
                      🚚 saiu em {fmtDataHora(p.saidaEm)}{p.saidaMotorista ? ` · ${p.saidaMotorista}` : ''}
                    </div>
                  )}
                  <ul className="itens">
                    {idxs.map((i) => (
                      <li key={i}>
                        <span><SeloLinha linha={linhaDoItem(p, i)} />{p.itens[i].produto}</span>
                        <span className="q">{p.itens[i].qtd}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="qcard-valor">{fmtMoeda(p.valorTotal)}</div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
