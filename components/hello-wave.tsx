import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { db } from "../services/firebase";

export default function MapaView({ barco, porto, raio, userLocation }: any) {
  const [barcoRealtime, setBarcoRealtime] = useState<any>(null);

  // Monitora o barco em tempo real
  useEffect(() => {
    if (!barco?.id) return;
    const unsub = onSnapshot(doc(db, "embarcacoes", barco.id), (d) => {
      if (d.exists()) setBarcoRealtime(d.data());
    });
    return () => unsub();
  }, [barco]);

  // Captura coordenadas do Porto
  const pLat = porto
    ? Number(porto.coordenadas?.lat || porto.coordenadas?.latitude)
    : undefined;
  const pLng = porto
    ? Number(porto.coordenadas?.lng || porto.coordenadas?.longitude)
    : undefined;

  // Captura coordenadas do Barco
  const bLat =
    barcoRealtime?.status === "em viagem"
      ? Number(barcoRealtime.ultima_posicao?.latitude)
      : undefined;
  const bLng =
    barcoRealtime?.status === "em viagem"
      ? Number(barcoRealtime.ultima_posicao?.longitude)
      : undefined;

  // Lógica inteligente para centralizar a câmera do mapa
  let initialRegion = {
    latitude: -2.162, // Padrão Juruti
    longitude: -56.095,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  if (bLat !== undefined && bLng !== undefined) {
    initialRegion = {
      latitude: bLat,
      longitude: bLng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  } else if (pLat !== undefined && pLng !== undefined) {
    initialRegion = {
      latitude: pLat,
      longitude: pLng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  } else if (userLocation) {
    initialRegion = {
      latitude: userLocation.lat,
      longitude: userLocation.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={initialRegion}
        showsUserLocation={true} // Mostra a bolinha azul do seu próprio GPS
      >
        {/* 1. O PORTO E O CÍRCULO VERDE */}
        {pLat !== undefined && pLng !== undefined && (
          <>
            <Circle
              center={{ latitude: pLat, longitude: pLng }}
              radius={raio * 1000} // Multiplica por 1000 para converter km em metros
              strokeColor="#22c55e"
              fillColor="rgba(34, 197, 94, 0.3)" // Verde transparente
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: pLat, longitude: pLng }}
              tracksViewChanges={false}
            >
              <View style={styles.markerContainer}>
                {/* 🟢 Substituição feita: Âncora! */}
                <Text style={styles.iconeMapa}>⚓</Text>
              </View>
            </Marker>
          </>
        )}

        {/* 2. O BARCO */}
        {bLat !== undefined && bLng !== undefined && (
          <Marker
            coordinate={{ latitude: bLat, longitude: bLng }}
            tracksViewChanges={false}
          >
            <View style={styles.markerContainer}>
              {/* 🟢 Substituição feita: Balsa! */}
              <Text style={styles.iconeMapa}>🛳️</Text>
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#cbd5e1",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconeMapa: {
    fontSize: 35,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});
