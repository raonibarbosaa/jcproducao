# Produção por Setores — Modelagem no Sistema

> Como o fluxo real da fábrica (ver [FLUXO_PRODUCAO.md](FLUXO_PRODUCAO.md)) entra no sistema.
> Desenho fechado com o empresário. Dor principal a resolver: **"onde o pedido está"**.

## Escopo
- Vale para **pedidos de PAPEL** (impressão na **Gráfica**, que internamente pode passar
  pelo **Clichê**). Pedidos de plástico seguem o fluxo atual (Silk/Clichê como linha).

## Setores (etapa do pedido)
O pedido **anda como um bloco** (uma etapa atual por pedido):

```
TRIAGEM → GRÁFICA → MONTAGEM → EXPEDIÇÃO → ENTREGA → FINANCEIRO → ENTREGUE
```

- **Triagem:** designer define o pedido + os **acabamentos por item** (abaixo).
- **Gráfica:** impressão (pode passar pelo clichê internamente).
- **Montagem:** executa por item — laminação + corte e vinco (furo) + empacotamento.
- **Expedição:** coluna do quadro; expedir empurra para a Entrega.
- **Entrega:** usa Rota/Entregues; ao entregar vai para o Financeiro.
- **Financeiro:** confere pagamento → dá baixa → pedido **Entregue** (fechado).

## Acabamentos (por ITEM, definidos pelo designer na Triagem)
Gravados no item de papel; exibidos no card da Montagem:
- **laminação:** `nenhuma` | `fosca` | `brilho`
- **furoPresente:** `sim` | `não`

## Dados
- Pedido: novo campo **`etapa`** (`grafica` | `montagem` | `expedicao` | `entrega` |
  `financeiro` | `entregue`). Vale só para pedidos de papel.
- Item de papel: **`laminacao`** e **`furoPresente`**.
- Log de avanço: **quem** e **quando** a cada mudança de setor (auditoria).

## Permissões

| Perfil | Vê valor (R$) | Move setores | Libera setores/usuários | Baixa financeira |
|---|---|---|---|---|
| **Admin (dono)** | Sim | Todos | Sim | Sim |
| **Designer** | Sim | Todos | Sim | Não |
| **Financeiro** | Sim | — | Não | Sim |
| **Vendedor** | Só os próprios | Não (só acompanha os próprios) | Não | Não |
| **Operador** (novo) | **Não** | Só setores **liberados** | Não | Não |

- **Liberação por setor** (por usuário, definida por admin/designer no cadastro de usuário):
  `Gráfica`, `Montagem`, `Expedição`, `Entrega`.
- **Regra de avanço:** para empurrar um pedido, o usuário precisa estar liberado no
  **setor de ORIGEM** (onde o pedido está). Admin/designer avançam qualquer um.
- **Valor (R$) escondido do Operador** em todas as telas.
- **Baixa financeira:** só Financeiro e Admin.

## Fases de implementação (proposta)
- **Fase A — Núcleo "onde está":** campo `etapa`; quadro por setor (Gráfica · Montagem ·
  Expedição) com botão "concluir → próximo setor" (log quem/quando); migração dos pedidos
  de papel atuais para `grafica`. Voz: "quantos pedidos na montagem", "o que falta expedir".
- **Fase B — Perfil Operador + permissões:** perfil `operador`; liberações por setor no
  cadastro de usuário; esconder R$ do operador; `firestore.rules`.
- **Fase C — Acabamentos na Triagem:** laminação + furo por item; exibir na Montagem.
- **Fase D — Cauda de entrega + financeiro:** Expedição → Entrega (Rota/Entregues) →
  baixa financeira → Entregue.

## Pontos a decidir na Fase A
- Como conviver plástico (lista atual) × papel (quadro por setor) na mesma tela de Produção.
- Migração/estado inicial dos pedidos de papel já existentes.
