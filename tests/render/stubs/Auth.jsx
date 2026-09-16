// `globalThis.__auth` troca o usuário do stub num teste (e volta a undefined)
export const useAuth=()=>globalThis.__auth || ({perfil:'financeiro',nome:'Anny',user:{uid:'u1'}})
