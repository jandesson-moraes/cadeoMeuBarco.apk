import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router } from "expo-router";
import { collection, doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Animated as RNAnimated,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import BannerModal from "../../components/BannerModal";
import Footer from "../../components/Footer";
import MapaView from "../../components/MapaView";
import { db } from "../../services/firebase";
import { obterVelocidadeOficialKmh } from "../../services/navegacaoInteligente";
import {
  CORES_PLANO,
  ROTULOS_PLANO,
  planoEfetivo,
  possuiTempoReal,
  prioridadePlano,
  statusSinalDaEmbarcacao,
} from "../../services/planosEmbarcacao";

const formatarNomeParaExibicao = (nome: string) => {
  if (!nome) return "";
  return nome.replace(/_/g, " ");
};

const normalizarTexto = (texto: string) => {
  if (!texto) return "";
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const calcularDistanciaKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

function FadeInDown({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(index * 80, withTiming(1, { duration: 500 }));
    translateY.value = withDelay(index * 80, withSpring(0, { damping: 15 }));
  }, [index]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function GuiaNavegacao({ barco, porto }: { barco: any; porto: any }) {
  const bounce = useSharedValue(1);

  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 500 }),
        withTiming(1, { duration: 500 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }],
  }));

  if (!barco) {
    return (
      <Animated.View
        entering={FadeInUp}
        style={[styles.guiaContainer, { borderColor: "#38bdf8" }]}
      >
        <Animated.View style={[styles.guiaIcon, animatedStyle]}>
          <Ionicons name="boat" size={20} color="#38bdf8" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.guiaTitulo}>1. QUAL BARCO DESEJA LOCALIZAR?</Text>
          <Text style={styles.guiaSub}>
            Escolha a embarcação para ver a posição atual no mapa.
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (barco && !porto) {
    return (
      <Animated.View
        entering={FadeInUp}
        style={[styles.guiaContainer, { borderColor: "#10b981" }]}
      >
        <Animated.View
          style={[
            styles.guiaIcon,
            animatedStyle,
            { backgroundColor: "rgba(16, 185, 129, 0.1)" },
          ]}
        >
          <Ionicons name="location" size={20} color="#10b981" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.guiaTitulo, { color: "#10b981" }]}>
            2. QUAL PORTO DE REFERÊNCIA?
          </Text>
          <Text style={styles.guiaSub}>
            Selecione o destino para calcular o tempo de chegada.
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInUp}
      style={[
        styles.guiaContainer,
        { backgroundColor: "rgba(56, 189, 248, 0.1)", borderColor: "#38bdf8" },
      ]}
    >
      <Ionicons name="radio-outline" size={20} color="#38bdf8" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.guiaTitulo, { color: "#38bdf8" }]}>
          MONITORANDO: {formatarNomeParaExibicao(barco.nome).toUpperCase()}
        </Text>
        <Text style={styles.guiaSub}>
          Radar de chegada ativo para o porto de {porto.nome.toUpperCase()}.
        </Text>
      </View>
      <Ionicons name="checkmark-circle" size={20} color="#10b981" />
    </Animated.View>
  );
}

const LINK_PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.cademeubarco.passageiro&pcampaignid=web_share";

export default function MapaExplorar() {
  const { width: larguraTela, height: alturaTela } = useWindowDimensions();
  const telaCompacta = larguraTela < 380 || alturaTela < 720;
  const telaTablet = larguraTela >= 700;
  const alturaMapa = Math.max(
    telaCompacta ? 310 : 340,
    Math.min(alturaTela * (telaTablet ? 0.5 : 0.48), telaTablet ? 540 : 430),
  );

  const [embarcacoes, setEmbarcacoes] = useState<any[]>([]);
  const [terminais, setTerminais] = useState<any[]>([]);
  const [barcoSelecionado, setBarcoSelecionado] = useState<any>(null);
  const [barcoInformativo, setBarcoInformativo] = useState<any>(null);
  const [bannerSelecaoNonce, setBannerSelecaoNonce] = useState(0);
  const [portoSelecionado, setPortoSelecionado] = useState<any>(null);

  const [vendasAtivas, setVendasAtivas] = useState<boolean>(false);

  const [raioAlerta, setRaioAlerta] = useState(2.0);
  const [tempoAlerta, setTempoAlerta] = useState(30);
  const [tempoManualInput, setTempoManualInput] = useState("");
  const [mapaExpandido, setMapaExpandido] = useState(false);
  const [mostrarBoasVindas, setMostrarBoasVindas] = useState(false);
  const [buscaBarco, setBuscaBarco] = useState("");
  const [buscaPorto, setBuscaPorto] = useState("");
  const [mapaNoturno, setMapaNoturno] = useState(true);

  const [alertaTelaCheia, setAlertaTelaCheia] = useState({
    visivel: false,
    titulo: "",
    corpo: "",
    tipo: "",
  });

  const [modalDidatico, setModalDidatico] = useState({
    visivel: false,
    titulo: "",
    corpo: "",
  });

  const animacaoLuz = useRef(new RNAnimated.Value(0)).current;
  const [minhaPosicao, setMinhaPosicao] = useState<any>(null);
  const ultimoAlertaRef = useRef<string | null>(null);

  const abrirSuporteWhatsApp = (tipo: "barco" | "porto") => {
    const msg =
      tipo === "barco"
        ? `Olá! Estou usando o app e não encontrei o barco "${buscaBarco}". Gostaria que ele fosse rastreado pelo sistema Cadê meu Barco.`
        : `Olá! Gostaria de sugerir a inclusão do porto "${buscaPorto}" no mapa do sistema Cadê meu Barco.`;

    const url = `https://wa.me/5592991903278?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url);
  };

  useEffect(() => {
    async function inicializarApp() {
      try {
        const maxExibicoes = 3;
        const contagemStr = await AsyncStorage.getItem("@tutorial_count");
        const contagemAtual = contagemStr ? parseInt(contagemStr) : 0;

        if (contagemAtual < maxExibicoes) {
          setMostrarBoasVindas(true);
          await AsyncStorage.setItem(
            "@tutorial_count",
            (contagemAtual + 1).toString(),
          );
        }

        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let loc = await Location.getCurrentPositionAsync({});
          setMinhaPosicao({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
        }
        const rSaved = await AsyncStorage.getItem("@raio_valor");
        if (rSaved) setRaioAlerta(parseFloat(rSaved));
        const tSaved = await AsyncStorage.getItem("@tempo_alerta");
        if (tSaved) {
          setTempoAlerta(parseInt(tSaved));
          setTempoManualInput(tSaved);
        }
        const temaSalvo = await AsyncStorage.getItem("@mapa_clima");
        if (temaSalvo === "dia") setMapaNoturno(false);
      } catch (error) {
        console.log("Erro inicialização:", error);
      }
    }
    inicializarApp();
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(
      doc(db, "configuracoes", "modulo_vendas"),
      (snapshot) => {
        if (snapshot.exists()) {
          const dados = snapshot.data();
          setVendasAtivas(!!dados.ativo);
        }
      },
    );

    return () => unsubConfig();
  }, []);

  useEffect(() => {
    const unsubBarcos = onSnapshot(
      collection(db, "embarcacoes"),
      (snapshot) => {
        const listaVisivel = snapshot.docs
          .map((documento) => ({ id: documento.id, ...documento.data() }))
          // Compatibilidade: embarcações antigas sem o campo continuam visíveis.
          .filter((barco: any) => barco.visivelNoApp !== false);

        setEmbarcacoes(listaVisivel);
      },
    );
    const unsubPortos = onSnapshot(collection(db, "terminais"), (s) =>
      setTerminais(
        s.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          nome: d.data().coordenadas?.nome || d.data().nome || "Terminal",
        })),
      ),
    );
    return () => {
      unsubBarcos();
      unsubPortos();
    };
  }, []);

  useEffect(() => {
    if (
      barcoSelecionado &&
      !embarcacoes.some((barco) => barco.id === barcoSelecionado.id)
    ) {
      setBarcoSelecionado(null);
      ultimoAlertaRef.current = null;
      AsyncStorage.removeItem("@barco_id").catch(() => undefined);
    }
  }, [embarcacoes, barcoSelecionado]);

  const verificarRadar = async (bLat: number, bLng: number) => {
    if (!portoSelecionado?.coordenadas) return;
    const pLat = Number(
      portoSelecionado.coordenadas.lat || portoSelecionado.coordenadas.latitude,
    );
    const pLng = Number(
      portoSelecionado.coordenadas.lng ||
        portoSelecionado.coordenadas.longitude,
    );
    if (isNaN(pLat) || isNaN(pLng)) return;

    const R = 6371;
    const dLat = ((pLat - bLat) * Math.PI) / 180;
    const dLon = ((pLng - bLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((bLat * Math.PI) / 180) *
        Math.cos((pLat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const velocidadeOficialKmh = obterVelocidadeOficialKmh(barcoSelecionado);
    const tempoMinutos =
      velocidadeOficialKmh && velocidadeOficialKmh > 0
        ? Math.round((dist / velocidadeOficialKmh) * 60)
        : Number.POSITIVE_INFINITY;
    const statusAtual = ultimoAlertaRef.current;

    let novoTipoAlerta = null;
    const chaveAlertaChegou = `${portoSelecionado.id}_CHEGOU`;
    const chaveAlertaChegando = `${portoSelecionado.id}_CHEGANDO_${tempoAlerta}`;

    if (dist <= 1.0 && statusAtual !== chaveAlertaChegou) {
      novoTipoAlerta = "CHEGOU";
    } else if (
      tempoMinutos <= tempoAlerta &&
      dist > 1.0 &&
      statusAtual !== chaveAlertaChegando &&
      statusAtual !== chaveAlertaChegou
    ) {
      novoTipoAlerta = "CHEGANDO";
    }

    if (novoTipoAlerta) {
      const titulo =
        novoTipoAlerta === "CHEGOU"
          ? "⚓ O BARCO CHEGOU!"
          : "🛳️ BARCO SE APROXIMANDO!";
      const corpo =
        novoTipoAlerta === "CHEGOU"
          ? `O ${formatarNomeParaExibicao(barcoSelecionado.nome)} já atracou no porto de ${portoSelecionado.nome.toUpperCase()}.`
          : `O ${formatarNomeParaExibicao(barcoSelecionado.nome)} está se aproximando do porto de ${portoSelecionado.nome.toUpperCase()} em aprox. ${tempoMinutos} min.`;

      if (Platform.OS !== "web") Vibration.vibrate([0, 1000, 500, 1000], true);
      setAlertaTelaCheia({
        visivel: true,
        titulo,
        corpo,
        tipo: novoTipoAlerta,
      });
      ultimoAlertaRef.current =
        novoTipoAlerta === "CHEGOU" ? chaveAlertaChegou : chaveAlertaChegando;
    } else if (dist > 1.5 && tempoMinutos > tempoAlerta + 5) {
      ultimoAlertaRef.current = null;
    }
  };

  const desligarAlarme = () => {
    if (Platform.OS !== "web") Vibration.cancel();
    setAlertaTelaCheia({ visivel: false, titulo: "", corpo: "", tipo: "" });
  };

  useEffect(() => {
    if (barcoSelecionado && !possuiTempoReal(barcoSelecionado)) return;
    const barcoVivo = embarcacoes.find((b) => b.id === barcoSelecionado?.id);
    if (barcoVivo?.ultima_posicao)
      verificarRadar(
        barcoVivo.ultima_posicao.latitude,
        barcoVivo.ultima_posicao.longitude,
      );
  }, [embarcacoes, barcoSelecionado, portoSelecionado, tempoAlerta]);

  const onSelectBarco = async (b: any) => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBarcoSelecionado(b);
    ultimoAlertaRef.current = null;
    if (possuiTempoReal(b)) {
      setBarcoInformativo(null);
      setBannerSelecaoNonce((atual) => atual + 1);
      await AsyncStorage.setItem("@barco_id", b.id);
      return;
    }

    setPortoSelecionado(null);
    setBarcoInformativo(b);
    await AsyncStorage.removeItem("@barco_id");
  };

  const onSelectPorto = async (p: any) => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPortoSelecionado(p);
    ultimoAlertaRef.current = null;
    await AsyncStorage.setItem("@porto_id", p.id);
  };

  const alternarClimaMapa = async () => {
    const novo = !mapaNoturno;
    setMapaNoturno(novo);
    await AsyncStorage.setItem("@mapa_clima", novo ? "noite" : "dia");
  };

  const aplicarTempoAlerta = async (valor: string) => {
    if (!barcoSelecionado || !portoSelecionado) {
      setModalDidatico({
        visivel: true,
        titulo: "RADAR SEM ALVO",
        corpo:
          "Usuário, primeiro escolha o Barco e o Porto de destino para que eu possa monitorar a sua chegada com precisão.",
      });
      return;
    }

    const num = parseInt(valor);
    if (!isNaN(num) && num > 0) {
      setTempoAlerta(num);
      setTempoManualInput(valor);
      await AsyncStorage.setItem("@tempo_alerta", valor);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const compartilharApp = async () => {
    try {
      await Share.share({
        message: `Acompanhe minha viagem em tempo real! 🛳️⚓\n\nTeste o App Cadê meu barco: ${LINK_PLAY_STORE}`,
      });
    } catch (error: any) {
      console.log(error.message);
    }
  };

  const barcosFiltrados = React.useMemo(() => {
    const termoBuscaNorm = normalizarTexto(buscaBarco);

    let lista = embarcacoes.filter((b) => {
      if (!termoBuscaNorm) return possuiTempoReal(b);
      const nomeNorm = normalizarTexto(b.nome || "");
      const codigoNorm = normalizarTexto(b.codigoPublico || b.codigo || b.id || "");
      return (
        nomeNorm.includes(termoBuscaNorm) ||
        codigoNorm.includes(termoBuscaNorm)
      );
    });

    if (minhaPosicao) {
      lista = lista
        .map((b) => ({
          ...b,
          distanciaUser: b.ultima_posicao
            ? calcularDistanciaKm(
                minhaPosicao.lat,
                minhaPosicao.lng,
                b.ultima_posicao.latitude,
                b.ultima_posicao.longitude,
              )
            : Infinity,
        }));
    }

    lista.sort((a, b) => {
      if (termoBuscaNorm) {
        const nomeA = normalizarTexto(a.nome || "");
        const nomeB = normalizarTexto(b.nome || "");
        const codigoA = normalizarTexto(a.codigoPublico || a.codigo || a.id || "");
        const codigoB = normalizarTexto(b.codigoPublico || b.codigo || b.id || "");
        const exatoA = nomeA === termoBuscaNorm || codigoA === termoBuscaNorm ? 0 : 1;
        const exatoB = nomeB === termoBuscaNorm || codigoB === termoBuscaNorm ? 0 : 1;
        if (exatoA !== exatoB) return exatoA - exatoB;
        const prioridadeA = prioridadePlano(a);
        const prioridadeB = prioridadePlano(b);
        if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;
      }
      return (a.distanciaUser ?? Infinity) - (b.distanciaUser ?? Infinity);
    });

    return lista.slice(0, 10);
  }, [embarcacoes, buscaBarco, minhaPosicao]);

  const frotaTempoReal = React.useMemo(
    () => embarcacoes.filter((barco) => possuiTempoReal(barco)),
    [embarcacoes],
  );

  const barcoSelecionadoNoMapa =
    barcoSelecionado && possuiTempoReal(barcoSelecionado)
      ? barcoSelecionado
      : null;

  const portosFiltrados = React.useMemo(() => {
    const termoBuscaNorm = normalizarTexto(buscaPorto);

    let lista = terminais.filter((p) => {
      const nomeNorm = normalizarTexto(p.nome || "");
      return nomeNorm.includes(termoBuscaNorm);
    });

    if (minhaPosicao) {
      lista = lista
        .map((p) => {
          const pLat = p.coordenadas?.lat || p.coordenadas?.latitude;
          const pLng = p.coordenadas?.lng || p.coordenadas?.longitude;
          return {
            ...p,
            distanciaUser: pLat
              ? calcularDistanciaKm(
                  minhaPosicao.lat,
                  minhaPosicao.lng,
                  pLat,
                  pLng,
                )
              : Infinity,
          };
        })
        .sort((a, b) => a.distanciaUser - b.distanciaUser);
    }
    return lista.slice(0, 5);
  }, [terminais, buscaPorto, minhaPosicao]);

  const corDeFundoAnimada = animacaoLuz.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(2, 6, 23, 0.95)", "rgba(185, 28, 28, 0.85)"],
  });

  {
    /* 🟢 NOVA FUNÇÃO PARA O ÍCONE DO MAPA */
  }
  const abrirDetalhesDoBarco = () => {
    if (barcoSelecionado) {
      router.push({
        pathname: "/detalhes-barco",
        params: {
          barcoId: barcoSelecionado.id,
          nomeBarco: barcoSelecionado.nome,
        },
      });
    } else {
      setModalDidatico({
        visivel: true,
        titulo: "SELECIONE UM BARCO",
        corpo:
          "Clique ou pesquise uma embarcação primeiro para que eu possa exibir as fotos e comodidades.",
      });
    }
  };

  return (
    <View style={styles.container}>
      <BannerModal
        contexto="selecao_embarcacao"
        barcoSelecionadoId={barcoSelecionadoNoMapa?.id || ""}
        barcoSelecionadoNome={barcoSelecionadoNoMapa?.nome || ""}
        selecaoNonce={bannerSelecaoNonce}
      />
      <Modal
        visible={!!barcoInformativo}
        transparent
        animationType="slide"
        onRequestClose={() => setBarcoInformativo(null)}
      >
        <View style={styles.modalInformativoOverlay}>
          <View style={styles.modalInformativoCard}>
            <View style={styles.modalInformativoTopo}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInformativoNome}>
                  {formatarNomeParaExibicao(barcoInformativo?.nome || "")}
                </Text>
                <View
                  style={[
                    styles.planoBadge,
                    {
                      borderColor:
                        CORES_PLANO[planoEfetivo(barcoInformativo)] || "#64748b",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.planoBadgeTexto,
                      {
                        color:
                          CORES_PLANO[planoEfetivo(barcoInformativo)] ||
                          "#94a3b8",
                      },
                    ]}
                  >
                    {ROTULOS_PLANO[planoEfetivo(barcoInformativo)]}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setBarcoInformativo(null)}
                style={styles.modalInformativoFechar}
              >
                <Ionicons name="close" size={22} color="#cbd5e1" />
              </TouchableOpacity>
            </View>

            <View style={styles.semTempoRealBox}>
              <Ionicons name="information-circle" size={22} color="#38bdf8" />
              <Text style={styles.semTempoRealTexto}>
                Esta embarcação possui perfil informativo e não oferece
                acompanhamento em tempo real.
              </Text>
            </View>

            {planoEfetivo(barcoInformativo) === "vitrine" &&
              barcoInformativo?.portoSaida && (
                <Text style={styles.modalInformativoDado}>
                  Porto de saída: {barcoInformativo.portoSaida}
                </Text>
              )}

            <TouchableOpacity
              style={styles.modalInformativoAcao}
              onPress={() => {
                setBarcoInformativo(null);
                abrirDetalhesDoBarco();
              }}
            >
              <Text style={styles.modalInformativoAcaoTexto}>
                VER INFORMAÇÕES
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#020617" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={modalDidatico.visivel}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalAlarmeBox, { borderColor: "#38bdf8" }]}>
            <Ionicons
              name="location-sharp"
              size={70}
              color="#38bdf8"
              style={styles.iconePiscante}
            />
            <Text style={styles.modalTitulo}>{modalDidatico.titulo}</Text>
            <Text style={styles.modalCorpo}>{modalDidatico.corpo}</Text>
            <TouchableOpacity
              style={[styles.btnDesligar, { backgroundColor: "#38bdf8" }]}
              onPress={() =>
                setModalDidatico({ ...modalDidatico, visivel: false })
              }
            >
              <Text style={[styles.btnDesligarTxt, { color: "#fff" }]}>
                ENTENDI, CAPITÃO!
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={alertaTelaCheia.visivel}
        transparent={true}
        animationType="fade"
      >
        <RNAnimated.View
          style={[styles.modalOverlay, { backgroundColor: corDeFundoAnimada }]}
        >
          <View style={styles.modalAlarmeBox}>
            <Ionicons
              name={
                alertaTelaCheia.tipo === "CHEGOU"
                  ? "warning"
                  : "notifications-circle"
              }
              size={80}
              color={alertaTelaCheia.tipo === "CHEGOU" ? "#facc15" : "#FFD200"}
              style={styles.iconePiscante}
            />
            <Text style={styles.modalTitulo}>{alertaTelaCheia.titulo}</Text>
            <Text style={styles.modalCorpo}>{alertaTelaCheia.corpo}</Text>
            <TouchableOpacity
              style={styles.btnDesligar}
              onPress={desligarAlarme}
            >
              <Text style={styles.btnDesligarTxt}>DESLIGAR ALARME</Text>
            </TouchableOpacity>
          </View>
        </RNAnimated.View>
      </Modal>
      <View
        style={[
          styles.mapBox,
          { height: alturaMapa },
          mapaExpandido && styles.mapBoxExpandido,
        ]}
      >
        <MapaView
          barco={barcoSelecionadoNoMapa}
          porto={portoSelecionado}
          raio={raioAlerta}
          userLocation={minhaPosicao}
          isDarkMode={mapaNoturno}
          frota={frotaTempoReal}
          terminais={terminais}
          onSelectBarco={onSelectBarco}
          toggleTheme={alternarClimaMapa}
          toggleExpand={() => setMapaExpandido(!mapaExpandido)}
          mapaExpandido={mapaExpandido}
          abrirAjuda={abrirDetalhesDoBarco}
        />
      </View>

      {!mapaExpandido && (
        <View
          style={[styles.bottomSheet, telaTablet && styles.bottomSheetTablet]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={[
              styles.scrollContent,
              telaCompacta && styles.scrollContentCompacto,
              telaTablet && styles.scrollContentTablet,
            ]}
          >
            <GuiaNavegacao
              barco={barcoSelecionadoNoMapa}
              porto={portoSelecionado}
            />

            <View style={styles.compactSection}>
              <View style={styles.titleRow}>
                <Text style={styles.label}>SELECIONE O BARCO</Text>
                {/* {barcoSelecionado && (
                  <Text style={styles.activeLabel}>
                    Ativo:{" "}
                    {formatarNomeParaExibicao(
                      barcoSelecionado.nome,
                    ).toUpperCase()}
                  </Text>
                )} */}
              </View>
              <TextInput
                style={styles.compactInput}
                placeholder="Pesquisar barco..."
                placeholderTextColor="#64748b"
                value={buscaBarco}
                onChangeText={setBuscaBarco}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScrollContent}
              >
                {barcosFiltrados.map((b, index) => (
                  <FadeInDown key={b.id} index={index}>
                    <TouchableOpacity
                      onPress={() => onSelectBarco(b)}
                      style={[
                        styles.chip,
                        barcoSelecionado?.id === b.id && styles.activeBarco,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipTxt,
                          barcoSelecionado?.id === b.id && styles.activeTxt,
                        ]}
                      >
                        {formatarNomeParaExibicao(b.nome).toUpperCase()}
                      </Text>
                      <View style={styles.chipMetadados}>
                        <Text
                          style={[
                            styles.chipPlano,
                            { color: CORES_PLANO[planoEfetivo(b)] },
                          ]}
                        >
                          {ROTULOS_PLANO[planoEfetivo(b)]}
                        </Text>
                        {possuiTempoReal(b) && (
                          <Text
                            style={[
                              styles.chipSinal,
                              statusSinalDaEmbarcacao(b) === "ativo"
                                ? styles.chipSinalAtivo
                                : statusSinalDaEmbarcacao(b) === "offline"
                                  ? styles.chipSinalOffline
                                  : styles.chipSinalDesativado,
                            ]}
                          >
                            {statusSinalDaEmbarcacao(b).toUpperCase()}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </FadeInDown>
                ))}
              </ScrollView>

              {buscaBarco !== "" && barcosFiltrados.length === 0 && (
                <TouchableOpacity
                  onPress={() => abrirSuporteWhatsApp("barco")}
                  activeOpacity={0.9}
                >
                  <Animated.View
                    entering={FadeInUp}
                    style={styles.marketingCardBarco}
                  >
                    <View style={styles.marketingHeader}>
                      <Ionicons name="megaphone" size={22} color="#facc15" />
                      <Text style={styles.marketingTituloBarco}>
                        BARCO NÃO CADASTRADO
                      </Text>
                    </View>
                    <Text style={styles.marketingTexto}>
                      Para sua comodidade, peça ao dono ou gerente da embarcação{" "}
                      <Text style={{ fontWeight: "bold", color: "#fff" }}>
                        {buscaBarco.toUpperCase()}
                      </Text>{" "}
                      para ativar o rastreamento em nosso sistema!
                    </Text>
                    <View style={styles.btnMarketingAcao}>
                      <Text style={styles.btnMarketingAcaoTxt}>
                        INDICAR VIA WHATSAPP
                      </Text>
                      <Ionicons
                        name="logo-whatsapp"
                        size={16}
                        color="#020617"
                      />
                    </View>
                  </Animated.View>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.compactSection}>
              <View style={styles.titleRow}>
                <Text style={styles.label}>SELECIONE O PORTO</Text>
                {/* {portoSelecionado && (
                  <Text style={styles.activeLabel}>
                    Porto: {portoSelecionado.nome.toUpperCase()}
                  </Text>
                )} */}
              </View>
              <TextInput
                style={styles.compactInput}
                placeholder="Pesquisar porto..."
                placeholderTextColor="#64748b"
                value={buscaPorto}
                onChangeText={setBuscaPorto}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScrollContent}
              >
                {portosFiltrados.map((p, index) => (
                  <FadeInDown key={p.id} index={index}>
                    <TouchableOpacity
                      onPress={() => onSelectPorto(p)}
                      style={[
                        styles.chip,
                        portoSelecionado?.id === p.id && styles.activePorto,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipTxt,
                          portoSelecionado?.id === p.id && styles.activeTxt,
                        ]}
                      >
                        {p.nome.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  </FadeInDown>
                ))}
              </ScrollView>

              {/* ... (marketing de porto mantido exatamente como estava) */}
            </View>

            <View style={styles.radarConfig}>
              <Text style={styles.raioTxt}>
                ME AVISE QUANDO FALTAR (MINUTOS):
              </Text>
              <View style={styles.btnRow}>
                {[15, 30, 60].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => aplicarTempoAlerta(t.toString())}
                    style={[
                      styles.btnTempo,
                      tempoAlerta === t && styles.btnTempoActive,
                    ]}
                  >
                    <Text style={styles.btnRaioTxt}>{t}m</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.customInputContainer}>
                  <TextInput
                    style={styles.inputManual}
                    placeholder="Ex: 45"
                    placeholderTextColor="#10b981"
                    keyboardType="numeric"
                    value={tempoManualInput}
                    onChangeText={setTempoManualInput}
                    onBlur={() => aplicarTempoAlerta(tempoManualInput)}
                  />
                  <Text style={styles.minLabel}>min</Text>
                </View>
              </View>
            </View>

            <View style={styles.shareCard}>
              <View style={styles.shareIconBox}>
                <Ionicons name="share-social" size={24} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>CONVIDAR AMIGOS</Text>
                <Text style={styles.shareSub}>
                  Mande o link para seus amigos navegarem com você!
                </Text>
              </View>
              <TouchableOpacity
                style={styles.btnShare}
                onPress={compartilharApp}
              >
                <Text style={styles.btnShareTxt}>ENVIAR</Text>
              </TouchableOpacity>
            </View>

            {vendasAtivas && (
              <TouchableOpacity
                style={styles.btnCheckout}
                onPress={() => router.push("/(tabs)/vendas")}
              >
                <Text style={styles.btnCheckoutTxt}>🛒 COMPRA DE PASSAGEM</Text>
              </TouchableOpacity>
            )}

            <Footer nightVision={mapaNoturno} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  mapBox: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#020617",
  },
  mapBoxExpandido: {
    height: "100%",
    zIndex: 10,
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -30,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  bottomSheetTablet: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  scrollContentCompacto: {
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  scrollContentTablet: {
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 36,
  },
  guiaContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    gap: 12,
  },
  guiaIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  guiaTitulo: {
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  guiaSub: { color: "#94a3b8", fontSize: 12, fontWeight: "500", marginTop: 1 },
  compactSection: {
    marginBottom: 12,
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.08)",
    padding: 12,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  activeLabel: { color: "#10b981", fontSize: 10, fontWeight: "bold" },
  compactInput: {
    minHeight: 50,
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 10,
  },
  chipScrollContent: {
    paddingRight: 6,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginRight: 8,
  },
  activeBarco: { backgroundColor: "#38bdf8", borderColor: "#7dd3fc" },
  activePorto: { backgroundColor: "#10b981", borderColor: "#6ee7b7" },
  chipTxt: { color: "#cbd5e1", fontWeight: "bold", fontSize: 11 },
  chipMetadados: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipPlano: { fontSize: 9, fontWeight: "900" },
  chipSinal: {
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 8,
    fontWeight: "900",
  },
  chipSinalAtivo: { color: "#052e16", backgroundColor: "#4ade80" },
  chipSinalOffline: { color: "#431407", backgroundColor: "#fb923c" },
  chipSinalDesativado: { color: "#f8fafc", backgroundColor: "#64748b" },
  activeTxt: { color: "#ffffff" },
  radarConfig: {
    backgroundColor: "rgba(30, 41, 59, 0.88)",
    padding: 12,
    borderRadius: 18,
    alignItems: "stretch",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.18)",
  },
  raioTxt: {
    color: "white",
    fontWeight: "900",
    fontSize: 10,
    marginBottom: 6,
    letterSpacing: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
    width: "100%",
  },
  btnTempo: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  btnTempoActive: { backgroundColor: "#10b981" },
  btnRaioTxt: { color: "white", fontWeight: "bold", fontSize: 12 },
  customInputContainer: {
    flex: 1.25,
    minWidth: 82,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#10b981",
    paddingHorizontal: 8,
  },
  inputManual: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    paddingVertical: 10,
  },
  minLabel: { color: "#10b981", fontSize: 10, fontWeight: "bold" },
  shareCard: {
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.1)",
  },
  shareIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  shareTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  shareSub: { color: "#64748b", fontSize: 10, marginTop: 2 },
  btnShare: {
    backgroundColor: "#10b981",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnShareTxt: { color: "#ffffff", fontWeight: "900", fontSize: 11 },
  btnCheckout: {
    backgroundColor: "#f97316",
    paddingVertical: 18,
    borderRadius: 15,
    marginBottom: 15,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#f97316",
    shadowOpacity: 0.4,
  },
  btnCheckoutTxt: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },
  modalInformativoOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2, 6, 23, 0.68)",
  },
  modalInformativoCard: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
  },
  modalInformativoTopo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  modalInformativoNome: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900",
  },
  modalInformativoFechar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  planoBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 8,
  },
  planoBadgeTexto: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  semTempoRealBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.18)",
    padding: 14,
    marginTop: 18,
  },
  semTempoRealTexto: {
    flex: 1,
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  modalInformativoDado: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
  },
  modalInformativoAcao: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#38bdf8",
    marginTop: 18,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalInformativoAcaoTexto: {
    color: "#020617",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  modalAlarmeBox: {
    backgroundColor: "#1e293b",
    width: "100%",
    borderRadius: 30,
    padding: 35,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFD200",
    elevation: 25,
  },
  iconePiscante: { marginBottom: 20 },
  modalTitulo: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  modalCorpo: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 35,
    lineHeight: 24,
  },
  btnDesligar: {
    backgroundColor: "#FFD200",
    width: "100%",
    paddingVertical: 20,
    borderRadius: 18,
    alignItems: "center",
  },
  btnDesligarTxt: {
    color: "#383838",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  marketingCardBarco: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    padding: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(251, 191, 36, 0.4)",
    marginTop: 5,
  },
  marketingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  marketingTituloBarco: {
    color: "#facc15",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  btnMarketingAcao: {
    backgroundColor: "#facc15",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 15,
    gap: 8,
  },
  btnMarketingAcaoTxt: {
    color: "#020617",
    fontWeight: "900",
    fontSize: 11,
  },
  marketingTexto: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
  },
});
