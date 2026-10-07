import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, updateDoc, setDoc, deleteDoc, deleteField, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  buscaGlobal, situacaoBaixa, baixaEscritorio, preparaRemessa, situacaoEntrega,
  comprometimentoDeCargas, linhasControleEntrega, mesesDoControle, totaisDoControle,
  podeBaixarNoControle, podeEntregarNoControle, quemAssina, pegarIP,
  NOME_SITUACAO_CONTROLE, SITUACAO_CONTROLE, ORIGEM_BAIXA, rotuloMes, mesDe,
  idxProntos, saiuParaEntrega, nomeCliente, ondeProcurar,
  fmtData, fmtDataHora, fmtMoeda, fmtQtd, doDoc, previsaoDe, situacaoPrazo,
  indexaProblemas, problemasDoPedido, ehErroEntrega, nomeCampoErro, quemFez,
  STATUS_CARGA, rotuloCarga, rotuloPlano,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import Realce from '../components/Realce.jsx'

// CONTROLE DE ENTREGA — a planilha do escritório vira tela.
//
// A fábrica não dá baixa no quadro. Quando a nota fiscal sobe, o escritório
// registrava numa planilha (uma aba por mês) o pedido, o cliente, a cidade, o
// valor, "SERÁ ENTREGUE"/"ENTREGUE" e quem levou — o que o sistema deveria
// saber. Aqui: digita o número → a tela puxa tudo → um clique declara PRONTO
// (`expedido`), outro SAIU (motorista), outro ENTREGUE. Embaixo, a lista do
// mês igual à planilha, só que derivada do banco. Desenho: CONTROLE_ENTREGA.md.
export default function ControleEntrega({ pedidos, problemas }) {
  const { clientes, vendedores: cadastros, motoristas, itens: itensCad } = useCadastros()
  const { user, perfil, nome, setores } = useAuth()
  const podeBaixar = podeBaixarNoControle(perfil, setores)
  const podeEntregar = podeEntregarNoControle(perfil)
  const veValor = perfil === 'dono' || perfil === 'financeiro'
  const motoristasAtivos = (motoristas || []).filter((m) => m.ativo !== false)

  const [termo, setTermo] = useState('')
  const [entregues, setEntregues] = useState([])
  const [cargas, setCargas] = useState([])
  const [planos, setPlanos] = useState([])
  const [negado, setNegado] = useState({})
  const [salvando, setSalvando] = useState('')
  const [mes, setMes] = useState(() => mesDe(new Date().toISOString()))
  const [situacao, setSituacao] = useState('')
  const [ip, setIp] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { pegarIP().then(setIp) }, [])
  useEffect(() => {
    const assina = (nomeCol, set) => onSnapshot(collection(db, nomeCol),
      (snap) => { set(snap.docs.map(doDoc)); setNegado((x) => ({ ...x, [nomeCol]: false })) },
      (e) => { console.error(`Erro ao ler ${nomeCol}:`, e); setNegado((x) => ({ ...x, [nomeCol]: true })) })
    const us = [assina('entregues', setEntregues), assina('cargas', setCargas), assina('planos', setPlanos)]
    return () => us.forEach((u) => u())
  }, [])

  const base = useMemo(() => (pedidos || []).map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) })), [pedidos, cadastros])
  const res = buscaGlobal(termo, { pedidos: base, entregues, clientes, limite: 12 })
  const comp = comprometimentoDeCargas(cargas)
  const mapaProblemas = indexaProblemas(problemas)
  const semAcesso = Object.entries(negado).filter(([, v]) => v).map(([k]) => k)
  const quem = () => quemAssina({ user, nome, perfil, ip })

  // a tabela do mês: VISÃO sobre pedidos + entregues, nada digitado à parte
  const todasLinhas = useMemo(
    () => linhasControleEntrega(base, entregues, { clientes, vendedores: cadastros }),
    [base, entregues, clientes, cadastros])
  const meses = mesesDoControle(todasLinhas)
  const linhas = todasLinhas.filter((l) => (!mes || l.mes === mes) && (!situacao || l.situacao === situacao))
  const totais = totaisDoControle(linhas)

  // o fluxo é "nota na mão, digita, clica, próxima": depois de gravar, o campo
  // volta a ter o foco e o número continua lá para conferir o resultado
  const foca = () => setTimeout(() => inputRef.current?.focus(), 30)

  // ---------- ações ----------
  async function marcarPronto(p, idxs) {
    if (!podeBaixar || salvando) return
    const b = baixaEscritorio(p, idxs, quem(), itensCad)
    if (!b.movidos.length) {
      alert(b.recusados.length
        ? 'Nada pôde ser marcado: o que resta deste pedido é parte solta de item já embalado — precisa fechar na montagem, com a balança.'
        : 'Nada a marcar: os itens escolhidos já estão prontos ou entregues.')
      return
    }
    const lista = b.movidos.map((m) => `• ${m.produto} — ${fmtQtd(m.qtd)}${m.volumes ? ` (${m.volumes} volume(s))` : ''}`).join('\n')
    const rec = b.recusados.length
      ? `\n\n⚠ Fica na fábrica (sem pesagem): ${b.recusados.map((r) => `${r.produto} ${fmtQtd(r.qtd)}`).join(', ')}`
      : ''
    if (!confirm(`Marcar como PRONTO (será entregue) o pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}?\n\n${lista}${rec}\n\nO pedido some da fila da fábrica e passa a aparecer na Rota e em Entregas. Fica registrado que a baixa foi do escritório.`)) return
    setSalvando(`pronto-${p.idVenda}`)
    try {
      // etapa + auditoria no MESMO batch: ou as duas acontecem, ou nenhuma
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', String(p.idVenda)), { etapas: b.etapas, ...b.campos })
      for (const r of b.registros) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
    } catch (e) {
      alert('Não foi possível marcar como pronto: ' + (e.code || e.message))
    } finally { setSalvando(''); foca() }
  }

  async function marcarSaida(p, motorista) {
    if (!podeBaixar || salvando) return
    if (motoristasAtivos.length > 0 && !motorista) { alert('Escolha o motorista antes de marcar a saída.'); return }
    if (!confirm(`Marcar o pedido #${p.idVenda} como SAIU para entrega${motorista ? ` com ${motorista}` : ''}?`)) return
    setSalvando(`saida-${p.idVenda}`)
    try {
      await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
        saidaEm: new Date().toISOString(), saidaMotorista: motorista || '', saidaPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível marcar a saída: ' + (e.code || e.message))
    } finally { setSalvando(''); foca() }
  }

  // "NÃO ENTREGOU" da planilha: volta a "pronto, aguardando". Não é estado
  // novo no banco — é o mesmo cancelar saída da Rota.
  async function cancelarSaida(p) {
    if (!podeBaixar || salvando) return
    if (!confirm(`O pedido #${p.idVenda} NÃO foi entregue e voltou? Ele volta para "pronto, aguardando saída".`)) return
    setSalvando(`cancela-${p.idVenda}`)
    try {
      await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
        saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
      })
    } catch (e) {
      alert('Não foi possível cancelar a saída: ' + (e.code || e.message))
    } finally { setSalvando(''); foca() }
  }

  // ENTREGUE: a mesma remessa que a Rota grava (`preparaRemessa`, fonte única).
  // Só escritório — é o que move para `entregues` e abre a cobrança.
  async function entregar(p, motorista) {
    if (!podeEntregar || salvando) return
    if (motoristasAtivos.length > 0 && !motorista) { alert('Escolha o motorista antes de marcar como entregue.'); return }
    const r = preparaRemessa(p, motorista, nome)
    if (!r) { alert('Nada expedido neste pedido ainda — marque como PRONTO antes.'); return }
    const aviso = r.remessa.parcial
      ? `\n\nEntrega PARCIAL: ${r.remessa.itensPendentes} item(ns) continuam com quantidade na fábrica.` : ''
    if (!confirm(`Confirmar ENTREGA do pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}${motorista ? ` por ${motorista}` : ''}?${aviso}`)) return
    setSalvando(`entrega-${p.idVenda}`)
    try {
      await setDoc(doc(db, 'entregues', r.docId), r.remessa)
      if (r.acabou) {
        await deleteDoc(doc(db, 'pedidos', String(p.idVenda)))
      } else {
        await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
          etapas: r.etapas, remessas: r.n,
          saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
        })
      }
    } catch (e) {
      alert('Não foi possível registrar a entrega: ' + (e.code || e.message))
    } finally { setSalvando(''); foca() }
  }

  const unico = res.itens.length === 1 || (res.itens.length > 1 && res.itens[0].idVenda === res.termo)
  const alvo = unico ? res.itens[0] : null

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Controle de entrega
          <small>digite o nº do pedido · pronto → saiu → entregue{!podeBaixar && ' · só leitura'}</small>
        </h1>
      </div>

      <div className="loc-busca no-print">
        <input ref={inputRef} className="loc-input" autoFocus value={termo} inputMode="numeric"
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setTermo('') }}
          placeholder="Nº do pedido (ou nome do cliente)…" />
        {termo && <button className="btn" onClick={() => { setTermo(''); foca() }}>✕ limpar</button>}
      </div>

      {semAcesso.length > 0 && (
        <div className="loc-aviso">
          ⚠ Sem permissão para ler: <b>{semAcesso.join(', ')}</b>. A tela continua, mas incompleta.
        </div>
      )}

      {termo && !res.curto && res.total === 0 && (
        <div className="empty"><div className="big">🤷</div>
          Nenhum pedido <b>“{termo}”</b> na produção nem nas entregas.
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Se existe no Posseidon, ainda não foi importado — a tela nunca cria pedido.
          </div>
        </div>
      )}

      {alvo && (
        <CardControle r={alvo} comp={comp} cargas={cargas} planos={planos} clientes={clientes}
          itensCad={itensCad} termo={res.termo} veValor={veValor}
          podeBaixar={podeBaixar} podeEntregar={podeEntregar} salvando={salvando}
          motoristas={motoristasAtivos}
          problemas={problemasDoPedido(mapaProblemas, alvo.idVenda)}
          onPronto={marcarPronto} onSaida={marcarSaida} onCancelarSaida={cancelarSaida} onEntregar={entregar} />
      )}

      {!alvo && res.total > 0 && (
        <div className="card ctl-lista">
          <div className="loc-conta">{res.total} pedido(s) — toque no número para abrir
            {res.cortado > 0 && <> · mostrando {res.itens.length}</>}</div>
          {res.itens.map((r) => {
            const ref = r.p || r.remessas[r.remessas.length - 1] || {}
            return (
              <button key={r.idVenda} className="ctl-escolha" onClick={() => setTermo(r.idVenda)}>
                <b>#<Realce texto={r.idVenda} termo={res.termo} /></b>
                <span><Realce texto={nomeCliente(ref.cliente, clientes)} termo={res.termo} /></span>
                <small>{ref.cidade || ''}{r.p ? '' : ' · entregue'}</small>
              </button>
            )
          })}
        </div>
      )}

      {/* ---------- a planilha do mês ---------- */}
      <div className="toolbar ctl-toolbar">
        <h2 className="ctl-titulo">📋 {mes ? rotuloMes(mes) : 'Todos os meses'}
          <small>{totais.linhas} linha(s) · {totais.pronto} será entregue · {totais.saiu} saiu · {totais.entregue} entregue
            {totais.escritorio > 0 && <> · {totais.escritorio} baixa(s) do escritório</>}</small>
        </h2>
        <div className="filtros no-print" style={{ margin: 0 }}>
          <select className="filtro-input" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos os meses</option>
            {[...new Set([mes, ...meses].filter(Boolean))].sort().reverse().map((m) => (
              <option key={m} value={m}>{rotuloMes(m)}</option>
            ))}
          </select>
          <select className="filtro-input" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.values(SITUACAO_CONTROLE).map((s) => (
              <option key={s} value={s}>{NOME_SITUACAO_CONTROLE[s]}</option>
            ))}
          </select>
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
          <button className="btn" onClick={() => baixarCsv(linhas, veValor, mes)}>⬇ CSV</button>
        </div>
      </div>

      <TabelaControle linhas={linhas} totais={totais} veValor={veValor} onAbrir={(id) => { setTermo(id); window.scrollTo({ top: 0 }) }} />
    </>
  )
}

// ---------- o card do pedido digitado ----------
export function CardControle({ r, comp, cargas, planos, clientes, itensCad, termo, veValor,
                               podeBaixar, podeEntregar, salvando, motoristas, problemas,
                               onPronto, onSaida, onCancelarSaida, onEntregar }) {
  const p = r.p
  const ref = p || r.remessas[r.remessas.length - 1] || {}
  const sit = situacaoEntrega(p, { cargas, planos, remessas: r.remessas, comp })
  const itens = p ? situacaoBaixa(p, itensCad) : []
  const [marcados, setMarcados] = useState(() => new Set(itens.filter((s) => s.baixavel).map((s) => s.idx)))
  const [motorista, setMotorista] = useState('')
  const prontos = p ? idxProntos(p) : []
  const saiu = saiuParaEntrega(p)
  const emCarga = sit.cargasVivas.length > 0
  const haBaixavel = itens.some((s) => s.baixavel)
  const prazo = p ? situacaoPrazo(p.previsao) : ''
  const avisoEntregue = (problemas || []).filter((x) => x.status === 'aberto' && ehErroEntrega(x.campo))
  const outrosAvisos = (problemas || []).filter((x) => x.status === 'aberto' && !ehErroEntrega(x.campo))
  const ocupado = !!salvando

  const alterna = (idx) => setMarcados((m) => {
    const n = new Set(m); n.has(idx) ? n.delete(idx) : n.add(idx); return n
  })

  return (
    <div className={`card loc-card ctl-card ${prazo === 'atrasado' ? 'atrasado' : 'em_dia'}`}>
      <div className="card-top">
        <div>
          <div className="cliente"><Realce texto={nomeCliente(ref.cliente, clientes)} termo={termo} /></div>
          <div className="idv">#<Realce texto={String(r.idVenda)} termo={termo} /></div>
        </div>
        {veValor && ref.valorTotal != null && <div className="valor">{fmtMoeda(ref.valorTotal)}</div>}
      </div>
      <div className="meta-row">
        {ref.cidade && <span className="chip">📍 {ref.cidade}</span>}
        {ref.rota && <span className="chip">{ref.rota}</span>}
        {ref.vendedor && <span className="chip">👤 {ref.vendedor}</span>}
        {p?.previsao && <span className={`chip${prazo === 'atrasado' ? ' rota-warn' : ''}`}>entrega {fmtData(p.previsao)}</span>}
        {p?.baixaEscritorio?.em && (
          <span className="chip" title={`baixa do escritório por ${p.baixaEscritorio.por || '—'}`}>
            🏢 baixado pelo escritório {fmtData(p.baixaEscritorio.em)}
          </span>
        )}
      </div>

      {avisoEntregue.map((x) => (
        <div key={x.id} className="loc-alerta forte">
          🚨 {nomeCampoErro(x.campo)}{quemFez(x) && <> · {quemFez(x)}</>}{x.entregueEm && <> · em {fmtData(x.entregueEm)}</>}
          {x.obs && <div className="loc-alerta-obs">{x.obs}</div>}
        </div>
      ))}
      {outrosAvisos.map((x) => (
        <div key={x.id} className="loc-alerta">⚠ {nomeCampoErro(x.campo)}{quemFez(x) && <> · {quemFez(x)}</>}</div>
      ))}

      {/* ---- já entregue por inteiro: só o histórico, nada a fazer ---- */}
      {!p && r.remessas.map((e) => (
        <div key={e.id} className="loc-remessa">
          ✅ ENTREGUE · remessa {e.remessa || 1}{e.entregueEm && <> · {fmtDataHora(e.entregueEm)}</>}{e.motorista && <> · 🚚 {e.motorista}</>}
          {e.parcial && <span className="chip" style={{ marginLeft: 6 }}>entrega parcial</span>}
          <div className="loc-remessa-itens">
            {(e.itens || []).map((it, i) => <span key={i}>{it.produto} <b>{fmtQtd(it.qtd)}</b></span>)}
          </div>
        </div>
      ))}
      {!p && (
        <div className="loc-situacao ok">✅ Pedido já entregue
          <small>Não há mais nada a marcar. A baixa financeira fica em Entregues.</small>
        </div>
      )}

      {/* ---- na fábrica / pronto / saiu ---- */}
      {p && (
        <>
          <div className={`loc-situacao ${saiu ? 'aviso' : prontos.length && !haBaixavel ? 'ok' : ''}`}>
            {saiu ? `🚚 SAIU PARA ENTREGA · ${fmtDataHora(p.saidaEm)}${p.saidaMotorista ? ` · ${p.saidaMotorista}` : ''}`
              : prontos.length && !haBaixavel ? '✅ PRONTO · será entregue'
              : prontos.length ? '◑ PARTE PRONTA · o resto ainda na fábrica'
              : '🏭 NA FÁBRICA · o sistema não registrou a baixa'}
            {r.remessas.length > 0 && (
              <small>Já saíram {r.remessas.length} remessa(s) deste pedido (entrega parcial).</small>
            )}
          </div>

          <ul className="ctl-itens">
            {itens.map((s) => (
              <li key={s.key} className={s.concluido ? 'feito' : ''}>
                {podeBaixar && s.baixavel
                  ? <input type="checkbox" className="card-check" checked={marcados.has(s.idx)} onChange={() => alterna(s.idx)} disabled={ocupado} />
                  : <span className="ctl-marca">{s.concluido ? '✓' : '▫'}</span>}
                <div className="ctl-item-txt">
                  <div className="loc-item-nome"><SeloLinha linha={s.linha} />{s.produto} <small>· {fmtQtd(s.qtdItem)}</small></div>
                  <div className="ctl-item-onde">
                    {s.onde.map((o) => (
                      <span key={o.etapa} className={`loc-posto et-${o.etapa}`}>
                        <b>{ondeProcurar(o.etapa, s.material)}</b>
                        <span>{fmtQtd(o.qtd)}{o.volumes ? ` · ${o.volumes} vol.` : ''}</span>
                      </span>
                    ))}
                    {s.pronto > 0 && <span className="loc-posto et-expedido"><b>Pronto</b><span>{fmtQtd(s.pronto)}</span></span>}
                    {s.entregue > 0 && <span className="loc-posto et-entregue"><b>Entregue</b><span>{fmtQtd(s.entregue)}</span></span>}
                    {s.recusa && (
                      <span className="chip rota-warn" title="Parte solta de item já embalado: só fecha na montagem, com a balança.">
                        ⚠ {fmtQtd(s.recusa.qtd)} sem pesagem — fica na fábrica
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* ---- previsão / carga: a saída dessas é pela aba Entregas ---- */}
          {(sit.planosAbertos.length > 0 || emCarga) && (
            <div className="loc-logistica">
              {sit.planosAbertos.map((pl) => (
                <div key={pl.id} className="loc-linha"><span>📋 Na previsão #{pl.numero ?? '?'} · {rotuloPlano(pl)}</span></div>
              ))}
              {sit.cargasVivas.map((c) => (
                <div key={c.id} className="loc-linha">
                  <span>🚚 Na viagem {rotuloCarga(c)} · {c.status === STATUS_CARGA.SAIU ? 'saiu' : 'em montagem'}{c.motorista && <> · {c.motorista}</>}</span>
                  <small>a saída desta é marcada pela carga, em Entregas</small>
                </div>
              ))}
            </div>
          )}

          {podeBaixar && (
            <div className="ctl-acoes no-print">
              {haBaixavel && (
                <button className="btn primary" disabled={ocupado || marcados.size === 0}
                  onClick={() => onPronto(p, [...marcados])}>
                  ✅ Marcar PRONTO{marcados.size < itens.filter((s) => s.baixavel).length ? ` (${marcados.size} item(ns))` : ''}
                </button>
              )}
              {prontos.length > 0 && !emCarga && (
                <>
                  {motoristas.length > 0 && (
                    <select className="filtro-input" value={motorista} onChange={(e) => setMotorista(e.target.value)} disabled={ocupado}>
                      <option value="">Motorista…</option>
                      {motoristas.map((m) => <option key={m.id || m.nome} value={m.nome}>{m.nome}</option>)}
                    </select>
                  )}
                  {!saiu && (
                    <button className="btn" disabled={ocupado} onClick={() => onSaida(p, motorista)}>🚚 Saiu para entrega</button>
                  )}
                  {saiu && (
                    <button className="btn" disabled={ocupado} onClick={() => onCancelarSaida(p)}>↩ Não entregou (voltou)</button>
                  )}
                  <button className="btn ok" disabled={ocupado || !podeEntregar}
                    title={podeEntregar ? '' : 'A entrega é dada pelo escritório (dono, designer, financeiro).'}
                    onClick={() => onEntregar(p, motorista || p.saidaMotorista || '')}>
                    📦 ENTREGUE
                  </button>
                  {!podeEntregar && <small className="ctl-nota">entrega: só o escritório</small>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------- a tabela, igual à planilha ----------
export function TabelaControle({ linhas, totais, veValor, onAbrir }) {
  if (!linhas.length) {
    return <div className="empty"><div className="big">📋</div>Nenhuma linha neste mês com esses filtros.</div>
  }
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="rel-tab ctl-tab">
        <thead>
          <tr>
            <th>Nº</th><th>Cliente</th><th>Cidade</th><th>Rota</th><th>Vendedor</th>
            {veValor && <th className="q">Valor</th>}
            <th>Situação</th><th>Quando</th><th>Quem entregou</th><th>Origem</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className={`sit-${l.situacao}`}>
              <td><button className="ctl-num" onClick={() => onAbrir?.(l.idVenda)}>#{l.idVenda}</button>
                {l.remessa > 1 && <small> · rem. {l.remessa}</small>}</td>
              <td>{l.cliente}{l.parcial && <span className="chip" style={{ marginLeft: 6 }}>parcial</span>}</td>
              <td>{l.cidade || '—'}</td>
              <td>{l.rota || '—'}</td>
              <td>{l.vendedor || '—'}</td>
              {veValor && <td className="q">{l.valor ? fmtMoeda(l.valor) : '—'}</td>}
              <td><span className={`ctl-sit ${l.situacao}`}>{NOME_SITUACAO_CONTROLE[l.situacao]}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{l.quando ? `${l.aproximado ? '~' : ''}${fmtData(l.quando)}` : '—'}</td>
              <td>{l.motorista || '—'}</td>
              <td>{l.origem === ORIGEM_BAIXA.ESCRITORIO ? '🏢 escritório' : l.origem === ORIGEM_BAIXA.CONCILIACAO ? '📄 planilha' : '🏭 fábrica'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={veValor ? 5 : 5}>{totais.linhas} linha(s)</td>
            {veValor && <td className="q">{fmtMoeda(totais.valor)}</td>}
            <td colSpan={4}>{totais.pronto} será entregue · {totais.saiu} saiu · {totais.entregue} entregue</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// CSV do mês — para a transição, enquanto o escritório ainda quer "a planilha"
function baixarCsv(linhas, veValor, mes) {
  const cab = ['Pedido', 'Cliente', 'Cidade', 'Rota', 'Vendedor', ...(veValor ? ['Valor'] : []), 'Situação', 'Quando', 'Quem entregou', 'Origem', 'Parcial']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const linhasCsv = linhas.map((l) => [
    l.idVenda, l.cliente, l.cidade, l.rota, l.vendedor,
    ...(veValor ? [String(l.valor || 0).replace('.', ',')] : []),
    NOME_SITUACAO_CONTROLE[l.situacao], l.quando ? fmtData(l.quando) : '', l.motorista, l.origem, l.parcial ? 'sim' : '',
  ].map(esc).join(';'))
  const blob = new Blob(['﻿' + [cab.map(esc).join(';'), ...linhasCsv].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `controle-entrega-${mes || 'tudo'}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
