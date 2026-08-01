import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
    Extrapolate,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

const Ring = ({ delay }: { delay: number }) => {
  const ring = useSharedValue(0);

  const ringStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(ring.value, [0, 1], [0.7, 0], Extrapolate.CLAMP),
      transform: [
        {
          scale: interpolate(ring.value, [0, 1], [1, 4], Extrapolate.CLAMP),
        },
      ],
    };
  });

  useEffect(() => {
    ring.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2500 }), -1, false),
    );
  }, []);

  return <Animated.View style={[styles.ring, ringStyle]} />;
};

export default function SonarPulse() {
  return (
    <View style={styles.container}>
      <Ring delay={0} />
      <Ring delay={800} />
      <Ring delay={1600} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
  },
  ring: {
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: "#38bdf8",
    position: "absolute",
    borderWidth: 1,
    borderColor: "#7dd3fc",
  },
});
