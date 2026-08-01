import { FontAwesome, Ionicons } from "@expo/vector-icons";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../services/firebase";

const LISTA_PORTOS_PADRAO = [
  "Manaus - AM",
  "Itacoatiara - AM",
  "Parintins - AM",
  "Tefé - AM",
  "Coari - AM",
  "Tabatinga - AM",
  "Juruti - PA",
  "Óbidos - PA",
  "Oriximiná - PA",
  "Santarém - PA",
  "Alenquer - PA",
  "Monte Alegre - PA",
  "Prainha - PA",
  "Almeirim - PA",
  "Macapá - AP",
  "Belém - PA",
];

const LISTA_HORARIOS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
    .toString()
    .padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

const LISTA_DIAS_RELATIVOS = [
  { valor: "0", label: "0 (Mesmo dia)" },
  { valor: "1", label: "1 (Dia seguinte)" },
  { valor: "2", label: "2 (Dois dias depois)" },
  { valor: "3", label: "3 (Três dias depois)" },
  { valor: "4", label: "4 (Quatro dias depois)" },
  { valor: "5", label: "5 (Cinco dias depois)" },
  { valor: "6", label: "6 (Seis dias depois)" },
  { valor: "7", label: "7 (Sete dias depois)" },
];

const DIAS_PADRAO = [
  { id: 0, nome: "Dom", ativo: false },
  { id: 1, nome: "Seg", ativo: false },
  { id: 2, nome: "Ter", ativo: false },
  { id: 3, nome: "Qua", ativo: false },
  { id: 4, nome: "Qui", ativo: false },
  { id: 5, nome: "Sex", ativo: false },
  { id: 6, nome: "Sáb", ativo: false },
];

function clonarDiasPadrao() {
  return JSON.parse(JSON.stringify(DIAS_PADRAO));
}

function normalizarDiasSemana(valor: any) {
  if (Array.isArray(valor)) {
    return DIAS_PADRAO.map((diaPadrao) => {
      const encontrado = valor.find(
        (dia: any) => Number(dia?.id) === diaPadrao.id,
      );
      return {
        ...diaPadrao,
        ativo: encontrado?.ativo === true,
      };
    });
  }

  if (valor && typeof valor === "object") {
    const mapaNomes: Record<string, string[]> = {
      Dom: ["domingo", "dom"],
      Seg: ["segunda", "segunda-feira", "seg"],
      Ter: ["terca", "terça", "terça-feira", "ter"],
      Qua: ["quarta", "quarta-feira", "qua"],
      Qui: ["quinta", "quinta-feira", "qui"],
      Sex: ["sexta", "sexta-feira", "sex"],
      Sáb: ["sabado", "sábado", "sab"],
    };

    return DIAS_PADRAO.map((diaPadrao) => {
      const chaves = mapaNomes[diaPadrao.nome] || [];
      const ativo = chaves.some((chave) => valor[chave] === true);

      return {
        ...diaPadrao,
        ativo,
      };
    });
  }

  return clonarDiasPadrao();
}

function normalizarEscalas(valor: any) {
  if (!Array.isArray(valor)) return [];

  return valor.map((escala: any, index: number) => {
    const porto =
      escala?.porto ||
      escala?.nome ||
      escala?.local ||
      escala?.cidade ||
      `Parada ${index + 1}`;

    return {
      id: escala?.id || Date.now() + index,
      porto: String(porto || "")
        .replace(/⚓/g, "")
        .trim(),
      diaRelativo: String(
        escala?.diaRelativo ?? escala?.dias_apos_saida ?? "0",
      ),
      horario: String(escala?.horario ?? escala?.horario_chegada ?? "12:00"),
      precoRede: String(escala?.precoRede ?? escala?.preco_da_origem ?? ""),
      precoPoltrona: String(
        escala?.precoPoltrona ?? escala?.preco_poltrona ?? "",
      ),
      precoSuite: String(escala?.precoSuite ?? escala?.preco_suite ?? ""),
      precoRefeicao: String(
        escala?.precoRefeicao ?? escala?.preco_refeicao ?? "",
      ),
    };
  });
}

function normalizarRota(valor: any, padrao: any, sentido: "ida" | "volta") {
  const rota = valor && typeof valor === "object" ? valor : {};

  return {
    ...padrao,
    ...rota,
    sentido,
    portoOrigem: rota.portoOrigem || rota.origem || padrao.portoOrigem,
    horarioSaida:
      rota.horarioSaida || rota.horario_saida || padrao.horarioSaida,
    diasSemana: normalizarDiasSemana(rota.diasSemana || rota.dias_da_semana),
    escalas: normalizarEscalas(rota.escalas || rota.itinerario),
  };
}

const gerarIdBarco = (nome: string) => {
  return nome
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
};

export default function MegaPainelBarco() {
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [statusSave, setStatusSave] = useState<"idle" | "loading" | "success">(
    "idle",
  );
  const [abaAtiva, setAbaAtiva] = useState<"barco" | "ida" | "volta">("barco");

  const [listaBarcosDin, setListaBarcosDin] = useState<string[]>([]);
  const [listaPortosDin, setListaPortosDin] =
    useState<string[]>(LISTA_PORTOS_PADRAO);

  const [novoPortoInput, setNovoPortoInput] = useState("");

  const [nomeBarco, setNomeBarco] = useState("");
  const [barcoId, setBarcoId] = useState("");

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

  const [capacidade, setCapacidade] = useState({
    rede: "",
    poltrona: "",
    suite: "",
  });

  const [rotaIda, setRotaIda] = useState({
    portoOrigem: "Manaus - AM",
    horarioSaida: "11:00",
    diasSemana: clonarDiasPadrao(),
    escalas: [] as any[],
  });

  const [rotaVolta, setRotaVolta] = useState({
    portoOrigem: "Santarém - PA",
    horarioSaida: "06:00",
    diasSemana: clonarDiasPadrao(),
    escalas: [] as any[],
  });

  const [modalConfig, setModalConfig] = useState({
    visible: false,
    tipo: "porto",
    campo: "",
    escalaId: null as number | null,
  });

  useEffect(() => {
    if (!user) return;

    const qBarcos = query(
      collection(db, "embarcacoes"),
      where("ownerId", "==", user.uid),
    );

    const unsubBarcos = onSnapshot(qBarcos, (snap) => {
      const barcosBd = snap.docs.map((doc) => doc.data().nome).filter(Boolean);
      setListaBarcosDin(Array.from(new Set(barcosBd)));
    });

    const unsubPortos = onSnapshot(collection(db, "portos"), (snap) => {
      // 🟢 LIMPEZA PROFUNDA: Remove qualquer âncora vinda do Firestore
      const portosBd = snap.docs
        .map((doc) => {
          const nomeRaw = doc.data().nome;
          return nomeRaw ? String(nomeRaw).replace(/⚓/g, "").trim() : "";
        })
        .filter(Boolean);

      // 🟢 PURIFICAÇÃO DA LISTA PADRÃO: Limpa o array estático do app
      const listaPadraoLimpa = (LISTA_PORTOS_PADRAO || []).map((p: string) =>
        String(p).replace(/⚓/g, "").trim(),
      );

      setListaPortosDin((prev) => {
        const prevLimpo = (prev || []).map((p: string) =>
          String(p).replace(/⚓/g, "").trim(),
        );

        return Array.from(
          new Set([...listaPadraoLimpa, ...prevLimpo, ...portosBd]),
        ).sort();
      });
    });

    return () => {
      unsubBarcos();
      unsubPortos();
    };
  }, [user]);

  useEffect(() => {
    if (!barcoId) {
      setLoading(false);
      return;
    }

    async function carregarDados() {
      setLoading(true);
      try {
        // 🟢 BLINDAGEM: Garante que o carregamento busque sempre pelo ID em Maiúsculo
        const docBarco = await getDoc(
          doc(db, "embarcacoes", barcoId.toUpperCase()),
        );
        if (docBarco.exists()) {
          const d = docBarco.data();
          // 🟢 PUXANDO DADOS (COMPATÍVEL COM O FORMATO NOVO E ANTIGO)
          setCapacidade({
            rede: String(d.vagasRede || d.capacidade?.rede || ""),
            poltrona: String(d.vagasPoltrona || d.capacidade?.poltrona || ""),
            suite: String(d.vagasSuite || d.capacidade?.suite || ""),
          });
          setRotaIda((padraoAtual) =>
            normalizarRota(d.rotaIda, padraoAtual, "ida"),
          );
          setRotaVolta((padraoAtual) =>
            normalizarRota(d.rotaVolta, padraoAtual, "volta"),
          );
        } else {
          setCapacidade({ rede: "", poltrona: "", suite: "" });
          setRotaIda({
            portoOrigem: "Manaus - AM",
            horarioSaida: "11:00",
            diasSemana: clonarDiasPadrao(),
            escalas: [],
          });
          setRotaVolta({
            portoOrigem: "Santarém - PA",
            horarioSaida: "06:00",
            diasSemana: clonarDiasPadrao(),
            escalas: [],
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    carregarDados();
  }, [barcoId]);

  const salvarTudo = async () => {
    if (loading) {
      return exibirAviso(
        "Aguarde",
        "Os dados da embarcação ainda estão sendo carregados.",
        "aviso",
      );
    }
    if (!nomeBarco)
      return exibirAviso(
        "Aviso",
        "Selecione ou digite um barco primeiro.",
        "aviso",
      );
    if (!user) return exibirAviso("Aviso", "Usuário não autenticado.", "aviso");

    setStatusSave("loading");

    try {
      // 🟢 BLINDAGEM FINAL: Força o ID para Maiúsculo no momento exato do salvamento
      const idOficial = barcoId.toUpperCase().trim();

      const rotaIdaNormalizada = normalizarRota(
        rotaIda,
        {
          portoOrigem: "Manaus - AM",
          horarioSaida: "11:00",
          diasSemana: clonarDiasPadrao(),
          escalas: [],
        },
        "ida",
      );

      const rotaVoltaNormalizada = normalizarRota(
        rotaVolta,
        {
          portoOrigem: "Santarém - PA",
          horarioSaida: "06:00",
          diasSemana: clonarDiasPadrao(),
          escalas: [],
        },
        "volta",
      );

      await setDoc(
        doc(db, "embarcacoes", idOficial),
        {
          nome: nomeBarco.toUpperCase(),
          ownerId: user.uid,
          vagasRede: parseInt(capacidade.rede) || 0,
          vagasPoltrona: parseInt(capacidade.poltrona) || 0,
          vagasSuite: parseInt(capacidade.suite) || 0,
          capacidade: {
            rede: parseInt(capacidade.rede) || 0,
            poltrona: parseInt(capacidade.poltrona) || 0,
            suite: parseInt(capacidade.suite) || 0,
          },
          rotaIda: rotaIdaNormalizada,
          rotaVolta: rotaVoltaNormalizada,
          ultima_atualizacao: new Date().toISOString(),
        },
        { merge: true },
      );

      await setDoc(
        doc(db, "grades_viagens", `${idOficial}_ida`),
        {
          id_barco: idOficial,
          nome_barco: nomeBarco.toUpperCase(),
          ownerId: user.uid,
          sentido: "ida",
          ...rotaIdaNormalizada,
          itinerario: rotaIdaNormalizada.escalas.map(
            (e: any, index: number) => ({
              ordem: index + 1,
              porto: e.porto,
              dias_apos_saida: parseInt(e.diaRelativo || "0"),
              horario_chegada: e.horario,
              preco_da_origem: parseFloat(e.precoRede || "0"),
              preco_poltrona: parseFloat(e.precoPoltrona || "0"),
              preco_suite: parseFloat(e.precoSuite || "0"),
              preco_refeicao: parseFloat(e.precoRefeicao || "0"),
            }),
          ),
          dias_da_semana: rotaIdaNormalizada.diasSemana
            .filter((d: any) => d.ativo)
            .map((d: any) => d.id),
        },
        { merge: true },
      );

      await setDoc(
        doc(db, "grades_viagens", `${idOficial}_volta`),
        {
          id_barco: idOficial,
          nome_barco: nomeBarco.toUpperCase(),
          ownerId: user.uid,
          sentido: "volta",
          ...rotaVoltaNormalizada,
          itinerario: rotaVoltaNormalizada.escalas.map(
            (e: any, index: number) => ({
              ordem: index + 1,
              porto: e.porto,
              dias_apos_saida: parseInt(e.diaRelativo || "0"),
              horario_chegada: e.horario,
              preco_da_origem: parseFloat(e.precoRede || "0"),
              preco_poltrona: parseFloat(e.precoPoltrona || "0"),
              preco_suite: parseFloat(e.precoSuite || "0"),
              preco_refeicao: parseFloat(e.precoRefeicao || "0"),
            }),
          ),
          dias_da_semana: rotaVoltaNormalizada.diasSemana
            .filter((d: any) => d.ativo)
            .map((d: any) => d.id),
        },
        { merge: true },
      );

      setStatusSave("success");
      exibirAviso(
        "Sucesso! ⚓",
        `${nomeBarco} salvo e sincronizado no sistema!`,
        "sucesso",
      );
      setTimeout(() => setStatusSave("idle"), 3000);
    } catch {
      exibirAviso("Erro", "Falha ao salvar os dados no servidor.", "erro");
      setStatusSave("idle");
    }
  };

  const cadastrarNovoPorto = async () => {
    const nomeFormatado = novoPortoInput.trim();
    if (!nomeFormatado) return;
    try {
      await addDoc(collection(db, "portos"), {
        nome: nomeFormatado,
        criado_em: new Date().toISOString(),
      });
      confirmarSelecao(nomeFormatado);
      setNovoPortoInput("");
    } catch {
      exibirAviso("Erro", "Não foi possível salvar a nova cidade.", "erro");
    }
  };

  const gerenciarEscala = (
    sentido: "ida" | "volta",
    acao: "add" | "rem" | "edit",
    id?: number,
    campo?: string,
    valor?: string,
  ) => {
    const rota = normalizarRota(
      sentido === "ida" ? rotaIda : rotaVolta,
      sentido === "ida"
        ? {
            portoOrigem: "Manaus - AM",
            horarioSaida: "11:00",
            diasSemana: clonarDiasPadrao(),
            escalas: [],
          }
        : {
            portoOrigem: "Santarém - PA",
            horarioSaida: "06:00",
            diasSemana: clonarDiasPadrao(),
            escalas: [],
          },
      sentido,
    );
    const setRota = sentido === "ida" ? setRotaIda : setRotaVolta;

    if (acao === "add") {
      setRota({
        ...rota,
        escalas: [
          ...rota.escalas,
          {
            id: Date.now(),
            porto: "Selecione...",
            diaRelativo: "0",
            horario: "12:00",
            precoRede: "",
            precoPoltrona: "",
            precoSuite: "",
            precoRefeicao: "",
          },
        ],
      });
    } else if (acao === "rem") {
      setRota({
        ...rota,
        escalas: rota.escalas.filter((e: any) => e.id !== id),
      });
    } else if (acao === "edit") {
      const novas = rota.escalas.map((e: any) =>
        e.id === id ? { ...e, [campo!]: valor } : e,
      );
      setRota({ ...rota, escalas: novas });
    }
  };

  const toggleDia = (sentido: "ida" | "volta", id: number) => {
    const rota = normalizarRota(
      sentido === "ida" ? rotaIda : rotaVolta,
      sentido === "ida"
        ? {
            portoOrigem: "Manaus - AM",
            horarioSaida: "11:00",
            diasSemana: clonarDiasPadrao(),
            escalas: [],
          }
        : {
            portoOrigem: "Santarém - PA",
            horarioSaida: "06:00",
            diasSemana: clonarDiasPadrao(),
            escalas: [],
          },
      sentido,
    );
    const setRota = sentido === "ida" ? setRotaIda : setRotaVolta;
    const novos = rota.diasSemana.map((d: any) =>
      d.id === id ? { ...d, ativo: !d.ativo } : d,
    );
    setRota({ ...rota, diasSemana: novos });
  };

  const abrirSeletor = (
    tipo: string,
    campo: string,
    escalaId: number | null = null,
  ) => {
    setModalConfig({ visible: true, tipo, campo, escalaId });
  };

  const confirmarSelecao = (valorSelecionado: string) => {
    const { campo, escalaId } = modalConfig;
    if (campo === "nomeBarco") {
      setNomeBarco(valorSelecionado);
      setBarcoId(gerarIdBarco(valorSelecionado));
    } else {
      const rotaAtual = normalizarRota(
        abaAtiva === "ida" ? rotaIda : rotaVolta,
        abaAtiva === "ida"
          ? {
              portoOrigem: "Manaus - AM",
              horarioSaida: "11:00",
              diasSemana: clonarDiasPadrao(),
              escalas: [],
            }
          : {
              portoOrigem: "Santarém - PA",
              horarioSaida: "06:00",
              diasSemana: clonarDiasPadrao(),
              escalas: [],
            },
        abaAtiva === "ida" ? "ida" : "volta",
      );
      const setRotaAtual = abaAtiva === "ida" ? setRotaIda : setRotaVolta;
      if (escalaId === null) {
        setRotaAtual({ ...rotaAtual, [campo]: valorSelecionado });
      } else {
        gerenciarEscala(
          abaAtiva as "ida" | "volta",
          "edit",
          escalaId,
          campo,
          valorSelecionado,
        );
      }
    }
    setModalConfig({ ...modalConfig, visible: false });
  };

  const renderizarOpcoesModal = () => {
    let dados: any[] = [];

    if (modalConfig.tipo === "porto") {
      // 🟢 MOTOR DE BUSCA AVANÇADO: Normaliza o texto (ignora maiúsculas, minúsculas, acentos e emojis)
      const textoBusca = (novoPortoInput || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

      // Filtra a lista de portos em tempo real baseada no que o comandante digita
      dados = listaPortosDin.filter((item: string) => {
        const itemLimpo = String(item)
          .replace(/⚓/g, "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .trim();
        return itemLimpo.includes(textoBusca);
      });
    } else if (modalConfig.tipo === "horario") dados = LISTA_HORARIOS;
    else if (modalConfig.tipo === "dia") dados = LISTA_DIAS_RELATIVOS;
    else if (modalConfig.tipo === "barco") dados = listaBarcosDin;

    return (
      <View style={{ flex: 1 }}>
        {modalConfig.tipo === "porto" && (
          <View style={{ marginBottom: 15 }}>
            {/* 🟢 LEGENDA ATUALIZADA: Informa ao usuário a dupla função do campo */}
            <Text style={styles.subLabel}>
              Buscar ou cadastrar nova cidade (Ex: Manaus - AM):
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Digite o nome para buscar"
                placeholderTextColor="#64748b"
                value={novoPortoInput}
                onChangeText={setNovoPortoInput}
              />
              <TouchableOpacity
                style={styles.btnAddBarco}
                onPress={cadastrarNovoPorto}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
          </View>
        )}

        <FlatList
          data={dados}
          keyExtractor={(item, index) => index.toString()}
          ListEmptyComponent={
            modalConfig.tipo === "barco" ? (
              <Text
                style={{ color: "#64748b", textAlign: "center", marginTop: 20 }}
              >
                Nenhum barco vinculado à sua conta. Entre em contato com a
                administração.
              </Text>
            ) : modalConfig.tipo === "porto" && novoPortoInput ? (
              // 🟢 AVISO INTELIGENTE: Se digitou e não achou, orienta a cadastrar no botão "+"
              <Text
                style={{
                  color: "#64748b",
                  textAlign: "center",
                  marginTop: 20,
                  paddingHorizontal: 10,
                }}
              >
                {`Cidade não encontrada. Toque no botão "+" acima para cadastrar "${novoPortoInput}".`}
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const valorRealRaw = typeof item === "string" ? item : item.valor;
            const labelExibicaoRaw =
              typeof item === "string" ? item : item.label;

            // Purificação em tempo de execução para limpar os emojis das strings
            const valorReal =
              modalConfig.tipo === "porto" && typeof valorRealRaw === "string"
                ? valorRealRaw.replace(/⚓/g, "").trim()
                : valorRealRaw;

            const labelExibicao =
              modalConfig.tipo === "porto" &&
              typeof labelExibicaoRaw === "string"
                ? labelExibicaoRaw.replace(/⚓/g, "").trim()
                : labelExibicaoRaw;

            return (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => confirmarSelecao(valorReal)}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {modalConfig.tipo === "porto" && (
                    <FontAwesome name="anchor" size={14} color="#64748b" />
                  )}
                  {modalConfig.tipo === "barco" && (
                    <Ionicons name="boat" size={16} color="#38bdf8" />
                  )}
                  <Text style={styles.modalItemText}>{labelExibicao}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };
  const getTituloModal = () => {
    switch (modalConfig.tipo) {
      case "porto":
        return "Selecione a Cidade";
      case "horario":
        return "Selecione o Horário";
      case "dia":
        return "Dias de Viagem";
      case "barco":
        return "Gestão de Frota";
      default:
        return "Selecione";
    }
  };

  const getTextoBotaoSalvar = () => {
    if (statusSave === "success") return `✅ ${nomeBarco} SALVO!`;
    if (abaAtiva === "barco") return "SALVAR DADOS DO BARCO";
    if (abaAtiva === "ida") return "SALVAR ROTA DE IDA (DESCIDA)";
    if (abaAtiva === "volta") return "SALVAR ROTA DE VOLTA (SUBIDA)";
    return "SALVAR CONFIGURAÇÕES";
  };

  const getCorBotaoSalvar = () => {
    if (statusSave === "success") return { backgroundColor: "#0284c7" };
    return { backgroundColor: "#10b981" };
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );

  const rotaAtual = normalizarRota(
    abaAtiva === "ida" ? rotaIda : rotaVolta,
    abaAtiva === "ida"
      ? {
          portoOrigem: "Manaus - AM",
          horarioSaida: "11:00",
          diasSemana: clonarDiasPadrao(),
          escalas: [],
        }
      : {
          portoOrigem: "Santarém - PA",
          horarioSaida: "06:00",
          diasSemana: clonarDiasPadrao(),
          escalas: [],
        },
    abaAtiva === "ida" ? "ida" : "volta",
  );

  return (
    <View style={styles.container}>
      <Modal animationType="fade" transparent visible={aviso.visivel}>
        <View style={styles.alertOverlay}>
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

      {modalConfig.visible && (
        <View style={styles.fakeModalOverlay}>
          <TouchableOpacity
            style={styles.fakeModalBackground}
            activeOpacity={1}
            onPress={() => setModalConfig({ ...modalConfig, visible: false })}
          />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getTituloModal()}</Text>
              <TouchableOpacity
                onPress={() =>
                  setModalConfig({ ...modalConfig, visible: false })
                }
              >
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            {renderizarOpcoesModal()}
          </View>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Painel do Armador</Text>
        <TouchableOpacity
          style={styles.shipSelectorBtn}
          onPress={() => abrirSeletor("barco", "nomeBarco")}
          activeOpacity={0.7}
        >
          <Text style={styles.shipInput}>
            {nomeBarco || "Selecione a Embarcação..."}
          </Text>
          <Ionicons name="chevron-down-circle" size={24} color="#38bdf8" />
        </TouchableOpacity>
      </View>

      {nomeBarco ? (
        <>
          <View style={styles.tabBar}>
            <TouchableOpacity
              onPress={() => setAbaAtiva("barco")}
              style={[styles.tabItem, abaAtiva === "barco" && styles.tabActive]}
            >
              <Ionicons
                name="boat-outline"
                size={18}
                color={abaAtiva === "barco" ? "#38bdf8" : "#64748b"}
              />
              <Text
                style={[
                  styles.tabTxt,
                  abaAtiva === "barco" && styles.tabTxtActive,
                ]}
              >
                BARCO
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAbaAtiva("ida")}
              style={[styles.tabItem, abaAtiva === "ida" && styles.tabActive]}
            >
              <Ionicons
                name="arrow-down-outline"
                size={18}
                color={abaAtiva === "ida" ? "#38bdf8" : "#64748b"}
              />
              <Text
                style={[
                  styles.tabTxt,
                  abaAtiva === "ida" && styles.tabTxtActive,
                ]}
              >
                IDA
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAbaAtiva("volta")}
              style={[styles.tabItem, abaAtiva === "volta" && styles.tabActive]}
            >
              <Ionicons
                name="arrow-up-outline"
                size={18}
                color={abaAtiva === "volta" ? "#38bdf8" : "#64748b"}
              />
              <Text
                style={[
                  styles.tabTxt,
                  abaAtiva === "volta" && styles.tabTxtActive,
                ]}
              >
                VOLTA
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            {abaAtiva === "barco" && (
              <View style={styles.section}>
                <Text style={styles.label}>CAPACIDADE DA EMBARCAÇÃO</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>Redes</Text>
                    <TextInput
                      style={styles.input}
                      value={capacidade.rede}
                      onChangeText={(t) =>
                        setCapacidade({ ...capacidade, rede: t })
                      }
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>Poltronas</Text>
                    <TextInput
                      style={styles.input}
                      value={capacidade.poltrona}
                      onChangeText={(t) =>
                        setCapacidade({ ...capacidade, poltrona: t })
                      }
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>Suítes</Text>
                    <TextInput
                      style={styles.input}
                      value={capacidade.suite}
                      onChangeText={(t) =>
                        setCapacidade({ ...capacidade, suite: t })
                      }
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                </View>
              </View>
            )}

            {(abaAtiva === "ida" || abaAtiva === "volta") && (
              <View style={styles.section}>
                <Text style={styles.label}>DIAS DE SAÍDA (ORIGEM)</Text>
                <View style={styles.weekRow}>
                  {rotaAtual.diasSemana.map((dia: any) => (
                    <TouchableOpacity
                      key={dia.id}
                      onPress={() => toggleDia(abaAtiva, dia.id)}
                      style={[styles.diaBtn, dia.ativo && styles.diaBtnActive]}
                    >
                      <Text
                        style={[
                          styles.diaTxt,
                          dia.ativo && styles.diaTxtActive,
                        ]}
                      >
                        {dia.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.subLabel}>Porto de Origem</Text>
                    <TouchableOpacity
                      style={styles.selectorBtn}
                      onPress={() => abrirSeletor("porto", "portoOrigem")}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <FontAwesome name="anchor" size={16} color="#38bdf8" />
                        {/* 🟢 CORREÇÃO 1: Limpa qualquer resquício de emoji de âncora vindo do banco na Origem */}
                        <Text style={styles.selectorTxt}>
                          {rotaAtual.portoOrigem
                            ? String(rotaAtual.portoOrigem)
                                .replace("⚓", "")
                                .trim()
                            : "Selecione..."}
                        </Text>
                      </View>
                      <Ionicons name="chevron-down" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>Hora</Text>
                    <TouchableOpacity
                      style={styles.selectorBtn}
                      onPress={() => abrirSeletor("horario", "horarioSaida")}
                    >
                      <Text style={styles.selectorTxt}>
                        {rotaAtual.horarioSaida || "--:--"}
                      </Text>
                      <Ionicons name="time-outline" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.label, { marginTop: 25 }]}>
                  ITINERÁRIO E ESCALAS (PARADAS)
                </Text>
                {rotaAtual.escalas.map((e: any, index: number) => (
                  <View key={e.id} style={styles.escalaCard}>
                    <View style={styles.escalaHeader}>
                      <Text style={styles.escalaOrder}>Parada {index + 1}</Text>
                      <TouchableOpacity
                        onPress={() => gerenciarEscala(abaAtiva, "rem", e.id)}
                      >
                        <Ionicons name="trash" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.subLabel}>Porto de Escala</Text>
                    <TouchableOpacity
                      style={styles.selectorBtnFull}
                      onPress={() => abrirSeletor("porto", "porto", e.id)}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <FontAwesome name="anchor" size={16} color="#38bdf8" />
                        {/* 🟢 CORREÇÃO 2: Limpa o emoji de âncora vindo do banco no Itinerário/Paradas */}
                        <Text style={styles.selectorTxt}>
                          {e.porto
                            ? String(e.porto).replace("⚓", "").trim()
                            : "Selecionar Porto..."}
                        </Text>
                      </View>
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color="#64748b"
                      />
                    </TouchableOpacity>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Dias + (Após saída)</Text>
                        <TouchableOpacity
                          style={styles.selectorBtn}
                          onPress={() =>
                            abrirSeletor("dia", "diaRelativo", e.id)
                          }
                        >
                          <Text style={styles.selectorTxt}>
                            +{e.diaRelativo}
                          </Text>
                          <Ionicons
                            name="calendar-outline"
                            size={16}
                            color="#64748b"
                          />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Hora Atracação</Text>
                        <TouchableOpacity
                          style={styles.selectorBtn}
                          onPress={() =>
                            abrirSeletor("horario", "horario", e.id)
                          }
                        >
                          <Text style={styles.selectorTxt}>{e.horario}</Text>
                          <Ionicons
                            name="time-outline"
                            size={16}
                            color="#64748b"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View
                      style={{ flexDirection: "row", gap: 10, marginTop: 10 }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Rede (R$)</Text>
                        <TextInput
                          style={styles.inputPrice}
                          placeholder="Ex: 80"
                          placeholderTextColor="#64748b"
                          keyboardType="numeric"
                          value={e.precoRede}
                          onChangeText={(t) =>
                            gerenciarEscala(
                              abaAtiva,
                              "edit",
                              e.id,
                              "precoRede",
                              t,
                            )
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Poltrona (R$)</Text>
                        <TextInput
                          style={styles.inputPrice}
                          placeholder="Ex: 130"
                          placeholderTextColor="#64748b"
                          keyboardType="numeric"
                          value={e.precoPoltrona}
                          onChangeText={(t) =>
                            gerenciarEscala(
                              abaAtiva,
                              "edit",
                              e.id,
                              "precoPoltrona",
                              t,
                            )
                          }
                        />
                      </View>
                    </View>
                    <View
                      style={{ flexDirection: "row", gap: 10, marginTop: 5 }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Suíte (R$)</Text>
                        <TextInput
                          style={styles.inputPrice}
                          placeholder="Ex: 250"
                          placeholderTextColor="#64748b"
                          keyboardType="numeric"
                          value={e.precoSuite}
                          onChangeText={(t) =>
                            gerenciarEscala(
                              abaAtiva,
                              "edit",
                              e.id,
                              "precoSuite",
                              t,
                            )
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Refeição (R$)</Text>
                        <TextInput
                          style={styles.inputPrice}
                          placeholder="Ex: 50"
                          placeholderTextColor="#64748b"
                          keyboardType="numeric"
                          value={e.precoRefeicao}
                          onChangeText={(t) =>
                            gerenciarEscala(
                              abaAtiva,
                              "edit",
                              e.id,
                              "precoRefeicao",
                              t,
                            )
                          }
                        />
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.btnAdd}
                  onPress={() => gerenciarEscala(abaAtiva, "add")}
                >
                  <Text style={styles.btnAddTxt}>+ ADICIONAR PARADA</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btnSalvar, getCorBotaoSalvar()]}
              onPress={salvarTudo}
              disabled={loading || statusSave !== "idle"}
            >
              {statusSave === "loading" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnSalvarTxt}>{getTextoBotaoSalvar()}</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 100 }} />
          </ScrollView>
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="boat-outline" size={60} color="#334155" />
          <Text style={styles.emptyText}>
            Toque no botão acima para selecionar um barco da sua frota ou
            cadastrar uma nova embarcação.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  center: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  header: { padding: 25, paddingTop: 60, backgroundColor: "#0f172a" },
  headerTitle: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  shipSelectorBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 5,
    paddingVertical: 5,
  },
  shipInput: { color: "#fff", fontSize: 24, fontWeight: "900" },
  alertOverlay: {
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
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  tabItem: {
    flex: 1,
    paddingVertical: 15,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#38bdf8" },
  tabTxt: { color: "#64748b", fontSize: 11, fontWeight: "bold" },
  tabTxtActive: { color: "#fff" },
  scroll: { padding: 20 },
  section: { marginBottom: 25 },
  label: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 15,
    letterSpacing: 1,
  },
  subLabel: { color: "#64748b", fontSize: 10, marginBottom: 5, marginTop: 5 },
  selectorBtn: {
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorBtnFull: {
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectorTxt: { color: "#fff", fontSize: 15 },
  input: {
    backgroundColor: "#1e293b",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  inputPrice: {
    backgroundColor: "#020617",
    color: "#10b981",
    padding: 12,
    borderRadius: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "#334155",
    fontWeight: "bold",
    fontSize: 16,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  diaBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  diaBtnActive: { backgroundColor: "#38bdf8", borderColor: "#38bdf8" },
  diaTxt: { color: "#64748b", fontSize: 11, fontWeight: "bold" },
  diaTxtActive: { color: "#fff" },
  escalaCard: {
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#1e293b",
    borderLeftWidth: 4,
    borderLeftColor: "#10b981",
  },
  escalaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  escalaOrder: { color: "#10b981", fontSize: 12, fontWeight: "bold" },
  btnAdd: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#38bdf8",
    borderStyle: "dashed",
    alignItems: "center",
    marginTop: 5,
  },
  btnAddTxt: { color: "#38bdf8", fontWeight: "bold", fontSize: 12 },
  btnSalvar: {
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 20,
    elevation: 5,
  },
  btnSalvarTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },
  divider: { height: 1, backgroundColor: "#1e293b", marginVertical: 15 },
  btnAddBarco: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    marginLeft: 10,
  },
  fakeModalOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: "flex-end",
  },
  fakeModalBackground: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
  },
  modalContainer: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    height: "80%",
    padding: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 50,
    paddingBottom: 100,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  modalItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  modalItemText: { color: "#e2e8f0", fontSize: 16 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 15,
    fontSize: 16,
    lineHeight: 24,
  },
});
