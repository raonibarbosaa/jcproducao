// `globalThis.__cad` sobrepõe campos do cadastro num teste (e volta a undefined)
export const useCadastros=()=>({
  vendedores:[],clientesLegado:[],esmero:{url:'',ativo:false,textoSaida:''},motoristas:[],logistica:{},cores:[],
  clientes:[{razao:'INGRID MODAS',apelido:'INGRID'}],
  itens:[{produto:'SACOLA PAPEL P02',preco:4,tipo:'papel',unidade:'un'},
         {produto:'SACOLA PLASTICA 30X40',preco:32,tipo:'plastico',unidade:'kg'}],
  ...(globalThis.__cad||{}),
})
