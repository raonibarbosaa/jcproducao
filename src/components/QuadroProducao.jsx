import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  COLUNAS_QUADRO, etapaDoItem, proximaEtapaItem, etapaAnteriorItem, nomeEtapaItem,
  mapaEtapasCom, normSetor, MODO_COR,
  nomeCliente, fmtData, fmtMoeda, situacaoPrazo,
  linhaDoItem, acabamentoDoItem, acabamentoItemOk, fmtAcabamento, valorDosItens, logEtapaItem,
} from '../utils.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import DataEntrega from './DataEntrega.jsx'
import SeloLinha from './SeloLinha.jsx'

// Quadro de produção POR ITEM, um PAINEL POR LINHA (aba SILK/GLICHE/GRÁFICA):
// cada painel mostra [linha] → Montagem → Expedição só com os itens daquela linha.
// O item é a unidade — itens do mesmo pedido que estão na mesma etapa aparecem
// juntos num card; quando um adianta, o card se divide sozinho.
// NÃO mostra valor para operador/designer/expedição (só dono e financeiro).
export default function QuadroProducao({ pedidos, clientes, linha }) {
  const { perfil, nome, setores } = useAuth()
  const ehStaff = perfil === 'dono' || perfil === 'designer'
  const veValor = perfil === 'dono' || perfil === 'financeiro'
  // setores que este usuário pode MOVER: expedicao = só 'expedicao'; operador = liberados dele
  const setoresOp = perfil === 'expedicao'
    ? ['expedicao']
    : (perfil === 'operador' ? (setores || []).map(normSetor) : [])
  const podeMoverEtapa = (etapa) => ehStaff || setoresOp.includes(etapa)
  // o painel é de UMA linha: a coluna dela + Montagem + Expedição.
  // Staff, expedição e financeiro veem as três (expedição só age na Expedição;
  // financeiro é só leitura); operador vê só os setores que opera.
  let colunas = COLUNAS_QUADRO.filter((c) => !c.linha || c.id === linha)
  if (!(ehStaff || perfil === 'expedicao' || perfil === 'financeiro')) {
    colunas = colunas.filter((c) => setoresOp.includes(c.id))
  }
  const [salvando, setSalvando] = useState('')

  // monta os cards: um por (pedido × etapa), com os índices dos itens que estão ali
  const porEtapa = {}
  for (const c of COLUNAS_QUADRO) porEtapa[c.id] = []
  let aguardandoAcab = 0
  for (const p of pedidos) {
    const grupos = {}
    ;(p.itens || []).forEach((_, i) => {
      if (linhaDoItem(p, i) !== linha) return   // painel desta linha só (item sem linha fica na Triagem)
      const et = etapaDoItem(p, i)
      if (et === 'expedido') return             // já saiu do quadro (segue pela Rota)
      // item de gráfica sem laminação não entra — o designer precisa fechar na Triagem
      if (linha === 'GRAFICA' && !acabamentoItemOk(acabamentoDoItem(p, i))) { aguardandoAcab++; return }
      ;(grupos[et] ??= []).push(i)
    })
    for (const [et, idxs] of Object.entries(grupos)) {
      if (porEtapa[et]) porEtapa[et].push({ p, idxs })
    }
  }
  for (const c of COLUNAS_QUADRO) {
    porEtapa[c.id].sort((a, b) => (a.p.previsao || '').localeCompare(b.p.previsao || ''))
  }

  // move os itens escolhidos (o card inteiro ou um item só) para outra etapa
  async function mover(p, idxs, destino, marca) {
    if (!destino || salvando) return
    setSalvando(marca)
    try {
      await updateDoc(doc(db, 'pedidos', p.idVenda), { etapas: mapaEtapasCom(p, idxs, destino, nome) })
    } catch (e) {
      console.error('Erro ao mover etapa:', e)
      alert('Erro ao mover: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  if (!colunas.length) {
    return <div className="empty"><div className="big">🏭</div>Você não tem setores de produção liberados. Fale com o administrador.</div>
  }

  return (
    <>
      {aguardandoAcab > 0 && (
        <div className="aviso-acab no-print">
          ⚠ {aguardandoAcab} item(ns) de gráfica ainda sem <b>laminação</b> — marque na Triagem para eles entrarem no quadro.
        </div>
      )}
      <div className="quadro">
        {colunas.map((c) => (
          <div key={c.id} className="quadro-col">
            <div className="qc-head" style={c.linha ? { borderLeft: `4px solid ${MODO_COR[c.id]}` } : null}>
              {c.nome} <span className="qc-count">{porEtapa[c.id].length}</span>
            </div>
            <div className="qc-body">
              {porEtapa[c.id].length === 0 && <div className="qc-vazio">— nada aqui —</div>}
              {porEtapa[c.id].map(({ p, idxs }) => {
                const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
                const prox = proximaEtapaItem(c.id)
                const marca = `${p.idVenda}|${c.id}`
                const parcial = idxs.length < (p.itens || []).length
                const valor = valorDosItens(p, idxs)
                return (
                  <div key={marca} className={`qcard ${atrasado ? 'atrasado' : ''}`}>
                    <div className="qcard-top">
                      <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
                      <span className="idv">#{p.idVenda}</span>
                    </div>
                    <div className="qcard-meta">
                      <span className="chip">📍 {p.rota || p.cidade || '—'}</span>
                      <DataEntrega p={p} atrasado={atrasado} />
                      {parcial && (
                        <span className="chip" title="Os outros itens deste pedido estão em outra etapa">
                          {idxs.length} de {(p.itens || []).length} itens
                        </span>
                      )}
                    </div>
                    <ul className="itens">
                      {idxs.map((i) => {
                        const it = p.itens[i]
                        const antItem = etapaAnteriorItem(c.id, linha)
                        return (
                          <li key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                              {/* o selo da linha anda junto com o produto em toda etapa */}
                              <span><SeloLinha linha={linha} />{it.produto}</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span className="q">{it.qtd}</span>
                                {/* avança/volta SÓ este item — é o que separa o card em dois */}
                                {podeMoverEtapa(c.id) && idxs.length > 1 && (
                                  <span style={{ display: 'inline-flex', gap: 2 }}>
                                    {antItem && (
                                      <button className="mini-btn" title={`Voltar só este item para ${nomeEtapaItem(antItem)}`}
                                        disabled={!!salvando} onClick={() => mover(p, [i], antItem, marca)}>←</button>
                                    )}
                                    {prox && (
                                      <button className="mini-btn" title={`Avançar só este item para ${nomeEtapaItem(prox)}`}
                                        disabled={!!salvando} onClick={() => mover(p, [i], prox, marca)}>→</button>
                                    )}
                                  </span>
                                )}
                              </span>
                            </span>
                            {linha === 'GRAFICA' && (
                              <span className="acab-tag">🏷 {fmtAcabamento(acabamentoDoItem(p, i))}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {veValor && (
                      <div className="qcard-valor">
                        {valor !== null
                          ? fmtMoeda(valor)
                          : <span title="A planilha do Posseidon não traz valor por item">{fmtMoeda(p.valorTotal)} <small>total do pedido</small></span>}
                      </div>
                    )}
                    {(() => {
                      const l = idxs.map((i) => logEtapaItem(p, i)).find(Boolean)
                      return l ? <div className="qcard-log">último avanço: {l.por}{l.em ? ` · ${fmtData(l.em)}` : ''}</div> : null
                    })()}
                    {podeMoverEtapa(c.id) && (
                      <div className="qcard-acoes no-print">
                        {/* coluna de linha é o começo do fluxo — só Montagem/Expedição voltam */}
                        {!c.linha && (
                          <button className="mini-btn" title={`Voltar ${idxs.length > 1 ? 'os itens' : 'o item'} para a etapa anterior`}
                            disabled={!!salvando}
                            onClick={() => mover(p, idxs, etapaAnteriorItem(c.id, linha), marca)}
                          >←</button>
                        )}
                        {prox && prox !== 'expedido' && (
                          <button className="btn ok qc-avancar" disabled={!!salvando}
                            onClick={() => mover(p, idxs, prox, marca)}>
                            {salvando === marca ? 'Salvando…' : `Concluir → ${nomeEtapaItem(prox)}`}
                          </button>
                        )}
                        {prox === 'expedido' && (
                          <button className="btn ok qc-avancar" disabled={!!salvando}
                            title="Sai do quadro e segue para a Rota/Entrega"
                            onClick={() => mover(p, idxs, 'expedido', marca)}>
                            {salvando === marca ? 'Salvando…' : '✓ Expedir'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
