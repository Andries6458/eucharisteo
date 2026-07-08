import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bitcoin,
  Briefcase,
  Landmark,
  LineChart,
  PiggyBank,
  Plus,
  ReceiptText,
  Trash2,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react-native';

import { useApp } from '../context/AppContext';
import { CURRENCIES, formatMoney, formatPct } from '../utils/currencies';
import { convert } from '../utils/fxEngine';
import {
  buildGrowthSeries,
  summarizePortfolio,
} from '../utils/advisor';
import { computeCapitalGainsTax, TAX_RULES } from '../utils/taxEngine';
import {
  computeCurrentSplit,
  computeTargetSplit,
} from '../utils/splitEngine';
import { Holding } from '../types';
import MetricCard from '../components/MetricCard';
import GrowthChart from '../components/GrowthChart';
import AddHoldingModal from '../components/AddHoldingModal';
import SplitComparison from '../components/SplitComparison';
import { colors, radius, spacing, typography } from '../theme';

function holdingIcon(holding: Holding) {
  switch (holding.assetType) {
    case 'Crypto':
      return <Bitcoin size={18} color={colors.warning} />;
    case 'Bond':
      return <Landmark size={18} color={colors.positive} />;
    case 'Cash':
      return <WalletIcon size={18} color={colors.positive} />;
    case 'ETF':
      return <LineChart size={18} color={colors.accent} />;
    default:
      return <Briefcase size={18} color={colors.primary} />;
  }
}

export default function WalletScreen() {
  const { baseCurrency, rates, holdings, addHolding, removeHolding, profile } =
    useApp();
  const [modalOpen, setModalOpen] = useState(false);

  const summary = useMemo(
    () => summarizePortfolio(holdings, baseCurrency, rates),
    [holdings, baseCurrency, rates]
  );

  const jurisdictionRules = TAX_RULES[CURRENCIES[baseCurrency].jurisdiction];

  const taxEstimate = useMemo(() => {
    const gainLocal = convert(
      summary.unrealizedGain,
      baseCurrency,
      jurisdictionRules.currency,
      rates
    );
    const incomeLocal = convert(
      profile.annualIncome,
      profile.incomeCurrency,
      jurisdictionRules.currency,
      rates
    );
    const result = computeCapitalGainsTax(
      gainLocal,
      incomeLocal,
      jurisdictionRules
    );
    return convert(
      result.estimatedTax,
      jurisdictionRules.currency,
      baseCurrency,
      rates
    );
  }, [summary.unrealizedGain, baseCurrency, jurisdictionRules, profile, rates]);

  const series = useMemo(
    () => buildGrowthSeries(summary.totalValue, profile.riskTolerance),
    [summary.totalValue, profile.riskTolerance]
  );

  const currentSplit = useMemo(
    () => computeCurrentSplit(holdings, baseCurrency, rates),
    [holdings, baseCurrency, rates]
  );
  const targetSplit = useMemo(
    () => computeTargetSplit(profile, baseCurrency, rates),
    [profile, baseCurrency, rates]
  );

  function confirmDelete(holding: Holding) {
    if (Platform.OS === 'web') {
      removeHolding(holding.id);
      return;
    }
    Alert.alert(
      'Remove asset',
      `Delete ${holding.assetName} from your wallet ledger?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeHolding(holding.id),
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.metricsRow}>
        <MetricCard
          label="Total Portfolio Value"
          value={formatMoney(summary.totalValue, baseCurrency, {
            compact: true,
          })}
          sub={`${holdings.length} assets · live FX tick #${rates.tick}`}
          icon={<PiggyBank size={16} color={colors.primary} />}
        />
        <MetricCard
          label="Unrealized Gains"
          value={formatMoney(summary.unrealizedGain, baseCurrency, {
            compact: true,
          })}
          sub={formatPct(summary.unrealizedGainPct)}
          tone={summary.unrealizedGain >= 0 ? 'positive' : 'negative'}
          icon={
            <TrendingUp
              size={16}
              color={
                summary.unrealizedGain >= 0 ? colors.positive : colors.negative
              }
            />
          }
        />
        <MetricCard
          label="Est. Tax Liability"
          value={formatMoney(taxEstimate, baseCurrency, { compact: true })}
          sub={`${jurisdictionRules.authority} capital gains`}
          tone="warning"
          icon={<ReceiptText size={16} color={colors.warning} />}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Growth & 5-year projection</Text>
        <Text style={styles.sectionMeta}>
          {profile.riskTolerance === 'TaxOptimised'
            ? 'Tax-Optimised profile'
            : `${profile.riskTolerance} risk profile`}
        </Text>
      </View>
      <GrowthChart data={series} currency={baseCurrency} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Current vs target 4-way split</Text>
        <Text style={styles.sectionMeta}>
          {profile.riskTolerance === 'TaxOptimised'
            ? 'Tax-Optimised'
            : `${profile.riskTolerance} risk`}{' '}
          strategy
        </Text>
      </View>
      <SplitComparison
        current={currentSplit}
        target={targetSplit}
        baseCurrency={baseCurrency}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Wallet ledger</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalOpen(true)}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add asset</Text>
        </TouchableOpacity>
      </View>

      {holdings.length === 0 ? (
        <View style={styles.emptyLedger}>
          <Text style={styles.emptyText}>
            Your ledger is empty. Add your first asset to start tracking
            multi-currency performance.
          </Text>
        </View>
      ) : (
        holdings.map((holding) => {
          const valueNative = holding.currentPrice * holding.quantity;
          const costNative = holding.purchasePrice * holding.quantity;
          const valueBase = convert(
            valueNative,
            holding.purchaseCurrency,
            baseCurrency,
            rates
          );
          const gainBase =
            valueBase -
            convert(costNative, holding.purchaseCurrency, baseCurrency, rates);
          const gainPct =
            costNative > 0
              ? ((valueNative - costNative) / costNative) * 100
              : 0;

          return (
            <View key={holding.id} style={styles.holdingRow}>
              <View style={styles.holdingIcon}>{holdingIcon(holding)}</View>
              <View style={styles.holdingBody}>
                <Text style={styles.holdingName} numberOfLines={1}>
                  {holding.assetName}
                </Text>
                <Text style={styles.holdingMeta} numberOfLines={1}>
                  {holding.ticker} · {holding.assetType} · {holding.quantity} @{' '}
                  {formatMoney(
                    holding.purchasePrice,
                    holding.purchaseCurrency
                  )}{' '}
                  · {holding.purchaseDate}
                </Text>
              </View>
              <View style={styles.holdingValues}>
                <Text style={styles.holdingValue}>
                  {formatMoney(valueBase, baseCurrency, { compact: true })}
                </Text>
                <Text
                  style={[
                    styles.holdingGain,
                    {
                      color: gainBase >= 0 ? colors.positive : colors.negative,
                    },
                  ]}
                >
                  {formatMoney(gainBase, baseCurrency, { compact: true })} (
                  {formatPct(gainPct, 1)})
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDelete(holding)}
                accessibilityLabel={`Delete ${holding.assetName}`}
              >
                <Trash2 size={16} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <AddHoldingModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={addHolding}
      />
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
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
  },
  sectionMeta: {
    color: colors.textFaint,
    fontSize: typography.small,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: typography.small,
    fontWeight: '800',
  },
  emptyLedger: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  holdingIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdingBody: {
    flex: 1,
    minWidth: 0,
  },
  holdingName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  holdingMeta: {
    color: colors.textFaint,
    fontSize: typography.tiny,
    marginTop: 2,
  },
  holdingValues: {
    alignItems: 'flex-end',
  },
  holdingValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  holdingGain: {
    fontSize: typography.small,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  deleteButton: {
    padding: spacing.sm,
  },
});
