import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
  icon?: React.ReactNode;
}

export default function MetricCard({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: MetricCardProps) {
  const valueColor =
    tone === 'positive'
      ? colors.positive
      : tone === 'negative'
        ? colors.negative
        : tone === 'warning'
          ? colors.warning
          : colors.text;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {icon}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  value: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sub: {
    color: colors.textFaint,
    fontSize: typography.small,
  },
});
