import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

export default function MenuSelecao({
  terminais = [],
  frota = [],
  aoSelecionarBarco,
  aoSelecionarPorto,
}: any) {
  const [busca, setBusca] = useState("");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const telaTablet = width >= 700;

  // 🟢 FILTRO INTELIGENTE (Barcos e Portos)
  const resultadosFiltrados = useMemo(() => {
    const texto = busca.toLowerCase().trim();
    if (!texto) return { barcos: frota, portos: terminais };

    return {
      barcos: frota.filter((b: any) => b.nome.toLowerCase().includes(texto)),
      portos: terminais.filter((p: any) => p.nome.toLowerCase().includes(texto)),
    };
  }, [busca, frota, terminais]);

  // 🟢 COMPONENTE DE BARCO NÃO ENCONTRADO (MARKETING)
  const EmptyBarco = () => (
    <View style={styles.cardAviso}>
      <Ionicons name="megaphone-outline" size={30} color="#facc15" />
      <Text style={styles.avisoTitulo}>Barco não cadastrado</Text>
      <Text style={styles.avisoTexto}>
        Ainda não rastreamos esta embarcação. Peça ao dono ou gerente para
        entrar em contato conosco!
      </Text>
      <TouchableOpacity style={styles.btnIndicar}>
        <Text style={styles.btnIndicarTexto}>INDICAR CADÊ MEU BARCO</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, telaTablet && styles.containerTablet]}>
      {/* 🔍 BARRA DE PESQUISA */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#64748b" />
        <TextInput
          style={styles.input}
          placeholder="Pesquisar barco ou porto..."
          placeholderTextColor="#64748b"
          value={busca}
          onChangeText={setBusca}
        />
        {busca !== "" && (
          <TouchableOpacity onPress={() => setBusca("")}>
            <Ionicons name="close-circle" size={20} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={[
          { type: "header", title: "Embarcações" },
          ...resultadosFiltrados.barcos,
          {
            type: "empty-barco",
            visible: resultadosFiltrados.barcos.length === 0,
          },
          { type: "header", title: "Portos e Terminais" },
          ...resultadosFiltrados.portos,
          {
            type: "empty-porto",
            visible: resultadosFiltrados.portos.length === 0,
          },
        ]}
        keyExtractor={(item, index) => item.id || index.toString()}
        renderItem={({ item }) => {
          if (item.type === "header")
            return <Text style={styles.secaoTitulo}>{item.title}</Text>;

          if (item.type === "empty-barco" && item.visible)
            return <EmptyBarco />;

          if (item.type === "empty-porto" && item.visible) {
            return (
              <Text style={styles.avisoSimples}>
                Porto ainda não cadastrado em nosso mapa.
              </Text>
            );
          }

          if (item.nome) {
            // Se for um barco ou porto real
            return (
              <TouchableOpacity
                style={styles.item}
                onPress={() =>
                  item.ultima_posicao
                    ? aoSelecionarBarco(item)
                    : aoSelecionarPorto(item)
                }
              >
                <Ionicons
                  name={item.ultima_posicao ? "boat-outline" : "location-outline"}
                  size={22}
                  color="#38bdf8"
                />
                <Text style={styles.itemNome}>{item.nome}</Text>
              </TouchableOpacity>
            );
          }
          return null;
        }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 28 }}
        removeClippedSubviews={true} // 🟢 Performance extra
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  containerTablet: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  input: { flex: 1, color: "#fff", marginLeft: 10, fontSize: 16 },
  secaoTitulo: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: 1,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 8,
    gap: 12,
  },
  itemNome: { color: "#f8fafc", fontSize: 16, fontWeight: "500" },
  cardAviso: {
    backgroundColor: "rgba(250, 204, 21, 0.05)",
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.2)",
    alignItems: "center",
    marginTop: 10,
  },
  avisoTitulo: {
    color: "#facc15",
    fontWeight: "bold",
    fontSize: 16,
    marginTop: 10,
  },
  avisoTexto: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  btnIndicar: {
    backgroundColor: "#facc15",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 15,
  },
  btnIndicarTexto: { color: "#020617", fontWeight: "900", fontSize: 12 },
  avisoSimples: {
    color: "#64748b",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
  },
});
