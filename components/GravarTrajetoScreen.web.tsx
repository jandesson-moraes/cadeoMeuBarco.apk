import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function GravarTrajetoScreenWeb() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Ionicons name="phone-portrait-outline" size={48} color="#38bdf8" />
        </View>

        <Text style={styles.titulo}>Gravação disponível no celular</Text>

        <Text style={styles.texto}>
          Esta tela usa GPS nativo e mapa do aplicativo Android/iOS. Por isso,
          ela não abre na versão web.
        </Text>

        <Text style={styles.textoMenor}>
          Para gravar trajeto, abra o app no celular autorizado ou no
          dispositivo usado pela embarcação.
        </Text>

        <TouchableOpacity style={styles.botao} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={20} color="#020617" />
          <Text style={styles.botaoTexto}>VOLTAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
  },
  iconBox: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.35)",
  },
  titulo: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  texto: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 10,
  },
  textoMenor: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  botao: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#38bdf8",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  botaoTexto: {
    color: "#020617",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.8,
  },
});
