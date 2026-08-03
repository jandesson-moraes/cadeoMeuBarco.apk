import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { collection, onSnapshot, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar, LocaleConfig } from "react-native-calendars";
import Animated, { FadeInDown } from "react-native-reanimated";
import { db } from "../../services/firebase";
import {
  calcularPreviaTaxaNoApp,
  deveExibirBotaoComprar,
  localCorrespondeBusca,
  localizarBarcoDaGrade,
  obterConfiguracaoVendasBarco,
  obterTarifaTrecho,
} from "../../services/vendasPassagens";

LocaleConfig.locales["pt-br"] = {
  monthNames: [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ],
  monthNamesShort: [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ],
  dayNames: [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ],
  dayNamesShort: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  today: "Hoje",
};
LocaleConfig.defaultLocale = "pt-br";

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
  "Belém - PA",
];

const obterHojeLocal = () => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
};

const dataJaPassou = (data?: string) => {
  if (!data) return false;

  return data < obterHojeLocal();
};

export default function VendasScreen() {
  const router = useRouter();
  const [diaSelecionado, setDiaSelecionado] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [viagens, setViagens] = useState<any[]>([]);
  const [embarcacoes, setEmbarcacoes] = useState<any[]>([]);
  const [carregandoEmbarcacoes, setCarregandoEmbarcacoes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [listaPortosDin, setListaPortosDin] =
    useState<string[]>(LISTA_PORTOS_PADRAO);

  const [buscaCidade, setBuscaCidade] = useState("");

  const [modalConfig, setModalConfig] = useState({
    visible: false,
    campo: "" as "origem" | "destino",
  });

  useEffect(() => {
    async function carregarBuscaSalva() {
      try {
        const [o, d, dt] = await Promise.all([
          AsyncStorage.getItem("@last_origem"),
          AsyncStorage.getItem("@last_destino"),
          AsyncStorage.getItem("@last_date"),
        ]);
        if (o) setOrigem(o);
        if (d) setDestino(d);

        if (dt && !dataJaPassou(dt)) {
          setDiaSelecionado(dt);
        } else if (dt && dataJaPassou(dt)) {
          await AsyncStorage.removeItem("@last_date");
          setDiaSelecionado("");
        }
      } catch (e) {
        console.error(e);
      }
    }
    carregarBuscaSalva();
  }, []);

  useEffect(() => {
    async function salvar() {
      if (origem) await AsyncStorage.setItem("@last_origem", origem);
      if (destino) await AsyncStorage.setItem("@last_destino", destino);
      if (diaSelecionado && !dataJaPassou(diaSelecionado)) {
        await AsyncStorage.setItem("@last_date", diaSelecionado);
      }
    }
    salvar();
  }, [origem, destino, diaSelecionado]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "embarcacoes"),
      (snapshot) => {
        const lista = snapshot.docs.map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }));

        setEmbarcacoes(lista);
        setCarregandoEmbarcacoes(false);
      },
      (error) => {
        console.log("Erro ao carregar embarcações:", error);
        setEmbarcacoes([]);
        setCarregandoEmbarcacoes(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Lógica otimizada para ler a coleção "portos" existente
  useEffect(() => {
    const unsubPortos = onSnapshot(
      collection(db, "terminais"),
      (snapPortos) => {
        const cidadesDosPortos = snapPortos.docs
          .map((doc) => {
            const data = doc.data();
            if (!data.cidade) return null;
            // Se tiver o estado salvo separadamente, já junta no formato padrão
            if (data.estado) return `${data.cidade} - ${data.estado}`;
            return data.cidade;
          })
          .filter(Boolean) as string[];

        const unsubGrades = onSnapshot(
          collection(db, "grades_viagens"),
          (snap) => {
            const portosSet = new Set([
              ...LISTA_PORTOS_PADRAO,
              ...cidadesDosPortos,
            ]);
            snap.docs.forEach((doc) => {
              const d = doc.data();
              if (d.porto_origem) portosSet.add(d.porto_origem);
              d.itinerario?.forEach(
                (i: any) => i.porto && portosSet.add(i.porto),
              );
            });
            setListaPortosDin(Array.from(portosSet).sort());
          },
        );

        return () => unsubGrades();
      },
    );
    return () => unsubPortos();
  }, []);

  useEffect(() => {
    if (!diaSelecionado || !origem || !destino) return;

    if (dataJaPassou(diaSelecionado)) {
      setDiaSelecionado("");
      setViagens([]);
      AsyncStorage.removeItem("@last_date");
      return;
    }

    setLoading(true);
    const diaSemana = new Date(diaSelecionado + "T12:00:00").getDay();
    const unsub = onSnapshot(
      query(collection(db, "grades_viagens")),
      (snap) => {
        const filtrado = snap.docs
          .map((documento) => {
            const grade = {
              id: documento.id,
              ...documento.data(),
            } as any;
            const barco = localizarBarcoDaGrade(grade, embarcacoes);

            return {
              ...grade,
              barcoData: barco,
              barcoIdResolvido: barco?.id || "",
              vendasAtivas: barco
                ? deveExibirBotaoComprar(barco)
                : false,
            };
          })
          .filter((grade: any) => {
            if (
              !grade.vendasAtivas ||
              !grade.barcoData ||
              grade.ativo === false ||
              grade.publicadoParaVenda === false
            ) {
              return false;
            }
            const pOrigem = grade.porto_origem || grade.portoOrigem ||
              grade.origemPortoNome || grade.origemCidade || grade.origem || "";
            const itinerarioOriginal = Array.isArray(grade.itinerario)
              ? grade.itinerario
              : Array.isArray(grade.escalas)
                ? grade.escalas
                : [];
            const itinerario =
              itinerarioOriginal.length > 0 &&
              localCorrespondeBusca(itinerarioOriginal[0], pOrigem)
                ? itinerarioOriginal
                : [
                    {
                      porto: pOrigem,
                      nome: pOrigem,
                      cidade: grade.origemCidade || grade.origem,
                      horarioSaida:
                        grade.horario_saida_origem || grade.horarioSaida,
                      diaRelativo: 0,
                    },
                    ...itinerarioOriginal,
                  ];
            const idxO = itinerario.findIndex((ponto: any) =>
              localCorrespondeBusca(ponto, origem),
            );
            const idxD = itinerario.findIndex(
              (ponto: any, indice: number) =>
                indice > idxO && localCorrespondeBusca(ponto, destino),
            );
            if (idxO < 0 || idxD <= idxO) return false;
            const pontoOrigem = itinerario[idxO] || {};
            const pontoDestino = itinerario[idxD] || {};
            const diasAt = parseInt(
              pontoOrigem.dias_apos_saida || pontoOrigem.diaRelativo || "0",
            );
            if (
              !(grade.dias_da_semana || grade.diasSemana || []).includes(
                (diaSemana - diasAt + 7) % 7,
              )
            )
              return false;

            grade.buscaOrigemExibicao = origem;
            grade.buscaDestinoExibicao = destino;
            grade.horarioSaida =
              idxO === 0
                ? grade.horario_saida_origem || grade.horarioSaida
                : pontoOrigem.horarioSaida ||
                  pontoOrigem.horario_saida ||
                  pontoOrigem.horario_chegada ||
                  pontoOrigem.horarioChegada ||
                  pontoOrigem.horario;
            grade.horarioChegadaExibicao =
              pontoDestino.horarioChegada ||
              pontoDestino.horario_chegada ||
              pontoDestino.horario;
            const tarifaTrecho = obterTarifaTrecho(grade, origem, destino);
            grade.precoBase = parseFloat(
              tarifaTrecho?.precoRede ||
                tarifaTrecho?.preco_rede ||
                tarifaTrecho?.preco_da_origem ||
                tarifaTrecho?.precoPoltrona ||
                tarifaTrecho?.preco_poltrona ||
                tarifaTrecho?.precoSuite ||
                tarifaTrecho?.preco_suite ||
                pontoDestino.preco_da_origem ||
                pontoDestino.precoRede ||
                0,
            );
            const previa = calcularPreviaTaxaNoApp({
              regra: obterConfiguracaoVendasBarco(grade.barcoData).regraTaxa,
              quantidade: 1,
              valorUnitario: grade.precoBase,
            });
            grade.precoExibicao = previa.totalPassageiro;
            const intermediarios = itinerario
              .slice(idxO + 1, idxD)
              .map((ponto: any) => ponto.cidade || ponto.porto || ponto.nome)
              .filter(Boolean);
            const separador = " → ";
            const rotaPrincipal = [origem, destino].join(separador);
            grade.itinerarioFormatado = intermediarios.length
              ? `${rotaPrincipal} (via: ${intermediarios.join(separador)})`
              : rotaPrincipal;
            return true;
          });
        setViagens(filtrado);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [diaSelecionado, origem, destino, embarcacoes]);

  const portosFiltrados = listaPortosDin.filter((cidade) =>
    cidade.toLowerCase().includes(buscaCidade.toLowerCase()),
  );

  const hojeCalendario = obterHojeLocal();

  return (
    <View style={styles.container}>
      {modalConfig.visible && (
        <View style={styles.fakeModalOverlay}>
          <TouchableOpacity
            style={styles.fakeModalBackground}
            onPress={() => setModalConfig({ ...modalConfig, visible: false })}
          />
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={styles.modalContainer}
          >
            <Text style={styles.modalTitle}>Selecione a Cidade</Text>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar cidade..."
                placeholderTextColor="#64748b"
                value={buscaCidade}
                onChangeText={setBuscaCidade}
                autoFocus={false}
              />
            </View>

            <FlatList
              data={portosFiltrados}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    if (modalConfig.campo === "origem") {
                      setOrigem(item);
                    } else {
                      setDestino(item);
                    }

                    setModalConfig({
                      ...modalConfig,
                      visible: false,
                    });
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </Animated.View>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.header}>
          <View>
            <Ionicons name="ticket" size={24} color="#38bdf8">
              <Text style={styles.headerTitle}> Passagens </Text>
            </Ionicons>
            <Text style={styles.headerSubtitle}>Logística em tempo real</Text>
          </View>
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#38bdf8" />
          <Text style={styles.infoBannerText}>
            Exibimos somente embarcações com venda de passagens habilitada.
          </Text>
        </View>

        <Animated.View
          entering={FadeInDown.delay(100)}
          style={styles.sectionContainer}
        >
          <Text style={styles.stepTitle}>Passo 1: Escolha sua rota</Text>
          <View style={styles.searchBox}>
            <TouchableOpacity
              style={styles.inputBtn}
              onPress={() => {
                setBuscaCidade("");
                setModalConfig({ visible: true, campo: "origem" });
              }}
            >
              <Text style={styles.label}>Origem</Text>
              <Text style={styles.inputTxt}>
                {origem || "Toque para escolher"}
              </Text>
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity
              style={styles.inputBtn}
              onPress={() => {
                setBuscaCidade("");
                setModalConfig({ visible: true, campo: "destino" });
              }}
            >
              <Text style={styles.label}>Destino</Text>
              <Text style={styles.inputTxt}>
                {destino || "Toque para escolher"}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(300)}
          style={styles.sectionContainer}
        >
          <Text style={styles.stepTitle}>Passo 2: Selecione a data</Text>
          <View style={styles.calendarContainer}>
            <Calendar
              minDate={hojeCalendario}
              current={diaSelecionado || hojeCalendario}
              disableAllTouchEventsForDisabledDays
              hideExtraDays
              theme={{
                calendarBackground: "#0f172a",
                dayTextColor: "#fff",
                selectedDayBackgroundColor: "#38bdf8",
                todayTextColor: "#38bdf8",
                monthTextColor: "#fff",
                arrowColor: "#38bdf8",
                textDisabledColor: "#334155",
              }}
              onDayPress={(day: any) => {
                if (dataJaPassou(day.dateString)) return;

                setDiaSelecionado(day.dateString);
              }}
              markedDates={
                diaSelecionado && !dataJaPassou(diaSelecionado)
                  ? {
                      [diaSelecionado]: {
                        selected: true,
                        selectedColor: "#38bdf8",
                      },
                    }
                  : {}
              }
            />
          </View>
        </Animated.View>

        <Text style={styles.sectionTitle}>Opções Disponíveis</Text>

        {loading || carregandoEmbarcacoes ? (
          <ActivityIndicator
            size="large"
            color="#38bdf8"
            style={{ marginTop: 20 }}
          />
        ) : viagens.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="boat-outline" size={60} color="#334155" />
            <Text style={styles.emptyStateTitle}>
              {!diaSelecionado
                ? "Aguardando dados"
                : "Nenhuma embarcação com vendas ativas"}
            </Text>
          </View>
        ) : (
          viagens.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(index * 100).duration(500)}
            >
              <TouchableOpacity
                style={styles.ticketCard}
                activeOpacity={0.7}
                onPress={() => {
                  if (!diaSelecionado || dataJaPassou(diaSelecionado)) {
                    setDiaSelecionado("");
                    setViagens([]);
                    AsyncStorage.removeItem("@last_date");
                    return;
                  }

                  const idViagemParam = `${item.id}_${diaSelecionado}`;
                  router.push({
                    pathname: "/checkout",
                    params: {
                      gradeId: item.id,
                      dataViagem: diaSelecionado,
                      origemDesejada: item.buscaOrigemExibicao,
                      destinoDesejado: item.buscaDestinoExibicao,
                      precoCalculado: item.precoBase,
                      idViagem: idViagemParam,
                      horarioSaida: item.horarioSaida,
                    },
                  });
                }}
              >
                <View style={styles.ticketHeader}>
                  <View>
                    <Text style={styles.barcoName}>
                      {item.barcoData?.nome || item.nome_barco}
                    </Text>
                    <Text style={styles.vendaAtiva}>
                      VENDA DISPONÍVEL
                    </Text>
                  </View>
                  <Text style={styles.price}>
                    R$ {item.precoExibicao?.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.ticketBody}>
                  <View>
                    <Text style={styles.time}>{item.horarioSaida}</Text>
                    <Text style={styles.city}>{item.buscaOrigemExibicao}</Text>
                  </View>
                  <View style={styles.routeLine}>
                    <View style={styles.dot} />
                    <View style={styles.line} />
                    <Text style={styles.shipIcon}>🛳️</Text>
                    <View style={styles.line} />
                    <View style={styles.dot} />
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.time}>
                      {item.horarioChegadaExibicao}
                    </Text>
                    <Text style={styles.city}>{item.buscaDestinoExibicao}</Text>
                  </View>
                </View>
                <View style={styles.itinerarioContainer}>
                  <Text style={styles.itinerarioText}>
                    {item.itinerarioFormatado}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 25,
    paddingTop: 50,
    backgroundColor: "#0f172a",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: { color: "#64748b" },
  btnHistory: {
    alignItems: "center",
    backgroundColor: "#1e293b",
    padding: 10,
    borderRadius: 12,
  },
  btnHistoryText: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 4,
  },
  infoBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    gap: 10,
  },
  infoBannerText: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "bold",
    flex: 1,
  },
  sectionContainer: { marginHorizontal: 20, marginBottom: 15 },
  stepTitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 10,
  },
  searchBox: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 15,
    width: "100%",
  },
  inputBtn: { paddingVertical: 8 },
  label: { color: "#38bdf8", fontSize: 10, fontWeight: "bold" },
  inputTxt: { color: "#fff", fontSize: 16, marginTop: 1 },
  separator: { height: 1, backgroundColor: "#334155", marginVertical: 8 },
  calendarContainer: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    overflow: "hidden",
    paddingBottom: 10,
  },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", margin: 20 },
  ticketCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: "#38bdf8",
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  barcoName: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  vendaAtiva: {
    color: "#10b981",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 3,
  },
  price: { color: "#10b981", fontSize: 18, fontWeight: "bold" },
  ticketBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  time: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  city: { color: "#94a3b8", fontSize: 12 },
  routeLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#38bdf8" },
  line: { flex: 1, height: 1, backgroundColor: "#334155", marginHorizontal: 4 },
  shipIcon: { fontSize: 18, marginHorizontal: 4 },
  itinerarioContainer: {
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
  },
  itinerarioText: {
    color: "#38bdf8",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "600",
  },
  emptyStateContainer: { alignItems: "center", padding: 20, margin: 40 },
  emptyStateTitle: {
    color: "#cbd5e1",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
  },
  fakeModalOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    justifyContent: "flex-end",
  },
  fakeModalBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
  },
  modalContainer: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    height: "60%",
    padding: 20,
    paddingBottom: 120,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  modalItemText: { color: "#fff", fontSize: 16 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    paddingVertical: 12,
    marginLeft: 10,
    fontSize: 16,
  },
});
