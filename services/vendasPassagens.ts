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
  const encontrarPonto = (valor: string) => {
    const procurado = normalizarChaveBusca(valor).split(" - ")[0];
    return itinerario.find((ponto: any) =>
      [ponto?.porto, ponto?.nome, ponto?.cidade].some(
        (campo) =>
          normalizarChaveBusca(campo).split(" - ")[0] === procurado,
      ),
    );
  };

  const pontoOrigem = encontrarPonto(origem);
  const pontoDestino = encontrarPonto(destino);
  const origemId = String(pontoOrigem?.portoId || pontoOrigem?.id || "");
  const destinoId = String(pontoDestino?.portoId || pontoDestino?.id || "");
  const origemNormalizada = normalizarChaveBusca(origem).split(" - ")[0];
  const destinoNormalizado = normalizarChaveBusca(destino).split(" - ")[0];

  return (
    tarifas.find((tarifa: any) => {
      if (tarifa?.ativo === false) return false;
      const correspondeIds =
        origemId &&
        destinoId &&
        String(tarifa?.origemPortoId || "") === origemId &&
        String(tarifa?.destinoPortoId || "") === destinoId;
      const correspondeNomes =
        normalizarChaveBusca(tarifa?.origemNome || tarifa?.origem).split(
          " - ",
        )[0] === origemNormalizada &&
        normalizarChaveBusca(tarifa?.destinoNome || tarifa?.destino).split(
          " - ",
        )[0] === destinoNormalizado;
      return correspondeIds || correspondeNomes;
    }) || null
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
}: {
  regra: RegraTaxaVenda;
  quantidade: number;
  valorUnitario: number;
  adicionais?: number;
}) {
  const qtd = Math.max(1, Math.floor(numero(quantidade, 1)));
  const passagens = arredondar(
    qtd * Math.max(0, numero(valorUnitario)),
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
