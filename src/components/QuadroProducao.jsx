import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  ETAPAS_PROD, etapaDe, proximaEtapa, etapaAnterior, nomeEtapa,
  nomeCliente, fmtData, situacaoPrazo,
  linhaDoItem, acabamentoDoItem, fmtAcabamento,
} from '../utils.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import DataEntrega from './DataEntrega.jsx'

// Quadro por setor do fluxo da GRÁFICA (Fase A): Gráfica → Montagem → Expedição.
// O pedido anda como bloco. Cada avanço grava quem/quando. NÃO mostra valor (R$).
// Fase A: só dono/designer movem (perfil "operador" com liberação por setor vem depois).
export default function QuadroProducao({ pedidos, clientes }) {
  const { perfil, nome, setores } = useAuth()
  // dono/designer movem qualquer setor; operador só nos setores liberados (o de ORIGEM)
  const podeMoverEtapa = (etapa) => {
    if (perfil === 'dono' || perfil === 'designer') return true
    if (perfil === 'operador') return (setores || []).includes(etapa)
    return false
  }
  const [salvando, setSalvando] = useState('')

  const porEtapa = {}
  for (const e of ETAPAS_PROD) porEtapa[e.id] = []
  // pedido expedido sai do quadro (segue pela Rota → Entregues)
  for (const p of pedidos) {
    if (p.etapa === 'expedido' || p.etapa === 'entregue') continue
    porEtapa[etapaDe(p)].push(p)
  }
  for (const e of ETAPAS_PROD) porEtapa[e.id].sort((a, b) => (a.previsao || '').localeCompare(b.previsao || ''))

  async function mover(p, destino) {
    if (!destino || salvando) return
    setSalvando(p.idVenda)
    try {
      await updateDoc(doc(db, 'pedidos', p.idVenda), {
        etapa: destino,
        etapaPor: nome || '',
        etapaEm: new Date().toISOString(),
      })
    } catch (e) {
      console.error('Erro ao mover etapa:', e)
      alert('Erro ao mover o pedido: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  return (
    <div className="quadro">
      {ETAPAS_PROD.map((e) => (
        <div key={e.id} className="quadro-col">
          <div className="qc-head">{e.nome} <span className="qc-count">{porEtapa[e.id].length}</span></div>
          <div className="qc-body">
            {porEtapa[e.id].length === 0 && <div className="qc-vazio">— nenhum pedido —</div>}
            {porEtapa[e.id].map((p) => {
              const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
              const prox = proximaEtapa(e.id)
              const ant = etapaAnterior(e.id)
              return (
                <div key={p.idVenda} className={`qcard ${atrasado ? 'atrasado' : ''}`}>
                  <div className="qcard-top">
                    <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
                    <span className="idv">#{p.idVenda}</span>
                  </div>
                  <div className="qcard-meta">
                    <span className="chip">📍 {p.rota || p.cidade || '—'}</span>
                    <DataEntrega p={p} atrasado={atrasado} />
                  </div>
                  <ul className="itens">
                    {(p.itens || []).map((it, i) => (
                      <li key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span>{it.produto}</span><span className="q">{it.qtd}</span>
                        </span>
                        {linhaDoItem(p, i) === 'GRAFICA' && (
                          <span className="acab-tag">🏷 {fmtAcabamento(acabamentoDoItem(p, i))}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {p.etapaPor && (
                    <div className="qcard-log">último avanço: {p.etapaPor}{p.etapaEm ? ` · ${fmtData(p.etapaEm)}` : ''}</div>
                  )}
                  {podeMoverEtapa(e.id) && (
                    <div className="qcard-acoes no-print">
                      {ant && (
                        <button className="mini-btn" title={`Voltar para ${nomeEtapa(ant)}`}
                          disabled={salvando === p.idVenda} onClick={() => mover(p, ant)}>←</button>
                      )}
                      {prox && (
                        <button className="btn ok qc-avancar" disabled={salvando === p.idVenda}
                          onClick={() => mover(p, prox)}>
                          {salvando === p.idVenda ? 'Salvando…' : `Concluir → ${nomeEtapa(prox)}`}
                        </button>
                      )}
                      {!prox && e.id === 'expedicao' && (
                        <button className="btn ok qc-avancar" disabled={salvando === p.idVenda}
                          onClick={() => mover(p, 'expedido')} title="Sai do quadro e segue para a Rota/Entrega">
                          {salvando === p.idVenda ? 'Salvando…' : '✓ Expedir'}
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
  )
}
