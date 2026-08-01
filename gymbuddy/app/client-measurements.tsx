import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getClientMeasurements } from '../lib/supabase'
import type { BodyMeasurement } from '../lib/supabase'

const GOLD = '#f0b429'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Widok trenera: pomiary podopiecznego (tylko odczyt, dostep pilnuje RLS —
// bez zgody w measurement_shares zapytania wracaja puste). Zloty motyw jak
// plany od trenera. Zdjec sylwetki tu celowo NIE ma — zawsze prywatne.
export default function ClientMeasurementsScreen() {
  const { t } = useTranslation()
  const params = useLocalSearchParams()
  const clientId = params.clientId as string
  const clientName = (params.clientName as string) ?? ''

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<BodyMeasurement[]>([])
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [chartPart, setChartPart] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { rows: r, goals: g } = await getClientMeasurements(clientId)
      setRows(r)
      setGoals(g)
    } finally { setLoading(false) }
  }

  const unit = (part: string) => (part === 'weight' ? 'kg' : 'cm')
  const label = (part: string) => {
    if (part.endsWith('_l')) return t('body.' + part.slice(0, -2)) + ' ' + t('body.sideL')
    if (part.endsWith('_r')) return t('body.' + part.slice(0, -2)) + ' ' + t('body.sideR')
    return t('body.' + part)
  }

  function historyOf(part: string): BodyMeasurement[] {
    return rows.filter(r => r.part === part)
  }

  // Partie z jakimkolwiek pomiarem, najnowszy na wierzchu
  const parts = [...new Set(rows.map(r => r.part))]
  const activePart = chartPart && parts.includes(chartPart) ? chartPart : parts.find(p => historyOf(p).length >= 2) ?? parts[0]
  const chartData = activePart ? historyOf(activePart).slice(0, 15).reverse() : []

  function chartPoints(): string {
    if (chartData.length < 2) return ''
    const vals = chartData.map(d => d.value)
    const min = Math.min(...vals), max = Math.max(...vals)
    const span = max - min || 1
    return chartData.map((d, i) => {
      const x = (i / (chartData.length - 1)) * 100
      const y = 36 - ((d.value - min) / span) * 32
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={GOLD} /></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('body.clientMeasurements')}</Text>
          <Text style={styles.headerSub}>{clientName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color="rgba(255,255,255,0.25)" />
          <Text style={styles.emptyHint}>{t('body.clientNoData')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30, paddingHorizontal: 16 }}>
          {/* Najnowsze wartosci: zlote chipy z trendem */}
          <View style={styles.goldCard}>
            <View style={styles.goldCardHeader}>
              <Text style={styles.goldCardTitle}>{t('body.clientLatest')}</Text>
              <Ionicons name="body-outline" size={18} color={GOLD} />
            </View>
            <View style={styles.chipsWrap}>
              {parts.map(p => {
                const h = historyOf(p)
                const trend = h.length >= 2 ? h[0].value - h[1].value : 0
                return (
                  <TouchableOpacity key={p} style={[styles.chip, activePart === p && styles.chipActive]} onPress={() => setChartPart(p)}>
                    <Text style={styles.chipText}>
                      {label(p)} {h[0].value} {unit(p)}
                      {trend !== 0 ? <Text style={{ color: trend > 0 ? LIME : '#ff8a94' }}> {trend > 0 ? '▲' : '▼'}</Text> : null}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Wykres wybranej partii */}
          {activePart && chartData.length >= 2 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>{label(activePart)}</Text>
              <Svg viewBox="0 0 100 40" style={{ width: '100%', height: 120 }}>
                <Polyline points={chartPoints()} fill="none" stroke={GOLD} strokeWidth="1.5" />
                {chartData.map((d, i) => {
                  const vals = chartData.map(x => x.value)
                  const min = Math.min(...vals), max = Math.max(...vals)
                  const span = max - min || 1
                  const x = (i / (chartData.length - 1)) * 100
                  const y = 36 - ((d.value - min) / span) * 32
                  return <Circle key={d.id} cx={x} cy={y} r="1.6" fill={GOLD} />
                })}
              </Svg>
              <View style={styles.chartMeta}>
                <Text style={styles.chartMetaText}>
                  {new Date(chartData[0].measured_on + 'T12:00:00').toLocaleDateString()} · {chartData[0].value} {unit(activePart)}
                </Text>
                <Text style={[styles.chartMetaText, { color: GOLD, fontWeight: '800' }]}>
                  {chartData[chartData.length - 1].value} {unit(activePart)}
                  {goals[activePart] != null ? `  ·  ${t('body.goal')}: ${goals[activePart]}` : ''}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.privacyNote}>
            <Ionicons name="shield-checkmark-outline" size={12} color="rgba(255,255,255,0.4)" /> {t('body.clientConsentNote')}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: GOLD },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  emptyHint: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 },
  goldCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(240,180,41,0.5)' },
  goldCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  goldCardTitle: { fontSize: 12, fontWeight: '800', color: GOLD, textTransform: 'uppercase', letterSpacing: 0.6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { backgroundColor: BG, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipActive: { borderColor: GOLD },
  chipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  chartCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(240,180,41,0.25)', marginTop: 12 },
  chartTitle: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.55)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  chartMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chartMetaText: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)' },
  privacyNote: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 14 },
})
