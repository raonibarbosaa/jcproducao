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
  ETAPAS_VOLUME,
  docProblema, problemaDoItem, problemasDoPedido, ehErroEntrega, temCorrecao,
  tempoNaEtapa, fmtDuracao, diasDe, carimbaTempos, quemAssina,
  quemFez,
  coresDoItem,
  idsDeOFsVivas, modoNaLinha, ofDoItem, jaEstavaNaFila, itemPedeCor, distribuiBaixaOF, fmtNumeroOF, fmtCores,
  fmtProdutosOF, ordemProdutoOF, normaliza,
} from '../utils.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import DataEntrega from './DataEntrega.jsx'
import SeloLinha from './SeloLinha.jsx'
import SeloCor from './SeloCor.jsx'
import FecharMontagem from './FecharMontagem.jsx'
import ReportarErro from './ReportarErro.jsx'

// Quadro de produção POR ITEM, uma FILA POR SETOR: cada painel recebido mostra
// só o que está NAQUELE posto agora — o item some da fila assim que avança.
// A montagem se divide pelo MATERIAL (papel / plástico / etiq.+alça), porque
// quem monta papel não é quem monta plástico; a etapa gravada segue 'montagem'.
// Recebe uma LISTA de painéis: um só = fila do operador; todos = visão geral.
// NÃO mostra valor para operador/designer/expedição (só dono e financeiro).
// Há quanto tempo isto está parado aqui. A cor sobe com a espera, mas o número
// aparece sempre: esconder o tempo pequeno faria o chip surgir "do nada" no dia
// em que já está tarde.
function Espera({ ms }) {
  const d = diasDe(ms)
  const nivel = d >= 7 ? ' esp-grave' : d >= 3 ? ' esp-alerta' : ''
  return (
    <span className={`chip espera${nivel}`} title="Tempo parado neste setor">
      ⏱ {fmtDuracao(ms)}
    </span>
  )
}

// `posto` = o estado do tablet (usePosto) quando a conta é de posto; senão null.
// `ordens` + `producaoCfg`: sacola plástica com OF viva anda no card da OF (fase
// C); com a exigência ligada, a sem OF espera fora do quadro — menos as que já
// estavam na fila no dia da virada.
export default function QuadroProducao({ pedidos, clientes, itensCad, paineis, problemas, posto,
  ordens = [], producaoCfg = {} }) {
  const { user, perfil, nome, setores, materiais, posto: contaPosto } = useAuth()
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
  // a OF tem um campo por PRODUTO: depois da baixa, limpa todos os dela
  const limpaQtds = (prefixo) => setQtds((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(prefixo))))
  // item cujo fechamento de montagem está aberto: { p, idx }
  const [fechando, setFechando] = useState(null)
  // item cujo report de erro está aberto: { p, idx }
  const [reportando, setReportando] = useState(null)
  // IP pego uma vez por sessão da tela — não atrasa cada movimento
  const [ip, setIp] = useState('')
  useEffect(() => { pegarIP().then(setIp) }, [])

  // No TABLET, quem assina é o funcionário do PIN, não a conta logada. Sem
  // ninguém identificado, nada se move — senão a baixa sairia sem autor.
  const executor = contaPosto ? (posto?.executor || null) : null
  const semQuem = !!contaPosto && !executor
  const assina = executor?.nome || nome              // o `por` gravado na etapa
  const quem = () => quemAssina({ user, nome, perfil, ip, posto: !!contaPosto, executor })
  const trava = !!salvando || semQuem
  const usou = () => posto?.renova?.()

  // monta os cards: um por (pedido × painel), com os índices dos itens que estão ali
  const porPainel = {}
  for (const pa of paineis) porPainel[pa.id] = []
  const vivos = idsDeOFsVivas(ordens)
  const ordemPorId = Object.fromEntries((ordens || []).map((o) => [o.id, o]))
  // cards de OF por painel: { painelId: { ordemId: [{ p, idx }] } }
  const ofPorPainel = {}
  const esperandoOF = new Set()   // itens de plástico fora do quadro, sem OF
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
        if (pa.tipo === 'linha') {
          const modo = modoNaLinha(p, i, itensCad, producaoCfg, vivos)
          if (modo === 'espera') { esperandoOF.add(`${p.idVenda}|${i}`); continue }
          if (modo === 'of') {
            const oid = ofDoItem(p, i, vivos)
            ;((ofPorPainel[pa.id] ??= {})[oid] ??= []).push({ p, idx: i })
            continue
          }
        }
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
    const movs = (movimentos || []).filter((m) => m.para)

    // O que é assunto de VOLUME: só quando a ORIGEM ou o DESTINO é etapa de
    // volume (expedição em diante). Item embalado com saldo ainda na LINHA
    // continua andando por quantidade até a montagem — com produção parcial
    // isso é rotina (227 fecharam em volume e saíram, 273 seguem na gráfica).
    // ⚠️ Antes bastava o item TER volume: "Concluir → Montagem" de um item
    // meio embalado caía no caminho do desembalar e a tela recusava com
    // "não dá para voltar", travando um avanço perfeitamente normal (#5458).
    const ehVolume = (m) => temVolumes(p, m.idx)
      && (ETAPAS_VOLUME.includes(m.de) || ETAPAS_VOLUME.includes(m.para))
    const volMovs = movs.filter(ehVolume)
    const qtdMovs = movs.filter((m) => !ehVolume(m) && m.qtd > 0)

    // voltar da expedição para a montagem desfaz a embalagem — só dá enquanto
    // nada saiu (com volume já expedido não há resposta certa para "quanto volta")
    if (volMovs.some((m) => m.para === 'montagem' && !podeDesembalar(p, m.idx))) {
      alert('Não dá para voltar: já há volume expedido ou entregue neste item.\n' +
        'Cancele a entrega ou traga o volume de volta para a expedição antes.')
      return
    }

    const porVolume = volMovs
      .map((m) => ({
        idx: m.idx, para: m.para,
        ids: m.para === 'montagem' ? [] : volumesNaEtapa(p, m.idx, m.de),
      }))
      .filter((m) => m.para === 'montagem' || m.ids.length)

    if (!porVolume.length && !qtdMovs.length) return
    if (salvando || semQuem) return
    setSalvando(marca)
    try {
      // etapa + auditoria no MESMO batch: ou as duas coisas acontecem, ou nenhuma.
      // Assim nunca existe item movido sem registro de quem moveu.
      const batch = writeBatch(db)
      // Card MISTO (um item por volume, outro por quantidade) é normal. Cada
      // construtor CONGELA o que não é dele, então rodar o de quantidade sobre
      // o resultado do de volume preserva as duas metades — e sai num write só.
      let etapas = p.etapas
      if (porVolume.length) etapas = mapaEtapasMovendoVolumes(p, porVolume, assina)
      if (qtdMovs.length) etapas = mapaEtapasComQtd({ ...p, etapas }, qtdMovs, assina)
      batch.update(doc(db, 'pedidos', p.idVenda), { etapas })

      const q = quem()
      const material = (i) => materialDoItem(p.itens[i], itensCad)
      const regs = []
      if (porVolume.length) {
        const rs = registrosAuditoria(p, porVolume.map((m) => m.idx),
          (i) => porVolume.find((m) => m.idx === i)?.para, q, material)
        rs.forEach((r, n) => {
          const m = porVolume[n]
          const vols = m.para === 'montagem'
            ? volumesDoItem(p, m.idx)                       // desembalar desfaz todos
            : volumesDoItem(p, m.idx).filter((v) => m.ids.includes(v.id))
          r.qtd = arredondaQtd(vols.reduce((sm, v) => sm + v.qtd, 0))
          r.qtdItem = arredondaQtd(p.itens[m.idx]?.qtd)
          r.volumes = vols.length
          if (m.para === 'montagem') r.desembalou = true
        })
        regs.push(...rs)
      }
      if (qtdMovs.length) regs.push(...regsDeQtd(p, qtdMovs, q))
      for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
      usou()
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
    if (salvando || semQuem) return
    const marca = `fechar|${p.idVenda}|${idx}`
    setSalvando(marca)
    try {
      const entrada = fechaMontagemEmVolumes(p, idx, volumes, consumido, assina)
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
      // O relógio é carimbado AQUI porque é aqui que o mapa existe:
      // `fechaMontagemEmVolumes` devolve só a ENTRADA do item, e carimbar uma
      // entrada é no-op — foi assim que o tempo da montagem deixou de ser
      // contado neste caminho, sem erro nenhum aparecer.
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', p.idVenda), { etapas: carimbaTempos(p, etapas) })
      const q = quem()
      const regs = registrosAuditoria(p, [idx], 'expedicao', q,
        (i) => materialDoItem(p.itens[i], itensCad))
      regs.forEach((r) => {
        r.de = 'montagem'
        r.qtd = arredondaQtd(volumes.reduce((sm, v) => sm + (Number(v.qtd) || 0), 0))
        r.qtdItem = arredondaQtd(p.itens[idx]?.qtd)
        r.volumes = volumes.length
      })
      for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
      await batch.commit()
      usou()
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
    if (salvando || semQuem) return
    setSalvando(marca)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', p.idVenda), {
        etapas: mapaEtapasMovendoVolumes(p, movs, assina),
      })
      const q = quem()
      const idxs = movs.map((m) => m.idx)
      const regs = registrosAuditoria(p, idxs, (i) => movs.find((m) => m.idx === i)?.para, q,
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
      usou()
    } catch (e) {
      console.error('Erro ao mover volumes:', e)
      alert('Erro ao mover: ' + e.message)
    } finally {
      setSalvando('')
    }
  }

  // Auditoria de movimento por QUANTIDADE: registra QUANTO andou e DE ONDE. O
  // `de` não pode sair de etapaDoItem: com o item dividido, ela devolve a etapa
  // mais atrasada, que não é necessariamente a coluna de onde a pessoa moveu.
  function regsDeQtd(p, qtdMovs, q) {
    const rs = registrosAuditoria(p, qtdMovs.map((m) => m.idx),
      (i) => qtdMovs.find((m) => m.idx === i)?.para, q, (i) => materialDoItem(p.itens[i], itensCad))
    rs.forEach((r, n) => {
      r.qtd = qtdMovs[n]?.qtd ?? r.qtd
      r.qtdItem = arredondaQtd(p.itens[qtdMovs[n]?.idx]?.qtd)
      r.de = qtdMovs[n]?.de ?? r.de
    })
    return rs
  }

  // Baixa de uma OF: vários pedidos de uma vez. Cada pedido anda com o seu log
  // no mesmo batch; OF muito grande quebra em lotes (limite de 500 escritas),
  // sempre inteiro por pedido — nunca um pedido movido sem o registro dele.
  async function moverOF(o, movs, marca) {
    if (salvando || semQuem) return
    const porPedido = {}
    for (const m of movs) if (m.qtd > 0) (porPedido[m.p.idVenda] ??= { p: m.p, movs: [] }).movs.push(m)
    const lista = Object.values(porPedido)
    if (!lista.length) return
    setSalvando(marca)
    try {
      const q = quem()
      let batch = writeBatch(db)
      let n = 0
      for (const { p, movs: ms } of lista) {
        const qtdMovs = ms.map((m) => ({ idx: m.idx, de: m.de, para: m.para, qtd: m.qtd }))
        const regs = regsDeQtd(p, qtdMovs, q).map((r) => ({ ...r, ordemId: o.id, ordemNumero: o.numero || 0 }))
        if (n + 1 + regs.length > 450) { await batch.commit(); batch = writeBatch(db); n = 0 }
        batch.update(doc(db, 'pedidos', p.idVenda), { etapas: mapaEtapasComQtd(p, qtdMovs, assina) })
        for (const r of regs) batch.set(doc(collection(db, 'auditoria')), r)
        n += 1 + regs.length
      }
      await batch.commit()
      usou()
    } catch (e) {
      console.error('Erro ao dar baixa na OF:', e)
      alert('Erro ao dar baixa na OF: ' + (e.code || e.message))
    } finally {
      setSalvando('')
    }
  }

  // Registra um erro visto por quem está produzindo. Não move nada e não trava
  // o item — só acende o ⚠ até alguém resolver.
  async function reportarErro(p, idx, dados) {
    if (salvando || semQuem) return
    setSalvando('reportar')
    try {
      const q = quem()
      await setDoc(doc(collection(db, 'problemas')), docProblema({ p, idx, ...dados, quem: q }))
      usou()
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
      {esperandoOF.size > 0 && (
        <div className="aviso-acab no-print">
          ⏳ {esperandoOF.size} sacola(s) plástica(s) aguardando <b>Ordem de Fabricação</b> — só entram
          na fila depois que o gestor soltar a OF.
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
              {pa.nome} <span className="qc-count">{porPainel[pa.id].length + Object.keys(ofPorPainel[pa.id] || {}).length}</span>
            </div>
            <div className="qc-body">
              {porPainel[pa.id].length === 0 && !Object.keys(ofPorPainel[pa.id] || {}).length
                && <div className="qc-vazio">— nada aqui —</div>}
              {Object.entries(ofPorPainel[pa.id] || {})
                .map(([oid, its]) => ({
                  o: ordemPorId[oid],
                  linhas: its.map(({ p, idx }) => ({
                    p, idx, idVenda: p.idVenda, previsao: p.previsao || '',
                    aqui: qtdNoPainel(pa, p, idx, materialDoItem(p.itens[idx], itensCad)),
                  })).filter((x) => x.aqui > 0),
                }))
                .filter((x) => x.o && x.linhas.length)
                .sort((a, b) => (a.linhas.map((x) => x.previsao || '9999').sort()[0])
                  .localeCompare(b.linhas.map((x) => x.previsao || '9999').sort()[0]))
                .map(({ o, linhas }) => (
                  <CardOFQuadro key={o.id} o={o} pa={pa} linhas={linhas} clientes={clientes} itensCad={itensCad}
                    podeMover={podeMoverEtapa(pa.etapa)} trava={trava} salvando={salvando}
                    qtdDe={(pk) => qtds[`of|${o.id}|${pa.id}|${pk}`]}
                    onQtd={(pk, v) => poeQtd(`of|${o.id}|${pa.id}|${pk}`, v)}
                    onMover={(movs) => moverOF(o, movs, `of|${o.id}|${pa.id}`).then(() => limpaQtds(`of|${o.id}|${pa.id}`))}
                    onReportar={(p, idx) => setReportando({ p, idx })}
                    problemas={problemas} />
                ))}
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
                      {/* Há quanto tempo o mais antigo deste card espera NESTE setor.
                          Não é enfeite: em produção por encomenda quase todo o prazo
                          é fila, e a fila é invisível sem alguém dizer o número. */}
                      <Espera ms={Math.max(...idxs.map((i) => tempoNaEtapa(p, i, pa.etapa)))} />
                      {parcial && (
                        <span className="chip" title="Os outros itens deste pedido estão em outra etapa">
                          {idxs.length} de {(p.itens || []).length} itens
                        </span>
                      )}
                    </div>
                    {/* O vendedor avisou que este pedido JÁ FOI ENTREGUE e ele
                        continua aqui. É o aviso mais caro do quadro: sem ele a
                        fábrica refaz — e a expedição recarrega — o que já saiu.
                        Fica na cara do card, não escondido num tooltip. */}
                    {problemasDoPedido(problemas, p.idVenda)
                      .filter((x) => ehErroEntrega(x.campo))
                      .slice(0, 1)
                      .map((x, n) => (
                        <div key={n} className="qcard-entregue" title={x.obs || ''}>
                          📦 <b>Avisado como JÁ ENTREGUE</b>
                          {x.entregueEm ? ` em ${fmtData(`${x.entregueEm}T00:00:00`)}` : ''}
                          {x.entreguePor ? ` · ${x.entreguePor}` : ''}
                          <div>por {quemFez(x) || '—'} — confirme antes de produzir.</div>
                        </div>
                      ))}
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
                              <span><SeloLinha linha={lItem} />{it.produto}<SeloCor cores={coresDoItem(p, i)} /></span>
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
                                  disabled={trava}
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
                                        disabled={trava} onClick={() => mover(p, [{ idx: i, de: pa.etapa, para: antItem, qtd: aMover }], marca)}>←</button>
                                    )}
                                    {prox && pa.tipo === 'montagem' && (
                                      // embalar é por item: abre o fechamento em volumes
                                      <button className="mini-btn" title="Fechar este item em volumes"
                                        disabled={trava} onClick={() => setFechando({ p, idx: i })}>📦</button>
                                    )}
                                    {prox && pa.tipo !== 'montagem' && (
                                      <button className="mini-btn" title={`Avançar ${fmtQtd(aMover)} para ${nomeEtapaItem(prox)}`}
                                        disabled={trava} onClick={() => mover(p, [{ idx: i, de: pa.etapa, para: prox, qtd: aMover }], marca)}>→</button>
                                    )}
                                  </span>
                                )}
                              </span>
                            </span>
                            {lItem === 'GRAFICA' && (
                              <span className="acab-tag">🏷 {fmtAcabamento(acabamentoDoItem(p, i))}</span>
                            )}
                            {pa.tipo === 'linha' && producaoCfg?.ofExigida && itemPedeCor(it, itensCad)
                              && jaEstavaNaFila(p, i) && (
                              <span className="acab-tag" title="Já estava na fila quando a exigência de OF foi ligada">
                                sem OF · já estava na fila
                              </span>
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
                                        disabled={trava}
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
                            disabled={trava}
                            onClick={() => mover(p, movsPara(anteriorDe), marca)}
                          >←</button>
                        )}
                        {prox && prox !== 'expedido' && pa.tipo === 'montagem' && (
                          <span className="qc-dica">
                            📦 feche item a item — cada produto vai nos seus volumes
                          </span>
                        )}
                        {prox && prox !== 'expedido' && pa.tipo !== 'montagem' && (
                          <button className="btn ok qc-avancar" disabled={trava}
                            onClick={() => mover(p, movsPara(prox), marca)}>
                            {salvando === marca
                              ? 'Salvando…'
                              : `${parcialDigitada ? 'Concluir parte' : 'Concluir'} → ${nmProx}`}
                          </button>
                        )}
                        {prox === 'expedido' && (
                          <button className="btn ok qc-avancar" disabled={trava}
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

// Card de uma ORDEM DE FABRICAÇÃO na coluna da linha: os pedidos juntos, como a
// máquina trabalha — UM BLOCO POR PRODUTO (tamanho/modelo), porque é o produto
// que muda o ajuste da máquina. A baixa é POR PRODUTO (decisão do dono em
// 17/09/2026): cada bloco tem o seu campo e o seu "Concluir"; a parcial
// completa primeiro o pedido mais urgente daquele produto (distribuiBaixaOF).
// Com mais de um produto há também o "Concluir OF inteira". Depois da linha
// cada item volta a andar pelo SEU pedido.
export function CardOFQuadro({ o, pa, linhas, clientes, itensCad, podeMover, trava, salvando,
  qtdDe, onQtd, onMover, onReportar, problemas }) {
  const prox = proximaEtapaItem(pa.etapa)
  const marca = `of|${o.id}|${pa.id}`
  const un = o.unidade || unidadeDoMaterial(materialDoItem(linhas[0]?.p.itens[linhas[0]?.idx], itensCad))
  const mov = (x, q) => ({ p: x.p, idx: x.idx, de: pa.etapa, para: prox, qtd: q })
  const mont = prox === 'montagem' ? MONTAGENS.find((m) => m.id === montagemDoMaterial('plastico')) : null
  const nmProx = mont?.nome || nomeEtapaItem(prox)
  const liberado = (x) => (o.itens || []).find((y) => y.idVenda === x.idVenda && y.itemKey === keyDoItem(x.p, x.idx))?.qtd

  // agrupa o que está NA COLUNA por produto (o nome do item, que é o do Posseidon)
  const porProd = {}
  for (const x of linhas) {
    const produto = x.p.itens[x.idx]?.produto || o.produto || ''
    const key = normaliza(produto)
    ;(porProd[key] ??= { key, produto, linhas: [] }).linhas.push(x)
  }
  const blocos = Object.values(porProd).sort((a, b) => ordemProdutoOF(a.produto, b.produto))
  for (const b of blocos) {
    b.linhas.sort((a, c) => (a.previsao || '9999').localeCompare(c.previsao || '9999'))
    b.total = arredondaQtd(b.linhas.reduce((s, x) => s + x.aqui, 0))
    const dig = qtdDe?.(b.key)
    b.digitou = dig !== '' && dig !== undefined
    b.aMover = b.digitou ? Math.min(arredondaQtd(dig), b.total) : b.total
    b.parcial = b.digitou && b.aMover < b.total
  }
  const total = arredondaQtd(blocos.reduce((s, b) => s + b.total, 0))
  const varios = blocos.length > 1
  const atrasado = linhas.some((x) => situacaoPrazo(x.previsao) === 'atrasado')
  const excedente = arredondaQtd(linhas.reduce((s, x) => s + Math.max(0, x.aqui - (Number(liberado(x)) || 0)), 0))
  const nPedidos = new Set(linhas.map((x) => x.p.idVenda)).size

  return (
    <div className={`qcard qcard-of ${atrasado ? 'atrasado' : ''}`}>
      <div className="qcard-top">
        <span className="cliente">
          <span className="of-nr">{fmtNumeroOF(o.numero)}</span>{' '}
          <SeloLinha linha={o.linha} />{fmtProdutosOF(o)}<SeloCor cores={o.cores} />
        </span>
        <span className="q qcard-of-total">{fmtQtd(total)} {un}</span>
      </div>
      <div className="qcard-meta">
        <span className="chip">{nPedidos} pedido(s)</span>
        <span className="chip" title="Cor da impressão">🎨 {fmtCores(o.cores) || '—'}</span>
        <Espera ms={Math.max(...linhas.map((x) => tempoNaEtapa(x.p, x.idx, pa.etapa)))} />
      </div>
      {excedente > 0 && (
        <div className="qcard-entregue">
          ⚠ Aumentou <b>{fmtQtd(excedente)} {un}</b> depois da OF — avise o gestor para cancelar e soltar de novo.
        </div>
      )}
      {blocos.map((b) => (
        <div key={b.key} className="qcard-of-prod">
          <div className="qcard-of-prod-top">
            <span>{b.produto}</span>
            <span className="q">{fmtQtd(b.total)} {un}</span>
          </div>
          <ul className="itens">
            {b.linhas.map((x) => {
              const it = x.p.itens[x.idx]
              const atr = situacaoPrazo(x.previsao) === 'atrasado'
              const temErro = problemaDoItem(problemas, x.p.idVenda, keyDoItem(x.p, x.idx)).length
              return (
                <li key={`${x.p.idVenda}|${x.idx}`}>
                  <span>
                    #{x.p.idVenda} {nomeCliente(x.p.cliente, clientes)}
                    <small className="q-de"> · {x.p.cidade || '—'} · </small>
                    <small className={atr ? 'of-atraso' : 'q-de'}>{fmtData(x.previsao)}</small>
                    {arredondaQtd(it?.qtd) > x.aqui && <small className="q-de"> · de {fmtQtd(it.qtd)}</small>}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="q">{fmtQtd(x.aqui)}</span>
                    <button className={`mini-btn${temErro ? ' alerta' : ''}`} disabled={trava}
                      title="Reportar erro neste pedido" onClick={() => onReportar(x.p, x.idx)}>⚠</button>
                    {podeMover && prox && (
                      <button className="mini-btn" disabled={trava}
                        title={`Concluir só o #${x.p.idVenda} (${fmtQtd(x.aqui)} ${un})`}
                        onClick={() => onMover([mov(x, x.aqui)])}>→</button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          {podeMover && prox && (
            <div className="qcard-acoes no-print">
              <input className="qtd-input" type="number" min="0" max={b.total}
                step={un === 'kg' ? '0.001' : '1'} placeholder={String(b.total)}
                value={qtdDe?.(b.key) ?? ''} onChange={(e) => onQtd(b.key, e.target.value)}
                title={`Quanto de ${b.produto} ficou pronto (de ${fmtQtd(b.total)} ${un}) — vai para os pedidos mais urgentes primeiro`} />
              <button className="btn ok qc-avancar" disabled={trava || !(b.aMover > 0)}
                onClick={() => onMover(distribuiBaixaOF(b.linhas, b.aMover).map((x) => mov(x, x.qtd)))}>
                {salvando === marca
                  ? 'Salvando…'
                  : `${b.parcial ? `Concluir ${fmtQtd(b.aMover)} ${un}` : varios ? 'Concluir produto' : 'Concluir OF'} → ${nmProx}`}
              </button>
            </div>
          )}
          {b.parcial && (
            <div className="qc-dica">vai primeiro para os pedidos com entrega mais próxima</div>
          )}
        </div>
      ))}
      {podeMover && prox && varios && (
        <div className="qcard-acoes qcard-of-tudo no-print">
          <button className="btn ok qc-avancar" disabled={trava || !(total > 0)}
            title={`Concluir os ${blocos.length} produtos desta OF de uma vez (${fmtQtd(total)} ${un})`}
            onClick={() => onMover(linhas.map((x) => mov(x, x.aqui)))}>
            {salvando === marca ? 'Salvando…' : `Concluir OF inteira (${blocos.length} produtos) → ${nmProx}`}
          </button>
        </div>
      )}
    </div>
  )
}
