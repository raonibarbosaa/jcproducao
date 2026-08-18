import { useState } from 'react'
import {
  ETAPAS_VENDEDOR, nomeEtapaVendedor, contaEtapasVendedor, ordemRota,
  nomeCliente, fmtData, fmtDataHora, fmtDuracao, fmtMoeda, situacaoPrazo, saiuParaEntrega,
  problemasDoPedido, nomeCampoErro, ehErroEntrega,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import SeloLinha from './SeloLinha.jsx'

// Acompanhamento do VENDEDOR, organizado por ROTA em vez de por coluna de setor.
// A pergunta dele não é "o que está na montagem", é "como está a rota do meu
// cliente" — então cada bloco é uma rota, com o pipeline inteiro resumido numa
// linha e os pedidos embaixo, cada item com a etapa onde está.
//
// Não move NADA na produção — a única escrita que sai daqui é o aviso de erro
// (`onReportar`), e mesmo ele só registra: quem dá a entrega continua sendo o
// escritório. A segurança não depende disso: o App consulta os pedidos com
// where('vendedor','==') e a regra do Firestore impõe o mesmo no servidor.
//
// Recebe os pedidos JÁ UNIFICADOS (pedidos vivos + remessas entregues) e já
// filtrados — ver unificaPedidosVendedor em utils.
export default function QuadroVendedor({ pedidos, clientes, problemas, onReportar }) {
  const { vendedores: cadastros } = useCadastros()
  // ONDE ESTÁ: o vendedor pergunta "o que ainda está no silk?" e antes precisava
  // varrer a tela lendo a etapa item a item. Aqui ele escolhe a etapa e a tela
  // mostra só o que está nela — sem trocar de aba nem perder a organização por
  // rota, que é como ele pensa.
  const [etapa, setEtapa] = useState('')
  const alterna = (id) => setEtapa((x) => (x === id ? '' : id))
  // ⚠️ Os contadores saem SEMPRE do total, nunca da lista já filtrada: tirados
  // do que está na tela, escolher "Silk" zeraria as outras etapas e não daria
  // mais para trocar direto para elas.
  const geral = contaEtapasVendedor(pedidos)
  const totalGeral = Object.values(geral).reduce((s, n) => s + n, 0)
  // filtro de ITEM: o pedido fica se tiver algum item na etapa, e dentro do card
  // só esses itens aparecem (mesma regra do filtro de material da Produção)
  const soDaEtapa = (lista) => (!etapa ? lista : lista
    .map((p) => ({ ...p, itens: (p.itens || []).filter((it) => it.etapaVend === etapa) }))
    .filter((p) => p.itens.length > 0))

  // Agrupa ROTA → Data de entrega. A rota vem primeiro porque é assim que o
  // vendedor pensa ("como está minha ROTA 01") — com a data no topo, a mesma rota
  // se espalhava por vários blocos. Dentro dela, cada DATA é uma viagem daquela
  // rota, e é por viagem que o pipeline faz sentido. O nível "vendedor" não
  // existe aqui: todos os pedidos são do mesmo. Rotas na ordem do cadastro.
  const mapa = {}
  for (const p of pedidos || []) {
    const r = p.rota || 'SEM ROTA'
    const rota = (mapa[r] ??= { rota: r, vendedor: p.vendedor || '', datas: {}, pedidos: [] })
    rota.pedidos.push(p)
    const d = p.previsao || ''
    ;(rota.datas[d] ??= { previsao: d, pedidos: [] }).pedidos.push(p)
  }
  const grupos = Object.values(mapa)
    .map((r) => ({
      ...r,
      ciclos: Object.values(r.datas).sort((a, b) =>
        (a.previsao || '9999').localeCompare(b.previsao || '9999')),
    }))
    .sort((a, b) =>
      (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
      || a.rota.localeCompare(b.rota))

  if (!grupos.length) {
    return <div className="empty"><div className="big">📦</div>Nenhum pedido para acompanhar com esses filtros.</div>
  }

  // com o filtro ligado, rota que não tem nada naquela etapa sai da tela
  const visiveis = grupos
    .map((g) => ({
      ...g,
      ciclos: g.ciclos.map((c) => ({ ...c, mostra: soDaEtapa(c.pedidos) }))
        .filter((c) => c.mostra.length > 0),
    }))
    .filter((g) => g.ciclos.length > 0)

  const barra = (
    <div className="qv-filtro">
      <span className="qv-filtro-lbl">Onde está:</span>
      <button className={`chip${etapa ? '' : ' sit-on'}`} onClick={() => setEtapa('')}>
        Tudo <b>{totalGeral}</b>
      </button>
      {ETAPAS_VENDEDOR.filter((e) => geral[e.id]).map((e) => (
        <button key={e.id} className={`chip${etapa === e.id ? ' sit-on' : ''}`}
          onClick={() => alterna(e.id)}
          title={`Ver só os itens em ${e.nome}`}>
          {e.nome} <b>{geral[e.id]}</b>
        </button>
      ))}
    </div>
  )

  return (
    <div className="qv">
      {barra}
      {visiveis.length === 0 && (
        <div className="empty"><div className="big">🔎</div>
          Nenhum item em <b>{nomeEtapaVendedor(etapa)}</b> nos pedidos filtrados.
          <div><button className="btn" style={{ marginTop: 10 }}
            onClick={() => setEtapa('')}>Ver todas as etapas</button></div>
        </div>
      )}
      {visiveis.map((g) => {
        const contRota = contaEtapasVendedor(g.pedidos)
        const totalRota = Object.values(contRota).reduce((s, n) => s + n, 0)
        const entreguesRota = contRota.entregue || 0
        return (
          <div key={g.rota} className="qv-rota">
            <div className="qv-rota-top">
              <span className="qv-rota-nome">📍 {g.rota}</span>
              <span className="qv-rota-qtd">{totalRota} {totalRota === 1 ? 'item' : 'itens'}</span>
              {entreguesRota === totalRota
                ? <span className="qv-tudo">✓ rota entregue</span>
                : <span className="qv-parcial">{entreguesRota} de {totalRota} entregues</span>}
            </div>

            {/* cada DATA é uma viagem desta rota — é por viagem que o pipeline conta */}
            {g.ciclos.map((c) => {
              const cont = contaEtapasVendedor(c.pedidos)
              const total = Object.values(cont).reduce((s, n) => s + n, 0)
              const atrasada = situacaoPrazo(c.previsao) === 'atrasado' && (cont.entregue || 0) < total
              return (
                <div key={c.previsao || 'sem-data'} className="qv-ciclo">
                  <div className={`qv-data${atrasada ? ' atrasado' : ''}`}>
                    📅 {c.previsao ? fmtData(c.previsao) : 'sem data de entrega'}
                  </div>
                  {/* o pipeline conta a viagem INTEIRA mesmo com filtro ligado —
                      é o mapa de onde as coisas estão, e também o atalho: clicar
                      escolhe a etapa */}
                  <div className="qv-pipe">
                    {ETAPAS_VENDEDOR.filter((e) => cont[e.id]).map((e) => (
                      <button key={e.id} onClick={() => alterna(e.id)}
                        title={`Ver só os itens em ${e.nome}`}
                        className={`qv-etapa${e.id === 'entregue' ? ' ok' : ''}${etapa === e.id ? ' sel' : ''}`}>
                        {e.nome} <b>{cont[e.id]}</b>
                      </button>
                    ))}
                  </div>
                  <div className="qv-cards">
                    {c.mostra
                      .slice()
                      .sort((a, b) => nomeCliente(a.cliente, clientes).localeCompare(nomeCliente(b.cliente, clientes)))
                      .map((p) => (
                        <CardPedido key={p.idVenda} p={p} clientes={clientes}
                          problemas={problemasDoPedido(problemas, p.idVenda)}
                          onReportar={onReportar} />
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function CardPedido({ p, clientes, problemas, onReportar }) {
  const entregues = (p.itens || []).filter((it) => it.entregue)
  const parcial = entregues.length > 0 && entregues.length < (p.itens || []).length
  // só faz sentido avisar "já foi entregue" enquanto o sistema acha que não foi;
  // com tudo entregue o botão cobraria uma baixa que já existe
  const naProducao = (p.itens || []).some((it) => !it.entregue)
  const jaAvisou = (problemas || []).some((x) => ehErroEntrega(x.campo))
  // uma remessa entregue guarda a baixa financeira; mostra a da última
  const ultima = entregues[entregues.length - 1]
  return (
    <div className="qv-card">
      <div className="qv-card-top">
        <span className="cliente">{nomeCliente(p.cliente, clientes)}</span>
        <span className="idv">#{p.idVenda}</span>
      </div>
      <div className="qv-card-meta">
        <span className="chip">📍 {p.cidade || '—'}</span>
        {parcial && <span className="chip rota-warn">entrega parcial</span>}
        {saiuParaEntrega(p) && (
          <span className="chip" title={p.saidaMotorista ? `com ${p.saidaMotorista}` : ''}>
            🚚 saiu {fmtDataHora(p.saidaEm)}
          </span>
        )}
        {ultima && (ultima.pago
          ? <span className="chip" style={{ color: 'var(--ok)' }}>💰 pago</span>
          : <span className="chip rota-warn">⏳ pendente de baixa</span>)}
        <span className="valor" style={{ marginLeft: 'auto' }}>{fmtMoeda(p.valorTotal)}</span>
      </div>
      <ul className="qv-itens">
        {(p.itens || []).map((it, i) => (
          <li key={i}>
            <span className="qv-item-nome"><SeloLinha linha={it.linha} />{it.produto}</span>
            <span className="q">{it.qtd}</span>
            <span className={`qv-item-etapa${it.entregue ? ' ok' : ''}`}>
              {it.entregue ? `✓ ${fmtData(it.entregueEm)}` : nomeEtapaVendedor(it.etapaVend)}
            </span>
            {/* desde quando está aqui. O `~` marca o carimbo aproximado (item que
                já estava parado antes de o relógio existir) — hora cravada que
                não é cravada vira discussão. */}
            {!it.entregue && it.desde && (
              <span className="qv-item-desde"
                title={it.desdeExato
                  ? `Entrou nesta etapa em ${fmtDataHora(it.desde)}`
                  : `Sem carimbo de entrada: aproximado pela última movimentação do item (${fmtDataHora(it.desde)})`}>
                ⏱ desde {it.desdeExato ? '' : '~'}{fmtDataHora(it.desde)}
                <b> · {fmtDuracao(Date.now() - Date.parse(it.desde))}</b>
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* AVISO DE ERRO — o vendedor vê aqui um pedido "na montagem" que ele sabe
          que já está com o cliente. Sem isto ele só podia telefonar, e o pedido
          ficava semanas ocupando o quadro (é o buraco que a Conciliação existe
          para tapar depois). O que ele manda é um aviso: a baixa segue com o
          escritório. */}
      {(problemas?.length > 0 || (onReportar && naProducao)) && (
        <div className="qv-card-erro no-print">
          {(problemas || []).map((x, n) => (
            <div key={n} className="qv-erro-chip" title={x.obs || ''}>
              ⚠ {nomeCampoErro(x.campo)}
              {ehErroEntrega(x.campo) && x.entregueEm
                ? ` em ${fmtData(`${x.entregueEm}T00:00:00`)}`
                : ''}
              {' · '}<span>aguardando o escritório</span>
            </div>
          ))}
          {onReportar && naProducao && (
            <button className="mini-btn alerta" disabled={jaAvisou}
              title={jaAvisou
                ? 'Você já avisou que este pedido foi entregue — o escritório ainda não deu a baixa'
                : 'Reportar erro neste pedido: já foi entregue, quantidade errada, produto trocado…'}
              onClick={() => onReportar(p)}>
              {jaAvisou ? '⚠ já avisado' : '⚠ Já foi entregue'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
