export type PlanoEmbarcacao = "basico" | "vitrine" | "tempo_real";
export type StatusSinal =
  | "ativo"
  | "offline"
  | "desativado"
  | "sem_tempo_real";

export const ROTULOS_PLANO: Record<PlanoEmbarcacao, string> = {
  basico: "Plano Básico",
  vitrine: "Plano Vitrine",
  tempo_real: "Plano Tempo Real",
};

export const CORES_PLANO: Record<PlanoEmbarcacao, string> = {
  basico: "#64748b",
  vitrine: "#38bdf8",
  tempo_real: "#10b981",
};

export const RECURSOS_POR_PLANO = {
  basico: {
    perfilCompleto: false,
    mostrarPortoSaida: false,
    mostrarDestino: false,
    mostrarHorarios: false,
    mostrarContato: false,
    limiteContatos: 0,
    posicaoTempoReal: false,
    eta: false,
    radar: false,
    percurso: false,
    alertas: false,
    bannerExclusivo: false,
  },
  vitrine: {
    perfilCompleto: true,
    mostrarPortoSaida: true,
    mostrarDestino: true,
    mostrarHorarios: true,
    mostrarContato: true,
    limiteContatos: 1,
    posicaoTempoReal: false,
    eta: false,
    radar: false,
    percurso: false,
    alertas: false,
    bannerExclusivo: false,
  },
  tempo_real: {
    perfilCompleto: true,
    mostrarPortoSaida: true,
    mostrarDestino: true,
    mostrarHorarios: true,
    mostrarContato: true,
    limiteContatos: 5,
    posicaoTempoReal: true,
    eta: true,
    radar: true,
    percurso: true,
    alertas: true,
    bannerExclusivo: true,
  },
} as const;

function dataEmMilissegundos(valor: any): number | null {
  if (!valor) return null;
  if (typeof valor?.toMillis === "function") return valor.toMillis();
  const tempo = new Date(String(valor)).getTime();
  return Number.isFinite(tempo) ? tempo : null;
}

export function normalizarPlano(valor: any): PlanoEmbarcacao {
  const plano = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s+-]+/g, "_");

  if (plano === "basico") return "basico";
  if (plano === "vitrine" || plano === "vitrine_digital") return "vitrine";
  if (
    plano === "tempo_real" ||
    plano === "temporeal" ||
    plano === "gps" ||
    plano === "completo"
  ) {
    return "tempo_real";
  }

  // Registros anteriores não possuíam planoId e já apareciam em tempo real.
  return "tempo_real";
}

export function planoEfetivo(embarcacao: any): PlanoEmbarcacao {
  const plano = normalizarPlano(
    embarcacao?.planoId ||
      embarcacao?.plano ||
      embarcacao?.planoSistema ||
      embarcacao?.categoriaPlano ||
      embarcacao?.categoria,
  );
  const status = String(embarcacao?.planoStatus || "ativo").toLowerCase();
  const validade = dataEmMilissegundos(embarcacao?.planoValidoAte);

  if (
    plano !== "basico" &&
    ((validade !== null && validade <= Date.now()) ||
      ["vencido", "suspenso", "cancelado"].includes(status))
  ) {
    return "basico";
  }

  return plano;
}

export function recursosDaEmbarcacao(embarcacao: any) {
  return RECURSOS_POR_PLANO[planoEfetivo(embarcacao)];
}

export function possuiTempoReal(embarcacao: any) {
  return recursosDaEmbarcacao(embarcacao).posicaoTempoReal;
}

export function statusSinalDaEmbarcacao(embarcacao: any): StatusSinal {
  if (!possuiTempoReal(embarcacao)) return "sem_tempo_real";
  if (
    embarcacao?.rastreadorAtivo === false ||
    embarcacao?.ativo === false ||
    embarcacao?.statusSinal === "desativado"
  ) {
    return "desativado";
  }
  return embarcacao?.online === true ? "ativo" : "offline";
}

export function prioridadePlano(embarcacao: any) {
  const plano = planoEfetivo(embarcacao);
  if (plano === "tempo_real") return 0;
  if (plano === "vitrine") return 1;
  return 2;
}
