import { Ionicons } from "@expo/vector-icons";
import { Tabs, useSegments } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CampanhasMobile from "../../components/CampanhasMobile";
import { auth, db } from "../../services/firebase";


export default function TabLayout() {
  const [user, setUser] = useState<any>(null);
  const [carregandoIdentidade, setCarregandoIdentidade] = useState(true);
  const [isComandante, setIsComandante] = useState(false);

  const [vendasLiberadas, setVendasLiberadas] = useState(false);

  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { width: larguraTela, height: alturaTela } = useWindowDimensions();

  // ⚓️ Lógica das abas visíveis (Ajustes removido para simplificar)
  const visibleTabs = useMemo(() => {
    const abas = ["explore"];
    if (vendasLiberadas) abas.push("vendas");
    abas.push("perfil");
    return abas;
  }, [vendasLiberadas]);

  const tabWidth = larguraTela / visibleTabs.length;
  const telaCompacta = larguraTela < 360 || alturaTela < 680;
  const translateX = useSharedValue(0);

  // 🟢 Escuta o Firebase para ativar/desativar as vendas
  useEffect(() => {
    const unsubVendas = onSnapshot(
      doc(db, "configuracoes", "modulo_vendas"),
      (snapshot) => {
        if (snapshot.exists()) {
          setVendasLiberadas(!!snapshot.data().ativo);
        }
      },
    );
    return () => unsubVendas();
  }, []);

  // ⚓️ Lógica da Animação do Indicador
  useEffect(() => {
    let currentTab = segments[segments.length - 1];
    if (!currentTab || currentTab === "(tabs)") currentTab = "explore";

    const index = visibleTabs.indexOf(currentTab);
    if (index !== -1) {
      translateX.value = withSpring(index * tabWidth, {
        damping: 15,
        stiffness: 120,
        mass: 0.8,
      });
    }
  }, [segments, tabWidth, translateX, visibleTabs]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: tabWidth,
  }));

  // ⚓️ Lógica de Identidade (COM BLINDAGEM CONTRA MAIÚSCULAS)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (usuarioAutenticado) => {
      setUser(usuarioAutenticado);
      const verificarPerfil = async () => {
        if (usuarioAutenticado) {
          try {
            // 🟢 1. Limpamos o e-mail que o usuário digitou no login
            const emailLogadoLimpo = String(usuarioAutenticado.email)
              .toLowerCase()
              .trim();
            // 🟢 2. Definimos o seu e-mail mestre em minúsculo
            const emailMestre = "jandessonmoraes@gmail.com";

            const userDoc = await getDoc(
              doc(db, "usuarios", usuarioAutenticado.uid),
            );

            // 🟢 3. Se tiver o documento no Firebase, limpamos a palavra "dono" também
            let tipoUsuario = "";
            if (userDoc.exists() && userDoc.data().tipo) {
              tipoUsuario = String(userDoc.data().tipo).toLowerCase().trim();
            }

            // 🟢 4. A checagem agora é 100% à prova de falhas
            if (tipoUsuario === "dono" || emailLogadoLimpo === emailMestre) {
              setIsComandante(true);
            } else {
              setIsComandante(false);
            }
          } catch (error) {
            setIsComandante(false);
          }
        }
        setCarregandoIdentidade(false);
      };
      verificarPerfil();
    });
    return unsubAuth;
  }, []);

  if (carregandoIdentidade)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );

  const paddingInferior = Math.max(insets.bottom, 8);
  const alturaBarra = (telaCompacta ? 58 : 64) + paddingInferior;
  const tamanhoIcone = telaCompacta ? 21 : 23;

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#38bdf8",
          tabBarInactiveTintColor: "#64748b",
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            backgroundColor: "#020617",
            height: alturaBarra,
            paddingTop: telaCompacta ? 6 : 8,
            paddingBottom: paddingInferior,
            borderTopWidth: 1,
            borderTopColor: "rgba(56, 189, 248, 0.12)",
            elevation: 12,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
          },
          tabBarItemStyle: {
            minHeight: telaCompacta ? 48 : 54,
            paddingVertical: 2,
          },
          tabBarLabelStyle: {
            fontSize: telaCompacta ? 9 : 10,
            fontWeight: "900",
            letterSpacing: telaCompacta ? 0.7 : 1,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ href: null }} />

        <Tabs.Screen
          name="explore"
          options={{
            title: "NAVEGAR",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                size={tamanhoIcone}
                name={focused ? "navigate" : "navigate-outline"}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="vendas"
          options={{
            title: "PASSAGENS",
            href: vendasLiberadas ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                size={tamanhoIcone}
                name={focused ? "ticket" : "ticket-outline"}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="perfil"
          options={{
            title: "CONTA",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                size={tamanhoIcone}
                name={focused ? "person-circle" : "person-circle-outline"}
                color={color}
              />
            ),
          }}
        />

        {/* 🟢 Aba de Ajustes agora fica oculta da barra principal */}
        <Tabs.Screen name="config-barco" options={{ href: null }} />
      </Tabs>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicatorContainer,
          { bottom: alturaBarra - 3 },
          animatedIndicatorStyle,
        ]}
      >
        <View style={styles.activeLine} />
      </Animated.View>
      <CampanhasMobile />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#020617",
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorContainer: {
    position: "absolute",
    height: 4,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  activeLine: {
    width: "60%",
    height: 3,
    backgroundColor: "#38bdf8",
    borderRadius: 10,
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 10,
  },
});
