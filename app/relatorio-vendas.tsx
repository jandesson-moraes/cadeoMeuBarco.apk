import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import { Stack, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { auth, db } from "../services/firebase";

function FadeInStaggered({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(500)}>
      {children}
    </Animated.View>
  );
}

interface Passagem {
  id: string;
  passageiro: string;
  nome?: string;
  nomePassageiro?: string;
  passageiroNome?: string;
  nacionalidade: string;
  nascimento?: string;
  dataNascimento?: string;
  passageiroDataNascimento?: string;
  nascimentoPassageiro?: string;
  documento?: string;
  documentoMascarado?: string;
  documentoFinal?: string;
  pagamentoId: string;
  barco: string;
  dataViagem: string;
  horarioSaida: string;
  origem: string;
  destino: string;
  valor: number;
  tipoVaga: string;
  refeicao: boolean;
  status: string;
  validado: boolean;
  dataCompra: string;
}

export default function RelatorioVendas() {
  const router = useRouter();
  const user = auth.currentUser;

  const [carregando, setCarregando] = useState(true);
  const [imprimindo, setImprimindo] = useState(false);
  const [totalPassageiros, setTotalPassageiros] = useState(0);
  const [faturamento, setFaturamento] = useState(0);
  const [meuBarco, setMeuBarco] = useState<string>("");
  const [cnpjBarco, setCnpjBarco] = useState<string>("");

  const [passagensLista, setPassagensLista] = useState<Passagem[]>([]);
  const [busca, setBusca] = useState("");
  const [ticketDetalhe, setTicketDetalhe] = useState<Passagem | null>(null);
  const [modalListaVisivel, setModalListaVisivel] = useState(false);

  const triggerHapticImpact = (
    style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
  ) => {
    if (Platform.OS !== "web") Haptics.impactAsync(style);
  };

  const obterNomePassageiro = (p: any) => {
    return String(
      p?.passageiro ||
        p?.nomePassageiro ||
        p?.passageiroNome ||
        p?.nome ||
        "Passageiro",
    ).trim();
  };

  const obterNascimentoPassageiro = (p: any) => {
    return String(
      p?.nascimento ||
        p?.dataNascimento ||
        p?.passageiroDataNascimento ||
        p?.nascimentoPassageiro ||
        "",
    ).trim();
  };

  const obterDocumentoPassageiro = (p: any) => {
    return String(
      p?.documentoMascarado ||
        p?.documento ||
        (p?.documentoFinal ? `***.***.***-${p.documentoFinal}` : "") ||
        "Não informado",
    ).trim();
  };

  const formatarMoeda = (valor: number) => {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const statusAprovado = (status: any) => {
    const s = String(status || "")
      .toUpperCase()
      .trim();
    return s === "APROVADO" || s === "PAGO" || s === "CONCLUIDO";
  };

  const formatarCnpj = (valor: any) => {
    const limpo = String(valor || "")
      .replace(/\D/g, "")
      .slice(0, 14);

    if (!limpo) return "";

    if (limpo.length === 14) {
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
    }

    return String(valor || "").trim();
  };

  const normalizarTextoBusca = (valor: any) => {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/_/g, " ")
      .trim()
      .toLowerCase();
  };

  const carregarRelatorio = async () => {
    if (!user) return;

    try {
      setCarregando(true);

      const qBarco = query(
        collection(db, "embarcacoes"),
        where("ownerId", "==", user.uid),
      );

      const snapBarco = await getDocs(qBarco);

      if (snapBarco.empty) {
        setMeuBarco("Nenhum barco vinculado");
        setCnpjBarco("");
        setPassagensLista([]);
        setTotalPassageiros(0);
        setFaturamento(0);
        setCarregando(false);
        return;
      }

      const barcoDoc = snapBarco.docs[0];
      const dadosBarco = barcoDoc.data();
      const nomeDoBarco = String(dadosBarco.nome || barcoDoc.id || "").trim();
      const cnpjDaEmbarcacao = formatarCnpj(
        dadosBarco.cnpj || dadosBarco.cnpjBarco || dadosBarco.documento || "",
      );

      setMeuBarco(nomeDoBarco);
      setCnpjBarco(cnpjDaEmbarcacao);

      // Mais leve: busca primeiro apenas passagens desse barco.
      // Antes a tela buscava todas as passagens aprovadas da base e filtrava no celular,
      // o que pode causar travamento/OOM quando a base crescer.
      let snapVendas = await getDocs(
        query(collection(db, "passagens"), where("barco", "==", nomeDoBarco)),
      );

      // Compatibilidade com passagens que possam ter sido salvas com o ID do barco.
      if (snapVendas.empty && barcoDoc.id) {
        snapVendas = await getDocs(
          query(collection(db, "passagens"), where("barco", "==", barcoDoc.id)),
        );
      }

      let pCont = 0;
      let vCont = 0;
      const listaTemporaria: Passagem[] = [];

      const nomeBarcoNormalizado = normalizarTextoBusca(nomeDoBarco);
      const idBarcoNormalizado = normalizarTextoBusca(barcoDoc.id);

      snapVendas.docs.forEach((docVenda) => {
        const d = docVenda.data();
        const barcoPassagem = normalizarTextoBusca(
          d.barco || d.nomeBarco || d.barcoNome || d.idBarco || d.barcoId || "",
        );

        const pertenceAoBarco =
          !barcoPassagem ||
          barcoPassagem === nomeBarcoNormalizado ||
          barcoPassagem === idBarcoNormalizado;

        if (!pertenceAoBarco || !statusAprovado(d.status)) return;

        pCont += 1;
        vCont += Number(d.valor || 0);

        listaTemporaria.push({
          id: docVenda.id,
          ...d,
          passageiro: obterNomePassageiro(d),
          nascimento: obterNascimentoPassageiro(d),
          nacionalidade: d.nacionalidade || "Brasileira",
          documentoMascarado: d.documentoMascarado || d.documento || "",
          documentoFinal: d.documentoFinal || "",
          refeicao: d.refeicao === true,
          validado: d.validado === true,
        } as Passagem);
      });

      setTotalPassageiros(pCont);
      setFaturamento(vCont);
      setPassagensLista(
        listaTemporaria.sort((a, b) =>
          String(b.dataViagem || "").localeCompare(String(a.dataViagem || "")),
        ),
      );
    } catch (e) {
      console.log("Erro ao carregar relatório:", e);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => {
    carregarRelatorio();
  }, [user]);

  const exibirDataBR = (str?: string) => {
    const texto = String(str || "").trim();

    if (!texto) return "---";

    if (texto.includes("/")) return texto;

    const base = texto.split("T")[0];
    const partes = base.split("-");

    return partes.length < 3 ? texto : `${partes[2]}/${partes[1]}/${partes[0]}`;
  };

  // 🟢 FUNÇÃO DE IMPRESSÃO CORRIGIDA E BLINDADA
  const imprimirManifesto = async (
    dados: Passagem[],
    tituloRelatorio: string,
  ) => {
    if (!dados || dados.length === 0) {
      Alert.alert("Aviso", "Lista vazia.");
      return;
    }

    setImprimindo(true);

    try {
      // Movemos a criação do HTML para dentro do TRY, com proteção contra dados nulos
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 10px; color: #333; }
              h1 { text-align: center; color: #020617; font-size: 18px; border-bottom: 2px solid #38bdf8; padding-bottom: 5px; }
              h2 { text-align: center; color: #38bdf8; font-size: 12px; margin-top: 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th { background-color: #f1f5f9; padding: 6px; border: 1px solid #cbd5e1; text-align: left; font-size: 8px; }
              td { border: 1px solid #e2e8f0; padding: 5px; font-size: 7.5px; }
              tr:nth-child(even) { background-color: #f8fafc; }
              .resumo { display: flex; gap: 8px; margin-top: 10px; font-size: 9px; }
              .box { border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; background: #f8fafc; }
              .footer { margin-top: 20px; text-align: center; font-size: 8px; color: #94a3b8; }
            </style>
          </head>
          <body>
            <h1>MANIFESTO DE PASSAGEIROS</h1>
            <h2>EMBARCAÇÃO: ${(meuBarco || "NÃO DEFINIDA").toUpperCase()}</h2>
            <p style="font-size: 9px; text-align: center; margin-top: -4px;">
              CNPJ: ${cnpjBarco || "NÃO INFORMADO"}
            </p>
            <p style="font-size: 9px;">Relatório: ${tituloRelatorio} | Gerado em: ${new Date().toLocaleString("pt-BR")}</p>
            <div class="resumo">
              <div class="box"><b>Passageiros:</b> ${dados.length}</div>
              <div class="box"><b>Receita:</b> ${formatarMoeda(dados.reduce((acc, p) => acc + Number(p.valor || 0), 0))}</div>
              <div class="box"><b>Refeições:</b> ${dados.filter((p) => p.refeicao).length}</div>
              <div class="box"><b>Validados:</b> ${dados.filter((p) => p.validado).length}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>PASSAGEIRO</th>
                  <th>NACIONALIDADE</th>
                  <th>NASCIMENTO</th>
                  <th>DOCUMENTO</th>
                  <th>DATA VIAGEM</th>
                  <th>ROTA</th>
                  <th>ACOM.</th>
                  <th>REF.</th>
                  <th>VALOR</th>
                </tr>
              </thead>
              <tbody>
                ${dados
                  .map(
                    (p, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${obterNomePassageiro(p).toUpperCase()}</td>
                    <td>${(p.nacionalidade || "BRASILEIRA").toUpperCase()}</td>
                    <td>${exibirDataBR(obterNascimentoPassageiro(p))}</td>
                    <td>${obterDocumentoPassageiro(p)}</td>
                    <td>${exibirDataBR(p.dataViagem)}</td>
                    <td>${p.origem || "-"} > ${p.destino || "-"}</td>
                    <td>${String(p.tipoVaga || "-").toUpperCase()}</td>
                    <td>${p.refeicao ? "SIM" : "NÃO"}</td>
                    <td>R$ ${Number(p.valor || 0).toFixed(2)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="footer">Sistema Cadê Meu Barco</div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      // Passamos o mimeType para garantir que o Android/iOS entendam que é um PDF para download
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Baixar Relatório",
        UTI: "com.adobe.pdf",
      });
    } catch (error) {
      Alert.alert(
        "Erro",
        "Falha ao gerar PDF. Verifique se há passageiros com dados inválidos.",
      );
      console.error(error);
    } finally {
      // Agora, mesmo que dê erro em algum dado, a tela de "Gerando..." sempre vai sumir
      setImprimindo(false);
    }
  };

  const imprimirTodaBase = () => {
    triggerHapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
    setModalListaVisivel(false);
    setTimeout(() => {
      imprimirManifesto(passagensLista, "RELATÓRIO GERAL COMPLETO");
    }, 600);
  };

  const viagensAgrupadas = passagensLista.reduce((acc: any, curr) => {
    const dataV = curr.dataViagem || "Sem Data";
    if (!acc[dataV]) acc[dataV] = { total: 0, qtd: 0, passageiros: [] };
    acc[dataV].total += Number(curr.valor || 0);
    acc[dataV].qtd += 1;
    acc[dataV].passageiros.push(curr);
    return acc;
  }, {});

  const datasRodadas = Object.keys(viagensAgrupadas).sort((a, b) =>
    b.localeCompare(a),
  );
  const passagensFiltradas = passagensLista.filter((p) =>
    obterNomePassageiro(p).toLowerCase().includes(busca.toLowerCase()),
  );

  const totalValidados = passagensLista.filter((p) => p.validado).length;
  const totalRefeicoes = passagensLista.filter((p) => p.refeicao).length;
  const ticketMedio =
    passagensLista.length > 0 ? faturamento / passagensLista.length : 0;

  const resumoAcomodacoes = passagensLista.reduce(
    (acc: any, p) => {
      const tipo = String(p.tipoVaga || "REDE").toUpperCase();

      if (tipo.includes("SUITE") || tipo.includes("SUÍTE")) {
        acc.suite += 1;
      } else if (tipo.includes("POLTRONA")) {
        acc.poltrona += 1;
      } else {
        acc.rede += 1;
      }

      return acc;
    },
    { rede: 0, poltrona: 0, suite: 0 },
  );

  if (carregando)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.title}>Auditoria</Text>
            <Text style={styles.subtitle}>{meuBarco}</Text>
            {!!cnpjBarco && (
              <Text style={styles.cnpjSubtitle}>CNPJ: {cnpjBarco}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => {
              triggerHapticImpact();
              setModalListaVisivel(true);
            }}
            style={styles.actionBtn}
          >
            <Ionicons name="people" size={30} color="#38bdf8" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <View
            style={[
              styles.statCard,
              { borderColor: "#38bdf8", borderTopWidth: 3 },
            ]}
          >
            <Text style={styles.statValue}>{totalPassageiros}</Text>
            <Text style={styles.statLabel}>PASSAGEIROS</Text>
          </View>
          <View
            style={[
              styles.statCard,
              { borderColor: "#10b981", borderTopWidth: 3 },
            ]}
          >
            <Text style={[styles.statValue, { color: "#10b981" }]}>
              {formatarMoeda(faturamento)}
            </Text>
            <Text style={styles.statLabel}>RECEITA TOTAL</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View
            style={[
              styles.statCard,
              { borderColor: "#facc15", borderTopWidth: 3 },
            ]}
          >
            <Text style={[styles.statValue, { color: "#facc15" }]}>
              {totalValidados}
            </Text>
            <Text style={styles.statLabel}>VALIDADOS</Text>
          </View>
          <View
            style={[
              styles.statCard,
              { borderColor: "#f97316", borderTopWidth: 3 },
            ]}
          >
            <Text style={[styles.statValue, { color: "#f97316" }]}>
              {totalRefeicoes}
            </Text>
            <Text style={styles.statLabel}>REFEIÇÕES</Text>
          </View>
        </View>

        <View style={styles.resumoBox}>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>Ticket médio</Text>
            <Text style={styles.resumoValor}>{formatarMoeda(ticketMedio)}</Text>
          </View>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>Acomodações</Text>
            <Text style={styles.resumoValor}>
              Rede {resumoAcomodacoes.rede} • Poltrona{" "}
              {resumoAcomodacoes.poltrona} • Suíte {resumoAcomodacoes.suite}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>MANIFESTOS POR DATA</Text>

        {datasRodadas.map((data, idx) => (
          <FadeInStaggered key={data} index={idx}>
            <View style={styles.rodadaCard}>
              <View style={styles.rodadaHeader}>
                <Text style={styles.rodadaDate}>{exibirDataBR(data)}</Text>
                <TouchableOpacity
                  onPress={() =>
                    imprimirManifesto(
                      viagensAgrupadas[data].passageiros,
                      `VIAGEM ${exibirDataBR(data)}`,
                    )
                  }
                  style={styles.miniPrint}
                >
                  <Ionicons name="print" size={16} color="#38bdf8" />
                  <Text style={styles.miniPrintTxt}>PDF</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding: 15 }}>
                <Text style={styles.qtdPass}>
                  {viagensAgrupadas[data].qtd} Passageiros confirmados
                </Text>
                <Text style={styles.subInfo}>
                  Faturamento da viagem:{" "}
                  {formatarMoeda(viagensAgrupadas[data].total)}
                </Text>
                <Text style={styles.subInfo}>
                  Validados:{" "}
                  {
                    viagensAgrupadas[data].passageiros.filter(
                      (p: Passagem) => p.validado,
                    ).length
                  }{" "}
                  • Refeições:{" "}
                  {
                    viagensAgrupadas[data].passageiros.filter(
                      (p: Passagem) => p.refeicao,
                    ).length
                  }
                </Text>
              </View>
            </View>
          </FadeInStaggered>
        ))}
      </ScrollView>

      {/* MODAL DA BASE GERAL */}
      <Modal visible={modalListaVisivel} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Base Geral</Text>
              <TouchableOpacity onPress={() => setModalListaVisivel(false)}>
                <Ionicons name="close-circle" size={32} color="#64748b" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.printFullBtn}
              onPress={imprimirTodaBase}
            >
              <Ionicons name="print" size={24} color="#0f172a" />
              <Text style={styles.printFullBtnText}>IMPRIMIR TODA A BASE</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.searchModal}
              placeholder="Pesquisar passageiro..."
              placeholderTextColor="#64748b"
              value={busca}
              onChangeText={setBusca}
            />

            <ScrollView showsVerticalScrollIndicator={false}>
              {passagensFiltradas.map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.fullListItem}
                  onPress={() => {
                    triggerHapticImpact(Haptics.ImpactFeedbackStyle.Light);
                    setTicketDetalhe(p);
                  }}
                >
                  <Text style={styles.fullListName}>
                    {idx + 1}. {obterNomePassageiro(p).toUpperCase()}
                  </Text>
                  <Text style={styles.fullListSub}>
                    {p.nacionalidade} | Nasc:{" "}
                    {exibirDataBR(obterNascimentoPassageiro(p))}
                  </Text>
                  <Text style={styles.fullListSub}>
                    {p.origem} {">"} {p.destino} |{" "}
                    {formatarMoeda(Number(p.valor || 0))}
                  </Text>
                  <Text style={styles.fullListSub}>
                    {String(p.tipoVaga || "REDE").toUpperCase()} •{" "}
                    {p.refeicao ? "Com refeição" : "Sem refeição"} •{" "}
                    {p.validado ? "Validado" : "Não validado"}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {ticketDetalhe && (
        <Modal transparent visible={!!ticketDetalhe} animationType="fade">
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { height: "auto", paddingBottom: 40 },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Dados do Passageiro</Text>
                <TouchableOpacity onPress={() => setTicketDetalhe(null)}>
                  <Ionicons name="close-circle" size={32} color="#64748b" />
                </TouchableOpacity>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>NOME:</Text>
                <Text style={styles.detailValue}>
                  {obterNomePassageiro(ticketDetalhe)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>NASCIMENTO:</Text>
                <Text style={styles.detailValue}>
                  {exibirDataBR(obterNascimentoPassageiro(ticketDetalhe))}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>DOCUMENTO:</Text>
                <Text style={styles.detailValue}>
                  {obterDocumentoPassageiro(ticketDetalhe)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>NACIONALIDADE:</Text>
                <Text style={styles.detailValue}>
                  {ticketDetalhe.nacionalidade}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>VIAGEM:</Text>
                <Text style={styles.detailValue}>
                  {exibirDataBR(ticketDetalhe.dataViagem)} •{" "}
                  {ticketDetalhe.horarioSaida || "---"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>ROTA:</Text>
                <Text style={styles.detailValue}>
                  {ticketDetalhe.origem} {">"} {ticketDetalhe.destino}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>ACOMODAÇÃO:</Text>
                <Text style={styles.detailValue}>
                  {String(ticketDetalhe.tipoVaga || "REDE").toUpperCase()} •{" "}
                  {ticketDetalhe.refeicao ? "Com refeição" : "Sem refeição"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>STATUS:</Text>
                <Text style={styles.detailValue}>
                  {ticketDetalhe.validado
                    ? "Bilhete validado"
                    : "Aguardando validação"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>VALOR:</Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: "#10b981", fontWeight: "bold" },
                  ]}
                >
                  {formatarMoeda(Number(ticketDetalhe.valor || 0))}
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {imprimindo && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={{ color: "#fff", marginTop: 15, fontWeight: "bold" }}>
            GERANDO PDF COMPLETO...
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
  scroll: { padding: 20, paddingTop: 50, paddingBottom: 100 },
  backBtn: { marginBottom: 15 },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "bold" },
  subtitle: { color: "#38bdf8", fontSize: 13, fontWeight: "bold" },
  cnpjSubtitle: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  actionBtn: {
    padding: 10,
    borderRadius: 15,
    backgroundColor: "rgba(56, 189, 248, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  statLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 5,
  },
  resumoBox: {
    backgroundColor: "#0f172a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 15,
    marginTop: 2,
  },
  resumoLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginVertical: 4,
  },
  resumoLabel: { color: "#64748b", fontSize: 11, fontWeight: "bold" },
  resumoValor: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
    flex: 1,
  },
  divider: { height: 1, backgroundColor: "#1e293b", marginVertical: 25 },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 15,
    letterSpacing: 1,
  },
  rodadaCard: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 15,
    overflow: "hidden",
  },
  rodadaHeader: {
    backgroundColor: "#1e293b",
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rodadaDate: { color: "#fff", fontWeight: "bold" },
  miniPrint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#38bdf8",
  },
  miniPrintTxt: { color: "#38bdf8", fontSize: 10, fontWeight: "bold" },
  qtdPass: { color: "#38bdf8", fontSize: 12, fontWeight: "bold" },
  subInfo: { color: "#64748b", fontSize: 10, marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.98)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 25,
    height: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    alignItems: "center",
  },
  modalTitle: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  printFullBtn: {
    backgroundColor: "#38bdf8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
    gap: 12,
  },
  printFullBtnText: { color: "#0f172a", fontWeight: "bold", fontSize: 16 },
  searchModal: {
    backgroundColor: "#1e293b",
    padding: 15,
    borderRadius: 15,
    color: "#fff",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  fullListItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  fullListName: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  fullListSub: { color: "#64748b", fontSize: 11, marginTop: 4 },
  detailRow: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingBottom: 10,
  },
  detailLabel: { color: "#64748b", fontSize: 10, fontWeight: "bold" },
  detailValue: { color: "#fff", fontSize: 16, marginTop: 4 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
});
