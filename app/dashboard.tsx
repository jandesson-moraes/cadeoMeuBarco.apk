import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeInUp,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../services/firebase";

const { width } = Dimensions.get("window");

interface DashboardData {
  receitaTotal: number;
  totalPassageiros: number;
  capacidadeMax: number;
  vagas: {
    rede: number;
    poltrona: number;
    suite: number;
  };
  capacidadeReal: {
    rede: number;
    poltrona: number;
    suite: number;
  };
}

// 🟢 ENGRENAGEM DE ESTÉTICA (Mantida intacta por segurança como fallback)
const formatarNomeViagem = (idRaw: string) => {
  if (!idRaw) return "";
  const partes = idRaw.split("_");

  if (partes.length < 3) return idRaw;

  const dataCrua = partes.pop() || "";
  const sentidoCru = partes.pop() || "";
  const barcoCru = partes.join(" ");

  const barcoFormatado = barcoCru
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const sentidoFormatado =
    sentidoCru.charAt(0).toUpperCase() + sentidoCru.slice(1).toLowerCase();

  let dataFormatada = dataCrua;
  if (dataCrua.includes("-")) {
    const [ano, mes, dia] = dataCrua.split("-");
    if (ano.length === 4) {
      dataFormatada = `${dia}-${mes}-${ano}`;
    }
  }

  return `${barcoFormatado} - ${sentidoFormatado} - ${dataFormatada}`;
};

export default function DashboardComandante() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ESTADOS PARA O SELETOR DE VIAGENS
  const [idViagemSelecionada, setIdViagemSelecionada] = useState<string | null>(
    null,
  );

  // 🟢 AGORA GUARDA O NOME FORMATADO DA ROTA TAMBÉM
  const [viagensAtivas, setViagensAtivas] = useState<
    { id: string; label: string }[]
  >([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [sentidoTrecho, setSentidoTrecho] = useState("ROTA");

  const [dados, setDados] = useState<DashboardData>({
    receitaTotal: 0,
    totalPassageiros: 0,
    capacidadeMax: 0,
    vagas: { rede: 0, poltrona: 0, suite: 0 },
    capacidadeReal: { rede: 0, poltrona: 0, suite: 0 },
  });

  const progressOcupacao = useSharedValue(0);
  const progressRede = useSharedValue(0);
  const progressPoltrona = useSharedValue(0);
  const progressSuite = useSharedValue(0);

  const [carregandoPassagens, setCarregandoPassagens] = useState(false);
  const [passagensVendidas, setPassagensVendidas] = useState<any[]>([]);

  useEffect(() => {
    if (!idViagemSelecionada) {
      setPassagensVendidas([]);
      return;
    }

    // 🟢 Passo A: Ativa o carregamento assim que o comandante escolhe a viagem
    setCarregandoPassagens(true);

    const q = query(
      collection(db, "passagens_vendidas"), // Use o nome exato da sua coleção
      where("id_viagem", "==", idViagemSelecionada),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPassagensVendidas(lista);

        // 🟢 Passo B: Desliga o carregamento assim que os dados ancorarem no app
        setCarregandoPassagens(false);
      },
      (error) => {
        console.error("Erro ao carregar passagens:", error);
        // Desliga também em caso de falha para não travar a tela infinitamente
        setCarregandoPassagens(false);
      },
    );

    return () => unsub();
  }, [idViagemSelecionada]);

  // 🟢 NOVO RADAR DE VIAGENS: BUSCA APENAS AS VIAGENS DO BARCO DO USUÁRIO LOGADO
  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, "passagens"));
    const unsub = onSnapshot(q, async (snap) => {
      const viagensUnicas = new Set<string>();
      snap.forEach((doc) => {
        const idV = doc.data().idViagem;
        if (idV) viagensUnicas.add(idV);
      });

      const viagensComNomes = [];
      for (const idV of Array.from(viagensUnicas)) {
        const partes = idV.split("_");
        const dataStr = partes.pop() || "";
        const gradeId = partes.join("_");

        let label = "";
        try {
          const gSnap = await getDoc(doc(db, "grades_viagens", gradeId));
          if (gSnap.exists()) {
            const gData = gSnap.data();

            // 🛡️ TRAVA DE SEGURANÇA: Se a viagem não pertencer ao usuário logado, ignoramos
            if (gData.ownerId !== auth.currentUser?.uid) continue;

            const bNome = gData.nome_barco || "Barco";

            // Lógica para puxar as Cidades de Origem e Destino
            const pOrigem =
              gData.porto_origem || gData.origem || gData.portoOrigem || "";
            let pDestino =
              gData.porto_destino || gData.destino || gData.portoDestino || "";

            if (!pDestino && gData.itinerario && gData.itinerario.length > 0) {
              pDestino = gData.itinerario[gData.itinerario.length - 1].porto;
            }

            let dataF = dataStr;
            if (dataStr.includes("-")) {
              dataF = dataStr.split("-").reverse().join("/");
            }

            if (pOrigem && pDestino) {
              label = `${bNome} | ${pOrigem} ➔ ${pDestino} (${dataF})`;
            } else if (gData.sentido) {
              label = `${bNome} | ${String(gData.sentido).toUpperCase()} (${dataF})`;
            }

            viagensComNomes.push({ id: idV, label: label || idV });
          }
        } catch (e) {
          console.log(e);
        }
      }

      setViagensAtivas(viagensComNomes);
      if (!idViagemSelecionada) setLoading(false);
    });
    return () => unsub();
  }, [idViagemSelecionada]);

  const carregarDashboard = async () => {
    if (!idViagemSelecionada || !auth.currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const partes = idViagemSelecionada.split("_");
      partes.pop();
      const gradeId = partes.join("_");

      let capRede = 0;
      let capPoltrona = 0;
      let capSuite = 0;
      let capMaxLotacao = 0;

      const gradeSnap = await getDoc(doc(db, "grades_viagens", gradeId));
      if (gradeSnap.exists()) {
        const gradeDados = gradeSnap.data();

        // 🛡️ REFORÇO DE SEGURANÇA: Garante que os cálculos são apenas da frota do usuário
        if (gradeDados.ownerId !== auth.currentUser.uid) {
          setLoading(false);
          return;
        }

        const pOrigem =
          gradeDados.porto_origem ||
          gradeDados.origem ||
          gradeDados.portoOrigem ||
          "";
        let pDestino =
          gradeDados.porto_destino ||
          gradeDados.destino ||
          gradeDados.portoDestino ||
          "";
        if (
          !pDestino &&
          gradeDados.itinerario &&
          gradeDados.itinerario.length > 0
        ) {
          pDestino =
            gradeDados.itinerario[gradeDados.itinerario.length - 1].porto;
        }

        if (pOrigem && pDestino) {
          setSentidoTrecho(`${pOrigem} ➔ ${pDestino}`);
        } else if (gradeDados.sentido) {
          setSentidoTrecho(String(gradeDados.sentido).toUpperCase());
        }

        // 🟢 BUSCANDO OS IDS EXATOS DE CAPACIDADE NO DOCUMENTO DO BARCO
        const idBarco = gradeDados.id_barco;
        if (idBarco) {
          const barcoSnap = await getDoc(doc(db, "embarcacoes", idBarco));
          if (barcoSnap.exists()) {
            const bd = barcoSnap.data();
            // SINCRONIZAÇÃO POR IDS EXATOS
            capRede = Number(bd.vagasRede) || 0;
            capPoltrona = Number(bd.vagasPoltrona) || 0;
            capSuite = Number(bd.vagasSuite) || 0;

            // 🟢 MATEMÁTICA DA CAPITANIA: Ocupação geral = Redes + Poltronas
            capMaxLotacao = capRede + capPoltrona;
          }
        }
      }

      const q = query(
        collection(db, "passagens"),
        where("idViagem", "==", idViagemSelecionada),
      );

      const snap = await getDocs(q);

      let receita = 0;
      let passageirosLotacao = 0;
      let countRede = 0;
      let countPoltrona = 0;
      let countSuite = 0;

      snap.forEach((doc) => {
        const info = doc.data();

        if (info.status === "APROVADO") {
          receita += Number(info.valor || 0);
        }

        const vagaUpper = String(info.tipoVaga || "").toUpperCase();

        if (vagaUpper === "REDE") {
          countRede += 1;
          passageirosLotacao += 1;
        } else if (vagaUpper === "POLTRONA") {
          countPoltrona += 1;
          passageirosLotacao += 1;
        } else if (vagaUpper === "SUITE") {
          countSuite += 1;
          // 🟢 SUÍTE NÃO SOMA NA LOTAÇÃO GERAL DOS CONVESES
        }
      });

      setDados({
        receitaTotal: receita,
        totalPassageiros: passageirosLotacao,
        capacidadeMax: capMaxLotacao,
        vagas: { rede: countRede, poltrona: countPoltrona, suite: countSuite },
        capacidadeReal: {
          rede: capRede,
          poltrona: capPoltrona,
          suite: capSuite,
        },
      });

      const taxaOcupacao =
        capMaxLotacao > 0 ? Math.min(passageirosLotacao / capMaxLotacao, 1) : 0;
      progressOcupacao.value = withTiming(taxaOcupacao, { duration: 1500 });

      progressRede.value = withTiming(
        capRede > 0 ? Math.min(countRede / capRede, 1) : 0,
        { duration: 1200 },
      );
      progressPoltrona.value = withTiming(
        capPoltrona > 0 ? Math.min(countPoltrona / capPoltrona, 1) : 0,
        { duration: 1300 },
      );
      progressSuite.value = withTiming(
        capSuite > 0 ? Math.min(countSuite / capSuite, 1) : 0,
        { duration: 1400 },
      );
    } catch (error) {
      console.error("Erro ao sincronizar dashboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarDashboard();
  }, [idViagemSelecionada]);

  const onRefresh = () => {
    setRefreshing(true);
    carregarDashboard();
  };

  const barOcupacaoStyle = useAnimatedStyle(() => ({
    width: `${progressOcupacao.value * 100}%`,
    backgroundColor: interpolateColor(
      progressOcupacao.value,
      [0, 0.5, 0.8, 1],
      ["#38bdf8", "#10b981", "#f59e0b", "#ef4444"],
    ),
  }));

  const barRedeStyle = useAnimatedStyle(() => ({
    width: `${progressRede.value * 100}%`,
  }));
  const barPoltronaStyle = useAnimatedStyle(() => ({
    width: `${progressPoltrona.value * 100}%`,
  }));
  const barSuiteStyle = useAnimatedStyle(() => ({
    width: `${progressSuite.value * 100}%`,
  }));

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>
          Sincronizando Relatório de Trecho...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecione a Viagem</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#64748b" />
              </TouchableOpacity>
            </View>

            {viagensAtivas.length === 0 ? (
              <Text style={styles.emptyText}>
                Nenhuma viagem da sua frota encontrada com vendas.
              </Text>
            ) : (
              <FlatList
                data={viagensAtivas}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.tripItem}
                    onPress={() => {
                      setIdViagemSelecionada(item.id);
                      setModalVisible(false);
                    }}
                  >
                    <Ionicons name="boat-outline" size={20} color="#38bdf8" />
                    <Text style={styles.tripItemText}>
                      {item.label ? item.label : formatarNomeViagem(item.id)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>RELATÓRIO DE VIAGEM</Text>
          <Text style={styles.headerTitle}>Ponte de Comando</Text>
        </View>
        <TouchableOpacity
          style={styles.btnSync}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="calendar-outline" size={24} color="#38bdf8" />
        </TouchableOpacity>
      </View>

      {!idViagemSelecionada ? (
        <View style={styles.emptyState}>
          <Ionicons name="analytics-outline" size={80} color="#1e293b" />
          <Text style={styles.emptyStateTitle}>Nenhum trecho selecionado</Text>
          <Text style={styles.emptyStateSub}>
            Toque no ícone de calendário acima para puxar os dados de uma viagem
            específica da sua embarcação.
          </Text>
          <TouchableOpacity
            style={styles.btnAcaoPrimaria}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.btnAcaoPrimariaText}>SELECIONAR ROTA</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#38bdf8"
            />
          }
        >
          <View style={styles.activeTripBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.activeTripText}>
              Exibindo:{" "}
              {viagensAtivas.find((v) => v.id === idViagemSelecionada)?.label ||
                formatarNomeViagem(idViagemSelecionada)}
            </Text>
          </View>

          <Animated.View
            entering={FadeInDown.duration(600)}
            style={styles.cardFinanceiro}
          >
            <View style={styles.rowFinanceiro}>
              <View>
                <Text style={styles.cardLabel}>RECEITA DO TRECHO (PIX)</Text>
                <Text style={styles.valorPrincipal}>
                  R${" "}
                  {dados.receitaTotal.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>
              <View style={styles.iconFinanceiro}>
                <Ionicons name="cash-outline" size={32} color="#10b981" />
              </View>
            </View>
            <View style={styles.infoBottomRow}>
              <Ionicons name="time-outline" size={14} color="#10b981" />
              <Text style={styles.infoBottomText}>
                Dados isolados por identificador de viagem
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInRight.duration(600).delay(200)}
            style={styles.cardPadrao}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>
                Ocupação Lotação ({sentidoTrecho})
              </Text>
              <Ionicons name="boat-outline" size={24} color="#38bdf8" />
            </View>

            <View style={styles.ocupacaoValores}>
              <Text style={styles.numeroDestaque}>
                {dados.totalPassageiros}
              </Text>
              <Text style={styles.numeroMaximo}>
                / {dados.capacidadeMax} vagas (Redes e Poltronas)
              </Text>
            </View>

            <View style={styles.progressBarBg}>
              <Animated.View
                style={[styles.progressBarFill, barOcupacaoStyle]}
              />
            </View>
            <Text style={styles.legendaOcupacao}>
              {dados.capacidadeMax > 0
                ? (
                    (dados.totalPassageiros / dados.capacidadeMax) *
                    100
                  ).toFixed(1)
                : 0}
              % de ocupação total
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.duration(600).delay(400)}
            style={styles.cardPadrao}
          >
            <Text style={styles.cardTitle}>Vagas e Acomodações</Text>

            {/* 🟢 REDE */}
            <View style={styles.vagaRow}>
              <View style={styles.vagaInfo}>
                <Ionicons name="bed-outline" size={18} color="#94a3b8" />
                <Text style={styles.vagaText}>Rede</Text>
              </View>
              <View style={styles.vagaTrack}>
                <Animated.View
                  style={[
                    styles.vagaFill,
                    { backgroundColor: "#38bdf8" },
                    barRedeStyle,
                  ]}
                />
              </View>
              <View style={styles.vagaDataContainer}>
                <Text style={styles.vagaCount}>{dados.vagas.rede} vend.</Text>
                <Text style={styles.vagaLivre}>
                  {Math.max(0, dados.capacidadeReal.rede - dados.vagas.rede)}{" "}
                  livres
                </Text>
              </View>
            </View>

            {/* 🟢 POLTRONA */}
            <View style={styles.vagaRow}>
              <View style={styles.vagaInfo}>
                <MaterialIcons name="event-seat" size={18} color="#94a3b8" />
                <Text style={styles.vagaText}>Poltrona</Text>
              </View>
              <View style={styles.vagaTrack}>
                <Animated.View
                  style={[
                    styles.vagaFill,
                    { backgroundColor: "#8b5cf6" },
                    barPoltronaStyle,
                  ]}
                />
              </View>
              <View style={styles.vagaDataContainer}>
                <Text style={styles.vagaCount}>
                  {dados.vagas.poltrona} vend.
                </Text>
                <Text style={styles.vagaLivre}>
                  {Math.max(
                    0,
                    dados.capacidadeReal.poltrona - dados.vagas.poltrona,
                  )}{" "}
                  livres
                </Text>
              </View>
            </View>

            {/* 🟢 SUÍTE */}
            <View style={styles.vagaRow}>
              <View style={styles.vagaInfo}>
                <Ionicons name="star-outline" size={18} color="#94a3b8" />
                <Text style={styles.vagaText}>Suíte VIP</Text>
              </View>
              <View style={styles.vagaTrack}>
                <Animated.View
                  style={[
                    styles.vagaFill,
                    { backgroundColor: "#facc15" },
                    barSuiteStyle,
                  ]}
                />
              </View>
              <View style={styles.vagaDataContainer}>
                <Text style={styles.vagaCount}>{dados.vagas.suite} vend.</Text>
                <Text style={styles.vagaLivre}>
                  {Math.max(0, dados.capacidadeReal.suite - dados.vagas.suite)}{" "}
                  livres
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* 🟢 SEÇÃO DE PASSAGENS VENDIDAS COM FILTRO E EFEITO DE CARREGAMENTO */}
          <Animated.View
            entering={FadeInUp.duration(600).delay(500)}
            style={styles.cardPadrao}
          >
            <Text style={styles.cardTitle}>Lista de Passagens Vendidas</Text>

            {carregandoPassagens ? (
              <View style={styles.loadingPassagensBox}>
                <ActivityIndicator size="large" color="#38bdf8" />
                <Text style={styles.loadingPassagensTxt}>
                  Buscando bilhetes vendidos...
                </Text>
              </View>
            ) : passagensVendidas.length === 0 ? (
              <Text style={styles.erroListaVazia}>
                Nenhuma passagem vendida para esta rota até o momento.
              </Text>
            ) : (
              passagensVendidas.map((passagem) => (
                <View key={passagem.id} style={styles.ticketCard}>
                  <View style={styles.ticketLeft}>
                    <Ionicons name="person-outline" size={16} color="#38bdf8" />
                    <Text style={styles.ticketName}>
                      {passagem.nomePassageiro || passagem.nome || "Passageiro"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.ticketBadge,
                      passagem.tipoVaga?.toUpperCase() === "SUITE"
                        ? { backgroundColor: "rgba(250, 204, 21, 0.1)" }
                        : passagem.tipoVaga?.toUpperCase() === "POLTRONA"
                          ? { backgroundColor: "rgba(139, 92, 246, 0.1)" }
                          : { backgroundColor: "rgba(56, 189, 248, 0.1)" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ticketBadgeTxt,
                        passagem.tipoVaga?.toUpperCase() === "SUITE"
                          ? { color: "#facc15" }
                          : passagem.tipoVaga?.toUpperCase() === "POLTRONA"
                            ? { color: "#8b5cf6" }
                            : { color: "#38bdf8" },
                      ]}
                    >
                      {String(passagem.tipoVaga || "Rede").toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Animated.View>

          <View style={styles.footerSpace}>
            <Ionicons name="analytics" size={20} color="#334155" />
            <Text style={styles.footerText}>
              Relatório de Comando - Cadê meu barco
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
  },
  loadingText: {
    color: "#38bdf8",
    marginTop: 15,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 25,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(56, 189, 248, 0.1)",
  },
  headerSubtitle: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  btnSync: {
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 20,
  },
  emptyStateSub: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
  btnAcaoPrimaria: {
    backgroundColor: "#38bdf8",
    padding: 15,
    borderRadius: 12,
    marginTop: 30,
    width: "100%",
    alignItems: "center",
  },
  btnAcaoPrimariaText: { color: "#0f172a", fontWeight: "bold", fontSize: 14 },
  activeTripBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 7,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  activeTripText: {
    color: "#10b981",
    fontWeight: "bold",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  tripItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  tripItemText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  emptyText: { color: "#64748b", textAlign: "center", marginVertical: 30 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  cardFinanceiro: {
    backgroundColor: "#0f172a",
    padding: 25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#1e293b",
    borderLeftWidth: 5,
    borderLeftColor: "#10b981",
    marginBottom: 20,
  },
  rowFinanceiro: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 5,
  },
  valorPrincipal: { color: "#10b981", fontSize: 36, fontWeight: "900" },
  iconFinanceiro: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 15,
    borderRadius: 20,
  },
  infoBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  infoBottomText: { color: "#94a3b8", fontSize: 11, fontStyle: "italic" },
  cardPadrao: {
    backgroundColor: "#0f172a",
    padding: 25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 20,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 22,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  ocupacaoValores: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginBottom: 15,
  },
  numeroDestaque: { color: "#fff", fontSize: 40, fontWeight: "900" },
  numeroMaximo: { color: "#64748b", fontSize: 16, fontWeight: "bold" },
  progressBarBg: {
    width: "100%",
    height: 12,
    backgroundColor: "#1e293b",
    borderRadius: 10,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", borderRadius: 10 },
  legendaOcupacao: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 10,
    textAlign: "right",
    fontWeight: "bold",
  },
  vagaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
  },
  vagaInfo: { flexDirection: "row", alignItems: "center", gap: 8, width: 85 },
  vagaText: { color: "#cbd5e1", fontSize: 13, fontWeight: "bold" },
  vagaTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#1e293b",
    borderRadius: 4,
    marginHorizontal: 15,
    overflow: "hidden",
  },
  vagaFill: { height: "100%", borderRadius: 4 },
  vagaDataContainer: { alignItems: "flex-end", width: 70 },
  vagaCount: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  vagaLivre: { color: "#10b981", fontSize: 11, fontWeight: "900" },
  footerSpace: { alignItems: "center", marginTop: 20, opacity: 0.5 },
  footerText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    marginTop: 5,
  },

  // 🟢 NOVOS ESTILOS EXCLUSIVOS DO RADAR DE PASSAGENS
  loadingPassagensBox: {
    paddingVertical: 30,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingPassagensTxt: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
  },
  erroListaVazia: {
    color: "#64748b",
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 13,
  },
  ticketCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)",
  },
  ticketLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ticketName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  ticketBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ticketBadgeTxt: {
    fontSize: 11,
    fontWeight: "bold",
  },
});
