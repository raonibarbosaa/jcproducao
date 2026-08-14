import { useState } from 'react'
import {
  CAMPOS_ERRO, nomeCliente, fmtQtd, unidadeDoMaterial, materialDoItem,
} from '../utils.js'

// REPORTAR ERRO — quem está com a peça na mão vê que o papel e o sistema não
// batem. O vendedor lançou errado no Posseidon e a correção foi feita à mão no
// papel que chegou na fábrica.
//
// Os dois campos que importam são "no sistema" e "no papel": sem o valor certo,
// quem for resolver recebe um aviso que não dá para agir. O do sistema já vem
// preenchido, porque é o que a tela mostra.
export default function ReportarErro({ p, idx, clientes, itensCad, onEnviar, onCancelar, salvando }) {
  const it = idx == null ? null : p.itens?.[idx]
  const un = it ? (unidadeDoMaterial(materialDoItem(it, itensCad)) || 'un') : ''
  const [campo, setCampo] = useState('quantidade')
  const [noSistema, setNoSistema] = useState(it ? `${fmtQtd(it.qtd)} ${un}`.trim() : '')
  const [noPapel, setNoPapel] = useState('')
  const [obs, setObs] = useState('')

  const podeEnviar = noPapel.trim().length > 0

  return (
    <div className="assist-overlay" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="assist-panel" style={{ width: 'min(520px, 100%)' }}>
        <h3 style={{ marginTop: 0 }}>⚠ Reportar erro no pedido</h3>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {nomeCliente(p.cliente, clientes)} · #{p.idVenda}
        </div>
        {it && <div style={{ fontWeight: 700, margin: '4px 0 14px' }}>{it.produto}</div>}

        <div className="field" style={{ marginBottom: 12 }}>
          <label>O que está errado</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CAMPOS_ERRO.map((c) => (
              <button key={c.id} className="modo-btn" onClick={() => setCampo(c.id)}
                style={campo === c.id ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
                {c.nm}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label>No sistema (errado)</label>
            <input value={noSistema} onChange={(e) => setNoSistema(e.target.value)}
              placeholder="ex.: 12 un" />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label>No papel (correto)</label>
            <input value={noPapel} onChange={(e) => setNoPapel(e.target.value)}
              placeholder={campo === 'quantidade' ? `ex.: 20 ${un}` : 'o que está escrito'} autoFocus />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Observação (opcional)</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="algo que ajude quem for resolver" />
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>
          O item <b>não para</b> de andar na produção — o card só fica marcado com ⚠ até
          alguém resolver. Se for para segurar, avise o responsável.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn ok" disabled={!podeEnviar || !!salvando}
            onClick={() => onEnviar({ campo, noSistema, noPapel, obs })}>
            {salvando ? 'Enviando…' : '⚠ Reportar'}
          </button>
          <button className="btn" onClick={onCancelar}>Cancelar</button>
        </div>
        {!podeEnviar && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
            Preencha o que está no papel — sem isso quem for resolver não sabe o valor certo.
          </div>
        )}
      </div>
    </div>
  )
}
