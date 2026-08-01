import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Image, PanResponder, Switch } from 'react-native'
import Svg, { Path, Circle, Polyline } from 'react-native-svg'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  supabase, getMyProfile, getBodyMeasurements, saveBodyMeasurement, getBodyGoals, setBodyGoal,
  getBodyPhotos, addBodyPhoto, deleteBodyPhoto, signBodyPhotoUrls,
  getMeasurementShares, setMeasurementShare, PAIRED_PARTS,
} from '../lib/supabase'
import type { BodyMeasurement, BodyPhoto } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BLUE = '#4fc3f7'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const REMINDER_STORAGE_KEY = 'body_reminder_notif_id'
const STALE_AFTER_DAYS = 14

// Partie ciala: strona i pozycja dymka wzgledem manekina.
// paired = mierzone osobno dla lewej/prawej strony (klucze z sufiksem _l/_r)
const PARTS: { key: string; side: 'left' | 'right'; top: number; paired?: boolean }[] = [
  { key: 'neck', side: 'right', top: 4 },
  { key: 'shoulders', side: 'left', top: 12 },
  { key: 'chest', side: 'left', top: 27 },
  { key: 'biceps', side: 'right', top: 23, paired: true },
  { key: 'waist', side: 'left', top: 44 },
  { key: 'hips', side: 'right', top: 42 },
  { key: 'forearm', side: 'right', top: 60, paired: true },
  { key: 'thigh', side: 'left', top: 62, paired: true },
  { key: 'calf', side: 'right', top: 79, paired: true },
]
const ALL_PARTS = [
  ...PARTS.flatMap(p => p.paired ? [p.key + '_l', p.key + '_r'] : [p.key]),
  'weight',
]

type TrainerRow = { id: string; name: string; photo: string | null }

export default function BodyScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [rows, setRows] = useState<BodyMeasurement[]>([])
  const [goals, setGoals] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'body' | 'progress' | 'photos'>('body')
  const [editPart, setEditPart] = useState<string | null>(null)
  const [editPaired, setEditPaired] = useState(false)
  const [valueInput, setValueInput] = useState('')
  const [valueInputR, setValueInputR] = useState('')
  const [goalInput, setGoalInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [chartPart, setChartPart] = useState('biceps_r')

  // Zdjecia progresu
  const [photos, setPhotos] = useState<BodyPhoto[]>([])
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [beforeIdx, setBeforeIdx] = useState(0)
  const [afterIdx, setAfterIdx] = useState(0)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [sliderPct, setSliderPct] = useState(0.5)
  const [wrapW, setWrapW] = useState(0)
  const wrapWRef = useRef(0)

  // Zgody trenerow
  const [trainers, setTrainers] = useState<TrainerRow[]>([])
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setProfileId(me.id)
      const [m, g, ph] = await Promise.all([
        getBodyMeasurements(me.id),
        getBodyGoals(me.id),
        getBodyPhotos(me.id),
      ])
      setRows(m)
      setGoals(g)
      setPhotos(ph)
      setBeforeIdx(0)
      setAfterIdx(Math.max(0, ph.length - 1))
      if (ph.length > 0) setSigned(await signBodyPhotoUrls(ph.map(p => p.photo_path)))
      loadTrainers(me.id)
    } finally { setLoading(false) }
  }

  // Trenerzy z moich czatow trenerskich + aktualne zgody
  async function loadTrainers(myId: string) {
    try {
      const { data: ms } = await supabase
        .from('matches')
        .select('profile_a_id, profile_b_id')
        .or(`profile_a_id.eq.${myId},profile_b_id.eq.${myId}`)
        .eq('is_trainer_chat', true)
      const otherIds = [...new Set((ms ?? []).map((m: any) => m.profile_a_id === myId ? m.profile_b_id : m.profile_a_id))]
      if (otherIds.length === 0) { setTrainers([]); return }
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, photo_urls, is_trainer')
        .in('id', otherIds)
        .eq('is_trainer', true)
      setTrainers((profs ?? []).map((p: any) => ({ id: p.id, name: p.name, photo: p.photo_urls?.[0] ?? null })))
      setSharedIds(new Set(await getMeasurementShares(myId)))
    } catch (e) { setTrainers([]) }
  }

  async function toggleShare(trainerId: string, enabled: boolean) {
    if (!profileId) return
    setSharedIds(prev => {
      const next = new Set(prev)
      if (enabled) next.add(trainerId); else next.delete(trainerId)
      return next
    })
    await setMeasurementShare(profileId, trainerId, enabled)
  }

  const unit = (part: string) => (part === 'weight' ? 'kg' : 'cm')
  const baseLabel = (part: string) => {
    if (part.endsWith('_l')) return t('body.' + part.slice(0, -2)) + ' ' + t('body.sideL')
    if (part.endsWith('_r')) return t('body.' + part.slice(0, -2)) + ' ' + t('body.sideR')
    return t('body.' + part)
  }

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
    const paired = PAIRED_PARTS.includes(part)
    setEditPaired(paired)
    setEditPart(part)
    if (paired) {
      setValueInput(latestOf(part + '_l') ? String(latestOf(part + '_l')!.value) : '')
      setValueInputR(latestOf(part + '_r') ? String(latestOf(part + '_r')!.value) : '')
      const g = goals[part + '_r'] ?? goals[part + '_l']
      setGoalInput(g != null ? String(g) : '')
    } else {
      setValueInput(latestOf(part) ? String(latestOf(part)!.value) : '')
      setValueInputR('')
      setGoalInput(goals[part] != null ? String(goals[part]) : '')
    }
  }

  // Po kazdym zapisie: lokalne przypomnienie za 14 dni (poprzednie kasujemy).
  // Zero serwera — dziala tez offline i bez zgod na push z bazy.
  async function scheduleReminder() {
    try {
      const prev = await AsyncStorage.getItem(REMINDER_STORAGE_KEY)
      if (prev) await Notifications.cancelScheduledNotificationAsync(prev).catch(() => { })
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: t('body.reminderPushTitle'), body: t('body.reminderPushBody') },
        trigger: { type: 'timeInterval', seconds: STALE_AFTER_DAYS * 24 * 3600 } as any,
      })
      await AsyncStorage.setItem(REMINDER_STORAGE_KEY, id)
    } catch (e) { }
  }

  async function handleSave() {
    if (!profileId || !editPart || saving) return
    const goalRaw = goalInput.trim()
    const goal = parseFloat(goalRaw.replace(',', '.'))

    if (editPaired) {
      const l = parseFloat(valueInput.replace(',', '.'))
      const r = parseFloat(valueInputR.replace(',', '.'))
      const okL = valueInput.trim() !== '' && l > 0 && l <= 500
      const okR = valueInputR.trim() !== '' && r > 0 && r <= 500
      if (!okL && !okR && goalRaw === '') { Alert.alert(t('common.error'), t('body.invalidValue')); return }
      setSaving(true)
      try {
        if (okL) await saveBodyMeasurement(profileId, editPart + '_l', l)
        if (okR) await saveBodyMeasurement(profileId, editPart + '_r', r)
        const target = goalRaw === '' ? null : (goal > 0 ? goal : null)
        await setBodyGoal(profileId, editPart + '_l', target)
        await setBodyGoal(profileId, editPart + '_r', target)
        setEditPart(null)
        if (okL || okR) scheduleReminder()
        await load()
      } finally { setSaving(false) }
      return
    }

    const val = parseFloat(valueInput.replace(',', '.'))
    if (!val || val <= 0 || val > 500) { Alert.alert(t('common.error'), t('body.invalidValue')); return }
    setSaving(true)
    try {
      await saveBodyMeasurement(profileId, editPart, val)
      await setBodyGoal(profileId, editPart, goalRaw === '' ? null : (goal > 0 ? goal : null))
      setEditPart(null)
      scheduleReminder()
      await load()
    } finally { setSaving(false) }
  }

  // ============ Zdjecia progresu ============

  async function uploadBodyPhoto(uri: string) {
    if (!profileId) return
    setUploadingPhoto(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const today = new Date().toISOString().split('T')[0]
      // Nadpisanie zdjecia z tego samego dnia: stary plik znika ze storage
      const existing = photos.find(p => p.taken_on === today)
      if (existing) await supabase.storage.from('body-photos').remove([existing.photo_path]).catch?.(() => { })
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${user.id}/body_${today}_${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri, name: `body.${ext}`, type: `image/${ext}` } as any)
      const { error } = await supabase.storage.from('body-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
      if (error) { Alert.alert(t('common.error'), error.message); return }
      await addBodyPhoto(profileId, path)
      await load()
      setTab('photos')
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setUploadingPhoto(false) }
  }

  function pickBodyPhoto() {
    Alert.alert(t('body.addPhoto'), '', [
      {
        text: t('body.photoCamera'), onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') return
          const result = await ImagePicker.launchCameraAsync({ quality: 0.7 })
          if (!result.canceled && result.assets[0]) uploadBodyPhoto(result.assets[0].uri)
        },
      },
      {
        text: t('body.photoGallery'), onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 } as any)
          if (!result.canceled && result.assets[0]) uploadBodyPhoto(result.assets[0].uri)
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  function confirmDeletePhoto(p: BodyPhoto) {
    Alert.alert(t('body.deletePhoto'), new Date(p.taken_on + 'T12:00:00').toLocaleDateString(), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('body.deletePhoto'), style: 'destructive', onPress: async () => {
          await deleteBodyPhoto(p.id, p.photo_path)
          await load()
        },
      },
    ])
  }

  // Suwak przed/po: przesuwanie palcem po zdjeciu
  const sliderPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      const w = wrapWRef.current
      if (w) setSliderPct(Math.min(0.95, Math.max(0.05, e.nativeEvent.locationX / w)))
    },
    onPanResponderMove: e => {
      const w = wrapWRef.current
      if (w) setSliderPct(Math.min(0.95, Math.max(0.05, e.nativeEvent.locationX / w)))
    },
    onPanResponderTerminationRequest: () => false,
  })).current

  // ============ Pierscienie celow ============

  function goalProgress(part: string): { pct: number; label: string } | null {
    const target = goals[part]
    if (target == null) return null
    const h = historyOf(part)
    if (h.length === 0) return null
    const current = h[0].value
    const baseline = h[h.length - 1].value
    if (baseline === target) return { pct: current === target ? 100 : 0, label: baseLabel(part) }
    const pct = Math.round(((baseline - current) / (baseline - target)) * 100)
    return { pct: Math.max(0, Math.min(100, pct)), label: baseLabel(part) }
  }
  const ringParts = ALL_PARTS.map(p => ({ part: p, prog: goalProgress(p) }))
    .filter(x => x.prog !== null) as { part: string; prog: { pct: number; label: string } }[]

  // ============ Baner "czas na pomiary" ============

  const sessions: { date: string; items: BodyMeasurement[] }[] = []
  for (const r of rows) {
    const s = sessions.find(x => x.date === r.measured_on)
    if (s) s.items.push(r)
    else sessions.push({ date: r.measured_on, items: [r] })
  }
  const daysSinceLast = sessions.length > 0
    ? Math.floor((Date.now() - new Date(sessions[0].date + 'T12:00:00').getTime()) / 86400000)
    : null
  const showStaleBanner = daysSinceLast != null && daysSinceLast >= STALE_AFTER_DAYS

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
  const beforePhoto = photos[Math.min(beforeIdx, photos.length - 1)]
  const afterPhoto = photos[Math.min(afterIdx, photos.length - 1)]

  // Dymek partii pojedynczej
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

  // Dymek partii parzystej: L | P + roznica (symetria)
  function pairedBubble(base: string) {
    const l = latestOf(base + '_l')
    const r = latestOf(base + '_r')
    const hasGoal = goals[base + '_l'] != null || goals[base + '_r'] != null
    const diff = l && r ? Math.round((r.value - l.value) * 10) / 10 : null
    return (
      <TouchableOpacity key={base} style={[styles.bubble, hasGoal && styles.bubbleGoal]} onPress={() => openEdit(base)}>
        <Text style={styles.bubbleLabel}>{t('body.' + base)}</Text>
        {!l && !r ? (
          <Text style={styles.bubbleEmpty}>+ {t('body.add')}</Text>
        ) : (
          <>
            <View style={styles.pairRow}>
              <View style={styles.pairCol}>
                <Text style={styles.pairSide}>{t('body.sideL')}</Text>
                <Text style={[styles.pairValue, !l && { color: 'rgba(255,255,255,0.3)' }]}>{l ? l.value : '—'}</Text>
              </View>
              <View style={styles.pairDivider} />
              <View style={styles.pairCol}>
                <Text style={styles.pairSide}>{t('body.sideR')}</Text>
                <Text style={[styles.pairValue, !r && { color: 'rgba(255,255,255,0.3)' }]}>{r ? r.value : '—'}</Text>
              </View>
            </View>
            {diff !== null && diff !== 0 ? (
              <Text style={styles.pairDiff}>{diff > 0 ? t('body.sideR') : t('body.sideL')} +{Math.abs(diff)}</Text>
            ) : null}
          </>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('body.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Zakladki: Sylwetka | Postepy | Zdjecia */}
      <View style={styles.tabsRow}>
        {(['body', 'progress', 'photos'] as const).map(tb => (
          <TouchableOpacity key={tb} style={[styles.tab, tab === tb && styles.tabActive]} onPress={() => setTab(tb)}>
            <Text style={[styles.tabText, tab === tb && styles.tabTextActive]}>
              {tb === 'body' ? t('body.tabBody') : tb === 'progress' ? t('body.tabProgress') : t('body.tabPhotos')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {tab === 'body' ? (
          <>
            {/* Baner: dawno bez pomiarow */}
            {showStaleBanner && (
              <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
                <View style={styles.staleBanner}>
                  <Ionicons name="time-outline" size={22} color={GOLD} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staleTitle}>{t('body.staleTitle')}</Text>
                    <Text style={styles.staleSub}>
                      {t('body.staleSubtitle', { date: new Date(sessions[0].date + 'T12:00:00').toLocaleDateString() })}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.staleBtn} onPress={() => openEdit('weight')}>
                    <Text style={styles.staleBtnText}>{t('body.measureNow')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

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
                  {p.paired ? pairedBubble(p.key) : bubble(p.key)}
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
                      {s.items.map(i => `${baseLabel(i.part)} ${i.value}`).join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Zgody: kto widzi moje pomiary */}
            {trainers.length > 0 && (
              <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
                <Text style={styles.journalTitle}>{t('body.sharesTitle')}</Text>
                <Text style={styles.sharesHint}>{t('body.sharesHint')}</Text>
                {trainers.map(tr => (
                  <View key={tr.id} style={styles.trainerRow}>
                    <Image source={{ uri: tr.photo ?? 'https://i.pravatar.cc/60' }} style={styles.trainerAvatar} />
                    <Text style={styles.trainerName}>{tr.name}</Text>
                    <Switch
                      value={sharedIds.has(tr.id)}
                      onValueChange={v => toggleShare(tr.id, v)}
                      trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(148,227,54,0.5)' }}
                      thumbColor={sharedIds.has(tr.id) ? LIME : '#8fa3c4'}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        ) : tab === 'progress' ? (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Pierscienie: postep do celow */}
            {ringParts.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.journalTitle}>{t('body.ringsTitle')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
                  {ringParts.map(({ part, prog }) => {
                    const R = 26
                    const CIRC = 2 * Math.PI * R
                    return (
                      <View key={part} style={{ alignItems: 'center', width: 76 }}>
                        <Svg width={64} height={64} viewBox="0 0 64 64">
                          <Circle cx="32" cy="32" r={R} stroke={BG_LIGHT} strokeWidth="6" fill="none" />
                          <Circle
                            cx="32" cy="32" r={R}
                            stroke={prog.pct >= 100 ? GOLD : LIME}
                            strokeWidth="6" fill="none" strokeLinecap="round"
                            strokeDasharray={`${(prog.pct / 100) * CIRC} ${CIRC}`}
                            transform="rotate(-90 32 32)"
                          />
                        </Svg>
                        <Text style={styles.ringPct}>{prog.pct}%</Text>
                        <Text style={styles.ringLabel} numberOfLines={1}>{prog.label}</Text>
                      </View>
                    )
                  })}
                </ScrollView>
              </View>
            )}

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
                          {baseLabel(p)} {sign}{diff.toFixed(1).replace('.0', '')} {unit(p)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                {/* Wykres wybranej partii */}
                {activeChartPart && chartData.length >= 2 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>
                      {baseLabel(activeChartPart)} — {t('body.sinceFirst')}
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
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Zakladka: zdjecia progresu */}
            {photos.length >= 2 && beforePhoto && afterPhoto && beforePhoto.id !== afterPhoto.id ? (
              <View
                style={styles.compareWrap}
                onLayout={e => { wrapWRef.current = e.nativeEvent.layout.width; setWrapW(e.nativeEvent.layout.width) }}
                {...sliderPan.panHandlers}
              >
                {signed[afterPhoto.photo_path] ? (
                  <Image source={{ uri: signed[afterPhoto.photo_path] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${sliderPct * 100}%`, overflow: 'hidden' }}>
                  {signed[beforePhoto.photo_path] ? (
                    <Image
                      source={{ uri: signed[beforePhoto.photo_path] }}
                      style={{ width: wrapW || 300, height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
                <View style={[styles.sliderLine, { left: `${sliderPct * 100}%` }]} />
                <View style={[styles.sliderHandle, { left: `${sliderPct * 100}%` }]}>
                  <Ionicons name="swap-horizontal" size={15} color={BG} />
                </View>
                <View style={[styles.photoBadge, { left: 8 }]}>
                  <Text style={styles.photoBadgeText}>{new Date(beforePhoto.taken_on + 'T12:00:00').toLocaleDateString()}</Text>
                </View>
                <View style={[styles.photoBadge, { right: 8, backgroundColor: 'rgba(148,227,54,0.85)' }]}>
                  <Text style={[styles.photoBadgeText, { color: BG }]}>{new Date(afterPhoto.taken_on + 'T12:00:00').toLocaleDateString()}</Text>
                </View>
              </View>
            ) : photos.length === 1 && beforePhoto ? (
              <View style={styles.compareWrap}>
                {signed[beforePhoto.photo_path] ? (
                  <Image source={{ uri: signed[beforePhoto.photo_path] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
                <View style={[styles.photoBadge, { left: 8 }]}>
                  <Text style={styles.photoBadgeText}>{new Date(beforePhoto.taken_on + 'T12:00:00').toLocaleDateString()}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.emptyHint}>{t('body.photosEmpty')}</Text>
            )}

            {photos.length >= 2 && (
              <Text style={styles.compareHint}>{t('body.compareHint')}</Text>
            )}

            {/* Miniatury: tap = wybor do porownania, przytrzymanie = usun */}
            {photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
                {photos.map((p, idx) => {
                  const isBefore = idx === beforeIdx
                  const isAfter = idx === afterIdx
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => {
                        if (idx === beforeIdx || idx === afterIdx) return
                        if (idx < afterIdx) setBeforeIdx(idx); else setAfterIdx(idx)
                      }}
                      onLongPress={() => confirmDeletePhoto(p)}
                      delayLongPress={400}
                      style={[styles.thumb, isBefore && { borderColor: BLUE }, isAfter && { borderColor: LIME }]}
                    >
                      {signed[p.photo_path] ? (
                        <Image source={{ uri: signed[p.photo_path] }} style={{ width: '100%', height: '100%', borderRadius: 8 }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <ActivityIndicator size="small" color={LIME} />
                        </View>
                      )}
                      <View style={styles.thumbDateWrap}>
                        <Text style={styles.thumbDate}>
                          {new Date(p.taken_on + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickBodyPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator color={BG} /> : (
                <>
                  <Ionicons name="camera" size={18} color={BG} />
                  <Text style={styles.addPhotoText}>{t('body.addPhoto')}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.privacyNote}>
              <Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.4)" /> {t('body.photosPrivate')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal edycji partii */}
      <Modal visible={!!editPart} transparent animationType="slide" onRequestClose={() => setEditPart(null)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editPart ? t('body.' + editPart) : ''}</Text>

            {editPaired ? (
              <>
                <Text style={styles.sheetLabel}>{t('body.todayValue')} (cm)</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.sheetInput}
                      value={valueInput}
                      onChangeText={setValueInput}
                      keyboardType="decimal-pad"
                      placeholder={t('body.sideL')}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      autoFocus
                    />
                    <Text style={styles.pairInputLabel}>{t('body.sideL')}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.sheetInput}
                      value={valueInputR}
                      onChangeText={setValueInputR}
                      keyboardType="decimal-pad"
                      placeholder={t('body.sideR')}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                    />
                    <Text style={styles.pairInputLabel}>{t('body.sideR')}</Text>
                  </View>
                </View>
              </>
            ) : (
              <>
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
              </>
            )}

            <Text style={styles.sheetLabel}>{t('body.goal')} ({editPart ? (editPaired ? 'cm' : unit(editPart)) : ''}) — {t('body.goalOptional')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="rgba(255,255,255,0.25)"
            />

            {editPart && (() => {
              const hist = editPaired
                ? rows.filter(r => r.part === editPart + '_l' || r.part === editPart + '_r')
                : historyOf(editPart)
              if (hist.length === 0) return null
              return (
                <View style={styles.historyBox}>
                  {hist.slice(0, 5).map(h => (
                    <View key={h.id} style={styles.historyRow}>
                      <Text style={styles.historyDate}>{new Date(h.measured_on + 'T12:00:00').toLocaleDateString()}</Text>
                      <Text style={styles.historyValue}>
                        {editPaired ? `${h.part.endsWith('_l') ? t('body.sideL') : t('body.sideR')} · ` : ''}{h.value} {unit(h.part)}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            })()}

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
  pairRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pairCol: { flex: 1, alignItems: 'center' },
  pairSide: { fontSize: 8, fontWeight: '800', color: 'rgba(255,255,255,0.4)' },
  pairValue: { fontSize: 13, fontWeight: '800', color: '#fff' },
  pairDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 5 },
  pairDiff: { fontSize: 9, fontWeight: '800', color: GOLD, textAlign: 'center', marginTop: 2 },
  pairInputLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 4 },
  weightBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  weightText: { flex: 1, fontSize: 15, fontWeight: '800', color: '#fff' },
  emptyHint: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 16, lineHeight: 20, paddingHorizontal: 20 },
  journalTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  sessionCard: { backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sessionDate: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sessionCount: { fontSize: 11.5, fontWeight: '700', color: LIME },
  sessionSummary: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', lineHeight: 17 },
  staleBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderWidth: 1, borderColor: 'rgba(240,180,41,0.4)', borderRadius: 14, padding: 12 },
  staleTitle: { fontSize: 13, fontWeight: '800', color: '#fff' },
  staleSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  staleBtn: { backgroundColor: LIME, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  staleBtnText: { fontSize: 12, fontWeight: '800', color: BG },
  sharesHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginBottom: 8, lineHeight: 16 },
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(240,180,41,0.25)' },
  trainerAvatar: { width: 34, height: 34, borderRadius: 17 },
  trainerName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#fff' },
  ringPct: { fontSize: 13, fontWeight: '800', color: '#fff', marginTop: 4 },
  ringLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  diffChip: { backgroundColor: BG_LIGHT, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  diffChipGood: { backgroundColor: 'rgba(148,227,54,0.12)', borderColor: 'rgba(148,227,54,0.4)' },
  diffChipActive: { borderColor: LIME },
  diffChipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  chartCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chartTitle: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.55)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  chartMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  chartMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  compareWrap: { height: 380, borderRadius: 16, overflow: 'hidden', backgroundColor: BG_LIGHT, position: 'relative' },
  sliderLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: LIME, marginLeft: -1.5 },
  sliderHandle: { position: 'absolute', top: '50%', width: 30, height: 30, borderRadius: 15, backgroundColor: LIME, marginLeft: -15, marginTop: -15, alignItems: 'center', justifyContent: 'center' },
  photoBadge: { position: 'absolute', top: 8, backgroundColor: 'rgba(13,27,46,0.8)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  photoBadgeText: { fontSize: 11, fontWeight: '700', color: '#dbe5f5' },
  compareHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 8 },
  thumb: { width: 62, height: 82, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: BG_LIGHT, overflow: 'hidden' },
  thumbDateWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,27,46,0.75)', paddingVertical: 2 },
  thumbDate: { fontSize: 10, fontWeight: '700', color: '#dbe5f5', textAlign: 'center' },
  addPhotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 14, paddingVertical: 13, marginTop: 14 },
  addPhotoText: { fontSize: 14, fontWeight: '800', color: BG },
  privacyNote: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 10 },
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
