import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';

import { useApp } from '../context/AppContext';
import { CURRENCY_LIST } from '../utils/currencies';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Global currency dropdown. Selecting a currency instantly rebases every
 * value in the app because all screens derive from the shared context.
 */
export default function CurrencySelector() {
  const { baseCurrency, setBaseCurrency } = useApp();
  const [open, setOpen] = useState(false);
  const active = CURRENCY_LIST.find((c) => c.code === baseCurrency)!;

  return (
    <View>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Base currency: ${active.name}. Tap to change.`}
      >
        <Text style={styles.flag}>{active.flag}</Text>
        <Text style={styles.code}>
          {active.code} ({active.symbol})
        </Text>
        <ChevronDown size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Base currency</Text>
            {CURRENCY_LIST.map((currency) => {
              const selected = currency.code === baseCurrency;
              return (
                <TouchableOpacity
                  key={currency.code}
                  style={[styles.item, selected && styles.itemSelected]}
                  onPress={() => {
                    setBaseCurrency(currency.code);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.flag}>{currency.flag}</Text>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemCode}>
                      {currency.code} — {currency.symbol}
                    </Text>
                    <Text style={styles.itemName}>{currency.name}</Text>
                    <Text style={styles.itemJurisdiction}>
                      {currency.jurisdictionLabel}
                    </Text>
                  </View>
                  {selected ? <Check size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  flag: {
    fontSize: typography.heading,
  },
  code: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 16, 0.72)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  menuTitle: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  itemBody: {
    flex: 1,
  },
  itemCode: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  itemName: {
    color: colors.textMuted,
    fontSize: typography.small,
    marginTop: 2,
  },
  itemJurisdiction: {
    color: colors.textFaint,
    fontSize: typography.tiny,
    marginTop: 2,
  },
});
