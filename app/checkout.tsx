import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState, // 🟢 Proteção contra fechamento
  Image,
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../services/firebase";
import {
  calcularValorPassagemComBeneficio,
  calcularPreviaTaxaNoApp,
  deveExibirBotaoComprar,
  localizarBarcoDaGrade,
  obterBeneficiosTarifa,
  obterConfiguracaoVendasBarco,
  obterIdBarcoDaGrade,
  obterTarifaTrecho,
  type BeneficioTarifaPublico,
} from "../services/vendasPassagens";

interface Passageiro {
  id: number;
  nome: string;
  documento: string;
  nacionalidade: string;
  nascimento: string;
  beneficioId: string;
  aceiteComprovacao: boolean;
}

function idadePelaDataNascimento(valor: string) {
  const partes = String(valor || "").split("/").map(Number);
  if (partes.length !== 3) return null;
  const [dia, mes, ano] = partes;
  const nascimento = new Date(ano, mes - 1, dia);
  if (
    !Number.isFinite(nascimento.getTime()) ||
    nascimento.getDate() !== dia ||
    nascimento.getMonth() !== mes - 1 ||
    nascimento.getFullYear() !== ano ||
    nascimento.getTime() > Date.now()
  ) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  if (
    hoje.getMonth() < mes - 1 ||
    (hoje.getMonth() === mes - 1 && hoje.getDate() < dia)
  ) idade -= 1;
  return idade;
}

function textoRegraIdade(beneficio: Partial<BeneficioTarifaPublico>) {
  const minima = beneficio.idadeMinima;
  const maxima = beneficio.idadeMaxima;
  if (minima != null && maxima != null) return `de ${minima} a ${maxima} anos`;
  if (minima != null) return `a partir de ${minima} anos`;
  if (maxima != null) return `até ${maxima} anos`;
  return "";
}

function idadeAtendeBeneficio(
  idade: number,
  beneficio: Partial<BeneficioTarifaPublico>,
) {
  return !(
    (beneficio.idadeMinima != null && idade < beneficio.idadeMinima) ||
    (beneficio.idadeMaxima != null && idade > beneficio.idadeMaxima)
  );
}

const URL_CHECKOUT_MARKETPLACE =
  "https://us-central1-sistema-navegacao.cloudfunctions.net/criarCheckoutVendaMarketplace";

export default function CheckoutPassagem() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  // 🟢 IDENTIDADE DO USUÁRIO (Corrigido)
  const user = auth.currentUser;

  // 🟢 REFERÊNCIA PARA O MONITOR (Gestão de RAM)
  const unsubPagamento = useRef<(() => void) | null>(null);
  const appAtivoRef = useRef(true);
  const mountedRef = useRef(true);
  const chaveIdempotenciaRef = useRef(
    `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
  );

  // 🛡️ VALIDAÇÃO MATEMÁTICA DE CPF (Algoritmo Oficial)
  const validarCPF = (cpf: string) => {
    cpf = cpf.replace(/[^\d]+/g, "");
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;

    let soma = 0;
    let resto;

    for (let i = 1; i <= 9; i++)
      soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);

    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++)
      soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);

    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;

    return true;
  };

  const formatarCPF = (v: string) => {
    v = v.replace(/\D/g, "");
    if (v.length > 11) v = v.substring(0, 11);
    return v
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  const formatarDataInput = (v: string) => {
    v = v.replace(/\D/g, "");
    if (v.length > 8) v = v.substring(0, 8);
    return v.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})(\d)/, "$1/$2");
  };

  const limparCPF = (cpf: string) => {
    return String(cpf || "").replace(/\D/g, "");
  };


  const montarDataHoraViagem = (dataIso: string, horario: string) => {
    if (!dataIso || !dataIso.includes("-")) return null;

    const [ano, mes, dia] = dataIso.split("-").map((item) => Number(item));
    const horarioLimpo = String(horario || "").match(/(\d{1,2}):(\d{2})/);
    const hora = horarioLimpo ? Number(horarioLimpo[1]) : 23;
    const minuto = horarioLimpo ? Number(horarioLimpo[2]) : 59;

    const data = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);

    if (Number.isNaN(data.getTime())) return null;

    return data;
  };

  const viagemJaEncerrada = () => {
    const dataHora = montarDataHoraViagem(dataViagemParam, horarioEmbarque);

    if (!dataHora) return false;

    return dataHora.getTime() < Date.now();
  };

  const getCheckoutStorageKey = () => {
    return `@cmb_checkout_pix_${user?.uid || "anonimo"}_${String(idViagemParam || idDaViagem || "sem_viagem")}_${dataViagemParam || "sem_data"}`;
  };

  const idDaViagem = params.viagemId || params.gradeId;
  const origemDesejada = String(params.origemDesejada || "");
  const destinoDesejado = String(params.destinoDesejado || "");
  const dataViagemParam = String(params.dataViagem || "");
  const idViagemParam = String(params.idViagem || "");
  const horarioVindoDaBusca = String(params.horarioSaida || "");
  const barcoIdParam = String(params.barcoId || "");

  const [carregando, setCarregando] = useState(false);
  const [loadingViagem, setLoadingViagem] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [dadosPix, setDadosPix] = useState<any>(null);
  const [viagemData, setViagemData] = useState<any>(null);
  const [barcoData, setBarcoData] = useState<any>(null);
  const [barcoIdResolvido, setBarcoIdResolvido] = useState("");
  const [resumoOficial, setResumoOficial] = useState<any>(null);
  const [diaSemanaNome, setDiaSemanaNome] = useState("");
  const [precosReais, setPrecosReais] = useState({
    rede: 0,
    poltrona: 0,
    suite: 0,
  });
  const [tipoAcomodacao, setTipoAcomodacao] = useState<
    "rede" | "poltrona" | "suite"
  >("rede");
  const [incluiRefeicao, setIncluiRefeicao] = useState(false);
  const [taxaRefeicao, setTaxaRefeicao] = useState(0);
  const [beneficiosDisponiveis, setBeneficiosDisponiveis] = useState<
    BeneficioTarifaPublico[]
  >([]);
  const [horarioEmbarque, setHorarioEmbarque] = useState(
    horarioVindoDaBusca || "---",
  );

  const [perfilComprador, setPerfilComprador] = useState<any>(null);
  const [carregandoPerfilComprador, setCarregandoPerfilComprador] =
    useState(true);

  const [passageiros, setPassageiros] = useState<Passageiro[]>([
    {
      id: Date.now(),
      nome: "",
      documento: "",
      nacionalidade: "Brasileira",
      nascimento: "",
      beneficioId: "integral",
      aceiteComprovacao: false,
    },
  ]);
  const [modalAviso, setModalAviso] = useState({
    visivel: false,
    titulo: "",
    mensagem: "",
    icone: "alert-circle" as any,
    cor: "#facc15",
  });
  const [foiCopiado, setFoiCopiado] = useState(false);

  const exibirAviso = (
    titulo: string,
    mensagem: string,
    tipo: "erro" | "aviso" = "aviso",
  ) => {
    setModalAviso({
      visivel: true,
      titulo,
      mensagem,
      icone: tipo === "erro" ? "close-circle" : "alert-circle",
      cor: tipo === "erro" ? "#ef4444" : "#facc15",
    });
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (unsubPagamento.current) {
        unsubPagamento.current();
        unsubPagamento.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function restaurarPixPendente() {
      try {
        const salvo = await AsyncStorage.getItem(getCheckoutStorageKey());

        if (!salvo || !mountedRef.current) return;

        const pix = JSON.parse(salvo);

        if (
          pix?.vendaId &&
          pix?.expiraEm &&
          new Date(pix.expiraEm).getTime() <= Date.now()
        ) {
          await AsyncStorage.removeItem(getCheckoutStorageKey());
          return;
        }

        if (pix?.vendaId || pix?.id_transacao) {
          setDadosPix(pix);
          setResumoOficial(pix.financeiro || null);
        }
      } catch (error) {
        console.log("Erro ao restaurar Pix pendente:", error);
      }
    }

    restaurarPixPendente();
  }, [user?.uid, idViagemParam, idDaViagem, dataViagemParam]);

  useEffect(() => {
    async function carregarPerfilComprador() {
      try {
        if (!user?.uid) {
          setPerfilComprador(null);
          return;
        }

        const perfilRef = doc(db, "usuarios", user.uid);
        const perfilSnap = await getDoc(perfilRef);

        if (perfilSnap.exists()) {
          setPerfilComprador(perfilSnap.data());
        } else {
          setPerfilComprador(null);
        }
      } catch (error) {
        console.log("Erro ao carregar perfil do comprador:", error);
        setPerfilComprador(null);
      } finally {
        setCarregandoPerfilComprador(false);
      }
    }

    carregarPerfilComprador();
  }, [user?.uid]);

  useEffect(() => {
    async function carregarDados() {
      if (!idDaViagem) return;

      try {
        setLoadingViagem(true);

        const snap = await getDoc(
          doc(db, "grades_viagens", String(idDaViagem)),
        );

        if (!snap.exists()) {
          setViagemData(null);
          setBarcoData(null);
          setBarcoIdResolvido("");
          return;
        }

        const dados = {
          id: snap.id,
          ...snap.data(),
        } as any;

        setViagemData(dados);

        if (!horarioEmbarque || horarioEmbarque === "---") {
          setHorarioEmbarque(
            dados.horarioSaida ||
              dados.horario_saida_origem ||
              "Confirme no porto",
          );
        }

        const itinerario = Array.isArray(dados.itinerario)
          ? dados.itinerario
          : Array.isArray(dados.escalas)
            ? dados.escalas
            : [];

        const normalizar = (texto: string) =>
          String(texto || "")
            .trim()
            .toLowerCase()
            .split(" - ")[0];

        const destinoAlvo = normalizar(destinoDesejado);
        const parada = itinerario.find(
          (item: any) =>
            normalizar(item?.porto || item?.cidade) === destinoAlvo,
        );

        const tarifaTrecho = obterTarifaTrecho(
          dados,
          origemDesejada,
          destinoDesejado,
        );
        const fonteTarifa = tarifaTrecho || parada;

        if (fonteTarifa) {
          setPrecosReais({
            rede: Number(
              fonteTarifa.preco_da_origem ??
                fonteTarifa.precoRede ??
                fonteTarifa.preco_rede ??
                fonteTarifa.preco ??
                0,
            ),
            poltrona: Number(
              fonteTarifa.preco_poltrona ??
                fonteTarifa.precoPoltrona ??
                0,
            ),
            suite: Number(
              fonteTarifa.preco_suite ??
                fonteTarifa.precoSuite ??
                0,
            ),
          });
          setTaxaRefeicao(
            Number(
              fonteTarifa.preco_refeicao ??
                fonteTarifa.precoRefeicao ??
                0,
            ),
          );
          setBeneficiosDisponiveis(obterBeneficiosTarifa(fonteTarifa));
        }

        let barcoEncontrado: any = null;
        const candidatoId =
          barcoIdParam || obterIdBarcoDaGrade(dados);

        if (candidatoId) {
          const barcoSnap = await getDoc(
            doc(db, "embarcacoes", candidatoId),
          );

          if (barcoSnap.exists()) {
            barcoEncontrado = {
              id: barcoSnap.id,
              ...barcoSnap.data(),
            };
          }
        }

        if (!barcoEncontrado) {
          const barcosSnap = await getDocs(
            collection(db, "embarcacoes"),
          );
          const lista = barcosSnap.docs.map((documento) => ({
            id: documento.id,
            ...documento.data(),
          }));

          barcoEncontrado = localizarBarcoDaGrade(
            dados,
            lista,
          );
        }

        setBarcoData(barcoEncontrado);
        setBarcoIdResolvido(barcoEncontrado?.id || "");
      } catch (error) {
        console.log("Erro ao carregar checkout:", error);
        setViagemData(null);
        setBarcoData(null);
        setBarcoIdResolvido("");
      } finally {
        setLoadingViagem(false);
      }
    }

    carregarDados();
  }, [
    idDaViagem,
    destinoDesejado,
    barcoIdParam,
    horarioEmbarque,
  ]);

  useEffect(() => {
    if (dataViagemParam && dataViagemParam.includes("-")) {
      const [ano, mes, dia] = dataViagemParam.split("-");
      const dataReal = new Date(Number(ano), Number(mes) - 1, Number(dia));
      const nome = dataReal.toLocaleDateString("pt-BR", { weekday: "long" });
      setDiaSemanaNome(nome.charAt(0).toUpperCase() + nome.slice(1));
    }
  }, [dataViagemParam]);

  // 📡 Monitora a venda oficial. O bilhete só aparece depois que o webhook
  // confirma o pagamento e o backend conclui a emissão atômica.
  const iniciarMonitoramento = (identificador: string) => {
    const id = String(identificador || "").trim();

    if (!id || !mountedRef.current) return;

    try {
      if (unsubPagamento.current) {
        unsubPagamento.current();
        unsubPagamento.current = null;
      }

      if (id.startsWith("VND-")) {
        unsubPagamento.current = onSnapshot(
          doc(db, "vendas", id),
          (snapshot) => {
            if (!mountedRef.current || !snapshot.exists()) return;

            const venda = snapshot.data();
            const pagamentoId = String(venda.pagamentoId || "").trim();
            const bilhetesEmitidos = Number(venda.bilhetesEmitidos || 0);
            const confirmada =
              String(venda.statusVenda || "").toLowerCase() === "confirmada" &&
              bilhetesEmitidos > 0 &&
              !!pagamentoId;

            if (!confirmada) return;

            if (unsubPagamento.current) {
              unsubPagamento.current();
              unsubPagamento.current = null;
            }

            AsyncStorage.removeItem(getCheckoutStorageKey()).catch(() => {});
            router.replace({
              pathname: "/bilhete",
              params: { pagamentoId },
            });
          },
          (error) => {
            console.log("Erro no monitoramento da venda:", error);
          },
        );
        return;
      }

      // Compatibilidade temporária com um Pix pendente criado na versão antiga.
      const q = query(
        collection(db, "passagens"),
        where("pagamentoId", "==", id),
      );

      unsubPagamento.current = onSnapshot(
        q,
        (snap) => {
          if (!mountedRef.current) return;

          const aprovado =
            !snap.empty &&
            snap.docs.every((d) => {
              const status = String(d.data().status || "")
                .toUpperCase()
                .trim();

              return (
                status === "APROVADO" ||
                status === "PAGO" ||
                status === "CONCLUIDO"
              );
            });

          if (!aprovado) return;

          if (unsubPagamento.current) {
            unsubPagamento.current();
            unsubPagamento.current = null;
          }

          AsyncStorage.removeItem(getCheckoutStorageKey()).catch(() => {});

          router.replace({
            pathname: "/bilhete",
            params: { pagamentoId: id },
          });
        },
        (error) => {
          console.log("Erro no monitoramento do pagamento:", error);
        },
      );
    } catch (error) {
      console.log("Falha ao iniciar monitoramento:", error);
    }
  };

  useEffect(() => {
    const identificador = dadosPix?.vendaId || dadosPix?.id_transacao;
    if (identificador) iniciarMonitoramento(identificador);

    return () => {
      if (unsubPagamento.current) {
        unsubPagamento.current();
        unsubPagamento.current = null;
      }
    };
  }, [dadosPix?.vendaId, dadosPix?.id_transacao]);

  useEffect(() => {
    async function salvarPixPendente() {
      try {
        if (dadosPix?.vendaId || dadosPix?.id_transacao) {
          await AsyncStorage.setItem(
            getCheckoutStorageKey(),
            JSON.stringify(dadosPix),
          );
        }
      } catch (error) {
        console.log("Erro ao salvar Pix pendente:", error);
      }
    }

    salvarPixPendente();
  }, [
    dadosPix?.vendaId,
    dadosPix?.id_transacao,
    user?.uid,
    idViagemParam,
    idDaViagem,
    dataViagemParam,
  ]);

  // 🟢 GESTÃO DE ESTADO DO APP (Evita fechar no banco)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      appAtivoRef.current = nextState === "active";

      const identificador = dadosPix?.vendaId || dadosPix?.id_transacao;

      if (nextState === "active" && identificador) {
        setTimeout(() => {
          if (mountedRef.current) {
            iniciarMonitoramento(identificador);
          }
        }, 800);
      }

      if (nextState === "background" || nextState === "inactive") {
        if (unsubPagamento.current) {
          unsubPagamento.current();
          unsubPagamento.current = null;
        }
      }
    });

    return () => sub.remove();
  }, [dadosPix?.vendaId, dadosPix?.id_transacao]);

  const compradorCidadeResidencia = String(
    perfilComprador?.cidadeResidencia || "",
  ).trim();
  const compradorEstadoResidencia = String(
    perfilComprador?.estadoResidencia || "",
  ).trim();
  const compradorEstadoResidenciaNome = String(
    perfilComprador?.estadoResidenciaNome || "",
  ).trim();
  const compradorCidadeResidenciaCompleta = String(
    perfilComprador?.cidadeResidenciaCompleta ||
      (compradorCidadeResidencia && compradorEstadoResidencia
        ? `${compradorCidadeResidencia} - ${compradorEstadoResidencia}`
        : ""),
  ).trim();
  const compradorCidadeResidenciaCodigoIbge = String(
    perfilComprador?.cidadeResidenciaCodigoIbge || "",
  ).trim();
  const perfilComCidadeCompleta =
    !!compradorCidadeResidencia && !!compradorEstadoResidencia;

  const configuracaoVendas = useMemo(
    () => obterConfiguracaoVendasBarco(barcoData),
    [barcoData],
  );

  const vendasLiberadas = useMemo(
    () => deveExibirBotaoComprar(barcoData),
    [barcoData],
  );

  const previaFinanceira = useMemo(
    () => {
      const valoresPassagens = passageiros.map((passageiro) => {
        const beneficio = beneficiosDisponiveis.find(
          (item) => item.id === passageiro.beneficioId,
        );
        return calcularValorPassagemComBeneficio(
          precosReais[tipoAcomodacao],
          beneficio,
        );
      });
      return calcularPreviaTaxaNoApp({
        regra: configuracaoVendas.regraTaxa,
        quantidade: passageiros.length,
        valorUnitario: precosReais[tipoAcomodacao],
        valoresPassagens,
        adicionais: incluiRefeicao
          ? taxaRefeicao * passageiros.length
          : 0,
      });
    },
    [
      configuracaoVendas.regraTaxa,
      passageiros.length,
      passageiros,
      beneficiosDisponiveis,
      precosReais,
      tipoAcomodacao,
      incluiRefeicao,
      taxaRefeicao,
    ],
  );

  const totalGeral = Number(
    resumoOficial?.totalPagoPassageiro ??
      previaFinanceira.totalPassageiro,
  );

  const calcularTotalFinalPorAcomodacao = (
    tipo: keyof typeof precosReais,
  ) => {
    if (precosReais[tipo] <= 0) return 0;

    const valoresPassagens = passageiros.map((passageiro) => {
      const beneficio = beneficiosDisponiveis.find(
        (item) => item.id === passageiro.beneficioId,
      );

      return calcularValorPassagemComBeneficio(
        precosReais[tipo],
        beneficio,
      );
    });

    return calcularPreviaTaxaNoApp({
      regra: configuracaoVendas.regraTaxa,
      quantidade: passageiros.length,
      valorUnitario: precosReais[tipo],
      valoresPassagens,
      adicionais: incluiRefeicao
        ? taxaRefeicao * passageiros.length
        : 0,
    }).totalPassageiro;
  };

  const vendaForaDoPrazo = () => {
    const dataHora = montarDataHoraViagem(
      dataViagemParam,
      horarioEmbarque,
    );

    if (!dataHora) return false;

    const limiteHoras = Math.max(
      0,
      Number(configuracaoVendas.limiteHorasAntesSaida || 0),
    );
    const limiteMs = limiteHoras * 60 * 60 * 1000;

    return Date.now() >= dataHora.getTime() - limiteMs;
  };

  const removerPassageiro = (id: number) => {
    if (passageiros.length > 1) {
      setPassageiros(passageiros.filter((p) => p.id !== id));
    } else {
      exibirAviso("Ação Bloqueada", "É necessário ao menos 1 passageiro.");
    }
  };

  const verificarManual = async () => {
    const vendaId = String(dadosPix?.vendaId || "").trim();
    const pagamentoIdAntigo = String(dadosPix?.id_transacao || "").trim();
    if (!vendaId && !pagamentoIdAntigo) return;
    setVerificando(true);
    try {
      if (vendaId) {
        const vendaSnap = await getDoc(doc(db, "vendas", vendaId));
        const venda = vendaSnap.data() || {};
        const pagamentoId = String(venda.pagamentoId || "").trim();
        const confirmada =
          vendaSnap.exists() &&
          String(venda.statusVenda || "").toLowerCase() === "confirmada" &&
          Number(venda.bilhetesEmitidos || 0) > 0 &&
          !!pagamentoId;

        if (confirmada) {
          await AsyncStorage.removeItem(getCheckoutStorageKey());
          router.replace({
            pathname: "/bilhete",
            params: { pagamentoId },
          });
          return;
        }

        const status = String(venda.statusVenda || "").toLowerCase();
        if (status === "auditoria_necessaria") {
          exibirAviso(
            "Pagamento em conferência",
            "A equipe Cadê Meu Barco foi avisada. A venda continuará bloqueada até a conferência.",
            "aviso",
          );
          return;
        }

        exibirAviso(
          "Aguardando confirmação",
          "O pagamento ainda não foi confirmado. Se você acabou de pagar, aguarde alguns instantes.",
        );
        return;
      }

      const q = query(
        collection(db, "passagens"),
        where("pagamentoId", "==", pagamentoIdAntigo),
      );
      const snap = await getDocs(q);
      if (
        !snap.empty &&
        snap.docs.every((d) => {
          const status = String(d.data().status || "")
            .toUpperCase()
            .trim();
          return (
            status === "APROVADO" || status === "PAGO" || status === "CONCLUIDO"
          );
        })
      ) {
        router.replace({
          pathname: "/bilhete",
          params: { pagamentoId: pagamentoIdAntigo },
        });
      } else {
        exibirAviso("Aguardando", "Pagamento não confirmado ainda.");
      }
    } catch (e) {
      console.log(e);
    } finally {
      setVerificando(false);
    }
  };

  const abrirCheckoutPendente = async () => {
    const checkoutUrl = String(dadosPix?.checkoutUrl || "").trim();
    if (!checkoutUrl) {
      exibirAviso(
        "Pagamento indisponível",
        "O endereço do Mercado Pago não foi localizado. Gere um novo pagamento.",
        "erro",
      );
      return;
    }

    try {
      const url = new URL(checkoutUrl);
      const permitido =
        url.protocol === "https:" &&
        (url.hostname === "mercadopago.com" ||
          url.hostname.endsWith(".mercadopago.com") ||
          url.hostname === "mercadopago.com.br" ||
          url.hostname.endsWith(".mercadopago.com.br") ||
          url.hostname.endsWith(".mercadolibre.com"));
      if (!permitido) throw new Error("DOMINIO_NAO_PERMITIDO");

      await WebBrowser.openBrowserAsync(checkoutUrl, {
        enableBarCollapsing: true,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (error) {
      console.log("Erro ao abrir checkout pendente:", error);
      exibirAviso(
        "Não foi possível abrir o Mercado Pago",
        "Confira sua conexão e tente novamente.",
        "erro",
      );
    }
  };

  const handleGerarPix = async () => {
    Keyboard.dismiss();

    if (!perfilComCidadeCompleta) {
      exibirAviso(
        "Complete seu perfil",
        "Informe sua cidade e estado em Meus Dados antes de comprar a passagem.",
        "aviso",
      );
      return;
    }

    if (!user?.uid) {
      exibirAviso(
        "Login necessário",
        "Entre novamente na sua conta antes de concluir a compra.",
        "aviso",
      );
      return;
    }

    if (!idDaViagem || !viagemData) {
      exibirAviso(
        "Viagem indisponível",
        "Não foi possível carregar os dados da viagem. Volte e selecione a viagem novamente.",
        "erro",
      );
      return;
    }

    if (!barcoData || !barcoIdResolvido) {
      exibirAviso(
        "Embarcação não vinculada",
        "Não foi possível identificar a embarcação desta viagem.",
        "erro",
      );
      return;
    }

    if (!vendasLiberadas) {
      exibirAviso(
        "Venda indisponível",
        "Esta embarcação não está com a venda de passagens habilitada.",
        "aviso",
      );
      return;
    }

    if (viagemJaEncerrada()) {
      exibirAviso(
        "Viagem encerrada",
        "Essa viagem já passou do horário de saída. Escolha uma próxima saída disponível.",
        "aviso",
      );
      return;
    }

    if (vendaForaDoPrazo()) {
      exibirAviso(
        "Vendas encerradas",
        `As vendas desta embarcação encerram ${configuracaoVendas.limiteHorasAntesSaida} hora(s) antes da saída.`,
        "aviso",
      );
      return;
    }

    if (!Number.isFinite(totalGeral) || totalGeral <= 0) {
      exibirAviso(
        "Gratuidade sujeita à validação",
        "Esta compra ficou com valor integralmente gratuito e não pode seguir para o Mercado Pago. Procure a embarcação ou a equipe Cadê Meu Barco para validar o benefício e emitir a passagem.",
        "aviso",
      );
      return;
    }

    for (let i = 0; i < passageiros.length; i++) {
      const passageiro = passageiros[i];
      const referencia =
        passageiros.length > 1
          ? ` do Passageiro ${i + 1}`
          : "";

      if (
        !passageiro.nome.trim() ||
        passageiro.nome.trim().split(/\s+/).length < 2
      ) {
        exibirAviso(
          "Nome incompleto",
          `Digite o nome completo${referencia}.`,
        );
        return;
      }

      if (!passageiro.nacionalidade.trim()) {
        exibirAviso(
          "Nacionalidade",
          `Informe a nacionalidade${referencia}.`,
        );
        return;
      }

      if (!validarCPF(passageiro.documento)) {
        exibirAviso(
          "CPF inválido",
          `O CPF informado${referencia} não é válido.`,
        );
        return;
      }

      if (passageiro.nascimento.length < 10) {
        exibirAviso(
          "Data de nascimento",
          `Informe a data completa${referencia} (DD/MM/AAAA).`,
        );
        return;
      }

      const idade = idadePelaDataNascimento(passageiro.nascimento);
      if (idade === null) {
        exibirAviso(
          "Data de nascimento inválida",
          `Confira a data informada${referencia} (DD/MM/AAAA).`,
        );
        return;
      }

      const beneficio = beneficiosDisponiveis.find(
        (item) => item.id === passageiro.beneficioId,
      );
      if (
        beneficio &&
        passageiro.beneficioId !== "integral" &&
        !idadeAtendeBeneficio(idade, beneficio)
      ) {
        exibirAviso(
          "Idade não permitida",
          `${beneficio.nome} é válido ${textoRegraIdade(beneficio)}${referencia}.`,
          "aviso",
        );
        return;
      }
      if (
        passageiro.beneficioId !== "integral" &&
        (!beneficio ||
          (beneficio.exigeComprovante && !passageiro.aceiteComprovacao))
      ) {
        exibirAviso(
          "Comprovação do benefício",
          `Confirme que o documento comprobatório será apresentado no embarque${referencia}.`,
          "aviso",
        );
        return;
      }
    }

    setCarregando(true);

    try {
      const token = await user.getIdToken(true);
      const resposta = await fetch(
        URL_CHECKOUT_MARKETPLACE,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gradeId: String(idDaViagem),
            idViagem:
              idViagemParam ||
              `${String(idDaViagem)}_${dataViagemParam}`,
            barcoId: barcoIdResolvido,
            origem: origemDesejada,
            destino: destinoDesejado,
            tipoVaga: tipoAcomodacao,
            refeicao: incluiRefeicao,
            dataViagem: dataViagemParam,
            horarioSaida: horarioEmbarque,
            chaveIdempotencia:
              chaveIdempotenciaRef.current,
            email: user.email || "",
            compradorCidadeResidencia,
            compradorEstadoResidencia,
            compradorEstadoResidenciaNome,
            compradorCidadeResidenciaCompleta,
            compradorCidadeResidenciaCodigoIbge,
            compradorCidadeResidenciaFonte:
              perfilComprador?.cidadeResidenciaFonte ||
              "ibge",
            passageiros: passageiros.map((passageiro) => ({
              nome: passageiro.nome.trim(),
              documento: limparCPF(
                passageiro.documento,
              ),
              nacionalidade:
                passageiro.nacionalidade.trim(),
              nascimento: passageiro.nascimento,
              beneficioId: passageiro.beneficioId,
              aceiteComprovacao: passageiro.aceiteComprovacao,
            })),
          }),
        },
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados?.erro ||
            `Servidor respondeu ${resposta.status}.`,
        );
      }

      if (!dados?.vendaId || !dados?.checkoutUrl) {
        throw new Error("A resposta do checkout veio incompleta.");
      }

      const checkoutUrl = String(dados.checkoutUrl);
      let dominioPermitido = false;
      try {
        const url = new URL(checkoutUrl);
        dominioPermitido =
          url.protocol === "https:" &&
          (url.hostname === "mercadopago.com" ||
            url.hostname.endsWith(".mercadopago.com") ||
            url.hostname === "mercadopago.com.br" ||
            url.hostname.endsWith(".mercadopago.com.br") ||
            url.hostname.endsWith(".mercadolibre.com"));
      } catch {
        dominioPermitido = false;
      }

      if (!dominioPermitido) {
        throw new Error("O endereço de pagamento retornado não é válido.");
      }

      const checkoutPendente = {
        vendaId: String(dados.vendaId),
        preferenciaId: String(dados.preferenciaId || ""),
        checkoutUrl,
        status: String(dados.status || "aguardando_pagamento"),
        expiraEm: String(dados.expiraEm || ""),
        criadoEm: new Date().toISOString(),
      };

      setDadosPix(checkoutPendente);

      await AsyncStorage.setItem(
        getCheckoutStorageKey(),
        JSON.stringify(checkoutPendente),
      );

      iniciarMonitoramento(checkoutPendente.vendaId);

      try {
        await WebBrowser.openBrowserAsync(checkoutUrl, {
          enableBarCollapsing: true,
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        });
      } catch (erroNavegador) {
        console.log("Checkout criado, mas navegador não abriu:", erroNavegador);
        exibirAviso(
          "Checkout preparado",
          "O pagamento foi preparado. Toque em ABRIR MERCADO PAGO para continuar.",
          "aviso",
        );
      }
    } catch (error: any) {
      console.log("Erro ao preparar checkout seguro:", error);
      exibirAviso(
        "Não foi possível preparar o pagamento",
        error?.message ||
          "Tente novamente em alguns instantes.",
        "erro",
      );
    } finally {
      setCarregando(false);
    }
  };

  if (loadingViagem)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );

  if (!barcoData || !barcoIdResolvido || !vendasLiberadas) {
    return (
      <View style={[styles.center, { paddingHorizontal: 28 }]}>
        <Ionicons
          name="ticket-outline"
          size={58}
          color="#64748b"
        />
        <Text style={styles.indisponivelTitulo}>
          Venda indisponível
        </Text>
        <Text style={styles.indisponivelTexto}>
          Esta embarcação não está habilitada para vender
          passagens pelo aplicativo.
        </Text>
        <TouchableOpacity
          style={styles.btnVoltar}
          onPress={() => router.back()}
        >
          <Text style={styles.btnVoltarTexto}>
            VOLTAR ÀS VIAGENS
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <Modal visible={modalAviso.visivel} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalFeedback}>
            <Ionicons
              name={modalAviso.icone}
              size={50}
              color={modalAviso.cor}
            />
            <Text style={styles.modalTitle}>{modalAviso.titulo}</Text>
            <Text style={styles.modalSub}>{modalAviso.mensagem}</Text>
            <TouchableOpacity
              style={styles.btnModalClose}
              onPress={() => setModalAviso({ ...modalAviso, visivel: false })}
            >
              <Text style={styles.btnModalCloseText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown} style={styles.cardInfo}>
          <Text style={styles.barcoTitle}>
            🛳️ {barcoData?.nome || viagemData?.nome_barco || "Embarcação"}
          </Text>
          <Text style={styles.rotaText}>
            {origemDesejada} ➔ {destinoDesejado}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.subText}>
            {diaSemanaNome}, {dataViagemParam.split("-").reverse().join("/")} às{" "}
            {horarioEmbarque}
          </Text>
        </Animated.View>

        {dadosPix ? (
          <Animated.View entering={FadeInUp} style={styles.cardPix}>
            <Ionicons
              name={dadosPix?.checkoutUrl ? "shield-checkmark" : "qr-code"}
              size={50}
              color="#10b981"
            />
            <Text style={styles.pixTitle}>
              {dadosPix?.checkoutUrl ? "PAGAMENTO PREPARADO" : "PIX GERADO"}
            </Text>
            <Text style={styles.pixValor}>
              R$ {Number(
                dadosPix?.financeiro?.totalPagoPassageiro ||
                  totalGeral,
              ).toFixed(2)}
            </Text>
            {dadosPix?.checkoutUrl && (
              <Text style={styles.checkoutOrientacao}>
                Conclua o pagamento no ambiente seguro do Mercado Pago. A
                passagem aparecerá somente depois da confirmação.
              </Text>
            )}
            {dadosPix.qr_code_base64 && (
              <Image
                source={{
                  uri: `data:image/png;base64,${dadosPix.qr_code_base64}`,
                }}
                style={styles.qrCode}
              />
            )}
            {dadosPix?.checkoutUrl ? (
              <TouchableOpacity
                style={styles.btnCopy}
                onPress={abrirCheckoutPendente}
              >
                <Ionicons
                  name="open-outline"
                  size={20}
                  color="#0f172a"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.btnCopyText}>ABRIR MERCADO PAGO</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.btnCopy,
                  foiCopiado && { backgroundColor: "#10b981" },
                ]}
                onPress={() => {
                  if (!dadosPix?.qr_code_copia_cola) {
                    exibirAviso(
                      "Pix indisponível",
                      "O código Pix ainda não foi carregado.",
                      "aviso",
                    );
                    return;
                  }

                  Clipboard.setStringAsync(dadosPix.qr_code_copia_cola);
                  setFoiCopiado(true);
                  setTimeout(() => {
                    if (mountedRef.current) setFoiCopiado(false);
                  }, 3000);
                }}
              >
                <Ionicons
                  name={foiCopiado ? "checkmark-circle" : "copy-outline"}
                  size={20}
                  color={foiCopiado ? "#fff" : "#0f172a"}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[styles.btnCopyText, foiCopiado && { color: "#fff" }]}
                >
                  {foiCopiado ? "CÓDIGO COPIADO!" : "COPIAR CÓDIGO PIX"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.btnVerificar}
              onPress={verificarManual}
              disabled={verificando}
            >
              {verificando ? (
                <ActivityIndicator color="#38bdf8" />
              ) : (
                <Text style={styles.btnVerificarText}>
                  CONSULTAR CONFIRMAÇÃO
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>1. Tipo de Acomodação</Text>
            <View style={styles.rowOptions}>
              {["rede", "poltrona", "suite"].map((tipo) => (
                <TouchableOpacity
                  key={tipo}
                  style={[
                    styles.optionBtn,
                    tipoAcomodacao === tipo && styles.optionBtnActive,
                  ]}
                  disabled={
                    precosReais[tipo as keyof typeof precosReais] <= 0
                  }
                  onPress={() => setTipoAcomodacao(tipo as any)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      tipoAcomodacao === tipo && { color: "#38bdf8" },
                    ]}
                  >
                    {tipo.toUpperCase()}
                  </Text>
                  <Text style={styles.optionPrice}>
                    {precosReais[tipo as keyof typeof precosReais] > 0
                      ? "R$ " +
                        calcularTotalFinalPorAcomodacao(
                          tipo as keyof typeof precosReais,
                        ).toFixed(2)
                      : "INDISPONÍVEL"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.sectionTitle}>2. Incluir Refeição?</Text>
            <View style={styles.rowOptions}>
              <TouchableOpacity
                style={[
                  styles.optionBtn,
                  !incluiRefeicao && styles.optionBtnActive,
                ]}
                onPress={() => setIncluiRefeicao(false)}
              >
                <Text style={styles.optionPrice}>Não</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionBtn,
                  incluiRefeicao && styles.optionBtnActive,
                ]}
                onPress={() => setIncluiRefeicao(true)}
              >
                <Text style={styles.optionPrice}>
                  Sim (+ R$ {taxaRefeicao.toFixed(2)})
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionTitle}>3. Dados dos Passageiros</Text>

            <View style={styles.avisoPrivacidade}>
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color="#38bdf8"
              />
              <Text style={styles.avisoPrivacidadeTexto}>
                CPF e nascimento são usados nesta compra para validação. No
                registro da passagem, o CPF fica mascarado e a data de
                nascimento completa não é salva pelo app.
              </Text>
            </View>

            <View
              style={[
                styles.perfilCidadeBox,
                !perfilComCidadeCompleta && styles.perfilCidadeBoxAlerta,
              ]}
            >
              <Ionicons
                name={perfilComCidadeCompleta ? "location" : "warning-outline"}
                size={19}
                color={perfilComCidadeCompleta ? "#10b981" : "#fbbf24"}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.perfilCidadeTitulo}>
                  {perfilComCidadeCompleta
                    ? "Cidade do comprador"
                    : "Complete seu perfil"}
                </Text>
                <Text style={styles.perfilCidadeTexto}>
                  {carregandoPerfilComprador
                    ? "Carregando cidade do comprador..."
                    : perfilComCidadeCompleta
                      ? compradorCidadeResidenciaCompleta
                      : "Informe sua cidade e estado em Meus Dados para continuar a compra."}
                </Text>
              </View>
              {!perfilComCidadeCompleta && !carregandoPerfilComprador && (
                <TouchableOpacity
                  style={styles.btnCompletarPerfil}
                  onPress={() => router.push("/dados-passageiro" as any)}
                >
                  <Text style={styles.btnCompletarPerfilTexto}>ABRIR</Text>
                </TouchableOpacity>
              )}
            </View>

            {passageiros.map((p, index) => (
              <Animated.View
                key={p.id}
                layout={Layout.springify()}
                entering={FadeInDown.delay(index * 100)}
                style={styles.cardPassageiro}
              >
                <View style={styles.headerPass}>
                  <Text style={styles.passNum}>Passageiro {index + 1}</Text>
                  {passageiros.length > 1 && (
                    <TouchableOpacity onPress={() => removerPassageiro(p.id)}>
                      <Ionicons name="close-circle" size={26} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Nome Completo"
                  value={p.nome}
                  onChangeText={(v) => {
                    const n = [...passageiros];
                    n[index].nome = v;
                    setPassageiros(n);
                  }}
                  placeholderTextColor="#64748b"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Nacionalidade"
                  value={p.nacionalidade}
                  onChangeText={(v) => {
                    const n = [...passageiros];
                    n[index].nacionalidade = v;
                    setPassageiros(n);
                  }}
                  placeholderTextColor="#64748b"
                />
                <TextInput
                  style={styles.input}
                  placeholder="CPF"
                  keyboardType="numeric"
                  value={p.documento}
                  onChangeText={(v) => {
                    const n = [...passageiros];
                    n[index].documento = formatarCPF(v);
                    setPassageiros(n);
                  }}
                  placeholderTextColor="#64748b"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Nascimento (DD/MM/AAAA)"
                  keyboardType="numeric"
                  value={p.nascimento}
                  onChangeText={(v) => {
                    const formatada = formatarDataInput(v);
                    const n = [...passageiros];
                    n[index].nascimento = formatada;
                    setPassageiros(n);
                    if (formatada.length === 10) Keyboard.dismiss();
                  }}
                  placeholderTextColor="#64748b"
                />

                {beneficiosDisponiveis.length > 0 && (
                  <View style={styles.beneficioBox}>
                    <Text style={styles.beneficioTitulo}>TIPO DE PASSAGEM</Text>
                    <Text style={styles.beneficioAjuda}>
                      Escolha tarifa integral ou um benefício disponível para este trecho.
                    </Text>
                    <View style={styles.beneficioOpcoes}>
                      {[
                        { id: "integral", nome: "Tarifa integral", modo: "integral", valor: 0 },
                        ...beneficiosDisponiveis,
                      ].map((beneficio) => {
                        const selecionado = p.beneficioId === beneficio.id;
                        const idade = idadePelaDataNascimento(p.nascimento);
                        const indisponivelPorIdade =
                          beneficio.id !== "integral" &&
                          idade !== null &&
                          !idadeAtendeBeneficio(idade, beneficio);
                        const regraIdade = textoRegraIdade(beneficio);
                        return (
                          <TouchableOpacity
                            key={beneficio.id}
                            disabled={indisponivelPorIdade}
                            style={[
                              styles.beneficioOpcao,
                              selecionado && styles.beneficioOpcaoAtiva,
                              indisponivelPorIdade && styles.beneficioOpcaoDesabilitada,
                            ]}
                            onPress={() => {
                              const n = [...passageiros];
                              n[index].beneficioId = beneficio.id;
                              n[index].aceiteComprovacao = beneficio.id === "integral";
                              setPassageiros(n);
                            }}
                          >
                            <Ionicons
                              name={selecionado ? "radio-button-on" : "radio-button-off"}
                              size={17}
                              color={selecionado ? "#38bdf8" : "#64748b"}
                            />
                            <Text
                              style={[
                                styles.beneficioOpcaoTexto,
                                selecionado && styles.beneficioOpcaoTextoAtivo,
                              ]}
                            >
                              {beneficio.nome}
                              {regraIdade ? ` (${regraIdade})` : ""}
                              {beneficio.modo === "gratuidade"
                                ? " — gratuidade"
                                : beneficio.modo === "valor_fixo"
                                  ? ` — tarifa de R$ ${Number(beneficio.valor || 0).toFixed(2)}`
                                  : beneficio.modo === "desconto_percentual"
                                    ? ` — ${Number(beneficio.valor || 0)}% de desconto`
                                    : ""}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {p.beneficioId !== "integral" && (
                      <>
                        {beneficiosDisponiveis.find(
                          (item) => item.id === p.beneficioId,
                        )?.exigeComprovante && (
                          <TouchableOpacity
                            style={styles.comprovacaoLinha}
                            onPress={() => {
                              const n = [...passageiros];
                              n[index].aceiteComprovacao = !n[index].aceiteComprovacao;
                              setPassageiros(n);
                            }}
                          >
                            <Ionicons
                              name={p.aceiteComprovacao ? "checkbox" : "square-outline"}
                              size={21}
                              color={p.aceiteComprovacao ? "#10b981" : "#94a3b8"}
                            />
                            <Text style={styles.comprovacaoTexto}>
                              Confirmo que o passageiro apresentará o documento comprobatório no embarque.
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!!beneficiosDisponiveis.find(
                          (item) => item.id === p.beneficioId,
                        )?.observacao && (
                          <Text style={styles.beneficioAjuda}>
                            {
                              beneficiosDisponiveis.find(
                                (item) => item.id === p.beneficioId,
                              )?.observacao
                            }
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                )}
              </Animated.View>
            ))}
            <TouchableOpacity
              style={styles.btnAdd}
              onPress={() =>
                setPassageiros([
                  ...passageiros,
                  {
                    id: Date.now(),
                    nome: "",
                    documento: "",
                    nacionalidade: "Brasileira",
                    nascimento: "",
                    beneficioId: "integral",
                    aceiteComprovacao: false,
                  },
                ])
              }
            >
              <Ionicons name="person-add" size={18} color="#38bdf8" />
              <Text style={styles.btnAddText}>ADICIONAR OUTRO PASSAGEIRO</Text>
            </TouchableOpacity>
            <View style={styles.cardTotal}>
              <Text style={styles.totalLabel}>
                VALOR FINAL DA COMPRA
              </Text>
              <Text style={styles.totalValue}>
                R$ {totalGeral.toFixed(2)}
              </Text>
              <Text style={styles.totalAviso}>
                O valor oficial será validado no servidor antes
                da abertura do Mercado Pago.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.btnFinalizar,
                vendaForaDoPrazo() &&
                  styles.btnFinalizarDesativado,
              ]}
              onPress={handleGerarPix}
              disabled={carregando || vendaForaDoPrazo()}
            >
              {carregando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnFinalizarText}>
                  {vendaForaDoPrazo()
                    ? "VENDAS ENCERRADAS"
                    : "CONTINUAR PARA PAGAMENTO"}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", paddingHorizontal: 20 },
  center: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  indisponivelTitulo: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 18,
  },
  indisponivelTexto: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  btnVoltar: {
    marginTop: 24,
    backgroundColor: "#38bdf8",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnVoltarTexto: {
    color: "#082f49",
    fontSize: 12,
    fontWeight: "900",
  },
  cardInfo: {
    backgroundColor: "#0f172a",
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  barcoTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  rotaText: {
    color: "#38bdf8",
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 5,
  },
  divider: { height: 1, backgroundColor: "#1e293b", marginVertical: 12 },
  subText: { color: "#94a3b8", fontSize: 13 },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 15,
    marginTop: 10,
    letterSpacing: 1,
  },
  avisoPrivacidade: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  avisoPrivacidadeTexto: {
    flex: 1,
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 17,
  },
  perfilCidadeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  perfilCidadeBoxAlerta: {
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderColor: "rgba(251, 191, 36, 0.35)",
  },
  perfilCidadeTitulo: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 2,
  },
  perfilCidadeTexto: {
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 15,
  },
  btnCompletarPerfil: {
    backgroundColor: "#fbbf24",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  btnCompletarPerfilTexto: {
    color: "#020617",
    fontSize: 10,
    fontWeight: "900",
  },
  rowOptions: { flexDirection: "row", gap: 10, marginBottom: 20 },
  optionBtn: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
  },
  optionBtnActive: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.05)",
  },
  optionLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 5,
  },
  optionPrice: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  cardPassageiro: {
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  headerPass: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  passNum: { color: "#38bdf8", fontSize: 11, fontWeight: "bold" },
  input: {
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: 12,
    color: "#fff",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  beneficioBox: {
    marginTop: 4,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
  },
  beneficioTitulo: { color: "#38bdf8", fontSize: 10, fontWeight: "900" },
  beneficioAjuda: { color: "#94a3b8", fontSize: 11, lineHeight: 16, marginTop: 4 },
  beneficioOpcoes: { gap: 7, marginTop: 10 },
  beneficioOpcao: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  beneficioOpcaoAtiva: { borderColor: "#38bdf8", backgroundColor: "#0c4a6e" },
  beneficioOpcaoDesabilitada: { opacity: 0.42 },
  beneficioOpcaoTexto: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  beneficioOpcaoTextoAtivo: { color: "#e0f2fe" },
  comprovacaoLinha: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  comprovacaoTexto: { flex: 1, color: "#cbd5e1", fontSize: 11, lineHeight: 16 },
  btnAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 15,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#38bdf8",
    borderRadius: 12,
    marginBottom: 20,
  },
  btnAddText: { color: "#38bdf8", fontSize: 12, fontWeight: "bold" },
  cardTotal: {
    backgroundColor: "#0f172a",
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 20,
    borderLeftWidth: 5,
    borderLeftColor: "#10b981",
  },
  linhaResumo: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  resumoLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  resumoValor: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "800",
  },
  resumoDivisor: {
    width: "100%",
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 10,
  },
  totalLabel: { color: "#64748b", fontSize: 10, fontWeight: "bold" },
  totalValue: {
    color: "#10b981",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 5,
  },
  totalAviso: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 8,
  },
  btnFinalizar: {
    backgroundColor: "#10b981",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
  },
  btnFinalizarDesativado: {
    backgroundColor: "#475569",
  },
  btnFinalizarText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  cardPix: {
    backgroundColor: "#0f172a",
    padding: 30,
    borderRadius: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  pixTitle: {
    color: "#10b981",
    fontWeight: "bold",
    fontSize: 18,
    marginTop: 15,
  },
  pixValor: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 15,
  },
  checkoutOrientacao: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 20,
  },
  qrCode: { width: 220, height: 220, borderRadius: 15, marginBottom: 20 },
  btnCopy: {
    backgroundColor: "#38bdf8",
    width: "100%",
    padding: 18,
    borderRadius: 15,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  btnCopyText: { color: "#0f172a", fontWeight: "bold" },
  btnVerificar: { marginTop: 20, padding: 10 },
  btnVerificarText: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "bold",
    textDecorationLine: "underline",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.98)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  modalFeedback: {
    backgroundColor: "#0f172a",
    padding: 30,
    borderRadius: 30,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
  },
  modalSub: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 25,
  },
  btnModalClose: {
    backgroundColor: "#1e293b",
    width: "100%",
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 10,
  },
  btnModalCloseText: { color: "#38bdf8", fontWeight: "bold" },
});
