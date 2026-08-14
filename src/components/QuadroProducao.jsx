import { useEffect, useState } from 'react'
import { collection, doc, writeBatch, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  etapaDoItem, proximaEtapaItem, etapaAnteriorItem, nomeEtapaItem,
  normSetor, MODO_COR,
  nomeCliente, fmtData, fmtMoeda, situacaoPrazo,
  linhaDoItem, acabamentoDoItem, acabamentoItemOk, fmtAcabamento, valorDosItens, logEtapaItem,
  materialDoItem, montagemDoMaterial, itemPertenceAoPainel, podeNoMaterial, MONTAGENS,
  registrosAuditoria, pegarIP, progressoNoPainel, ordemRota,
  qtdNoPainel, mapaEtapasComQtd, arredondaQtd, fmtQtd, unidadeDoMaterial,
  fechaMontagemEmVolumes, keyDoItem, distribuicaoDoItem, doMapaDoItem,
  temVolumes, volumesNaEtapa, volumesDoItem, mapaEtapasMovendoVolumes, podeDesembalar,
  docProblema, problemaDoItem, temCorrecao,
} from '../utils.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import DataEntrega from './DataEntrega.jsx'
import SeloLinha from './SeloLinha.jsx'
import FecharMontagem from './FecharMontagem.jsx'
import ReportarErro from './ReportarErro.jsx'

// Quadro de produção POR ITEM, uma FILA POR SETOR: cada painel recebido mostra
// só o que está NAQUELE posto agora — o item some da fila assim que avança.
// A montagem se divide pelo MATERIAL (papel / plástico / etiq.+alça), porque
// quem monta papel não é quem monta plástico; a etapa gravada segue 'montagem'.
// Recebe uma LISTA de painéis: um só = fila do operador; todos = visão geral.
// NÃO mostra valor para operador/designer/expedição (só dono e financeiro).
export default function QuadroProducao({ pedidos, clientes, itensCad, paineis, problemas }) {
  const { user, perfil, nome, setores, materiais } = useAuth()
  const { vendedores: cadastros } = useCadastros()   // ordem das rotas de cada vendedor
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
  // quanto mover de cada item: { "idVenda|painel|idx": número }. Vazio = tudo
  // que está naquela etapa (o caso comum é concluir a quantidade inteira).
  const [qtds, setQtds] = useState({})
  const poeQtd = (k, v) => setQtds((s) => ({ ...s, [k]: v }))
  // item cujo fechamento de montagem está aberto: { p, idx }
  const [fechando, setFechando] = useState(null)
  // item cujo report de erro está aberto: { p, idx }
  const [reportando, setReportando] = useState(null)
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
  // AGRUPA A FILA: Data de entrega → Vendedor → Rota (na ordem do cadastro do
  // vendedor). A produção fecha uma rota inteira antes de ir para a próxima, e a
  // data vem primeiro para o que sai sexta não ficar atrás do que sai daqui a
  // três semanas. O contador da faixa conta a rota INTEIRA neste setor — inclusive
  // o que ainda não chegou aqui —, que é o que denuncia rota incompleta antes da data.
  const chaveGrupo = (p) => `${p.previsao || '9999'}|${p.vendedor || '—'}|${p.rota || 'SEM ROTA'}`
  const gruposPorPainel = {}
  for (const pa of paineis) {
    const mapa = {}
    for (const card of porPainel[pa.id]) {
      const k = chaveGrupo(card.p)
      ;(mapa[k] ??= {
        chave: k,
        previsao: card.p.previsao || '',
        vendedor: card.p.vendedor || '—',
        rota: card.p.rota || 'SEM ROTA',
        cards: [],
      }).cards.push(card)
    }
    const lista = Object.values(mapa)
    for (const g of lista) {
      const daRota = pedidos.filter((p) => chaveGrupo(p) === g.chave)
      g.progresso = progressoNoPainel(pa, daRota, itensCad, meusMateriais)
    }
    lista.sort((a, b) =>
      (a.previsao || '9999').localeCompare(b.previsao || '9999')
      || a.vendedor.localeCompare(b.vendedor)
      || (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
      || a.rota.localeCompare(b.rota))
    gruposPorPainel[pa.id] = lista
  }

  // Move QUANTIDADE dos itens escolhidos para outra etapa.
  // movimentos = [{ idx, de, para, qtd }] — com produção parcial o item pode
  // avançar só em parte, e o resto continua onde estava.
  async function mover(p, movimentos, marca) {
    // Item já embalado não anda por quantidade: move-se o VOLUME inteiro, que é
    // a unidade física dali em diante.
    const comVolume = (movimentos || []).filter((m) => m.para && temVolumes(p, m.idx))
    // voltar para a montagem desfaz a embalagem — só dá enquanto nada saiu
    const travados = comVolume.filter((m) => m.para === 'montagem' && !podeDesembalar(p, m.idx))
    if (travados.length) {
      alert('Não dá para voltar: já há volume expedido ou entregue neste item.\n' +
        'Cancele a entrega ou traga o volume de volta para a expedição antes.')
      return
    }
    const porVolume = comVolume
      .map((m) => ({
        idx: m.idx, para: m.para,
        ids: m.para === 'montagem' ? [] : volumesNaEtapa(p, m.idx, m.de),
      }))
      .filter((m) => m.para === 'montagem' || m.ids.length)
    if (porVolume.length) return moverVolumes(p, porVolume, marca)

    const mov = (movimentos || []).filter((m) => m.para && m.qtd > 0)
    if (!mov.length || salvando) return
    setSalvando(marca)
    try {
      // etapa + auditoria no MESMO batch: ou as duas coisas acontecem, ou nenhuma.
      // Assim nunca existe item movido sem registro de quem moveu.
      const batch = writeBatch(db)
      const idxs = mov.map((m) => m.idx)
      const destino = (i) => mov.find((m) => m.idx === i)?.para
      batch.update(doc(db, 'pedidos', p.idVenda), { etapas: mapaEtapasComQtd(p, mov, nome) })
      const quem = {
        porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
        perfil: perfil || '', ip,
      }
      const regs = registrosAuditoria(p, idxs, destino, quem, (i) => materialDoItem(p.itens[i], itensCad))
      // a auditoria registra QUANTO andou e DE ONDE. O `de` não pode sair de
      // etapaDoItem: com o item dividido, ela devolve a etapa mais atrasada, que
      // não é necessariamente a coluna de onde a pessoa moveu.
      regs.forEach((r, n) => {
        r.qtd = mov[n]?.qtd ?? r.qtd
        r.qtdItem = arredondaQtd(p.itens[mov[n]?.idx]?.qtd)
        r.de = mov[n]?.de ?? r.de
      })
      for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
    } catch (e) {
      console.error('Erro ao mover etapa:', e)
      alert('Erro ao mover: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  // Fecha a montagem de UM item criando os volumes. É por item porque cada
  // produto é embalado separado — não faz sentido fechar o card inteiro de uma vez.
  async function fecharMontagem(p, idx, volumes, consumido) {
    if (salvando) return
    const marca = `fechar|${p.idVenda}|${idx}`
    setSalvando(marca)
    try {
      const entrada = fechaMontagemEmVolumes(p, idx, volumes, consumido, nome)
      if (!entrada) { setFechando(null); return }
      const etapas = { ...(p.etapas || {}) }
      ;(p.itens || []).forEach((_, i) => {
        const k = keyDoItem(p, i)
        if (i === idx) { etapas[k] = entrada; return }
        // congela os outros no formato novo, como o mapaEtapasComQtd faz
        const d = distribuicaoDoItem(p, i)
        const ant = doMapaDoItem(p?.etapas, p, i)
        etapas[k] = ant?.volumes
          ? ant
          : { montagem: d.montagem, expedicao: d.expedicao, expedido: d.expedido, entregue: d.entregue,
              por: ant?.por || '', em: ant?.em || '' }
      })
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', p.idVenda), { etapas })
      const quem = {
        porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
        perfil: perfil || '', ip,
      }
      const regs = registrosAuditoria(p, [idx], 'expedicao', quem,
        (i) => materialDoItem(p.itens[i], itensCad))
      regs.forEach((r) => {
        r.de = 'montagem'
        r.qtd = arredondaQtd(volumes.reduce((sm, v) => sm + (Number(v.qtd) || 0), 0))
        r.qtdItem = arredondaQtd(p.itens[idx]?.qtd)
        r.volumes = volumes.length
      })
      for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
      setFechando(null)
    } catch (e) {
      console.error('Erro ao fechar montagem:', e)
      alert('Erro ao fechar: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  // move volumes de etapa (expedir, voltar) — mesma auditoria do mover por quantidade
  async function moverVolumes(p, movs, marca) {
    if (salvando) return
    setSalvando(marca)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', p.idVenda), {
        etapas: mapaEtapasMovendoVolumes(p, movs, nome),
      })
      const quem = {
        porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
        perfil: perfil || '', ip,
      }
      const idxs = movs.map((m) => m.idx)
      const regs = registrosAuditoria(p, idxs, (i) => movs.find((m) => m.idx === i)?.para, quem,
        (i) => materialDoItem(p.itens[i], itensCad))
      regs.forEach((r, n) => {
        const m = movs[n]
        const vols = m.para === 'montagem'
          ? volumesDoItem(p, m.idx)                       // desembalar desfaz todos
          : volumesDoItem(p, m.idx).filter((v) => m.ids.includes(v.id))
        r.qtd = arredondaQtd(vols.reduce((sm, v) => sm + v.qtd, 0))
        r.qtdItem = arredondaQtd(p.itens[m.idx]?.qtd)
        r.volumes = vols.length
        if (m.para === 'montagem') r.desembalou = true
      })
      for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
    } catch (e) {
      console.error('Erro ao mover volumes:', e)
      alert('Erro ao mover: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  // Registra um erro visto por quem está produzindo. Não move nada e não trava
  // o item — só acende o ⚠ até alguém resolver.
  async function reportarErro(p, idx, dados) {
    if (salvando) return
    setSalvando('reportar')
    try {
      const quem = {
        porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
        perfil: perfil || '', ip,
      }
      await setDoc(doc(collection(db, 'problemas')), docProblema({ p, idx, ...dados, quem }))
      setReportando(null)
    } catch (e) {
      alert('Não foi possível reportar: ' + (e.code || e.message))
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
      {reportando && (
        <ReportarErro
          p={reportando.p} idx={reportando.idx} clientes={clientes} itensCad={itensCad}
          salvando={salvando === 'reportar'}
          onCancelar={() => setReportando(null)}
          onEnviar={(dados) => reportarErro(reportando.p, reportando.idx, dados)}
        />
      )}
      {fechando && (
        <FecharMontagem
          p={fechando.p} idx={fechando.idx} clientes={clientes} itensCad={itensCad}
          salvando={!!salvando}
          onCancelar={() => setFechando(null)}
          onFechar={(vols, consumido) => fecharMontagem(fechando.p, fechando.idx, vols, consumido)}
        />
      )}
      <div className="quadro">
        {paineis.map((pa) => (
          <div key={pa.id} className="quadro-col">
            <div className="qc-head" style={pa.tipo === 'linha' ? { borderLeft: `4px solid ${MODO_COR[pa.linha]}` } : null}>
              {pa.nome} <span className="qc-count">{porPainel[pa.id].length}</span>
            </div>
            <div className="qc-body">
              {porPainel[pa.id].length === 0 && <div className="qc-vazio">— nada aqui —</div>}
              {gruposPorPainel[pa.id].map((g, gi, todos) => (
                <div key={g.chave} className="qc-grupo">
                  {/* a data só reaparece quando muda — dentro dela, as rotas */}
                  {(gi === 0 || todos[gi - 1].previsao !== g.previsao) && (
                    <div className={`qc-data${situacaoPrazo(g.previsao) === 'atrasado' ? ' atrasado' : ''}`}>
                      📅 {fmtData(g.previsao)}
                    </div>
                  )}
                  <div className="qc-rota">
                    <span>📍 {g.rota} · {g.vendedor}</span>
                    <span className={`qc-prog${g.progresso.feitos >= g.progresso.total ? ' ok' : ''}`}
                      title="Itens desta rota que já passaram por este setor (conta os que ainda não chegaram aqui)">
                      {g.progresso.feitos} de {g.progresso.total}
                    </span>
                  </div>
              {g.cards.map(({ p, idxs }) => {
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
                // movimentos do CARD inteiro: cada item leva a quantidade digitada
                // (ou tudo que tem nesta etapa, que é o caso comum)
                const movsPara = (paraFn) => idxs.map((i) => {
                  const aqui = qtdNoPainel(pa, p, i, materialDoItem(p.itens[i], itensCad))
                  const dig = qtds[`${marca}|${i}`]
                  const q = dig === '' || dig === undefined ? aqui : Math.min(arredondaQtd(dig), aqui)
                  return { idx: i, de: pa.etapa, para: typeof paraFn === 'function' ? paraFn(i) : paraFn, qtd: q }
                })
                // o card só está "inteiro" quando ninguém digitou uma parte
                const parcialDigitada = idxs.some((i) => {
                  const dig = qtds[`${marca}|${i}`]
                  if (dig === '' || dig === undefined) return false
                  return arredondaQtd(dig) < qtdNoPainel(pa, p, i, materialDoItem(p.itens[i], itensCad))
                })
                return (
                  <div key={marca} className={`qcard ${atrasado ? 'atrasado' : ''}`}>
                    <div className="qcard-top">
                      <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
                      <span className="idv">#{p.idVenda}</span>
                    </div>
                    <div className="qcard-meta">
                      {/* a ROTA está na faixa do grupo — aqui vale a cidade da entrega */}
                      <span className="chip">📍 {p.cidade || p.rota || '—'}</span>
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
                        // quantidade DESTE item nesta etapa (pode ser parte do total)
                        const aqui = qtdNoPainel(pa, p, i, materialDoItem(it, itensCad))
                        const total = arredondaQtd(it.qtd)
                        const un = unidadeDoMaterial(materialDoItem(it, itensCad))
                        const chave = `${marca}|${i}`
                        const digitado = qtds[chave]
                        const aMover = digitado === '' || digitado === undefined
                          ? aqui
                          : Math.min(arredondaQtd(digitado), aqui)
                        return (
                          <li key={i} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                              {/* o selo da linha anda junto com o produto em toda etapa */}
                              <span><SeloLinha linha={lItem} />{it.produto}</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span className="q" title={aqui < total ? `${fmtQtd(total)} ${un} no pedido` : ''}>
                                  {fmtQtd(aqui)}
                                  {aqui < total && <small className="q-de"> de {fmtQtd(total)}</small>}
                                  {/* quantidade corrigida: mostra o que veio da planilha
                                      ao lado, para ninguém achar que mudou sozinha */}
                                  {temCorrecao(p, i) && (
                                    <small className="q-de" title="Corrigido a partir de um erro reportado">
                                      {' '}(era {fmtQtd(it._qtdOriginal)})
                                    </small>
                                  )}
                                </span>
                                <button className={`mini-btn${problemaDoItem(problemas, p.idVenda, keyDoItem(p, i)).length ? ' alerta' : ''}`}
                                  title={problemaDoItem(problemas, p.idVenda, keyDoItem(p, i)).length
                                    ? 'Já existe erro reportado neste item — clique para reportar outro'
                                    : 'Reportar erro: o papel não bate com o sistema'}
                                  disabled={!!salvando}
                                  onClick={() => setReportando({ p, idx: i })}>⚠</button>
                                {/* avança/volta SÓ este item, e só a quantidade digitada */}
                                {podeMoverEtapa(pa.etapa) && (
                                  <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                                    {/* com volumes, quem anda é o volume: o campo de
                                        quantidade só confundiria */}
                                    {pa.tipo !== 'montagem' && !temVolumes(p, i) && (
                                      <input className="qtd-input" type="number" min="0" max={aqui}
                                        step={un === 'kg' ? '0.001' : '1'}
                                        placeholder={String(aqui)}
                                        value={digitado ?? ''}
                                        onChange={(e) => poeQtd(chave, e.target.value)}
                                        title={`Quanto avançar (de ${fmtQtd(aqui)} ${un})`} />
                                    )}
                                    {antItem && (
                                      <button className="mini-btn" title={`Voltar ${fmtQtd(aMover)} para ${nomeEtapaItem(antItem)}`}
                                        disabled={!!salvando} onClick={() => mover(p, [{ idx: i, de: pa.etapa, para: antItem, qtd: aMover }], marca)}>←</button>
                                    )}
                                    {prox && pa.tipo === 'montagem' && (
                                      // embalar é por item: abre o fechamento em volumes
                                      <button className="mini-btn" title="Fechar este item em volumes"
                                        disabled={!!salvando} onClick={() => setFechando({ p, idx: i })}>📦</button>
                                    )}
                                    {prox && pa.tipo !== 'montagem' && (
                                      <button className="mini-btn" title={`Avançar ${fmtQtd(aMover)} para ${nomeEtapaItem(prox)}`}
                                        disabled={!!salvando} onClick={() => mover(p, [{ idx: i, de: pa.etapa, para: prox, qtd: aMover }], marca)}>→</button>
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
                            {/* Na Expedição quem manda é o VOLUME: é ele que a pessoa
                                pega e põe no caminhão. Cada um sai sozinho. */}
                            {pa.etapa === 'expedicao' && temVolumes(p, i) && (
                              <ul className="vol-fila">
                                {volumesDoItem(p, i).filter((v) => v.et === 'expedicao').map((v) => (
                                  <li key={v.id}>
                                    <span>📦 vol. {v.n}</span>
                                    <span className="q">{fmtQtd(v.qtd)} {un}</span>
                                    {podeMoverEtapa(pa.etapa) && (
                                      <button className="mini-btn" title={`Expedir só o volume ${v.n}`}
                                        disabled={!!salvando}
                                        onClick={() => moverVolumes(p, [{ idx: i, ids: [v.id], para: 'expedido' }], marca)}>→</button>
                                    )}
                                  </li>
                                ))}
                              </ul>
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
                            onClick={() => mover(p, movsPara(anteriorDe), marca)}
                          >←</button>
                        )}
                        {prox && prox !== 'expedido' && pa.tipo === 'montagem' && (
                          <span className="qc-dica">
                            📦 feche item a item — cada produto vai nos seus volumes
                          </span>
                        )}
                        {prox && prox !== 'expedido' && pa.tipo !== 'montagem' && (
                          <button className="btn ok qc-avancar" disabled={!!salvando}
                            onClick={() => mover(p, movsPara(prox), marca)}>
                            {salvando === marca
                              ? 'Salvando…'
                              : `${parcialDigitada ? 'Concluir parte' : 'Concluir'} → ${nmProx}`}
                          </button>
                        )}
                        {prox === 'expedido' && (
                          <button className="btn ok qc-avancar" disabled={!!salvando}
                            title="Sai do quadro e segue para a Rota/Entrega"
                            onClick={() => mover(p, movsPara('expedido'), marca)}>
                            {salvando === marca
                              ? 'Salvando…'
                              : (parcialDigitada ? '✓ Expedir parte' : '✓ Expedir')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
