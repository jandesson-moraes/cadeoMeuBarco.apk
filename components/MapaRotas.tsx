import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

// ⚓️ Exemplo de Rota Gravada (Você puxaria isso do Firebase)
// Estas são coordenadas fictícias simulando uma curva de rio
const ROTA_MANAUS_TEFE = [
  { latitude: -3.136932, longitude: -59.982312 }, // Saída Manaus
  { latitude: -3.145, longitude: -60.05 }, // Curva do Rio Negro
  { latitude: -3.2, longitude: -60.15 }, // Encontro das Águas
  { latitude: -3.25, longitude: -60.3 }, // Subindo o Solimões
  { latitude: -3.321456, longitude: -64.713589 }, // Chegada Tefé (Aproximada)
];

export default function MapaRotas() {
  const [carregando, setCarregando] = useState(false);
  const [coordenadasRota, setCoordenadasRota] = useState(ROTA_MANAUS_TEFE);

  // Aqui você faria o useEffect para buscar as coordenadas da viagem no Firebase
  /*
  useEffect(() => {
     buscarRotaNoFirebase(idViagem).then((dados) => setCoordenadasRota(dados));
  }, []);
  */

  if (carregando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Traçando rota no rio...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: -3.136932,
          longitude: -59.982312,
          latitudeDelta: 1.5, // Zoom mais distante para ver a rota
          longitudeDelta: 1.5,
        }}
        // 🎨 Estilo customizado para focar na água e escurecer a terra (Opcional)
        customMapStyle={[
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#0ea5e9" }], // Rio azul bem vivo
          },
          {
            featureType: "landscape",
            elementType: "geometry",
            stylers: [{ color: "#0f172a" }], // Terra escura
          },
        ]}
      >
        {/* 🟢 O SEGREDO DA LINHA BONITA: POLYLINE */}
        <Polyline
          coordinates={coordenadasRota}
          strokeColor="#38bdf8" // Cor da linha (Azul claro neon)
          strokeWidth={4} // Espessura da rota
          lineDashPattern={[0]} // Linha contínua
          geodesic={true} // Segue a curvatura da terra
        />

        {/* Marcador de Saída (Manaus) */}
        <Marker coordinate={coordenadasRota[0]} tracksViewChanges={false}>
          <View style={styles.marcadorPorto}>
            <Ionicons name="boat" size={16} color="#fff" />
          </View>
        </Marker>

        {/* Marcador de Chegada (Tefé) */}
        <Marker
          coordinate={coordenadasRota[coordenadasRota.length - 1]}
          tracksViewChanges={false}
        >
          <View style={styles.marcadorDestino}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
        </Marker>
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#020617",
  },
  loadingText: {
    color: "#38bdf8",
    marginTop: 10,
    fontWeight: "bold",
  },
  marcadorPorto: {
    backgroundColor: "#10b981", // Verde para saída
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#fff",
  },
  marcadorDestino: {
    backgroundColor: "#ef4444", // Vermelho para chegada
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#fff",
  },
});
