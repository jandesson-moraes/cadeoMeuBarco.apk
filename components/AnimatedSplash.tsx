// import LottieView from "lottie-react-native";
// import React, { useEffect, useRef, useState } from "react";
// import { Animated, Dimensions, StyleSheet } from "react-native";

// const { width, height } = Dimensions.get("window");

// export default function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
//   const fadeAnim = useRef(new Animated.Value(1)).current;
//   const [animationLoaded, setAnimationLoaded] = useState(false);

//   // 🟢 Manobra de Velocidade: Forçamos o fechamento após 2 segundos
//   // mesmo que a animação original seja mais comprida.
//   useEffect(() => {
//     const timer = setTimeout(() => {
//       encerrarSplash();
//     }, 2200); // ⏱️ Tempo total de exibição (2.2 segundos)

//     return () => clearTimeout(timer);
//   }, []);

//   const encerrarSplash = () => {
//     // 🟢 Faz o efeito de sumir suavemente
//     Animated.timing(fadeAnim, {
//       toValue: 0,
//       duration: 800,
//       useNativeDriver: true,
//     }).start(() => onFinish());
//   };

//   return (
//     <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
//       <LottieView
//         autoPlay
//         loop={false} // Roda uma vez e para (ou você pode deixar true enquanto carrega o banco)
//         onAnimationFinish={encerrarSplash} // Quando o barco terminar a rota, libera o app
//         style={styles.animation}
//         source={require("../assets/animations/sailing.json")} // ⬅️ Caminho do seu arquivo
//         onLayout={() => setAnimationLoaded(true)}
//       />
//     </Animated.View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     ...StyleSheet.absoluteFillObject,
//     backgroundColor: "#020617", // Mesma cor de fundo do seu login
//     alignItems: "center",
//     justifyContent: "center",
//     zIndex: 9999, // Fica por cima de tudo
//   },
//   animation: {
//     width: width * 0.8,
//     height: width * 0.8,
//   },
// });
