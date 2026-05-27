/**
 * EmployerHomeIllustration — the small lifestyle vignette tucked into the
 * top-right of the employer Home header.
 *
 * The vignette is composed of pure React Native Views (no SVG, no asset)
 * so it scales perfectly and tints with the active theme. It has three
 * fixed pieces — a desk, a laptop, and a potted plant — and ONE variable
 * piece: the table lamp.
 *
 * The lamp silhouette is chosen by the employer's "vibe" — a wider union
 * than just the canonical 8 BusinessType values, so the home screen also
 * reflects blue-collar employer types (construction crews, garage owners,
 * delivery fleets, hospitals, farms, hotels, schools, factories).
 *
 * Office-style vibes (existing 8):
 *   - individual   classic study lamp
 *   - shop         bell-shaped counter lamp
 *   - restaurant   pendant lamp hanging on a cord
 *   - salon        vanity arch with bulbs
 *   - agency       slim arc floor lamp
 *   - startup      angular bent-arm desk lamp
 *   - enterprise   green-shade banker's lamp
 *   - other        falls back to study lamp
 *
 * Blue-collar vibes (new):
 *   - construction tripod work-light
 *   - garage       caged trouble-light on a hook
 *   - factory      wide industrial pendant
 *   - delivery     scooter headlight with beam
 *   - hospital     bendy-arm exam lamp
 *   - farm         vintage kerosene lantern
 *   - hotel        elegant brass-stem fabric-shade lamp
 *   - school       wide brass + green schoolmaster lamp
 *
 * The whole vignette renders inside a fixed 150 × 90 frame; the parent
 * just drops it into the header.
 */

import { View } from 'react-native';

import { champagne, amber, coral, jade, gray, blue } from '@doondo/tokens';
import type { BusinessType } from '@/api/types';

/**
 * The widened vibe union. Includes every BusinessType plus the blue-collar
 * employer categories. The parent passes whichever is most informative —
 * typically `user.businessType`, or a value derived from the dominant job
 * skill keyword.
 */
export type EmployerVibe =
  | BusinessType
  | 'construction'
  | 'garage'
  | 'factory'
  | 'delivery'
  | 'hospital'
  | 'farm'
  | 'hotel'
  | 'school';

interface Props {
  /**
   * Picks the lamp silhouette. Defaults to `individual`. Accepts the
   * canonical BusinessType values plus blue-collar vibes; anything else
   * falls back to the study lamp.
   */
  businessType?: EmployerVibe | null;
  /** True when the parent is on the light scheme. Tints wood/leaves softly. */
  isLight?: boolean;
}

const FRAME_W = 150;
const FRAME_H = 90;

/** Warm bulb glow — same on every lamp, just positioned differently. */
function Glow({
  left,
  top,
  size = 26,
}: {
  left: number;
  top: number;
  size?: number;
}) {
  return (
    <>
      {/* Outer halo */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: left - size / 2,
          top: top - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'rgba(255, 196, 95, 0.22)',
        }}
      />
      {/* Inner core */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: left - size / 4,
          top: top - size / 4,
          width: size / 2,
          height: size / 2,
          borderRadius: size / 4,
          backgroundColor: 'rgba(255, 218, 130, 0.55)',
        }}
      />
    </>
  );
}

export function EmployerHomeIllustration({
  businessType,
  isLight = false,
}: Props) {
  // Wood/desk tones — slightly warmer in light, slightly cooler in dark
  const desk = isLight ? '#C99A6B' : '#7A5A3E';
  const deskShadow = isLight ? '#A87A4D' : '#5A3F28';
  const laptopBase = isLight ? '#9CA3AF' : '#4B5563';
  const laptopScreen = isLight ? '#374151' : '#1F2937';
  const screenGlow = 'rgba(255, 218, 130, 0.35)';
  const potColor = isLight ? '#B8704A' : '#8C4A2E';
  const leaves = jade[isLight ? 600 : 400];
  const leavesAlt = jade[isLight ? 400 : 300];
  const stemColor = isLight ? gray[600] : '#D8D2C5';

  return (
    <View
      pointerEvents="none"
      style={{
        width: FRAME_W,
        height: FRAME_H,
      }}
    >
      {/* ── Desk surface (the line everything sits on) ─────────────── */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 8,
          height: 5,
          backgroundColor: desk,
          borderRadius: 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 6,
          height: 2,
          backgroundColor: deskShadow,
          opacity: 0.7,
        }}
      />

      {/* ── Laptop (centered on desk) ──────────────────────────────── */}
      {/* Open screen */}
      <View
        style={{
          position: 'absolute',
          left: 36,
          bottom: 14,
          width: 38,
          height: 26,
          borderRadius: 3,
          backgroundColor: laptopScreen,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Subtle screen highlight (lamp light reflecting on it) */}
        <View
          style={{
            position: 'absolute',
            left: 4,
            top: 4,
            width: 20,
            height: 14,
            borderRadius: 2,
            backgroundColor: screenGlow,
          }}
        />
      </View>
      {/* Laptop base — trapezoid effect via two rects */}
      <View
        style={{
          position: 'absolute',
          left: 32,
          bottom: 11,
          width: 46,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: laptopBase,
        }}
      />

      {/* ── Potted plant (right of desk) ───────────────────────────── */}
      {/* Pot */}
      <View
        style={{
          position: 'absolute',
          right: 8,
          bottom: 13,
          width: 14,
          height: 12,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          backgroundColor: potColor,
        }}
      />
      {/* Leaves — three blob layers */}
      <View
        style={{
          position: 'absolute',
          right: 6,
          bottom: 22,
          width: 18,
          height: 10,
          borderRadius: 6,
          backgroundColor: leavesAlt,
          opacity: 0.85,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 9,
          bottom: 26,
          width: 12,
          height: 10,
          borderRadius: 6,
          backgroundColor: leaves,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 13,
          bottom: 30,
          width: 6,
          height: 8,
          borderRadius: 3,
          backgroundColor: leavesAlt,
        }}
      />

      {/* ── The variable piece: the lamp ───────────────────────────── */}
      <Lamp businessType={businessType ?? 'individual'} stemColor={stemColor} isLight={isLight} />
    </View>
  );
}

// ─── Lamp variants ────────────────────────────────────────────────────────────

function Lamp({
  businessType,
  stemColor,
  isLight,
}: {
  businessType: EmployerVibe;
  stemColor: string;
  isLight: boolean;
}) {
  switch (businessType) {
    // Office-style vibes
    case 'shop':
      return <ShopLamp stemColor={stemColor} isLight={isLight} />;
    case 'restaurant':
      return <RestaurantLamp stemColor={stemColor} isLight={isLight} />;
    case 'salon':
      return <SalonLamp stemColor={stemColor} isLight={isLight} />;
    case 'agency':
      return <AgencyLamp stemColor={stemColor} isLight={isLight} />;
    case 'startup':
      return <StartupLamp stemColor={stemColor} isLight={isLight} />;
    case 'enterprise':
      return <EnterpriseLamp stemColor={stemColor} isLight={isLight} />;
    // Blue-collar vibes
    case 'construction':
      return <ConstructionLamp stemColor={stemColor} isLight={isLight} />;
    case 'garage':
      return <GarageLamp stemColor={stemColor} isLight={isLight} />;
    case 'factory':
      return <FactoryLamp stemColor={stemColor} isLight={isLight} />;
    case 'delivery':
      return <DeliveryLamp stemColor={stemColor} isLight={isLight} />;
    case 'hospital':
      return <HospitalLamp stemColor={stemColor} isLight={isLight} />;
    case 'farm':
      return <FarmLamp stemColor={stemColor} isLight={isLight} />;
    case 'hotel':
      return <HotelLamp stemColor={stemColor} isLight={isLight} />;
    case 'school':
      return <SchoolLamp stemColor={stemColor} isLight={isLight} />;
    case 'individual':
    case 'other':
    default:
      return <StudyLamp stemColor={stemColor} isLight={isLight} />;
  }
}

/**
 * Helper: build a thin rotated rectangle for diagonal arms.
 * We use this because RN doesn't give us line primitives without SVG.
 */
function Arm({
  left,
  top,
  length,
  thickness = 2,
  rotate,
  color,
}: {
  left: number;
  top: number;
  length: number;
  thickness?: number;
  rotate: number;
  color: string;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width: length,
        height: thickness,
        backgroundColor: color,
        borderRadius: thickness / 2,
        transform: [{ rotate: `${rotate}deg` }],
        transformOrigin: '0% 50%' as never,
      }}
    />
  );
}

// individual / other — classic tilted-shade study lamp on left side
function StudyLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? coral[400] : coral[500];
  return (
    <>
      {/* Base */}
      <View
        style={{
          position: 'absolute',
          left: 10,
          bottom: 12,
          width: 14,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: stemColor,
        }}
      />
      {/* Vertical stem */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          bottom: 14,
          width: 2,
          height: 26,
          backgroundColor: stemColor,
        }}
      />
      {/* Shade — trapezoid via tilted rectangle */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 38,
          width: 22,
          height: 14,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          backgroundColor: shade,
          transform: [{ rotate: '-12deg' }],
        }}
      />
      <Glow left={20} top={FRAME_H - 38} size={32} />
    </>
  );
}

// shop — flat bell-shaped counter lamp
function ShopLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? amber[400] : amber[300];
  return (
    <>
      <View
        style={{
          position: 'absolute',
          left: 8,
          bottom: 12,
          width: 18,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: stemColor,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 16,
          bottom: 14,
          width: 2,
          height: 18,
          backgroundColor: stemColor,
        }}
      />
      {/* Bell shade */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          bottom: 32,
          width: 26,
          height: 18,
          borderTopLeftRadius: 13,
          borderTopRightRadius: 13,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          backgroundColor: shade,
        }}
      />
      <Glow left={17} top={FRAME_H - 30} size={30} />
    </>
  );
}

// restaurant — pendant lamp hanging on a cord from the top
function RestaurantLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? '#B45309' : amber[300];
  return (
    <>
      {/* Cord */}
      <View
        style={{
          position: 'absolute',
          left: 18,
          top: 0,
          width: 1.5,
          height: 28,
          backgroundColor: stemColor,
          opacity: 0.7,
        }}
      />
      {/* Dome shade — inverted U */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          top: 26,
          width: 26,
          height: 18,
          borderTopLeftRadius: 13,
          borderTopRightRadius: 13,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          backgroundColor: shade,
          transform: [{ scaleY: -1 }],
        }}
      />
      <Glow left={19} top={48} size={30} />
    </>
  );
}

// salon — vanity arch with bulbs along the curve
function SalonLamp({ stemColor }: { stemColor: string; isLight: boolean }) {
  return (
    <>
      {/* Mirror back */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 14,
          width: 26,
          height: 30,
          borderTopLeftRadius: 13,
          borderTopRightRadius: 13,
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1.5,
          borderColor: stemColor,
        }}
      />
      {/* Bulbs along the top edge of the arch */}
      {[
        { left: 8, top: FRAME_H - 44 },
        { left: 13, top: FRAME_H - 49 },
        { left: 19, top: FRAME_H - 51 },
        { left: 25, top: FRAME_H - 49 },
        { left: 30, top: FRAME_H - 44 },
      ].map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: '#FFE8A8',
            shadowColor: '#FFC65F',
            shadowOpacity: 0.8,
            shadowRadius: 3,
          }}
        />
      ))}
      <Glow left={19} top={FRAME_H - 30} size={28} />
    </>
  );
}

// agency — slim modern arc floor lamp
function AgencyLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? gray[700] : champagne[300];
  return (
    <>
      {/* Heavy base */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          bottom: 12,
          width: 12,
          height: 4,
          borderRadius: 2,
          backgroundColor: stemColor,
        }}
      />
      {/* Vertical pole */}
      <View
        style={{
          position: 'absolute',
          left: 9,
          bottom: 16,
          width: 2,
          height: 18,
          backgroundColor: stemColor,
        }}
      />
      {/* Arched arm — approximated with two rotated bars */}
      <Arm left={10} top={FRAME_H - 50} length={14} rotate={-30} color={stemColor} />
      <Arm left={22} top={FRAME_H - 56} length={12} rotate={20} color={stemColor} />
      {/* Cone shade pointing down */}
      <View
        style={{
          position: 'absolute',
          left: 26,
          top: FRAME_H - 50,
          width: 14,
          height: 10,
          borderBottomLeftRadius: 7,
          borderBottomRightRadius: 7,
          backgroundColor: shade,
        }}
      />
      <Glow left={33} top={FRAME_H - 36} size={26} />
    </>
  );
}

// startup — angular bent-arm desk lamp (Pixar-ish)
function StartupLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? coral[500] : coral[400];
  return (
    <>
      {/* Base */}
      <View
        style={{
          position: 'absolute',
          left: 8,
          bottom: 12,
          width: 14,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: stemColor,
        }}
      />
      {/* Short vertical stem */}
      <View
        style={{
          position: 'absolute',
          left: 14,
          bottom: 14,
          width: 2,
          height: 10,
          backgroundColor: stemColor,
        }}
      />
      {/* Lower arm — diagonal up-right */}
      <Arm left={15} top={FRAME_H - 24} length={16} rotate={-45} color={stemColor} />
      {/* Upper arm — diagonal down-right */}
      <Arm left={26} top={FRAME_H - 36} length={14} rotate={40} color={stemColor} />
      {/* Trapezoid shade */}
      <View
        style={{
          position: 'absolute',
          left: 28,
          top: FRAME_H - 36,
          width: 16,
          height: 12,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 6,
          backgroundColor: shade,
          transform: [{ rotate: '20deg' }],
        }}
      />
      <Glow left={36} top={FRAME_H - 24} size={28} />
    </>
  );
}

// ─── Blue-collar lamp variants ────────────────────────────────────────────────

// construction — yellow caged halogen work-light on a black tripod
function ConstructionLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const lampBody = isLight ? '#F59E0B' : amber[300];
  const tripod = isLight ? '#1F2937' : '#94928A';
  return (
    <>
      {/* Tripod legs — three angled bars splaying out */}
      <Arm left={16} top={FRAME_H - 14} length={16} thickness={1.5} rotate={-70} color={tripod} />
      <Arm left={16} top={FRAME_H - 14} length={14} thickness={1.5} rotate={-110} color={tripod} />
      <Arm left={16} top={FRAME_H - 14} length={14} thickness={1.5} rotate={-90} color={tripod} />
      {/* Vertical spine */}
      <View
        style={{
          position: 'absolute',
          left: 15.5,
          bottom: 18,
          width: 1.5,
          height: 14,
          backgroundColor: tripod,
        }}
      />
      {/* Square halogen lamp body */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 28,
          width: 22,
          height: 14,
          borderRadius: 2,
          backgroundColor: lampBody,
          borderWidth: 1.5,
          borderColor: tripod,
        }}
      />
      {/* Cage wires across the lamp face */}
      <View style={{ position: 'absolute', left: 6, bottom: 34, width: 22, height: 1, backgroundColor: tripod, opacity: 0.6 }} />
      <View style={{ position: 'absolute', left: 13, bottom: 28, width: 1, height: 14, backgroundColor: tripod, opacity: 0.6 }} />
      <View style={{ position: 'absolute', left: 20, bottom: 28, width: 1, height: 14, backgroundColor: tripod, opacity: 0.6 }} />
      <Glow left={17} top={FRAME_H - 35} size={34} />
    </>
  );
}

// garage — caged trouble-light hanging from a hook
function GarageLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const cage = isLight ? '#374151' : '#D8D2C5';
  const reflector = isLight ? '#E5E7EB' : '#9CA3AF';
  return (
    <>
      {/* Hook + cord */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          top: 0,
          width: 1.5,
          height: 22,
          backgroundColor: cage,
          opacity: 0.7,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 14,
          top: 18,
          width: 6,
          height: 4,
          borderRadius: 2,
          backgroundColor: cage,
        }}
      />
      {/* Reflector dome (back side) */}
      <View
        style={{
          position: 'absolute',
          left: 5,
          top: 22,
          width: 24,
          height: 8,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          backgroundColor: reflector,
        }}
      />
      {/* Bulb */}
      <View
        style={{
          position: 'absolute',
          left: 12,
          top: 28,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: '#FFE8A8',
        }}
      />
      {/* Cage — four vertical bars + horizontal ring */}
      {[6, 11, 16, 21, 26].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: x,
            top: 30,
            width: 1,
            height: 14,
            backgroundColor: cage,
            opacity: 0.85,
          }}
        />
      ))}
      <View style={{ position: 'absolute', left: 4, top: 38, width: 26, height: 1, backgroundColor: cage, opacity: 0.85 }} />
      <View
        style={{
          position: 'absolute',
          left: 6,
          top: 42,
          width: 22,
          height: 4,
          borderBottomLeftRadius: 11,
          borderBottomRightRadius: 11,
          backgroundColor: cage,
          opacity: 0.6,
        }}
      />
      <Glow left={17} top={34} size={28} />
    </>
  );
}

// factory — wide industrial pendant lamp with ribbed dome
function FactoryLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? '#6B7280' : '#9CA3AF';
  const rib = isLight ? '#374151' : '#D1D5DB';
  return (
    <>
      {/* Cord from ceiling */}
      <View
        style={{
          position: 'absolute',
          left: 18,
          top: 0,
          width: 1.5,
          height: 18,
          backgroundColor: rib,
          opacity: 0.7,
        }}
      />
      {/* Mounting collar */}
      <View
        style={{
          position: 'absolute',
          left: 14,
          top: 16,
          width: 8,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: rib,
        }}
      />
      {/* Wide trapezoidal shade */}
      <View
        style={{
          position: 'absolute',
          left: 2,
          top: 19,
          width: 32,
          height: 18,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          backgroundColor: shade,
        }}
      />
      {/* Vertical ribs along the dome */}
      {[7, 13, 19, 25, 30].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute',
            left: x,
            top: 22,
            width: 1,
            height: 12,
            backgroundColor: rib,
            opacity: 0.4,
          }}
        />
      ))}
      <Glow left={18} top={42} size={32} />
    </>
  );
}

// delivery — scooter / car headlight with a forward beam
function DeliveryLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const chrome = isLight ? '#D1D5DB' : '#E5E7EB';
  const dark = isLight ? '#1F2937' : '#0F172A';
  const beam = 'rgba(255, 218, 130, 0.35)';
  return (
    <>
      {/* Mount post */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 12,
          width: 12,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: dark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 11,
          bottom: 14,
          width: 2,
          height: 12,
          backgroundColor: dark,
        }}
      />
      {/* Round headlight (chrome ring + amber lens) */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 24,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: chrome,
          borderWidth: 1.5,
          borderColor: dark,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 10,
          bottom: 28,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: '#FFE08A',
        }}
      />
      {/* Light beam — trapezoidal flare projecting right */}
      <View
        style={{
          position: 'absolute',
          left: 22,
          bottom: 30,
          width: 28,
          height: 6,
          backgroundColor: beam,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
          transform: [{ skewY: '-6deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 22,
          bottom: 22,
          width: 24,
          height: 4,
          backgroundColor: beam,
          opacity: 0.5,
          borderTopRightRadius: 3,
          borderBottomRightRadius: 3,
          transform: [{ skewY: '8deg' }],
        }}
      />
      <Glow left={15} top={FRAME_H - 33} size={22} />
    </>
  );
}

// hospital — bendy-arm exam lamp with a round head
function HospitalLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const arm = isLight ? '#9CA3AF' : '#E5E7EB';
  const head = isLight ? '#FFFFFF' : '#F3F4F6';
  const tealHint = isLight ? '#14B8A6' : '#5EEAD4';
  return (
    <>
      {/* Weighted square base */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 12,
          width: 14,
          height: 4,
          borderRadius: 2,
          backgroundColor: arm,
        }}
      />
      {/* Short post */}
      <View
        style={{
          position: 'absolute',
          left: 12,
          bottom: 16,
          width: 2,
          height: 8,
          backgroundColor: arm,
        }}
      />
      {/* Curved arm — three segments approximating an S-curve */}
      <Arm left={13} top={FRAME_H - 24} length={12} rotate={-50} color={arm} />
      <Arm left={20} top={FRAME_H - 34} length={12} rotate={20} color={arm} />
      <Arm left={29} top={FRAME_H - 30} length={8} rotate={70} color={arm} />
      {/* Round examination head */}
      <View
        style={{
          position: 'absolute',
          right: 22,
          top: FRAME_H - 50,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: head,
          borderWidth: 1.5,
          borderColor: arm,
        }}
      />
      {/* Teal medical accent */}
      <View
        style={{
          position: 'absolute',
          right: 25,
          top: FRAME_H - 46,
          width: 10,
          height: 2,
          backgroundColor: tealHint,
          borderRadius: 1,
        }}
      />
      <Glow left={FRAME_W - 36} top={FRAME_H - 32} size={26} />
    </>
  );
}

// farm — vintage kerosene lantern with oval glass globe and metal handle
function FarmLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const metal = isLight ? '#78716C' : '#A8A29E';
  const glass = isLight ? 'rgba(245, 158, 11, 0.85)' : 'rgba(245, 200, 110, 0.85)';
  return (
    <>
      {/* Handle — semi-circle (two rotated bars) */}
      <Arm left={9} top={4} length={12} thickness={1.5} rotate={50} color={metal} />
      <Arm left={20} top={11} length={12} thickness={1.5} rotate={130} color={metal} />
      {/* Top cap */}
      <View
        style={{
          position: 'absolute',
          left: 9,
          top: 14,
          width: 16,
          height: 5,
          borderRadius: 2,
          backgroundColor: metal,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 12,
          top: 17,
          width: 10,
          height: 3,
          backgroundColor: metal,
        }}
      />
      {/* Glass globe — rounded rectangle */}
      <View
        style={{
          position: 'absolute',
          left: 7,
          top: 20,
          width: 20,
          height: 22,
          borderRadius: 8,
          backgroundColor: glass,
          borderWidth: 1.5,
          borderColor: metal,
        }}
      />
      {/* Flame inside */}
      <View
        style={{
          position: 'absolute',
          left: 14,
          top: 25,
          width: 6,
          height: 10,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
          backgroundColor: '#FFE08A',
        }}
      />
      {/* Bottom fuel reservoir */}
      <View
        style={{
          position: 'absolute',
          left: 9,
          top: 40,
          width: 16,
          height: 6,
          borderRadius: 2,
          backgroundColor: metal,
        }}
      />
      <Glow left={17} top={32} size={28} />
    </>
  );
}

// hotel — elegant brass-stem lamp with cylindrical fabric shade
function HotelLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const brass = champagne[isLight ? 500 : 300];
  const fabric = isLight ? '#FBF1E6' : '#E5DBC3';
  return (
    <>
      {/* Brass disc base */}
      <View
        style={{
          position: 'absolute',
          left: 8,
          bottom: 12,
          width: 18,
          height: 4,
          borderRadius: 2,
          backgroundColor: brass,
        }}
      />
      {/* Tapered brass column */}
      <View
        style={{
          position: 'absolute',
          left: 14,
          bottom: 16,
          width: 4,
          height: 14,
          borderRadius: 1,
          backgroundColor: brass,
        }}
      />
      {/* Cylindrical fabric shade — slightly tapered */}
      <View
        style={{
          position: 'absolute',
          left: 5,
          bottom: 30,
          width: 22,
          height: 16,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottomLeftRadius: 1,
          borderBottomRightRadius: 1,
          backgroundColor: fabric,
          borderWidth: 0.5,
          borderColor: brass,
        }}
      />
      {/* Brass trim top and bottom */}
      <View style={{ position: 'absolute', left: 5, bottom: 46, width: 22, height: 1, backgroundColor: brass }} />
      <View style={{ position: 'absolute', left: 5, bottom: 30, width: 22, height: 1, backgroundColor: brass }} />
      <Glow left={16} top={FRAME_H - 38} size={30} />
    </>
  );
}

// school — wide brass-and-green schoolmaster lamp (variation of banker's)
function SchoolLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = isLight ? '#047857' : '#10B981';
  const brass = champagne[isLight ? 500 : 300];
  const ink = blue[isLight ? 700 : 400];
  return (
    <>
      {/* Wide brass base */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          bottom: 12,
          width: 24,
          height: 4,
          borderRadius: 2,
          backgroundColor: brass,
        }}
      />
      {/* Short brass column */}
      <View
        style={{
          position: 'absolute',
          left: 15,
          bottom: 16,
          width: 2,
          height: 10,
          backgroundColor: brass,
        }}
      />
      {/* Wider, flatter green shade */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 26,
          width: 32,
          height: 8,
          borderRadius: 2,
          backgroundColor: shade,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 24,
          width: 32,
          height: 2,
          borderRadius: 1,
          backgroundColor: brass,
        }}
      />
      {/* Tiny book stack beside the base */}
      <View style={{ position: 'absolute', right: 30, bottom: 12, width: 8, height: 3, backgroundColor: ink, borderRadius: 1 }} />
      <View style={{ position: 'absolute', right: 30, bottom: 15, width: 8, height: 2, backgroundColor: coral[400], borderRadius: 1 }} />
      <Glow left={16} top={FRAME_H - 24} size={28} />
    </>
  );
}

// enterprise — banker's lamp with low rectangular green shade
function EnterpriseLamp({ stemColor, isLight }: { stemColor: string; isLight: boolean }) {
  const shade = jade[isLight ? 500 : 400];
  const brass = champagne[isLight ? 500 : 300];
  return (
    <>
      {/* Heavy circular base */}
      <View
        style={{
          position: 'absolute',
          left: 8,
          bottom: 12,
          width: 18,
          height: 4,
          borderRadius: 2,
          backgroundColor: brass,
        }}
      />
      {/* Short brass column */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          bottom: 16,
          width: 2,
          height: 14,
          backgroundColor: brass,
        }}
      />
      {/* Rectangular green shade */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          bottom: 30,
          width: 26,
          height: 10,
          borderRadius: 3,
          backgroundColor: shade,
        }}
      />
      {/* Brass trim on the underside */}
      <View
        style={{
          position: 'absolute',
          left: 4,
          bottom: 28,
          width: 26,
          height: 2,
          borderRadius: 1,
          backgroundColor: brass,
        }}
      />
      <Glow left={17} top={FRAME_H - 28} size={26} />
    </>
  );
}
