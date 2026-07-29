# Fluxo de Produção — JC Sacolas

> Documento de referência do processo real de produção da fábrica.
> Registrado para uso futuro (ex.: modelar as etapas/estações de produção no sistema
> e relacionar **prazo de entrega × etapas do fluxo**).
> Fonte: descrição do próprio empresário (JC Sacolas).

## Resumo

A sacola chega da **gráfica só impressa**. Todo o resto — **acabamento e montagem** —
é feito na fábrica. Por isso **o prazo de entrega depende do caminho que cada pedido
percorre**: quanto mais acabamento, mais tempo. Pedidos **só de montagem** saem mais
rápido; pedidos com **laminação e outros acabamentos** levam mais tempo.

## Etapas

### 1) Designer recebe o pedido
Analisa e define o caminho:
- **Chapa/tela já pronta?**
  - **Sim** → sobe para o **Silk** (impressão na própria fábrica)
  - **Não** → vai direto para a **Gráfica** (impressão externa)

### 2) Gráfica (impressão externa)
O pedido é impresso, passa pela **expedição** e **volta para a fábrica** somente impresso.

### 3) Fábrica — Acabamento
Chegando impresso, pode ou não ter acabamento (**hot stamp**, **laminação**):
- **Vai laminar / plastificar?** (fosco ou brilho)
  - **Sim** → lamina e segue para **corte e vinco**
  - **Não** → vai direto para **corte e vinco**

### 4) Corte e vinco  *(início da montagem)*
- **Leva furo para presente?** Sim ou não.

### 5) Empacotamento
Finaliza a **montagem**.
- ⚠️ **Após a montagem, atualizar a quantidade de sacola de papel na expedição.**

### 6) Expedição (escritório)
Organiza a saída e gera a **baixa da entrega**, que segue para a **entrega**.

### 7) Entrega + Financeiro
Ao ser entregue, o **financeiro** confirma o "entregue" e dá **baixa no financeiro** —
ou faz a **cobrança**.

## Fluxograma (texto)

```
Pedido
  └─ Designer
       ├─ Chapa/tela pronta? ── SIM ─► SILK (impressão na fábrica) ─┐
       │                                                            │
       └─ NÃO ─► GRÁFICA (externa) ─► Expedição ─► volta à fábrica ─┤
                                                                    ▼
                                                        Fábrica (impresso)
                                                                    │
                                          Laminar/plastificar? ── SIM ─► Laminação ─┐
                                                    │                                │
                                                    └─ NÃO ───────────────────────────┤
                                                                                     ▼
                                                                            Corte e vinco
                                                                     (furo p/ presente? sim/não)
                                                                                     │
                                                                                     ▼
                                                                            Empacotamento
                                                                        (fim da MONTAGEM →
                                                                     atualizar qtd. sacola papel
                                                                            na expedição)
                                                                                     │
                                                                                     ▼
                                                              Expedição (escritório) ─► Entrega
                                                                                     │
                                                                                     ▼
                                                            Financeiro: dá "entregue" +
                                                              baixa no financeiro / cobra
```

## Pontos de atenção (para o sistema, no futuro)
- **Acabamentos** (hot stamp, laminação fosco/brilho) e **furo para presente** são
  variáveis que **impactam o prazo** — candidatos a virar atributos/etapas do pedido.
- **Montagem** = corte e vinco → (furo opcional) → empacotamento.
- **Sacola de papel:** a quantidade na expedição deve ser **atualizada após a montagem**.
- **Baixa da entrega** é gerada na expedição; **baixa financeira** é do financeiro na entrega.
