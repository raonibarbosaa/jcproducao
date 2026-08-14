import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  STATUS_CARGA, itensParaCarga, proximoNumeroCarga, cargaAberta, progressoConferencia,
  cargaConferida, agrupaCargaPorPedido, pedidosDaCarga, arredondaQtd, chaveCarga,
  CARGA_SEGURA_ITENS,
  nomeCliente, fmtData, fmtDataHora, fmtQtd, situacaoPrazo, ordemRota,
  materialDoItem, totaisPorMaterial, fmtTotais, filtraPedidos, previsaoDe,
  vendedoresDe, resumoFiltros,
  temVolumes, volumesNaEtapa, mapaEtapasMovendoVolumes, mapaEtapasComQtd, qtdNaEtapa,
  pesoDaLista, fmtPeso, temTrabalhoNaProducao,
  STATUS_PLANO, proximoNumeroPlano, planosAbertos, pedidosEmPlanos, situacaoNoPlano,
  rotasDoVendedor,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SeloLinha from '../components/SeloLinha.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

// CONTROLE DE ENTREGAS — a carga é a VIAGEM do caminhão.
// A tela de Rota mostra o que está pronto agora (uma foto do momento). Aqui o
// operador da expedição monta o que vai NESTE caminhão: escolhe pedido a pedido,
// podendo misturar rotas e deixar para trás o que não coube, confere item a item
// ao carregar e marca a saída. O romaneio passa a ser o papel dessa carga.
//
// A expedição monta, confere e marca a saída — mas NÃO dá a entrega: é ela que
// abre a cobrança, e segue com dono/designer/financeiro na tela de Rota.
export default function Carga({ pedidos }) {
  const { clientes, motoristas, itens: itensCad, vendedores: cadastros, logistica } = useCadastros()
  const { nome, perfil } = useAuth()
  const podeDesfazer = perfil === 'dono'   // desfazer uma viagem que já saiu
  const [cargas, setCargas] = useState([])
  const [motorista, setMotorista] = useState('')
  const [salvando, setSalvando] = useState('')
  const [planos, setPlanos] = useState([])
  const [planoId, setPlanoId] = useState('')    // plano sendo montado na tela
  const [aba, setAba] = useState('planos')      // 'planos' | 'montar' | 'historico'
  const [filtros, setFiltros] = useState({})           // dentro do plano
  const [filtrosLista, setFiltrosLista] = useState({}) // lista de previsões
  const motoristasAtivos = motoristas.filter((m) => m.ativo !== false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cargas'),
      (snap) => setCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler cargas:', e))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'planos'),
      (snap) => setPlanos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error('Erro ao ler planos:', e))
    return unsub
  }, [])

  const aberta = cargaAberta(cargas)

  // Quanto de cada item já está comprometido com alguma carga viva (montando ou
  // que já saiu). Sem isso o mesmo pedido entraria em duas cargas — e o caso não
  // é raro: expediram 40, foram numa carga, depois expediram os outros 60.
  // Volume já numa carga viva não pode entrar noutra. Para o legado sem volume,
  // a conta continua sendo por quantidade (expediram 40, depois mais 60).
  const volsUsados = new Set()
  const comprometido = new Map()
  for (const c of cargas) {
    if (!CARGA_SEGURA_ITENS(c.status)) continue
    for (const it of c.itens || []) {
      if (it.volumeId) { volsUsados.add(chaveCarga(it)); continue }
      const k = chaveCarga(it)
      comprometido.set(k, arredondaQtd((comprometido.get(k) || 0) + (Number(it.qtd) || 0)))
    }
  }

  // pedidos com quantidade expedida ainda LIVRE para entrar numa carga.
  // A lista NÃO é filtrada: é a base da seleção. Assim dá para filtrar a ROTA 01,
  // marcar, trocar para a ROTA 02 e marcar mais — sem perder o que já foi escolhido.
  const disponiveis = []
  for (const p of (pedidos || []).map((x) => ({ ...x, previsao: previsaoDe(x, cadastros) }))) {
    const livres = itensParaCarga(p)
      .filter((it) => !it.volumeId || !volsUsados.has(chaveCarga(it)))
      .map((it) => ({
        ...it,
        material: materialDoItem({ produto: it.produto }, itensCad),
        qtd: it.volumeId
          ? it.qtd
          : arredondaQtd(it.qtd - (comprometido.get(chaveCarga(it)) || 0)),
      }))
      .filter((it) => it.qtd > 0)
    if (livres.length) disponiveis.push({ p, itens: livres })
  }

  const capacidadeKg = Number(logistica?.capacidadeKg) > 0 ? Number(logistica.capacidadeKg) : 0
  const livresPorPedido = new Map(disponiveis.map((d) => [String(d.p.idVenda), d.itens]))
  const todos = (pedidos || []).map((x) => ({ ...x, previsao: previsaoDe(x, cadastros) }))

  // ---------- planos ----------
  const abertos = planosAbertos(planos)
  const plano = planos.find((x) => x.id === planoId) || null
  // um pedido só pode estar num plano aberto por vez: duas viagens contando com
  // a mesma mercadoria é o erro que some sozinho na hora de carregar
  const noutroPlano = pedidosEmPlanos(planos, planoId)
  const emAlgumPlano = pedidosEmPlanos(planos)

  // PRONTOS SEM PREVISÃO — o que está expedido e não entrou em plano nenhum.
  // Sem esta lista o estoque pronto fica INVISÍVEL: ao trocar a montagem direta
  // pelo plano, tudo que já estava pronto sumiu da tela de uma vez. É também o
  // ponto de partida natural — a previsão nasce do que já existe no galpão.
  const prontosLivres = disponiveis.filter((d) => !emAlgumPlano.has(String(d.p.idVenda)))
  const idsListaFiltrada = new Set(
    filtraPedidos(prontosLivres.map((d) => d.p), filtrosLista, clientes).map((p) => p.idVenda))
  const gruposProntos = Object.values(
    prontosLivres
      .filter((d) => idsListaFiltrada.has(d.p.idVenda))
      .reduce((acc, d) => {
        const vend = d.p.vendedor || '—'
        const rota = d.p.rota || 'SEM ROTA'
        const k = `${vend}|${rota}`
        ;(acc[k] ??= { chave: k, vendedor: vend, rota, pedidos: [], volumes: [] })
        acc[k].pedidos.push(d.p)
        acc[k].volumes.push(...d.itens)
        return acc
      }, {})
  ).map((g) => ({ ...g, peso: pesoDaLista(g.volumes, itensCad) }))
    .sort((a, b) => (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
      || a.rota.localeCompare(b.rota))
  const prontosSemPlano = gruposProntos.reduce((n, g) => n + g.pedidos.length, 0)
  // já existe previsão aberta para esta rota? então é melhor engordar aquela
  const planoDaRota = (v, r) => abertos.find((pl) => (pl.vendedor || '—') === v && (pl.rota || 'SEM ROTA') === r)

  // Rotas do seletor: com um vendedor escolhido, TODAS as cadastradas dele (mais
  // as que aparecem em pedido). Sem isso a rota só existia no filtro depois de
  // alguém expedir algo dela. Sem vendedor escolhido, a barra calcula sozinha.
  const rotasFiltro = filtrosLista.vendedor
    ? [...new Set([
        ...rotasDoVendedor(filtrosLista.vendedor, cadastros),
        ...todos.filter((p) => (p.vendedor || '—') === filtrosLista.vendedor)
          .map((p) => p.rota || 'SEM ROTA'),
      ])].filter(Boolean)
        .sort((a, b) => (ordemRota(filtrosLista.vendedor, a, cadastros)
          - ordemRota(filtrosLista.vendedor, b, cadastros)) || a.localeCompare(b))
    : undefined

  // Candidatos do plano: TODO pedido do vendedor+rota que ainda tem serviço na
  // fábrica OU já tem volume livre. É o ponto do planejamento — enxergar o que
  // está vindo, não só o que já está pronto.
  const candidatos = plano
    ? todos.filter((p) => (p.vendedor || '') === (plano.vendedor || '')
        && (p.rota || 'SEM ROTA') === (plano.rota || 'SEM ROTA')
        && (livresPorPedido.has(String(p.idVenda)) || temTrabalhoNaProducao(p)))
    : []
  const noPlano = new Set((plano?.pedidos || []).map(String))
  // o pedido é do bolo natural desta previsão (mesmo vendedor E mesma rota)?
  const daRotaDo = (p, pl) => !!pl
    && (p.vendedor || '') === (pl.vendedor || '')
    && (p.rota || 'SEM ROTA') === (pl.rota || 'SEM ROTA')
  const idsFiltrados = new Set(filtraPedidos(candidatos, filtros, clientes).map((p) => p.idVenda))
  // a busca em outras rotas roda sobre TODOS os pedidos, não sobre os candidatos
  const idsBusca = new Set(filtraPedidos(todos, filtros, clientes).map((p) => p.idVenda))

  // O que está NA previsão sai de `todos`, não dos candidatos: a rota é viva
  // (recalculada pelo cadastro de cidades), então um pedido cuja cidade mudou de
  // rota deixaria de casar com a do plano e sumiria da tela — continuando dentro
  // de `plano.pedidos`, invisível. Quem entrou na viagem fica visível até alguém
  // tirar.
  const dentro = plano ? todos.filter((p) => noPlano.has(String(p.idVenda))) : []
  const fora = candidatos
    .filter((p) => !noPlano.has(String(p.idVenda)) && idsFiltrados.has(p.idVenda))
    .sort((a, b) => (a.previsao || '').localeCompare(b.previsao || ''))

  // BUSCA EM OUTRAS ROTAS — a exceção que o caminhão faz: passa perto, então
  // pega. Fica FORA da lista normal de propósito: entrar aqui é decisão, não
  // rotina, e a fila natural da rota não pode ficar poluída com o sistema todo.
  //
  // A lista aparece SEMPRE, mesmo sem filtro. Antes ela exigia um filtro ativo, e
  // escolher "Todos vendedores" — que é a ausência de filtro — devolvia tela
  // vazia: o operador seleciona "todos" justamente para ver todos. O tamanho é
  // resolvido com CORTE VISÍVEL (o rodapé diz quantos ficaram de fora), não
  // escondendo tudo.
  const deOutrasRotas = plano
    ? todos
        .filter((p) => !noPlano.has(String(p.idVenda))
          && !daRotaDo(p, plano)
          && idsBusca.has(p.idVenda)
          && (livresPorPedido.has(String(p.idVenda)) || temTrabalhoNaProducao(p)))
        .sort((a, b) => (a.previsao || '').localeCompare(b.previsao || ''))
    : []

  // o que sai AGORA se liberar: só os volumes prontos dos pedidos do plano
  const volumesDoPlano = dentro.flatMap((p) => livresPorPedido.get(String(p.idVenda)) || [])
  const prontosDoPlano = dentro.filter((p) => livresPorPedido.has(String(p.idVenda)))
  const pesoPlano = pesoDaLista(volumesDoPlano, itensCad)
  const totaisPlano = totaisPorMaterial(
    volumesDoPlano.map((i) => ({ produto: i.produto, qtd: i.qtd })), itensCad)

  // resumo de um plano na LISTA (sem abrir): quantos já dá para levar
  const porIdTodos = new Map(todos.map((p) => [String(p.idVenda), p]))
  const resumoPlano = (pl) => {
    const ids = (pl.pedidos || []).map(String)
    const vols = ids.flatMap((id) => livresPorPedido.get(id) || [])
    return {
      total: ids.length,
      prontos: ids.filter((id) => livresPorPedido.has(id)).length,
      volumes: vols.length,
      peso: pesoDaLista(vols, itensCad),
      // a viagem deixou de ser só daquela rota — o card precisa dizer
      deFora: ids.filter((id) => {
        const p = porIdTodos.get(id)
        return p && !daRotaDo(p, pl)
      }).length,
    }
  }

  async function criarPlano({ vendedor, rota, saidaPrevista, pedidos: ids }) {
    setSalvando('plano')
    try {
      const ref = doc(collection(db, 'planos'))
      await setDoc(ref, {
        numero: proximoNumeroPlano(planos),
        status: STATUS_PLANO.ABERTO,
        vendedor, rota, saidaPrevista: saidaPrevista || '',
        pedidos: (ids || []).map(String), cargas: [],
        criadoEm: new Date().toISOString(), criadoPor: nome || '',
      })
      setPlanoId(ref.id)
    } catch (e) {
      alert('Não foi possível criar o plano: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // põe/tira um pedido da previsão — é o "acrescentar ou retirar" da viagem
  async function alternaNoPlano(p) {
    if (!plano || salvando) return
    const dentroAgora = noPlano.has(String(p.idVenda))
    const outro = noutroPlano.get(String(p.idVenda))
    if (!dentroAgora && outro) {
      alert(`O pedido #${p.idVenda} já está no plano #${outro.numero}. Tire de lá primeiro.`)
      return
    }
    // trazer pedido de fora é EXCEÇÃO: a viagem deixa de ser só daquela rota, e
    // ninguém pode descobrir isso na hora de carregar
    if (!dentroAgora && !daRotaDo(p, plano)) {
      const outroVend = (p.vendedor || '') !== (plano.vendedor || '')
      const ok = confirm(outroVend
        ? `⚠ O pedido #${p.idVenda} é de OUTRO VENDEDOR.\n\n`
          + `Ele é de ${p.vendedor || '—'} · ${p.rota || 'SEM ROTA'} (${p.cidade || 'sem cidade'})\n`
          + `e vai entrar na viagem de ${plano.vendedor || '—'} · ${plano.rota}.\n\nConfirmar?`
        : `O pedido #${p.idVenda} é da ${p.rota || 'SEM ROTA'} (${p.cidade || 'sem cidade'}), `
          + `não da ${plano.rota}.\n\nO caminhão vai precisar passar lá. Confirmar?`)
      if (!ok) return
    }
    const ids = (plano.pedidos || []).map(String)
    await updateDoc(doc(db, 'planos', plano.id), {
      pedidos: dentroAgora ? ids.filter((x) => x !== String(p.idVenda)) : [...ids, String(p.idVenda)],
    })
  }

  async function alternaTodos(ligar) {
    if (!plano || salvando) return
    const ids = new Set((plano.pedidos || []).map(String))
    for (const p of (ligar ? fora : dentro)) {
      if (ligar && noutroPlano.has(String(p.idVenda))) continue
      ligar ? ids.add(String(p.idVenda)) : ids.delete(String(p.idVenda))
    }
    await updateDoc(doc(db, 'planos', plano.id), { pedidos: [...ids] })
  }

  // joga um grupo de prontos dentro de uma previsão que já existe
  async function juntarNoPlano(pl, g) {
    const ids = new Set((pl.pedidos || []).map(String))
    for (const p of g.pedidos) ids.add(String(p.idVenda))
    await updateDoc(doc(db, 'planos', pl.id), { pedidos: [...ids] })
    setPlanoId(pl.id)
  }

  async function encerrarPlano() {
    if (!plano) return
    if (!confirm(`Encerrar o plano #${plano.numero} (${plano.rota})?\n\n` +
      `Ele sai da lista de planos abertos. Os pedidos que sobraram voltam a ficar livres.`)) return
    await updateDoc(doc(db, 'planos', plano.id), {
      status: STATUS_PLANO.ENCERRADO, encerradoEm: new Date().toISOString(), encerradoPor: nome || '',
    })
    setPlanoId('')
  }

  async function apagarPlano(pl) {
    if (!confirm(`Apagar o plano #${pl.numero}? Nada acontece com os pedidos.`)) return
    await deleteDoc(doc(db, 'planos', pl.id))
    if (planoId === pl.id) setPlanoId('')
  }

  // Devolve o pedido de "expedido" para a EXPEDIÇÃO: ele volta a aparecer na
  // coluna do quadro, de onde o ← desembala para a montagem.
  // Faltava esse caminho: assim que o item é expedido ele some do quadro, e não
  // havia mais nenhum botão capaz de trazê-lo de volta.
  async function devolverParaExpedicao(d) {
    const p = d.p
    if (salvando) return
    if (!confirm(
      `Devolver o pedido #${p.idVenda} para a Expedição?\n\n` +
      `Ele volta a aparecer no quadro, na coluna Expedição. De lá o ← devolve para a montagem.`)) return
    setSalvando(`devolver|${p.idVenda}`)
    try {
      const porVolume = []
      const porQtd = []
      ;(p.itens || []).forEach((_, i) => {
        if (temVolumes(p, i)) {
          const ids = volumesNaEtapa(p, i, 'expedido')
          if (ids.length) porVolume.push({ idx: i, ids, para: 'expedicao' })
        } else {
          const q = qtdNaEtapa(p, i, 'expedido')
          if (q > 0) porQtd.push({ idx: i, de: 'expedido', para: 'expedicao', qtd: q })
        }
      })
      if (!porVolume.length && !porQtd.length) return
      const etapas = porVolume.length
        ? mapaEtapasMovendoVolumes(p, porVolume, nome)
        : mapaEtapasComQtd(p, porQtd, nome)
      await updateDoc(doc(db, 'pedidos', p.idVenda), { etapas })
    } catch (e) {
      alert('Não foi possível devolver: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // LIBERAR PARA ENTREGA: o plano solta o que está PRONTO e continua aberto com o
  // resto. Uma rota rende várias viagens — encerrar aqui obrigaria a refazer o
  // planejamento a cada carga, e o que ficou para trás sumiria de vista.
  async function liberarPlano() {
    if (!plano || !prontosDoPlano.length || salvando) return
    if (motoristasAtivos.length > 0 && !motorista) {
      alert('Escolha o motorista da carga.')
      return
    }
    const ficam = dentro.length - prontosDoPlano.length
    if (!confirm(
      `Liberar ${prontosDoPlano.length} pedido(s) · ${volumesDoPlano.length} volume(s) para entrega?\n\n` +
      (ficam ? `${ficam} pedido(s) continuam no plano, esperando ficar prontos.` : 'O plano fica sem pendências.'))) return
    setSalvando('liberar')
    try {
      const ref = doc(collection(db, 'cargas'))
      await setDoc(ref, {
        numero: proximoNumeroCarga(cargas),
        status: STATUS_CARGA.MONTANDO,
        motorista: motorista || '',
        itens: volumesDoPlano,
        pedidos: prontosDoPlano.map((p) => p.idVenda),
        rotas: [...new Set(prontosDoPlano.map((p) => p.rota || 'SEM ROTA'))],
        planoId: plano.id, planoNumero: plano.numero || 0,
        criadaEm: new Date().toISOString(),
        criadaPor: nome || '',
      })
      // os liberados saem da previsão: o que eles tinham de pronto virou carga
      const restam = (plano.pedidos || []).map(String)
        .filter((id) => !prontosDoPlano.some((p) => String(p.idVenda) === id))
      await updateDoc(doc(db, 'planos', plano.id), {
        pedidos: restam,
        cargas: [...(plano.cargas || []), ref.id],
        liberadoEm: new Date().toISOString(), liberadoPor: nome || '',
      })
      setMotorista(''); setAba('montar')
    } catch (e) {
      alert('Não foi possível liberar: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // conferência: marca o item como carregado
  async function conferir(carga, n, valor) {
    const itens = (carga.itens || []).map((it, i) => (i === n ? { ...it, conferido: valor } : it))
    await updateDoc(doc(db, 'cargas', carga.id), { itens })
  }
  async function conferirTudo(carga, valor) {
    await updateDoc(doc(db, 'cargas', carga.id), {
      itens: (carga.itens || []).map((it) => ({ ...it, conferido: valor })),
    })
  }

  // saída: fecha a carga e carimba a saída em cada pedido (é o que o vendedor vê)
  async function marcarSaida(carga) {
    const { total, conferidos } = progressoConferencia(carga)
    if (conferidos < total && !confirm(
      `Faltam ${total - conferidos} item(ns) para conferir. Marcar a saída assim mesmo?`)) return
    if (!confirm(`Confirmar a saída da carga #${carga.numero}${carga.motorista ? ` com ${carga.motorista}` : ''}?`)) return
    setSalvando('saida')
    try {
      const agora = new Date().toISOString()
      const ids = [...new Set(carga.pedidos || [])]
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 400)) {
          batch.update(doc(db, 'pedidos', id), {
            saidaEm: agora, saidaMotorista: carga.motorista || '', saidaPor: nome || '',
          })
        }
        await batch.commit()
      }
      await updateDoc(doc(db, 'cargas', carga.id), {
        status: STATUS_CARGA.SAIU, saiuEm: agora, saiuPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível marcar a saída: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // Desfaz uma carga que JÁ SAIU: os pedidos voltam para a expedição (perdem a
  // marca de saída) e os itens ficam livres para outra viagem. A carga continua
  // no histórico como cancelada — apagar esconderia que a viagem foi registrada.
  async function retornarParaExpedicao(carga) {
    if (!podeDesfazer || salvando) return
    const ids = [...new Set(carga.pedidos || [])]
      .filter((id) => (pedidos || []).some((p) => String(p.idVenda) === String(id)))
    if (!confirm(
      `Retornar a carga #${carga.numero} para a expedição?\n\n` +
      `${ids.length} pedido(s) perdem a marca de saída e voltam a ficar disponíveis ` +
      `para carregar. Os que já foram entregues não são afetados.`)) return
    setSalvando('retornar')
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db)
        for (const id of ids.slice(i, i + 400)) {
          batch.update(doc(db, 'pedidos', id), {
            saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
          })
        }
        await batch.commit()
      }
      await updateDoc(doc(db, 'cargas', carga.id), {
        status: STATUS_CARGA.CANCELADA,
        canceladaEm: new Date().toISOString(),
        canceladaPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível retornar a carga: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // Tira UM pedido da carga em montagem: ele volta para a lista de disponíveis.
  // Faltava isso — só existia "cancelar carga", que é tudo ou nada, e na prática
  // o que acontece é um pedido não caber ou o cliente pedir para adiar.
  async function tirarDaCarga(carga, idVenda) {
    if (salvando) return
    const itens = (carga.itens || []).filter((it) => String(it.idVenda) !== String(idVenda))
    if (!confirm(`Tirar o pedido #${idVenda} desta carga? Ele volta a ficar disponível para carregar.`)) return
    setSalvando('tirar')
    try {
      if (!itens.length) {
        // sem item nenhum a carga não tem razão de existir
        await deleteDoc(doc(db, 'cargas', carga.id))
      } else {
        await updateDoc(doc(db, 'cargas', carga.id), {
          itens,
          pedidos: [...new Set(itens.map((it) => it.idVenda))],
          rotas: carga.rotas || [],
        })
      }
    } catch (e) {
      alert('Não foi possível tirar da carga: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  async function cancelarCarga(carga) {
    if (!confirm(`Cancelar a carga #${carga.numero}? Os pedidos voltam a ficar disponíveis para outra carga.`)) return
    await deleteDoc(doc(db, 'cargas', carga.id))
  }

  const historico = cargas
    .filter((c) => c.status !== STATUS_CARGA.MONTANDO)
    .sort((a, b) => (b.criadaEm || '').localeCompare(a.criadaEm || ''))

  return (
    <>
      <div className="toolbar no-print">
        <h1 className="page-title">Controle de entregas
          <small>
            {aberta
              ? `carga #${aberta.numero} em montagem`
              : `${abertos.length} plano(s) · ${disponiveis.length} pedido(s) prontos`}
          </small>
        </h1>
        <CapacidadeCaminhao valor={capacidadeKg}
          podeEditar={['dono', 'designer', 'financeiro'].includes(perfil)} />
        <div className="spacer" />
        <div className="vista-toggle">
          <button className={`btn${aba === 'planos' ? ' primary' : ''}`} onClick={() => setAba('planos')}>
            📋 Planejamento {abertos.length > 0 && `(${abertos.length})`}
          </button>
          <button className={`btn${aba === 'montar' ? ' primary' : ''}`} onClick={() => setAba('montar')}>
            📦 Carga atual
          </button>
          <button className={`btn${aba === 'historico' ? ' primary' : ''}`} onClick={() => setAba('historico')}>
            ☰ Histórico {historico.length > 0 && `(${historico.length})`}
          </button>
        </div>
      </div>

      {aba === 'planos' && (plano
        ? <>
            <PlanoAberto
              plano={plano} dentro={dentro} fora={fora} todos={todos}
              deOutrasRotas={deOutrasRotas} daRotaDo={daRotaDo}
              livresPorPedido={livresPorPedido} noutroPlano={noutroPlano}
              itensCad={itensCad} clientes={clientes} cadastros={cadastros}
              totais={totaisPlano} peso={pesoPlano} capacidadeKg={capacidadeKg}
              prontos={prontosDoPlano.length} volumes={volumesDoPlano.length}
              motorista={motorista} setMotorista={setMotorista} motoristas={motoristasAtivos}
              salvando={salvando} temCargaAberta={!!aberta}
              filtros={filtros} setFiltros={setFiltros}
              onVoltar={() => setPlanoId('')} onAlterna={alternaNoPlano}
              onAlternaTodos={alternaTodos} onLiberar={liberarPlano}
              onEncerrar={encerrarPlano} onDevolver={devolverParaExpedicao} />
          </>
        : <ListaPlanos planos={abertos.filter((pl) =>
              (!filtrosLista.vendedor || (pl.vendedor || '—') === filtrosLista.vendedor)
              && (!filtrosLista.rota || (pl.rota || 'SEM ROTA') === filtrosLista.rota))} resumo={resumoPlano} todos={todos} cadastros={cadastros}
            salvando={salvando} onAbrir={setPlanoId} onCriar={criarPlano} onApagar={apagarPlano}
            gruposProntos={gruposProntos} prontosSemPlano={prontosSemPlano}
            planoDaRota={planoDaRota} onJuntar={juntarNoPlano} clientes={clientes}
            filtros={filtrosLista} setFiltros={setFiltrosLista}
            baseFiltro={prontosLivres.map((d) => d.p)} totalPlanos={abertos.length}
            baseSeletores={todos} rotasFiltro={rotasFiltro} />)}

      {aba === 'montar' && (aberta
        ? <Conferencia carga={aberta} pedidos={pedidos} clientes={clientes} itensCad={itensCad}
            salvando={salvando} onConferir={conferir} onConferirTudo={conferirTudo}
            onSaida={marcarSaida} onCancelar={cancelarCarga} />
        : <div className="empty"><div className="big">📦</div>
            Nenhuma carga em montagem. A carga nasce de um plano — vá em
            <b> 📋 Planejamento</b>, monte a previsão da viagem e clique em
            <b> 🚚 Liberar para entrega</b>.
          </div>)}

      {aba === 'historico' && (
        <Historico cargas={historico} podeDesfazer={podeDesfazer}
          salvando={salvando} onRetornar={retornarParaExpedicao} />
      )}
    </>
  )
}

// Capacidade do caminhão, em kg — o limite que a sugestão usa para avisar.
// Fica no cadastro (`config/cadastros.logistica`) e só staff altera: é um número
// que orienta todo mundo, e mudá-lo sem querer faria a tela mentir para a equipe.
function CapacidadeCaminhao({ valor, podeEditar }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const n = Number(String(txt).replace(',', '.'))
    setSalvando(true)
    try {
      await updateDoc(doc(db, 'config', 'cadastros'), {
        'logistica.capacidadeKg': txt === '' || !(n > 0) ? deleteField() : n,
      })
      setEditando(false)
    } catch (e) {
      alert('Não foi possível salvar: ' + (e.code || e.message))
    } finally { setSalvando(false) }
  }

  if (!editando) {
    return (
      <span className="chip" style={{ cursor: podeEditar ? 'pointer' : 'default' }}
        title={podeEditar ? 'Clique para alterar a capacidade do caminhão' : ''}
        onClick={() => { if (podeEditar) { setTxt(valor ? String(valor) : ''); setEditando(true) } }}>
        🚛 {valor > 0 ? `${fmtQtd(valor)} kg por viagem` : 'capacidade não definida'}{podeEditar ? ' ✎' : ''}
      </span>
    )
  }
  return (
    <span className="chip" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
      🚛 <input className="filtro-input" style={{ width: 90 }} inputMode="decimal" autoFocus
        value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="kg" />
      <button className="mini-btn" disabled={salvando} onClick={salvar}>{salvando ? '…' : '✓'}</button>
      <button className="mini-btn" onClick={() => setEditando(false)}>✕</button>
    </span>
  )
}

// ---------- PLANEJAMENTO: a lista de previsões abertas ----------
// A carga NASCE de um plano. Antes a viagem se montava marcando pedidos numa
// lista solta — servia para "carregar o que está pronto agora", mas não para
// programar: não dava para reservar lugar para o pedido que ainda está no silk,
// nem para olhar a rota inteira antes do dia.
function ListaPlanos({ planos, resumo, todos, cadastros, salvando, onAbrir, onCriar, onApagar,
                       gruposProntos, prontosSemPlano, planoDaRota, onJuntar, clientes,
                       filtros, setFiltros, baseFiltro, totalPlanos, baseSeletores, rotasFiltro }) {
  const [novo, setNovo] = useState(false)
  const [vendedor, setVendedor] = useState('')
  const [rota, setRota] = useState('')
  const [data, setData] = useState('')

  // vendedores: os do CADASTRO mais os que aparecem em pedido (nome que ainda
  // não foi cadastrado não pode ficar sem previsão possível)
  const vendedores = [...new Set([
    ...(cadastros || []).map((v) => v.nome).filter(Boolean),
    ...todos.map((p) => p.vendedor).filter(Boolean),
  ])].sort()
  // rotas: as CADASTRADAS do vendedor (é possível programar rota cujos pedidos
  // estão todos na produção), mais qualquer rota que apareça em pedido dele
  const rotas = [...new Set([
    ...rotasDoVendedor(vendedor, cadastros),
    ...todos.filter((p) => p.vendedor === vendedor).map((p) => p.rota || 'SEM ROTA'),
  ])].filter(Boolean)
    .sort((a, b) => (ordemRota(vendedor, a, cadastros) - ordemRota(vendedor, b, cadastros))
      || a.localeCompare(b))

  function criar() {
    if (!vendedor || !rota) { alert('Escolha o vendedor e a rota da viagem.'); return }
    onCriar({ vendedor, rota, saidaPrevista: data })
    setNovo(false); setVendedor(''); setRota(''); setData('')
  }

  return (
    <>
      {novo ? (
        <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
          <h3 style={{ marginBottom: 12 }}>Nova previsão de entrega</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field">
              <label>Vendedor</label>
              <select className="filtro-input" value={vendedor}
                onChange={(e) => { setVendedor(e.target.value); setRota('') }}>
                <option value="">escolha…</option>
                {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Rota</label>
              <select className="filtro-input" value={rota} onChange={(e) => setRota(e.target.value)}
                disabled={!vendedor}>
                <option value="">{vendedor ? 'escolha…' : 'escolha o vendedor'}</option>
                {rotas.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Saída prevista (opcional)</label>
              <input type="date" className="filtro-input filtro-date" value={data}
                onChange={(e) => setData(e.target.value)} />
            </div>
            <button className="btn ok" disabled={!!salvando} onClick={criar}>
              {salvando === 'plano' ? 'Criando…' : '✓ Criar previsão'}
            </button>
            <button className="btn" onClick={() => setNovo(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <button className="btn primary" onClick={() => setNovo(true)}>+ Nova previsão de entrega</button>
        </div>
      )}

      {/* os seletores saem de TODOS os pedidos, não só dos prontos: vendedor que
          hoje não tem nada pronto sumia da lista, e com ele as rotas dele */}
      <FiltrosBar filtros={filtros} setFiltros={setFiltros}
        vendedores={vendedoresDe(baseSeletores)} pedidos={baseSeletores} rotas={rotasFiltro} />
      {resumoFiltros(filtros) && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 2px 12px' }}>
          {resumoFiltros(filtros)}
        </div>
      )}

      {prontosSemPlano > 0 && (
        <div className="prontos-bloco">
          <div className="sug-titulo" style={{ margin: '0 2px 8px' }}>
            📦 Prontos sem previsão
            <small>{prontosSemPlano} pedido(s) expedidos e ainda fora de qualquer viagem</small>
          </div>
          <div className="cards">
            {gruposProntos.map((g) => {
              const jaTem = planoDaRota(g.vendedor, g.rota)
              return (
                <div key={g.chave} className="card em_dia">
                  <div className="card-top">
                    <div className="cliente">📍 {g.rota}</div>
                    <div className="idv">{g.pedidos.length}</div>
                  </div>
                  <div className="meta-row"><span className="chip">👤 {g.vendedor}</span></div>
                  <div className="pl-est ok" style={{ marginTop: 6 }}>
                    📦 {g.volumes.length} volume(s) · {fmtPeso(g.peso)}
                  </div>
                  <ul className="itens" style={{ marginTop: 6 }}>
                    {g.pedidos.slice(0, 4).map((p) => (
                      <li key={p.idVenda}>
                        <span>{nomeCliente(p.cliente, clientes)}</span>
                        <span className="q">#{p.idVenda}</span>
                      </li>
                    ))}
                    {g.pedidos.length > 4 && (
                      <li><span style={{ color: 'var(--text-faint)', textTransform: 'none' }}>
                        e mais {g.pedidos.length - 4}…
                      </span></li>
                    )}
                  </ul>
                  <button className="btn ok sug-btn" disabled={!!salvando}
                    onClick={() => jaTem
                      ? onJuntar(jaTem, g)
                      : onCriar({ vendedor: g.vendedor, rota: g.rota, saidaPrevista: '',
                                  pedidos: g.pedidos.map((p) => p.idVenda) })}>
                    {jaTem ? `+ Pôr na previsão #${jaTem.numero}` : '+ Criar previsão com estes'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {prontosSemPlano === 0 && baseFiltro.length > 0 && resumoFiltros(filtros) && (
        <div className="prontos-bloco" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          📦 Nenhum dos {baseFiltro.length} pedido(s) prontos bate com esses filtros.
        </div>
      )}

      {planos.length === 0 ? (
        <div className="empty"><div className="big">📋</div>
          {totalPlanos > 0
            ? `Nenhuma das ${totalPlanos} previsão(ões) abertas bate com esses filtros.`
            : <>Nenhuma previsão aberta. Crie uma para montar a viagem de uma rota — dá para
                pôr pedidos que ainda estão na produção, não só os que já ficaram prontos.</>}
        </div>
      ) : (
        <div className="cards">
          {planos.slice().sort((a, b) => (a.saidaPrevista || '9999').localeCompare(b.saidaPrevista || '9999')
            || (Number(a.numero) || 0) - (Number(b.numero) || 0)).map((pl) => {
            const r = resumo(pl)
            return (
              <div key={pl.id} className="card em_dia plano-card">
                <div className="card-top">
                  <div className="cliente">📍 {pl.rota}</div>
                  <div className="idv">#{pl.numero}</div>
                </div>
                <div className="meta-row">
                  <span className="chip">👤 {pl.vendedor || '—'}</span>
                  {pl.saidaPrevista && <span className="chip">🚚 saída {fmtData(pl.saidaPrevista + 'T00:00:00')}</span>}
                </div>
                <div className="pl-est ok" style={{ marginTop: 8 }}>
                  <b>{r.total}</b> pedido(s) na previsão · <b>{r.prontos}</b> pronto(s)
                </div>
                {r.volumes > 0 && (
                  <div className="pl-est">📦 {r.volumes} volume(s) · {fmtPeso(r.peso)}</div>
                )}
                {r.total > r.prontos && (
                  <div className="pl-est falta">⏳ {r.total - r.prontos} ainda na produção</div>
                )}
                {r.deFora > 0 && (
                  <div className="pl-est falta">⚠ {r.deFora} de outras rotas</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn ok" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => onAbrir(pl.id)}>Abrir</button>
                  <button className="btn" onClick={() => onApagar(pl)} title="Apagar a previsão (não mexe nos pedidos)">🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// quantos pedidos de outras rotas a busca desenha de uma vez
const LIMITE_BUSCA = 40

// ---------- PLANEJAMENTO: montar UMA viagem ----------
// Duas listas: o que está NESTA viagem e o que ainda dá para pôr. Todo pedido
// diz onde está — pronto (com volumes e peso) ou em que setor da fábrica. Esse
// segundo dado é o motivo da tela existir: sem ele o planejamento é um chute.
function PlanoAberto({ plano, dentro, fora, todos, deOutrasRotas, daRotaDo,
                       livresPorPedido, noutroPlano, itensCad, clientes,
                       cadastros, totais, peso, capacidadeKg, prontos, volumes,
                       motorista, setMotorista, motoristas, salvando, temCargaAberta,
                       filtros, setFiltros, onVoltar, onAlterna, onAlternaTodos,
                       onLiberar, onEncerrar, onDevolver }) {
  const [outras, setOutras] = useState(false)
  const estoura = capacidadeKg > 0 && peso.kg > capacidadeKg
  const forasteiros = dentro.filter((p) => !daRotaDo(p, plano)).length
  return (
    <>
      <div className="plano-head">
        <button className="btn" onClick={onVoltar}>← Previsões</button>
        <div>
          <div className="ph-titulo">📍 {plano.rota} <small>#{plano.numero}</small></div>
          <div className="ph-sub">
            {plano.vendedor || '—'}
            {plano.saidaPrevista && ` · saída prevista ${fmtData(plano.saidaPrevista + 'T00:00:00')}`}
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={onEncerrar} title="Tira esta previsão da lista de abertas">
          Encerrar previsão
        </button>
      </div>

      <div className="plano-cols">
        {/* ---- nesta viagem ---- */}
        <div className="plano-col">
          <div className="pc-head">
            🚚 Nesta viagem <span className="pc-n">{dentro.length}</span>
            {forasteiros > 0 && (
              <span className="chip rota-warn" title="Pedidos que não são desta rota">
                +{forasteiros} de fora
              </span>
            )}
            {dentro.length > 0 && (
              <button className="mini-btn" style={{ marginLeft: 'auto' }}
                onClick={() => onAlternaTodos(false)}>tirar todos</button>
            )}
          </div>
          {dentro.length === 0
            ? <div className="pc-vazio">Nada na previsão ainda. Marque ao lado o que vai nesta viagem.</div>
            : dentro.map((p) => (
                <LinhaPlano key={p.idVenda} p={p} clientes={clientes} itensCad={itensCad}
                  livres={livresPorPedido.get(String(p.idVenda))} dentro
                  deFora={!daRotaDo(p, plano)}
                  salvando={salvando} onAlterna={() => onAlterna(p)} onDevolver={onDevolver} />
              ))}
        </div>

        {/* ---- o resto da rota, e a exceção: buscar fora dela ---- */}
        <div className="plano-col">
          <div className="pc-head">
            {outras ? '🔍 Buscar em outras rotas' : '📋 Disponíveis desta rota'}
            <span className="pc-n">{outras ? deOutrasRotas.length : fora.length}</span>
            {!outras && fora.length > 0 && (
              <button className="mini-btn" style={{ marginLeft: 'auto' }}
                onClick={() => onAlternaTodos(true)}>pôr todos</button>
            )}
          </div>
          <div className="pc-modos">
            <button className={`btn${outras ? '' : ' primary'}`} onClick={() => setOutras(false)}>
              Desta rota
            </button>
            <button className={`btn${outras ? ' primary' : ''}`} onClick={() => setOutras(true)}
              title="Trazer um pedido de outra rota ou de outro vendedor para esta viagem">
              🔍 Outras rotas
            </button>
          </div>

          {/* na busca livre o seletor de vendedor faz falta; na fila da rota, não */}
          <FiltrosBar filtros={filtros} setFiltros={setFiltros} semVendedor={!outras}
            pedidos={outras ? todos : undefined} />

          {outras ? (
            deOutrasRotas.length === 0
              ? <div className="pc-vazio">Nenhum pedido de fora desta rota bate com essa busca.</div>
              : <>
                  {deOutrasRotas.slice(0, LIMITE_BUSCA).map((p) => (
                    <LinhaPlano key={p.idVenda} p={p} clientes={clientes} itensCad={itensCad}
                      livres={livresPorPedido.get(String(p.idVenda))}
                      noutro={noutroPlano.get(String(p.idVenda))} deFora
                      salvando={salvando} onAlterna={() => onAlterna(p)} onDevolver={onDevolver} />
                  ))}
                  {/* corte VISÍVEL: lista truncada sem aviso passa a impressão de
                      que aquilo é tudo que existe */}
                  {deOutrasRotas.length > LIMITE_BUSCA && (
                    <div className="pc-vazio">
                      Mostrando {LIMITE_BUSCA} de <b>{deOutrasRotas.length}</b> — use os filtros
                      acima para achar o pedido que falta.
                    </div>
                  )}
                </>
          ) : (
            fora.length === 0
              ? <div className="pc-vazio">Nenhum pedido sobrando nesta rota.</div>
              : fora.map((p) => (
                  <LinhaPlano key={p.idVenda} p={p} clientes={clientes} itensCad={itensCad}
                    livres={livresPorPedido.get(String(p.idVenda))}
                    noutro={noutroPlano.get(String(p.idVenda))}
                    salvando={salvando} onAlterna={() => onAlterna(p)} onDevolver={onDevolver} />
                ))
          )}
        </div>
      </div>

      {dentro.length > 0 && (
        <div className="batch-bar no-print">
          <span>
            <b>{prontos}</b> de {dentro.length} pronto(s) · <b>{volumes}</b> volume(s)
            {volumes > 0 && ` · ${fmtTotais(totais)}`}
            <b className={estoura ? 'peso-estoura' : ''}>
              {' · '}{fmtPeso(peso)}{capacidadeKg > 0 && ` de ${fmtQtd(capacidadeKg)} kg`}
            </b>
          </span>
          {motoristas.length > 0 && (
            <select className="btn" value={motorista} onChange={(e) => setMotorista(e.target.value)}>
              <option value="">🚚 Motorista…</option>
              {motoristas.map((m, i) => <option key={i} value={m.nome}>{m.nome}</option>)}
            </select>
          )}
          <button className="btn ok" disabled={!!salvando || !prontos || temCargaAberta}
            title={temCargaAberta ? 'Termine a carga que está em montagem antes de liberar outra' : ''}
            onClick={onLiberar}>
            {salvando === 'liberar' ? 'Liberando…' : `🚚 Liberar ${prontos} p/ entrega`}
          </button>
        </div>
      )}
    </>
  )
}

// uma linha de pedido no planejamento: diz se está pronto ou onde está na fábrica
function LinhaPlano({ p, clientes, itensCad, livres, dentro, noutro, deFora, salvando, onAlterna, onDevolver }) {
  const s = situacaoNoPlano(p, livres, itensCad)
  const atrasado = situacaoPrazo(p.previsao) === 'atrasado'
  return (
    <div className={`pl-linha${s.pronto ? ' pronto' : ''}`}>
      <button className={`btn${dentro ? '' : ' ok'} pl-acao`} disabled={!!salvando || (!dentro && !!noutro)}
        title={noutro ? `Já está no plano #${noutro.numero}` : ''}
        onClick={onAlterna}>{dentro ? '−' : '+'}</button>
      <div className="pl-corpo">
        <div className="pl-top">
          <b>{nomeCliente(p.cliente, clientes)}</b>
          <span className="idv">#{p.idVenda}</span>
        </div>
        <div className="pl-meta">
          <span className="chip">📍 {p.cidade || '—'}</span>
          <span className={`chip${atrasado ? ' atrasado' : ''}`}>{fmtData(p.previsao)}</span>
          {/* de onde ele veio: sem isto a viagem muda de itinerário e só se
              descobre na hora de carregar */}
          {deFora && (
            <span className="chip rota-warn">⚠ {p.rota || 'SEM ROTA'} · {p.vendedor || '—'}</span>
          )}
          {noutro && !dentro && <span className="chip rota-warn">no plano #{noutro.numero}</span>}
        </div>
        {s.pronto && (
          <div className="pl-est ok">
            ✅ pronto · {s.volumes} volume(s) · {fmtPeso(s.peso)}
            {dentro && (
              <button className="mini-btn" style={{ marginLeft: 8 }} disabled={!!salvando}
                title="Volta para a coluna Expedição do quadro"
                onClick={() => onDevolver({ p })}>↩ expedição</button>
            )}
          </div>
        )}
        {/* onde o resto está: é o que diz se falta um dia ou uma semana */}
        {s.pendencias.length > 0 && (
          <div className="pl-est falta">
            ⏳ {s.pendencias.map((x) => `${x.itens} em ${x.nome}`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}


// ---------- conferir e marcar a saída ----------
function Conferencia({ carga, pedidos, clientes, itensCad, salvando, onConferir, onConferirTudo, onSaida, onCancelar, onTirar }) {
  const { total, conferidos } = progressoConferencia(carga)
  const grupos = agrupaCargaPorPedido(carga, pedidos)
  const pronto = cargaConferida(carga)
  const idxDe = (it) => (carga.itens || []).findIndex((x) => chaveCarga(x) === chaveCarga(it))
  return (
    <>
      <div className={`card ${pronto ? 'em_dia' : ''} no-print`} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Carga #{carga.numero}</h3>
          {carga.motorista && <span className="chip">🚚 {carga.motorista}</span>}
          <span className="chip">{(carga.rotas || []).join(' · ') || '—'}</span>
          <span className={`chip${pronto ? '' : ' rota-warn'}`} style={pronto ? { color: 'var(--ok)' } : null}>
            {conferidos} de {total} volumes conferidos
          </span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn" onClick={() => onConferirTudo(carga, !pronto)}>
            {pronto ? 'Desmarcar tudo' : '✓ Conferir tudo'}
          </button>
          <button className="btn" onClick={() => window.print()}>🖨 Romaneio</button>
          <button className="btn ok" disabled={!!salvando} onClick={() => onSaida(carga)}>
            {salvando === 'saida' ? 'Registrando…' : '🚚 Marcar saída'}
          </button>
          <button className="btn" style={{ color: 'var(--danger)' }}
            onClick={() => onCancelar(carga)}>Cancelar carga</button>
        </div>
      </div>

      <div className="screen-only">
        {grupos.map((g) => (
          <div key={g.idVenda} className="card em_dia" style={{ marginBottom: 12 }}>
            <div className="card-top">
              <div className="cliente">{g.p ? nomeCliente(g.p.cliente, clientes) : `#${g.idVenda}`}</div>
              <div className="idv">#{g.idVenda}</div>
              <button className="btn no-print" disabled={!!salvando}
                style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
                title="Tirar este pedido da carga — ele volta para a expedição"
                onClick={() => onTirar(carga, g.idVenda)}>↩ tirar da carga</button>
            </div>
            {g.p && (
              <div className="meta-row">
                <span className="chip">📍 {g.p.cidade || '—'}</span>
                <span className="chip">{g.p.rota || 'SEM ROTA'}</span>
              </div>
            )}
            <ul className="itens">
              {g.itens.map((it) => (
                <li key={chaveCarga(it)}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                    <input type="checkbox" className="card-check" checked={!!it.conferido}
                      onChange={(e) => onConferir(carga, idxDe(it), e.target.checked)} />
                    <span style={it.conferido ? { textDecoration: 'line-through', opacity: .6 } : null}>
                      <SeloLinha linha={it.linha} />{it.produto}
                      {it.volumeN > 0 && <small className="q-de"> · volume {it.volumeN}</small>}
                    </span>
                  </label>
                  <span className="q">{fmtQtd(it.qtd)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <RomaneioCarga carga={carga} grupos={grupos} clientes={clientes} />
    </>
  )
}

// ---------- romaneio impresso da carga ----------
function RomaneioCarga({ carga, grupos, clientes }) {
  return (
    <div className="print-only">
      <div className="pr-head">
        <h1>JC Sacolas · Romaneio de Entrega · Carga #{carga.numero}</h1>
        <div className="meta">
          {fmtData(carga.criadaEm)}<br />
          {carga.motorista ? `🚚 ${carga.motorista} · ` : ''}
          {pedidosDaCarga(carga).length} entrega(s) · {(carga.itens || []).length} volume(s)
        </div>
      </div>
      <div className="pr-rota forte">
        {(carga.rotas || []).join(' · ') || 'SEM ROTA'} · {(carga.itens || []).length} volume(s)
      </div>
      {grupos.map((g) => (
        <div key={g.idVenda} className="pr-ped parada">
          <div className="top">
            <span className="box" />
            <span className="nm">{g.p ? nomeCliente(g.p.cliente, clientes) : `#${g.idVenda}`}</span>
            <span className="cid">— {g.p?.cidade || '—'}</span>
            <span className="ent">{g.p ? fmtData(g.p.previsao) : ''}</span>
          </div>
          <table className="pr-itens"><tbody>
            {g.itens.map((it) => (
              <tr key={chaveCarga(it)}>
                <td>
                  <SeloLinha linha={it.linha} />{it.produto}
                  {it.volumeN > 0 && <span className="ref"> · vol. {it.volumeN}</span>}
                  <span className="ref"> #{g.idVenda}</span>
                </td>
                <td className="q">{fmtQtd(it.qtd)}</td>
              </tr>
            ))}
          </tbody></table>
          {/* produção parcial: o romaneio precisa dizer que sai só uma parte */}
          {g.itens.some((it) => it.qtdItem > it.qtd) && (
            <div className="pr-parcial">⚠ ENTREGA PARCIAL — parte do pedido segue em produção</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- histórico das viagens ----------
function Historico({ cargas, podeDesfazer, salvando, onRetornar }) {
  if (!cargas.length) {
    return <div className="empty"><div className="big">🚚</div>Nenhuma carga registrada ainda.</div>
  }
  const rotulo = { saiu: '🚚 saiu', cancelada: '↩ retornada', concluida: '✓ concluída' }
  return (
    <div className="card em_dia" style={{ overflowX: 'auto' }}>
      <table className="rel-tab">
        <thead>
          <tr>
            <th>Carga</th><th>Saída</th><th>Motorista</th><th>Rotas</th>
            <th className="q">Pedidos</th><th className="q">Volumes</th><th>Status</th>
            {podeDesfazer && <th></th>}
          </tr>
        </thead>
        <tbody>
          {cargas.map((c) => (
            <tr key={c.id}>
              <td>#{c.numero}</td>
              <td>{c.saiuEm ? fmtDataHora(c.saiuEm) : '—'}</td>
              <td>{c.motorista || '—'}</td>
              <td>{(c.rotas || []).join(' · ')}</td>
              <td className="q">{(c.pedidos || []).length}</td>
              <td className="q">{(c.itens || []).length}</td>
              <td>
                {rotulo[c.status] || c.status}
                {c.canceladaEm && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    por {c.canceladaPor || '—'} · {fmtDataHora(c.canceladaEm)}
                  </div>
                )}
              </td>
              {podeDesfazer && (
                <td>
                  {c.status === STATUS_CARGA.SAIU && (
                    <button className="btn" disabled={!!salvando}
                      title="Os pedidos voltam para a expedição e ficam livres para outra carga"
                      onClick={() => onRetornar(c)}>↩ Retornar p/ expedição</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
