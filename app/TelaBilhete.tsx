import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, // 🟢 Adicionado para o aviso personalizado
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import ViewShot from "react-native-view-shot";
import { db } from "../services/firebase";

const { width } = Dimensions.get("window");

export default function TelaBilhete() {
  const params = useLocalSearchParams();
  const [bilhetes, setBilhetes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // 📸 Referência para tirar a foto do bilhete
  const viewShotRef = useRef<any>(null);

  // 🟢 ESTADO DO NOSSO MODAL PERSONALIZADO
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

  const formatarDocumento = (doc?: string) => {
    if (!doc || doc === "Não informado") return "---";
    const limpo = String(doc).replace(/\D/g, "");
    if (limpo.length === 11)
      return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return doc;
  };

  const formatarData = (dataIso?: string) => {
    if (!dataIso) return "--/--/----";
    try {
      const d = new Date(dataIso);
      return (
        d.toLocaleDateString("pt-BR") +
        " às " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return dataIso;
    }
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
        setBilhetes(snap.docs.map((doc) => doc.data()));
      } catch (error) {
        // 🟢 Trocado por Modal
        exibirAviso("Erro", "Não foi possível carregar os bilhetes.", "erro");
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [params.pagamentoId]);

  const compartilharBilhete = async () => {
    try {
      if (viewShotRef.current) {
        const uri = await viewShotRef.current.capture();

        if (!(await Sharing.isAvailableAsync())) {
          // 🟢 Trocado por Modal
          exibirAviso(
            "Aviso",
            "O compartilhamento não está disponível neste aparelho.",
            "aviso",
          );
          return;
        }

        await Sharing.shareAsync(uri, {
          dialogTitle: "Seu Bilhete de Embarque",
          mimeType: "image/png",
        });
      }
    } catch (error) {
      // 🟢 Trocado por Modal
      exibirAviso(
        "Erro",
        "Não foi possível gerar a imagem do bilhete para compartilhar.",
        "erro",
      );
    }
  };

  if (carregando)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      {/* 🟢 NOSSO MODAL PERSONALIZADO */}
      <Modal animationType="fade" transparent visible={aviso.visivel}>
        <View style={styles.modalOverlay}>
          <View style={styles.alertCard}>
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
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.container}>
        <Text style={styles.titlePage}>Seus Bilhetes</Text>

        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
        >
          {bilhetes.length > 0 ? (
            bilhetes.map((tkt, index) => (
              <View key={index} style={styles.wrapper}>
                <ViewShot
                  ref={viewShotRef}
                  options={{ format: "png", quality: 1.0 }}
                  style={{ backgroundColor: "#020617" }}
                >
                  <View style={styles.ticketCard}>
                    {tkt.refeicao === true ||
                    String(tkt.refeicao) === "true" ? (
                      <View style={styles.badgeRefeicao}>
                        <Text style={styles.badgeText}>
                          🍽️ INCLUI REFEIÇÕES
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.badgeSemRefeicao}>
                        <Text style={styles.badgeTextSem}>
                          🚫 SEM REFEIÇÕES
                        </Text>
                      </View>
                    )}

                    <View style={styles.header}>
                      <View>
                        <Text style={styles.headerTitle}>
                          BILHETE DE EMBARQUE
                        </Text>
                        <Text style={styles.boatName}>
                          {tkt.barco || tkt.nome_barco || "Embarcação"}
                        </Text>
                      </View>
                      <Ionicons name="boat" size={30} color="#38bdf8" />
                    </View>

                    <View style={styles.qrSection}>
                      <QRCode
                        value={tkt.ticketId || tkt.pagamentoId || "erro"}
                        size={140}
                        color="#0f172a"
                      />
                      <Text style={styles.idValue}>ID: {tkt.pagamentoId}</Text>
                    </View>

                    <View style={styles.content}>
                      <View style={{ marginBottom: 15 }}>
                        <Text style={styles.label}>NOME DO PASSAGEIRO</Text>
                        <Text style={styles.value}>
                          {tkt.passageiro || "Não informado"}
                        </Text>
                      </View>

                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>DOCUMENTO (RG/CPF)</Text>
                          <Text style={styles.value}>
                            {formatarDocumento(tkt.documento)}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.label}>NASCIMENTO</Text>
                          <Text style={styles.value}>
                            {tkt.nascimento || "--/--/----"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.divider} />

                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>ORIGEM</Text>
                          <Text style={styles.value}>
                            {tkt.origem || tkt.porto_origem}
                          </Text>
                        </View>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color="#38bdf8"
                          style={{ marginHorizontal: 10 }}
                        />
                        <View style={{ flex: 1, alignItems: "flex-end" }}>
                          <Text style={styles.label}>DESTINO</Text>
                          <Text style={styles.value}>
                            {tkt.destino || tkt.porto_destino}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.divider} />

                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>ACOMODAÇÃO</Text>
                          <Text style={styles.valueBig}>
                            {tkt.tipoVaga
                              ? String(tkt.tipoVaga).toUpperCase()
                              : "REDE"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.label}>VALOR TOTAL</Text>
                          <Text style={[styles.valueBig, { color: "#10b981" }]}>
                            R${" "}
                            {tkt.valor ? Number(tkt.valor).toFixed(2) : "0.00"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.divider} />

                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>DATA DA COMPRA</Text>
                          <Text style={styles.valueSmall}>
                            {formatarData(tkt.dataCompra || tkt.data_compra)}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.label}>PAGAMENTO</Text>
                          <Text
                            style={[styles.valueSmall, { color: "#10b981" }]}
                          >
                            {tkt.formaPagamento || "PIX"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.footer}>
                      <Text style={styles.statusText}>✓ BILHETE VÁLIDO</Text>
                      <Text style={styles.counterText}>
                        Passagem {index + 1} de {bilhetes.length}
                      </Text>
                    </View>
                  </View>
                </ViewShot>

                <TouchableOpacity
                  style={styles.btnShare}
                  onPress={compartilharBilhete}
                >
                  <Ionicons name="share-social" size={20} color="#fff" />
                  <Text style={styles.btnShareText}>
                    ENVIAR OU SALVAR BILHETE
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.wrapper}>
              <Text style={{ color: "#fff" }}>Nenhum bilhete encontrado.</Text>
            </View>
          )}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", marginBottom: 80 },
  center: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },

  // 🟢 ESTILOS DO MODAL PERSONALIZADO
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

  titlePage: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 60,
    marginBottom: 10,
  },
  wrapper: { width: width, padding: 20, paddingBottom: 50 },
  ticketCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    width: "100%",
    overflow: "hidden",
    elevation: 5,
  },
  badgeRefeicao: {
    backgroundColor: "#f59e0b",
    padding: 8,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
  },
  badgeSemRefeicao: {
    backgroundColor: "#e2e8f0",
    padding: 8,
    alignItems: "center",
  },
  badgeTextSem: {
    color: "#64748b",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
  },
  header: {
    backgroundColor: "#0f172a",
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#38bdf8", fontSize: 12, fontWeight: "bold" },
  boatName: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  qrSection: { padding: 20, alignItems: "center", backgroundColor: "#f8fafc" },
  idValue: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 10,
    fontFamily: "monospace",
  },
  content: { padding: 25, paddingTop: 10 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 2,
  },
  value: { color: "#0f172a", fontSize: 15, fontWeight: "bold" },
  valueBig: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  valueSmall: { color: "#334155", fontSize: 13, fontWeight: "bold" },
  divider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 15,
    borderStyle: "dashed",
    borderWidth: 1,
  },
  footer: {
    backgroundColor: "#f1f5f9",
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusText: { color: "#10b981", fontWeight: "bold", fontSize: 11 },
  counterText: { color: "#64748b", fontSize: 11, fontWeight: "bold" },
  btnShare: {
    backgroundColor: "#38bdf8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
    borderRadius: 15,
    marginTop: 20,
    elevation: 5,
  },
  btnShareText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
