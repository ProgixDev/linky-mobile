import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Layered launch-screen background: a deep-green vertical gradient + a faint
 * abstract city-map motif (streets, a dotted delivery route, pins) + a large soft
 * brand chevron watermark. Pure SVG (no PNG assets — 3G-friendly), tinted light
 * mint at low opacity so it reads on the green field. Decorative only.
 */
export function MapBackdrop() {
  const { width, height } = useWindowDimensions();
  const w = width;
  const h = height;
  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0A4D3C" />
            <Stop offset="0.55" stopColor="#0E6E55" />
            <Stop offset="1" stopColor="#0C5A47" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#bg)" />

        {/* Faint city-map motif: streets + a dotted delivery route + pins. */}
        <G stroke="#5FC9A3" strokeWidth={1.5} opacity={0.12} fill="none">
          <Path d={`M${-20} ${h * 0.22} H${w + 20}`} />
          <Path d={`M${-20} ${h * 0.34} H${w + 20}`} />
          <Path d={`M${w * 0.25} ${-20} V${h + 20}`} />
          <Path d={`M${w * 0.7} ${-20} V${h + 20}`} />
          <Path d={`M${-20} ${h * 0.1} L${w * 0.9} ${h * 0.55}`} />
        </G>
        <G opacity={0.18}>
          <Path
            d={`M${w * 0.12} ${h * 0.46} C ${w * 0.3} ${h * 0.3}, ${w * 0.6} ${h * 0.5}, ${w * 0.85} ${h * 0.18}`}
            stroke="#A7F3D0"
            strokeWidth={2}
            strokeDasharray="2 8"
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={w * 0.12} cy={h * 0.46} r={4} fill="#A7F3D0" />
          <Circle cx={w * 0.85} cy={h * 0.18} r={4} fill="#FFC53D" />
        </G>

        {/* Large soft brand chevron watermark, centered-upper. */}
        <G opacity={0.08}>
          <Path
            d={`M${w * 0.2} ${h * 0.34} L${w * 0.5} ${h * 0.12} L${w * 0.8} ${h * 0.34}`}
            stroke="#FFFFFF"
            strokeWidth={18}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d={`M${w * 0.32} ${h * 0.36} L${w * 0.5} ${h * 0.22} L${w * 0.68} ${h * 0.36}`}
            stroke="#FFFFFF"
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      </Svg>
    </View>
  );
}
