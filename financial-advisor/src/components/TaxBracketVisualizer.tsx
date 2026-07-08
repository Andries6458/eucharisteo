import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IncomeTaxResult, TaxRuleSet } from '../types';
import { formatMoney } from '../utils/currencies';
import { colors, radius, spacing, typography } from '../theme';

interface TaxBracketVisualizerProps {
  rules: TaxRuleSet;
  result: IncomeTaxResult;
}

/**
 * Horizontal bracket ladder. Each row shows the bracket range in the
 * jurisdiction's local currency; the fill shows how much of the bracket the
 * user's taxable income consumes, and the active marginal bracket is
 * highlighted.
 */
export default function TaxBracketVisualizer({
  rules,
  result,
}: TaxBracketVisualizerProps) {
  return (
    <View style={styles.container}>
      {rules.brackets.map((bracket, index) => {
        const upper = bracket.to ?? Number.POSITIVE_INFINITY;
        // Give the unbounded top bracket a display width of 1.5x its floor.
        const displaySpan =
          bracket.to !== null ? bracket.to - bracket.from : bracket.from * 0.5;
        const amountIn = Math.max(
          0,
          Math.min(result.taxable, upper) - bracket.from
        );
        const fillRatio =
          displaySpan > 0 ? Math.min(1, amountIn / displaySpan) : 0;
        const isActive = index === result.activeBracketIndex && result.taxable > 0;
        const entered = amountIn > 0;

        return (
          <View
            key={`${bracket.from}-${bracket.rate}`}
            style={[styles.row, isActive && styles.rowActive]}
          >
            <View style={styles.rateCell}>
              <Text style={[styles.rate, isActive && styles.rateActive]}>
                {Math.round(bracket.rate * 100)}%
              </Text>
            </View>
            <View style={styles.barCell}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${fillRatio * 100}%`,
                      backgroundColor: isActive
                        ? colors.primary
                        : entered
                          ? colors.positive
                          : 'transparent',
                    },
                  ]}
                />
              </View>
              <View style={styles.rangeRow}>
                <Text style={styles.range}>
                  {formatMoney(bracket.from, rules.currency, {
                    compact: true,
                    decimals: 0,
                  })}
                  {' — '}
                  {bracket.to !== null
                    ? formatMoney(bracket.to, rules.currency, {
                        compact: true,
                        decimals: 0,
                      })
                    : 'and above'}
                </Text>
                {entered ? (
                  <Text style={styles.taxInBracket}>
                    {formatMoney(result.perBracketTax[index], rules.currency, {
                      compact: true,
                      decimals: 0,
                    })}{' '}
                    tax
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rateCell: {
    width: 48,
    alignItems: 'center',
  },
  rate: {
    color: colors.textMuted,
    fontSize: typography.heading,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rateActive: {
    color: colors.primary,
  },
  barCell: {
    flex: 1,
    gap: spacing.xs,
  },
  barTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  range: {
    color: colors.textFaint,
    fontSize: typography.small,
    fontVariant: ['tabular-nums'],
  },
  taxInBracket: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
