import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  nomeEtapaItem, nomeCliente, casaBusca, nomeDoMaterial, montagemDoMaterial,
  MONTAGENS, PAINEIS_QUADRO,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'

const LIMITE = 500 // últimos movimentos — o suficiente para "quem mexeu nisso?"

function fmtQuando(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// 'montagem' + material vira "Montagem Papel" — é assim que o chão de fábrica chama
function nomeEtapa(etapa, material) {
  if (etapa === 'montagem') {
    const m = MONTAGENS.find((x) => x.id === montagemDoMaterial(material))
    return m ? m.nome : 'Montagem'
  }
  return nomeEtapaItem(etapa) || etapa || '—'
}

// Registro do que aconteceu no quadro: cada ITEM movido gera uma linha, gravada
// no mesmo batch da mudança de etapa. Página só do DONO (as regras do Firestore
// impõem o mesmo no servidor) e só de leitura — ninguém edita nem apaga.
export default function Auditoria() {
  const { clientes } = useCadastros()
  const [regs, setRegs] = useState([])
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [quem, setQuem] = useState('')
  const [setor, setSetor] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'auditoria'), orderBy('quando', 'desc'), limit(LIMITE))
    const unsub = onSnapshot(q,
      (snap) => { setRegs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setCarregando(false) },
      (e) => { console.error('Erro ao ler auditoria:', e); setErro(e.message); setCarregando(false) })
    return unsub
  }, [])

  const pessoas = useMemo(
    () => [...new Set(regs.map((r) => r.porNome || r.porEmail).filter(Boolean))].sort(),
    [regs])

  const lista = regs.filter((r) => {
    if (quem && (r.porNome || r.porEmail) !== quem) return false
    if (setor) {
      // o filtro casa tanto a origem quanto o destino: "o que passou pela montagem papel"
      const ids = [r.de, r.para].map((e) => (e === 'montagem' ? `montagem:${montagemDoMaterial(r.material)}` : e))
      if (!ids.includes(setor)) return false
    }
    if (de && (r.quando || '') < de) return false
    if (ate && (r.quando || '') > `${ate}T23:59:59`) return false
    if (busca && !casaBusca(busca,
      r.idVenda, r.cliente, nomeCliente(r.cliente, clientes), r.produto, r.porNome, r.porEmail,
    )) return false
    return true
  })

  const inp = {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', color: 'var(--text)',
  }

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Auditoria
          <small>
            {carregando ? 'carregando…'
              : `${lista.length}${lista.length !== regs.length ? ` de ${regs.length}` : ''} movimento(s)` +
                (regs.length === LIMITE ? ` · últimos ${LIMITE}` : '')}
          </small>
        </h1>
      </div>

      <div className="filtros-bar no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="Pedido, cliente, produto ou pessoa…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={inp} value={quem} onChange={(e) => setQuem(e.target.value)}>
          <option value="">Todas as pessoas</option>
          {pessoas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={inp} value={setor} onChange={(e) => setSetor(e.target.value)}>
          <option value="">Todos os setores</option>
          {PAINEIS_QUADRO.map((pa) => <option key={pa.id} value={pa.id}>{pa.nome}</option>)}
        </select>
        <input type="date" style={inp} value={de} onChange={(e) => setDe(e.target.value)} title="De" />
        <input type="date" style={inp} value={ate} onChange={(e) => setAte(e.target.value)} title="Até" />
        {(busca || quem || setor || de || ate) && (
          <button className="btn" onClick={() => { setBusca(''); setQuem(''); setSetor(''); setDe(''); setAte('') }}>
            Limpar
          </button>
        )}
      </div>

      {erro && <div className="empty"><div className="big">🔒</div>Não foi possível ler a auditoria: {erro}</div>}

      {!erro && !carregando && lista.length === 0 && (
        <div className="empty"><div className="big">📋</div>
          {regs.length ? 'Nenhum movimento com esses filtros.' : 'Nenhum movimento registrado ainda.'}
        </div>
      )}

      {lista.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="rel-tab">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Pedido</th>
                <th>Item</th>
                <th className="q">Qtd</th>
                <th>Movimento</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtQuando(r.quando)}</td>
                  <td>
                    {r.porNome || r.porEmail || '—'}
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {r.perfil || '—'}{r.ip ? ` · ${r.ip}` : ''}
                    </div>
                  </td>
                  <td>
                    #{r.idVenda}
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {nomeCliente(r.cliente, clientes)}
                    </div>
                  </td>
                  <td>
                    <SeloLinha linha={r.linha} />{r.produto}
                    {r.material && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{nomeDoMaterial(r.material)}</div>
                    )}
                  </td>
                  <td className="q">{r.qtd || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {nomeEtapa(r.de, r.material)} <b>→</b> {nomeEtapa(r.para, r.material)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
