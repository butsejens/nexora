import React from "react";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  G,
  Filter,
  FeGaussianBlur,
} from "react-native-svg";

export function NexoraAppIcon({ size = 1024 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#050505" />
          <Stop offset="100%" stopColor="#0A0A12" />
        </LinearGradient>

        <LinearGradient id="red" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FF3B3B" />
          <Stop offset="100%" stopColor="#B20710" />
        </LinearGradient>

        <Filter id="glow">
          <FeGaussianBlur stdDeviation="14" />
        </Filter>
      </Defs>

      <Rect width="1024" height="1024" rx="220" fill="url(#bg)" />

      <G opacity="0.25" filter="url(#glow)">
        <Path
          d="M260 760V260H380L650 620V260H764V760H644L374 400V760H260Z"
          fill="#E50914"
        />
      </G>

      <Path
        d="M260 760V260H380L650 620V260H764V760H644L374 400V760H260Z"
        fill="url(#red)"
      />
    </Svg>
  );
}