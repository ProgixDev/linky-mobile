import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export interface LinkyMarkProps {
  /** Square edge length in px. The mark is vector, so it stays crisp at any size. */
  size?: number;
  /** Rounded tile (logo/app-icon look) vs square edge. Default rounded. */
  rounded?: boolean;
  testID?: string;
}

/**
 * LinkyMark — the in-app Linky Driver brand mark, rendered from the same SVG
 * master that produces the app icon (assets/brand/linky-driver-mark.svg): a white
 * isometric parcel box with a saffron centre "tape" and a saffron "24h/7" badge,
 * on an emerald gradient tile. Vector (react-native-svg) so it is crisp at every
 * size; reused on the welcome, auth header, and profile screens.
 */
export function LinkyMark({ size = 72, rounded = true, testID = 'linky-mark' }: LinkyMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Linky Driver"
    >
      <Defs>
        <LinearGradient
          id="linkyTile"
          x1="0"
          y1="0"
          x2="512"
          y2="512"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#15A06F" />
          <Stop offset="1" stopColor="#0A5240" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="512" height="512" rx={rounded ? 120 : 0} fill="url(#linkyTile)" />
      {/* parcel box */}
      <Path
        d="M132 196 L248 134 L364 196 L364 312 L248 374 L132 312 Z"
        stroke="#FFFFFF"
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M132 196 L248 258 L364 196"
        stroke="#FFFFFF"
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* saffron tape */}
      <Path
        d="M248 134 L248 258 L248 374"
        stroke="#E8A53D"
        strokeWidth={20}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* 24h/7 badge */}
      <Circle cx={386} cy={372} r={84} fill="#E8A53D" />
      <Circle cx={386} cy={372} r={84} fill="none" stroke="#0A5240" strokeWidth={10} />
      <SvgText x={386} y={366} fontSize={44} fontWeight="800" fill="#0A5240" textAnchor="middle">
        24h/
      </SvgText>
      <SvgText x={386} y={412} fontSize={44} fontWeight="800" fill="#0A5240" textAnchor="middle">
        7
      </SvgText>
    </Svg>
  );
}
