import MaskedView from "@react-native-masked-view/masked-view"; // 🟢 Nova biblioteca para mascarar a luz nas letras
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

export default function Footer({ nightVision }: { nightVision: boolean }) {
  // 🟢 Cores premium restauradas: Sem mais tons vermelhos de alerta!
  const textColor = nightVision ? "#94a3b8" : "#64748b"; // Cinza azulado (Slate)
  const brandBaseColor = nightVision ? "#FFD200" : "#FFD200"; // Ciano neon (noite) e Âmbar (dia)
  const copyrightColor = nightVision ? "#475569" : "#94a3b8"; // Slate mais discreto

  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: -1,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
      ]),
    ).start();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={styles.footerContainer}>
      <View style={styles.footerRow}>
        <View style={styles.brandWrapper}>
          {/* 🟢 O MaskedView corta tudo o que estiver dentro dele usando o formato do "maskElement" */}
          <MaskedView
            maskElement={<Text style={styles.footerBrand}>CADÊ MEU BARCO</Text>}
          >
            {/* O Fundo das letras na cor correta */}
            <Text style={[styles.footerBrand, { color: brandBaseColor }]}>
              CADÊ MEU BARCO
            </Text>

            {/* O Reflexo animado que agora só aparece POR CIMA do texto */}
            <Animated.View
              style={[styles.shimmerWrapper, { transform: [{ translateX }] }]}
            >
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.7)",
                  "rgba(255,255,255,0)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.shimmerGradient}
              />
            </Animated.View>
          </MaskedView>
        </View>
      </View>
      <Text style={[styles.footerCopyright, { color: copyrightColor }]}>
        © Todos os direitos reservados 2026
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footerContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
    paddingTop: 12,
  },
  footerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  footerText: { fontSize: 10, fontWeight: "bold", letterSpacing: 1.5 },
  brandWrapper: {
    position: "relative",
    paddingHorizontal: 2,
    // overflow: "hidden" foi removido pois o MaskedView já faz o corte perfeito
  },
  footerBrand: { fontWeight: "900", fontSize: 11 },
  footerCopyright: { fontSize: 9, fontWeight: "500", letterSpacing: 0.5 },
  shimmerWrapper: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  shimmerGradient: { width: "100%", height: "100%", opacity: 0.9 },
});
