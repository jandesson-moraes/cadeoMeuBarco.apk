import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Stack, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { auth, db } from "../../services/firebase";

export default function AdminGeradorScreen() {
  const router = useRouter();
  const [chavesDisponiveis, setChavesDisponiveis] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);

  // 🟢 ESTADOS PARA O NOVO MODAL
  const [modalSucesso, setModalSucesso] = useState(false);
  const [chaveRecemCriada, setChaveRecemCriada] = useState("");

  const usuarioAutorizado =
    auth.currentUser?.email === "jandessonmoraes@gmail.com";

  // 🔵 ESCUTA EM TEMPO REAL
  useEffect(() => {
    if (!usuarioAutorizado) {
      setChavesDisponiveis([]);
      return;
    }
    const q = query(
      collection(db, "chaves_mestras"),
      where("usada", "==", false),
      orderBy("criadaEm", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lista = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setChavesDisponiveis(lista);
      },
      (error) => {
        // 🚨 SE A LISTA NÃO APARECE, O ERRO VAI APARECER AQUI NO CONSOLE
        console.error(
          "ERRO FIRESTORE: Verifique se o índice composto foi criado no Firebase Console.",
          error,
        );
      },
    );

    return () => unsubscribe();
  }, [usuarioAutorizado]);

  const gerarCodigoAleatorio = () => {
    const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let resultado = "BARCO-";
    for (let i = 0; i < 6; i++) {
      resultado += caracteres.charAt(
        Math.floor(Math.random() * caracteres.length),
      );
    }
    return resultado;
  };

  const handleCriarChave = async () => {
    setCarregando(true);
    const novoCodigo = gerarCodigoAleatorio();

    try {
      const qCheck = query(
        collection(db, "chaves_mestras"),
        where("codigo", "==", novoCodigo),
      );
      const checkSnap = await getDocs(qCheck);

      if (!checkSnap.empty) {
        handleCriarChave();
        return;
      }

      await addDoc(collection(db, "chaves_mestras"), {
        codigo: novoCodigo,
        usada: false,
        criadaEm: serverTimestamp(),
        criadaPor: auth.currentUser?.email,
      });

      // 🟢 EM VEZ DE ALERT, ABRIMOS O MODAL
      setChaveRecemCriada(novoCodigo);
      setModalSucesso(true);
    } catch (error) {
      console.error(error);
    } finally {
      setCarregando(false);
    }
  };

  const copiarChave = async (codigo: string) => {
    await Clipboard.setStringAsync(codigo);
  };

  if (!usuarioAutorizado) {
    return (
      <View style={styles.containerErro}>
        <Ionicons name="lock-closed" size={80} color="#ef4444" />
        <Text style={styles.textErro}>Acesso Restrito ao Almirante.</Text>
        <TouchableOpacity onPress={() => router.replace("/login")}>
          <Text style={{ color: "#38bdf8", marginTop: 20 }}>
            Voltar ao Porto
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#38bdf8" />
        </TouchableOpacity>
        <Text style={styles.title}>Torre de Comando</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>GERADOR DE ACESSO</Text>

        <TouchableOpacity
          style={styles.btnGerar}
          onPress={handleCriarChave}
          disabled={carregando}
        >
          {carregando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="key" size={20} color="#fff" />
              <Text style={styles.btnText}>GERAR NOVA CHAVE MESTRA</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: 40 }]}>
          CHAVES ATIVAS ({chavesDisponiveis.length})
        </Text>

        <FlatList
          data={chavesDisponiveis}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.chaveCard}>
              <View>
                <Text style={styles.chaveCodigo}>{item.codigo}</Text>
                <Text style={styles.chaveSub}>Disponível para uso</Text>
              </View>
              <TouchableOpacity onPress={() => copiarChave(item.codigo)}>
                <Ionicons name="copy-outline" size={22} color="#38bdf8" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Nenhuma chave pendente no sistema.
            </Text>
          }
        />
      </View>

      {/* 🟢 MODAL DE SUCESSO PERSONALIZADO */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalSucesso}
        onRequestClose={() => setModalSucesso(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark-circle" size={50} color="#10b981" />
            </View>

            <Text style={styles.modalTitle}>Chave Criada!</Text>
            <Text style={styles.modalDesc}>
              A nova chave mestra já está disponível no banco de dados.
            </Text>

            <View style={styles.chaveDisplay}>
              <Text style={styles.chaveDisplayText}>{chaveRecemCriada}</Text>
            </View>

            <TouchableOpacity
              style={styles.btnCopiarModal}
              onPress={() => {
                copiarChave(chaveRecemCriada);
                setModalSucesso(false);
              }}
            >
              <Text style={styles.btnTextModal}>COPIAR E FECHAR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 15 }}
              onPress={() => setModalSucesso(false)}
            >
              <Text style={{ color: "#64748b", fontSize: 12 }}>
                FECHAR SEM COPIAR
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617", marginBottom: 50 },
  containerErro: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  textErro: {
    color: "#ef4444",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 25,
    paddingTop: 60,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  content: { flex: 1, padding: 25 },
  label: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 15,
    letterSpacing: 1,
  },
  btnGerar: {
    backgroundColor: "#0ea5e9",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  chaveCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 20,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  chaveCodigo: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  chaveSub: { color: "#64748b", fontSize: 10, marginTop: 2 },
  emptyText: { color: "#64748b", textAlign: "center", marginTop: 20 },

  // ESTILOS DO MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#0f172a",
    borderRadius: 25,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalDesc: {
    color: "#94a3b8",
    textAlign: "center",
    fontSize: 14,
    marginBottom: 25,
    lineHeight: 20,
  },
  chaveDisplay: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 25,
  },
  chaveDisplayText: {
    color: "#38bdf8",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 3,
  },
  btnCopiarModal: {
    backgroundColor: "#38bdf8",
    width: "100%",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  btnTextModal: { color: "#020617", fontWeight: "900", fontSize: 14 },
});
