import { Ionicons } from "@expo/vector-icons";
import {
  AdvancedMarker,
  APIProvider,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../services/firebase";
import { obterVelocidadeOficialKmh } from "../services/navegacaoInteligente";

const calcularDistanciaKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371;
  const a =
    Math.sin(((lat2 - lat1) * Math.PI) / 180 / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(((lon2 - lon1) * Math.PI) / 180 / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const formatarTempo = (minutosTotais: number) => {
  if (minutosTotais < 60) return `${Math.round(minutosTotais)} min`;
  const horas = Math.floor(minutosTotais / 60);
  const minutos = Math.round(minutosTotais % 60);
  return minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
};

const MapHandler = ({
  boundsToFit,
  selectionId,
  forceZoom,
}: {
  boundsToFit?: any;
  selectionId: string | null;
  forceZoom: number;
}) => {
  const map = useMap();
  const lastFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !boundsToFit || !(window as any).google) return;
    if (lastFocusRef.current !== selectionId) {
      map.fitBounds(boundsToFit, 120);
      lastFocusRef.current = selectionId;
    }
  }, [map, boundsToFit, selectionId]);

  useEffect(() => {
    if (!map || !boundsToFit || !(window as any).google) return;
    if (forceZoom > 0) map.fitBounds(boundsToFit, 120);
  }, [forceZoom, map, boundsToFit]);

  return null;
};

const RotaPolyline = ({ rota }: { rota: any[] }) => {
  const map = useMap();
  const polylineRef = useRef<any>(null);
  useEffect(() => {
    if (!map || !(window as any).google) return;
    if (!polylineRef.current) {
      polylineRef.current = new (window as any).google.maps.Polyline({
        strokeColor: "#06b6d4",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        geodesic: true,
        map: map,
      });
    }
    const path = rota
      .map((p: any) => ({
        lat: Number(p.latitude ?? p.lat),
        lng: Number(p.longitude ?? p.lng),
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
    polylineRef.current.setPath(path);
    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, rota]);
  return null;
};

const PulseEffect = ({ color }: { color: string }) => {
  const anims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const timeouts = anims.map((anim, index) => {
      return setTimeout(() => {
        Animated.loop(
          Animated.timing(anim, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: false,
          }),
        ).start();
      }, index * 600);
    });
    return () => {
      timeouts.forEach(clearTimeout);
      anims.forEach((a) => a.stopAnimation());
    };
  }, [anims]);
  return (
    <View
      style={{
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {anims.map((anim, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            width: 30,
            height: 30,
            borderRadius: 15,
            borderWidth: 2.5,
            borderColor: color,
            opacity: anim.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0, 0.6, 0],
            }),
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 4],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
};

export default function MapaViewWeb({
  barco,
  porto,
  frota,
  terminais,
  isDarkMode,
  toggleTheme,
  toggleExpand,
  mapaExpandido,
  abrirAjuda,
}: any) {
  const [barcoRealtime, setBarcoRealtime] = useState<any>(null);
  const [infoViagem, setInfoViagem] = useState<{
    km: string;
    tempo: string;
  } | null>(null);
  const [bounds, setBounds] = useState<any>(null);
  const [painelVisivel, setPainelVisivel] = useState(true);
  const [forceZoom, setForceZoom] = useState(0);

  useEffect(() => {
    if (!barco?.id) return;
    const unsub = onSnapshot(doc(db, "embarcacoes", barco.id), (d) => {
      if (d.exists()) setBarcoRealtime(d.data());
    });
    return () => unsub();
  }, [barco?.id]);

  useEffect(() => {
    const bLat = Number(barcoRealtime?.ultima_posicao?.latitude);
    const bLng = Number(barcoRealtime?.ultima_posicao?.longitude);
    const pLat = Number(
      porto?.coordenadas?.lat ?? porto?.coordenadas?.latitude,
    );
    const pLng = Number(
      porto?.coordenadas?.lng ?? porto?.coordenadas?.longitude,
    );

    if (
      !isNaN(bLat) &&
      !isNaN(bLng) &&
      !isNaN(pLat) &&
      !isNaN(pLng) &&
      (window as any).google
    ) {
      const distKm = calcularDistanciaKm(bLat, bLng, pLat, pLng);
      const velocidadeOficialKmh = obterVelocidadeOficialKmh(
        barcoRealtime || barco,
      );

      setInfoViagem({
        km: distKm.toFixed(1),
        tempo:
          velocidadeOficialKmh && velocidadeOficialKmh > 0
            ? formatarTempo((distKm / velocidadeOficialKmh) * 60)
            : "calculando",
      });

      const newBounds = new (window as any).google.maps.LatLngBounds();
      newBounds.extend({ lat: bLat, lng: bLng });
      newBounds.extend({ lat: pLat, lng: pLng });
      setBounds(newBounds);
    }
  }, [barcoRealtime?.ultima_posicao, porto]);

  return (
    <View style={styles.mapaContainer}>
      {painelVisivel && infoViagem && (
        <View style={styles.painelViagem}>
          <View style={styles.headerPainel}>
            <Text style={styles.painelTitulo}>🛳️ Monitoramento de Viagem</Text>
          </View>
          <Text style={styles.painelTexto}>
            Distância:{" "}
            <Text style={styles.painelDestaque}>{infoViagem.km} km</Text>
          </Text>
          <Text style={styles.painelTexto}>
            Tempo Estimado:{" "}
            <Text style={styles.painelDestaque}>{infoViagem.tempo}</Text>
          </Text>
        </View>
      )}

      <APIProvider apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
        <Map
          defaultCenter={{ lat: -3.119, lng: -60.021 }}
          defaultZoom={13}
          mapId="DEMO_MAP_ID"
          disableDefaultUI={true}
          gestureHandling={"greedy"}
          colorScheme={isDarkMode ? "DARK" : "LIGHT"}
        >
          <MapHandler
            boundsToFit={bounds}
            selectionId={`${barco?.id}-${porto?.id}`}
            forceZoom={forceZoom}
          />
          {barcoRealtime?.rota && <RotaPolyline rota={barcoRealtime.rota} />}

          {terminais?.map((t: any) => {
            const lat = Number(t.coordenadas?.lat ?? t.coordenadas?.latitude);
            const lng = Number(t.coordenadas?.lng ?? t.coordenadas?.longitude);
            if (isNaN(lat) || isNaN(lng) || lat === 0) return null;
            const isSel = porto?.id === t.id;
            return (
              <AdvancedMarker key={t.id} position={{ lat, lng }}>
                <View style={styles.markerBox}>
                  <Text
                    style={[
                      styles.badgeNome,
                      isSel && styles.badgeAtivaPorto,
                      isSel && { marginBottom: 20 },
                    ]}
                  >
                    {t.nome}
                  </Text>
                  <View style={styles.iconWrapper}>
                    {isSel && <PulseEffect color="#fbbf24" />}
                    <Text style={[styles.icone, isSel && { fontSize: 32 }]}>
                      ⚓
                    </Text>
                  </View>
                </View>
              </AdvancedMarker>
            );
          })}

          {frota?.map((b: any) => {
            const lat = Number(b.ultima_posicao?.latitude);
            const lng = Number(b.ultima_posicao?.longitude);
            if (isNaN(lat) || isNaN(lng) || lat === 0) return null;
            const isAtivo = barco?.id === b.id;
            return (
              <AdvancedMarker key={b.id} position={{ lat, lng }}>
                <View style={styles.markerBox}>
                  <Text
                    style={[
                      styles.badgeNome,
                      isAtivo && styles.badgeAtivaBarco,
                      isAtivo && { marginBottom: 20 },
                    ]}
                  >
                    {b.nome}
                  </Text>
                  <View style={styles.iconWrapper}>
                    {isAtivo && <PulseEffect color="#06b6d4" />}
                    <Text style={[styles.icone, isAtivo && { fontSize: 30 }]}>
                      🛳️
                    </Text>
                  </View>
                </View>
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>

      {/* 🛠️ COLUNA DE FERRAMENTAS VERTICAL */}
      <View style={styles.ferramentasContainer}>
        {/* 🟢 1. Botão de Ajuda (?) */}
        <TouchableOpacity style={styles.botaoFerramenta} onPress={abrirAjuda}>
          <Ionicons name="help-circle-outline" size={24} color="#38bdf8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.botaoFerramenta,
            painelVisivel && infoViagem && { borderColor: "#fbbf24" },
          ]}
          onPress={() => setPainelVisivel(!painelVisivel)}
        >
          <Ionicons
            name="boat"
            size={20}
            color={painelVisivel && infoViagem ? "#fbbf24" : "#38bdf8"}
          />
          {!painelVisivel && infoViagem && (
            <View style={styles.pontoNotificacao} />
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.botaoFerramenta} onPress={toggleExpand}>
          <Ionicons
            name={mapaExpandido ? "contract" : "expand"}
            size={20}
            color="#38bdf8"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botaoFerramenta}
          onPress={() => setForceZoom((prev) => prev + 1)}
        >
          <Ionicons name="locate-outline" size={20} color="#38bdf8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.botaoFerramenta} onPress={toggleTheme}>
          <Ionicons
            name={isDarkMode ? "moon" : "sunny"}
            size={20}
            color="#38bdf8"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapaContainer: { flex: 1 },
  painelViagem: {
    position: "absolute",
    top: 30,
    left: 30,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    padding: 22,
    borderRadius: 14,
    zIndex: 100,
    minWidth: 280,
    borderLeftWidth: 6,
    borderLeftColor: "#38bdf8",
  },
  headerPainel: { alignItems: "center", marginBottom: 12 },
  painelTitulo: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  painelTexto: { color: "#94a3b8", fontSize: 13, marginBottom: 5 },
  painelDestaque: { color: "#38bdf8", fontWeight: "bold" },

  ferramentasContainer: {
    position: "absolute",
    right: 20,
    bottom: 40,
    alignItems: "center",
    zIndex: 110,
  },
  botaoFerramenta: {
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.6)",
    marginBottom: 12,
    boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
    zIndex: 120,
    cursor: "pointer",
  },
  pontoNotificacao: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#06b6d4",
    borderWidth: 2,
    borderColor: "#0f172a",
  },

  markerBox: { alignItems: "center", justifyContent: "flex-end" },
  iconWrapper: { alignItems: "center", justifyContent: "center" },
  icone: { fontSize: 24 },
  badgeNome: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    color: "#94a3b8",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeAtivaBarco: {
    color: "#fff",
    backgroundColor: "#06b6d4",
    fontWeight: "bold",
  },
  badgeAtivaPorto: {
    color: "#0f172a",
    backgroundColor: "#fbbf24",
    fontWeight: "bold",
  },
});
