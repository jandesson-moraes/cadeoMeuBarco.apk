import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import ViewShot from "react-native-view-shot";
import { db } from "../services/firebase";

function TicketItem({
  tkt,
  index,
  total,
  exibirAviso,
}: {
  tkt: any;
  index: number;
  total: number;
  exibirAviso: any;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = width * 0.9;
  const viewShotRef = useRef<any>(null);

  const formatarDocumento = (doc?: string) => {
    if (!doc || doc === "Não informado") return "---";
    const limpo = String(doc).replace(/\D/g, "");
    return `***.***.***-${limpo.slice(-2)}`;
  };

  const exibirDataBR = (str?: string) => {
    if (!str) return "--/--/----";
    return str.split("-").reverse().join("/");
  };

  const exibirDataHoraCompra = (str?: string) => {
    if (!str) return "Data não registrada";
    try {
      const data = new Date(str);
      return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()} às ${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
    } catch (e) {
      return "Data indisponível";
    }
  };

  const compartilharOuSalvar = async () => {
    try {
      // 🛡️ VERIFICAÇÃO DE SEGURANÇA: Se o módulo não carregar, avisa em vez de travar
      if (!MediaLibrary.requestPermissionsAsync) {
        Alert.alert(
          "Aviso",
          "O sistema de download está sendo carregado. Tente novamente em instantes.",
        );
        return;
      }

      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== "granted") {
        exibirAviso(
          "Permissão",
          "Preciso de acesso à galeria para salvar o bilhete.",
          "aviso",
        );
        return;
      }

      const uri = await viewShotRef.current.capture();
      await MediaLibrary.saveToLibraryAsync(uri);

      exibirAviso(
        "Sucesso! 📸",
        "Bilhete salvo na sua galeria com sucesso.",
        "sucesso",
      );
    } catch (error) {
      console.log(error);
      exibirAviso(
        "Erro",
        "Falha ao salvar. Verifique as permissões da galeria.",
        "erro",
      );
    }
  };

  return (
    <View style={[styles.ticketWrapper, { width }]}>
      <Animated.View
        entering={FadeInDown.delay(index * 200)
          .duration(800)
          .springify()}
        style={{ width: cardWidth, alignItems: "center" }}
      >
        <ViewShot
          ref={viewShotRef}
          options={{ format: "jpg", quality: 0.9 }}
          style={styles.shotArea}
        >
          <View style={[styles.ticketCard, { width: cardWidth }]}>
            <View style={styles.brandHeader}>
              <Animated.View
                entering={ZoomIn.delay(500)}
                style={styles.brandBadge}
              >
                <Ionicons name="shield-checkmark" size={12} color="#020617" />
                <Text style={styles.brandBadgeText}>BILHETE CONFIRMADO</Text>
              </Animated.View>
              <Text style={styles.appName}>CADÊ MEU BARCO</Text>
              <Text style={styles.appSlogan}>
                Logística e Navegação em tempo real
              </Text>
            </View>

            <View style={styles.boatSection}>
              <View style={styles.boatInfo}>
                <Text style={styles.labelLight}>EMBARCAÇÃO</Text>
                <Text style={styles.boatNameText}>
                  {tkt.barco || "NOME DO BARCO"}
                </Text>
              </View>
              <View style={styles.iconCircle}>
                <Ionicons name="boat" size={26} color="#38bdf8" />
              </View>
            </View>

            <View style={styles.mainInfoArea}>
              <Animated.View
                entering={ZoomIn.delay(800)}
                style={styles.qrContainer}
              >
                <QRCode
                  value={tkt.ticketId || tkt.pagamentoId}
                  size={110}
                  color="#0f172a"
                  backgroundColor="transparent"
                />
                <Text style={styles.idText}>
                  ID: {String(tkt.pagamentoId).slice(-8).toUpperCase()}
                </Text>
              </Animated.View>
              <View style={styles.departureDetails}>
                <View style={styles.detailItem}>
                  <Ionicons name="calendar-outline" size={14} color="#38bdf8" />
                  <View>
                    <Text style={styles.detailLabel}>DATA DE SAÍDA</Text>
                    <Text style={styles.detailValue}>
                      {exibirDataBR(tkt.dataViagem)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.detailItem, { marginTop: 15 }]}>
                  <Ionicons name="time-outline" size={14} color="#38bdf8" />
                  <View>
                    <Text style={styles.detailLabel}>HORÁRIO PREVISTO</Text>
                    <Text style={styles.detailValue}>
                      {tkt.horarioSaida || "A Confirmar"}
                    </Text>
                  </View>
                </View>
                <View
                  style={tkt.refeicao ? styles.mealBadge : styles.noMealBadge}
                >
                  <Ionicons
                    name={tkt.refeicao ? "restaurant" : "close-circle"}
                    size={12}
                    color="#fff"
                  />
                  <Text style={styles.mealText}>
                    {tkt.refeicao ? "REFEIÇÃO INCLUSA" : "SEM REFEIÇÃO"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.passengerSection}>
              <View style={styles.dashedLineTop} />
              <View style={styles.infoRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.labelDark}>PASSAGEIRO</Text>
                  <Text style={styles.valueDark}>
                    {tkt.passageiro || "Nome"}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.labelDark}>DOCUMENTO</Text>
                  <Text style={styles.valueDark}>
                    {formatarDocumento(tkt.documento)}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoRow, { marginTop: 15 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.labelDark}>ORIGEM</Text>
                  <Text style={styles.valueCity}>{tkt.origem}</Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#cbd5e1"
                  style={{ marginHorizontal: 10, marginTop: 10 }}
                />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.labelDark}>DESTINO</Text>
                  <Text style={styles.valueCity}>{tkt.destino}</Text>
                </View>
              </View>
              <View style={styles.priceSection}>
                <View>
                  <Text style={styles.labelDark}>ACOMODAÇÃO</Text>
                  <Text style={styles.accommodationValue}>
                    {String(tkt.tipoVaga || "REDE").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.priceTag}>
                  <Text style={styles.priceLabel}>VALOR PAGO</Text>
                  <Text style={styles.priceAmount}>
                    R$ {Number(tkt.valor || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.footerArea}>
              <View style={{ flex: 1 }}>
                <Text style={styles.footerBold}>AUTENTICADO VIA PIX</Text>
                <Text style={styles.footerDate}>
                  Comprado em: {exibirDataHoraCompra(tkt.dataCompra)}
                </Text>
              </View>
              <View style={styles.pageNumber}>
                <Text style={styles.pageNumberText}>
                  {index + 1}/{total}
                </Text>
              </View>
            </View>
          </View>
        </ViewShot>
      </Animated.View>

      <TouchableOpacity
        style={[styles.btnShare, { width: width * 0.9 }]}
        onPress={compartilharOuSalvar}
      >
        <Ionicons name="download-outline" size={22} color="#fff" />
        <Text style={styles.btnShareText}>BAIXAR BILHETE</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TelaBilhete() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [bilhetes, setBilhetes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState({
    visivel: false,
    titulo: "",
    mensagem: "",
    tipo: "erro" as "erro" | "sucesso" | "aviso",
  });

  const exibirAviso = (
    titulo: string,
    mensagem: string,
    tipo: "erro" | "sucesso" | "aviso" = "erro",
  ) => {
    setAviso({ visivel: true, titulo, mensagem, tipo });
  };

  useEffect(() => {
    async function carregar() {
      if (!params.pagamentoId) return;
      try {
        const q = query(
          collection(db, "passagens"),
          where("pagamentoId", "==", String(params.pagamentoId)),
        );
        const snap = await getDocs(q);
        setBilhetes(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        exibirAviso("Erro", "Falha ao carregar seus bilhetes.", "erro");
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [params.pagamentoId]);

  if (carregando)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );

  return (
    <View style={styles.mainContainer}>
      <Stack.Screen options={{ headerShown: false }} />
      <Modal animationType="fade" transparent visible={aviso.visivel}>
        <View style={styles.modalOverlay}>
          <Animated.View entering={ZoomIn} style={styles.alertCard}>
            <Ionicons
              name={
                aviso.tipo === "sucesso"
                  ? "checkmark-circle"
                  : aviso.tipo === "aviso"
                    ? "warning"
                    : "alert-circle"
              }
              size={60}
              color={
                aviso.tipo === "sucesso"
                  ? "#10b981"
                  : aviso.tipo === "aviso"
                    ? "#f59e0b"
                    : "#ef4444"
              }
            />
            <Text style={styles.alertTitle}>{aviso.titulo}</Text>
            <Text style={styles.alertText}>{aviso.mensagem}</Text>
            <TouchableOpacity
              style={[
                styles.alertBtn,
                {
                  backgroundColor:
                    aviso.tipo === "sucesso"
                      ? "#10b981"
                      : aviso.tipo === "aviso"
                        ? "#f59e0b"
                        : "#ef4444",
                },
              ]}
              onPress={() => setAviso({ ...aviso, visivel: false })}
            >
              <Text style={styles.alertBtnText}>ENTENDIDO</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <View style={styles.customHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btnBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titlePage}>Seu Bilhete de Embarque</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
      >
        {bilhetes.map((tkt, index) => (
          <TicketItem
            key={tkt.id || index}
            tkt={tkt}
            index={index}
            total={bilhetes.length}
            exibirAviso={exibirAviso}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#020617" },
  center: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  alertCard: {
    backgroundColor: "#0f172a",
    width: "100%",
    borderRadius: 25,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  alertTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 15,
  },
  alertText: {
    color: "#94a3b8",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
  alertBtn: {
    width: "100%",
    padding: 15,
    borderRadius: 15,
    marginTop: 25,
    alignItems: "center",
  },
  alertBtnText: { color: "#fff", fontWeight: "bold" },
  customHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: "#0f172a",
  },
  btnBack: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  titlePage: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  ticketWrapper: {
    alignItems: "center",
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  shotArea: { backgroundColor: "#fff", borderRadius: 28, overflow: "hidden" },
  ticketCard: { backgroundColor: "#fff", borderRadius: 28, overflow: "hidden" },
  brandHeader: {
    backgroundColor: "#0f172a",
    padding: 10,
    alignItems: "center",
    borderBottomWidth: 4,
    borderBottomColor: "#38bdf8",
  },
  brandBadge: {
    backgroundColor: "#38bdf8",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 1,
    borderRadius: 20,
    marginBottom: 1,
  },
  brandBadgeText: { color: "#020617", fontSize: 9, fontWeight: "900" },
  appName: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  appSlogan: { color: "#64748b", fontSize: 10, fontWeight: "bold" },
  boatSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f8fafc",
  },
  boatInfo: { flex: 1 },
  labelLight: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  boatNameText: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  iconCircle: {
    width: 50,
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  mainInfoArea: {
    flexDirection: "row",
    padding: 20,
    gap: 20,
    alignItems: "center",
  },
  qrContainer: { alignItems: "center", gap: 5 },
  idText: { color: "#94a3b8", fontSize: 9, fontWeight: "bold" },
  departureDetails: { flex: 1 },
  detailItem: { flexDirection: "row", gap: 10, alignItems: "center" },
  detailLabel: { color: "#94a3b8", fontSize: 8, fontWeight: "bold" },
  detailValue: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  mealBadge: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 15,
  },
  noMealBadge: {
    backgroundColor: "#f18375",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 15,
  },
  mealText: { color: "#fff", fontSize: 9, fontWeight: "bold" },
  passengerSection: { padding: 20, paddingTop: 0 },
  dashedLineTop: {
    height: 1,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 20,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  labelDark: { color: "#94a3b8", fontSize: 9, fontWeight: "bold" },
  valueDark: { color: "#0f172a", fontSize: 14, fontWeight: "bold" },
  valueCity: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  priceSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 25,
  },
  accommodationValue: { color: "#38bdf8", fontSize: 18, fontWeight: "900" },
  priceTag: {
    backgroundColor: "#0f172a",
    padding: 12,
    borderRadius: 15,
    alignItems: "flex-end",
  },
  priceLabel: { color: "#38bdf8", fontSize: 8, fontWeight: "bold" },
  priceAmount: { color: "#fff", fontSize: 24, fontWeight: "900" },
  footerArea: {
    backgroundColor: "#f1f5f9",
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerBold: { color: "#0f172a", fontSize: 10, fontWeight: "900" },
  footerDate: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 2,
  },
  pageNumber: {
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pageNumberText: { color: "#0f172a", fontSize: 10, fontWeight: "bold" },
  btnShare: {
    backgroundColor: "#38bdf8",
    flexDirection: "row",
    padding: 18,
    borderRadius: 20,
    marginTop: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginBottom: 50,
  },
  btnShareText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
});
