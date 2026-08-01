import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
// 🟢 Adicionado imports do Firestore
import { doc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// 🟢 Importando o db junto com o auth
import { auth, db } from "../services/firebase";
import { definirCredenciaisLoginTemporarias } from "../services/credenciaisLoginTemporarias";

export default function CadastroScreen() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [termosAceitos, setTermosAceitos] = useState(false);

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

  const handleCriarConta = async () => {
    if (!nome || !email || !senha) {
      exibirAviso("Aviso", "Por favor, preencha todos os campos.", "aviso");
      return;
    }

    setCarregando(true);

    try {
      const emailNormalizado = email.toLowerCase().trim();

      // 1. Cria o acesso no Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        emailNormalizado,
        senha,
      );
      const user = userCredential.user;

      // 2. 🟢 Cria o documento na coleção "usuarios" no Firestore
      await setDoc(doc(db, "usuarios", user.uid), {
        nome: nome,
        email: emailNormalizado,
        tipo: "passageiro", // Padrão inicial
        id_barco_vinculado: null,
        data_criacao: new Date().toISOString(),
      });

      // Guarda os dados somente na memória, por poucos minutos.
      // Eles não são gravados no AsyncStorage nem em arquivos do aparelho.
      definirCredenciaisLoginTemporarias(
        emailNormalizado,
        senha,
      );

      // createUserWithEmailAndPassword autentica automaticamente.
      // Encerramos essa sessão para o usuário confirmar a entrada na tela de login.
      try {
        await signOut(auth);
      } catch (erroSignOut) {
        console.log(
          "Não foi possível encerrar a sessão automática do cadastro:",
          erroSignOut,
        );
      }

      setCarregando(false);

      exibirAviso(
        "Sucesso! ⚓",
        "Sua conta foi criada. Seus dados já estão prontos na tela de login.",
        "sucesso",
      );
    } catch (error: any) {
      setCarregando(false);
      if (error.code === "auth/email-already-in-use") {
        exibirAviso(
          "Aviso",
          "Este e-mail já possui uma passagem comprada (já está em uso).",
          "aviso",
        );
      } else if (error.code === "auth/weak-password") {
        exibirAviso(
          "Aviso",
          "A senha é muito fraca. Use pelo menos 6 caracteres.",
          "aviso",
        );
      } else {
        console.error(error);
        exibirAviso(
          "Erro",
          "Não foi possível criar a conta no banco de dados. Verifique sua conexão.",
          "erro",
        );
      }
    }
  };

  const fecharModalESair = () => {
    const eraSucesso = aviso.tipo === "sucesso";
    setAviso({ ...aviso, visivel: false });
    if (eraSucesso) {
      router.replace("/login");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ headerShown: false }} />

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
              onPress={fecharModalESair}
            >
              <Text style={styles.alertBtnText}>
                {aviso.tipo === "sucesso" ? "ENTRAR NO BARCO" : "ENTENDIDO"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Criar Conta</Text>
          <Text style={styles.subtitle}>Junte-se à nossa frota.</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>NOME COMPLETO</Text>
          <View style={styles.inputBox}>
            <Ionicons
              name="person-outline"
              size={20}
              color="#64748b"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Como quer ser chamado?"
              placeholderTextColor="#64748b"
              autoCapitalize="words"
              value={nome}
              onChangeText={setNome}
            />
          </View>

          <Text style={styles.label}>E-MAIL</Text>
          <View style={styles.inputBox}>
            <Ionicons
              name="mail-outline"
              size={20}
              color="#64748b"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Digite seu melhor e-mail"
              placeholderTextColor="#64748b"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.label}>CRIE UMA SENHA</Text>
          <View style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color="#64748b"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Mínimo de 6 caracteres"
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

          <TouchableOpacity
            style={styles.termosContainer}
            activeOpacity={0.7}
            onPress={() => setTermosAceitos(!termosAceitos)}
          >
            <Ionicons
              name={termosAceitos ? "checkbox" : "square-outline"}
              size={24}
              color={termosAceitos ? "#10b981" : "#64748b"}
            />
            <Text style={styles.termosText}>
              Li e concordo com os{" "}
              <Text
                style={styles.termosLink}
                onPress={() => router.push("/termos")}
              >
                Termos de Uso
              </Text>{" "}
              e a{" "}
              <Text
                style={styles.termosLink}
                onPress={() =>
                  Linking.openURL(
                    "https://sites.google.com/view/privacidade-cadeomeubarco/in%C3%ADcio",
                  )
                }
              >
                Política de Privacidade
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.registerBtn, !termosAceitos && styles.btnDesativado]}
            onPress={handleCriarConta}
            disabled={carregando || !termosAceitos}
          >
            {carregando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.registerBtnText}>FINALIZAR CADASTRO</Text>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem uma conta?</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.loginText}>Faça Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  scrollContainer: { flexGrow: 1, padding: 25, justifyContent: "center" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
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
    borderColor: "rgba(56, 189, 248, 0.2)",
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

  backBtn: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  header: { marginTop: 80, marginBottom: 40 },
  title: { color: "#fff", fontSize: 32, fontWeight: "bold", letterSpacing: 1 },
  subtitle: { color: "#38bdf8", fontSize: 16, marginTop: 5, fontWeight: "600" },
  formContainer: { width: "100%" },
  label: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
    marginLeft: 5,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 18 },
  eyeIcon: { padding: 10 },

  termosContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 5,
    gap: 10,
  },
  termosText: {
    color: "#94a3b8",
    fontSize: 14,
    flex: 1,
  },
  termosLink: {
    color: "#38bdf8",
    fontWeight: "bold",
    textDecorationLine: "underline",
  },

  registerBtn: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    marginTop: 10,
    gap: 10,
    elevation: 5,
  },
  btnDesativado: {
    backgroundColor: "#1e293b",
    elevation: 0,
  },
  registerBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 40,
    gap: 5,
  },
  footerText: { color: "#94a3b8", fontSize: 14 },
  loginText: { color: "#38bdf8", fontSize: 14, fontWeight: "bold" },
});
