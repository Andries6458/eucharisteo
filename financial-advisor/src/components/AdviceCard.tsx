import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Bitcoin,
  Briefcase,
  Landmark,
  LineChart,
  Wallet,
} from 'lucide-react-native';

import { AdviceSignal, CurrencyCode } from '../types';
import { formatMoney } from '../utils/currencies';
import { colors, radius, spacing, typography } from '../theme';

interface AdviceCardProps {
  signal: AdviceSignal;
  baseCurrency: CurrencyCode;
}

function iconFor(assetType: AdviceSignal['assetType']) {
  switch (assetType) {
    case 'Crypto':
      return <Bitcoin size={18} color={colors.warning} />;
    case 'Bond':
      return <Landmark size={18} color={colors.positive} />;
    case 'ETF':
      return <LineChart size={18} color={colors.primary} />;
    case 'Cash':
      return <Wallet size={18} color={colors.textMuted} />;
    default:
      return <Briefcase size={18} color={colors.accent} />;
  }
}

function actionTone(action: AdviceSignal['action']) {
  switch (action) {
    case 'Buy':
      return { color: colors.positive, bg: colors.positiveSoft };
    case 'Accumulate':
      return { color: colors.primary, bg: colors.primarySoft };
    case 'Reduce':
      return { color: colors.negative, bg: colors.negativeSoft };
    default:
      return { color: colors.warning, bg: colors.warningSoft };
  }
}

export default function AdviceCard({ signal, baseCurrency }: AdviceCardProps) {
  const tone = actionTone(signal.action);
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>{iconFor(signal.assetType)}</View>
        <View style={styles.headerBody}>
          <Text style={styles.title} numberOfLines={1}>
            {signal.title}
          </Text>
          <Text style={styles.meta}>
            {signal.ticker} · {signal.assetType} · trades in {signal.currency}
          </Text>
        </View>
        <View style={[styles.actionPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.actionText, { color: tone.color }]}>
            {signal.action}
          </Text>
        </View>
      </View>

      <Text style={styles.rationale}>{signal.rationale}</Text>

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.footerLabel}>Suggested amount</Text>
          <Text style={styles.footerValue}>
            {formatMoney(signal.suggestedAmount, baseCurrency, {
              compact: true,
            })}
          </Text>
        </View>
        <View style={styles.footerRight}>
          <Text style={styles.footerLabel}>Target weight</Text>
          <Text style={styles.footerValue}>{signal.targetAllocationPct}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  meta: {
    color: colors.textFaint,
    fontSize: typography.small,
    marginTop: 2,
  },
  actionPill: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  actionText: {
    fontSize: typography.small,
    fontWeight: '800',
  },
  rationale: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  footerLabel: {
    color: colors.textFaint,
    fontSize: typography.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  footerValue: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
});
