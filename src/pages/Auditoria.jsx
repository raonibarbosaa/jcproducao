import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, limit, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  nomeEtapaItem, nomeCliente, casaBusca, nomeDoMaterial, montagemDoMaterial,
  MONTAGENS, PAINEIS_QUADRO,
  quemFez, resumoBaixasEscritorio, fmtPorMaterial, rotuloMes, ORIGEM_BAIXA,
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
  const [origem, setOrigem] = useState('')
  // FASE D do Controle de entrega: TODAS as baixas do escritório (não só as
  // últimas 500), para o resumo por setor × mês. `where` só, sem orderBy —
  // não exige índice composto; são poucas por mês e o resumo ordena sozinho.
  const [baixasEsc, setBaixasEsc] = useState([])
  useEffect(() => {
    const q = query(collection(db, 'auditoria'), where('origem', '==', ORIGEM_BAIXA.ESCRITORIO))
    return onSnapshot(q,
      (snap) => setBaixasEsc(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler baixas do escritório:', e))
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'auditoria'), orderBy('quando', 'desc'), limit(LIMITE))
    const unsub = onSnapshot(q,
      (snap) => { setRegs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setCarregando(false) },
      (e) => { console.error('Erro ao ler auditoria:', e); setErro(e.message); setCarregando(false) })
    return unsub
  }, [])

  const pessoas = useMemo(
    () => [...new Set(regs.map(quemFez).filter(Boolean))].sort(),
    [regs])

  const lista = regs.filter((r) => {
    if (quem && quemFez(r) !== quem) return false
    if (origem === 'fabrica' && r.origem === ORIGEM_BAIXA.ESCRITORIO) return false
    if (origem === 'escritorio' && r.origem !== ORIGEM_BAIXA.ESCRITORIO) return false
    if (setor) {
      // o filtro casa tanto a origem quanto o destino: "o que passou pela montagem papel"
      const ids = [r.de, r.para].map((e) => (e === 'montagem' ? `montagem:${montagemDoMaterial(r.material)}` : e))
      if (!ids.includes(setor)) return false
    }
    if (de && (r.quando || '') < de) return false
    if (ate && (r.quando || '') > `${ate}T23:59:59`) return false
    if (busca && !casaBusca(busca,
      r.idVenda, r.cliente, nomeCliente(r.cliente, clientes), r.produto, r.porNome, r.porEmail, r.executorNome,
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
        <select style={inp} value={origem} onChange={(e) => setOrigem(e.target.value)}>
          <option value="">Fábrica e escritório</option>
          <option value="fabrica">🏭 Só a fábrica (quadro)</option>
          <option value="escritorio">🏢 Só o escritório (Controle de entrega)</option>
        </select>
        <input type="date" style={inp} value={de} onChange={(e) => setDe(e.target.value)} title="De" />
        <input type="date" style={inp} value={ate} onChange={(e) => setAte(e.target.value)} title="Até" />
        {(busca || quem || setor || de || ate || origem) && (
          <button className="btn" onClick={() => { setBusca(''); setQuem(''); setSetor(''); setDe(''); setAte(''); setOrigem('') }}>
            Limpar
          </button>
        )}
      </div>

      {!erro && <ResumoBaixasEscritorio regs={baixasEsc} />}

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
                    {quemFez(r) || '—'}
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {/* no tablet, o logado é o APARELHO: diz onde a baixa foi dada */}
                      {r.posto ? `📟 ${r.porNome || 'tablet'}` : (r.perfil || '—')}{r.ip ? ` · ${r.ip}` : ''}{r.origem === ORIGEM_BAIXA.ESCRITORIO ? ' · 🏢 escritório' : ''}
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

// FASE D — o que a fábrica NÃO baixou e o escritório teve que tirar de cada
// setor. Por mês do lançamento. Quantidade por material (kg e un não somam).
// Setor no topo = quem mais deixa de dar baixa no tablet.
export function ResumoBaixasEscritorio({ regs }) {
  const [mes, setMes] = useState('')
  const meses = useMemo(() => resumoBaixasEscritorio(regs).meses, [regs])
  const mesAtivo = mes || meses[0] || ''
  const r = useMemo(() => resumoBaixasEscritorio(regs, { mes: mesAtivo }), [regs, mesAtivo])
  if (!regs?.length) return null
  return (
    <div className="card aud-esc">
      <div className="card-top" style={{ alignItems: 'center' }}>
        <div>
          <div className="cliente">🏢 Baixas do escritório por setor</div>
          <div className="idv">
            {r.totais.itens} item(ns) de {r.totais.pedidos} pedido(s) que a fábrica não baixou
            {r.totais.semPesagem > 0 && <> · {r.totais.semPesagem} sem pesagem</>}
          </div>
        </div>
        <select className="filtro-input no-print" value={mesAtivo} onChange={(e) => setMes(e.target.value)}>
          {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </select>
      </div>
      {r.setores.length === 0
        ? <div className="loc-dica">Nenhuma baixa do escritório em {rotuloMes(mesAtivo)}.</div>
        : (
          <table className="rel-tab">
            <thead><tr><th>Setor de onde saiu</th><th className="q">Itens</th><th className="q">Pedidos</th><th>Quantidade</th></tr></thead>
            <tbody>
              {r.setores.map((g) => (
                <tr key={g.chave}>
                  <td><b>{g.onde}</b>{g.semPesagem > 0 && <small style={{ color: 'var(--warn)' }}> · {g.semPesagem} sem pesagem</small>}</td>
                  <td className="q">{g.itens}</td>
                  <td className="q">{g.pedidos}</td>
                  <td>{fmtPorMaterial(g.porMaterial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <div className="loc-dica" style={{ marginTop: 8, marginBottom: 0 }}>
        Cada linha é um item que o escritório lançou no Controle de entrega sem a fábrica ter dado baixa.
        O setor no topo é o que mais deixa de registrar no tablet.
      </div>
    </div>
  )
}
