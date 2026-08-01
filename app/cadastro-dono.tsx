import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

// Importando a conexão que configuramos acima
import { auth, db } from "../services/firebase";

export default function CadastroDonoScreen() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [chaveSeguranca, setChaveSeguranca] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);

  // 🟢 ESTADO DO MODAL PROFISSIONAL
  const [aviso, setAviso] = useState<{
    visivel: boolean;
    titulo: string;
    mensagem: string;
    tipo: "erro" | "sucesso" | "aviso";
    acao?: () => void; // Permite executar uma ação ao fechar (ex: mudar de tela)
  }>({
    visivel: false,
    titulo: "",
    mensagem: "",
    tipo: "erro",
  });

  const exibirAviso = (
    titulo: string,
    mensagem: string,
    tipo: "erro" | "sucesso" | "aviso" = "erro",
    acao?: () => void,
  ) => {
    setAviso({ visivel: true, titulo, mensagem, tipo, acao });
  };

  const handleCadastroDono = async () => {
    // 1. Verificação de campos vazios
    if (!nome || !email || !senha || !chaveSeguranca) {
      exibirAviso(
        "Atenção",
        "Preencha todos os campos para continuar.",
        "aviso",
      );
      return;
    }

    setCarregando(true);

    // 2. Cronômetro de segurança
    const timeout = setTimeout(() => {
      setCarregando(false);
      exibirAviso(
        "Tempo Esgotado",
        "O servidor não respondeu. Verifique sua conexão ou tente novamente.",
        "erro",
      );
    }, 12000);

    try {
      // PASSO A: Validar a Chave Secreta no Firestore
      const q = query(
        collection(db, "chaves_mestras"),
        where("codigo", "==", chaveSeguranca.trim()),
        where("usada", "==", false),
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        clearTimeout(timeout);
        setCarregando(false);
        exibirAviso(
          "Chave Inválida",
          "Código incorreto ou já utilizado.",
          "erro",
        );
        return;
      }

      const chaveDocRef = querySnapshot.docs[0].ref;

      // PASSO B: Criar o usuário no Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        senha,
      );
      const user = userCredential.user;

      // PASSO C: Gravar o perfil de 'dono' no Firestore
      await setDoc(doc(db, "usuarios", user.uid), {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        tipo: "dono",
        dataCadastro: new Date().toISOString(),
      });

      // PASSO D: Marcar a chave como usada
      await updateDoc(chaveDocRef, {
        usada: true,
        usadoPor: email.trim(),
      });

      // SUCESSO TOTAL
      clearTimeout(timeout);
      setCarregando(false);

      // 🟢 Modal de Sucesso com redirecionamento ao clicar em "Entendido"
      exibirAviso(
        "Comandante Registrado! 🛳️",
        "Sua conta de dono foi criada com sucesso.",
        "sucesso",
        () => router.replace("/dono/painel"),
      );
    } catch (error: any) {
      clearTimeout(timeout);
      setCarregando(false);
      console.error(error);

      // Tratamento de erros específicos para dar feedback ao usuário
      let mensagemErro = "Ocorreu um erro inesperado.";
      if (error.code === "auth/email-already-in-use")
        mensagemErro = "Este e-mail já está cadastrado.";
      if (error.code === "auth/weak-password")
        mensagemErro = "A senha é muito fraca (mínimo 6 caracteres).";
      if (error.code === "permission-denied")
        mensagemErro = "Acesso negado pelo banco de dados.";

      exibirAviso("Falha no Cadastro", mensagemErro, "erro");
    }
  };

  return (
    <>
      {/* 🟢 MODAL DE AVISO RENDERIZADO AQUI */}
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
              onPress={() => {
                setAviso((prev) => ({ ...prev, visivel: false }));
                if (aviso.acao) aviso.acao(); // Executa a rota se for sucesso
              }}
            >
              <Text style={styles.alertBtnText}>ENTENDIDO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* 🟢 ESCONDE A BARRA PADRÃO */}
        <Stack.Screen options={{ headerShown: false }} />

        {/* 🟢 SCROLLVIEW E SETA AZUL ÚNICOS (NÓ DESATADO) */}
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#38bdf8" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Novo Comandante</Text>
            <Text style={styles.subtitle}>Crie seu acesso administrativo</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Nome Completo"
              placeholderTextColor="#64748b"
              value={nome}
              onChangeText={setNome}
            />
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor="#64748b"
              secureTextEntry={!mostrarSenha}
              value={senha}
              onChangeText={setSenha}
            />
            <TextInput
              style={[styles.input, { borderColor: "#38bdf8" }]}
              placeholder="Chave de Segurança (BARCO-XXXXXX)"
              placeholderTextColor="#38bdf8"
              value={chaveSeguranca}
              onChangeText={setChaveSeguranca}
            />

            <TouchableOpacity
              style={styles.btn}
              onPress={handleCadastroDono}
              disabled={carregando}
            >
              {carregando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>CADASTRAR DONO</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  scrollContainer: { padding: 25, paddingTop: 60 },
  backBtn: { marginBottom: 20 },
  header: { marginBottom: 30 },
  title: { color: "#fff", fontSize: 26, fontWeight: "bold" },
  subtitle: { color: "#94a3b8", fontSize: 14 },
  form: { gap: 15 },
  input: {
    backgroundColor: "#0f172a",
    color: "#fff",
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  btn: {
    backgroundColor: "#38bdf8",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  // 🟢 ESTILOS DO MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.85)",
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
    textAlign: "center",
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
  alertBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
