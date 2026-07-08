import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Activity, ArrowDownRight, ArrowUpRight, Radio } from 'lucide-react-native';

import { useApp } from '../context/AppContext';
import {
  getFxPairQuotes,
  getMarketIndices,
  POLL_INTERVAL_MS,
} from '../utils/fxEngine';
import { getAdviceSignals } from '../utils/advisor';
import { formatMoney, formatPct } from '../utils/currencies';
import AdviceCard from '../components/AdviceCard';
import { colors, radius, spacing, typography } from '../theme';

export default function AdvisoryScreen() {
  const { baseCurrency, rates, profile } = useApp();

  const fxPairs = useMemo(() => getFxPairQuotes(rates), [rates]);
  const indices = useMemo(() => getMarketIndices(rates), [rates]);
  const signals = useMemo(
    () => getAdviceSignals(profile, baseCurrency, rates),
    [profile, baseCurrency, rates]
  );

  const lastUpdated = new Date(rates.updatedAt).toLocaleTimeString();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.liveBanner}>
        <Radio size={14} color={colors.positive} />
        <Text style={styles.liveText}>
          Live feed · refreshes every {POLL_INTERVAL_MS / 1000}s · updated{' '}
          {lastUpdated}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>FX pairs</Text>
      <View style={styles.grid}>
        {fxPairs.map((quote) => {
          const up = quote.changePct >= 0;
          return (
            <View key={quote.pair} style={styles.gridCell}>
              <Text style={styles.pairName}>{quote.pair}</Text>
              <Text style={styles.pairRate}>
                {quote.rate.toFixed(quote.rate < 1 ? 4 : 3)}
              </Text>
              <View style={styles.changeRow}>
                {up ? (
                  <ArrowUpRight size={14} color={colors.positive} />
                ) : (
                  <ArrowDownRight size={14} color={colors.negative} />
                )}
                <Text
                  style={[
                    styles.changeText,
                    { color: up ? colors.positive : colors.negative },
                  ]}
                >
                  {formatPct(quote.changePct, 3)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Global indices</Text>
      <View style={styles.grid}>
        {indices.map((index) => {
          const up = index.changePct >= 0;
          return (
            <View key={index.symbol} style={styles.gridCell}>
              <View style={styles.indexHeader}>
                <Activity size={12} color={colors.textFaint} />
                <Text style={styles.indexRegion}>{index.region}</Text>
              </View>
              <Text style={styles.pairName}>{index.name}</Text>
              <Text style={styles.pairRate}>
                {index.value.toLocaleString('en-US', {
                  maximumFractionDigits: 1,
                })}
              </Text>
              <View style={styles.changeRow}>
                {up ? (
                  <ArrowUpRight size={14} color={colors.positive} />
                ) : (
                  <ArrowDownRight size={14} color={colors.negative} />
                )}
                <Text
                  style={[
                    styles.changeText,
                    { color: up ? colors.positive : colors.negative },
                  ]}
                >
                  {formatPct(index.changePct, 2)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.adviceHeader}>
        <Text style={styles.sectionTitle}>Personalized advice</Text>
        <Text style={styles.adviceMeta}>
          {profile.riskTolerance} risk ·{' '}
          {formatMoney(profile.cashReserves, profile.cashCurrency, {
            compact: true,
          })}{' '}
          investable cash
        </Text>
      </View>
      <View style={styles.adviceList}>
        {signals.map((signal) => (
          <AdviceCard
            key={signal.id}
            signal={signal}
            baseCurrency={baseCurrency}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.positiveSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  liveText: {
    color: colors.positive,
    fontSize: typography.small,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridCell: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  pairName: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
  },
  pairRate: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeText: {
    fontSize: typography.small,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  indexHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  indexRegion: {
    color: colors.textFaint,
    fontSize: typography.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  adviceHeader: {
    gap: spacing.xs,
  },
  adviceMeta: {
    color: colors.textFaint,
    fontSize: typography.small,
  },
  adviceList: {
    gap: spacing.md,
  },
});
