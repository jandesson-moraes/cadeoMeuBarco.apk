import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";


export default function TabBarCustom({ state, descriptors, navigation }: any) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const totalAbas = Math.max(state.routes.length, 1);
  const tabWidth = width / totalAbas;
  const telaCompacta = width < 360 || height < 680;
  const paddingInferior = Math.max(insets.bottom, 8);
  const alturaBarra = (telaCompacta ? 58 : 64) + paddingInferior;
  const translateX = useSharedValue(0);

  useEffect(() => {
    // 🚀 O efeito GSAP: a mola faz o indicador deslizar
    translateX.value = withSpring(state.index * tabWidth, {
      damping: 15,
      stiffness: 120,
    });
  }, [state.index, tabWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.container, { height: alturaBarra, paddingBottom: paddingInferior }]}>
      {/* 🟢 O INDICADOR MAGNÉTICO (A linha que corre) */}
      <Animated.View style={[styles.indicator, { width: tabWidth }, indicatorStyle]} />

      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const getIcon = (name: string) => {
          if (name === "explore") return isFocused ? "map" : "map-outline";
          if (name === "vendas") return isFocused ? "cart" : "cart-outline";
          return isFocused ? "person" : "person-outline";
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
          >
            <Ionicons
              name={getIcon(route.name) as any}
              size={telaCompacta ? 21 : 23}
              color={isFocused ? "#38bdf8" : "#64748b"}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: isFocused ? "#fff" : "#64748b" },
              ]}
            >
              {String(options.title || route.name).toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#020617",
    borderTopWidth: 1,
    borderTopColor: "rgba(56, 189, 248, 0.12)",
    position: "relative",
    paddingTop: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
  },
  indicator: {
    position: "absolute",
    top: 0,
    height: 3,
    backgroundColor: "#38bdf8",
    // ✨ Brilho Neon
    shadowColor: "#38bdf8",
    shadowRadius: 10,
    shadowOpacity: 1,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
});
