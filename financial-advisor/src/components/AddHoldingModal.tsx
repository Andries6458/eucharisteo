import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';

import { AssetType, CurrencyCode, Holding } from '../types';
import { CURRENCY_LIST } from '../utils/currencies';
import { colors, radius, spacing, typography } from '../theme';

interface AddHoldingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (holding: Omit<Holding, 'id'>) => void;
}

const ASSET_TYPES: AssetType[] = ['Stock', 'ETF', 'Crypto', 'Bond', 'Cash'];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddHoldingModal({
  visible,
  onClose,
  onSubmit,
}: AddHoldingModalProps) {
  const [assetName, setAssetName] = useState('');
  const [ticker, setTicker] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('Stock');
  const [purchaseCurrency, setPurchaseCurrency] =
    useState<CurrencyCode>('USD');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(isoToday());
  const [error, setError] = useState('');

  function reset() {
    setAssetName('');
    setTicker('');
    setAssetType('Stock');
    setPurchaseCurrency('USD');
    setPurchasePrice('');
    setCurrentPrice('');
    setQuantity('');
    setPurchaseDate(isoToday());
    setError('');
  }

  function handleSubmit() {
    const price = Number(purchasePrice);
    const qty = Number(quantity);
    const current = currentPrice.trim() === '' ? price : Number(currentPrice);

    if (assetName.trim() === '') {
      setError('Asset name is required.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Purchase price must be a positive number.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }
    if (!Number.isFinite(current) || current <= 0) {
      setError('Current price must be a positive number.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate.trim())) {
      setError('Date must be in YYYY-MM-DD format.');
      return;
    }

    onSubmit({
      assetName: assetName.trim(),
      ticker: ticker.trim().toUpperCase() || assetName.trim().toUpperCase(),
      assetType,
      purchaseCurrency,
      purchasePrice: price,
      quantity: qty,
      purchaseDate: purchaseDate.trim(),
      currentPrice: current,
    });
    reset();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add asset to ledger</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel}>Asset name</Text>
            <TextInput
              style={styles.input}
              value={assetName}
              onChangeText={setAssetName}
              placeholder="e.g. Apple Inc."
              placeholderTextColor={colors.textFaint}
            />

            <Text style={styles.fieldLabel}>Ticker</Text>
            <TextInput
              style={styles.input}
              value={ticker}
              onChangeText={setTicker}
              placeholder="e.g. AAPL"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Asset type</Text>
            <View style={styles.segmentRow}>
              {ASSET_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.segment,
                    assetType === type && styles.segmentActive,
                  ]}
                  onPress={() => setAssetType(type)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      assetType === type && styles.segmentTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Purchase currency</Text>
            <View style={styles.segmentRow}>
              {CURRENCY_LIST.map((currency) => (
                <TouchableOpacity
                  key={currency.code}
                  style={[
                    styles.segment,
                    purchaseCurrency === currency.code && styles.segmentActive,
                  ]}
                  onPress={() => setPurchaseCurrency(currency.code)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      purchaseCurrency === currency.code &&
                        styles.segmentTextActive,
                    ]}
                  >
                    {currency.symbol} {currency.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inline}>
              <View style={styles.inlineItem}>
                <Text style={styles.fieldLabel}>Purchase price</Text>
                <TextInput
                  style={styles.input}
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                />
              </View>
              <View style={styles.inlineItem}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                />
              </View>
            </View>

            <View style={styles.inline}>
              <View style={styles.inlineItem}>
                <Text style={styles.fieldLabel}>Current price (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={currentPrice}
                  onChangeText={setCurrentPrice}
                  placeholder="Defaults to purchase price"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                />
              </View>
              <View style={styles.inlineItem}>
                <Text style={styles.fieldLabel}>Purchase date</Text>
                <TextInput
                  style={styles.input}
                  value={purchaseDate}
                  onChangeText={setPurchaseDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            </View>

            {error !== '' ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={styles.submit} onPress={handleSubmit}>
              <Text style={styles.submitText}>Save to wallet</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 16, 0.72)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '800',
  },
  form: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    marginTop: spacing.sm,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segment: {
    flexGrow: 1,
    flexBasis: 90,
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
  inline: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  inlineItem: {
    flex: 1,
    gap: spacing.sm,
  },
  error: {
    color: colors.negative,
    fontSize: typography.body,
    marginTop: spacing.sm,
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '800',
  },
});
