import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Landmark, Lightbulb, ReceiptText, Scale } from 'lucide-react-native';

import { useApp } from '../context/AppContext';
import { CURRENCIES, formatMoney } from '../utils/currencies';
import { convert } from '../utils/fxEngine';
import {
  computeCapitalGainsTax,
  computeIncomeTax,
  TAX_RULES,
} from '../utils/taxEngine';
import { summarizePortfolio } from '../utils/advisor';
import MetricCard from '../components/MetricCard';
import TaxBracketVisualizer from '../components/TaxBracketVisualizer';
import { colors, radius, spacing, typography } from '../theme';

export default function TaxScreen() {
  const { baseCurrency, rates, profile, holdings } = useApp();

  const meta = CURRENCIES[baseCurrency];
  const rules = TAX_RULES[meta.jurisdiction];

  const incomeLocal = useMemo(
    () =>
      convert(
        profile.annualIncome,
        profile.incomeCurrency,
        rules.currency,
        rates
      ),
    [profile.annualIncome, profile.incomeCurrency, rules.currency, rates]
  );

  const incomeTax = useMemo(
    () => computeIncomeTax(incomeLocal, rules),
    [incomeLocal, rules]
  );

  const gains = useMemo(() => {
    const summary = summarizePortfolio(holdings, rules.currency, rates);
    return computeCapitalGainsTax(
      summary.unrealizedGain,
      incomeLocal,
      rules
    );
  }, [holdings, rules, rates, incomeLocal]);

  const totalTaxBase = convert(
    incomeTax.totalTax + gains.estimatedTax,
    rules.currency,
    baseCurrency,
    rates
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.jurisdictionCard}>
        <View style={styles.jurisdictionIcon}>
          <Landmark size={20} color={colors.primary} />
        </View>
        <View style={styles.jurisdictionBody}>
          <Text style={styles.jurisdictionTitle}>
            {meta.flag} {rules.country} · {rules.authority}
          </Text>
          <Text style={styles.jurisdictionSub}>
            {rules.taxYearLabel} · follows your {baseCurrency} base currency
          </Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard
          label="Income Tax"
          value={formatMoney(
            convert(incomeTax.totalTax, rules.currency, baseCurrency, rates),
            baseCurrency,
            { compact: true }
          )}
          sub={`Effective ${(incomeTax.effectiveRate * 100).toFixed(1)}% · marginal ${(
            incomeTax.marginalRate * 100
          ).toFixed(0)}%`}
          icon={<Scale size={16} color={colors.primary} />}
        />
        <MetricCard
          label="CGT on Unrealized"
          value={formatMoney(
            convert(gains.estimatedTax, rules.currency, baseCurrency, rates),
            baseCurrency,
            { compact: true }
          )}
          sub={`Effective ${(gains.effectiveRate * 100).toFixed(1)}% of gains`}
          tone="warning"
          icon={<ReceiptText size={16} color={colors.warning} />}
        />
        <MetricCard
          label="Total Est. Liability"
          value={formatMoney(totalTaxBase, baseCurrency, { compact: true })}
          sub="Income tax + CGT if realized today"
          tone="negative"
          icon={<ReceiptText size={16} color={colors.negative} />}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {rules.authority} income tax brackets
        </Text>
        <Text style={styles.sectionMeta}>
          Taxable: {formatMoney(incomeTax.taxable, rules.currency, {
            compact: true,
            decimals: 0,
          })}
        </Text>
      </View>
      <TaxBracketVisualizer rules={rules} result={incomeTax} />

      <View style={styles.cgtCard}>
        <Text style={styles.cgtTitle}>Capital gains treatment</Text>
        <Text style={styles.cgtNote}>{rules.capitalGains.note}</Text>
        <View style={styles.cgtStatsRow}>
          <View style={styles.cgtStat}>
            <Text style={styles.cgtStatLabel}>Gross gain</Text>
            <Text style={styles.cgtStatValue}>
              {formatMoney(gains.grossGain, rules.currency, { compact: true })}
            </Text>
          </View>
          <View style={styles.cgtStat}>
            <Text style={styles.cgtStatLabel}>Exclusion used</Text>
            <Text style={styles.cgtStatValue}>
              {formatMoney(gains.exclusionApplied, rules.currency, {
                compact: true,
              })}
            </Text>
          </View>
          <View style={styles.cgtStat}>
            <Text style={styles.cgtStatLabel}>Taxable gain</Text>
            <Text style={styles.cgtStatValue}>
              {formatMoney(gains.taxableGain, rules.currency, {
                compact: true,
              })}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Optimization playbook</Text>
      <View style={styles.tipsList}>
        {rules.optimizationTips.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <Lightbulb size={16} color={colors.warning} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.disclaimer}>
        Estimates are for planning only and assume a single filer with no other
        deductions. Confirm with a registered tax practitioner before filing
        with the {rules.authority}.
      </Text>
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
  jurisdictionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
  },
  jurisdictionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jurisdictionBody: {
    flex: 1,
  },
  jurisdictionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
  },
  jurisdictionSub: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginTop: 2,
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
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  sectionMeta: {
    color: colors.textFaint,
    fontSize: typography.small,
    fontVariant: ['tabular-nums'],
  },
  cgtCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cgtTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  cgtNote: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  cgtStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  cgtStat: {
    flex: 1,
  },
  cgtStatLabel: {
    color: colors.textFaint,
    fontSize: typography.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cgtStatValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  tipsList: {
    gap: spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 20,
  },
  disclaimer: {
    color: colors.textFaint,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
