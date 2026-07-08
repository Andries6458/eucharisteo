import React, { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { GrowthPoint } from '../utils/advisor';
import { CurrencyCode } from '../types';
import { formatMoney } from '../utils/currencies';
import { colors, radius, spacing, typography } from '../theme';

interface GrowthChartProps {
  data: GrowthPoint[];
  currency: CurrencyCode;
}

const CHART_HEIGHT = 240;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

/**
 * Touch-interactive line chart: solid line for history, dashed line for the
 * 5-year compound projection, gradient area fill, and a drag crosshair
 * tooltip. Pure react-native-svg, so it renders identically on Android, iOS,
 * and web/desktop viewports.
 */
export default function GrowthChart({ data, currency }: GrowthChartProps) {
  const [width, setWidth] = useState(0);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const widthRef = useRef(0);
  const dataLengthRef = useRef(data.length);
  dataLengthRef.current = data.length;

  const onLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const geometry = useMemo(() => {
    if (width === 0 || data.length < 2) return null;
    const innerWidth = width - PAD_LEFT - PAD_RIGHT;
    const innerHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
    const values = data.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const xFor = (i: number) => PAD_LEFT + (i / (data.length - 1)) * innerWidth;
    const yFor = (v: number) =>
      PAD_TOP + innerHeight - ((v - min) / range) * innerHeight;

    const historyEnd = data.reduce(
      (acc, p, i) => (p.projected ? acc : i),
      0
    );

    const pathFor = (from: number, to: number) =>
      data
        .slice(from, to + 1)
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'}${xFor(from + i).toFixed(2)},${yFor(
              p.value
            ).toFixed(2)}`
        )
        .join(' ');

    const historyPath = pathFor(0, historyEnd);
    const projectionPath = pathFor(historyEnd, data.length - 1);
    const areaPath =
      `${pathFor(0, data.length - 1)} ` +
      `L${xFor(data.length - 1).toFixed(2)},${(CHART_HEIGHT - PAD_BOTTOM).toFixed(2)} ` +
      `L${xFor(0).toFixed(2)},${(CHART_HEIGHT - PAD_BOTTOM).toFixed(2)} Z`;

    const gridValues = [min, min + range / 2, max];

    return {
      xFor,
      yFor,
      historyPath,
      projectionPath,
      areaPath,
      historyEnd,
      gridValues,
      innerWidth,
    };
  }, [width, data]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) =>
          updateTouch(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateTouch(event.nativeEvent.locationX),
        onPanResponderRelease: () => setTouchIndex(null),
        onPanResponderTerminate: () => setTouchIndex(null),
      }),
    []
  );

  function updateTouch(x: number) {
    const w = widthRef.current;
    const count = dataLengthRef.current;
    if (w === 0 || count < 2) return;
    const innerWidth = w - PAD_LEFT - PAD_RIGHT;
    const ratio = Math.min(1, Math.max(0, (x - PAD_LEFT) / innerWidth));
    setTouchIndex(Math.round(ratio * (count - 1)));
  }

  if (data.length < 2) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Text style={styles.emptyText}>
          Add assets to your wallet to see portfolio growth.
        </Text>
      </View>
    );
  }

  const active = touchIndex !== null ? data[touchIndex] : null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={styles.tooltipRow}>
        {active !== null && touchIndex !== null ? (
          <>
            <Text style={styles.tooltipValue}>
              {formatMoney(active.value, currency, { compact: true })}
            </Text>
            <Text style={styles.tooltipLabel}>
              {active.label} · {active.projected ? 'Projected' : 'Actual'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.legendSwatchSolid}>―</Text>
            <Text style={styles.tooltipLabel}>Historical</Text>
            <Text style={styles.legendSwatchDashed}>┄</Text>
            <Text style={styles.tooltipLabel}>5-yr projection · drag to inspect</Text>
          </>
        )}
      </View>

      {geometry !== null ? (
        <View {...panResponder.panHandlers}>
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity="0.28" />
                <Stop offset="1" stopColor={colors.primary} stopOpacity="0.01" />
              </LinearGradient>
            </Defs>

            {geometry.gridValues.map((value) => (
              <React.Fragment key={`grid-${value}`}>
                <Line
                  x1={PAD_LEFT}
                  x2={width - PAD_RIGHT}
                  y1={geometry.yFor(value)}
                  y2={geometry.yFor(value)}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <SvgText
                  x={PAD_LEFT + 2}
                  y={geometry.yFor(value) - 4}
                  fill={colors.textFaint}
                  fontSize={typography.tiny}
                >
                  {formatMoney(value, currency, { compact: true })}
                </SvgText>
              </React.Fragment>
            ))}

            <Path d={geometry.areaPath} fill="url(#areaFill)" />
            <Path
              d={geometry.historyPath}
              stroke={colors.primary}
              strokeWidth={2.5}
              fill="none"
              strokeLinejoin="round"
            />
            <Path
              d={geometry.projectionPath}
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeDasharray="6 6"
              fill="none"
              strokeLinejoin="round"
            />

            <Circle
              cx={geometry.xFor(geometry.historyEnd)}
              cy={geometry.yFor(data[geometry.historyEnd].value)}
              r={4.5}
              fill={colors.primary}
              stroke={colors.bg}
              strokeWidth={2}
            />

            {touchIndex !== null && active !== null ? (
              <>
                <Line
                  x1={geometry.xFor(touchIndex)}
                  x2={geometry.xFor(touchIndex)}
                  y1={PAD_TOP}
                  y2={CHART_HEIGHT - PAD_BOTTOM}
                  stroke={colors.textMuted}
                  strokeWidth={1}
                />
                <Circle
                  cx={geometry.xFor(touchIndex)}
                  cy={geometry.yFor(active.value)}
                  r={6}
                  fill={active.projected ? colors.accent : colors.primary}
                  stroke={colors.text}
                  strokeWidth={2}
                />
              </>
            ) : null}

            <SvgText
              x={PAD_LEFT}
              y={CHART_HEIGHT - 8}
              fill={colors.textFaint}
              fontSize={typography.tiny}
            >
              {data[0].label}
            </SvgText>
            <SvgText
              x={geometry.xFor(geometry.historyEnd)}
              y={CHART_HEIGHT - 8}
              fill={colors.textMuted}
              fontSize={typography.tiny}
              textAnchor="middle"
            >
              Today
            </SvgText>
            <SvgText
              x={width - PAD_RIGHT}
              y={CHART_HEIGHT - 8}
              fill={colors.textFaint}
              fontSize={typography.tiny}
              textAnchor="end"
            >
              {data[data.length - 1].label}
            </SvgText>
          </Svg>
        </View>
      ) : (
        <View style={{ height: CHART_HEIGHT }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  empty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 24,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  tooltipValue: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tooltipLabel: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  legendSwatchSolid: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '900',
  },
  legendSwatchDashed: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: '900',
  },
});
