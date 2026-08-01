import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { deleteField, doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
import { auth, db } from "../services/firebase";

type EstadoIbge = {
  id: number;
  sigla: string;
  nome: string;
};

type MunicipioIbge = {
  id: number;
  nome: string;
};

export default function DadosPassageiro() {
  const router = useRouter();
  const user = auth.currentUser;

  const [nome, setNome] = useState("");
  const [estadoSigla, setEstadoSigla] = useState("");
  const [estadoNome, setEstadoNome] = useState("");
  const [cidadeNome, setCidadeNome] = useState("");
  const [cidadeCodigoIbge, setCidadeCodigoIbge] = useState("");

  const [estados, setEstados] = useState<EstadoIbge[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioIbge[]>([]);
  const [modalEstadosAberto, setModalEstadosAberto] = useState(false);
  const [modalCidadesAberto, setModalCidadesAberto] = useState(false);
  const [buscandoEstados, setBuscandoEstados] = useState(false);
  const [buscandoCidades, setBuscandoCidades] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [aviso, setAviso] = useState({
    visivel: false,
    titulo: "",
    mensagem: "",
    tipo: "erro" as "erro" | "sucesso" | "aviso",
  });

  const [isComandante, setIsComandante] = useState(false);

  const exibirAviso = (
    titulo: string,
    mensagem: string,
    tipo: "erro" | "sucesso" | "aviso" = "erro",
  ) => {
    setAviso({ visivel: true, titulo, mensagem, tipo });
  };

  const carregarEstadosIbge = async () => {
    try {
      setBuscandoEstados(true);
      const resposta = await fetch(
        "https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome",
      );
      const lista = await resposta.json();
      setEstados(Array.isArray(lista) ? lista : []);
    } catch (error) {
      console.log("Erro ao carregar estados do IBGE:", error);
      exibirAviso(
        "Erro",
        "Não foi possível carregar a lista de estados. Verifique sua internet e tente novamente.",
        "erro",
      );
    } finally {
      setBuscandoEstados(false);
    }
  };

  const carregarMunicipiosIbge = async (uf: string) => {
    if (!uf) return;

    try {
      setBuscandoCidades(true);
      setMunicipios([]);

      const resposta = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
      );
      const lista = await resposta.json();
      setMunicipios(Array.isArray(lista) ? lista : []);
    } catch (error) {
      console.log("Erro ao carregar cidades do IBGE:", error);
      exibirAviso(
        "Erro",
        "Não foi possível carregar a lista de cidades. Verifique sua internet e tente novamente.",
        "erro",
      );
    } finally {
      setBuscandoCidades(false);
    }
  };

  useEffect(() => {
    carregarEstadosIbge();
  }, []);

  useEffect(() => {
    const carregarPerfil = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, "usuarios", auth.currentUser.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const dados = snap.data();
          setIsComandante(
            dados.tipo === "dono" ||
              auth.currentUser.email === "jandessonmoraes@gmail.com",
          );
        }
      }
    };
    carregarPerfil();
  }, []);

  useEffect(() => {
    async function carregarDados() {
      try {
        if (!user) return;

        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const dados = docSnap.data();
          const ufSalva = String(dados.estadoResidencia || "").trim();

          setNome(dados.nome || "");
          setEstadoSigla(ufSalva);
          setEstadoNome(String(dados.estadoResidenciaNome || "").trim());
          setCidadeNome(String(dados.cidadeResidencia || "").trim());
          setCidadeCodigoIbge(String(dados.cidadeResidenciaCodigoIbge || ""));

          if (ufSalva) {
            carregarMunicipiosIbge(ufSalva);
          }
        }
      } catch (error) {
        console.log("Erro ao buscar dados no Firebase:", error);
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, [user]);

  const selecionarEstado = (estado: EstadoIbge) => {
    setEstadoSigla(estado.sigla);
    setEstadoNome(estado.nome);
    setCidadeNome("");
    setCidadeCodigoIbge("");
    setModalEstadosAberto(false);
    carregarMunicipiosIbge(estado.sigla);
  };

  const selecionarCidade = (municipio: MunicipioIbge) => {
    setCidadeNome(municipio.nome);
    setCidadeCodigoIbge(String(municipio.id));
    setModalCidadesAberto(false);
  };

  const salvarDados = async () => {
    if (!user) return;

    if (!nome.trim() || nome.trim().split(" ").length < 2) {
      exibirAviso("Aviso", "Informe seu nome completo.", "aviso");
      return;
    }

    if (!estadoSigla || !estadoNome) {
      exibirAviso("Aviso", "Selecione o estado onde você mora.", "aviso");
      return;
    }

    if (!cidadeNome || !cidadeCodigoIbge) {
      exibirAviso("Aviso", "Selecione a cidade onde você mora.", "aviso");
      return;
    }

    setSalvando(true);

    try {
      await setDoc(
        doc(db, "usuarios", user.uid),
        {
          nome: nome.trim(),
          email: user.email || "",
          cidadeResidencia: cidadeNome,
          estadoResidencia: estadoSigla,
          estadoResidenciaNome: estadoNome,
          cidadeResidenciaCompleta: `${cidadeNome} - ${estadoSigla}`,
          cidadeResidenciaCodigoIbge: cidadeCodigoIbge,
          cidadeResidenciaFonte: "ibge",
          cidadeResidenciaAtualizadaEm: new Date().toISOString(),
          cpf: deleteField(),
          nascimento: deleteField(),
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true },
      );

      exibirAviso(
        "Atualizado! ⚓",
        "Seu perfil foi atualizado com sucesso.",
        "sucesso",
      );
    } catch (error) {
      exibirAviso(
        "Erro",
        "Não foi possível salvar os dados. Tente novamente.",
        "erro",
      );
    } finally {
      setSalvando(false);
    }
  };

  const fecharModal = () => {
    const eraSucesso = aviso.tipo === "sucesso";
    setAviso({ ...aviso, visivel: false });
    if (eraSucesso) {
      router.back();
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

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
              onPress={fecharModal}
            >
              <Text style={styles.alertBtnText}>ENTENDIDO</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={modalEstadosAberto}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Selecione o estado</Text>
              <TouchableOpacity onPress={() => setModalEstadosAberto(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {buscandoEstados ? (
              <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {estados.map((estado) => (
                  <TouchableOpacity
                    key={estado.id}
                    style={styles.listaItem}
                    onPress={() => selecionarEstado(estado)}
                  >
                    <Text style={styles.listaItemTexto}>
                      {estado.nome} - {estado.sigla}
                    </Text>
                    {estado.sigla === estadoSigla && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#38bdf8"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={modalCidadesAberto}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Selecione a cidade</Text>
              <TouchableOpacity onPress={() => setModalCidadesAberto(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {buscandoCidades ? (
              <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {municipios.map((municipio) => (
                  <TouchableOpacity
                    key={municipio.id}
                    style={styles.listaItem}
                    onPress={() => selecionarCidade(municipio)}
                  >
                    <Text style={styles.listaItemTexto}>{municipio.nome}</Text>
                    {String(municipio.id) === cidadeCodigoIbge && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#38bdf8"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.title}>Meus Dados</Text>
        <Text style={styles.subtitle}>
          {isComandante
            ? "Informações básicas do seu perfil de comando."
            : "Informações básicas do seu perfil no app."}
        </Text>

        <View style={styles.privacidadeBox}>
          <View style={styles.privacidadeIcone}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color="#38bdf8"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacidadeTitulo}>Privacidade protegida</Text>
            <Text style={styles.privacidadeTexto}>
              CPF e data de nascimento não são salvos nesta área do perfil.
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>NOME COMPLETO</Text>
          <TextInput
            style={styles.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Nome do passageiro"
            placeholderTextColor="#64748b"
            autoCapitalize="words"
          />

          <Text style={styles.label}>ESTADO</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setModalEstadosAberto(true)}
          >
            <Text
              style={[styles.selectTexto, !estadoSigla && styles.placeholder]}
            >
              {estadoSigla
                ? `${estadoNome || estadoSigla} - ${estadoSigla}`
                : "Selecione o estado"}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#38bdf8" />
          </TouchableOpacity>

          <Text style={styles.label}>CIDADE</Text>
          <TouchableOpacity
            style={[
              styles.selectInput,
              !estadoSigla && styles.selectInputDisabled,
            ]}
            onPress={() => {
              if (!estadoSigla) {
                exibirAviso("Aviso", "Selecione primeiro o estado.", "aviso");
                return;
              }
              setModalCidadesAberto(true);
            }}
          >
            <Text
              style={[styles.selectTexto, !cidadeNome && styles.placeholder]}
            >
              {cidadeNome || "Selecione a cidade"}
            </Text>
            {buscandoCidades ? (
              <ActivityIndicator size="small" color="#38bdf8" />
            ) : (
              <Ionicons name="chevron-down" size={20} color="#38bdf8" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={salvarDados}
            disabled={salvando}
          >
            {salvando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>SALVAR PERFIL</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  scroll: { padding: 25, paddingTop: 60 },
  backBtn: { marginBottom: 20 },
  title: { color: "#fff", fontSize: 28, fontWeight: "bold" },
  subtitle: { color: "#94a3b8", fontSize: 14, marginTop: 5, marginBottom: 22 },
  form: { gap: 18 },
  label: { color: "#38bdf8", fontSize: 11, fontWeight: "bold" },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 18,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  selectInput: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectInputDisabled: {
    opacity: 0.65,
  },
  selectTexto: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
  },
  placeholder: {
    color: "#64748b",
    fontWeight: "400",
  },
  saveBtn: {
    backgroundColor: "#38bdf8",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  privacidadeBox: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 26,
  },
  privacidadeIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  privacidadeTitulo: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  privacidadeTexto: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    maxHeight: "78%",
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  listaItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listaItemTexto: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "600",
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
});
