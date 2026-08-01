export type CoordenadaNavegacao = {
  latitude: number;
  longitude: number;
};

export type EscalaResolvida = {
  indiceOriginal: number;
  nome: string;
  original: any;
  coordenada: CoordenadaNavegacao | null;
  progressoKm: number | null;
  distanciaAtualKm: number | null;
  status: "passou" | "proximo" | "futuro";
};

export type ProgressoRota = {
  indiceProximo: number;
  proximaEscala: EscalaResolvida | null;
  escalas: EscalaResolvida[];
  progressoAtualKm: number;
  distanciaForaDaRotaKm: number;
  rotaConcluida: boolean;
};

const KM_POR_GRAU_LATITUDE = 110.574;
const LIMITE_VELOCIDADE_KMH = 160;

const numeroValido = (valor: any): number | null => {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

const obterPrimeiroNumeroValido = (valores: any[]): number | null => {
  for (const valor of valores) {
    const numero = numeroValido(valor);
    if (numero !== null) return numero;
  }
  return null;
};

export const normalizarNomePorto = (valor: any): string => {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/⚓/g, "")
    .replace(/_/g, " ")
    .replace(/^PORTO\s+(DE|DA|DO|DOS|DAS)?\s*/gi, "")
    .replace(/^TERMINAL\s+(DE|DA|DO|DOS|DAS)?\s*/gi, "")
    .replace(/^CIDADE\s+(DE|DA|DO|DOS|DAS)?\s*/gi, "")
    .replace(/\s*[-/]\s*[A-Z]{2}$/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
};

export const extrairNomeEscala = (item: any): string => {
  if (!item) return "";
  if (typeof item === "string") return item;

  return String(
    item.porto ||
      item.nome ||
      item.local ||
      item.cidade ||
      item.destino ||
      item.origem ||
      "",
  );
};

const nomesCombinam = (a: any, b: any): boolean => {
  const na = normalizarNomePorto(a);
  const nb = normalizarNomePorto(b);

  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

const coordenadaValida = (latitude: any, longitude: any): boolean => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

export const extrairCoordenada = (valor: any): CoordenadaNavegacao | null => {
  const latitude =
    valor?.latitude ??
    valor?.lat ??
    valor?.coordenadas?.latitude ??
    valor?.coordenadas?.lat;
  const longitude =
    valor?.longitude ??
    valor?.lng ??
    valor?.lon ??
    valor?.coordenadas?.longitude ??
    valor?.coordenadas?.lng ??
    valor?.coordenadas?.lon;

  if (!coordenadaValida(latitude, longitude)) return null;

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

export const calcularDistanciaKmNavegacao = (
  origem: CoordenadaNavegacao,
  destino: CoordenadaNavegacao,
): number => {
  const R = 6371;
  const dLat = ((destino.latitude - origem.latitude) * Math.PI) / 180;
  const dLon = ((destino.longitude - origem.longitude) * Math.PI) / 180;
  const lat1 = (origem.latitude * Math.PI) / 180;
  const lat2 = (destino.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/**
 * Fonte única da velocidade usada no aplicativo.
 *
 * Prioridade:
 * 1. velocidade oficial em km/h;
 * 2. velocidade oficial em nós;
 * 3. velocidade do GPS em km/h;
 * 4. velocidade do GPS em nós (campo legado `velocidade`);
 * 5. velocidade média configurada da embarcação.
 *
 * Não há mais fallback fixo por tipo de embarcação.
 */
export const obterVelocidadeOficialKmh = (barco: any): number | null => {
  const posicao = barco?.ultima_posicao || barco?.ultimaPosicao || {};

  const velocidadeKmh = obterPrimeiroNumeroValido([
    posicao.velocidadeOficialKmh,
    barco?.velocidadeOficialKmh,
    posicao.velocidade_kmh,
    posicao.velocidadeKmh,
  ]);

  if (
    velocidadeKmh !== null &&
    velocidadeKmh >= 0 &&
    velocidadeKmh <= LIMITE_VELOCIDADE_KMH
  ) {
    return velocidadeKmh;
  }

  const velocidadeNos = obterPrimeiroNumeroValido([
    posicao.velocidadeOficialNos,
    barco?.velocidadeOficialNos,
    posicao.velocidade_nos,
    posicao.velocidadeNos,
    posicao.velocidade,
  ]);

  if (velocidadeNos !== null && velocidadeNos >= 0) {
    const convertido = velocidadeNos * 1.852;
    if (convertido <= LIMITE_VELOCIDADE_KMH) return convertido;
  }

  const velocidadeConfigurada = obterPrimeiroNumeroValido([
    barco?.velocidadeMediaKmh,
    barco?.velocidade_media_kmh,
    barco?.velocidadeMedia,
    barco?.configuracaoRota?.velocidadeMediaKmh,
  ]);

  if (
    velocidadeConfigurada !== null &&
    velocidadeConfigurada > 0 &&
    velocidadeConfigurada <= LIMITE_VELOCIDADE_KMH
  ) {
    return velocidadeConfigurada;
  }

  return null;
};

const encontrarTerminal = (escala: any, terminais: any[]): any | null => {
  const coordenadaDaEscala = extrairCoordenada(escala);
  if (coordenadaDaEscala) return escala;

  const nomeEscala = extrairNomeEscala(escala);
  if (!nomeEscala) return null;

  return (
    terminais.find((terminal: any) => {
      const nomes = [
        terminal?.nome,
        terminal?.porto,
        terminal?.cidade,
        terminal?.local,
        terminal?.id,
        terminal?.coordenadas?.nome,
        terminal?.coordenadas?.porto,
        terminal?.coordenadas?.cidade,
      ].filter(Boolean);

      return nomes.some((nome) => nomesCombinam(nomeEscala, nome));
    }) || null
  );
};

const converterParaPlanoKm = (
  coordenada: CoordenadaNavegacao,
  latitudeReferencia: number,
) => {
  const cosLat = Math.cos((latitudeReferencia * Math.PI) / 180);
  return {
    x: coordenada.longitude * 111.32 * cosLat,
    y: coordenada.latitude * KM_POR_GRAU_LATITUDE,
  };
};

const projetarNoSegmento = (
  ponto: CoordenadaNavegacao,
  inicio: CoordenadaNavegacao,
  fim: CoordenadaNavegacao,
) => {
  const latitudeReferencia = (inicio.latitude + fim.latitude + ponto.latitude) / 3;
  const p = converterParaPlanoKm(ponto, latitudeReferencia);
  const a = converterParaPlanoKm(inicio, latitudeReferencia);
  const b = converterParaPlanoKm(fim, latitudeReferencia);

  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const tamanhoQuadrado = abX * abX + abY * abY;

  const tBruto = tamanhoQuadrado > 0 ? (apX * abX + apY * abY) / tamanhoQuadrado : 0;
  const t = Math.max(0, Math.min(1, tBruto));
  const xProjetado = a.x + abX * t;
  const yProjetado = a.y + abY * t;
  const distanciaKm = Math.hypot(p.x - xProjetado, p.y - yProjetado);
  const comprimentoKm = Math.hypot(abX, abY);

  return { t, distanciaKm, comprimentoKm };
};

const construirAcumulado = (pontos: CoordenadaNavegacao[]): number[] => {
  const acumulado = [0];

  for (let i = 1; i < pontos.length; i += 1) {
    acumulado.push(
      acumulado[i - 1] + calcularDistanciaKmNavegacao(pontos[i - 1], pontos[i]),
    );
  }

  return acumulado;
};

const projetarNaRota = (
  ponto: CoordenadaNavegacao,
  rota: CoordenadaNavegacao[],
): { progressoKm: number; distanciaKm: number; indiceSegmento: number } | null => {
  if (rota.length < 2) return null;

  const acumulado = construirAcumulado(rota);
  let melhor:
    | { progressoKm: number; distanciaKm: number; indiceSegmento: number }
    | null = null;

  for (let i = 0; i < rota.length - 1; i += 1) {
    const projecao = projetarNoSegmento(ponto, rota[i], rota[i + 1]);
    const progressoKm = acumulado[i] + projecao.comprimentoKm * projecao.t;

    if (!melhor || projecao.distanciaKm < melhor.distanciaKm) {
      melhor = {
        progressoKm,
        distanciaKm: projecao.distanciaKm,
        indiceSegmento: i,
      };
    }
  }

  return melhor;
};

const resolverEscalas = (escalas: any[], terminais: any[]): EscalaResolvida[] => {
  return escalas.map((escala, indiceOriginal) => {
    const terminal = encontrarTerminal(escala, terminais);
    return {
      indiceOriginal,
      nome: extrairNomeEscala(escala),
      original: escala,
      coordenada: extrairCoordenada(escala) || extrairCoordenada(terminal),
      progressoKm: null,
      distanciaAtualKm: null,
      status: "futuro" as const,
    };
  });
};

export const determinarProgressoRota = ({
  barco,
  escalas,
  terminais,
  rotaOficialPontos = [],
  historicoRecente = [],
  raioChegadaKm = 1.5,
  margemPortoUltrapassadoKm = 2.5,
}: {
  barco: any;
  escalas: any[];
  terminais: any[];
  rotaOficialPontos?: CoordenadaNavegacao[];
  historicoRecente?: CoordenadaNavegacao[];
  raioChegadaKm?: number;
  margemPortoUltrapassadoKm?: number;
}): ProgressoRota | null => {
  const posicaoAtual = extrairCoordenada(barco?.ultima_posicao || barco);
  if (!posicaoAtual || !Array.isArray(escalas) || escalas.length === 0) {
    return null;
  }

  const escalasResolvidas = resolverEscalas(escalas, terminais || []);
  const escalasComCoordenada = escalasResolvidas.filter(
    (escala) => escala.coordenada,
  );

  if (escalasComCoordenada.length === 0) return null;

  const rotaOficialValida = rotaOficialPontos.filter((ponto) =>
    coordenadaValida(ponto?.latitude, ponto?.longitude),
  );

  const rotaBase =
    rotaOficialValida.length >= 2
      ? rotaOficialValida
      : (escalasComCoordenada.map(
          (escala) => escala.coordenada,
        ) as CoordenadaNavegacao[]);

  if (rotaBase.length < 2) {
    const unica = escalasComCoordenada[0];
    const distancia = calcularDistanciaKmNavegacao(
      posicaoAtual,
      unica.coordenada as CoordenadaNavegacao,
    );

    unica.distanciaAtualKm = distancia;
    unica.progressoKm = 0;
    unica.status = "proximo";

    return {
      indiceProximo: unica.indiceOriginal,
      proximaEscala: unica,
      escalas: escalasResolvidas,
      progressoAtualKm: 0,
      distanciaForaDaRotaKm: distancia,
      rotaConcluida: false,
    };
  }

  const projecaoAtual = projetarNaRota(posicaoAtual, rotaBase);
  if (!projecaoAtual) return null;

  // Usa poucos pontos recentes para impedir que uma oscilação do GPS faça o
  // sistema voltar para um porto já ultrapassado. Não usa o histórico inteiro,
  // pois ele pode conter uma viagem anterior.
  const historicoUtil = historicoRecente
    .slice(-25)
    .filter((ponto) => coordenadaValida(ponto?.latitude, ponto?.longitude));

  const progressosRecentes = historicoUtil
    .map((ponto) => projetarNaRota(ponto, rotaBase)?.progressoKm)
    .filter((valor): valor is number => Number.isFinite(valor));

  const progressoAtualKm = Math.max(
    projecaoAtual.progressoKm,
    progressosRecentes.length > 0 ? Math.max(...progressosRecentes) : 0,
  );

  for (const escala of escalasResolvidas) {
    if (!escala.coordenada) continue;

    const projecaoEscala = projetarNaRota(escala.coordenada, rotaBase);
    escala.progressoKm = projecaoEscala?.progressoKm ?? null;
    escala.distanciaAtualKm = calcularDistanciaKmNavegacao(
      posicaoAtual,
      escala.coordenada,
    );
  }

  let proximaEscala: EscalaResolvida | null = null;

  for (const escala of escalasResolvidas) {
    if (escala.progressoKm === null || escala.distanciaAtualKm === null) {
      escala.status = proximaEscala ? "futuro" : "futuro";
      continue;
    }

    const estaNoRaioDoPorto = escala.distanciaAtualKm <= raioChegadaKm;
    const ficouParaTras =
      escala.progressoKm < progressoAtualKm - margemPortoUltrapassadoKm;

    if (ficouParaTras && !estaNoRaioDoPorto) {
      escala.status = "passou";
      continue;
    }

    if (!proximaEscala) {
      escala.status = "proximo";
      proximaEscala = escala;
    } else {
      escala.status = "futuro";
    }
  }

  // Se todas as escalas foram ultrapassadas, considera a rota concluída.
  const rotaConcluida = !proximaEscala;
  const indiceProximo = proximaEscala
    ? proximaEscala.indiceOriginal
    : Math.max(0, escalasResolvidas.length - 1);

  return {
    indiceProximo,
    proximaEscala,
    escalas: escalasResolvidas,
    progressoAtualKm,
    distanciaForaDaRotaKm: projecaoAtual.distanciaKm,
    rotaConcluida,
  };
};

const obterDestinoDaGrade = (
  grade: any[] | undefined,
  terminais: any[],
): CoordenadaNavegacao | null => {
  if (!Array.isArray(grade) || grade.length === 0) return null;
  const ultima = grade[grade.length - 1];
  const terminal = encontrarTerminal(ultima, terminais);
  return extrairCoordenada(ultima) || extrairCoordenada(terminal);
};

export const inferirSentidoDaViagem = ({
  sentidoInformado,
  barco,
  gradeIda,
  gradeVolta,
  terminais,
  historicoRecente = [],
}: {
  sentidoInformado?: any;
  barco: any;
  gradeIda?: any[];
  gradeVolta?: any[];
  terminais: any[];
  historicoRecente?: CoordenadaNavegacao[];
}): "ida" | "volta" => {
  const normalizado = String(sentidoInformado || "").trim().toLowerCase();
  const sentidoPreferido =
    normalizado === "ida" || normalizado === "volta" ? normalizado : null;

  if (!gradeIda?.length && gradeVolta?.length) return "volta";
  if (!gradeVolta?.length) return "ida";

  const atual = extrairCoordenada(barco?.ultima_posicao || barco);
  const pontosValidos = historicoRecente.filter((ponto) =>
    coordenadaValida(ponto?.latitude, ponto?.longitude),
  );
  const anterior = pontosValidos.length >= 2
    ? pontosValidos[Math.max(0, pontosValidos.length - 8)]
    : null;

  // Sem deslocamento suficiente, respeita o sentido operacional informado.
  if (!atual || !anterior) return sentidoPreferido || "ida";

  const destinoIda = obterDestinoDaGrade(gradeIda, terminais || []);
  const destinoVolta = obterDestinoDaGrade(gradeVolta, terminais || []);

  if (!destinoIda && destinoVolta) return "volta";
  if (!destinoVolta) return "ida";

  const aproximacaoIda =
    calcularDistanciaKmNavegacao(anterior, destinoIda as CoordenadaNavegacao) -
    calcularDistanciaKmNavegacao(atual, destinoIda as CoordenadaNavegacao);
  const aproximacaoVolta =
    calcularDistanciaKmNavegacao(anterior, destinoVolta as CoordenadaNavegacao) -
    calcularDistanciaKmNavegacao(atual, destinoVolta as CoordenadaNavegacao);

  // O movimento real pode corrigir automaticamente um sentido operacional
  // desatualizado. A margem evita alternância causada por ruído de GPS.
  if (aproximacaoVolta > aproximacaoIda + 0.15) return "volta";
  if (aproximacaoIda > aproximacaoVolta + 0.15) return "ida";

  return sentidoPreferido || "ida";
};
