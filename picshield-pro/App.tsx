/**
 * PicShield Pro — single-file application.
 *
 * Module A (Privacy Shield): picks photos with EXIF intact, inventories and
 * strips all EXIF/GPS metadata by re-encoding the bitmap, and issues a
 * deletion receipt for every image.
 *
 * Module B (Market Pulse): live top-movers ticker. Tries the configured
 * market endpoint with a hard timeout, and falls back to a deterministic
 * on-device random-walk feed so the dashboard keeps ticking offline.
 *
 * Module C (Obsidian Sync Driver): writes Obsidian-compatible Markdown
 * (YAML frontmatter + wiki-links) into <documentDirectory>/PicShield-Vault/,
 * a folder the user points iCloud Drive / Google Drive / Syncthing at to
 * mirror into a PC vault:
 *   PicShield-Vault/Daily_Market_Logs/YYYY-MM-DD.md
 *   PicShield-Vault/Privacy_Audits/Image_Log.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type TabKey = 'privacy' | 'market' | 'vault';

interface StripReceipt {
  id: string;
  fileName: string;
  strippedAt: string;
  exifKeyCount: number;
  gpsKeys: string[];
  removedKeys: string[];
  originalBytes: number;
  cleanBytes: number;
  cleanUri: string;
}

interface TickerQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  changePct: number;
  volume: number;
}

interface VaultStatus {
  available: boolean;
  root: string;
  lastMarketExport: string | null;
  lastAuditExport: string | null;
  filesWritten: number;
}

// ---------------------------------------------------------------------------
// Module B — Market Pulse feed
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 4000;
/** Swap for a keyed provider (Polygon, Finnhub, EODHD) in production. */
const MARKET_ENDPOINT =
  'https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,TSLA,NVDA,MSFT,AMZN,META,NPN.JO,SHEL.L,BP.L,GLD';

interface SimAnchor {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  anchor: number;
  volume: number;
}

const SIM_ANCHORS: SimAnchor[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', anchor: 214.9, volume: 48_200_000 },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', currency: 'USD', anchor: 312.4, volume: 91_500_000 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', exchange: 'NASDAQ', currency: 'USD', anchor: 161.2, volume: 178_000_000 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', exchange: 'NASDAQ', currency: 'USD', anchor: 498.7, volume: 21_300_000 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', currency: 'USD', anchor: 223.1, volume: 39_800_000 },
  { symbol: 'META', name: 'Meta Platforms', exchange: 'NASDAQ', currency: 'USD', anchor: 719.5, volume: 12_600_000 },
  { symbol: 'NPN.JO', name: 'Naspers Ltd.', exchange: 'JSE', currency: 'ZAR', anchor: 4890.0, volume: 640_000 },
  { symbol: 'SHEL.L', name: 'Shell plc', exchange: 'LSE', currency: 'GBP', anchor: 26.4, volume: 7_900_000 },
  { symbol: 'BP.L', name: 'BP plc', exchange: 'LSE', currency: 'GBP', anchor: 3.86, volume: 31_200_000 },
  { symbol: 'GLD', name: 'SPDR Gold Shares', exchange: 'NYSE', currency: 'USD', anchor: 308.2, volume: 6_100_000 },
];

const simState: Map<string, number> = new Map(
  SIM_ANCHORS.map((a) => [a.symbol, a.anchor])
);

function simulateTick(): TickerQuote[] {
  return SIM_ANCHORS.map((anchor) => {
    const prev = simState.get(anchor.symbol) ?? anchor.anchor;
    const shock = (Math.random() * 2 - 1) * 0.004;
    const reversion = ((anchor.anchor - prev) / anchor.anchor) * 0.03;
    const price = Math.max(0.01, prev * (1 + shock + reversion));
    simState.set(anchor.symbol, price);
    return {
      symbol: anchor.symbol,
      name: anchor.name,
      exchange: anchor.exchange,
      currency: anchor.currency,
      price,
      changePct: ((price - anchor.anchor) / anchor.anchor) * 100,
      volume: Math.round(anchor.volume * (0.9 + Math.random() * 0.2)),
    };
  });
}

function parseRemotePayload(payload: unknown): TickerQuote[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const response = (payload as { quoteResponse?: { result?: unknown[] } })
    .quoteResponse;
  if (!response || !Array.isArray(response.result)) return null;
  const quotes: TickerQuote[] = [];
  for (const raw of response.result) {
    if (typeof raw !== 'object' || raw === null) continue;
    const q = raw as Record<string, unknown>;
    if (
      typeof q.symbol !== 'string' ||
      typeof q.regularMarketPrice !== 'number' ||
      typeof q.regularMarketChangePercent !== 'number'
    ) {
      continue;
    }
    quotes.push({
      symbol: q.symbol,
      name: typeof q.shortName === 'string' ? q.shortName : q.symbol,
      exchange:
        typeof q.fullExchangeName === 'string' ? q.fullExchangeName : '—',
      currency: typeof q.currency === 'string' ? q.currency : 'USD',
      price: q.regularMarketPrice,
      changePct: q.regularMarketChangePercent,
      volume:
        typeof q.regularMarketVolume === 'number' ? q.regularMarketVolume : 0,
    });
  }
  return quotes.length > 0 ? quotes : null;
}

/** Remote-first fetch with a hard timeout; falls back to the simulator. */
async function fetchTopMovers(): Promise<{
  quotes: TickerQuote[];
  source: 'live' | 'simulated';
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MARKET_ENDPOINT, { signal: controller.signal });
    if (res.ok) {
      const parsed = parseRemotePayload(await res.json());
      if (parsed !== null) {
        return { quotes: rankMovers(parsed), source: 'live' };
      }
    }
  } catch {
    // Timeout, offline, or malformed payload — fall through to the simulator.
  } finally {
    clearTimeout(timer);
  }
  return { quotes: rankMovers(simulateTick()), source: 'simulated' };
}

function rankMovers(quotes: TickerQuote[]): TickerQuote[] {
  return [...quotes].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)
  );
}

// ---------------------------------------------------------------------------
// Module C — Obsidian Sync Driver
// ---------------------------------------------------------------------------

const VAULT_DIR_NAME = 'PicShield-Vault';
const MARKET_LOG_DIR = 'Daily_Market_Logs';
const AUDIT_DIR = 'Privacy_Audits';
const AUDIT_FILE = 'Image_Log.md';

function vaultRoot(): string | null {
  const base = FileSystem.documentDirectory;
  if (base === null) return null;
  return `${base}${VAULT_DIR_NAME}/`;
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function ensureVaultScaffold(): Promise<string | null> {
  const root = vaultRoot();
  if (root === null) return null;
  await FileSystem.makeDirectoryAsync(`${root}${MARKET_LOG_DIR}`, {
    intermediates: true,
  });
  await FileSystem.makeDirectoryAsync(`${root}${AUDIT_DIR}`, {
    intermediates: true,
  });

  const indexPath = `${root}PicShield Vault.md`;
  const indexInfo = await FileSystem.getInfoAsync(indexPath);
  if (!indexInfo.exists) {
    const body = [
      '---',
      'type: vault-index',
      'app: PicShield Pro',
      `created: ${new Date().toISOString()}`,
      'tags: [picshield, index]',
      '---',
      '',
      '# PicShield Vault',
      '',
      'This folder is generated on-device by **PicShield Pro**.',
      '',
      '## Sync to your PC',
      '',
      '1. Point **iCloud Drive**, **Google Drive**, or **Syncthing** at this',
      '   app folder (`Files` app on iOS, app storage on Android).',
      '2. On the PC, open the mirrored `PicShield-Vault` folder as an',
      '   Obsidian vault (or place it inside an existing vault).',
      '3. New market logs land in `Daily_Market_Logs/`; privacy receipts in',
      '   `Privacy_Audits/`.',
      '',
      '## Structure',
      '',
      `- [[${AUDIT_DIR}/Image_Log|Privacy audit log]]`,
      `- Daily market notes: \`${MARKET_LOG_DIR}/YYYY-MM-DD.md\``,
      '',
    ].join('\n');
    await FileSystem.writeAsStringAsync(indexPath, body);
  }
  return root;
}

function marketLogMarkdown(
  quotes: TickerQuote[],
  source: 'live' | 'simulated',
  now: Date
): string {
  const date = isoDate(now);
  const lines: string[] = [
    '---',
    `date: ${date}`,
    'type: market-log',
    'app: PicShield Pro',
    `updated: ${now.toISOString()}`,
    `source: ${source}`,
    'tags: [picshield, market, top-movers]',
    '---',
    '',
    `# Market Pulse — ${date}`,
    '',
    `> Snapshot captured at ${now.toISOString()} · feed: **${source}**`,
    '',
    '| # | Symbol | Name | Exchange | Price | Change % | Volume |',
    '| --- | --- | --- | --- | ---: | ---: | ---: |',
  ];
  quotes.forEach((q, i) => {
    lines.push(
      `| ${i + 1} | ${q.symbol} | ${q.name} | ${q.exchange} | ` +
        `${q.currency} ${q.price.toFixed(2)} | ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}% | ` +
        `${q.volume.toLocaleString('en-US')} |`
    );
  });
  lines.push(
    '',
    `Top mover: **${quotes[0]?.symbol ?? 'n/a'}** ` +
      `(${quotes[0] ? `${quotes[0].changePct >= 0 ? '+' : ''}${quotes[0].changePct.toFixed(2)}%` : '—'}).`,
    '',
    `Related: [[${AUDIT_DIR}/Image_Log|Privacy audit log]]`,
    ''
  );
  return lines.join('\n');
}

async function writeDailyMarketLog(
  quotes: TickerQuote[],
  source: 'live' | 'simulated'
): Promise<string | null> {
  const root = await ensureVaultScaffold();
  if (root === null || quotes.length === 0) return null;
  const now = new Date();
  const path = `${root}${MARKET_LOG_DIR}/${isoDate(now)}.md`;
  // Atomic replace: write a temp file, then rename over the target so a
  // cloud-sync client on the PC never reads a half-written note.
  const tmpPath = `${path}.tmp`;
  await FileSystem.writeAsStringAsync(tmpPath, marketLogMarkdown(quotes, source, now));
  await FileSystem.moveAsync({ from: tmpPath, to: path });
  return path;
}

function receiptMarkdown(receipt: StripReceipt): string {
  const date = receipt.strippedAt.slice(0, 10);
  const gps =
    receipt.gpsKeys.length > 0
      ? `⚠️ GPS present (${receipt.gpsKeys.join(', ')}) — removed`
      : 'No GPS tags found';
  return [
    '',
    `## ${receipt.strippedAt} — ${receipt.fileName}`,
    '',
    `- Receipt ID: \`${receipt.id}\``,
    `- EXIF keys removed: **${receipt.exifKeyCount}**`,
    `- GPS: ${gps}`,
    `- Size: ${receipt.originalBytes.toLocaleString('en-US')} B → ` +
      `${receipt.cleanBytes.toLocaleString('en-US')} B`,
    `- Removed keys: ${
      receipt.removedKeys.length > 0
        ? receipt.removedKeys.map((k) => `\`${k}\``).join(', ')
        : '_none present_'
    }`,
    `- Market context: [[../${MARKET_LOG_DIR}/${date}|${date} market log]]`,
    '',
  ].join('\n');
}

async function appendImageAuditLog(
  receipt: StripReceipt
): Promise<string | null> {
  const root = await ensureVaultScaffold();
  if (root === null) return null;
  const path = `${root}${AUDIT_DIR}/${AUDIT_FILE}`;
  const info = await FileSystem.getInfoAsync(path);
  let existing = '';
  if (info.exists) {
    existing = await FileSystem.readAsStringAsync(path);
  } else {
    existing = [
      '---',
      'type: privacy-audit',
      'app: PicShield Pro',
      `created: ${new Date().toISOString()}`,
      'tags: [picshield, privacy, exif]',
      '---',
      '',
      '# Image Privacy Audit Log',
      '',
      'Every entry below is a deletion receipt for metadata stripped',
      'on-device. Original files are never uploaded anywhere.',
      '',
    ].join('\n');
  }
  const tmpPath = `${path}.tmp`;
  await FileSystem.writeAsStringAsync(tmpPath, existing + receiptMarkdown(receipt));
  await FileSystem.moveAsync({ from: tmpPath, to: path });
  return path;
}

// ---------------------------------------------------------------------------
// Module A — Privacy Shield
// ---------------------------------------------------------------------------

let receiptCounter = 0;
function nextReceiptId(): string {
  receiptCounter += 1;
  return `ps-${Date.now().toString(36)}-${receiptCounter}`;
}

async function safeSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Pick one image, inventory its EXIF, and strip it by re-encoding the pixel
 * data with expo-image-manipulator (re-encode emits a fresh JPEG container
 * with no APP1/EXIF segment — HEIC and WebP inputs are transcoded too).
 */
async function pickAndStripPhoto(): Promise<StripReceipt | 'cancelled'> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      'Photo library permission denied — enable it in system settings.'
    );
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    exif: true,
    quality: 1,
    allowsMultipleSelection: false,
  });
  if (picked.canceled || picked.assets.length === 0) return 'cancelled';

  const asset = picked.assets[0];
  const exif: Record<string, unknown> = asset.exif ?? {};
  const removedKeys = Object.keys(exif).filter(
    (key) => exif[key] !== null && exif[key] !== undefined
  );
  const gpsKeys = removedKeys.filter((key) =>
    key.toLowerCase().startsWith('gps')
  );

  const originalBytes = await safeSize(asset.uri);

  // Re-encode: pixel data in, brand-new container out. No EXIF survives.
  const clean = await ImageManipulator.manipulateAsync(asset.uri, [], {
    compress: 0.95,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const cleanBytes = await safeSize(clean.uri);

  return {
    id: nextReceiptId(),
    fileName: asset.fileName ?? asset.uri.split('/').pop() ?? 'photo.jpg',
    strippedAt: new Date().toISOString(),
    exifKeyCount: removedKeys.length,
    gpsKeys,
    removedKeys,
    originalBytes,
    cleanBytes,
    cleanUri: clean.uri,
  };
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const C = {
  bg: '#0A0F1C',
  surface: '#121A2C',
  raised: '#1B2740',
  border: '#26334D',
  text: '#EAF0FA',
  muted: '#8FA0BC',
  faint: '#5C6C8A',
  primary: '#4F8CFF',
  green: '#2FD483',
  red: '#FF5D73',
  amber: '#FFB020',
  violet: '#9B7BFF',
} as const;

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

export default function App(): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('privacy');
  const { width } = useWindowDimensions();
  const wide = width >= 720;

  const [receipts, setReceipts] = useState<StripReceipt[]>([]);
  const [stripBusy, setStripBusy] = useState(false);
  const [stripError, setStripError] = useState('');

  const [quotes, setQuotes] = useState<TickerQuote[]>([]);
  const [feedSource, setFeedSource] = useState<'live' | 'simulated'>(
    'simulated'
  );
  const [lastTickAt, setLastTickAt] = useState<string>('');

  const [autoSync, setAutoSync] = useState(true);
  const [vault, setVault] = useState<VaultStatus>({
    available: vaultRoot() !== null,
    root: vaultRoot() ?? 'unavailable on this platform (web)',
    lastMarketExport: null,
    lastAuditExport: null,
    filesWritten: 0,
  });

  const tickCount = useRef(0);
  const busyFetching = useRef(false);
  const mounted = useRef(true);

  const noteExport = useCallback(
    (kind: 'market' | 'audit', path: string | null) => {
      if (path === null) return;
      setVault((prev) => ({
        ...prev,
        lastMarketExport:
          kind === 'market' ? new Date().toISOString() : prev.lastMarketExport,
        lastAuditExport:
          kind === 'audit' ? new Date().toISOString() : prev.lastAuditExport,
        filesWritten: prev.filesWritten + 1,
      }));
    },
    []
  );

  // Market polling loop + throttled auto-export (every 6th tick ≈ 30s).
  useEffect(() => {
    mounted.current = true;
    const tick = async () => {
      if (busyFetching.current) return;
      busyFetching.current = true;
      try {
        const { quotes: next, source } = await fetchTopMovers();
        if (!mounted.current) return;
        setQuotes(next);
        setFeedSource(source);
        setLastTickAt(new Date().toLocaleTimeString());
        tickCount.current += 1;
        if (autoSync && tickCount.current % 6 === 1) {
          const path = await writeDailyMarketLog(next, source);
          if (mounted.current) noteExport('market', path);
        }
      } finally {
        busyFetching.current = false;
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [autoSync, noteExport]);

  const handleStrip = useCallback(async () => {
    setStripBusy(true);
    setStripError('');
    try {
      const receipt = await pickAndStripPhoto();
      if (receipt === 'cancelled') return;
      setReceipts((prev) => [receipt, ...prev]);
      const path = await appendImageAuditLog(receipt);
      noteExport('audit', path);
    } catch (error) {
      setStripError(error instanceof Error ? error.message : String(error));
    } finally {
      setStripBusy(false);
    }
  }, [noteExport]);

  const handleExportNow = useCallback(async () => {
    const path = await writeDailyMarketLog(quotes, feedSource);
    noteExport('market', path);
  }, [quotes, feedSource, noteExport]);

  const totalGpsBlocked = useMemo(
    () => receipts.filter((r) => r.gpsKeys.length > 0).length,
    [receipts]
  );
  const totalKeysRemoved = useMemo(
    () => receipts.reduce((sum, r) => sum + r.exifKeyCount, 0),
    [receipts]
  );

  return (
    <View style={s.app}>
      <StatusBar style="light" />
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.title}>PicShield Pro</Text>
          <Text style={s.subtitle}>
            Privacy shield · Market pulse · Obsidian sync
          </Text>
        </View>
        <View
          style={[
            s.feedBadge,
            { borderColor: feedSource === 'live' ? C.green : C.amber },
          ]}
        >
          <Text
            style={[
              s.feedBadgeText,
              { color: feedSource === 'live' ? C.green : C.amber },
            ]}
          >
            {feedSource === 'live' ? '● LIVE FEED' : '● SIM FEED'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={[s.bodyContent, wide && s.bodyContentWide]}
      >
        {tab === 'privacy' ? (
          <PrivacyTab
            receipts={receipts}
            busy={stripBusy}
            error={stripError}
            gpsBlocked={totalGpsBlocked}
            keysRemoved={totalKeysRemoved}
            onStrip={handleStrip}
          />
        ) : tab === 'market' ? (
          <MarketTab
            quotes={quotes}
            source={feedSource}
            lastTickAt={lastTickAt}
            wide={wide}
            onExport={handleExportNow}
          />
        ) : (
          <VaultTab
            vault={vault}
            autoSync={autoSync}
            onToggleAutoSync={() => setAutoSync((v) => !v)}
          />
        )}
      </ScrollView>

      <View style={s.tabBar}>
        {(
          [
            ['privacy', '🛡️', 'Privacy'],
            ['market', '📈', 'Market'],
            ['vault', '🗂️', 'Vault'],
          ] as Array<[TabKey, string, string]>
        ).map(([key, icon, label]) => (
          <Pressable
            key={key}
            style={[s.tabItem, tab === key && s.tabItemActive]}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={s.tabIcon}>{icon}</Text>
            <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab views
// ---------------------------------------------------------------------------

function PrivacyTab(props: {
  receipts: StripReceipt[];
  busy: boolean;
  error: string;
  gpsBlocked: number;
  keysRemoved: number;
  onStrip: () => void;
}): React.ReactElement {
  const { receipts, busy, error, gpsBlocked, keysRemoved, onStrip } = props;
  return (
    <View style={s.stack}>
      <View style={s.statRow}>
        <Stat label="Photos cleaned" value={String(receipts.length)} />
        <Stat label="GPS tags blocked" value={String(gpsBlocked)} tone={C.red} />
        <Stat label="EXIF keys removed" value={String(keysRemoved)} tone={C.violet} />
      </View>

      <Pressable
        style={[s.primaryButton, busy && s.primaryButtonDisabled]}
        onPress={onStrip}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={s.primaryButtonText}>Pick photo & strip metadata</Text>
        )}
      </Pressable>

      {error !== '' ? <Text style={s.error}>{error}</Text> : null}

      {receipts.length === 0 ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>How it works</Text>
          <Text style={s.cardBody}>
            Pick any photo. PicShield reads its EXIF block (camera model,
            timestamps, GPS coordinates), re-encodes the pixels into a fresh
            JPEG container with zero metadata, and writes a deletion receipt
            to your Obsidian vault. HEIC and WebP inputs are transcoded, so
            their metadata is destroyed as well. Nothing leaves the device.
          </Text>
        </View>
      ) : (
        receipts.map((r) => (
          <View key={r.id} style={s.card}>
            <View style={s.cardHeaderRow}>
              <Text style={s.cardTitle} numberOfLines={1}>
                {r.fileName}
              </Text>
              <Text
                style={[
                  s.pill,
                  r.gpsKeys.length > 0 ? s.pillDanger : s.pillSafe,
                ]}
              >
                {r.gpsKeys.length > 0 ? 'GPS REMOVED' : 'NO GPS'}
              </Text>
            </View>
            <Text style={s.cardMeta}>
              {r.strippedAt.replace('T', ' ').slice(0, 19)} · receipt {r.id}
            </Text>
            <Text style={s.cardBody}>
              {r.exifKeyCount} metadata keys destroyed ·{' '}
              {r.originalBytes.toLocaleString('en-US')} B →{' '}
              {r.cleanBytes.toLocaleString('en-US')} B
            </Text>
            {r.removedKeys.length > 0 ? (
              <Text style={s.cardKeys} numberOfLines={3}>
                {r.removedKeys.join(' · ')}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function MarketTab(props: {
  quotes: TickerQuote[];
  source: 'live' | 'simulated';
  lastTickAt: string;
  wide: boolean;
  onExport: () => void;
}): React.ReactElement {
  const { quotes, source, lastTickAt, wide, onExport } = props;
  return (
    <View style={s.stack}>
      <View style={s.rowBetween}>
        <Text style={s.sectionTitle}>Top movers</Text>
        <Text style={s.sectionMeta}>
          {source === 'live' ? 'exchange feed' : 'on-device sim'} ·{' '}
          {lastTickAt !== '' ? `tick ${lastTickAt}` : 'starting…'} · 5s poll
        </Text>
      </View>

      <View style={[s.grid, wide && s.gridWide]}>
        {quotes.map((q) => {
          const up = q.changePct >= 0;
          return (
            <View key={q.symbol} style={s.quoteCell}>
              <View style={s.rowBetween}>
                <Text style={s.quoteSymbol}>{q.symbol}</Text>
                <Text style={s.quoteExchange}>{q.exchange}</Text>
              </View>
              <Text style={s.quoteName} numberOfLines={1}>
                {q.name}
              </Text>
              <Text style={s.quotePrice}>
                {q.currency} {q.price.toFixed(2)}
              </Text>
              <Text style={[s.quoteChange, { color: up ? C.green : C.red }]}>
                {up ? '▲' : '▼'} {up ? '+' : ''}
                {q.changePct.toFixed(2)}% · vol{' '}
                {Intl.NumberFormat('en-US', { notation: 'compact' }).format(
                  q.volume
                )}
              </Text>
            </View>
          );
        })}
      </View>

      <Pressable style={s.secondaryButton} onPress={onExport}>
        <Text style={s.secondaryButtonText}>
          Export snapshot to Daily_Market_Logs now
        </Text>
      </Pressable>
    </View>
  );
}

function VaultTab(props: {
  vault: VaultStatus;
  autoSync: boolean;
  onToggleAutoSync: () => void;
}): React.ReactElement {
  const { vault, autoSync, onToggleAutoSync } = props;
  return (
    <View style={s.stack}>
      <View style={s.card}>
        <Text style={s.cardTitle}>Obsidian Sync Driver</Text>
        <Text style={s.cardBody}>
          Markdown notes are written to the app-sandboxed folder below.
          Mirror it to your PC with iCloud Drive, Google Drive, or Syncthing
          and open it as an Obsidian vault — frontmatter, tables, and
          wiki-links render natively.
        </Text>
        <Text style={s.mono} numberOfLines={3}>
          {vault.root}
        </Text>
        {Platform.OS === 'web' ? (
          <Text style={s.error}>
            File-system export is unavailable in the browser preview; run the
            iOS/Android build for vault sync.
          </Text>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Folder map</Text>
        <Text style={s.mono}>
          {`PicShield-Vault/\n├── PicShield Vault.md\n├── ${MARKET_LOG_DIR}/\n│   └── YYYY-MM-DD.md\n└── ${AUDIT_DIR}/\n    └── ${AUDIT_FILE}`}
        </Text>
      </View>

      <View style={s.statRow}>
        <Stat label="Files written" value={String(vault.filesWritten)} />
        <Stat
          label="Last market export"
          value={
            vault.lastMarketExport !== null
              ? vault.lastMarketExport.slice(11, 19)
              : '—'
          }
        />
        <Stat
          label="Last audit export"
          value={
            vault.lastAuditExport !== null
              ? vault.lastAuditExport.slice(11, 19)
              : '—'
          }
        />
      </View>

      <Pressable style={s.secondaryButton} onPress={onToggleAutoSync}>
        <Text style={s.secondaryButtonText}>
          Auto-sync market snapshots: {autoSync ? 'ON (every ~30s)' : 'OFF'}
        </Text>
      </Pressable>
    </View>
  );
}

function Stat(props: {
  label: string;
  value: string;
  tone?: string;
}): React.ReactElement {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, props.tone ? { color: props.tone } : null]}>
        {props.value}
      </Text>
      <Text style={s.statLabel}>{props.label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.select({ ios: 56, android: 40, default: 20 }),
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerText: { flexShrink: 1 },
  title: { color: C.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: C.faint, fontSize: 12, marginTop: 2 },
  feedBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  feedBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12, paddingBottom: 32 },
  bodyContentWide: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  stack: { gap: 12 },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  statValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  primaryButton: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    borderColor: C.primary,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: C.primary, fontSize: 14, fontWeight: '700' },
  error: { color: C.red, fontSize: 13 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  cardMeta: { color: C.faint, fontSize: 11 },
  cardBody: { color: C.muted, fontSize: 13, lineHeight: 19 },
  cardKeys: { color: C.faint, fontSize: 11, lineHeight: 16 },
  pill: {
    fontSize: 10,
    fontWeight: '900',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pillDanger: { color: C.red, backgroundColor: 'rgba(255,93,115,0.15)' },
  pillSafe: { color: C.green, backgroundColor: 'rgba(47,212,131,0.15)' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  sectionMeta: { color: C.faint, fontSize: 11, flexShrink: 1 },
  grid: { gap: 10 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  quoteCell: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    gap: 3,
    flexGrow: 1,
    flexBasis: 220,
  },
  quoteSymbol: { color: C.text, fontSize: 14, fontWeight: '900' },
  quoteExchange: { color: C.faint, fontSize: 10, fontWeight: '700' },
  quoteName: { color: C.muted, fontSize: 12 },
  quotePrice: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  quoteChange: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  mono: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingBottom: Platform.select({ ios: 22, default: 8 }),
    paddingTop: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  tabItemActive: {},
  tabIcon: { fontSize: 18 },
  tabLabel: { color: C.faint, fontSize: 11, fontWeight: '700' },
  tabLabelActive: { color: C.primary },
});
