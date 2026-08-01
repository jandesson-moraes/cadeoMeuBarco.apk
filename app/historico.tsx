import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics"; // 🟢 Feedback tátil
import { Stack, useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated"; // 🚀 Motor GSAP Style
import { auth, db } from "../services/firebase";

export default function HistoricoBilhetes() {
  const router = useRouter();
  const [compras, setCompras] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // 📡 Vibração Tática ao clicar
  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  useEffect(() => {
    let unsub = () => {};

    // 🟢 ESCUDO TÁTICO: Escuta o estado do usuário antes de lançar a consulta
    const authUnsub = auth.onAuthStateChanged((user) => {
      if (!user || !user.email) {
        setCarregando(false);
        return;
      }

      const q = query(
        collection(db, "passagens"),
        where("status", "==", "APROVADO"),
        where("compradorEmail", "==", user.email),
      );

      unsub = onSnapshot(
        q,
        (snap) => {
          const transacoesMap = new Map();

          snap.docs.forEach((doc) => {
            const dados = doc.data();
            if (!dados.pagamentoId) return;

            if (!transacoesMap.has(dados.pagamentoId)) {
              transacoesMap.set(dados.pagamentoId, {
                pagamentoId: dados.pagamentoId,
                barco: dados.barco || dados.nome_barco,
                origem: dados.origem || dados.porto_origem,
                destino: dados.destino || dados.porto_destino,
                dataCompra: dados.dataCompra || dados.data_compra,
                status: dados.status,
                quantidade: 1,
              });
            } else {
              const existente = transacoesMap.get(dados.pagamentoId);
              existente.quantidade += 1;
            }
          });

          const lista = Array.from(transacoesMap.values()).sort(
            (a: any, b: any) =>
              new Date(b.dataCompra || 0).getTime() -
              new Date(a.dataCompra || 0).getTime(),
          );

          setCompras(lista);
          setCarregando(false);
        },
        (error) => {
          // 🟢 FILTRO DE SILÊNCIO: Evita sujar o terminal com erros de permissão temporários
          if (error.code === "permission-denied") {
            console.log(
              "Radar histórico: Aguardando sincronização de credenciais...",
            );
          } else {
            console.error("Erro no radar do histórico:", error);
          }
          setCarregando(false);
        },
      );
    });

    // 🟢 LIMPEZA DE CONVÉS: Desliga os dois ouvintes ao sair da tela
    return () => {
      authUnsub();
      unsub();
    };
  }, []);

  const formatarData = (dataIso: string) => {
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

  const renderItem = ({ item, index }: { item: any; index: number }) => (
    // 🚀 EFEITO GSAP: Cada card entra com um atraso baseado na sua posição (Stagger)
    <Animated.View
      entering={FadeInDown.delay(index * 100)
        .duration(600)
        .springify()}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          triggerHaptic();
          router.push({
            pathname: "/bilhete",
            params: { pagamentoId: item.pagamentoId },
          });
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Ionicons name="boat" size={18} color="#38bdf8" />
            </View>
            <Text style={styles.barcoNome}>{item.barco || "Embarcação"}</Text>
          </View>
          <View style={styles.badgeAprovado}>
            <Ionicons name="checkmark-circle" size={12} color="#10b981" />
            <Text style={styles.badgeText}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.rotaContainer}>
            <Text style={styles.cidadeText}>{item.origem}</Text>
            <Ionicons
              name="arrow-forward"
              size={14}
              color="#334155"
              style={{ marginHorizontal: 10 }}
            />
            <Text style={styles.cidadeText}>{item.destino}</Text>
          </View>

          <Text style={styles.detalhes}>
            {item.quantidade}{" "}
            {item.quantidade > 1
              ? "passagens vinculadas"
              : "passagem vinculada"}
          </Text>
          <Text style={styles.data}>
            Comprado em: {formatarData(item.dataCompra)}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.verBilhete}>ACESSAR BILHETES</Text>
          <Ionicons name="chevron-forward" size={16} color="#38bdf8" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btnBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Meus Bilhetes</Text>
        <View style={{ width: 40 }} />
      </View>

      {carregando ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Sincronizando com o porto...</Text>
        </View>
      ) : (
        <FlatList
          data={compras}
          keyExtractor={(item) => item.pagamentoId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Animated.View entering={FadeInUp} style={styles.emptyContainer}>
              <Ionicons name="ticket-outline" size={80} color="#1e293b" />
              <Text style={styles.emptyText}>
                Você ainda não possui viagens confirmadas.
              </Text>
            </Animated.View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(56, 189, 248, 0.1)",
  },
  btnBack: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },

  // 🟢 AJUSTE DE NAVBAR: Espaço para a barra flutuante
  list: { padding: 20, paddingBottom: 120 },

  card: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    padding: 18,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.1)",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  barcoNome: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    textTransform: "uppercase",
  },

  badgeAprovado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: { color: "#10b981", fontSize: 10, fontWeight: "900" },

  cardBody: { marginBottom: 15 },
  rotaContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  cidadeText: { color: "#38bdf8", fontSize: 16, fontWeight: "900" },
  detalhes: { color: "#94a3b8", fontSize: 13, marginBottom: 4 },
  data: { color: "#64748b", fontSize: 11, fontWeight: "600" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 15,
  },
  verBilhete: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },

  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
  },
  loadingText: { color: "#64748b", fontSize: 14, fontWeight: "600" },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 20,
    fontSize: 15,
    width: "70%",
    lineHeight: 22,
  },
});
