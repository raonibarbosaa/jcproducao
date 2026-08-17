import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  indexaCienciasPorPedido, cienciaDoPedido, semCiencia, fmtDataHora,
  nomeCliente, previsaoDe, situacaoPrazo, fmtData, fmtMoeda, ORIGEM_NM, MODO_NM, linhaDoItem,
  filtraPedidos, vendedoresDe,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

// Tela do DESIGNER/DONO: acompanha a ciência dos vendedores. É SÓ LEITURA.
//
// ⚠️ Dono e designer NÃO dão ciência (decisão do dono em 17/08/2026) — a ciência
// é a assinatura de quem VENDEU o pedido, e assinada por outra pessoa ela não
// prova nada. O botão "✓ Conferir" saiu daqui e a regra do Firestore passou a
// aceitar criação só do perfil vendedor: sem isso, tirar o botão seria só
// esconder o caminho, não fechá-lo. As conferências ANTIGAS continuam
// aparecendo — apagar histórico é pior do que mostrar um registro que não se
// repete mais.
//
// A unidade é o PEDIDO, e a faixa da rota mostra quantos de quantos: dá para ver
// na hora se entrou pedido novo que o vendedor ainda não viu.
export default function Ciencia({ pedidos }) {
  const { clientes, vendedores } = useCadastros()
  const [ciencias, setCiencias] = useState([])
  const [abertos, setAbertos] = useState({})   // { "vendedor|rota": true }
  const [soPendentes, setSoPendentes] = useState(false)
  const [filtros, setFiltros] = useState({})

  const alternar = (k) => setAbertos((s) => ({ ...s, [k]: !s[k] }))

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ciencias'),
      (snap) => setCiencias(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler ciências:', e))
    return unsub
  }, [])

  const mapaC = indexaCienciasPorPedido(ciencias)
  const categorizados = (pedidos || []).filter((p) => p.status)
  const vendedoresFiltro = vendedoresDe(categorizados)
  const cat = filtraPedidos(categorizados, filtros, clientes)
  // pendente = o vendedor ainda não deu ciência. A conferência do designer saiu
  // da conta junto com o botão: cobrar uma pendência que ninguém pode mais
  // resolver deixaria a tela permanentemente vermelha.
  const pendente = (p) => !cienciaDoPedido(mapaC, 'vendedor', p.idVenda)

  const arvore = {}
  for (const p of cat) {
    if (soPendentes && !pendente(p)) continue
    const v = p.vendedor || '—'
    const r = p.rota || 'SEM ROTA'
    arvore[v] ??= {}
    arvore[v][r] ??= []
    arvore[v][r].push(p)
  }
  const vends = Object.keys(arvore).sort()
  const totalPendentes = cat.filter(pendente).length

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Ciência
          <small>
            quem assinou cada pedido ·{' '}
            {totalPendentes ? `${totalPendentes} sem ciência` : 'todos com ciência'}
          </small>
        </h1>
        <div className="spacer" />
        <button className={`btn${soPendentes ? ' primary' : ''}`} onClick={() => setSoPendentes((v) => !v)}>
          {soPendentes ? '☑' : '☐'} Só sem ciência
        </button>
      </div>

      <FiltrosBar filtros={filtros} setFiltros={setFiltros}
        vendedores={vendedoresFiltro} pedidos={categorizados} />

      {vends.length === 0 ? (
        <div className="empty"><div className="big">✍️</div>
          {soPendentes && cat.length
            ? 'Nenhuma pendência — todos os pedidos com ciência do vendedor.'
            // com filtro na tela, dizer "não há pedido" seria mentira
            : (categorizados.length ? 'Nenhum pedido com esses filtros.' : 'Nenhum pedido categorizado para conferir.')}
        </div>
      ) : (
        vends.map((v) => (
          <div key={v} className="group-block">
            <div className="group-head"><h3>{v}</h3></div>
            {Object.entries(arvore[v]).sort().map(([rota, ps]) => {
              const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
              const faltamV = semCiencia(mapaC, 'vendedor', ps)
              const faltamD = semCiencia(mapaC, 'designer', ps)
              const chave = v + '|' + rota
              const aberto = !!abertos[chave]
              return (
                <div key={rota} style={{ marginBottom: 14 }}>
                  <div className={`rota-band ${foraRota ? 'warn' : ''}`} style={{ cursor: 'pointer' }}
                    onClick={() => alternar(chave)}
                    title={aberto ? 'Recolher pedidos' : 'Ver pedidos'}>
                    <span className="rb-nome">{aberto ? '▾' : '▸'} 📍 {rota}</span>
                    <span className="rb-count">{ps.length} pedido(s)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '2px 2px 4px', alignItems: 'center' }}>
                    <Progresso titulo="Ciência do vendedor" total={ps.length} faltam={faltamV.length} />
                    {/* conferências antigas continuam contadas — o registro
                        existiu, some da conta seria reescrever o passado */}
                    {faltamD.length < ps.length && (
                      <Progresso titulo="Conferido (histórico)" total={ps.length} faltam={faltamD.length} />
                    )}
                  </div>
                  {aberto && (
                    <div className="cards" style={{ marginTop: 6 }}>
                      {ps.map((p) => (
                        <CardCiencia key={p.idVenda} p={p} clientes={clientes} vendedores={vendedores}
                          cv={cienciaDoPedido(mapaC, 'vendedor', p.idVenda)}
                          cd={cienciaDoPedido(mapaC, 'designer', p.idVenda)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </>
  )
}

function Progresso({ titulo, total, faltam }) {
  const ok = total - faltam
  return (
    <span className="chip" style={faltam ? null : { color: 'var(--ok)' }}>
      {faltam ? '' : '✓ '}{titulo}: {ok} de {total}
    </span>
  )
}

function CardCiencia({ p, clientes, vendedores, cv, cd }) {
  const previsao = previsaoDe(p, vendedores)
  const atrasado = situacaoPrazo(previsao) === 'atrasado'
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
          ? <span className="chip atrasado">Atrasado · {fmtData(previsao)}</span>
          : <span className="chip">{fmtData(previsao)}</span>}
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
      <div style={{ marginTop: 8 }}>
        <CienciaTag titulo="Ciência do vendedor" c={cv} />
        {cd && <CienciaTag titulo="Conferido (registro antigo)" c={cd} />}
      </div>
    </div>
  )
}

// Quem assinou, quando e de onde. É a razão de a ciência existir: sem o nome, a
// hora e o IP, o "✓" não prova nada — e era exatamente o que cabia no chip
// antigo, que só mostrava o e-mail espremido numa linha.
function CienciaTag({ titulo, c }) {
  if (!c) {
    return (
      <div className="ci-bloco pendente">
        <b>{titulo}</b>
        <span>⏳ ainda sem ciência</span>
      </div>
    )
  }
  return (
    <div className="ci-bloco">
      <b>✓ {titulo}</b>
      <span className="ci-quem">{c.porNome || c.porEmail || '—'}</span>
      {c.porEmail && c.porNome && <span className="ci-mail">{c.porEmail}</span>}
      <span>🕒 {fmtDataHora(c.quando)}</span>
      <span>🌐 IP {c.ip || 'não registrado'}</span>
    </div>
  )
}
