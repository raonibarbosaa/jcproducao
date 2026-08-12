import {
  ETAPAS_VENDEDOR, nomeEtapaVendedor, contaEtapasVendedor, ordemRota,
  nomeCliente, fmtData, fmtDataHora, fmtMoeda, situacaoPrazo, saiuParaEntrega,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import SeloLinha from './SeloLinha.jsx'

// Acompanhamento do VENDEDOR, organizado por ROTA em vez de por coluna de setor.
// A pergunta dele não é "o que está na montagem", é "como está a rota do meu
// cliente" — então cada bloco é uma rota, com o pipeline inteiro resumido numa
// linha e os pedidos embaixo, cada item com a etapa onde está.
//
// É SÓ LEITURA, e a segurança não depende disso: o App consulta os pedidos com
// where('vendedor','==') e a regra do Firestore impõe o mesmo no servidor.
//
// Recebe os pedidos JÁ UNIFICADOS (pedidos vivos + remessas entregues) e já
// filtrados — ver unificaPedidosVendedor em utils.
export default function QuadroVendedor({ pedidos, clientes }) {
  const { vendedores: cadastros } = useCadastros()

  // agrupa Data de entrega → Rota. O nível "vendedor" não existe aqui: todos os
  // pedidos são do mesmo vendedor. Rotas na ordem do cadastro (a sequência real).
  const mapa = {}
  for (const p of pedidos || []) {
    const k = `${p.previsao || '9999'}|${p.rota || 'SEM ROTA'}`
    ;(mapa[k] ??= {
      chave: k, previsao: p.previsao || '', rota: p.rota || 'SEM ROTA',
      vendedor: p.vendedor || '', pedidos: [],
    }).pedidos.push(p)
  }
  const grupos = Object.values(mapa).sort((a, b) =>
    (a.previsao || '9999').localeCompare(b.previsao || '9999')
    || (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
    || a.rota.localeCompare(b.rota))

  if (!grupos.length) {
    return <div className="empty"><div className="big">📦</div>Nenhum pedido para acompanhar com esses filtros.</div>
  }

  return (
    <div className="qv">
      {grupos.map((g, gi) => {
        const cont = contaEtapasVendedor(g.pedidos)
        const totalItens = Object.values(cont).reduce((s, n) => s + n, 0)
        const entregues = cont.entregue || 0
        const atrasada = situacaoPrazo(g.previsao) === 'atrasado' && entregues < totalItens
        const novaData = gi === 0 || grupos[gi - 1].previsao !== g.previsao
        return (
          <div key={g.chave}>
            {novaData && (
              <div className={`qv-data${atrasada ? ' atrasado' : ''}`}>📅 {fmtData(g.previsao)}</div>
            )}
            <div className="qv-rota">
              <div className="qv-rota-top">
                <span className="qv-rota-nome">📍 {g.rota}</span>
                <span className="qv-rota-qtd">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
                {entregues === totalItens
                  ? <span className="qv-tudo">✓ rota entregue</span>
                  : <span className="qv-parcial">{entregues} de {totalItens} entregues</span>}
              </div>
              {/* pipeline: só as etapas que têm alguma coisa, na ordem do fluxo */}
              <div className="qv-pipe">
                {ETAPAS_VENDEDOR.filter((e) => cont[e.id]).map((e) => (
                  <span key={e.id} className={`qv-etapa${e.id === 'entregue' ? ' ok' : ''}`}>
                    {e.nome} <b>{cont[e.id]}</b>
                  </span>
                ))}
              </div>
              <div className="qv-cards">
                {g.pedidos
                  .slice()
                  .sort((a, b) => nomeCliente(a.cliente, clientes).localeCompare(nomeCliente(b.cliente, clientes)))
                  .map((p) => <CardPedido key={p.idVenda} p={p} clientes={clientes} />)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CardPedido({ p, clientes }) {
  const entregues = (p.itens || []).filter((it) => it.entregue)
  const parcial = entregues.length > 0 && entregues.length < (p.itens || []).length
  // uma remessa entregue guarda a baixa financeira; mostra a da última
  const ultima = entregues[entregues.length - 1]
  return (
    <div className="qv-card">
      <div className="qv-card-top">
        <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
        <span className="idv">#{p.idVenda}</span>
      </div>
      <div className="qv-card-meta">
        <span className="chip">📍 {p.cidade || '—'}</span>
        {parcial && <span className="chip rota-warn">entrega parcial</span>}
        {saiuParaEntrega(p) && (
          <span className="chip" title={p.saidaMotorista ? `com ${p.saidaMotorista}` : ''}>
            🚚 saiu {fmtDataHora(p.saidaEm)}
          </span>
        )}
        {ultima && (ultima.pago
          ? <span className="chip" style={{ color: 'var(--ok)' }}>💰 pago</span>
          : <span className="chip rota-warn">⏳ pendente de baixa</span>)}
        <span className="valor" style={{ marginLeft: 'auto' }}>{fmtMoeda(p.valorTotal)}</span>
      </div>
      <ul className="qv-itens">
        {(p.itens || []).map((it, i) => (
          <li key={i}>
            <span className="qv-item-nome"><SeloLinha linha={it.linha} />{it.produto}</span>
            <span className="q">{it.qtd}</span>
            <span className={`qv-item-etapa${it.entregue ? ' ok' : ''}`}>
              {it.entregue ? `✓ ${fmtData(it.entregueEm)}` : nomeEtapaVendedor(it.etapaVend)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
