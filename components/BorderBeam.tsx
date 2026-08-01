import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
    Easing,
    runOnJS,
    useAnimatedProps,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// --- COMPONENTE DE UMA FAÍSCA COM OPACIDADE VARIÁVEL ---
function MeteorSpark({
  x,
  y,
  baseOpacity,
}: {
  x: number;
  y: number;
  baseOpacity: number;
}) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  useEffect(() => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 20;

    tx.value = withTiming(Math.cos(angle) * dist, { duration: 800 });
    ty.value = withTiming(Math.sin(angle) * dist, { duration: 800 });

    // A escala e opacidade agora respeitam o baseOpacity (fica mais transparente no final)
    scale.value = withSequence(
      withTiming(1.2, { duration: 100 }),
      withTiming(0, { duration: 700 }),
    );
    opacity.value = withSequence(
      withTiming(baseOpacity, { duration: 100 }),
      withTiming(0, { duration: 700 }),
    );
  }, [baseOpacity]);

  const style = useAnimatedStyle(() => ({
    top: y,
    left: x,
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateX: tx.value },
      { translateY: ty.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: "#fff",
        },
        style,
      ]}
    />
  );
}

export function BorderBeam({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const [visible, setVisible] = useState(true);
  const r = 28;
  const offset = 5;
  const strokeWidth = 2;

  const w_str = width - 2 * r;
  const h_str = height - 2 * r;
  const arc = (Math.PI * r) / 2;
  const perimeter = 2 * w_str + 2 * h_str + 4 * arc;

  const progress = useSharedValue(0);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(
      perimeter,
      {
        duration: 3000,
        easing: Easing.bezier(0.2, 0, 0.2, 1),
      },
      (fin) => {
        if (fin) {
          containerOpacity.value = withTiming(0, { duration: 500 }, () =>
            runOnJS(setVisible)(false),
          );
        }
      },
    );
  }, []);

  const headPos = useDerivedValue(() => {
    let d = progress.value;
    if (d < w_str) return { x: r + d, y: 0 };
    d -= w_str;
    if (d < arc) {
      const a = d / r - Math.PI / 2;
      return { x: width - r + Math.cos(a) * r, y: r + Math.sin(a) * r };
    }
    d -= arc;
    if (d < h_str) return { x: width, y: r + d };
    d -= h_str;
    if (d < arc) {
      const a = d / r;
      return {
        x: width - r + Math.cos(a) * r,
        y: height - r + Math.sin(a) * r,
      };
    }
    d -= arc;
    if (d < w_str) return { x: width - r - d, y: height };
    d -= w_str;
    if (d < arc) {
      const a = d / r + Math.PI / 2;
      return { x: r + Math.cos(a) * r, y: height - r + Math.sin(a) * r };
    }
    d -= arc;
    if (d < h_str) return { x: 0, y: height - r - d };
    d -= h_str;
    const a = d / r + Math.PI;
    return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r };
  });

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter - progress.value,
    opacity: containerOpacity.value,
  }));

  const headStyle = useAnimatedStyle(() => {
    // A cabeça do meteoro também vai sumindo no finalzinho
    const headAlpha =
      progress.value > perimeter * 0.9
        ? 1 - (progress.value - perimeter * 0.9) / (perimeter * 0.1)
        : 1;

    return {
      top: headPos.value.y + offset - 4,
      left: headPos.value.x + offset - 4,
      opacity: headAlpha * containerOpacity.value,
    };
  });

  if (!visible) return null;

  return (
    <View
      style={{ position: "absolute", top: -offset, left: -offset, zIndex: 999 }}
    >
      <Svg width={width + offset * 2} height={height + offset * 2}>
        <AnimatedRect
          x={offset}
          y={offset}
          width={width}
          height={height}
          rx={r}
          stroke="#38bdf8"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={perimeter}
          animatedProps={animatedProps}
          strokeLinecap="round"
        />
      </Svg>

      <Animated.View
        style={[
          {
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#fff",
            shadowColor: "#38bdf8",
            shadowRadius: 10,
            shadowOpacity: 1,
            elevation: 15,
          },
          headStyle,
        ]}
      />

      {/* RASTRO COM FADE-OUT NO FINAL */}
      {[...Array(25)].map((_, i) => (
        <DelayedSpark
          key={i}
          progress={progress}
          perimeter={perimeter}
          index={i}
          total={25}
          headPos={headPos}
          offset={offset}
        />
      ))}
    </View>
  );
}

function DelayedSpark({
  progress,
  perimeter,
  index,
  total,
  headPos,
  offset,
}: any) {
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const trigger = (perimeter / total) * index;

  // Calcula a opacidade base: quanto maior o index (mais perto do fim), menor a opacidade
  // As últimas 5 faíscas serão progressivamente mais transparentes
  const baseOpacity =
    index > total * 0.8 ? 1 - (index - total * 0.8) / (total * 0.2) : 1;

  useDerivedValue(() => {
    if (progress.value >= trigger && !active) {
      runOnJS(setPos)({
        x: headPos.value.x + offset,
        y: headPos.value.y + offset,
      });
      runOnJS(setActive)(true);
    }
  });

  if (!active) return null;
  return <MeteorSpark x={pos.x} y={pos.y} baseOpacity={baseOpacity} />;
}
