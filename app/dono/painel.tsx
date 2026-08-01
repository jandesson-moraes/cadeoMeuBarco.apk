import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../services/firebase";

export default function PainelDonoScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  // --- ESTADOS DO PERFIL ---
  const [modalSairVisivel, setModalSairVisivel] = useState(false);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [modalNomeVisivel, setModalNomeVisivel] = useState(false);
  const [inputNome, setInputNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);

  // Busca os dados do usuário ao abrir
  useEffect(() => {
    if (!user) return;
    const userId = user.uid;

    async function carregarDadosUsuario() {
      try {
        const userDoc = await getDoc(doc(db, "usuarios", userId));
        if (userDoc.exists()) {
          const dados = userDoc.data();
          if (dados.fotoPerfil) setFotoPerfil(dados.fotoPerfil);
          if (dados.nome) setNomeUsuario(dados.nome);
        }
      } catch (error) {
        console.error("Erro ao carregar dados do usuário:", error);
      }
    }
    carregarDadosUsuario();
  }, [user]);

  // Alterar Foto de Perfil
  const alterarFoto = async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      return;
    }
    let resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!resultado.canceled && resultado.assets[0].base64) {
      const imagemBase64 = `data:image/jpeg;base64,${resultado.assets[0].base64}`;
      setFotoPerfil(imagemBase64);
      if (user) {
        await updateDoc(doc(db, "usuarios", user.uid), {
          fotoPerfil: imagemBase64,
        });
      }
    }
  };

  // Salvar Novo Nome
  const salvarNovoNome = async () => {
    if (!inputNome.trim() || !user) return;
    setSalvandoNome(true);
    try {
      await setDoc(
        doc(db, "usuarios", user.uid),
        { nome: inputNome },
        { merge: true },
      );
      setNomeUsuario(inputNome);
      setModalNomeVisivel(false);
    } catch (error) {
      console.error(error);
    } finally {
      setSalvandoNome(false);
    }
  };

  // Sair do App
  const confirmarLogout = async () => {
    setModalSairVisivel(false);
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error(error);
    }
  };

  const exibirNome = nomeUsuario || "Comandante";

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 40 }}
      >
        {/* HEADER COM AVATAR */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={alterarFoto}
          >
            {fotoPerfil ? (
              <Image source={{ uri: fotoPerfil }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={50} color="#38bdf8" />
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.nameContainer}
            onPress={() => {
              setInputNome(exibirNome);
              setModalNomeVisivel(true);
            }}
          >
            <Text style={styles.userName}>{exibirNome}</Text>
            <Ionicons name="pencil" size={16} color="#38bdf8" />
          </TouchableOpacity>

          <View
            style={[
              styles.roleBadge,
              { backgroundColor: "rgba(56, 189, 248, 0.2)" },
            ]}
          >
            <Ionicons name="boat" size={12} color="#38bdf8" />
            <Text style={[styles.roleText, { color: "#38bdf8" }]}>
              ARMADOR / COMANDANTE
            </Text>
          </View>
        </View>

        {/* MEU COMANDO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEU COMANDO</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/dados-passageiro")}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: "rgba(16, 185, 129, 0.1)" },
              ]}
            >
              <Ionicons name="person-outline" size={22} color="#10b981" />
            </View>
            {/* 🟢 NOME ATUALIZADO AQUI */}
            <Text style={styles.menuText}>Meu Perfil (Senha e Acesso)</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>
        </View>

        {/* GESTÃO DA FROTA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GESTÃO DA FROTA</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/(tabs)/config-barco")}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: "rgba(236, 72, 153, 0.1)" },
              ]}
            >
              <Ionicons name="images-outline" size={22} color="#ec4899" />
            </View>
            {/* 🟢 NOME ATUALIZADO AQUI */}
            <Text style={styles.menuText}>Perfil do Barco & Marketing</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/(tabs)/config-barco")}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: "rgba(56, 189, 248, 0.1)" },
              ]}
            >
              <Ionicons name="calendar-outline" size={22} color="#38bdf8" />
            </View>
            <Text style={styles.menuText}>
              Grade de Viagens (Preços e Rotas)
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/validador")}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: "rgba(245, 158, 11, 0.1)" },
              ]}
            >
              <Ionicons name="qr-code-outline" size={22} color="#f59e0b" />
            </View>
            <Text style={styles.menuText}>Validar Bilhete de Embarque</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push("/relatorio-vendas")}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: "rgba(139, 92, 246, 0.1)" },
              ]}
            >
              <Ionicons name="bar-chart-outline" size={22} color="#8b5cf6" />
            </View>
            <Text style={styles.menuText}>Relatórios de Venda (Viagens)</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>
        </View>

        {/* APLICATIVO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APLICATIVO</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => Linking.openURL("https://wa.me/55929XXXXXXXX")}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: "rgba(100, 116, 139, 0.1)" },
              ]}
            >
              <Ionicons name="help-buoy-outline" size={22} color="#64748b" />
            </View>
            <Text style={styles.menuText}>Suporte Técnico do App</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>

          {auth.currentUser?.email === "jandessonmoraes@gmail.com" && (
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => router.push("/admin/gerador")}
            >
              <Ionicons name="shield-half" size={20} color="#38bdf8" />
              <Text style={styles.adminBtnText}>GERAR TOKEN</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => setModalSairVisivel(true)}
          >
            <Ionicons name="log-out-outline" size={22} color="#ef4444" />
            <Text style={styles.logoutText}>Desembarcar (Sair da Conta)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL NOME */}
      <Modal animationType="fade" transparent={true} visible={modalNomeVisivel}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar Nome</Text>
            <TextInput
              style={styles.modalInput}
              value={inputNome}
              onChangeText={setInputNome}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setModalNomeVisivel(false)}
              >
                <Text style={styles.btnCancelText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnConfirm}
                onPress={salvarNovoNome}
                disabled={salvandoNome}
              >
                {salvandoNome ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.btnConfirmText}>SALVAR</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL SAIR */}
      <Modal animationType="fade" transparent={true} visible={modalSairVisivel}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Desembarcar?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setModalSairVisivel(false)}
              >
                <Text style={styles.btnCancelText}>NÃO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnConfirm, { backgroundColor: "#ef4444" }]}
                onPress={confirmarLogout}
              >
                <Text style={[styles.btnConfirmText, { color: "#fff" }]}>
                  SIM, SAIR
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  header: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#0f172a",
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#38bdf8",
    marginBottom: 15,
    position: "relative",
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 45 },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#38bdf8",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0f172a",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  userName: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 2,
  },
  roleText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  section: { marginTop: 25, paddingHorizontal: 20 },
  sectionTitle: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 15,
    marginLeft: 5,
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  menuText: { flex: 1, color: "#f8fafc", fontSize: 15, fontWeight: "500" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 10,
  },
  logoutText: { color: "#ef4444", fontWeight: "bold" },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#0f172a",
    width: "100%",
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  modalInput: {
    backgroundColor: "#1e293b",
    color: "#fff",
    width: "100%",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 20,
  },
  modalButtons: { flexDirection: "row", gap: 10, width: "100%" },
  btnCancel: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#1e293b",
    alignItems: "center",
  },
  btnCancelText: { color: "#fff", fontWeight: "bold" },
  btnConfirm: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#38bdf8",
    alignItems: "center",
  },
  btnConfirmText: { color: "#0f172a", fontWeight: "bold" },
  adminBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    padding: 15,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#38bdf8",
    gap: 10,
  },
  adminBtnText: { color: "#38bdf8", fontWeight: "bold", fontSize: 14 },
});
