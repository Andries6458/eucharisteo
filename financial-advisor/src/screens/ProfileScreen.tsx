import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ShieldAlert, UserRound } from 'lucide-react-native';

import { useApp } from '../context/AppContext';
import { CURRENCIES, CURRENCY_LIST, formatMoney } from '../utils/currencies';
import { convert } from '../utils/fxEngine';
import { CurrencyCode, RiskTolerance } from '../types';
import { colors, radius, spacing, typography } from '../theme';

const RISK_LEVELS: Array<{
  level: RiskTolerance;
  title: string;
  blurb: string;
}> = [
  {
    level: 'Low',
    title: 'Low (Conservative)',
    blurb:
      '15% dividend stocks, 35% index ETFs, 0% crypto, 50% government bonds/cash.',
  },
  {
    level: 'Medium',
    title: 'Medium (Balanced)',
    blurb:
      '40% blue-chip stocks, 40% broad market ETFs, 5% crypto, 15% cash/bonds.',
  },
  {
    level: 'High',
    title: 'High (Aggressive Growth)',
    blurb:
      '50% high-growth stocks, 30% global ETFs, 15% crypto, 5% cash.',
  },
  {
    level: 'TaxOptimised',
    title: 'Tax-Optimised',
    blurb:
      'Fills your TFSA / ISA / Roth IRA allowance first, then splits the remainder across the four classes.',
  },
];

export default function ProfileScreen() {
  const { profile, updateProfile, baseCurrency, rates } = useApp();

  const [name, setName] = useState(profile.name);
  const [income, setIncome] = useState(String(profile.annualIncome));
  const [incomeCurrency, setIncomeCurrency] = useState<CurrencyCode>(
    profile.incomeCurrency
  );
  const [cash, setCash] = useState(String(profile.cashReserves));
  const [cashCurrency, setCashCurrency] = useState<CurrencyCode>(
    profile.cashCurrency
  );
  const [risk, setRisk] = useState<RiskTolerance>(profile.riskTolerance);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(profile.name);
    setIncome(String(profile.annualIncome));
    setIncomeCurrency(profile.incomeCurrency);
    setCash(String(profile.cashReserves));
    setCashCurrency(profile.cashCurrency);
    setRisk(profile.riskTolerance);
  }, [profile]);

  function handleSave() {
    const incomeNum = Number(income);
    const cashNum = Number(cash);
    if (!Number.isFinite(incomeNum) || incomeNum < 0) {
      setError('Annual income must be zero or a positive number.');
      setSaved(false);
      return;
    }
    if (!Number.isFinite(cashNum) || cashNum < 0) {
      setError('Cash reserves must be zero or a positive number.');
      setSaved(false);
      return;
    }
    setError('');
    updateProfile({
      name: name.trim() === '' ? 'Investor' : name.trim(),
      annualIncome: incomeNum,
      incomeCurrency,
      cashReserves: cashNum,
      cashCurrency,
      riskTolerance: risk,
    });
    setSaved(true);
  }

  const incomeInBase = convert(
    Number(income) || 0,
    incomeCurrency,
    baseCurrency,
    rates
  );
  const jurisdiction = CURRENCIES[baseCurrency].jurisdictionLabel;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <UserRound size={22} color={colors.primary} />
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.headerName}>{profile.name}</Text>
          <Text style={styles.headerMeta}>
            Income ≈ {formatMoney(incomeInBase, baseCurrency, { compact: true })}{' '}
            in {baseCurrency} · taxed under {jurisdiction}
          </Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setSaved(false);
        }}
        placeholder="Your name"
        placeholderTextColor={colors.textFaint}
      />

      <Text style={styles.fieldLabel}>Annual income</Text>
      <TextInput
        style={styles.input}
        value={income}
        onChangeText={(value) => {
          setIncome(value);
          setSaved(false);
        }}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
        placeholderTextColor={colors.textFaint}
      />
      <View style={styles.segmentRow}>
        {CURRENCY_LIST.map((currency) => (
          <TouchableOpacity
            key={`income-${currency.code}`}
            style={[
              styles.segment,
              incomeCurrency === currency.code && styles.segmentActive,
            ]}
            onPress={() => {
              setIncomeCurrency(currency.code);
              setSaved(false);
            }}
          >
            <Text
              style={[
                styles.segmentText,
                incomeCurrency === currency.code && styles.segmentTextActive,
              ]}
            >
              {currency.symbol} {currency.code}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Investable cash reserves</Text>
      <TextInput
        style={styles.input}
        value={cash}
        onChangeText={(value) => {
          setCash(value);
          setSaved(false);
        }}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0"
        placeholderTextColor={colors.textFaint}
      />
      <View style={styles.segmentRow}>
        {CURRENCY_LIST.map((currency) => (
          <TouchableOpacity
            key={`cash-${currency.code}`}
            style={[
              styles.segment,
              cashCurrency === currency.code && styles.segmentActive,
            ]}
            onPress={() => {
              setCashCurrency(currency.code);
              setSaved(false);
            }}
          >
            <Text
              style={[
                styles.segmentText,
                cashCurrency === currency.code && styles.segmentTextActive,
              ]}
            >
              {currency.symbol} {currency.code}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Risk tolerance</Text>
      <View style={styles.riskList}>
        {RISK_LEVELS.map((item) => {
          const selected = risk === item.level;
          return (
            <TouchableOpacity
              key={item.level}
              style={[styles.riskRow, selected && styles.riskRowActive]}
              onPress={() => {
                setRisk(item.level);
                setSaved(false);
              }}
            >
              <ShieldAlert
                size={18}
                color={selected ? colors.primary : colors.textFaint}
              />
              <View style={styles.riskBody}>
                <Text
                  style={[styles.riskLevel, selected && styles.riskLevelActive]}
                >
                  {item.title}
                </Text>
                <Text style={styles.riskBlurb}>{item.blurb}</Text>
              </View>
              {selected ? <Check size={18} color={colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.save} onPress={handleSave}>
        <Text style={styles.saveText}>
          {saved ? 'Saved ✓' : 'Save profile'}
        </Text>
      </TouchableOpacity>
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
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
  },
  headerName: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
  },
  headerMeta: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginTop: 2,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: typography.body,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.primary,
  },
  riskList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  riskRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  riskBody: {
    flex: 1,
  },
  riskLevel: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '800',
  },
  riskLevelActive: {
    color: colors.primary,
  },
  riskBlurb: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginTop: 2,
  },
  error: {
    color: colors.negative,
    fontSize: typography.body,
    marginTop: spacing.sm,
  },
  save: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '800',
  },
});
