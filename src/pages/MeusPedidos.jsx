import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  previsaoDe, fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM,
  nomeCliente, MODO_NM, linhaDoItem, pegarIP,
  indexaCienciasPorPedido, cienciaDoPedido, semCiencia, docCiencia, fmtDataHora,
  unificaPedidosVendedor, filtraPedidos, resumoFiltros, ordemRota,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import QuadroVendedor from '../components/QuadroVendedor.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

// Tela do perfil VENDEDOR: vê apenas os próprios pedidos (filtrados no App e
// impostos pelas regras), agrupados por rota. A CIÊNCIA é POR PEDIDO — o botão
// da rota é só um atalho que dá ciência nos que ainda faltam. Assim um pedido
// que entra na rota depois nunca fica coberto por uma ciência que não o viu.
export default function MeusPedidos({ pedidos }) {
  // sem cadastro de Itens: as três montagens viram uma só na visão do vendedor,
  // então o material do item deixou de importar aqui
  const { vendedores, clientes } = useCadastros()
  const { user, vendedorNome, nome } = useAuth()
  const [ciencias, setCiencias] = useState([])
  const [entregues, setEntregues] = useState([])
  const [vista, setVista] = useState('lista')   // 'lista' (ciência) | 'quadro' (acompanhar)
  const [filtros, setFiltros] = useState({})    // só no quadro
  const [salvando, setSalvando] = useState('')

  useEffect(() => {
    if (!vendedorNome) return
    const q = query(collection(db, 'ciencias'), where('vendedor', '==', vendedorNome))
    const unsub = onSnapshot(q, (snap) => setCiencias(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler ciências:', e))
    return unsub
  }, [vendedorNome])

  // entregas do PRÓPRIO vendedor — o filtro não é enfeite: a regra do Firestore
  // só aceita a consulta quando ela vem restrita ao vendedor do usuário.
  useEffect(() => {
    if (!vendedorNome) return
    const q = query(collection(db, 'entregues'), where('vendedor', '==', vendedorNome))
    const unsub = onSnapshot(q, (snap) => setEntregues(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler entregas:', e))
    return unsub
  }, [vendedorNome])

  const mapaC = indexaCienciasPorPedido(ciencias)

  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, vendedores) }))
  const cat = base.filter((p) => p.status)

  const arvore = {}
  for (const p of cat) {
    const r = p.rota || 'SEM ROTA'
    arvore[r] ??= []
    arvore[r].push(p)
  }
  const rotas = Object.keys(arvore).sort()

  // ---------- quadro de acompanhamento ----------
  // O pedido vive partido entre duas coleções: o que está em produção fica em
  // `pedidos`, o que já saiu vira remessa em `entregues` (e some de `pedidos`
  // quando saiu tudo). Aqui os dois viram um pedido só, item a item.
  const entreguesBase = entregues.map((e) => ({ ...e, previsao: previsaoDe(e, vendedores) }))
  const unificados = unificaPedidosVendedor(base, entreguesBase)
  const doQuadro = filtraPedidos(unificados, filtros, clientes)
  const rotasFiltro = [...new Set(unificados.map((p) => p.rota || 'SEM ROTA'))]
    .sort((a, b) => (ordemRota(vendedorNome, a, vendedores) - ordemRota(vendedorNome, b, vendedores))
      || a.localeCompare(b))

  // dá ciência num pedido só ou em todos os que faltam na rota (mesmo caminho)
  async function darCiencia(ps, marca) {
    const faltam = semCiencia(mapaC, 'vendedor', ps)
    if (!faltam.length || salvando) return
    const msg = faltam.length === 1
      ? `Confirmar que você viu e está ciente do pedido #${faltam[0].idVenda}?`
      : `Confirmar que você viu e está ciente dos ${faltam.length} pedido(s)?`
    if (!confirm(msg)) return
    setSalvando(marca)
    try {
      const ip = await pegarIP()
      const quem = { porUid: user.uid, porEmail: user.email, porNome: nome || user.email, ip }
      for (let i = 0; i < faltam.length; i += 450) {
        const batch = writeBatch(db)
        for (const p of faltam.slice(i, i + 450)) {
          batch.set(doc(collection(db, 'ciencias')), docCiencia({
            tipo: 'vendedor', vendedor: vendedorNome, rota: p.rota || '', idVenda: p.idVenda, quem,
          }))
        }
        await batch.commit()
      }
    } catch (e) {
      alert('Não foi possível registrar a ciência: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Meus Pedidos
          <small>{vendedorNome || nome} · {cat.length} pedido(s)</small>
        </h1>
        <div className="spacer" />
        <div className="vista-toggle no-print">
          <button className={`btn${vista === 'lista' ? ' primary' : ''}`} onClick={() => setVista('lista')}
            title="Conferir e dar ciência nos pedidos">☰ Meus pedidos</button>
          <button className={`btn${vista === 'quadro' ? ' primary' : ''}`} onClick={() => setVista('quadro')}
            title="Acompanhar a produção até a entrega">▦ Acompanhar</button>
        </div>
        {vista === 'lista' && <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>}
      </div>

      {vista === 'quadro' && (
        <div className="screen-only">
          <FiltrosBar filtros={filtros} setFiltros={setFiltros} semVendedor rotas={rotasFiltro} />
          {resumoFiltros(filtros) && (
            <div className="qv-resumo">
              {doQuadro.length} de {unificados.length} pedido(s) · {resumoFiltros(filtros)}
            </div>
          )}
          <QuadroVendedor pedidos={doQuadro} clientes={clientes} />
        </div>
      )}

      {vista === 'lista' && (cat.length === 0 ? (
        <div className="empty"><div className="big">📦</div>Nenhum pedido para você no momento.</div>
      ) : (
        rotas.map((rota) => {
          const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
          const ps = arvore[rota]
          const faltam = semCiencia(mapaC, 'vendedor', ps)
          const cientes = ps.length - faltam.length
          return (
            <div key={rota} style={{ marginBottom: 16 }}>
              <div className={`rota-band ${foraRota ? 'warn' : ''}`}>
                <span className="rb-nome">📍 {rota}</span>
                <span className="rb-count">{ps.length} pedido(s)</span>
                <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="chip" style={faltam.length ? null : { color: 'var(--ok)' }}>
                    {faltam.length ? '' : '✓ '}{cientes} de {ps.length} com ciência
                  </span>
                  {faltam.length > 0 && (
                    <button className="btn ok" disabled={!!salvando}
                      onClick={() => darCiencia(ps, rota)}>
                      {salvando === rota
                        ? 'Registrando…'
                        : `✓ Dar ciência ${faltam.length === ps.length ? 'nesta rota' : `nos ${faltam.length} que faltam`}`}
                    </button>
                  )}
                </div>
              </div>
              <div className="cards">
                {ps.map((p) => (
                  <CardMeu key={p.idVenda} p={p} clientes={clientes}
                    c={cienciaDoPedido(mapaC, 'vendedor', p.idVenda)}
                    salvando={salvando}
                    onCiencia={() => darCiencia([p], `p:${p.idVenda}`)} />
                ))}
              </div>
            </div>
          )
        })
      ))}
    </>
  )
}

function CardMeu({ p, clientes, c, salvando, onCiencia }) {
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  return (
    <div className={`card ${atrasado ? 'atrasado' : 'em_dia'}`}>
      <div className="card-top">
        <div className="cliente">{nomeCliente(p.cliente, clientes)}</div>
        <div className="idv">#{p.idVenda}</div>
      </div>
      <div className="meta-row">
        {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
        <span className="chip">📍 {p.cidade || '—'}</span>
        {atrasado
          ? <span className="chip atrasado">Atrasado · {fmtData(p.previsao)}</span>
          : <span className="chip">{fmtData(p.previsao)}</span>}
      </div>
      <ul className="itens">
        {(p.itens || []).map((it, i) => (
          <li key={i}>
            <span>{it.produto} <span className="g">{MODO_NM[linhaDoItem(p, i)] || ''}</span></span>
            <span className="q">{it.qtd}</span>
          </li>
        ))}
      </ul>
      <div className="valor" style={{ marginTop: 8 }}>{fmtMoeda(p.valorTotal)}</div>
      <div className="no-print" style={{ marginTop: 8 }}>
        {c
          ? <span className="chip" style={{ color: 'var(--ok)' }} title={c.porEmail || ''}>
              ✓ ciência em {fmtDataHora(c.quando)}
            </span>
          : <button className="btn ok" style={{ width: '100%' }} disabled={!!salvando}
              onClick={onCiencia}>
              {salvando === `p:${p.idVenda}` ? 'Registrando…' : '✓ Dar ciência neste pedido'}
            </button>}
      </div>
    </div>
  )
}
