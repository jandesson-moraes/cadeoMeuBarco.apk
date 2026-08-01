import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db } from "../services/firebase";
import {
  CORES_PLANO,
  ROTULOS_PLANO,
  planoEfetivo,
  recursosDaEmbarcacao,
  statusSinalDaEmbarcacao,
} from "../services/planosEmbarcacao";
import {
  montarProgramacoesLegadas,
  normalizarProgramacaoViagem,
  obterItinerarioProgramacao,
  type PontoItinerarioViagem,
  type ProgramacaoViagem,
} from "../services/programacaoViagens";

const { width } = Dimensions.get("window");
const CAROUSEL_HEIGHT = width * 0.7;
const VERSAO_TELA_PLANOS = "3.6.1";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diasDaProgramacao(programacao: ProgramacaoViagem) {
  return programacao.diasSemana
    .map((dia) => DIAS_SEMANA[dia] || String(dia))
    .join(", ");
}

function tituloTipoPonto(ponto: PontoItinerarioViagem) {
  if (ponto.tipo === "origem") return "Partida";
  if (ponto.tipo === "destino") return "Destino final";
  return "Escala";
}

function horarioDoPonto(
  ponto: PontoItinerarioViagem,
  programacao: ProgramacaoViagem,
) {
  if (ponto.tipo === "origem") {
    return `Saída: ${ponto.horarioSaida || programacao.horarioSaida}`;
  }

  const partes: string[] = [];
  if (ponto.horarioChegada) partes.push(`Chegada: ${ponto.horarioChegada}`);
  if (ponto.horarioSaida) partes.push(`Nova saída: ${ponto.horarioSaida}`);
  if (ponto.diaRelativo > 0) {
    partes.push(
      ponto.diaRelativo === 1
        ? "1 dia após a saída"
        : `${ponto.diaRelativo} dias após a saída`,
    );
  }
  return partes.join(" • ") || "Horário não informado";
}

function diasDePassagemDoPonto(ponto: PontoItinerarioViagem) {
  return ponto.diasPassagem
    .map((dia) => DIAS_SEMANA[dia] || String(dia))
    .join(", ");
}

const ICONE_PLANO = {
  basico: "information-circle-outline",
  vitrine: "storefront-outline",
  tempo_real: "navigate-circle-outline",
} as const;

export default function DetalhesBarco() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { barcoId } = useLocalSearchParams();

  const [barco, setBarco] = useState<any>(null);
  const [grades, setGrades] = useState<any[]>([]);
  const [programacoes, setProgramacoes] = useState<ProgramacaoViagem[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<"ida" | "volta">("ida");
  const [carregando, setCarregando] = useState(true);
  const [slideAtual, setSlideAtual] = useState(0);

  // Mapeamento de Ícones e Nomes (Baseado no seu Perfil)
  const MAPA_COMODIDADES = {
    ar: { label: "Ar Cond.", icon: "snow-outline" },
    lanchonete: { label: "Lanchonete", icon: "restaurant-outline" },
    wifi: { label: "Wi-Fi", icon: "wifi-outline" },
    suites: { label: "Suítes", icon: "bed-outline" },
    redario: { label: "Redário", icon: "map-outline" },
    petFriendly: { label: "Pets", icon: "paw-outline" },
    tomadas: { label: "Tomadas", icon: "battery-charging-outline" },
    bar: { label: "Bar/Som", icon: "beer-outline" },
  };

  const MAPA_LOGISTICA = {
    encomendas: { label: "Encomendas", icon: "cube-outline" },
    transporte: { label: "Veículos", icon: "car-sport-outline" },
    mudanca: { label: "Mudanças", icon: "archive-outline" },
    cargas: { label: "Cargas", icon: "layers-outline" },
  };

  useEffect(() => {
    const idBarco = Array.isArray(barcoId) ? barcoId[0] : barcoId;
    if (!idBarco) return;

    setCarregando(true);

    const unsubBarco = onSnapshot(
      doc(db, "embarcacoes", idBarco),
      (docSnap) => {
        if (docSnap.exists()) setBarco({ id: docSnap.id, ...docSnap.data() });
      },
    );

    const consultaGrades = query(
      collection(db, "grades_viagens"),
      where("id_barco", "==", idBarco),
    );
    const unsubGrades = onSnapshot(consultaGrades, (snap) => {
      setGrades(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      setCarregando(false);
    });

    const consultaProgramacoes = query(
      collection(db, "programacoes_viagem"),
      where("barcoId", "==", idBarco),
    );
    const unsubProgramacoes = onSnapshot(consultaProgramacoes, (snap) => {
      setProgramacoes(
        snap.docs
          .map((item) => normalizarProgramacaoViagem(item.id, item.data()))
          .filter((item) => item.ativo),
      );
      setCarregando(false);
    });

    return () => {
      unsubBarco();
      unsubGrades();
      unsubProgramacoes();
    };
  }, [barcoId]);

  const idBarcoAtual = Array.isArray(barcoId)
    ? barcoId[0]
    : String(barcoId || "");

  const programacoesExibicao = useMemo(() => {
    const escalasDetalhadas = Array.isArray(barco?.escalasBasicasDetalhadas)
      ? barco.escalasBasicasDetalhadas
      : [];
    const rotasCadastro = Array.isArray(barco?.rotasCadastro)
      ? barco.rotasCadastro
      : [];
    const cadastradas = rotasCadastro.map((rota: any, indice: number) =>
      normalizarProgramacaoViagem(
        `${idBarcoAtual}_rota_${rota?.sentido || "ida"}_${indice + 1}`,
        {
          ...rota,
          barcoId: idBarcoAtual,
          ativo: true,
          itinerario: [
            {
              tipo: "origem",
              ordem: 0,
              cidade: rota?.origemCidade,
              uf: rota?.origemUf,
              portoNome: rota?.portoOrigem,
            },
            ...(Array.isArray(rota?.escalas) ? rota.escalas : []).map(
              (escala: any, escalaIndice: number) => ({
                ...escala,
                tipo: "escala",
                ordem: escalaIndice + 1,
                portoNome: escala?.porto,
              }),
            ),
            {
              tipo: "destino",
              ordem:
                (Array.isArray(rota?.escalas) ? rota.escalas.length : 0) + 1,
              cidade: rota?.destinoCidade,
              uf: rota?.destinoUf,
              portoNome: rota?.portoDestino,
            },
          ],
        },
      ),
    );

    const principais =
      programacoes.length > 0
        ? [...programacoes]
        : montarProgramacoesLegadas(grades, idBarcoAtual);

    if (principais.length > 0) {
      const sentidosPrincipais = new Set(
        principais.map((item) => item.sentido),
      );
      const sentidosComplementares = cadastradas.filter(
        (item: any) => !sentidosPrincipais.has(item.sentido),
      );
      return [...principais, ...sentidosComplementares].sort((a, b) => {
        const sentido = a.sentido.localeCompare(b.sentido);
        if (sentido !== 0) return sentido;
        return a.horarioSaida.localeCompare(b.horarioSaida);
      });
    }

    if (cadastradas.length > 0) return cadastradas;

    if (escalasDetalhadas.length > 0) {
      const sentidos = ["ida", "volta"] as const;
      return sentidos
        .map((sentido) => {
          const escalas = escalasDetalhadas.filter(
            (escala: any) => String(escala?.sentido || "ida") === sentido,
          );
          if (escalas.length === 0) return null;
          const origem =
            sentido === "ida"
              ? barco?.origemCidade || barco?.origem
              : barco?.destinoCidade || barco?.destino;
          const destino =
            sentido === "ida"
              ? barco?.destinoCidade || barco?.destino
              : barco?.origemCidade || barco?.origem;
          return normalizarProgramacaoViagem(
            `${idBarcoAtual}_escalas_${sentido}`,
            {
              barcoId: idBarcoAtual,
              sentido,
              ativo: true,
              origemCidade: origem,
              destinoCidade: destino,
              itinerario: [
                { tipo: "origem", ordem: 0, cidade: origem },
                ...escalas.map((escala: any, indice: number) => ({
                  ...escala,
                  tipo: "escala",
                  ordem: indice + 1,
                  portoNome: escala?.porto,
                })),
                {
                  tipo: "destino",
                  ordem: escalas.length + 1,
                  cidade: destino,
                },
              ],
            },
          );
        })
        .filter((item): item is ProgramacaoViagem => item !== null);
    }

    return [];
  }, [barco, grades, idBarcoAtual, programacoes]);

  const programacoesDoSentido = useMemo(
    () => programacoesExibicao.filter((item: any) => item.sentido === abaAtiva),
    [abaAtiva, programacoesExibicao],
  );

  const temIda = programacoesExibicao.some(
    (item: any) => item.sentido === "ida",
  );
  const temVolta = programacoesExibicao.some(
    (item: any) => item.sentido === "volta",
  );

  useEffect(() => {
    if (abaAtiva === "ida" && !temIda && temVolta) setAbaAtiva("volta");
    if (abaAtiva === "volta" && !temVolta && temIda) setAbaAtiva("ida");
  }, [abaAtiva, temIda, temVolta]);

  const triggerHaptic = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const limparNumeroContato = (numero: any) => {
    return String(numero || "").replace(/\D/g, "");
  };

  const numeroParaWaMe = (numero: any) => {
    const limpo = limparNumeroContato(numero);

    if (!limpo) return "";

    if (limpo.startsWith("55")) return limpo;

    return `55${limpo}`;
  };

  const contatosPermitidos = () => {
    const recursos = recursosDaEmbarcacao(barco || {});
    if (!recursos.mostrarContato) return [];

    const contatosNovos = Array.isArray(barco?.contatosWhatsApp)
      ? barco.contatosWhatsApp
          .filter((contato: any) => contato?.ativo !== false)
          .filter(
            (contato: any) => limparNumeroContato(contato?.numero).length >= 10,
          )
      : [];

    if (contatosNovos.length > 0) {
      return contatosNovos.slice(0, recursos.limiteContatos);
    }

    if (barco?.informacoesPassageiroAtivo !== true) return [];
    const numero = barco?.whatsappInformacoes || barco?.telefoneInformacoes;
    if (limparNumeroContato(numero).length < 10) return [];
    return [
      {
        id: "legado",
        numero,
        nome: barco?.nomeContatoInformacoes || "",
        funcao: barco?.funcaoContatoInformacoes || "",
        mensagem:
          barco?.textoInformacoes ||
          `Olá, gostaria de mais informações sobre a embarcação ${barco?.nome || ""}.`,
      },
    ];
  };

  const podeSolicitarInformacoes = () => contatosPermitidos().length > 0;

  const abrirWhatsApp = (contato?: any) => {
    const contatoEscolhido = contato || contatosPermitidos()[0];
    const numero = numeroParaWaMe(contatoEscolhido?.numero);

    if (!numero) return;

    const mensagem =
      contatoEscolhido?.mensagem ||
      `Olá, gostaria de mais informações sobre a embarcação ${barco?.nome || ""}.`;

    Linking.openURL(
      `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`,
    );
  };

  const abrirLinkSeguro = (url?: string) => {
    const link = String(url || "").trim();

    if (!link) return;

    if (link.startsWith("http://") || link.startsWith("https://")) {
      Linking.openURL(link);
      return;
    }

    Linking.openURL(`https://${link}`);
  };

  const temRedeSocialOuSite = () => {
    return !!(
      barco?.instagramBarco ||
      barco?.facebookBarco ||
      barco?.siteBarco
    );
  };

  const planoAtual = planoEfetivo(barco || {});
  const recursosPlano = recursosDaEmbarcacao(barco || {});
  const sinalAtual = statusSinalDaEmbarcacao(barco || {});

  if (carregando && !barco) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  const fotosOriginais =
    barco?.fotos?.length > 0
      ? barco.fotos
      : ["https://via.placeholder.com/1000x560.png?text=Sem+Fotos"];
  const fotos =
    planoAtual === "basico" ? fotosOriginais.slice(0, 1) : fotosOriginais;

  // Filtragem das listas para exibição
  const comodidadesAtivas = barco?.comodidades
    ? Object.entries(barco.comodidades)
        .filter(
          ([key, val]) =>
            val && MAPA_COMODIDADES[key as keyof typeof MAPA_COMODIDADES],
        )
        .map(([key]) => MAPA_COMODIDADES[key as keyof typeof MAPA_COMODIDADES])
    : [];

  const logisticaAtiva = barco?.comodidades
    ? Object.entries(barco.comodidades)
        .filter(
          ([key, val]) =>
            val && MAPA_LOGISTICA[key as keyof typeof MAPA_LOGISTICA],
        )
        .map(([key]) => MAPA_LOGISTICA[key as keyof typeof MAPA_LOGISTICA])
    : [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.headerAbsolute, { top: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.btnVoltarRedondo}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {/* Carrossel */}
        <View style={styles.carrosselContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) =>
              setSlideAtual(Math.round(e.nativeEvent.contentOffset.x / width))
            }
          >
            {fotos.map((f: string, i: number) => (
              <View key={i} style={styles.fotoContainer}>
                <Image source={{ uri: f }} style={styles.imagemCapa} />
                <LinearGradient
                  colors={["transparent", "rgba(2, 6, 23, 0.6)", "#020617"]}
                  style={styles.gradientInferior}
                />
              </View>
            ))}
          </ScrollView>
          <View style={styles.paginacaoContainer}>
            {fotos.map((_: any, idx: number) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  slideAtual === idx ? styles.dotAtivo : styles.dotInativo,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.conteudo}>
          {/* Info Principal */}
          <View style={styles.tituloRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nomeEmbarcacao}>{barco?.nome}</Text>
              <View style={styles.identificadoresRow}>
                <View
                  style={[
                    styles.badgePlano,
                    { borderColor: CORES_PLANO[planoAtual] },
                  ]}
                >
                  <Ionicons
                    name={ICONE_PLANO[planoAtual]}
                    size={13}
                    color={CORES_PLANO[planoAtual]}
                  />
                  <Text
                    style={[
                      styles.badgePlanoTexto,
                      { color: CORES_PLANO[planoAtual] },
                    ]}
                  >
                    {ROTULOS_PLANO[planoAtual]}
                  </Text>
                </View>
                {planoAtual === "tempo_real" ? (
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.pontoAtivo,
                        sinalAtual === "offline" && styles.pontoOffline,
                        sinalAtual === "desativado" && styles.pontoDesativado,
                      ]}
                    />
                    <Text style={styles.statusTexto}>
                      {sinalAtual === "ativo"
                        ? "ATIVO"
                        : sinalAtual === "offline"
                          ? "OFFLINE"
                          : "DESATIVADO"}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.semAcompanhamentoTexto}>
                    Sem acompanhamento em tempo real
                  </Text>
                )}
              </View>
            </View>
            {(barco?.statusCadastro === "aprovado" ||
              barco?.contaVerificada === true ||
              barco?.cadastroVerificado === true ||
              !!barco?.cnpj) && (
              <View style={styles.seloVerificado}>
                <Ionicons name="shield-checkmark" size={14} color="#10b981" />
                <Text style={styles.seloVerificadoTxt}>CONTA VERIFICADA</Text>
              </View>
            )}
          </View>
          <Text style={styles.versaoTela}>
            PERFIL DE EMBARCAÇÃO • ATUALIZAÇÃO {VERSAO_TELA_PLANOS}
          </Text>

          {/* Seção Sobre */}
          <View style={styles.sectionDescricao}>
            <View style={styles.descricaoBox}>
              <Text style={styles.descricaoTxt}>
                {barco?.descricao ||
                  "Informações de marketing não cadastradas."}
              </Text>
            </View>
          </View>

          {podeSolicitarInformacoes() && (
            <View style={styles.sectionInformacoes}>
              <Text style={styles.subTitulo}>Informações ao Passageiro</Text>

              {contatosPermitidos().map((contato: any, index: number) => (
                <TouchableOpacity
                  key={contato.id || `${contato.numero}_${index}`}
                  style={styles.infoContatoBox}
                  onPress={() => abrirWhatsApp(contato)}
                >
                  <View style={styles.infoContatoIcone}>
                    <Ionicons name="logo-whatsapp" size={22} color="#10b981" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoContatoTitulo}>
                      {contato.nome || "Fale com a embarcação"}
                    </Text>
                    {!!contato.funcao && (
                      <Text style={styles.infoContatoTexto}>
                        {contato.funcao}
                      </Text>
                    )}
                    <Text style={styles.infoContatoNumero}>
                      WhatsApp: {contato.numero}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {recursosPlano.perfilCompleto && temRedeSocialOuSite() && (
            <View style={styles.sectionRedes}>
              <Text style={styles.subTitulo}>Redes sociais e site</Text>
              <View style={styles.redesContainer}>
                {barco?.instagramBarco && (
                  <TouchableOpacity
                    style={styles.btnRedeSocial}
                    onPress={() => abrirLinkSeguro(barco.instagramBarco)}
                  >
                    <Ionicons name="logo-instagram" size={22} color="#e879f9" />
                  </TouchableOpacity>
                )}

                {barco?.facebookBarco && (
                  <TouchableOpacity
                    style={styles.btnRedeSocial}
                    onPress={() => abrirLinkSeguro(barco.facebookBarco)}
                  >
                    <Ionicons name="logo-facebook" size={22} color="#60a5fa" />
                  </TouchableOpacity>
                )}

                {barco?.siteBarco && (
                  <TouchableOpacity
                    style={styles.btnRedeSocial}
                    onPress={() => abrirLinkSeguro(barco.siteBarco)}
                  >
                    <Ionicons name="globe-outline" size={22} color="#38bdf8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ⚓ SEÇÃO DE ITINERÁRIO */}
          {programacoesExibicao.length > 0 && (
            <View style={styles.sectionItinerario}>
              <Text style={styles.subTitulo}>
                {recursosPlano.mostrarHorarios
                  ? "Itinerário e horários"
                  : "Rotas e escalas"}
              </Text>
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    abaAtiva === "ida" && styles.tabButtonAtivo,
                  ]}
                  disabled={!temIda}
                  onPress={() => {
                    triggerHaptic();
                    setAbaAtiva("ida");
                  }}
                >
                  <Ionicons
                    name="arrow-down-circle"
                    size={16}
                    color={abaAtiva === "ida" ? "#fff" : "#64748b"}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      abaAtiva === "ida" && styles.tabTextAtivo,
                    ]}
                  >
                    SENTIDO IDA
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    abaAtiva === "volta" && styles.tabButtonAtivo,
                  ]}
                  disabled={!temVolta}
                  onPress={() => {
                    triggerHaptic();
                    setAbaAtiva("volta");
                  }}
                >
                  <Ionicons
                    name="arrow-up-circle"
                    size={16}
                    color={abaAtiva === "volta" ? "#fff" : "#64748b"}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      abaAtiva === "volta" && styles.tabTextAtivo,
                    ]}
                  >
                    SENTIDO VOLTA
                  </Text>
                </TouchableOpacity>
              </View>

              {programacoesDoSentido.length > 0 ? (
                <Animated.View entering={FadeInUp} key={abaAtiva}>
                  <View style={styles.programacoesLista}>
                    {programacoesDoSentido.map(
                      (programacao: any, programacaoIndex: number) => {
                        const itinerario =
                          obterItinerarioProgramacao(programacao);
                        return (
                          <View
                            key={programacao.id}
                            style={styles.programacaoCard}
                          >
                            <View style={styles.programacaoCabecalho}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.programacaoDias}>
                                  {diasDaProgramacao(programacao) ||
                                    "Dias não informados"}
                                </Text>
                                <Text style={styles.programacaoRota}>
                                  {programacao.origemCidade ||
                                    programacao.origem ||
                                    "Origem"}
                                  {" → "}
                                  {programacao.destinoCidade ||
                                    programacao.destino ||
                                    "Destino"}
                                </Text>
                              </View>
                              {recursosPlano.mostrarHorarios &&
                                !!programacao.horarioSaida && (
                                  <View style={styles.programacaoHora}>
                                    <Ionicons
                                      name="time-outline"
                                      size={14}
                                      color="#38bdf8"
                                    />
                                    <Text style={styles.programacaoHoraTexto}>
                                      {programacao.horarioSaida}
                                    </Text>
                                  </View>
                                )}
                            </View>

                            <View style={styles.itinerarioVertical}>
                              {itinerario.map((ponto, index) => (
                                <View
                                  key={`${programacao.id}_${ponto.id}_${index}`}
                                  style={styles.pontoItinerarioLinha}
                                >
                                  <View style={styles.eixoItinerario}>
                                    <View
                                      style={[
                                        styles.pontoItinerario,
                                        ponto.tipo === "origem" &&
                                          styles.pontoOrigem,
                                        ponto.tipo === "destino" &&
                                          styles.pontoDestino,
                                      ]}
                                    />
                                    {index < itinerario.length - 1 && (
                                      <View style={styles.linhaItinerario} />
                                    )}
                                  </View>

                                  <View style={styles.pontoItinerarioConteudo}>
                                    <Text style={styles.pontoTipo}>
                                      {tituloTipoPonto(ponto)}
                                    </Text>
                                    <Text style={styles.pontoCidade}>
                                      {ponto.cidade || "Cidade não informada"}
                                    </Text>
                                    {!!ponto.portoNome && (
                                      <View style={styles.portoLinha}>
                                        <Ionicons
                                          name="boat-outline"
                                          size={14}
                                          color="#38bdf8"
                                        />
                                        <Text style={styles.pontoPorto}>
                                          {ponto.portoNome}
                                        </Text>
                                      </View>
                                    )}
                                    {recursosPlano.mostrarHorarios ||
                                    ponto.tipo !== "escala" ? (
                                      <Text style={styles.pontoHorario}>
                                        {horarioDoPonto(ponto, programacao)}
                                      </Text>
                                    ) : ponto.tipo === "escala" &&
                                      ponto.diasPassagem.length > 0 ? (
                                      <View style={styles.diasPassagemLinha}>
                                        <Ionicons
                                          name="calendar-outline"
                                          size={13}
                                          color="#a78bfa"
                                        />
                                        <Text style={styles.diasPassagemTexto}>
                                          Passagem prevista:{" "}
                                          {diasDePassagemDoPonto(ponto)}
                                        </Text>
                                      </View>
                                    ) : null}
                                  </View>
                                </View>
                              ))}
                            </View>

                            {programacoesDoSentido.length > 1 && (
                              <Text style={styles.programacaoContador}>
                                Saída {programacaoIndex + 1} de{" "}
                                {programacoesDoSentido.length}
                              </Text>
                            )}
                          </View>
                        );
                      },
                    )}
                  </View>
                </Animated.View>
              ) : (
                <View style={styles.emptyGrade}>
                  <Text style={styles.emptyGradeTxt}>
                    Itinerário de {abaAtiva} não disponível.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* 🟢 COMODIDADES ATIVAS */}
          {recursosPlano.perfilCompleto && comodidadesAtivas.length > 0 && (
            <View style={styles.sectionChips}>
              <Text style={styles.subTitulo}>Comodidades</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollChips}
              >
                {comodidadesAtivas.map((item, index) => (
                  <Animated.View
                    key={index}
                    entering={FadeInRight.delay(100 * index)}
                  >
                    <View style={styles.chipHorizontal}>
                      <Ionicons
                        name={item.icon as any}
                        size={16}
                        color="#38bdf8"
                      />
                      <Text style={styles.chipTxt}>{item.label}</Text>
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 🟢 LOGÍSTICA ATIVA */}
          {recursosPlano.perfilCompleto && logisticaAtiva.length > 0 && (
            <View style={styles.sectionChips}>
              <Text style={styles.subTitulo}>Serviços de Logística</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollChips}
              >
                {logisticaAtiva.map((item, index) => (
                  <Animated.View
                    key={index}
                    entering={FadeInRight.delay(100 * index)}
                  >
                    <View
                      style={[
                        styles.chipHorizontal,
                        { borderColor: "rgba(245, 158, 11, 0.2)" },
                      ]}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={16}
                        color="#f59e0b"
                      />
                      <Text style={styles.chipTxt}>{item.label}</Text>
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  headerAbsolute: { position: "absolute", left: 20, zIndex: 10 },
  btnVoltarRedondo: {
    width: 30,
    height: 30,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    top: 0,
    marginTop: 0,
  },
  carrosselContainer: { width: width, height: CAROUSEL_HEIGHT },
  fotoContainer: { width: width, height: CAROUSEL_HEIGHT },
  imagemCapa: { width: "100%", height: "100%", resizeMode: "cover" },
  gradientInferior: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: "20%",
  },
  paginacaoContainer: {
    position: "absolute",
    bottom: 50,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    zIndex: 5,
  },
  dot: { height: 3, borderRadius: 2 },
  dotAtivo: { width: 20, backgroundColor: "#38bdf8" },
  dotInativo: { width: 6, backgroundColor: "rgba(255,255,255,0.3)" },
  conteudo: {
    paddingHorizontal: 20,
    paddingTop: 25,
    marginTop: -40,
    backgroundColor: "#020617",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    zIndex: 2,
  },
  tituloRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  nomeEmbarcacao: { color: "#fff", fontSize: 26, fontWeight: "900" },
  versaoTela: {
    color: "#334155",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: -12,
    marginBottom: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  identificadoresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  badgePlano: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgePlanoTexto: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  pontoAtivo: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  pontoOffline: { backgroundColor: "#fb923c" },
  pontoDesativado: { backgroundColor: "#64748b" },
  statusTexto: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  semAcompanhamentoTexto: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  seloVerificado: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 6,
    borderRadius: 12,
    gap: 4,
  },
  seloVerificadoTxt: { color: "#10b981", fontSize: 9, fontWeight: "900" },
  sectionDescricao: { marginBottom: 25 },
  escalasBasicasBox: {
    gap: 8,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.15)",
    padding: 14,
  },
  escalaBasicaLinha: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  escalaBasicaTexto: { color: "#e2e8f0", fontSize: 14, fontWeight: "700" },
  avisoPlanoBasico: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
  },
  descricaoBox: {
    backgroundColor: "#0f172a",
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#38bdf8",
  },
  descricaoTxt: { color: "#cbd5e1", fontSize: 14, lineHeight: 22 },
  subTitulo: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 15,
    textTransform: "uppercase",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    gap: 8,
  },
  tabButtonAtivo: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#38bdf8",
  },
  tabText: { color: "#64748b", fontSize: 11, fontWeight: "900" },
  tabTextAtivo: { color: "#fff" },
  sectionInformacoes: { marginBottom: 25 },
  infoContatoBox: {
    backgroundColor: "#0f172a",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.18)",
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  infoContatoIcone: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoContatoTitulo: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 5,
  },
  infoContatoTexto: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
  },
  infoContatoNumero: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  sectionRedes: { marginBottom: 25 },
  redesContainer: {
    flexDirection: "row",
    gap: 12,
  },
  btnRedeSocial: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionItinerario: { marginBottom: 30 },
  diasContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  diaCirculo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  diaCirculoAtivo: { backgroundColor: "#38bdf8", borderColor: "#38bdf8" },
  diaTexto: { color: "#475569", fontSize: 9, fontWeight: "bold" },
  diaTextoAtivo: { color: "#fff" },
  scrollItinerario: { paddingRight: 40, height: 120 },
  timelineItem: { alignItems: "center", marginRight: 25, minWidth: 100 },
  timeTag: {
    backgroundColor: "#38bdf8",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  timeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  pontoTimeline: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#475569",
    borderWidth: 2,
    borderColor: "#020617",
    zIndex: 2,
  },
  portoNome: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  portoSub: { color: "#64748b", fontSize: 10, marginTop: 2 },
  emptyGrade: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 16,
  },
  emptyGradeTxt: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  programacoesLista: { gap: 14 },
  programacaoCard: {
    backgroundColor: "#0f172a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.14)",
    padding: 16,
  },
  programacaoCabecalho: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.12)",
  },
  programacaoDias: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  programacaoRota: { color: "#cbd5e1", fontSize: 11, marginTop: 4 },
  programacaoHora: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  programacaoHoraTexto: { color: "#e0f2fe", fontSize: 12, fontWeight: "900" },
  itinerarioVertical: { marginTop: 16 },
  pontoItinerarioLinha: { flexDirection: "row", minHeight: 94 },
  eixoItinerario: { width: 22, alignItems: "center" },
  pontoItinerario: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#64748b",
    borderWidth: 2,
    borderColor: "#0f172a",
    zIndex: 2,
  },
  pontoOrigem: { backgroundColor: "#10b981" },
  pontoDestino: { backgroundColor: "#f59e0b" },
  linhaItinerario: { width: 2, flex: 1, backgroundColor: "#26364d" },
  pontoItinerarioConteudo: { flex: 1, paddingLeft: 10, paddingBottom: 18 },
  pontoTipo: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pontoCidade: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3,
  },
  portoLinha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  pontoPorto: { color: "#bae6fd", fontSize: 12, fontWeight: "700", flex: 1 },
  pontoHorario: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 6,
    lineHeight: 15,
  },
  diasPassagemLinha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 7,
  },
  diasPassagemTexto: {
    color: "#c4b5fd",
    fontSize: 11,
    fontWeight: "700",
  },
  programacaoContador: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "right",
    marginTop: 4,
  },
  sectionChips: { marginBottom: 25 },
  scrollChips: { gap: 10, paddingRight: 20 },
  chipHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.15)",
    gap: 8,
  },
  chipTxt: { color: "#f8fafc", fontSize: 11, fontWeight: "600" },
  footerAcao: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 15,
    backgroundColor: "#020617",
  },
  btnContato: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    borderRadius: 18,
    gap: 10,
    marginBottom: 50,
  },
  btnContatoTxt: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
