import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  buscaGlobal, situacaoBaixa, lancadoNoControle, situacaoEntrega,
  comprometimentoDeCargas, linhasControleEntrega, totaisDoControle,
  podeBaixarNoControle, podeEntregarNoControle, quemAssina, pegarIP,
  NOME_SITUACAO_CONTROLE, SITUACAO_CONTROLE, ORIGEM_BAIXA,
  saiuParaEntrega, nomeCliente, ondeProcurar,
  fmtData, fmtDataHora, fmtMoeda, fmtQtd, doDoc, previsaoDe, situacaoPrazo,
  indexaProblemas, problemasDoPedido, ehErroEntrega, nomeCampoErro, quemFez,
  STATUS_CARGA, rotuloCarga, rotuloPlano,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import Realce from '../components/Realce.jsx'
import AcoesControle, { useAcoesControle } from '../components/AcoesControle.jsx'

// CONTROLE DE ENTREGA — a planilha do escritório vira tela.
//
// A fábrica não dá baixa no quadro. Quando a nota fiscal sobe, o escritório
// registrava numa planilha: pedido, cliente, cidade, valor, "SERÁ ENTREGUE"/
// "ENTREGUE" e quem levou. Aqui o fluxo é o da planilha, em três cliques:
//   ESCRITÓRIO lança (nº + motorista) = pedido finalizado e SAIU  → SERÁ ENTREGUE
//   voltou no caminhão                                             → NÃO ENTREGOU
//   FINANCEIRO (ou dono) marca ENTREGUE                            → sai da lista
// Só entra na lista o que o escritório lançou; a baixa que a fábrica deu
// sozinha não aparece até alguém digitar o número. Desenho: CONTROLE_ENTREGA.md.
export default function ControleEntrega({ pedidos, problemas }) {
  const { clientes, vendedores: cadastros, motoristas, itens: itensCad } = useCadastros()
  const { user, perfil, nome, setores } = useAuth()
  const podeLancar = podeBaixarNoControle(perfil, setores)
  const podeEntregar = podeEntregarNoControle(perfil)
  const veValor = perfil === 'dono' || perfil === 'financeiro'
  const motoristasAtivos = (motoristas || []).filter((m) => m.ativo !== false)

  const [termo, setTermo] = useState('')
  const [entregues, setEntregues] = useState([])
  const [cargas, setCargas] = useState([])
  const [planos, setPlanos] = useState([])
  const [negado, setNegado] = useState({})
  const [situacao, setSituacao] = useState('')
  const [origem, setOrigem] = useState('')
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

  // a lista: VISÃO sobre `pedidos` — tudo que está pronto e não foi entregue
  const todasLinhas = useMemo(
    () => linhasControleEntrega(base, { clientes, vendedores: cadastros }),
    [base, clientes, cadastros])
  const linhas = todasLinhas.filter((l) => (!situacao || l.situacao === situacao) && (!origem || l.origem === origem))
  const totais = totaisDoControle(linhas)

  // o fluxo é "nota na mão, digita, escolhe o motorista, clica, próxima": depois
  // de gravar, o foco volta ao campo e o número fica lá para conferir o resultado
  const foca = () => setTimeout(() => inputRef.current?.focus(), 30)

  // as ações moram em `useAcoesControle` (fonte única com o Localizar)
  const acoes = useAcoesControle({ quem, nome, perfil, clientes, itensCad, podeLancar, podeEntregar, depois: foca })
  const salvando = acoes.salvando

  const unico = res.itens.length === 1 || (res.itens.length > 1 && res.itens[0].idVenda === res.termo)
  const alvo = unico ? res.itens[0] : null

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Controle de entrega
          <small>nº do pedido + motorista = finalizado e saiu · o financeiro marca entregue{!podeLancar && ' · só leitura'}</small>
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
          podeLancar={podeLancar} podeEntregar={podeEntregar} salvando={salvando}
          motoristas={motoristasAtivos} acoes={acoes}
          problemas={problemasDoPedido(mapaProblemas, alvo.idVenda)} />
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

      {/* ---------- a planilha: o que o escritório lançou e ainda não foi entregue ---------- */}
      <div className="toolbar ctl-toolbar">
        <h2 className="ctl-titulo">📋 Prontos e na rua
          <small>{totais.linhas} pedido(s) · {totais.sera} será entregue · {totais.pronto} pronto(s) sem saída · {totais.voltou} não entregou
            {totais.escritorio > 0 && <> · {totais.escritorio} lançado(s) pelo escritório</>}
            {veValor && totais.valor > 0 && <> · {fmtMoeda(totais.valor)}</>}</small>
        </h2>
        <div className="filtros no-print" style={{ margin: 0 }}>
          <select className="filtro-input" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.values(SITUACAO_CONTROLE).map((s) => (
              <option key={s} value={s}>{NOME_SITUACAO_CONTROLE[s]}</option>
            ))}
          </select>
          <select className="filtro-input" value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">Fábrica e escritório</option>
            <option value={ORIGEM_BAIXA.FABRICA}>🏭 Baixa da fábrica</option>
            <option value={ORIGEM_BAIXA.ESCRITORIO}>🏢 Lançado pelo escritório</option>
          </select>
          <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
          <button className="btn" onClick={() => baixarCsv(linhas, veValor)}>⬇ CSV</button>
        </div>
      </div>

      <TabelaControle linhas={linhas} totais={totais} veValor={veValor}
        onAbrir={(id) => { setTermo(id); window.scrollTo({ top: 0 }) }} />
    </>
  )
}

// ---------- o card do pedido digitado ----------
export function CardControle({ r, comp, cargas, planos, clientes, itensCad, termo, veValor,
                               podeLancar, podeEntregar, salvando, motoristas, problemas, acoes }) {
  const p = r.p
  const ref = p || r.remessas[r.remessas.length - 1] || {}
  const sit = situacaoEntrega(p, { cargas, planos, remessas: r.remessas, comp })
  const itens = p ? situacaoBaixa(p, itensCad) : []
  const lancado = lancadoNoControle(p)
  const saiu = saiuParaEntrega(p)
  const emCarga = sit.cargasVivas.length > 0
  const naFabrica = itens.some((s) => !s.concluido)
  const prazo = p ? situacaoPrazo(p.previsao) : ''
  const avisoEntregue = (problemas || []).filter((x) => x.status === 'aberto' && ehErroEntrega(x.campo))
  const outrosAvisos = (problemas || []).filter((x) => x.status === 'aberto' && !ehErroEntrega(x.campo))

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
        {lancado && (
          <span className="chip" title={`lançado por ${p.baixaEscritorio.por || '—'}`}>
            🏢 lançado {fmtDataHora(p.baixaEscritorio.em)} · {p.baixaEscritorio.por || '—'}
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

      {p && (
        <>
          <div className={`loc-situacao ${lancado && saiu ? 'ok' : lancado ? 'alerta' : naFabrica ? '' : 'aviso'}`}>
            {lancado && saiu ? `🚚 SERÁ ENTREGUE · saiu ${fmtDataHora(p.saidaEm)}${p.saidaMotorista ? ` com ${p.saidaMotorista}` : ''}`
              : lancado ? '↩ NÃO ENTREGOU · voltou, aguardando sair de novo'
              : naFabrica ? '🏭 NA FÁBRICA · o sistema não registrou a baixa'
              : '✅ PRONTO pela fábrica · ainda não lançado pelo escritório'}
            {r.remessas.length > 0 && (
              <small>Já saíram {r.remessas.length} remessa(s) deste pedido (entrega parcial).</small>
            )}
          </div>

          <ul className="ctl-itens">
            {itens.map((s) => (
              <li key={s.key} className={s.concluido ? 'feito' : ''}>
                <span className="ctl-marca">{s.concluido ? '✓' : '▫'}</span>
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
                    {s.recusa && !lancado && (
                      <span className="chip rota-warn" title="Parte solta de item já embalado: ao lançar vira volume declarado, sem pesagem.">
                        ⚠ {fmtQtd(s.recusa.qtd)} sem pesagem
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {(sit.planosAbertos.length > 0 || emCarga) && (
            <div className="loc-logistica">
              {sit.planosAbertos.map((pl) => (
                <div key={pl.id} className="loc-linha"><span>📋 Na previsão #{pl.numero ?? '?'} · {rotuloPlano(pl)}</span></div>
              ))}
              {sit.cargasVivas.map((c) => (
                <div key={c.id} className="loc-linha">
                  <span>🚚 Na viagem {rotuloCarga(c)} · {c.status === STATUS_CARGA.SAIU ? 'saiu' : 'em montagem'}{c.motorista && <> · {c.motorista}</>}</span>
                </div>
              ))}
            </div>
          )}

          <AcoesControle p={p} motoristas={motoristas} podeLancar={podeLancar} podeEntregar={podeEntregar}
            acoes={acoes || { salvando }} problemas={problemas} />
        </>
      )}
    </div>
  )
}

// ---------- a tabela, igual à planilha ----------
export function TabelaControle({ linhas, totais, veValor, onAbrir }) {
  if (!linhas.length) {
    return (
      <div className="empty"><div className="big">📋</div>
        Nenhum pedido pronto aguardando entrega com esses filtros.
        <div style={{ marginTop: 6, fontSize: 13 }}>Digite o número do pedido acima para lançar um.</div>
      </div>
    )
  }
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="rel-tab ctl-tab">
        <thead>
          <tr>
            <th>Nº</th><th>Cliente</th><th>Cidade</th><th>Rota</th><th>Vendedor</th>
            {veValor && <th className="q">Valor</th>}
            <th>Situação</th><th>Pronto em</th><th>Saiu</th><th>Quem entregou</th><th>Origem</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className={`sit-${l.situacao}`}>
              <td><button className="ctl-num" onClick={() => onAbrir?.(l.idVenda)}>#{l.idVenda}</button></td>
              <td>{l.cliente}
                {l.parcial && <span className="chip" style={{ marginLeft: 6 }} title="parte do pedido ainda na fábrica">parcial</span>}
                {l.remessas > 0 && <span className="chip" style={{ marginLeft: 6 }}>{l.remessas} remessa(s) já entregue(s)</span>}</td>
              <td>{l.cidade || '—'}</td>
              <td>{l.rota || '—'}</td>
              <td>{l.vendedor || '—'}</td>
              {veValor && <td className="q">{l.valor ? fmtMoeda(l.valor) : '—'}</td>}
              <td><span className={`ctl-sit ${l.situacao}`}>{NOME_SITUACAO_CONTROLE[l.situacao]}</span></td>
              <td style={{ whiteSpace: 'nowrap' }} title={l.lancadoPor ? `lançado por ${l.lancadoPor}` : 'baixa da fábrica'}>
                {l.quando ? `${l.aproximado ? '~' : ''}${fmtData(l.quando)}` : '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{l.saidaEm ? fmtData(l.saidaEm) : '—'}</td>
              <td>{l.motorista || '—'}</td>
              <td>{l.origem === ORIGEM_BAIXA.ESCRITORIO ? '🏢 escritório' : '🏭 fábrica'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>{totais.linhas} pedido(s)</td>
            {veValor && <td className="q">{fmtMoeda(totais.valor)}</td>}
            <td colSpan={5}>{totais.sera} será entregue · {totais.pronto} pronto(s) · {totais.voltou} não entregou</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// CSV — para a transição, enquanto o escritório ainda quer "a planilha"
function baixarCsv(linhas, veValor) {
  const cab = ['Pedido', 'Cliente', 'Cidade', 'Rota', 'Vendedor', ...(veValor ? ['Valor'] : []), 'Situação', 'Pronto em', 'Saiu', 'Quem entregou', 'Origem']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const linhasCsv = linhas.map((l) => [
    l.idVenda, l.cliente, l.cidade, l.rota, l.vendedor,
    ...(veValor ? [String(l.valor || 0).replace('.', ',')] : []),
    NOME_SITUACAO_CONTROLE[l.situacao], l.quando ? fmtData(l.quando) : '', l.saidaEm ? fmtData(l.saidaEm) : '', l.motorista, l.origem,
  ].map(esc).join(';'))
  const blob = new Blob(['﻿' + [cab.map(esc).join(';'), ...linhasCsv].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `controle-entrega-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
