import { useEffect, useMemo, useState } from 'react'
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import {
  MODO_ORDER, MODO_NM, CORES_IMPRESSAO, chaveCor, fmtCores,
  previsaoDe, filtraPedidos, vendedoresDe, nomeCliente, fmtData, fmtDataHora, fmtQtd,
  situacaoPrazo, keyDoItem, marcacaoDaVirada,
  itensAguardandoOF, agrupaParaOF, docOF, situacaoDaOF, idsDeOFsVivas, ofDoItem,
  proximoNumeroOF, fmtNumeroOF, ofsComVinculo, plasticoSemCor, STATUS_OF, NOME_SITUACAO_OF,
} from '../utils.js'
import FiltrosBar from '../components/FiltrosBar.jsx'
import SubTabs from '../components/SubTabs.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import SeloCor from '../components/SeloCor.jsx'

// ORDENS DE FABRICAÇÃO — o gestor junta sacolas plásticas IGUAIS (linha +
// produto + cor) de pedidos diferentes e solta uma OF para a máquina.
// Nesta fase a OF é o DOCUMENTO (espera → soltar → ficha → cancelar); o quadro
// da produção passa a andar por OF na fase C. Ver ORDEM_FABRICACAO.md.
export default function OrdensFabricacao({ pedidos, ordens = [], erroOrdens = '', producaoCfg = {} }) {
  const { user, nome, perfil } = useAuth()
  const { vendedores: cadastros, clientes, itens: itensCad } = useCadastros()
  const [aba, setAba] = useState('espera')
  const [filtros, setFiltros] = useState({})
  const [linha, setLinha] = useState('')
  const [cor, setCor] = useState('')
  const [salvando, setSalvando] = useState('')
  const [ficha, setFicha] = useState(null)   // OF sendo impressa

  // imprime depois que a ficha está na tela, e limpa ao terminar
  useEffect(() => {
    if (!ficha) return undefined
    const fim = () => setFicha(null)
    window.addEventListener('afterprint', fim)
    const t = setTimeout(() => window.print(), 50)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fim) }
  }, [ficha])

  const base = useMemo(
    () => (pedidos || []).map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) })),
    [pedidos, cadastros])
  const porId = useMemo(() => Object.fromEntries(base.map((p) => [p.idVenda, p])), [base])
  const vivos = useMemo(() => idsDeOFsVivas(ordens), [ordens])

  const filtrados = filtraPedidos(base, filtros, clientes)
  const grupos = agrupaParaOF(itensAguardandoOF(filtrados, itensCad, vivos))
    .filter((g) => (!linha || g.linha === linha) && (!cor || chaveCor(g.cores) === cor))
  const semCor = plasticoSemCor(base, itensCad)

  const situacoes = ordens.map((o) => ({ o, s: situacaoDaOF(o, porId) }))
    .sort((a, b) => (Number(b.o.numero) || 0) - (Number(a.o.numero) || 0))
  const casaFiltroOF = ({ o }) => (!linha || o.linha === linha) && (!cor || chaveCor(o.cores) === cor)
  const abertas = situacoes.filter((x) => x.s.st === 'liberada' || x.s.st === 'em_producao').filter(casaFiltroOF)
  const fechadas = situacoes.filter((x) => x.s.st === 'concluida' || x.s.st === 'cancelada').filter(casaFiltroOF)

  // cores que aparecem (simples e duplas), para o filtro
  const opcoesCor = [
    ...CORES_IMPRESSAO.map((c) => ({ id: c.id, nm: c.nm })),
    ...[...new Set([...itensAguardandoOF(base, itensCad, vivos).map((x) => chaveCor(x.cores)),
      ...ordens.map((o) => chaveCor(o.cores))])]
      .filter((k) => k.includes('+'))
      .map((k) => ({ id: k, nm: fmtCores(k.split('+')) })),
  ]

  async function soltar(grupo, escolhidos) {
    if (!escolhidos.length || salvando) return
    // conferido de novo aqui: outra tela pode ter soltado a mesma sacola agora
    const livres = escolhidos.filter((x) => {
      const p = porId[x.idVenda]
      const idx = p ? (p.itens || []).findIndex((_, i) => keyDoItem(p, i) === x.itemKey) : -1
      return idx >= 0 && !ofDoItem(p, idx, vivos)
    })
    if (livres.length !== escolhidos.length) {
      alert('Algum pedido desta lista acabou de entrar em outra OF. A tela foi atualizada — confira e solte de novo.')
      return
    }
    const numero = proximoNumeroOF(ordens)
    const total = fmtQtd(livres.reduce((s, x) => s + x.qtd, 0))
    if (!confirm(`Soltar ${fmtNumeroOF(numero)}?\n\n${MODO_NM[grupo.linha]} · ${grupo.produto} · ${fmtCores(grupo.cores)}\n`
      + `${livres.length} item(ns) de ${new Set(livres.map((x) => x.idVenda)).size} pedido(s) · ${total} ${grupo.unidade}`)) return
    setSalvando(grupo.chave)
    try {
      const batch = writeBatch(db)
      const ref = doc(collection(db, 'ordens'))
      batch.set(ref, docOF({ numero, grupo, escolhidos: livres, quem: { nome, uid: user?.uid } }))
      // um pedido pode ter dois itens iguais no mesmo grupo: o mapa acumula
      const mapas = {}
      for (const x of livres) {
        const p = porId[x.idVenda]
        mapas[x.idVenda] = ofsComVinculo({ ofs: mapas[x.idVenda] ?? p.ofs }, x.itemKey, ref.id)
      }
      for (const [id, ofs] of Object.entries(mapas)) batch.update(doc(db, 'pedidos', id), { ofs })
      await batch.commit()
      setAba('abertas')
    } catch (e) {
      console.error('Erro ao soltar OF:', e)
      alert('Não foi possível soltar a OF: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  // Cancelar não apaga (o número não pode se repetir) e só solta o que ainda
  // está na linha: o que já foi impresso aconteceu.
  async function cancelar(o, s) {
    if (salvando) return
    const motivo = prompt(`Cancelar ${fmtNumeroOF(o.numero)}?\n\nO que ainda não foi impresso volta para "Aguardando OF". `
      + 'Escreva o motivo:')
    if (motivo === null) return
    if (!motivo.trim()) { alert('O motivo é obrigatório.'); return }
    setSalvando(o.id)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'ordens', o.id), {
        status: STATUS_OF.CANCELADA, motivo: motivo.trim(),
        canceladaEm: new Date().toISOString(), canceladaPor: nome || '', canceladaUid: user?.uid || '',
        feitoAoCancelar: s.feito,
      })
      const mapas = {}
      for (const x of s.itens) {
        if (x.sumiu || x.p?.ofs?.[x.itemKey] !== o.id) continue
        mapas[x.idVenda] = ofsComVinculo({ ofs: mapas[x.idVenda] ?? x.p.ofs }, x.itemKey, null)
      }
      for (const [id, ofs] of Object.entries(mapas)) batch.update(doc(db, 'pedidos', id), { ofs })
      await batch.commit()
    } catch (e) {
      console.error('Erro ao cancelar OF:', e)
      alert('Não foi possível cancelar: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  // VIRADA ESCALONADA: tira a foto do que está na fila agora (essas terminam
  // como estão) e SÓ DEPOIS liga a exigência — na ordem contrária, por alguns
  // segundos a fila inteira de plástico sumiria do quadro.
  const foto = useMemo(() => marcacaoDaVirada(base, itensCad, vivos), [base, itensCad, vivos])
  const nFoto = Object.values(foto).reduce((s, ks) => s + ks.length, 0)
  async function ligarExigencia() {
    if (salvando) return
    if (!confirm(`Ligar a exigência de Ordem de Fabricação?\n\n`
      + `${nFoto} sacola(s) plástica(s) que estão na fila AGORA, sem OF, ficam marcadas como `
      + `"já estavam na fila" e terminam como estão.\n\n`
      + 'Daqui em diante, sacola plástica nova só entra no quadro com OF.')) return
    setSalvando('virada')
    try {
      const ids = Object.keys(foto)
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 450)) {
          const semOF = { ...(porId[id]?.semOF || {}) }
          for (const k of foto[id]) semOF[k] = true
          batch.update(doc(db, 'pedidos', id), { semOF })
        }
        await batch.commit()
      }
      await setDoc(doc(db, 'config', 'producao'), {
        ofExigida: true, ofDesde: new Date().toISOString(), ofPor: nome || '', ofMarcados: nFoto,
      }, { merge: true })
    } catch (e) {
      console.error('Erro na virada:', e)
      alert('Não foi possível ligar a exigência: ' + (e.code || e.message)
        + '\n\nNada foi escondido do quadro — a exigência só liga no fim.')
    } finally {
      setSalvando('')
    }
  }
  async function desligarExigencia() {
    if (salvando || !confirm('Desligar a exigência de OF? Sacola plástica sem OF volta a entrar no quadro como card avulso.')) return
    setSalvando('virada')
    try {
      await setDoc(doc(db, 'config', 'producao'), {
        ofExigida: false, ofDesligadaEm: new Date().toISOString(), ofDesligadaPor: nome || '',
      }, { merge: true })
    } catch (e) {
      alert('Não foi possível desligar: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  const abas = [
    { id: 'espera', label: '⏳ Aguardando OF', badge: grupos.length },
    { id: 'abertas', label: '🏭 OFs abertas', badge: abertas.length },
    { id: 'historico', label: '📚 Histórico', badge: 0 },
  ]
  const fichaSit = ficha ? situacoes.find((x) => x.o.id === ficha) : null

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Ordens de Fabricação
          <small>plástico agrupado por linha, produto e cor</small>
        </h1>
        <div className="spacer" />
        <select className="btn" value={linha} onChange={(e) => setLinha(e.target.value)}>
          <option value="">Todas as linhas</option>
          {MODO_ORDER.map((m) => <option key={m} value={m}>{MODO_NM[m]}</option>)}
        </select>
        <select className="btn" value={cor} onChange={(e) => setCor(e.target.value)}>
          <option value="">Todas as cores</option>
          {opcoesCor.map((c) => <option key={c.id} value={c.id}>{c.nm}</option>)}
        </select>
      </div>

      <div className="screen-only">
        {aba === 'espera' && (
          <FiltrosBar filtros={filtros} setFiltros={setFiltros} vendedores={vendedoresDe(base)} pedidos={base} />
        )}
        <SubTabs abas={abas} ativa={aba} onTrocar={setAba} />

        <PainelVirada cfg={producaoCfg} ehDono={perfil === 'dono'} nFoto={nFoto}
          ocupado={!!salvando} onLigar={ligarExigencia} onDesligar={desligarExigencia} />

        {erroOrdens && (
          <div className="aviso-acab">⚠ Não foi possível ler as ordens ({erroOrdens}).</div>
        )}
        {aba === 'espera' && semCor > 0 && (
          <div className="aviso-acab">
            ⚠ {semCor} item(ns) de plástico na produção <b>sem cor da impressão</b> — não entram
            aqui até alguém marcar a cor na Triagem.
          </div>
        )}

        {aba === 'espera' && (
          grupos.length === 0
            ? <div className="empty"><div className="big">🧾</div>
                Nenhuma sacola plástica esperando OF{linha || cor || Object.values(filtros).some(Boolean) ? ' com esses filtros' : ''}.
              </div>
            : <div className="of-lista">
                {grupos.map((g) => (
                  <GrupoEspera key={g.chave} g={g} clientes={clientes}
                    salvando={salvando === g.chave} ocupado={!!salvando}
                    onSoltar={(esc) => soltar(g, esc)} />
                ))}
              </div>
        )}

        {aba === 'abertas' && (
          abertas.length === 0
            ? <div className="empty"><div className="big">🏭</div>Nenhuma OF aberta.</div>
            : <div className="of-lista">
                {abertas.map(({ o, s }) => (
                  <CardOF key={o.id} o={o} s={s} clientes={clientes}
                    ocupado={!!salvando}
                    onFicha={() => setFicha(o.id)}
                    onCancelar={() => cancelar(o, s)} />
                ))}
              </div>
        )}

        {aba === 'historico' && (
          <HistoricoOF lista={fechadas} onFicha={(id) => setFicha(id)} />
        )}
      </div>

      {fichaSit && <FichaOF o={fichaSit.o} s={fichaSit.s} clientes={clientes} />}
    </>
  )
}

// A chave da virada, à vista de todos (só o dono mexe). Desligada, o quadro
// continua como sempre: OF é opcional e plástico sem OF entra avulso.
export function PainelVirada({ cfg, ehDono, nFoto, ocupado, onLigar, onDesligar }) {
  if (cfg?.ofExigida) {
    return (
      <div className="of-virada on">
        ✅ <b>Exigência de OF ligada</b> desde {fmtDataHora(cfg.ofDesde)}{cfg.ofPor ? ` por ${cfg.ofPor}` : ''}
        {' · '}{cfg.ofMarcados || 0} sacola(s) terminam como estavam na fila.
        Sacola plástica nova só entra no quadro com OF.
        {ehDono && <button className="btn" disabled={ocupado} onClick={onDesligar}>Desligar</button>}
      </div>
    )
  }
  return (
    <div className="of-virada">
      ⏸ <b>Exigência de OF desligada</b> — o quadro ainda aceita sacola plástica sem OF.
      {ehDono
        ? <> Ao ligar, as <b>{nFoto}</b> sacola(s) plástica(s) que estão na fila agora terminam como estão.
            <button className="btn primary" disabled={ocupado} onClick={onLigar}>
              {ocupado ? 'Aguarde…' : 'Ligar exigência de OF'}
            </button></>
        : ' Quem liga é o dono.'}
    </div>
  )
}

function CabecalhoOF({ linha, produto, cores }) {
  return (
    <span className="of-prod">
      <SeloLinha linha={linha} />{produto}<SeloCor cores={cores} />
    </span>
  )
}

// Um grupo da espera. Fechado mostra o tamanho do bolo; aberto vira a lista de
// marcação — todos marcados, pelo prazo. Soltar leva só os marcados.
export function GrupoEspera({ g, clientes, salvando, ocupado, onSoltar, abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const [fora, setFora] = useState({})   // chaves desmarcadas
  const chave = (x) => `${x.idVenda}|${x.itemKey}`
  const escolhidos = g.itens.filter((x) => !fora[chave(x)])
  const totalEsc = escolhidos.reduce((s, x) => s + x.qtd, 0)
  const atrasado = situacaoPrazo(g.previsao) === 'atrasado'
  return (
    <div className={`card of-card${atrasado ? ' atrasado' : ''}`}>
      <div className="of-topo" onClick={() => setAberto((v) => !v)} role="button">
        <CabecalhoOF linha={g.linha} produto={g.produto} cores={g.cores} />
        <span className="of-num">{fmtQtd(g.total)} {g.unidade}</span>
      </div>
      <div className="meta-row">
        <span className="chip">{MODO_NM[g.linha]}</span>
        <span className="chip">{g.pedidos} pedido(s)</span>
        <span className={`chip${atrasado ? ' rota-warn' : ''}`}>📅 mais urgente {fmtData(g.previsao)}</span>
        <button className="btn" onClick={() => setAberto((v) => !v)}>
          {aberto ? '▾ fechar' : '▸ Soltar OF…'}
        </button>
      </div>
      {aberto && (
        <>
          <table className="of-tab">
            <thead><tr><th /><th>Pedido</th><th>Cliente</th><th>Entrega</th><th className="q">Qtd</th></tr></thead>
            <tbody>
              {g.itens.map((x) => {
                const on = !fora[chave(x)]
                return (
                  <tr key={chave(x)} className={on ? '' : 'of-fora'}
                    onClick={() => setFora((f) => ({ ...f, [chave(x)]: on }))}>
                    <td><input type="checkbox" checked={on} readOnly /></td>
                    <td>#{x.idVenda}</td>
                    <td>{nomeCliente(x.p?.cliente, clientes)}<small> · {x.p?.cidade || '—'}</small></td>
                    <td className={situacaoPrazo(x.previsao) === 'atrasado' ? 'of-atraso' : ''}>{fmtData(x.previsao)}</td>
                    <td className="q">{fmtQtd(x.qtd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="of-pe">
            <span>{escolhidos.length} de {g.itens.length} marcado(s) · <b>{fmtQtd(totalEsc)} {g.unidade}</b></span>
            <button className="btn ok" disabled={!escolhidos.length || ocupado}
              onClick={() => onSoltar(escolhidos)}>
              {salvando ? 'Soltando…' : `Soltar OF com ${escolhidos.length} item(ns)`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function CardOF({ o, s, clientes, ocupado, onFicha, onCancelar, abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial)
  return (
    <div className={`card of-card of-${s.st}`}>
      <div className="of-topo" onClick={() => setAberto((v) => !v)} role="button">
        <span className="of-nr">{fmtNumeroOF(o.numero)}</span>
        <CabecalhoOF linha={o.linha} produto={o.produto} cores={o.cores} />
        <span className="of-num">
          {s.feito > 0 ? <>falta {fmtQtd(s.falta)} <small>de {fmtQtd(s.total)}</small></> : fmtQtd(s.total)} {o.unidade}
        </span>
      </div>
      {s.excedente > 0 && (
        <div className="aviso-acab">
          ⚠ Aumentou <b>{fmtQtd(s.excedente)} {o.unidade}</b> depois desta OF (reimportação da planilha).
          Cancele e solte de novo para a ficha bater com o pedido.
        </div>
      )}
      <div className="meta-row">
        <span className={`chip of-st-${s.st}`}>{NOME_SITUACAO_OF[s.st]}</span>
        <span className="chip">{(o.itens || []).length} item(ns)</span>
        <span className="chip">solta por {o.criadaPor || '—'} · {fmtDataHora(o.criadaEm)}</span>
        <button className="btn" onClick={() => setAberto((v) => !v)}>{aberto ? '▾ pedidos' : '▸ pedidos'}</button>
        <button className="btn" onClick={onFicha}>🖨 Ficha</button>
        <button className="btn" disabled={ocupado} onClick={onCancelar}
          style={{ color: 'var(--danger)' }}>Cancelar</button>
      </div>
      {aberto && (
        <table className="of-tab">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th className="q">Liberado</th><th className="q">Falta</th></tr></thead>
          <tbody>
            {s.itens.map((x) => (
              <tr key={`${x.idVenda}|${x.itemKey}`} className={x.falta <= 0 ? 'of-fora' : ''}>
                <td>#{x.idVenda}</td>
                <td>{nomeCliente(x.cliente, clientes)}<small> · {x.cidade || '—'}</small></td>
                <td>{fmtData(x.previsao)}</td>
                <td className="q">{fmtQtd(x.qtd)}</td>
                <td className="q">{x.sumiu ? 'saiu' : fmtQtd(x.falta)}
                  {x.excedente > 0 && <small className="of-atraso"> +{fmtQtd(x.excedente)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function HistoricoOF({ lista, onFicha }) {
  if (!lista.length) return <div className="empty"><div className="big">📚</div>Nenhuma OF concluída ou cancelada ainda.</div>
  return (
    <div className="of-hist">
      <table className="of-tab">
        <thead><tr><th>OF</th><th>Produto</th><th className="q">Total</th><th>Situação</th><th>Solta</th><th>Fechamento</th><th /></tr></thead>
        <tbody>
          {lista.map(({ o, s }) => (
            <tr key={o.id}>
              <td>{fmtNumeroOF(o.numero)}</td>
              <td><CabecalhoOF linha={o.linha} produto={o.produto} cores={o.cores} /></td>
              <td className="q">{fmtQtd(s.total)} {o.unidade}</td>
              <td><span className={`chip of-st-${s.st}`}>{NOME_SITUACAO_OF[s.st]}</span></td>
              <td>{o.criadaPor || '—'}<small> · {fmtDataHora(o.criadaEm)}</small></td>
              <td>
                {s.st === 'cancelada'
                  ? <>{o.canceladaPor || '—'}<small> · {fmtDataHora(o.canceladaEm)}</small><div className="of-motivo">{o.motivo}</div></>
                  : '—'}
              </td>
              <td><button className="btn" onClick={() => onFicha(o.id)}>🖨</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A ficha que vai para a máquina. A COR vem por extenso e grande: é ela, junto
// com o tamanho, que decide a tinta e o ajuste — e a impressora é P&B.
export function FichaOF({ o, s, clientes }) {
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Ordem de Fabricação · {fmtNumeroOF(o.numero)}</h1>
        <div className="meta">
          impressa {fmtDataHora(new Date().toISOString())}<br />
          solta por {o.criadaPor || '—'} em {fmtDataHora(o.criadaEm)}
          {o.status === STATUS_OF.CANCELADA && <><br /><b>CANCELADA</b> — {o.motivo}</>}
        </div>
      </div>
      <div className="of-ficha-prod">
        <div><span>Linha</span><b>{MODO_NM[o.linha]}</b></div>
        <div><span>Produto</span><b>{o.produto}</b></div>
        <div><span>Cor da impressão</span><b>{fmtCores(o.cores) || '—'}</b></div>
        <div><span>Total</span><b>{fmtQtd(s.total)} {o.unidade}</b></div>
      </div>
      <table className="pr-itens of-ficha-tab">
        <thead><tr><th /><th>Pedido</th><th>Cliente</th><th>Cidade</th><th>Entrega</th><th className="q">Qtd</th></tr></thead>
        <tbody>
          {(o.itens || []).map((x) => (
            <tr key={`${x.idVenda}|${x.itemKey}`}>
              <td><span className="box" /></td>
              <td>#{x.idVenda}</td>
              <td>{nomeCliente(x.cliente, clientes)}</td>
              <td>{x.cidade || '—'}</td>
              <td>{fmtData(x.previsao)}</td>
              <td className="q">{fmtQtd(x.qtd)} {o.unidade}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="of-ficha-ass">
        <div>Impresso por: ____________________ Data: ___/___</div>
        <div>Conferido por: ____________________</div>
      </div>
    </div>
  )
}
