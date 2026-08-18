import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  previsaoDe, fmtData, fmtMoeda, situacaoPrazo, ORIGEM_NM,
  nomeCliente, MODO_NM, linhaDoItem, pegarIP,
  indexaCienciasPorPedido, cienciaDoPedido, docCiencia, fmtDataHora,
  unificaPedidosVendedor, filtraPedidos, resumoFiltros, ordemRota,
  indexaProblemas, problemasDoPedido, nomeCampoErro, ehErroEntrega, docProblema,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import QuadroVendedor from '../components/QuadroVendedor.jsx'
import ReportarErro from '../components/ReportarErro.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

// Tela do perfil VENDEDOR: vê apenas os próprios pedidos (filtrados no App e
// impostos pelas regras), agrupados por rota. A CIÊNCIA é POR PEDIDO, um a um:
// ela existe para provar que o vendedor viu AQUELE pedido, e o atalho da rota
// inteira assinava dezenas que ninguém tinha olhado.
export default function MeusPedidos({ pedidos, problemas }) {
  // sem cadastro de Itens: as três montagens viram uma só na visão do vendedor,
  // então o material do item deixou de importar aqui
  const { vendedores, clientes } = useCadastros()
  const { user, vendedorNome, nome, perfil } = useAuth()
  const [ciencias, setCiencias] = useState([])
  const [entregues, setEntregues] = useState([])
  const [vista, setVista] = useState('lista')   // 'lista' (ciência) | 'quadro' (acompanhar)
  const [filtros, setFiltros] = useState({})    // só no quadro
  const [filtrosLista, setFiltrosLista] = useState({})   // só na lista (ciência)
  // a lista abre na FILA: o que ele ainda não assinou
  const [soSemCiencia, setSoSemCiencia] = useState(true)
  const [salvando, setSalvando] = useState('')
  // pedido que ele está reportando ("já foi entregue" e os outros erros)
  const [reportando, setReportando] = useState(null)

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
  // erros reportados nos pedidos dele: os da fábrica (que ele corrige no
  // Posseidon) e os que ele mesmo mandou — inclusive o "já foi entregue"
  const mapaProb = indexaProblemas(problemas)

  const base = pedidos.map((p) => ({ ...p, previsao: previsaoDe(p, vendedores) }))
  const cat = base.filter((p) => p.status)

  // A lista é a FILA DO QUE FALTA ASSINAR: assinou, o pedido sai daqui na hora
  // (o dono e o designer continuam vendo tudo na aba Ciência). "Ver todos"
  // reexibe os já assinados — some da fila não é some do sistema, e o vendedor
  // precisa conseguir voltar a um pedido que ele mesmo acabou de assinar.
  const listaFiltrada = filtraPedidos(cat, filtrosLista, clientes)
  const visiveis = soSemCiencia
    ? listaFiltrada.filter((p) => !cienciaDoPedido(mapaC, 'vendedor', p.idVenda))
    : listaFiltrada
  const semCienciaTotal = cat.filter((p) => !cienciaDoPedido(mapaC, 'vendedor', p.idVenda)).length

  const arvore = {}
  for (const p of visiveis) {
    const r = p.rota || 'SEM ROTA'
    arvore[r] ??= []
    arvore[r].push(p)
  }
  const rotas = Object.keys(arvore).sort()
  // ⚠️ o contador da faixa conta a ROTA INTEIRA, não o que sobrou na tela: com a
  // fila filtrada ele diria sempre "0 de N com ciência" e viraria mentira
  const totalDaRota = {}
  for (const p of cat) {
    const r = p.rota || 'SEM ROTA'
    ;(totalDaRota[r] ??= { total: 0, cientes: 0 }).total++
    if (cienciaDoPedido(mapaC, 'vendedor', p.idVenda)) totalDaRota[r].cientes++
  }

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

  // Ciência é PEDIDO A PEDIDO. O atalho "dar ciência na rota inteira" foi
  // REMOVIDO (decisão do dono em 17/08/2026) — não recolocar: um clique
  // assinava dezenas de pedidos que ninguém tinha olhado, e a ciência existe
  // justamente para provar que o vendedor viu AQUELE pedido.
  async function darCiencia(p) {
    if (salvando || cienciaDoPedido(mapaC, 'vendedor', p.idVenda)) return
    if (!confirm(`Confirmar que você viu e está ciente do pedido #${p.idVenda}?`)) return
    setSalvando(`p:${p.idVenda}`)
    try {
      const ip = await pegarIP()
      const quem = { porUid: user.uid, porEmail: user.email, porNome: nome || user.email, ip }
      await setDoc(doc(collection(db, 'ciencias')), docCiencia({
        tipo: 'vendedor', vendedor: vendedorNome, rota: p.rota || '', idVenda: p.idVenda, quem,
      }))
    } catch (e) {
      alert('Não foi possível registrar a ciência: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  // AVISO DE ERRO DO VENDEDOR — o caso que motivou isto é o pedido que já chegou
  // ao cliente e continua na produção (levado por ele, retirado no balcão, saído
  // fora do romaneio). Ele é quem descobre, e antes só podia telefonar.
  //
  // É um AVISO, não uma baixa: não move etapa nem cria entrega — quem dá a
  // entrega continua sendo o escritório, na aba Rota. Vendedor dando baixa
  // sozinho abriria a cobrança sem ninguém conferir o que saiu.
  //
  // Vai como erro do PEDIDO INTEIRO (idx null): ele reporta olhando o pedido,
  // não o produto, e escolher item a item só criaria chance de errar o alvo.
  async function reportarErro(dados) {
    if (salvando || !reportando) return
    setSalvando('reportar')
    try {
      const ip = await pegarIP()
      const quem = {
        porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
        perfil: perfil || '', ip,
      }
      await setDoc(doc(collection(db, 'problemas')), docProblema({
        p: reportando, idx: null, ...dados, quem,
      }))
      setReportando(null)
    } catch (e) {
      alert('Não foi possível reportar: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  return (
    <>
      {reportando && (
        <ReportarErro
          p={reportando} idx={null} clientes={clientes}
          campoInicial="entregue"
          salvando={salvando === 'reportar'}
          onCancelar={() => setReportando(null)}
          onEnviar={reportarErro}
        />
      )}
      <div className="toolbar no-print">
        <h1 className="page-title">Meus Pedidos
          <small>
            {vendedorNome || nome} · {cat.length} pedido(s)
            {vista === 'lista' && (semCienciaTotal
              ? ` · ${semCienciaTotal} sem ciência`
              : ' · tudo com ciência')}
          </small>
        </h1>
        <div className="spacer" />
        <div className="vista-toggle no-print">
          <button className={`btn${vista === 'lista' ? ' primary' : ''}`} onClick={() => setVista('lista')}
            title="Conferir e dar ciência nos pedidos">☰ Meus pedidos</button>
          <button className={`btn${vista === 'quadro' ? ' primary' : ''}`} onClick={() => setVista('quadro')}
            title="Acompanhar a produção até a entrega">▦ Acompanhar</button>
        </div>
        {vista === 'lista' && (
          <button className={`btn${soSemCiencia ? ' primary' : ''}`}
            onClick={() => setSoSemCiencia((v) => !v)}
            title={soSemCiencia
              ? 'Mostrar também os pedidos que você já assinou'
              : 'Mostrar só o que falta assinar'}>
            {soSemCiencia ? '⏳ Só sem ciência' : '☰ Ver todos'}
          </button>
        )}
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
          <QuadroVendedor pedidos={doQuadro} clientes={clientes} problemas={mapaProb}
            onReportar={(p) => setReportando(p)} />
        </div>
      )}

      {vista === 'lista' && (
        <div className="screen-only">
          {/* mesma barra de busca das outras abas — sem o seletor de vendedor,
              que na tela dele não separaria nada */}
          <FiltrosBar filtros={filtrosLista} setFiltros={setFiltrosLista} semVendedor
            rotas={rotasFiltro} pedidos={cat} />
          {(resumoFiltros(filtrosLista) || soSemCiencia) && (
            <div className="qv-resumo">
              {visiveis.length} de {cat.length} pedido(s)
              {soSemCiencia && ' · só os sem ciência'}
              {resumoFiltros(filtrosLista) && ` · ${resumoFiltros(filtrosLista)}`}
            </div>
          )}
        </div>
      )}

      {vista === 'lista' && (cat.length === 0 ? (
        <div className="empty"><div className="big">📦</div>Nenhum pedido para você no momento.</div>
      ) : rotas.length === 0 ? (
        <div className="empty"><div className="big">{soSemCiencia ? '✅' : '🔎'}</div>
          {soSemCiencia && !resumoFiltros(filtrosLista)
            ? <>Tudo com ciência. Nenhum pedido esperando sua assinatura.</>
            : <>Nenhum pedido com esses filtros.</>}
          <div>
            {soSemCiencia && (
              <button className="btn" style={{ marginTop: 10 }}
                onClick={() => setSoSemCiencia(false)}>☰ Ver todos os pedidos</button>
            )}
          </div>
        </div>
      ) : (
        rotas.map((rota) => {
          const foraRota = rota === 'FORA DE ROTA' || rota === 'SEM ROTA'
          const ps = arvore[rota]
          const tot = totalDaRota[rota] || { total: ps.length, cientes: 0 }
          return (
            <div key={rota} style={{ marginBottom: 16 }}>
              <div className={`rota-band ${foraRota ? 'warn' : ''}`}>
                <span className="rb-nome">📍 {rota}</span>
                <span className="rb-count">{ps.length} pedido(s)</span>
                <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="chip" style={tot.cientes < tot.total ? null : { color: 'var(--ok)' }}>
                    {tot.cientes < tot.total ? '' : '✓ '}{tot.cientes} de {tot.total} com ciência
                  </span>
                </div>
              </div>
              <div className="cards">
                {ps.map((p) => (
                  <CardMeu key={p.idVenda} p={p} clientes={clientes}
                    problemas={problemasDoPedido(mapaProb, p.idVenda)}
                    c={cienciaDoPedido(mapaC, 'vendedor', p.idVenda)}
                    salvando={salvando}
                    onReportar={() => setReportando(p)}
                    onCiencia={() => darCiencia(p)} />
                ))}
              </div>
            </div>
          )
        })
      ))}
    </>
  )
}

function CardMeu({ p, clientes, c, salvando, onCiencia, onReportar, problemas }) {
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
      {/* ⚠️ O texto não diz mais "a fábrica reportou": desde que o vendedor também
          reporta, metade dos avisos aqui é dele mesmo, e cada linha diz de quem é. */}
      {problemas?.length > 0 && (
        <div className="erro-aviso">
          ⚠ {problemas.length === 1 ? 'Um erro reportado' : `${problemas.length} erros reportados`} neste pedido:
          {problemas.map((x, n) => (
            <div key={n} style={{ marginTop: 4 }}>
              <b>{nomeCampoErro(x.campo)}</b>{x.produto ? ` · ${x.produto}` : ''}
              {ehErroEntrega(x.campo)
                ? <><br />entregue em <b>{fmtData(`${x.entregueEm}T00:00:00`)}</b>
                    {x.entreguePor ? ` · ${x.entreguePor}` : ''} — esperando a baixa no sistema</>
                : <><br />no sistema: {x.noSistema || '—'} · <b>no papel: {x.noPapel || '—'}</b></>}
              <div style={{ color: 'var(--text-faint)' }}>
                por {x.porNome || x.porEmail || '—'} · {fmtDataHora(x.quando)}
              </div>
            </div>
          ))}
          {problemas.some((x) => !ehErroEntrega(x.campo)) && (
            <div style={{ marginTop: 5, color: 'var(--text-faint)' }}>
              Corrija no Posseidon para não repetir na próxima importação.
            </div>
          )}
        </div>
      )}
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
          ? <span className="chip" style={{ color: 'var(--ok)' }}
              title={`Assinado por ${c.porNome || c.porEmail || '—'}${c.ip ? ` · IP ${c.ip}` : ''}`}>
              ✓ ciência em {fmtDataHora(c.quando)}
            </span>
          : <button className="btn ok" style={{ width: '100%' }} disabled={!!salvando}
              onClick={onCiencia}>
              {salvando === `p:${p.idVenda}` ? 'Registrando…' : '✓ Dar ciência neste pedido'}
            </button>}
        {/* pedido que está nesta lista está na produção — se ele já chegou ao
            cliente, é aqui que o vendedor avisa */}
        <button className="mini-btn alerta" style={{ marginTop: 6, width: '100%', padding: '7px 9px', fontSize: 13 }}
          disabled={!!salvando} onClick={onReportar}
          title="Reportar erro neste pedido: já foi entregue, quantidade errada, produto trocado…">
          ⚠ Já foi entregue / reportar erro
        </button>
      </div>
    </div>
  )
}
