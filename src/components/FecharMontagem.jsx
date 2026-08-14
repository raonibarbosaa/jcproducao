import { useState } from 'react'
import {
  fmtQtd, arredondaQtd, qtdNaEtapa, unidadeDoMaterial, materialDoItem, nomeCliente,
} from '../utils.js'

// FECHAMENTO DA MONTAGEM EM VOLUMES.
// Quem embala é quem pesa: o operador cria um volume por vez com o peso/contagem
// que deu, e a SOMA dos volumes é a quantidade real produzida — que não precisa
// bater com a pedida. Não existe campo de "quanto deu": criar os volumes já diz.
//
// A pergunta sobre a sobra só aparece quando ela existe. Se os volumes somam
// menos que o lote, o operador é quem sabe se aquilo foi quebra de processo
// (encerra o item) ou se ainda falta produzir (o resto volta para a fila) — e é
// essa escolha que mantém a entrega parcial viva.
export default function FecharMontagem({ p, idx, clientes, itensCad, onFechar, onCancelar, salvando }) {
  const it = p.itens[idx]
  const naMontagem = qtdNaEtapa(p, idx, 'montagem')
  const un = unidadeDoMaterial(materialDoItem(it, itensCad)) || 'un'
  const decimal = un === 'kg'

  const [volumes, setVolumes] = useState([])
  const [peso, setPeso] = useState('')
  const [encerrar, setEncerrar] = useState(true)

  const soma = arredondaQtd(volumes.reduce((s, v) => s + v, 0))
  const resta = arredondaQtd(naMontagem - soma)
  const sobrou = resta > 0
  const excedeu = resta < 0

  function criarVolume() {
    const q = arredondaQtd(String(peso).replace(',', '.'))
    if (!(q > 0)) return
    setVolumes((v) => [...v, q])
    setPeso('')
  }
  function volumeUnico() {
    if (!(naMontagem > 0)) return
    setVolumes([naMontagem])
  }
  const remover = (n) => setVolumes((v) => v.filter((_, i) => i !== n))

  function concluir() {
    if (!volumes.length) return
    // sobrou e o operador diz que acabou → o lote inteiro é baixado (quebra).
    // sobrou e ainda falta produzir → baixa só o que foi embalado.
    const consumido = (!sobrou || encerrar) ? naMontagem : soma
    onFechar(volumes.map((q) => ({ qtd: q })), consumido)
  }

  return (
    <div className="assist-overlay" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="assist-panel" style={{ width: 'min(520px, 100%)' }}>
        <h3 style={{ marginTop: 0 }}>📦 Fechar montagem</h3>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 4 }}>
          {nomeCliente(p.cliente, clientes)} · #{p.idVenda}
        </div>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>{it.produto}</div>

        <div className="filter-pill" style={{ marginBottom: 14 }}>
          Na montagem: <b style={{ marginLeft: 4 }}>{fmtQtd(naMontagem)} {un}</b>
        </div>

        {volumes.length > 0 && (
          <ul className="vol-lista">
            {volumes.map((q, n) => (
              <li key={n}>
                <span>Volume {n + 1}</span>
                <span className="q">{fmtQtd(q)} {un}</span>
                <button className="mini-btn" title="Remover este volume"
                  onClick={() => remover(n)}>✕</button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
          <input className="filtro-input" style={{ width: 120 }} inputMode="decimal"
            placeholder={`Peso em ${un}`} value={peso}
            step={decimal ? '0.001' : '1'}
            onChange={(e) => setPeso(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && criarVolume()} />
          <button className="btn primary" onClick={criarVolume} disabled={!peso}>
            + Criar volume
          </button>
          {!volumes.length && (
            <button className="btn" onClick={volumeUnico} title="Um volume com tudo que está na montagem">
              tudo num volume só
            </button>
          )}
        </div>

        <div className="vol-resumo">
          <span><b>{volumes.length}</b> volume(s)</span>
          <span>embalado: <b>{fmtQtd(soma)} {un}</b></span>
          {sobrou && <span className="rota-warn">resta {fmtQtd(resta)} {un}</span>}
          {excedeu && <span style={{ color: 'var(--ok)' }}>
            {fmtQtd(-resta)} {un} a mais que o pedido
          </span>}
        </div>

        {sobrou && volumes.length > 0 && (
          <div className="vol-sobra">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Sobraram {fmtQtd(resta)} {un}. O que fazer?
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 6 }}>
              <input type="radio" className="card-check" checked={encerrar}
                onChange={() => setEncerrar(true)} />
              <span><b>Encerrar o item</b> — foi isso que deu (quebra de processo).
                O item sai da produção.</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" className="card-check" checked={!encerrar}
                onChange={() => setEncerrar(false)} />
              <span><b>Deixar pendente</b> — ainda falta produzir.
                Os {fmtQtd(resta)} {un} continuam na montagem.</span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn ok" disabled={!volumes.length || !!salvando} onClick={concluir}>
            {salvando ? 'Salvando…' : `Concluir → Expedição (${volumes.length} vol.)`}
          </button>
          <button className="btn" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
