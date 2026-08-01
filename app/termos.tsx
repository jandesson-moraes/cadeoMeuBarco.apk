import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TermosDeUso() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#38bdf8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Termos de Uso</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.card}>
          <Text style={styles.appTitle}>Cadê meu barco</Text>
          <Text style={styles.lastUpdate}>
            Última atualização: Maio de 2026
          </Text>

          <Text style={styles.sectionTitle}>1. INTRODUÇÃO</Text>
          <Text style={styles.paragraph}>
            Bem-vindo ao aplicativo{" "}
            <Text style={styles.bold}>Cadê meu barco</Text>. Nossa plataforma
            oferece infraestrutura tecnológica para conectar passageiros a
            armadores e comandantes de embarcações, facilitando a compra de
            passagens, gestão de frota e controle de embarque. Ao utilizar o
            aplicativo, você concorda com estes Termos de Uso.
          </Text>

          <Text style={styles.sectionTitle}>2. O PAPEL DA PLATAFORMA</Text>
          <Text style={styles.paragraph}>
            O <Text style={styles.bold}>Cadê meu barco</Text> atua
            exclusivamente como intermediador tecnológico. Nós não somos
            proprietários de embarcações, não operamos serviços de transporte
            aquaviário e não nos responsabilizamos por atrasos, mudanças de
            rota, acidentes ou cancelamentos de viagens. Toda a responsabilidade
            pela prestação do serviço de transporte é exclusiva do
            Armador/Comandante da embarcação.
          </Text>

          <Text style={styles.sectionTitle}>3. REGRAS PARA PASSAGEIROS</Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Compra e Embarque:</Text> A compra do
            bilhete gera um QR Code nominal e intransferível. O passageiro deve
            apresentar este código juntamente com um documento de identidade
            oficial com foto no momento do embarque.{"\n"}•{" "}
            <Text style={styles.bold}>Cancelamentos:</Text> Políticas de
            cancelamento e remarcação seguem as regras estipuladas pelo Armador
            e pela legislação da Antaq. O aplicativo não processa devoluções
            financeiras diretamente.{"\n"}•{" "}
            <Text style={styles.bold}>Comportamento:</Text> O passageiro
            concorda em seguir todas as normas de segurança da Marinha do
            Brasil.
          </Text>

          <Text style={styles.sectionTitle}>
            4. REGRAS PARA COMANDANTES E ARMADORES
          </Text>
          <Text style={styles.paragraph}>
            • <Text style={styles.bold}>Obrigações Legais:</Text> É obrigação do
            Armador garantir que a embarcação possui todas as licenças, seguros
            obrigatórios e vistorias da Capitania dos Portos em dia.{"\n"}•{" "}
            <Text style={styles.bold}>Manifesto de Passageiros:</Text> O
            Comandante concorda em utilizar a ferramenta de scanner da
            plataforma para garantir que o manifesto seja preciso e real.{"\n"}•{" "}
            <Text style={styles.bold}>Rastreamento:</Text> Ao ativar a
            telemetria, o Comandante autoriza o uso do GPS do dispositivo para
            atualização do status da viagem.
          </Text>

          <Text style={styles.sectionTitle}>5. PRIVACIDADE E DADOS (LGPD)</Text>
          <Text style={styles.paragraph}>
            Os dados coletados (nome, documento, telefone) são utilizados
            exclusivamente para a emissão de bilhetes, criação do manifesto
            exigido por lei e segurança da conta. Ao solicitar a exclusão da
            conta, seus dados pessoais serão removidos, mantendo-se apenas os
            registros exigidos por lei.
          </Text>

          <View style={styles.footerLine} />
          <Text style={styles.footerText}>
            O uso indevido da plataforma ou tentativas de fraude resultará no
            bloqueio imediato da conta.
          </Text>
        </Animated.View>
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(56, 189, 248, 0.1)",
    backgroundColor: "#0f172a",
  },
  backBtn: { padding: 5 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  scrollContent: { padding: 20, paddingBottom: 50 },
  card: {
    backgroundColor: "#0f172a",
    padding: 25,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  appTitle: {
    color: "#38bdf8",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 5,
  },
  lastUpdate: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 30,
    fontStyle: "italic",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
  },
  paragraph: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "justify",
  },
  bold: { fontWeight: "bold", color: "#f8fafc" },
  footerLine: { height: 1, backgroundColor: "#1e293b", marginVertical: 25 },
  footerText: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
});
