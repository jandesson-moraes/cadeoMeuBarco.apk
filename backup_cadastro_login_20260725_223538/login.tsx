import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import * as Linking from "expo-linking";
import { auth } from "../services/firebase";
import { registrarParaNotificacoesPush } from "../services/notificationService";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [lembrarMe, setLembrarMe] = useState(false);
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false);

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

  const registrarPushDoUsuario = async (
    uid: string,
    emailUsuario: string | null,
  ) => {
    try {
      await registrarParaNotificacoesPush({
        uid,
        email: emailUsuario,
      });
    } catch (error) {
      console.log("⚠️ Não foi possível vincular push token ao usuário:", error);
    }
  };

  const handleBiometria = async () => {
    if (Platform.OS === "web") return;

    try {
      const emailSalvo = await AsyncStorage.getItem("@user_email");
      const senhaSalva = await SecureStore.getItemAsync("user_password");

      if (emailSalvo && senhaSalva) {
        const autenticou = await LocalAuthentication.authenticateAsync({
          promptMessage: "Entrar no Cadê Meu Barco",
          cancelLabel: "Usar Senha",
        });

        if (autenticou.success) {
          setCarregando(true);

          const credencial = await signInWithEmailAndPassword(
            auth,
            emailSalvo,
            senhaSalva,
          );

          await registrarPushDoUsuario(
            credencial.user.uid,
            credencial.user.email,
          );

          router.replace("/(tabs)");
        }
      }
    } catch (error) {
      console.log("Erro biometria:", error);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    const limparEstadoDeNavegacao = async () => {
      await AsyncStorage.multiRemove([
        "@barco_selecionado",
        "@porto_selecionado",
        "@rota_atual",
        "@linha_rota",
        "@polyline_rota",
        "@destino_selecionado",
        "@tempo_aviso",
      ]);
    };

    const inicializarLogin = async () => {
      try {
        await limparEstadoDeNavegacao();

        const emailSalvo = await AsyncStorage.getItem("@user_email");

        if (emailSalvo) {
          setEmail(emailSalvo);
          setLembrarMe(true);

          if (Platform.OS !== "web") {
            const senhaSalva = await SecureStore.getItemAsync("user_password");

            if (senhaSalva) {
              setSenha(senhaSalva);

              const biometriaAtivadaNoPerfil = await AsyncStorage.getItem(
                "@config_biometria_ativa",
              );

              const compativel = await LocalAuthentication.hasHardwareAsync();
              const cadastrado = await LocalAuthentication.isEnrolledAsync();

              setBiometriaDisponivel(compativel && cadastrado);

              if (
                biometriaAtivadaNoPerfil === "true" &&
                compativel &&
                cadastrado
              ) {
                handleBiometria();
              }
            }
          }
        }
      } catch (e) {
        console.error("Erro na inicialização", e);
      }
    };

    inicializarLogin();
  }, []);

  const handleLogin = async () => {
    if (!email || !senha) {
      exibirAviso("Aviso", "Preencha o e-mail e a senha.", "aviso");
      return;
    }

    setCarregando(true);

    try {
      const credencial = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        senha,
      );

      await registrarPushDoUsuario(credencial.user.uid, credencial.user.email);

      if (lembrarMe) {
        await AsyncStorage.setItem("@user_email", email.trim());
        if (Platform.OS !== "web") {
          await SecureStore.setItemAsync("user_password", senha);
        }
      } else {
        await AsyncStorage.removeItem("@user_email");
        if (Platform.OS !== "web") {
          await SecureStore.deleteItemAsync("user_password");
        }
        await AsyncStorage.removeItem("@config_biometria_ativa");
      }

      router.replace("/(tabs)");
    } catch (error: any) {
      console.log("ERRO LOGIN:", error.code, error.message);

      if (error.code === "auth/too-many-requests") {
        alert(
          "Muitas tentativas de login. Aguarde alguns minutos ou redefina sua senha antes de tentar novamente.",
        );
        return;
      }

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        alert("E-mail ou senha incorretos.");
        return;
      }

      alert(error.message || "Erro ao entrar no app.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <LinearGradient
      colors={["#020617", "#0f172a", "#020617"]}
      style={styles.container}
    >
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require("../assets/logo_barco.png")}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.title}>Cadê Meu Barco</Text>
            <Text style={styles.subtitle}>
              <Text style={{ fontWeight: "600", color: "#38bdf8" }}>
                A sua viagem começa aqui!
              </Text>
            </Text>
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.label}>E-MAIL</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="mail-outline"
                size={20}
                color="#38bdf8"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="seu@email.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <Text style={styles.label}>SENHA</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#38bdf8"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Sua senha secreta"
                placeholderTextColor="#64748b"
                secureTextEntry={!mostrarSenha}
                value={senha}
                onChangeText={setSenha}
              />
              <TouchableOpacity
                onPress={() => setMostrarSenha(!mostrarSenha)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={mostrarSenha ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.utilsContainer}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setLembrarMe(!lembrarMe)}
              >
                <Ionicons
                  name={lembrarMe ? "checkbox" : "square-outline"}
                  size={20}
                  color={lembrarMe ? "#38bdf8" : "#64748b"}
                />
                <Text style={styles.rememberText}>Lembrar-me</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(
                    "https://sistema-navegacao.vercel.app/redefinir-senha",
                  )
                }
              >
                <Text style={styles.forgotText}>Esqueceu a senha?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleLogin} disabled={carregando}>
              <LinearGradient
                colors={["#38bdf8", "#0284c7"]}
                style={styles.loginBtn}
              >
                {carregando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.loginBtnText}>ENTRAR NO BARCO</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {biometriaDisponivel && senha.length > 0 && (
              <TouchableOpacity
                onPress={handleBiometria}
                style={{ marginTop: 20, alignItems: "center" }}
              >
                <Text
                  style={{
                    color: "#64748b",
                    fontSize: 13,
                    textDecorationLine: "underline",
                  }}
                >
                  Entrar com digital
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Ainda não tem conta?</Text>
            <TouchableOpacity onPress={() => router.push("/cadastro")}>
              <Text style={styles.signUpText}>Crie sua conta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flexGrow: 1, padding: 25, justifyContent: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  alertCard: {
    backgroundColor: "#0f172a",
    width: "90%",
    borderRadius: 25,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#38bdf844",
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
  header: { alignItems: "center", marginBottom: 20 },
  logoContainer: {
    width: 110,
    height: 110,
    borderRadius: 25,
    overflow: "hidden",
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "#38bdf8",
    backgroundColor: "#020617",
  },
  logoImage: { width: "100%", height: "100%" },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    marginTop: 1,
    paddingHorizontal: 20,
  },
  glassCard: {
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.1)",
  },
  label: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 5,
    marginLeft: 5,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 23, 0.5)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 18 },
  eyeIcon: { padding: 10 },
  utilsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rememberText: { color: "#94a3b8", fontSize: 13 },
  forgotText: { color: "#cbd5e1", fontSize: 13, fontWeight: "bold" },
  loginBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    gap: 10,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 40,
    gap: 5,
  },
  footerText: { color: "#94a3b8", fontSize: 14 },
  signUpText: { color: "#38bdf8", fontSize: 14, fontWeight: "bold" },
});
