export type TipoTaxaVenda =
  | "percentual"
  | "fixa_por_passagem"
  | "fixa_por_venda"
  | "percentual_mais_fixa";

export type ResponsavelTaxaVenda = "passageiro" | "armador" | "dividida";

export type RegraTaxaVenda = {
  ativa?: boolean;
  tipo?: TipoTaxaVenda;
  percentual?: number;
  valorFixo?: number;
  responsavel?: ResponsavelTaxaVenda;
  percentualPagoPassageiro?: number;
  baseCalculo?: "somente_passagens" | "passagens_e_adicionais";
  valorMinimo?: number | null;
  valorMaximo?: number | null;
  vigenciaInicio?: string | null;
  vigenciaFim?: string | null;
};

export type ConfiguracaoVendasBarco = {
  ativa: boolean;
  regraTaxa: RegraTaxaVenda;
  pagamento: {
    pixAtivo: boolean;
    mercadoPagoConectado: boolean;
    vendedorMercadoPagoId: string;
  };
  limiteHorasAntesSaida: number;
};

export type BeneficioTarifaPublico = {
  id: string;
  nome: string;
  ativo: boolean;
  modo: "desconto_percentual" | "valor_fixo" | "gratuidade";
  valor: number;
  vagasPorSaida: number | null;
  idadeMinima: number | null;
  idadeMaxima: number | null;
  exigeComprovante: boolean;
  observacao?: string;
};

function numero(valor: unknown, padrao = 0) {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : padrao;
}

function arredondar(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function normalizarChaveBusca(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function semTipoDeTerminal(valor: string) {
  return valor
    .replace(/^(porto|terminal|trapiche|marina|ponto de embarque)\s+(de|do|da|dos|das)?\s*/i, "")
    .trim();
}

function variantesLocal(valor: unknown) {
  const normalizado = normalizarChaveBusca(valor);
  if (!normalizado) return [];
  const semUf = normalizado.replace(/\s+-\s+[a-z]{2}$/i, "").trim();
  return Array.from(
    new Set([normalizado, semUf, semTipoDeTerminal(normalizado), semTipoDeTerminal(semUf)]),
  ).filter(Boolean);
}

export function localCorrespondeBusca(local: any, busca: unknown) {
  const buscas = variantesLocal(busca);
  if (!buscas.length) return false;
  const campos = typeof local === "string"
    ? [local]
    : [
        local?.porto,
        local?.nome,
        local?.cidade,
        local?.cidadeNome,
        local?.nomeCidade,
        local?.portoNome,
      ];
  const locais = campos.flatMap(variantesLocal);
  return buscas.some((procurado) =>
    locais.some(
      (candidato) =>
        candidato === procurado ||
        candidato.includes(procurado) ||
        procurado.includes(candidato),
    ),
  );
}

export function obterIdBarcoDaGrade(grade: any) {
  const candidatos = [
    grade?.barcoId,
    grade?.embarcacaoId,
    grade?.idBarco,
    grade?.id_barco,
    grade?.barco_id,
    grade?.embarcacao_id,
  ];

  return String(candidatos.find((valor) => String(valor || "").trim()) || "").trim();
}

export function obterNomeBarcoDaGrade(grade: any) {
  const candidatos = [
    grade?.nome_barco,
    grade?.nomeBarco,
    grade?.barcoNome,
    grade?.embarcacaoNome,
    grade?.nomeEmbarcacao,
  ];

  return String(candidatos.find((valor) => String(valor || "").trim()) || "").trim();
}

export function localizarBarcoDaGrade(grade: any, embarcacoes: any[]) {
  const id = obterIdBarcoDaGrade(grade);

  if (id) {
    const peloId = embarcacoes.find(
      (barco) => String(barco?.id || "").trim() === id,
    );

    if (peloId) return peloId;
  }

  const nomeGrade = normalizarChaveBusca(obterNomeBarcoDaGrade(grade));

  if (!nomeGrade) return null;

  return (
    embarcacoes.find((barco) => {
      const nomes = [
        barco?.nome,
        barco?.nome_barco,
        barco?.nomeBarco,
        barco?.apelido,
      ]
        .map(normalizarChaveBusca)
        .filter(Boolean);

      return nomes.includes(nomeGrade);
    }) || null
  );
}

export function obterConfiguracaoVendasBarco(
  barco: any,
): ConfiguracaoVendasBarco {
  const nova = barco?.vendasPassagens || {};
  const legado = barco?.financeiroMercadoPago || {};

  return {
    ativa:
      nova.modoPilotoMarketplace === true ||
      (
        nova.ativa ??
        barco?.vendaPassagemHabilitada ??
        legado.vendaPassagemHabilitada ??
        false
      ),
    regraTaxa: {
      ativa: nova.regraTaxa?.ativa !== false,
      tipo: nova.regraTaxa?.tipo || "percentual",
      percentual:
        nova.regraTaxa?.percentual ??
        legado.taxaPlataformaPercentual ??
        0,
      valorFixo:
        nova.regraTaxa?.valorFixo ??
        legado.taxaPlataformaValorFixo ??
        0,
      responsavel: nova.regraTaxa?.responsavel || "passageiro",
      percentualPagoPassageiro:
        nova.regraTaxa?.percentualPagoPassageiro ?? 100,
      baseCalculo:
        nova.regraTaxa?.baseCalculo || "somente_passagens",
      valorMinimo: nova.regraTaxa?.valorMinimo ?? null,
      valorMaximo: nova.regraTaxa?.valorMaximo ?? null,
      vigenciaInicio: nova.regraTaxa?.vigenciaInicio ?? null,
      vigenciaFim: nova.regraTaxa?.vigenciaFim ?? null,
    },
    pagamento: {
      pixAtivo: nova.pagamento?.pixAtivo !== false,
      mercadoPagoConectado:
        nova.pagamento?.mercadoPagoConectado ??
        legado.contaConectada ??
        false,
      vendedorMercadoPagoId:
        nova.pagamento?.vendedorMercadoPagoId ??
        legado.vendedorMercadoPagoId ??
        "",
    },
    limiteHorasAntesSaida: Math.max(
      0,
      numero(nova.limiteHorasAntesSaida, 2),
    ),
  };
}

export function deveExibirBotaoComprar(barco: any) {
  const configuracao = obterConfiguracaoVendasBarco(barco);
  const modoPilotoMarketplace =
    barco?.vendasPassagens?.modoPilotoMarketplace === true;

  return (
    configuracao.ativa === true &&
    (modoPilotoMarketplace || configuracao.pagamento.pixAtivo === true)
  );
}

export function obterTarifaTrecho(
  grade: any,
  origem: string,
  destino: string,
) {
  const tarifas = Array.isArray(grade?.tarifasTrechos)
    ? grade.tarifasTrechos
    : [];
  if (!tarifas.length) return null;

  const itinerario = Array.isArray(grade?.itinerario)
    ? grade.itinerario
    : Array.isArray(grade?.escalas)
      ? grade.escalas
      : [];
  const encontrarPonto = (valor: string) =>
    itinerario.find((ponto: any) => localCorrespondeBusca(ponto, valor));

  const pontoOrigem = encontrarPonto(origem);
  const pontoDestino = encontrarPonto(destino);
  const origemId = String(pontoOrigem?.portoId || pontoOrigem?.id || "");
  const destinoId = String(pontoDestino?.portoId || pontoDestino?.id || "");

  return (
    tarifas.find((tarifa: any) => {
      if (tarifa?.ativo === false) return false;
      const correspondeIds =
        origemId &&
        destinoId &&
        String(tarifa?.origemPortoId || "") === origemId &&
        String(tarifa?.destinoPortoId || "") === destinoId;
      const correspondeNomes =
        [pontoOrigem?.porto, pontoOrigem?.nome, pontoOrigem?.cidade, origem]
          .filter(Boolean)
          .some((valor) =>
            localCorrespondeBusca(tarifa?.origemNome || tarifa?.origem, valor),
          ) &&
        [pontoDestino?.porto, pontoDestino?.nome, pontoDestino?.cidade, destino]
          .filter(Boolean)
          .some((valor) =>
            localCorrespondeBusca(tarifa?.destinoNome || tarifa?.destino, valor),
          );
      return correspondeIds || correspondeNomes;
    }) || null
  );
}

export function obterBeneficiosTarifa(tarifa: any): BeneficioTarifaPublico[] {
  const beneficios = Array.isArray(tarifa?.beneficios) ? tarifa.beneficios : [];
  return beneficios
    .filter((item: any) => item?.ativo === true && String(item?.id || "").trim())
    .map((item: any) => ({
      id: String(item.id).trim(),
      nome: String(item.nome || item.id).trim(),
      ativo: true,
      modo: ["desconto_percentual", "valor_fixo", "gratuidade"].includes(item.modo)
        ? item.modo
        : "desconto_percentual",
      valor: Math.max(0, numero(item.valor)),
      vagasPorSaida: item.vagasPorSaida === null || item.vagasPorSaida === undefined
        ? null
        : Math.max(0, Math.floor(numero(item.vagasPorSaida))),
      idadeMinima: item.idadeMinima === null || item.idadeMinima === undefined
        ? null
        : Math.max(0, Math.floor(numero(item.idadeMinima))),
      idadeMaxima: item.idadeMaxima === null || item.idadeMaxima === undefined
        ? null
        : Math.max(0, Math.floor(numero(item.idadeMaxima))),
      exigeComprovante: item.exigeComprovante !== false,
      observacao: String(item.observacao || "").trim(),
    }));
}

export function calcularValorPassagemComBeneficio(
  valorIntegral: number,
  beneficio?: BeneficioTarifaPublico | null,
) {
  const base = Math.max(0, numero(valorIntegral));
  if (!beneficio) return arredondar(base);
  if (beneficio.modo === "gratuidade") return 0;
  if (beneficio.modo === "valor_fixo") {
    return arredondar(Math.min(base, Math.max(0, beneficio.valor)));
  }
  return arredondar(
    base * (1 - Math.min(100, Math.max(0, beneficio.valor)) / 100),
  );
}

/**
 * Apenas uma prévia visual no aplicativo.
 * O backend recalcula os valores oficiais antes de gerar o pagamento.
 */
export function calcularPreviaTaxaNoApp({
  regra,
  quantidade,
  valorUnitario,
  adicionais = 0,
  valoresPassagens,
}: {
  regra: RegraTaxaVenda;
  quantidade: number;
  valorUnitario: number;
  adicionais?: number;
  valoresPassagens?: number[];
}) {
  const valoresIndividuais = Array.isArray(valoresPassagens)
    ? valoresPassagens.map((valor) => arredondar(Math.max(0, numero(valor))))
    : [];
  const qtd = valoresIndividuais.length > 0
    ? valoresIndividuais.length
    : Math.max(1, Math.floor(numero(quantidade, 1)));
  const passagens = arredondar(
    valoresIndividuais.length > 0
      ? valoresIndividuais.reduce((total, valor) => total + valor, 0)
      : qtd * Math.max(0, numero(valorUnitario)),
  );
  const valorAdicionais = arredondar(
    Math.max(0, numero(adicionais)),
  );
  const base =
    regra.baseCalculo === "passagens_e_adicionais"
      ? passagens + valorAdicionais
      : passagens;

  let taxaPercentual = 0;
  let taxaFixa = 0;

  if (
    regra.ativa !== false &&
    (regra.tipo === "percentual" ||
      regra.tipo === "percentual_mais_fixa")
  ) {
    taxaPercentual = arredondar(
      base * (Math.max(0, numero(regra.percentual)) / 100),
    );
  }

  if (regra.ativa !== false && regra.tipo === "fixa_por_passagem") {
    taxaFixa = arredondar(
      Math.max(0, numero(regra.valorFixo)) * qtd,
    );
  }

  if (regra.ativa !== false && regra.tipo === "fixa_por_venda") {
    taxaFixa = arredondar(
      Math.max(0, numero(regra.valorFixo)),
    );
  }

  if (
    regra.ativa !== false &&
    regra.tipo === "percentual_mais_fixa"
  ) {
    taxaFixa = arredondar(
      Math.max(0, numero(regra.valorFixo)) * qtd,
    );
  }

  let taxaTotal = arredondar(taxaPercentual + taxaFixa);

  if (
    regra.ativa !== false &&
    regra.valorMinimo !== null &&
    regra.valorMinimo !== undefined
  ) {
    taxaTotal = Math.max(taxaTotal, numero(regra.valorMinimo));
  }

  if (
    regra.ativa !== false &&
    regra.valorMaximo !== null &&
    regra.valorMaximo !== undefined
  ) {
    taxaTotal = Math.min(taxaTotal, numero(regra.valorMaximo));
  }

  taxaTotal = arredondar(taxaTotal);

  let taxaPassageiro = 0;
  let taxaArmador = 0;

  if (regra.responsavel === "armador") {
    taxaArmador = taxaTotal;
  } else if (regra.responsavel === "dividida") {
    taxaPassageiro = arredondar(
      taxaTotal *
        (Math.min(
          100,
          Math.max(
            0,
            numero(regra.percentualPagoPassageiro, 100),
          ),
        ) /
          100),
    );
    taxaArmador = arredondar(taxaTotal - taxaPassageiro);
  } else {
    taxaPassageiro = taxaTotal;
  }

  const brutoArmador = arredondar(passagens + valorAdicionais);

  return {
    valorPassagens: passagens,
    valorAdicionais,
    valorBrutoArmador: brutoArmador,
    taxaTotal,
    taxaPassageiro,
    taxaArmador,
    totalPassageiro: arredondar(
      brutoArmador + taxaPassageiro,
    ),
    liquidoArmador: arredondar(
      Math.max(0, brutoArmador - taxaArmador),
    ),
  };
}
