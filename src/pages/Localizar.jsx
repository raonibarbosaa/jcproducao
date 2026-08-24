import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, updateDoc, deleteDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  buscaGlobal, localizacaoDoPedido, resumoLocalizacao, situacaoEntrega,
  comprometimentoDeCargas, ondeProcurar,
  STATUS_CARGA, rotuloCarga, rotuloPlano, nomeStatusPlano,
  nomeCliente, fmtData, fmtDataHora, fmtQtd, fmtDuracao, fmtMoeda, fmtPeso,
  pesoDaLista, situacaoPrazo, previsaoDe, doDoc, indexaProblemas, problemasDoPedido,
  nomeCampoErro, ehErroEntrega, saiuParaEntrega,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import Realce from '../components/Realce.jsx'

// A previsão é falada pelo NÚMERO ("a previsão 15"), e `rotuloPlano` devolve só
// a data/rota — sozinho ele não identifica de qual viagem se está falando.
const nomePlano = (pl) => `#${pl?.numero ?? '?'} · ${rotuloPlano(pl)}`

// LOCALIZAR — a busca de "onde está este pedido", para a expedição achar a
// mercadoria sem varrer o sistema.
//
// O pedido mora em QUATRO camadas e nenhuma tela mostrava as quatro juntas:
// `pedidos` (o que está na fábrica), `planos` (a previsão da viagem), `cargas`
// (a viagem em si) e `entregues` (as remessas que já saíram). Pedido totalmente
// entregue some de `pedidos` — quem procurava por ele não achava nada e ficava
// sem saber se tinha sido entregue ou se alguém apagou.
//
// A resposta é FÍSICA de propósito: não "etapa = montagem", e sim "Montagem
// Papel", "3 volumes prontos no galpão", "saiu na viagem #12 dia 20/08 com
// JUNINHO". Quem lê isso está de pé no galpão procurando uma caixa.
export default function Localizar({ pedidos, problemas }) {
  const { clientes, vendedores: cadastros, itens: itensCad } = useCadastros()
  const { perfil, nome } = useAuth()
  // Desfazer é do escritório: a expedição VÊ o motivo do bloqueio e sabe a quem
  // pedir, mas quem desfaz uma viagem já registrada é dono/designer — mesma
  // linha do "retornar carga", que sempre foi só do dono.
  const podeLiberar = perfil === 'dono' || perfil === 'designer'
  const veValor = perfil === 'dono' || perfil === 'financeiro'

  const [termo, setTermo] = useState('')
  const [entregues, setEntregues] = useState([])
  const [cargas, setCargas] = useState([])
  const [planos, setPlanos] = useState([])
  const [negado, setNegado] = useState({})     // coleção que as rules recusaram
  const [salvando, setSalvando] = useState('')
  const [abertos, setAbertos] = useState({})   // idVenda -> detalhe dos itens aberto

  // As três coleções que a tela precisa além de `pedidos` (que vem do App).
  // ⚠️ O erro de permissão é TRATADO, não engolido: sem isso a busca responderia
  // "não achei" para um pedido que existe, só porque a leitura foi recusada — e
  // ninguém descobriria o motivo fora do console.
  useEffect(() => {
    const assina = (nomeCol, set) => onSnapshot(collection(db, nomeCol),
      (snap) => { set(snap.docs.map(doDoc)); setNegado((x) => ({ ...x, [nomeCol]: false })) },
      (e) => { console.error(`Erro ao ler ${nomeCol}:`, e); setNegado((x) => ({ ...x, [nomeCol]: true })) })
    const us = [assina('entregues', setEntregues), assina('cargas', setCargas), assina('planos', setPlanos)]
    return () => us.forEach((u) => u())
  }, [])

  const base = (pedidos || []).map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
  const res = buscaGlobal(termo, { pedidos: base, entregues, clientes })
  const comp = comprometimentoDeCargas(cargas)
  const mapaProblemas = indexaProblemas(problemas)
  const semAcesso = Object.entries(negado).filter(([, v]) => v).map(([k]) => k)

  const alterna = (id) => setAbertos((a) => ({ ...a, [id]: !a[id] }))

  // ---------- ações de desbloqueio ----------

  // Tira o pedido de uma PREVISÃO aberta. A previsão só reserva; nada do que
  // aconteceu na fábrica muda.
  async function tirarDoPlano(pl, idVenda) {
    if (!podeLiberar || salvando) return
    if (!confirm(
      `Tirar o pedido #${idVenda} da previsão ${nomePlano(pl)}?\n\n` +
      `Ele volta a ficar disponível para entrar noutra viagem.`)) return
    setSalvando(`plano-${pl.id}-${idVenda}`)
    try {
      await updateDoc(doc(db, 'planos', pl.id), {
        pedidos: (pl.pedidos || []).filter((x) => String(x) !== String(idVenda)),
        // o "segurar item" é por pedido: saindo o pedido, some com ele. Senão a
        // lista de segurados só cresce e um item volta segurado sem motivo.
        itensFora: (pl.itensFora || [])
          .filter((k) => String(k).split('|')[0] !== String(idVenda)),
      })
    } catch (e) {
      alert('Não foi possível tirar da previsão: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // Solta o pedido de uma CARGA.
  //
  // Em montagem nada aconteceu ainda: o item sai da lista, como no "↩ tirar da
  // carga" da própria aba Entregas.
  //
  // Se a carga JÁ SAIU, é outra história — a viagem levou o pedido de verdade, e
  // ele voltou no caminhão sem ser entregue. Aí a carga NÃO é reescrita: fica
  // registrado o RETORNO (`retornados`). Apagar o item da viagem esconderia que
  // ela chegou a levá-lo, e o romaneio impresso já diz o contrário. É o retorno
  // que solta o volume (ver `comprometimentoDeCargas`).
  async function liberarDaCarga(c, idVenda) {
    if (!podeLiberar || salvando) return
    const saiu = c.status === STATUS_CARGA.SAIU
    if (!confirm(saiu
      ? `Registrar que o pedido #${idVenda} VOLTOU da viagem ${rotuloCarga(c)} sem ser entregue?\n\n` +
        `A viagem continua no histórico com ele (foi o que aconteceu), mas os volumes ` +
        `voltam a ficar disponíveis em Entregas e a marca de saída do pedido é apagada.`
      : `Tirar o pedido #${idVenda} da carga ${rotuloCarga(c)}, que está em montagem?\n\n` +
        `Ele volta a ficar disponível para carregar.`)) return
    setSalvando(`carga-${c.id}-${idVenda}`)
    try {
      if (saiu) {
        await updateDoc(doc(db, 'cargas', c.id), {
          retornados: [
            ...(c.retornados || []).filter((r) => String(r?.idVenda) !== String(idVenda)),
            { idVenda: String(idVenda), em: new Date().toISOString(), por: nome || '' },
          ],
        })
        await updateDoc(doc(db, 'pedidos', String(idVenda)), {
          saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
        })
      } else {
        const itens = (c.itens || []).filter((it) => String(it.idVenda) !== String(idVenda))
        if (!itens.length) {
          // carga em montagem sem item nenhum não tem razão de existir
          await deleteDoc(doc(db, 'cargas', c.id))
        } else {
          await updateDoc(doc(db, 'cargas', c.id), {
            itens, pedidos: [...new Set(itens.map((it) => it.idVenda))],
          })
        }
      }
    } catch (e) {
      alert('Não foi possível liberar: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // saída marcada na Rota (sem carga): desfaz só o carimbo
  async function cancelarSaida(p) {
    if (!podeLiberar || salvando) return
    if (!confirm(`Cancelar a saída do pedido #${p.idVenda}?`)) return
    setSalvando(`saida-${p.idVenda}`)
    try {
      await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
        saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
      })
    } catch (e) {
      alert('Não foi possível cancelar a saída: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Localizar
          <small>onde está o pedido, agora{!podeLiberar && ' · só leitura'}</small>
        </h1>
      </div>

      <div className="loc-busca">
        <input className="loc-input" autoFocus value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Número do pedido, cliente ou produto…" />
        {termo && <button className="btn" onClick={() => setTermo('')}>✕ limpar</button>}
      </div>
      <div className="loc-dica">
        Procura em <b>todo o sistema</b>: produção, expedição, previsões, viagens
        e entregas já feitas. O número casa por pedaço exato; o nome aceita
        parecido (“beachwear” acha “LUX BEACH WEAR”).
      </div>

      {semAcesso.length > 0 && (
        <div className="loc-aviso">
          ⚠ Sem permissão para ler: <b>{semAcesso.join(', ')}</b>. A busca continua,
          mas fica incompleta — avise o administrador.
        </div>
      )}

      {!termo && (
        <div className="empty"><div className="big">🔎</div>
          Digite o número do pedido, o nome do cliente ou o produto.
        </div>
      )}

      {termo && res.curto && (
        <div className="empty"><div className="big">⌨</div>Digite pelo menos 2 caracteres.</div>
      )}

      {termo && !res.curto && res.total === 0 && (
        <div className="empty"><div className="big">🤷</div>
          Nenhum pedido encontrado para <b>“{termo}”</b>.
          <div style={{ marginTop: 6, fontSize: 13 }}>
            A busca cobre os pedidos na produção e as entregas já registradas.
            Se o número existe no Posseidon e não aparece aqui, ele ainda não foi importado.
          </div>
        </div>
      )}

      {res.total > 0 && (
        <div className="loc-conta">
          {res.total} pedido(s) encontrado(s)
          {res.cortado > 0 && <> · <b>mostrando os {res.itens.length} primeiros</b></>}
        </div>
      )}

      {res.itens.map((r) => (
        <CardLocal key={r.idVenda} r={r} comp={comp} cargas={cargas} planos={planos}
          clientes={clientes} itensCad={itensCad} termo={res.termo}
          veValor={veValor} podeLiberar={podeLiberar} salvando={salvando}
          aberto={!!abertos[r.idVenda] || res.itens.length === 1}
          onAlterna={() => alterna(r.idVenda)}
          problemas={problemasDoPedido(mapaProblemas, r.idVenda)}
          onTirarPlano={tirarDoPlano} onLiberarCarga={liberarDaCarga} onCancelarSaida={cancelarSaida} />
      ))}
    </>
  )
}

// ---------- um pedido ----------
function CardLocal({ r, comp, cargas, planos, clientes, itensCad, termo, veValor,
                     podeLiberar, salvando, aberto, onAlterna, problemas,
                     onTirarPlano, onLiberarCarga, onCancelarSaida }) {
  const p = r.p
  const ref = p || r.remessas[r.remessas.length - 1] || {}
  const sit = situacaoEntrega(p, { cargas, planos, remessas: r.remessas, comp })
  const itensLoc = p ? localizacaoDoPedido(p, itensCad, undefined) : []
  const resumo = resumoLocalizacao(itensLoc)
  const peso = sit.livres.length ? pesoDaLista(sit.livres, itensCad) : null
  const prazo = p ? situacaoPrazo(p.previsao) : ''

  return (
    <div className={`card loc-card ${prazo === 'atrasado' ? 'atrasado' : 'em_dia'}`}>
      <div className="card-top">
        <div>
          <div className="cliente"><Realce texto={nomeCliente(ref.cliente, clientes)} termo={termo} /></div>
          <div className="idv">#<Realce texto={String(r.idVenda)} termo={termo} /></div>
        </div>
        {veValor && ref.valor != null && <div className="valor">{fmtMoeda(ref.valor)}</div>}
      </div>

      <div className="meta-row">
        {ref.cidade && <span className="chip">📍 {ref.cidade}</span>}
        {ref.rota && <span className="chip">{ref.rota}</span>}
        {ref.vendedor && <span className="chip">👤 {ref.vendedor}</span>}
        {p?.previsao && (
          <span className={`chip${prazo === 'atrasado' ? ' rota-warn' : ''}`}>
            entrega {fmtData(p.previsao)}
          </span>
        )}
      </div>

      {/* ---- a resposta, em uma linha ---- */}
      <Situacao p={p} sit={sit} resumo={resumo} peso={peso} />

      {/* ---- avisos que mudam o que a expedição faz ---- */}
      {problemas.filter((x) => x.status === 'aberto').map((x) => (
        <div key={x.id} className={`loc-alerta${ehErroEntrega(x.campo) ? ' forte' : ''}`}>
          {ehErroEntrega(x.campo) ? '🚨' : '⚠'} {nomeCampoErro(x.campo)}
          {x.porNome && <> · {x.porNome}</>}
          {x.quando && <> · {fmtDataHora(x.quando)}</>}
          {x.obs && <div className="loc-alerta-obs">{x.obs}</div>}
        </div>
      ))}

      {/* ---- onde procurar, posto a posto ---- */}
      {resumo.length > 0 && (
        <div className="loc-postos">
          {resumo.map((g) => (
            <div key={g.chave} className={`loc-posto et-${g.etapa}`}>
              <b>{g.onde}</b>
              <span>{g.itens} item(ns){g.volumes ? ` · ${g.volumes} volume(s)` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---- viagens e previsões ---- */}
      <Logistica p={p} sit={sit} podeLiberar={podeLiberar} salvando={salvando}
        onTirarPlano={onTirarPlano} onLiberarCarga={onLiberarCarga} onCancelarSaida={onCancelarSaida} />

      {/* ---- remessas já entregues ---- */}
      {r.remessas.map((e) => (
        <div key={e.id} className="loc-remessa">
          ✅ Entregue · remessa {e.remessa || 1}
          {e.entregueEm && <> · {fmtData(e.entregueEm)}</>}
          {e.motorista && <> · 🚚 {e.motorista}</>}
          {e.parcial && <span className="chip" style={{ marginLeft: 6 }}>entrega parcial</span>}
          <div className="loc-remessa-itens">
            {(e.itens || []).map((it, i) => (
              <span key={i}>{it.produto} <b>{fmtQtd(it.qtd)}</b></span>
            ))}
          </div>
        </div>
      ))}

      {/* ---- detalhe item a item ---- */}
      {itensLoc.length > 0 && (
        <>
          <button className="loc-toggle" onClick={onAlterna}>
            {aberto ? '▾' : '▸'} {itensLoc.length} produto(s) — onde está cada um
          </button>
          {aberto && (
            <ul className="loc-itens">
              {itensLoc.map((it) => (
                <li key={it.key}>
                  <div className="loc-item-nome">
                    <SeloLinha linha={it.linha} /> {it.produto}
                    <small> · pedido {fmtQtd(it.qtdItem)}</small>
                  </div>
                  <div className="loc-paradas">
                    {it.paradas.length === 0 && <span className="loc-parada">—</span>}
                    {it.paradas.map((pa) => (
                      <span key={pa.etapa} className={`loc-parada et-${pa.etapa}`}>
                        <b>{ondeProcurar(pa.etapa, it.material)}</b>
                        {' · '}{fmtQtd(pa.qtd)}
                        {pa.volumes.length > 0 && <> · {pa.volumes.length} vol</>}
                        {pa.parado != null && (
                          <> · há {fmtDuracao(pa.parado)}
                            {!pa.exato && <span title="carimbo aproximado — o item já estava parado antes de o relógio existir">~</span>}
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// A linha grande: a resposta que a pessoa veio buscar, sem precisar ler o resto.
function Situacao({ p, sit, resumo, peso }) {
  if (!p) {
    return (
      <div className="loc-situacao ok">
        ✅ ENTREGUE — saiu da produção
        <small>Este pedido existe só como remessa; ele não aparece mais em Entregas nem no quadro.</small>
      </div>
    )
  }
  if (sit.cargasVivas.length) {
    const c = sit.cargasVivas[0]
    const saiu = c.status === STATUS_CARGA.SAIU
    return (
      <div className={`loc-situacao ${saiu ? 'alerta' : 'aviso'}`}>
        🚚 {saiu ? 'SAIU NA VIAGEM' : 'CARREGANDO NA VIAGEM'} {rotuloCarga(c)}
        {c.motorista && <> · {c.motorista}</>}
        {saiu && c.saiuEm && <> · {fmtData(c.saiuEm)}</>}
        <small>
          {saiu
            ? 'Enquanto a viagem estiver assim, os volumes ficam presos a ela e o pedido NÃO aparece na lista de Entregas.'
            : 'Já está numa carga em montagem — por isso não aparece na lista de disponíveis.'}
        </small>
      </div>
    )
  }
  if (sit.planosAbertos.length) {
    const pl = sit.planosAbertos[0]
    return (
      <div className="loc-situacao aviso">
        📋 NA PREVISÃO {nomePlano(pl)}
        <small>Está reservado para esta viagem — em Entregas ele aparece DENTRO da previsão, não na lista de prontos.</small>
      </div>
    )
  }
  if (sit.volumesLivres > 0) {
    return (
      <div className="loc-situacao ok">
        📦 PRONTO NO GALPÃO — {sit.volumesLivres} volume(s)
        {peso && peso.kg > 0 && <> · {fmtPeso(peso)}</>}
        <small>
          Disponível em Entregas.
          {sit.emProducao && ' Parte do pedido continua na produção (entrega parcial).'}
        </small>
      </div>
    )
  }
  if (saiuParaEntrega(p)) {
    return (
      <div className="loc-situacao alerta">
        🚚 MARCADO COMO SAÍDO — {fmtDataHora(p.saidaEm)}
        {p.saidaMotorista && <> · {p.saidaMotorista}</>}
        <small>Saiu para entrega sem carga registrada. A entrega ainda não foi dada.</small>
      </div>
    )
  }
  return (
    <div className="loc-situacao">
      🏭 EM PRODUÇÃO
      <small>
        {resumo.length
          ? `Nada expedido ainda — está em ${resumo.map((g) => g.onde).join(', ')}.`
          : 'Sem itens com quantidade em nenhuma etapa.'}
      </small>
    </div>
  )
}

// Viagens e previsões em que o pedido está, com o caminho de volta.
function Logistica({ p, sit, podeLiberar, salvando, onTirarPlano, onLiberarCarga, onCancelarSaida }) {
  if (!p) return null
  const nada = !sit.cargasVivas.length && !sit.planosAbertos.length
    && !saiuParaEntrega(p) && !sit.cargasAntigas.length
  if (nada) return null
  return (
    <div className="loc-logistica">
      {sit.planosAbertos.map((pl) => (
        <div key={pl.id} className="loc-linha">
          <span>📋 Previsão {nomePlano(pl)} · {nomeStatusPlano(pl)}</span>
          {podeLiberar && (
            <button className="btn" disabled={!!salvando}
              onClick={() => onTirarPlano(pl, p.idVenda)}>
              ↩ Tirar da previsão
            </button>
          )}
        </div>
      ))}

      {sit.cargasVivas.map((c) => (
        <div key={c.id} className="loc-linha">
          <span>
            🚚 Viagem {rotuloCarga(c)} · {c.status === STATUS_CARGA.SAIU ? 'saiu' : 'em montagem'}
            {c.motorista && <> · {c.motorista}</>}
            {c.saiuEm && <> · {fmtDataHora(c.saiuEm)}</>}
          </span>
          {podeLiberar && (
            <button className="btn" disabled={!!salvando}
              onClick={() => onLiberarCarga(c, p.idVenda)}>
              {c.status === STATUS_CARGA.SAIU ? '↩ Voltou sem entregar' : '↩ Tirar da carga'}
            </button>
          )}
        </div>
      ))}

      {!sit.cargasVivas.length && saiuParaEntrega(p) && (
        <div className="loc-linha">
          <span>🚚 Saída marcada em {fmtDataHora(p.saidaEm)}{p.saidaMotorista && <> · {p.saidaMotorista}</>}</span>
          {podeLiberar && (
            <button className="btn" disabled={!!salvando}
              onClick={() => onCancelarSaida(p)}>↩ Cancelar saída</button>
          )}
        </div>
      )}

      {/* histórico: viagem que este pedido já fez e não prende mais nada.
          Fica à vista porque é ele que explica "esse pedido já foi no caminhão". */}
      {sit.cargasAntigas.map((c) => (
        <div key={c.id} className="loc-linha antiga">
          <span>
            🕘 Já esteve na viagem {rotuloCarga(c)} · {c.status}
            {(c.retornados || []).some((x) => String(x?.idVenda) === String(p.idVenda))
              && ' · voltou sem entregar'}
          </span>
        </div>
      ))}
    </div>
  )
}
