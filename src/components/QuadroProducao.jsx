import { useEffect, useState } from 'react'
import { collection, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  etapaDoItem, proximaEtapaItem, etapaAnteriorItem, nomeEtapaItem,
  mapaEtapasCom, normSetor, MODO_COR,
  nomeCliente, fmtData, fmtMoeda, situacaoPrazo,
  linhaDoItem, acabamentoDoItem, acabamentoItemOk, fmtAcabamento, valorDosItens, logEtapaItem,
  materialDoItem, montagemDoMaterial, itemPertenceAoPainel, podeNoMaterial, MONTAGENS,
  registrosAuditoria, pegarIP,
} from '../utils.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import DataEntrega from './DataEntrega.jsx'
import SeloLinha from './SeloLinha.jsx'

// Quadro de produção POR ITEM, uma FILA POR SETOR: cada painel recebido mostra
// só o que está NAQUELE posto agora — o item some da fila assim que avança.
// A montagem se divide pelo MATERIAL (papel / plástico / etiq.+alça), porque
// quem monta papel não é quem monta plástico; a etapa gravada segue 'montagem'.
// Recebe uma LISTA de painéis: um só = fila do operador; todos = visão geral.
// NÃO mostra valor para operador/designer/expedição (só dono e financeiro).
export default function QuadroProducao({ pedidos, clientes, itensCad, paineis }) {
  const { user, perfil, nome, setores, materiais } = useAuth()
  const ehStaff = perfil === 'dono' || perfil === 'designer'
  const veValor = perfil === 'dono' || perfil === 'financeiro'
  // setores que este usuário pode MOVER: expedicao = só 'expedicao'; operador = liberados dele
  const setoresOp = perfil === 'expedicao'
    ? ['expedicao']
    : (perfil === 'operador' ? (setores || []).map(normSetor) : [])
  const podeMoverEtapa = (etapa) => ehStaff || setoresOp.includes(etapa)
  // 2º eixo da permissão: com que material eu trabalho ([] = todos)
  const meusMateriais = perfil === 'operador' ? (materiais || []) : []
  const [salvando, setSalvando] = useState('')
  // IP pego uma vez por sessão da tela — não atrasa cada movimento
  const [ip, setIp] = useState('')
  useEffect(() => { pegarIP().then(setIp) }, [])

  // monta os cards: um por (pedido × painel), com os índices dos itens que estão ali
  const porPainel = {}
  for (const pa of paineis) porPainel[pa.id] = []
  let aguardandoAcab = 0
  const semMaterial = new Set()   // itens na montagem que o cadastro de Itens não conhece
  for (const p of pedidos) {
    const grupos = {}
    ;(p.itens || []).forEach((_, i) => {
      const l = linhaDoItem(p, i)
      if (!l) return                            // item sem linha ainda está na Triagem
      const mat = materialDoItem(p.itens[i], itensCad)
      if (!podeNoMaterial(meusMateriais, mat)) return
      for (const pa of paineis) {
        if (!itemPertenceAoPainel(pa, p, i, mat)) continue
        // item de gráfica sem laminação não entra — o designer precisa fechar na Triagem
        if (pa.tipo === 'linha' && l === 'GRAFICA' && !acabamentoItemOk(acabamentoDoItem(p, i))) {
          aguardandoAcab++; continue
        }
        if (pa.tipo === 'montagem' && !mat) semMaterial.add(`${p.idVenda}|${i}`)
        ;(grupos[pa.id] ??= []).push(i)
      }
    })
    for (const [id, idxs] of Object.entries(grupos)) porPainel[id].push({ p, idxs })
  }
  for (const pa of paineis) {
    porPainel[pa.id].sort((a, b) => (a.p.previsao || '').localeCompare(b.p.previsao || ''))
  }

  // move os itens escolhidos (o card inteiro ou um item só) para outra etapa
  async function mover(p, idxs, destino, marca) {
    if (!destino || salvando) return
    setSalvando(marca)
    try {
      // etapa + auditoria no MESMO batch: ou as duas coisas acontecem, ou nenhuma.
      // Assim nunca existe item movido sem registro de quem moveu.
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', p.idVenda), { etapas: mapaEtapasCom(p, idxs, destino, nome) })
      const quem = {
        porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
        perfil: perfil || '', ip,
      }
      const regs = registrosAuditoria(p, idxs, destino, quem, (i) => materialDoItem(p.itens[i], itensCad))
      for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
    } catch (e) {
      console.error('Erro ao mover etapa:', e)
      alert('Erro ao mover: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  if (!paineis.length) {
    return <div className="empty"><div className="big">🏭</div>Você não tem setores de produção liberados. Fale com o administrador.</div>
  }

  return (
    <>
      {aguardandoAcab > 0 && (
        <div className="aviso-acab no-print">
          ⚠ {aguardandoAcab} item(ns) de gráfica ainda sem <b>laminação</b> — marque na Triagem para eles entrarem no quadro.
        </div>
      )}
      {semMaterial.size > 0 && (
        <div className="aviso-acab no-print">
          ⚠ {semMaterial.size} item(ns) na montagem sem <b>material</b> no cadastro de Itens — aparecem em
          todas as montagens até alguém dizer se são papel, plástico, etiqueta ou alça.
        </div>
      )}
      <div className="quadro">
        {paineis.map((pa) => (
          <div key={pa.id} className="quadro-col">
            <div className="qc-head" style={pa.tipo === 'linha' ? { borderLeft: `4px solid ${MODO_COR[pa.linha]}` } : null}>
              {pa.nome} <span className="qc-count">{porPainel[pa.id].length}</span>
            </div>
            <div className="qc-body">
              {porPainel[pa.id].length === 0 && <div className="qc-vazio">— nada aqui —</div>}
              {porPainel[pa.id].map(({ p, idxs }) => {
                const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
                const prox = proximaEtapaItem(pa.etapa)
                const marca = `${p.idVenda}|${pa.id}`
                const parcial = idxs.length < (p.itens || []).length
                const valor = valorDosItens(p, idxs)
                // volta: da montagem cada item retorna para a SUA linha (o card
                // pode ter itens de linhas diferentes), da expedição todos p/ montagem
                const anteriorDe = (i) => (pa.etapa === 'montagem' ? linhaDoItem(p, i) : etapaAnteriorItem(pa.etapa))
                // quando o card inteiro vai para a mesma montagem, o botão diz qual
                const destinos = new Set(idxs.map((i) => montagemDoMaterial(materialDoItem(p.itens[i], itensCad))))
                const nmProx = (prox === 'montagem' && destinos.size === 1 && [...destinos][0])
                  ? MONTAGENS.find((m) => m.id === [...destinos][0]).nome
                  : nomeEtapaItem(prox)
                return (
                  <div key={marca} className={`qcard ${atrasado ? 'atrasado' : ''}`}>
                    <div className="qcard-top">
                      <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
                      <span className="idv">#{p.idVenda}</span>
                    </div>
                    <div className="qcard-meta">
                      <span className="chip">📍 {p.rota || p.cidade || '—'}</span>
                      <DataEntrega p={p} atrasado={atrasado} />
                      {parcial && (
                        <span className="chip" title="Os outros itens deste pedido estão em outra etapa">
                          {idxs.length} de {(p.itens || []).length} itens
                        </span>
                      )}
                    </div>
                    <ul className="itens">
                      {idxs.map((i) => {
                        const it = p.itens[i]
                        const lItem = linhaDoItem(p, i)
                        const antItem = anteriorDe(i)
                        const semMat = pa.tipo === 'montagem' && !materialDoItem(it, itensCad)
                        return (
                          <li key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                              {/* o selo da linha anda junto com o produto em toda etapa */}
                              <span><SeloLinha linha={lItem} />{it.produto}</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span className="q">{it.qtd}</span>
                                {/* avança/volta SÓ este item — é o que separa o card em dois */}
                                {podeMoverEtapa(pa.etapa) && idxs.length > 1 && (
                                  <span style={{ display: 'inline-flex', gap: 2 }}>
                                    {antItem && (
                                      <button className="mini-btn" title={`Voltar só este item para ${nomeEtapaItem(antItem)}`}
                                        disabled={!!salvando} onClick={() => mover(p, [i], antItem, marca)}>←</button>
                                    )}
                                    {prox && (
                                      <button className="mini-btn" title={`Avançar só este item para ${nomeEtapaItem(prox)}`}
                                        disabled={!!salvando} onClick={() => mover(p, [i], prox, marca)}>→</button>
                                    )}
                                  </span>
                                )}
                              </span>
                            </span>
                            {lItem === 'GRAFICA' && (
                              <span className="acab-tag">🏷 {fmtAcabamento(acabamentoDoItem(p, i))}</span>
                            )}
                            {semMat && (
                              <span className="acab-tag" title="Cadastre o material deste produto em Cadastros › Itens">
                                ⚠ sem material no cadastro
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {veValor && (
                      <div className="qcard-valor">
                        {valor !== null
                          ? fmtMoeda(valor)
                          : <span title="A planilha do Posseidon não traz valor por item">{fmtMoeda(p.valorTotal)} <small>total do pedido</small></span>}
                      </div>
                    )}
                    {(() => {
                      const l = idxs.map((i) => logEtapaItem(p, i)).find(Boolean)
                      return l ? <div className="qcard-log">último avanço: {l.por}{l.em ? ` · ${fmtData(l.em)}` : ''}</div> : null
                    })()}
                    {podeMoverEtapa(pa.etapa) && (
                      <div className="qcard-acoes no-print">
                        {/* coluna de linha é o começo do fluxo — só Montagem/Expedição voltam */}
                        {pa.tipo !== 'linha' && (
                          <button className="mini-btn" title={`Voltar ${idxs.length > 1 ? 'os itens' : 'o item'} para a etapa anterior`}
                            disabled={!!salvando}
                            onClick={() => mover(p, idxs, anteriorDe, marca)}
                          >←</button>
                        )}
                        {prox && prox !== 'expedido' && (
                          <button className="btn ok qc-avancar" disabled={!!salvando}
                            onClick={() => mover(p, idxs, prox, marca)}>
                            {salvando === marca ? 'Salvando…' : `Concluir → ${nmProx}`}
                          </button>
                        )}
                        {prox === 'expedido' && (
                          <button className="btn ok qc-avancar" disabled={!!salvando}
                            title="Sai do quadro e segue para a Rota/Entrega"
                            onClick={() => mover(p, idxs, 'expedido', marca)}>
                            {salvando === marca ? 'Salvando…' : '✓ Expedir'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
