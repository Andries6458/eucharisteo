import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AssetClass, CurrencyCode, FourWaySplit } from '../types';
import { ASSET_CLASS_ORDER } from '../utils/splitEngine';
import { formatMoney } from '../utils/currencies';
import { colors, radius, spacing, typography } from '../theme';

interface SplitComparisonProps {
  current: Record<AssetClass, number>;
  target: FourWaySplit;
  baseCurrency: CurrencyCode;
}

const CLASS_COLORS: Record<AssetClass, string> = {
  Stocks: colors.primary,
  Shares: colors.accent,
  Crypto: colors.warning,
  FixedIncome: colors.positive,
};

/**
 * Current vs target 4-way split. Each asset class shows two bars — the
 * ledger's live breakdown on top, the recommended split beneath — plus a
 * drift chip telling the user which direction to rebalance.
 */
export default function SplitComparison({
  current,
  target,
  baseCurrency,
}: SplitComparisonProps) {
  return (
    <View style={styles.container}>
      <View style={styles.stackedBar}>
        {target.slices
          .filter((slice) => slice.pct > 0)
          .map((slice) => (
            <View
              key={`stack-${slice.assetClass}`}
              style={{
                flex: slice.pct,
                backgroundColor: CLASS_COLORS[slice.assetClass],
              }}
            />
          ))}
      </View>

      {ASSET_CLASS_ORDER.map((assetClass) => {
        const slice = target.slices.find((s) => s.assetClass === assetClass)!;
        const currentPct = current[assetClass];
        const drift = currentPct - slice.pct;
        const overweight = drift > 2;
        const underweight = drift < -2;

        return (
          <View key={assetClass} style={styles.row}>
            <View style={styles.rowHeader}>
              <View style={styles.labelWrap}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: CLASS_COLORS[assetClass] },
                  ]}
                />
                <Text style={styles.label} numberOfLines={1}>
                  {slice.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.driftChip,
                  overweight && { color: colors.negative },
                  underweight && { color: colors.warning },
                  !overweight && !underweight && { color: colors.positive },
                ]}
              >
                {overweight
                  ? `${drift.toFixed(0)}% over`
                  : underweight
                    ? `${Math.abs(drift).toFixed(0)}% under`
                    : 'On target'}
              </Text>
            </View>

            <View style={styles.barPair}>
              <View style={styles.barLine}>
                <Text style={styles.barTag}>Now</Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.min(100, currentPct)}%`,
                        backgroundColor: CLASS_COLORS[assetClass],
                      },
                    ]}
                  />
                </View>
                <Text style={styles.pct}>{currentPct.toFixed(0)}%</Text>
              </View>
              <View style={styles.barLine}>
                <Text style={styles.barTag}>Target</Text>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      styles.fillTarget,
                      {
                        width: `${Math.min(100, slice.pct)}%`,
                        borderColor: CLASS_COLORS[assetClass],
                      },
                    ]}
                  />
                </View>
                <Text style={styles.pct}>{slice.pct.toFixed(0)}%</Text>
              </View>
            </View>

            <Text style={styles.amount}>
              Deploy {formatMoney(slice.amount, baseCurrency, { compact: true })}{' '}
              of investable cash
            </Text>
          </View>
        );
      })}

      {target.wrapper !== null ? (
        <View style={styles.wrapperCard}>
          <Text style={styles.wrapperTitle}>{target.wrapper.name}</Text>
          <Text style={styles.wrapperText}>
            {formatMoney(target.wrapper.contribution, baseCurrency, {
              compact: true,
            })}{' '}
            of the{' '}
            {formatMoney(target.wrapper.cap, baseCurrency, { compact: true })}{' '}
            annual allowance goes in first — growth inside the wrapper is
            completely tax-free.
          </Text>
        </View>
      ) : null}

      <Text style={styles.strategy}>{target.strategy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  label: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
    flexShrink: 1,
  },
  driftChip: {
    fontSize: typography.small,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  barPair: {
    gap: 4,
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barTag: {
    width: 42,
    color: colors.textFaint,
    fontSize: typography.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  fillTarget: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  pct: {
    width: 40,
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  amount: {
    color: colors.textFaint,
    fontSize: typography.small,
  },
  wrapperCard: {
    backgroundColor: colors.positiveSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.positive,
    padding: spacing.md,
    gap: spacing.xs,
  },
  wrapperTitle: {
    color: colors.positive,
    fontSize: typography.body,
    fontWeight: '800',
  },
  wrapperText: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 18,
  },
  strategy: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
