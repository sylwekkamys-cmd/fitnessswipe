import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import Svg, { Path, Circle, Polyline } from 'react-native-svg'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getBodyMeasurements, saveBodyMeasurement, getBodyGoals, setBodyGoal } from '../lib/supabase'
import type { BodyMeasurement } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Partie ciala: strona i pozycja dymka wzgledem manekina
const PARTS: { key: string; side: 'left' | 'right'; top: number }[] = [
  { key: 'neck', side: 'right', top: 4 },
  { key: 'shoulders', side: 'left', top: 12 },
  { key: 'chest', side: 'left', top: 27 },
  { key: 'biceps', side: 'right', top: 23 },
  { key: 'waist', side: 'left', top: 44 },
  { key: 'hips', side: 'right', top: 42 },
  { key: 'forearm', side: 'right', top: 60 },
  { key: 'thigh', side: 'left', top: 62 },
  { key: 'calf', side: 'right', top: 79 },
]
const ALL_PARTS = [...PARTS.map(p => p.key), 'weight']

export default function BodyScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [rows, setRows] = useState<BodyMeasurement[]>([])
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'body' | 'progress'>('body')
  const [editPart, setEditPart] = useState<string | null>(null)
  const [valueInput, setValueInput] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [chartPart, setChartPart] = useState('biceps')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setProfileId(me.id)
      const [m, g] = await Promise.all([getBodyMeasurements(me.id), getBodyGoals(me.id)])
      setRows(m)
      setGoals(g)
    } finally { setLoading(false) }
  }

  const unit = (part: string) => (part === 'weight' ? 'kg' : 'cm')

  // Najnowszy i poprzedni pomiar danej partii (rows sa posortowane malejaco po dacie)
  function latestOf(part: string): BodyMeasurement | undefined {
    return rows.find(r => r.part === part)
  }
  function historyOf(part: string): BodyMeasurement[] {
    return rows.filter(r => r.part === part)
  }
  function trendOf(part: string): number | null {
    const h = historyOf(part)
    if (h.length < 2) return null
    return h[0].value - h[1].value
  }

  function openEdit(part: string) {
    setEditPart(part)
    setValueInput(latestOf(part) ? String(latestOf(part)!.value) : '')
    setGoalInput(goals[part] != null ? String(goals[part]) : '')
  }

  async function handleSave() {
    if (!profileId || !editPart || saving) return
    const val = parseFloat(valueInput.replace(',', '.'))
    if (!val || val <= 0 || val > 500) { Alert.alert(t('common.error'), t('body.invalidValue')); return }
    setSaving(true)
    try {
      await saveBodyMeasurement(profileId, editPart, val)
      const goal = parseFloat(goalInput.replace(',', '.'))
      await setBodyGoal(profileId, editPart, goalInput.trim() === '' ? null : (goal > 0 ? goal : null))
      setEditPart(null)
      await load()
    } finally { setSaving(false) }
  }

  // Dymek pomiaru przy manekinie
  function bubble(part: string) {
    const m = latestOf(part)
    const hasGoal = goals[part] != null
    const trend = trendOf(part)
    return (
      <TouchableOpacity key={part} style={[styles.bubble, hasGoal && styles.bubbleGoal]} onPress={() => openEdit(part)}>
        <Text style={styles.bubbleLabel}>{t('body.' + part)}</Text>
        {m ? (
          <Text style={styles.bubbleValue}>
            {m.value} <Text style={styles.bubbleUnit}>{unit(part)}</Text>
            {hasGoal ? <Text style={styles.bubbleTarget}> / {goals[part]}</Text> : null}
            {trend !== null && trend !== 0 ? (
              <Text style={{ color: trend > 0 ? LIME : '#ff8a94', fontSize: 10 }}> {trend > 0 ? '▲' : '▼'}</Text>
            ) : null}
          </Text>
        ) : (
          <Text style={styles.bubbleEmpty}>+ {t('body.add')}</Text>
        )}
      </TouchableOpacity>
    )
  }

  // Sesje do dzienniczka: grupowanie po dacie
  const sessions: { date: string; items: BodyMeasurement[] }[] = []
  for (const r of rows) {
    const s = sessions.find(x => x.date === r.measured_on)
    if (s) s.items.push(r)
    else sessions.push({ date: r.measured_on, items: [r] })
  }

  // Postepy: partie z >= 2 pomiarami
  const progressParts = ALL_PARTS.filter(p => historyOf(p).length >= 2)
  const chartData = historyOf(progressParts.includes(chartPart) ? chartPart : (progressParts[0] ?? ''))
    .slice(0, 15).reverse()

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

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  const activeChartPart = progressParts.includes(chartPart) ? chartPart : progressParts[0]

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('body.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Zakladki: Sylwetka | Postepy */}
      <View style={styles.tabsRow}>
        {(['body', 'progress'] as const).map(tb => (
          <TouchableOpacity key={tb} style={[styles.tab, tab === tb && styles.tabActive]} onPress={() => setTab(tb)}>
            <Text style={[styles.tabText, tab === tb && styles.tabTextActive]}>
              {tb === 'body' ? t('body.tabBody') : t('body.tabProgress')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {tab === 'body' ? (
          <>
            {/* Manekin z dymkami */}
            <View style={styles.mannequinWrap}>
              <Svg viewBox="0 0 100 150" style={styles.mannequin}>
                <Circle cx="50" cy="14" r="9" fill="#2e415c" />
                <Path
                  d="M50 24 C36 26 32 34 31 44 L28 74 C28 80 33 82 35 78 L40 58 L40 92 L35 128 C34 136 42 138 44 131 L50 100 L56 131 C58 138 66 136 65 128 L60 92 L60 58 L65 78 C67 82 72 80 72 74 L69 44 C68 34 64 26 50 24 Z"
                  fill="#2e415c"
                />
              </Svg>
              {PARTS.map(p => (
                <View key={p.key} style={[styles.bubbleAnchor, { top: `${p.top}%` }, p.side === 'left' ? { left: 0 } : { right: 0 }]}>
                  {bubble(p.key)}
                </View>
              ))}
            </View>

            {/* Waga */}
            <View style={{ paddingHorizontal: 16 }}>
              <TouchableOpacity style={[styles.weightBar, goals['weight'] != null && styles.bubbleGoal]} onPress={() => openEdit('weight')}>
                <Text style={{ fontSize: 16 }}>⚖️</Text>
                <Text style={styles.weightText}>
                  {latestOf('weight') ? `${latestOf('weight')!.value} kg` : t('body.addWeight')}
                  {goals['weight'] != null ? <Text style={styles.bubbleTarget}>  /  {goals['weight']} kg</Text> : null}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
              {rows.length === 0 && <Text style={styles.emptyHint}>{t('body.emptyHint')}</Text>}
            </View>

            {/* Dzienniczek sesji */}
            {sessions.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
                <Text style={styles.journalTitle}>{t('body.journal')}</Text>
                {sessions.slice(0, 10).map(s => (
                  <View key={s.date} style={styles.sessionCard}>
                    <View style={styles.sessionTop}>
                      <Text style={styles.sessionDate}>{new Date(s.date + 'T12:00:00').toLocaleDateString()}</Text>
                      <Text style={styles.sessionCount}>{t('body.sessionCount', { count: s.items.length })}</Text>
                    </View>
                    <Text style={styles.sessionSummary} numberOfLines={2}>
                      {s.items.map(i => `${t('body.' + i.part)} ${i.value}`).join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {progressParts.length === 0 ? (
              <Text style={styles.emptyHint}>{t('body.progressEmpty')}</Text>
            ) : (
              <>
                {/* Chipy zmian od pierwszego pomiaru */}
                <View style={styles.diffRow}>
                  {progressParts.map(p => {
                    const h = historyOf(p)
                    const diff = h[0].value - h[h.length - 1].value
                    const goal = goals[p]
                    // Zielony = ruch w strone celu (albo dowolna zmiana, gdy celu brak)
                    const good = goal != null
                      ? Math.abs(h[0].value - goal) < Math.abs(h[h.length - 1].value - goal)
                      : diff !== 0
                    const sign = diff > 0 ? '+' : ''
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.diffChip, good && diff !== 0 && styles.diffChipGood, activeChartPart === p && styles.diffChipActive]}
                        onPress={() => setChartPart(p)}
                      >
                        <Text style={[styles.diffChipText, good && diff !== 0 && { color: LIME }]}>
                          {t('body.' + p)} {sign}{diff.toFixed(1).replace('.0', '')} {unit(p)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                {/* Wykres wybranej partii */}
                {activeChartPart && chartData.length >= 2 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>
                      {t('body.' + activeChartPart)} — {t('body.sinceFirst')}
                    </Text>
                    <Svg viewBox="0 0 100 40" style={{ width: '100%', height: 120 }}>
                      <Polyline points={chartPoints()} fill="none" stroke={LIME} strokeWidth="1.5" />
                      {chartData.map((d, i) => {
                        const vals = chartData.map(x => x.value)
                        const min = Math.min(...vals), max = Math.max(...vals)
                        const span = max - min || 1
                        const x = (i / (chartData.length - 1)) * 100
                        const y = 36 - ((d.value - min) / span) * 32
                        return <Circle key={d.id} cx={x} cy={y} r="1.6" fill={LIME} />
                      })}
                    </Svg>
                    <View style={styles.chartMeta}>
                      <Text style={styles.chartMetaText}>{chartData[0].value} {unit(activeChartPart)}</Text>
                      <Text style={[styles.chartMetaText, { color: LIME, fontWeight: '800' }]}>
                        {chartData[chartData.length - 1].value} {unit(activeChartPart)}
                        {goals[activeChartPart] != null ? `  ·  ${t('body.goal')}: ${goals[activeChartPart]}` : ''}
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal edycji partii */}
      <Modal visible={!!editPart} transparent animationType="slide" onRequestClose={() => setEditPart(null)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editPart ? t('body.' + editPart) : ''}</Text>

            <Text style={styles.sheetLabel}>{t('body.todayValue')} ({editPart ? unit(editPart) : ''})</Text>
            <TextInput
              style={styles.sheetInput}
              value={valueInput}
              onChangeText={setValueInput}
              keyboardType="decimal-pad"
              placeholder={editPart === 'weight' ? '82,5' : '38'}
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoFocus
            />

            <Text style={styles.sheetLabel}>{t('body.goal')} ({editPart ? unit(editPart) : ''}) — {t('body.goalOptional')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="rgba(255,255,255,0.25)"
            />

            {editPart && historyOf(editPart).length > 0 && (
              <View style={styles.historyBox}>
                {historyOf(editPart).slice(0, 5).map(h => (
                  <View key={h.id} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{new Date(h.measured_on + 'T12:00:00').toLocaleDateString()}</Text>
                    <Text style={styles.historyValue}>{h.value} {unit(h.part)}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.sheetSaveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={BG} /> : <Text style={styles.sheetSaveText}>{t('common.save')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setEditPart(null)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 9, alignItems: 'center', backgroundColor: BG_LIGHT },
  tabActive: { backgroundColor: LIME },
  tabText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  tabTextActive: { color: BG },
  mannequinWrap: { height: 380, marginHorizontal: 16, position: 'relative', justifyContent: 'center' },
  mannequin: { width: '46%', height: '100%', alignSelf: 'center' },
  bubbleAnchor: { position: 'absolute', maxWidth: '32%' },
  bubble: { backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  bubbleGoal: { borderColor: 'rgba(148,227,54,0.6)' },
  bubbleLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 },
  bubbleValue: { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 1 },
  bubbleUnit: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  bubbleTarget: { fontSize: 10, fontWeight: '700', color: LIME },
  bubbleEmpty: { fontSize: 11, fontWeight: '700', color: LIME, marginTop: 2 },
  weightBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  weightText: { flex: 1, fontSize: 15, fontWeight: '800', color: '#fff' },
  emptyHint: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 16, lineHeight: 20, paddingHorizontal: 20 },
  journalTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  sessionCard: { backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sessionDate: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sessionCount: { fontSize: 11.5, fontWeight: '700', color: LIME },
  sessionSummary: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', lineHeight: 17 },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  diffChip: { backgroundColor: BG_LIGHT, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  diffChipGood: { backgroundColor: 'rgba(148,227,54,0.12)', borderColor: 'rgba(148,227,54,0.4)' },
  diffChipActive: { borderColor: LIME },
  diffChipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  chartCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chartTitle: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.55)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  chartMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chartMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 12 },
  sheetLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 8 },
  sheetInput: { backgroundColor: BG, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: '#fff' },
  historyBox: { backgroundColor: BG, borderRadius: 12, padding: 10, marginTop: 12 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  historyDate: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  historyValue: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  sheetSaveBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  sheetSaveText: { color: BG, fontSize: 15, fontWeight: '800' },
})
