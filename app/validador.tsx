import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { auth, db } from "../services/firebase";

export default function Validador() {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [flash, setFlash] = useState(false);

  const [meuBarcoId, setMeuBarcoId] = useState<string | null>(null);
  const [nomeTripulante, setNomeTripulante] = useState<string>("Equipe");

  const animacaoLinha = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const carregarDadosOperacionais = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const userSnap = await getDoc(doc(db, "usuarios", user.uid));
          if (userSnap.exists()) {
            const dados = userSnap.data();
            setMeuBarcoId(
              dados.id_barco_vinculado
                ? String(dados.id_barco_vinculado).trim().toUpperCase()
                : null,
            );
            if (dados.nome) setNomeTripulante(dados.nome);
          }
        } catch (error) {
          console.error("Erro ao carregar dados do validador:", error);
        }
      }
    };
    carregarDadosOperacionais();
  }, []);

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(animacaoLinha, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        RNAnimated.timing(animacaoLinha, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const translateY = animacaoLinha.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 245],
  });

  if (!permissao) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!permissao.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={80} color="#38bdf8" />
        <Text style={styles.avisoText}>
          Precisamos de acesso à sua câmera para escanear os bilhetes.
        </Text>
        <TouchableOpacity style={styles.btnPermissao} onPress={pedirPermissao}>
          <Text style={styles.btnPermissaoText}>LIBERAR CÂMERA</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const processarBilhete = async ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    setLoading(true);
    Vibration.vibrate(200);

    try {
      const bilheteRef = doc(db, "passagens", data);
      const bilheteSnap = await getDoc(bilheteRef);

      if (!bilheteSnap.exists()) {
        setResultado({
          status: "falso",
          titulo: "BILHETE INVÁLIDO",
          mensagem: "Este QR Code não pertence ao nosso sistema.",
        });
        Vibration.vibrate([500, 500, 500]);
        setLoading(false);
        return;
      }

      const bilheteInfo = bilheteSnap.data();

      const nomeNoBilhete = String(bilheteInfo.barco || "")
        .trim()
        .toUpperCase();
      const meuIdVinculado = String(meuBarcoId || "")
        .trim()
        .toUpperCase();

      if (nomeNoBilhete !== meuIdVinculado) {
        setResultado({
          status: "falso",
          titulo: "BARCO INCORRETO",
          mensagem: `ESTE BILHETE É PARA:\n[${nomeNoBilhete}]\n\nVOCÊ ESTÁ NO:\n[${meuIdVinculado}]\n\nO passageiro errou de embarcação!`,
        });
        Vibration.vibrate([500, 500, 500]);
        setLoading(false);
        return;
      }

      if (bilheteInfo.validado) {
        const agora = new Date();
        const horarioFormatado = agora.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        setResultado({
          status: "usado",
          titulo: "BILHETE JÁ UTILIZADO!",
          mensagem: `Passageiro: ${bilheteInfo.passageiro}\n\nEste bilhete já passou pela conferência. Validado às ${horarioFormatado} por ${nomeTripulante}.\n\nBoa viagem!`,
        });
        Vibration.vibrate([500, 500, 500]);
      } else {
        const agora = new Date();
        const horarioFormatado = agora.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        await updateDoc(bilheteRef, {
          validado: true,
          dataValidacao: agora.toISOString(),
          validadoPor: auth.currentUser?.uid,
          validadoPorNome: nomeTripulante,
        });

        setResultado({
          status: "sucesso",
          titulo: "EMBARQUE LIBERADO",
          mensagem: `Passageiro: ${bilheteInfo.passageiro}\n\nValidado com sucesso às ${horarioFormatado} por ${nomeTripulante}.\n\nBoa viagem!`,
        });

        Vibration.vibrate([100, 100, 100]);
      }
    } catch (error) {
      setResultado({
        status: "falso",
        titulo: "ERRO DE REDE",
        mensagem: "Falha ao conectar com o banco de dados. Tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  };

  const lerProximo = () => {
    setResultado(null);
    setScanned(false);
  };

  return (
    <View style={styles.container}>
      {!scanned ? (
        <View style={styles.cameraContainer}>
          <Text style={styles.instrucaoTopo}>APONTE PARA O TICKET</Text>

          <View style={styles.visorOuter}>
            <View style={styles.visorBox}>
              <CameraView
                style={styles.camera}
                facing="back"
                enableTorch={flash}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={processarBilhete}
              />
              <RNAnimated.View
                style={[styles.miraAnimada, { transform: [{ translateY }] }]}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.btnFlash}
            onPress={() => setFlash(!flash)}
          >
            <Ionicons
              name={flash ? "flashlight" : "flashlight-outline"}
              size={26}
              color={flash ? "#facc15" : "#fff"}
            />
            <Text style={styles.flashText}>
              {flash ? "LUZ ACESA" : "ACENDER LUZ"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.resultadoContainer}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>
                Conferindo lista de embarque...
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.cardResultado,
                resultado.status === "sucesso"
                  ? styles.bgSucesso
                  : styles.bgErro,
              ]}
            >
              <View style={styles.iconCircle}>
                <Ionicons
                  name={resultado.status === "sucesso" ? "checkmark" : "close"}
                  size={60}
                  color={resultado.status === "sucesso" ? "#10b981" : "#ef4444"}
                />
              </View>

              <Text style={styles.resultadoTitulo}>{resultado.titulo}</Text>

              <View style={styles.msgBox}>
                <Text style={styles.resultadoMensagem}>
                  {resultado.mensagem}
                </Text>
              </View>

              <TouchableOpacity style={styles.btnProximo} onPress={lerProximo}>
                <Ionicons name="scan-outline" size={24} color="#fff" />
                <Text style={styles.btnProximoText}>PRÓXIMO PASSAGEIRO</Text>
              </TouchableOpacity>
            </View>
          )}
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
    padding: 20,
  },
  avisoText: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    padding: 20,
    marginTop: 10,
  },
  btnPermissao: {
    backgroundColor: "#38bdf8",
    padding: 18,
    borderRadius: 12,
    marginTop: 20,
  },
  btnPermissaoText: { color: "#020617", fontWeight: "bold", fontSize: 16 },
  cameraContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  instrucaoTopo: {
    color: "#38bdf8",
    fontSize: 16,
    fontWeight: "900",
    position: "absolute",
    top: 80,
    zIndex: 10,
    letterSpacing: 2,
  },
  visorOuter: {
    padding: 10,
    borderWidth: 2,
    borderColor: "rgba(56, 189, 248, 0.3)",
    borderRadius: 35,
    backgroundColor: "rgba(2, 6, 23, 0.5)",
  },
  visorBox: {
    width: 250,
    height: 250,
    overflow: "hidden",
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#38bdf8",
    position: "relative",
  },
  camera: { flex: 1 },
  miraAnimada: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 4,
    backgroundColor: "#38bdf8",
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  btnFlash: { position: "absolute", bottom: 60, alignItems: "center" },
  flashText: { color: "#fff", fontSize: 12, fontWeight: "bold", marginTop: 8 },
  resultadoContainer: { flex: 1, justifyContent: "center", padding: 25 },
  loadingBox: { alignItems: "center" },
  loadingText: {
    color: "#38bdf8",
    fontSize: 18,
    marginTop: 15,
    fontWeight: "bold",
  },
  cardResultado: {
    padding: 30,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  bgSucesso: { backgroundColor: "#0f172a", borderColor: "#10b981" },
  bgErro: { backgroundColor: "#0f172a", borderColor: "#ef4444" },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  resultadoTitulo: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
  },
  msgBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 20,
    borderRadius: 15,
    marginTop: 20,
    width: "100%",
  },
  resultadoMensagem: {
    color: "#cbd5e1",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 24,
  },
  btnProximo: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 18,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 40,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  btnProximoText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 1,
  },
});
