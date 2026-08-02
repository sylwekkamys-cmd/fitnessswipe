import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Modal, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import DateTimePicker from '@react-native-community/datetimepicker'
import Slider from '@react-native-community/slider'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase, getMyProfile, logWorkoutToday } from '../lib/supabase'
import type { Profile } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const WORKOUT_TYPE_ICONS: Record<string, string> = {
  strength: 'barbell-outline', cardio: 'pulse-outline', crossfit: 'flash-outline', hiit: 'flame-outline',
  yoga: 'body-outline', swimming: 'water-outline', cycling: 'bicycle-outline', running: 'walk-outline',
  boxing: 'hand-right-outline', climbing: 'triangle-outline', other: 'ellipsis-horizontal-outline',
}
const WORKOUT_TYPE_CODES = ['strength','cardio','crossfit','hiit','yoga','swimming','cycling','running','boxing','climbing','other']

// Kolory typow treningu - spojne z banerami wyzwan/wydarzen
const WORKOUT_TYPE_COLORS: Record<string, [string, string]> = {
  strength: ['#2d5016', '#4f8422'],
  cardio: ['#7a3b10', '#c26422'],
  crossfit: ['#5c1010', '#a32020'],
  hiit: ['#7a2410', '#b8441e'],
  yoga: ['#0f6b46', '#17a06a'],
  swimming: ['#173f66', '#2e7ab8'],
  cycling: ['#4a2570', '#7a42b5'],
  running: ['#6b5d10', '#a8921e'],
  boxing: ['#7a1f4a', '#b53b78'],
  climbing: ['#37474f', '#5a7484'],
  other: ['#37474f', '#5a7484'],
}
function typeColors(code: string): [string, string] {
  return WORKOUT_TYPE_COLORS[code] ?? ['#37474f', '#5a7484']
}
function pad2(n: number) { return String(n).padStart(2, '0') }
function dateKey(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
// Poniedzialek tygodnia zawierajacego dana date (niedziela = 0 w JS, stad -6 zamiast +1)
function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

type Workout = {
  id: string
  workout_date: string
  workout_time?: string
  workout_type: string
  duration_minutes: number
  notes: string
  rating: number
  partner?: { name: string }
  steps?: number | null
}

export default function WorkoutsScreen() {
  const { t } = useTranslation()
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [matches, setMatches] = useState<any[]>([])
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()))
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [selectedType, setSelectedType] = useState('strength')
  const [workoutHour, setWorkoutHour] = useState(18)
  const [workoutMinute, setWorkoutMinute] = useState(0)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [duration, setDuration] = useState('60')
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(5)
  const [selectedMatch, setSelectedMatch] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [shareWorkout, setShareWorkout] = useState<Workout | null>(null)
  const [sharingCard, setSharingCard] = useState(false)
  const shareRef = useRef<ViewShot>(null)
  const [intensity, setIntensity] = useState('')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [successInfo, setSuccessInfo] = useState<{ streak: number; workout: Workout | null } | null>(null)
  const [steps, setSteps] = useState('')
  const [stepsAuto, setStepsAuto] = useState(false)
  // Pasek tygodnia (wariant 3 kalendarza): poniedzialek biezaco wyswietlanego tygodnia
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      setMyProfile(me)
      if (!me) return
      const { data: workoutData } = await supabase
        .from('workouts')
        .select('*, partner:profiles!workouts_partner_id_fkey(name)')
        .or(`creator_id.eq.${me.id},partner_id.eq.${me.id}`)
        .order('workout_date', { ascending: false })
      setWorkouts(workoutData ?? [])
      const { data: matchData } = await supabase
        .from('matches').select('id, profile_a_id, profile_b_id')
        .or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`)
      if (matchData) {
        const enriched = []
        for (const match of matchData) {
          const otherId = match.profile_a_id === me.id ? match.profile_b_id : match.profile_a_id
          const { data: other } = await supabase.from('profiles').select('id, name, photo_urls').eq('id', otherId).single()
          if (other) enriched.push({ matchId: match.id, partnerId: other.id, partnerName: other.name, partnerPhoto: (other as any).photo_urls?.[0] ?? null })
        }
        setMatches(enriched)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function incHour() { setWorkoutHour(h => (h + 1) % 24) }
  function decHour() { setWorkoutHour(h => (h - 1 + 24) % 24) }
  function incMinute() { setWorkoutMinute(m => (m + 1) % 60) }
  function decMinute() { setWorkoutMinute(m => (m - 1 + 60) % 60) }

  function resetForm() {
    setNotes('')
    setDuration('60')
    setRating(5)
    setSelectedMatch('')
    setWorkoutHour(18)
    setWorkoutMinute(0)
    setSelectedType('strength')
    setIntensity('')
    setEditingId(null)
    setSteps('')
    setStepsAuto(false)
  }

  // Kroki z zegarka/telefonu (Health Connect / Apple Health) dla wskazanego dnia —
  // tylko podpowiedz, user moze nadpisac recznie
  async function fetchStepsForDate(dayKey: string) {
    try {
      const { getStepsBetween } = await import('../lib/health')
      const day = new Date(dayKey + 'T00:00:00')
      const start = new Date(day); start.setHours(0, 0, 0, 0)
      const end = new Date(day); end.setHours(23, 59, 59, 999)
      const cappedEnd = end > new Date() ? new Date() : end
      const val = await getStepsBetween(start, cappedEnd)
      if (val !== null) { setSteps(String(val)); setStepsAuto(true) }
    } catch (e) { }
  }

  // "Powtorz ostatni trening" — wypelnia formularz wartosciami z poprzedniego wpisu
  function applyLastWorkout() {
    const last = workouts[0]
    if (!last) return
    setSelectedType(last.workout_type)
    setDuration(String(last.duration_minutes || 60))
    setSelectedMatch((last as any).match_id ?? '')
    setIntensity((last as any).intensity ?? '')
    setRating(last.rating || 5)
    setSelectedDate(dateKey(new Date()))
    const now = new Date()
    setWorkoutHour(now.getHours())
    setWorkoutMinute(now.getMinutes())
  }

  // Tapniecie karty = edycja z wypelnionymi polami
  function openEdit(w: Workout) {
    setEditingId(w.id)
    setSelectedType(w.workout_type)
    setSelectedDate(w.workout_date)
    if (w.workout_time) {
      const [h, m] = w.workout_time.split(':').map(Number)
      if (!isNaN(h)) setWorkoutHour(h)
      if (!isNaN(m)) setWorkoutMinute(m)
    }
    setDuration(String(w.duration_minutes || 60))
    setNotes(w.notes ?? '')
    setRating(w.rating || 5)
    setSelectedMatch((w as any).match_id ?? '')
    setIntensity((w as any).intensity ?? '')
    setSteps(w.steps != null ? String(w.steps) : '')
    setStepsAuto(false)
    setShowAddModal(true)
  }

  async function handleSave() {
    if (!myProfile) return
    setSaving(true)
    try {
      const match = matches.find(m => m.matchId === selectedMatch)
      const payload = {
        partner_id: match?.partnerId ?? null,
        match_id: selectedMatch || null,
        workout_date: selectedDate,
        workout_time: `${pad2(workoutHour)}:${pad2(workoutMinute)}`,
        workout_type: selectedType,
        duration_minutes: parseInt(duration) || 0,
        notes: notes.trim(),
        rating,
        intensity,
        steps: steps.trim() === '' ? null : (parseInt(steps) || null),
      }
      let savedWorkout: Workout | null = null
      let streak = 0
      if (editingId) {
        const { error } = await supabase.from('workouts').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase.from('workouts')
          .insert({ creator_id: myProfile.id, ...payload })
          .select('*')
          .single()
        if (error) throw error
        savedWorkout = inserted as Workout
        // Sync ze streakiem: dzisiejszy trening odhacza tez dzien serii
        if (selectedDate === dateKey(new Date())) {
          try {
            const res = await logWorkoutToday(myProfile.id)
            streak = res.currentStreak ?? 0
            // Kamien milowy passy — pokaz nagrode (po zamknieciu modala sukcesu)
            if (res.milestone) {
              const msg = res.boosted ? t('streak.milestoneBoost') : t('streak.milestoneSwipes', { count: res.bonusSwipes })
              setTimeout(() => Alert.alert(t('streak.milestoneTitle', { count: res.milestone }), msg), 700)
            }
          } catch (e) { }
        }
        // Push do partnera: "dodal wasz wspolny trening" — zacheca do zalogowania po swojej stronie
        if (match) {
          try {
            const { notifyProfile } = await import('../lib/notifications')
            notifyProfile(match.partnerId, `💪 ${myProfile.name}`, t('workouts.partnerLoggedPush'), { type: 'workout_partner' })
          } catch (e) { }
        }
      }
      setShowAddModal(false)
      resetForm()
      await loadData()
      if (savedWorkout) {
        setSuccessInfo({ streak, workout: savedWorkout })
      } else {
        Alert.alert('✅', t('workouts.saved'))
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    Alert.alert(t('workouts.deleteTitle'), t('workouts.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.save'), style: 'destructive', onPress: async () => {
        await supabase.from('workouts').delete().eq('id', id)
        setWorkouts(prev => prev.filter(w => w.id !== id))
      }}
    ])
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  function getTotalStats() {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevKey = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`
    const monthCount = workouts.filter(w => w.workout_date.startsWith(monthKey)).length
    const prevCount = workouts.filter(w => w.workout_date.startsWith(prevKey)).length
    const totalMinutes = workouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0)
    const hours = Math.floor(totalMinutes / 60)
    const avgRating = workouts.length > 0
      ? (workouts.reduce((sum, w) => sum + (w.rating || 0), 0) / workouts.length).toFixed(1)
      : '0'
    return { total: workouts.length, monthCount, monthDiff: monthCount - prevCount, hours, avgRating }
  }

  // Minuty per dzien - slupki ostatnich 7 dni
  function getWeekBars() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000)
      const key = dateKey(d)
      return workouts.filter(w => w.workout_date === key).reduce((s, w) => s + (w.duration_minutes || 0), 0)
    })
  }

  // Podzial minut na typy treningu (top 3 + reszta)
  function getTypeBreakdown() {
    const byType: Record<string, number> = {}
    let total = 0
    workouts.forEach(w => {
      const min = w.duration_minutes || 0
      byType[w.workout_type] = (byType[w.workout_type] ?? 0) + min
      total += min
    })
    if (total === 0) return []
    const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 3).map(([code, min]) => ({ code, pct: Math.round((min / total) * 100) }))
    const rest = sorted.slice(3).reduce((s, [, min]) => s + min, 0)
    if (rest > 0) top.push({ code: 'other_rest', pct: Math.round((rest / total) * 100) })
    return top.filter(x => x.pct > 0)
  }

  // Najczestszy partner treningowy
  function getTopPartner(): { name: string; count: number } | null {
    const counts: Record<string, number> = {}
    workouts.forEach(w => {
      if (w.partner?.name) counts[w.partner.name] = (counts[w.partner.name] ?? 0) + 1
    })
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return best ? { name: best[0], count: best[1] } : null
  }

  // Czy dany dzien ma trening i jakim kolorem oznaczyc kropke (kolor pierwszego treningu tego dnia)
  function getDayInfo(key: string): { hasWorkout: boolean; color: string } {
    const w = workouts.find(w => w.workout_date === key)
    return w ? { hasWorkout: true, color: typeColors(w.workout_type)[1] } : { hasWorkout: false, color: PRIMARY }
  }

  function formatWeekRange(weekStartDate: Date): string {
    const end = addDays(weekStartDate, 6)
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    return `${weekStartDate.toLocaleDateString('pl-PL', opts)} – ${end.toLocaleDateString('pl-PL', opts)}`
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  const statsData = getTotalStats()
  const weekBars = getWeekBars()
  const maxBar = Math.max(1, ...weekBars)
  const breakdown = getTypeBreakdown()
  const topPartner = getTopPartner()
  const dayWorkouts = selectedDay ? workouts.filter(w => w.workout_date === selectedDay) : []

  // Karta treningu z pionowym paskiem koloru typu
  function renderWorkoutCard(workout: Workout, showDate: boolean) {
    return (
      <TouchableOpacity key={workout.id} style={styles.workoutCard} onPress={() => openEdit(workout)} activeOpacity={0.8}>
        <LinearGradient colors={typeColors(workout.workout_type)} style={styles.workoutStripe} />
        <View style={styles.workoutInfo}>
          <View style={styles.workoutTopRow}>
            <View style={styles.workoutTitleWrap}>
              <Ionicons name={(WORKOUT_TYPE_ICONS[workout.workout_type] ?? 'ellipsis-horizontal-outline') as any} size={15} color={typeColors(workout.workout_type)[1]} />
              <Text style={styles.workoutType}>{t('workouts.types.' + workout.workout_type)}</Text>
              {workout.partner?.name && <Text style={styles.workoutPartner}>🤝 {workout.partner.name}</Text>}
            </View>
            <View style={styles.durationPill}>
              <Text style={styles.durationPillText}>{workout.duration_minutes} min</Text>
            </View>
          </View>
          <Text style={styles.workoutDate}>
            {showDate ? formatDate(workout.workout_date) : ''}{showDate && workout.workout_time ? ' · ' : ''}{workout.workout_time ?? ''} · ⭐ {workout.rating}/5{(workout as any).intensity ? ` · ${t('workouts.int_' + (workout as any).intensity)}` : ''}{workout.steps ? ` · 👟 ${workout.steps.toLocaleString()}` : ''}
          </Text>
          {workout.notes ? <Text style={styles.workoutNotes} numberOfLines={2}>„{workout.notes}"</Text> : null}
        </View>
        <TouchableOpacity style={styles.workoutShareBtn} onPress={() => setShareWorkout(workout)}>
          <Ionicons name="share-social-outline" size={15} color="rgba(148,227,54,0.8)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.workoutDeleteBtn} onPress={() => handleDelete(workout.id)}>
          <Ionicons name="trash-outline" size={15} color="rgba(255,71,87,0.7)" />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  // Karta 9:16 do udostepnienia na Instagram/TikTok: zdjecie + pasek statystyk
  async function handleShareCard() {
    if (!shareRef.current?.capture) return
    setSharingCard(true)
    try {
      const uri = await shareRef.current.capture()
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'FitnessSwipe' })
      }
    } catch (e) { console.log('share card error:', e) }
    finally { setSharingCard(false) }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('workouts.title')}</Text>
        {((myProfile as any)?.current_streak ?? 0) > 0 && (
          <View style={styles.headerStreakPill}>
            <Text style={styles.headerStreakText}>{'🔥'} {(myProfile as any).current_streak}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.backBtn, { marginRight: 8 }]}
          onPress={() => router.push('/plans' as any)}
        >
          <Ionicons name="clipboard" size={19} color="#94e336" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.backBtn, { marginRight: 8 }]}
          onPress={() => router.push('/body' as any)}
        >
          <Ionicons name="body" size={20} color="#b388ff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => {
          resetForm()
          const d = selectedDay || dateKey(new Date())
          setSelectedDate(d)
          fetchStepsForDate(d)
          setShowAddModal(true)
        }}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: LIME }]}>{statsData.monthCount}</Text>
          <Text style={styles.statLbl}>
            {t('workouts.thisMonth') || 'w tym mies.'}{statsData.monthDiff !== 0 ? ` ${statsData.monthDiff > 0 ? '+' : ''}${statsData.monthDiff}` : ''}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#4fc3f7' }]}>{statsData.hours}h</Text>
          <Text style={styles.statLbl}>{t('workouts.totalTime')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#ffb340' }]}>⭐ {statsData.avgRating}</Text>
          <Text style={styles.statLbl}>{t('workouts.avgRating')}</Text>
        </View>
      </View>

      {/* Wykres tygodnia + podzial typow + top partner */}
      {workouts.length > 0 && (
        <View style={styles.dashCard}>
          <View style={styles.dashChartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dashTitle}>{t('workouts.weekChart') || 'Minuty — ostatnie 7 dni'}</Text>
              {topPartner && (
                <Text style={styles.dashPartner}>🤝 {t('workouts.topPartner') || 'Top partner'}: {topPartner.name} ({topPartner.count}×)</Text>
              )}
            </View>
            <View style={styles.dashBars}>
              {weekBars.map((min, i) => (
                <View key={i} style={styles.dashBarCol}>
                  <View style={[
                    styles.dashBar,
                    {
                      height: Math.max(4, (min / maxBar) * 40),
                      backgroundColor: min === 0 ? 'rgba(255,255,255,0.12)' : i === 6 ? LIME : '#4f8422',
                    },
                  ]} />
                </View>
              ))}
            </View>
          </View>
          {breakdown.length > 0 && (
            <View style={styles.breakdownRow}>
              {breakdown.map(b => (
                <View
                  key={b.code}
                  style={[
                    styles.breakdownSeg,
                    { flex: Math.max(b.pct, 8), backgroundColor: b.code === 'other_rest' ? '#37474f' : typeColors(b.code)[0] },
                  ]}
                >
                  <Text style={styles.breakdownText} numberOfLines={1}>
                    {b.code === 'other_rest' ? '…' : t('workouts.types.' + b.code)} {b.pct}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.viewSwitch}>
        <TouchableOpacity style={[styles.viewBtn, view === 'calendar' && styles.viewBtnActive]} onPress={() => setView('calendar')}>
          <Ionicons name="calendar-outline" size={16} color={view === 'calendar' ? PRIMARY : 'rgba(255,255,255,0.4)'} />
          <Text style={[styles.viewBtnText, view === 'calendar' && styles.viewBtnTextActive]}>{t('workouts.calendar')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.viewBtn, view === 'list' && styles.viewBtnActive]} onPress={() => setView('list')}>
          <Ionicons name="list-outline" size={16} color={view === 'list' ? PRIMARY : 'rgba(255,255,255,0.4)'} />
          <Text style={[styles.viewBtnText, view === 'list' && styles.viewBtnTextActive]}>{t('workouts.list')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {view === 'calendar' ? (
          <>
            <View style={styles.weekNavRow}>
              <TouchableOpacity style={styles.weekNavBtn} onPress={() => setWeekStart(w => addDays(w, -7))}>
                <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <Text style={styles.weekRangeLabel}>
                {formatWeekRange(weekStart)}
              </Text>
              <TouchableOpacity style={styles.weekNavBtn} onPress={() => setWeekStart(w => addDays(w, 7))}>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            <View style={styles.weekStrip}>
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(day => {
                const key = dateKey(day)
                const info = getDayInfo(key)
                const isSelected = selectedDay === key
                const isToday = key === dateKey(new Date())
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.weekDayCard, isSelected && styles.weekDayCardActive]}
                    onPress={() => setSelectedDay(key)}
                  >
                    <Text style={[styles.weekDayLetter, isSelected && styles.weekDayLetterActive]}>
                      {day.toLocaleDateString('pl-PL', { weekday: 'narrow' }).toUpperCase()}
                    </Text>
                    <Text style={[styles.weekDayNumber, isSelected && styles.weekDayNumberActive, isToday && !isSelected && { color: PRIMARY }]}>
                      {day.getDate()}
                    </Text>
                    {info.hasWorkout && (
                      <View style={[styles.weekDayDot, { backgroundColor: isSelected ? BG : info.color }]} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
            {selectedDay ? (
              <View style={styles.daySection}>
                <Text style={styles.daySectionTitle}>{formatDate(selectedDay)}</Text>
                {dayWorkouts.length === 0 ? (
                  <TouchableOpacity style={styles.addDayBtn} onPress={() => { resetForm(); setSelectedDate(selectedDay); fetchStepsForDate(selectedDay); setShowAddModal(true) }}>
                    <Ionicons name="add-circle-outline" size={20} color={PRIMARY} />
                    <Text style={styles.addDayBtnText}>{t('workouts.addForDay')}</Text>
                  </TouchableOpacity>
                ) : (
                  dayWorkouts.map(workout => renderWorkoutCard(workout, false))
                )}
              </View>
            ) : (
              <View style={styles.calendarHint}>
                <Text style={styles.calendarHintText}>{t('workouts.calendarHint')}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.list}>
            {workouts.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📅</Text>
                <Text style={styles.emptyTitle}>{t('workouts.noWorkouts')}</Text>
                <Text style={styles.emptySub}>{t('workouts.noWorkoutsSub')}</Text>
                <TouchableOpacity style={styles.addFirstBtn} onPress={() => { resetForm(); fetchStepsForDate(dateKey(new Date())); setShowAddModal(true) }}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addFirstBtnText}>{t('workouts.addWorkout')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              workouts.map(workout => renderWorkoutCard(workout, true))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? (t('workouts.editWorkout') || 'Edytuj trening') : t('workouts.newWorkout')}</Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm() }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Powtorz ostatni trening — jedno tapniecie wypelnia formularz */}
              {!editingId && workouts.length > 0 && (
                <TouchableOpacity style={styles.repeatBanner} onPress={applyLastWorkout} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={15} color={LIME} />
                  <Text style={styles.repeatBannerText}>
                    {t('workouts.repeatLast')}: {t('workouts.types.' + workouts[0].workout_type)} · {workouts[0].duration_minutes} min
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.sectionLabel}>{t('workouts.workoutType')}</Text>
              <View style={styles.typeGrid}>
                {WORKOUT_TYPE_CODES.map(code => (
                  <TouchableOpacity key={code} style={styles.typeTileWrap} onPress={() => setSelectedType(code)} activeOpacity={0.8}>
                    <LinearGradient
                      colors={typeColors(code)}
                      style={[styles.typeTile, selectedType === code ? styles.typeTileActive : styles.typeTileInactive]}
                    >
                      {selectedType === code && (
                        <View style={styles.typeTileCheck}>
                          <Ionicons name="checkmark" size={10} color={BG} />
                        </View>
                      )}
                      <Ionicons name={WORKOUT_TYPE_ICONS[code] as any} size={18} color="#fff" />
                      <Text style={styles.typeTileLabel} numberOfLines={1}>{t('workouts.types.' + code)}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>{t('workouts.whenSection')}</Text>
              <View style={styles.quickChipsRow}>
                {([
                  { label: t('events.today') || 'Dziś', value: dateKey(new Date()) },
                  { label: t('viewers.groupYesterday') || 'Wczoraj', value: dateKey(new Date(Date.now() - 86400000)) },
                ]).map(d => (
                  <TouchableOpacity key={d.label} style={[styles.quickChip, selectedDate === d.value && styles.quickChipActive]} onPress={() => setSelectedDate(d.value)}>
                    <Text style={[styles.quickChipText, selectedDate === d.value && styles.quickChipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.quickChip} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickChipText}> {![dateKey(new Date()), dateKey(new Date(Date.now() - 86400000))].includes(selectedDate) ? selectedDate : (t('events.otherDate') || 'Inna')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => setShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickChipText}> {pad2(workoutHour)}:{pad2(workoutMinute)}</Text>
                </TouchableOpacity>
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={new Date(selectedDate + 'T12:00:00')}
                  mode="date"
                  maximumDate={new Date()}
                  onChange={(e: any, d?: Date) => {
                    setShowDatePicker(false)
                    if (d) {
                      const key = dateKey(d)
                      setSelectedDate(key)
                      if (!editingId) fetchStepsForDate(key)
                    }
                  }}
                />
              )}
              {showTimePicker && (
                <DateTimePicker
                  value={new Date(2000, 0, 1, workoutHour, workoutMinute)}
                  mode="time"
                  is24Hour
                  onChange={(e: any, d?: Date) => { setShowTimePicker(false); if (d) { setWorkoutHour(d.getHours()); setWorkoutMinute(d.getMinutes()) } }}
                />
              )}

              <Text style={styles.sectionLabel}>{t('workouts.duration')} · {parseInt(duration) || 60} min</Text>
              <Slider
                style={styles.durationSlider}
                minimumValue={15}
                maximumValue={180}
                step={5}
                value={parseInt(duration) || 60}
                onValueChange={(v: number) => setDuration(String(Math.round(v)))}
                minimumTrackTintColor={LIME}
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor={LIME}
              />

              <View style={styles.stepsHeaderRow}>
                <Text style={styles.sectionLabel}>{t('workouts.stepsLabel')}</Text>
                {stepsAuto && (
                  <View style={styles.stepsAutoBadge}>
                    <Ionicons name="watch-outline" size={11} color={LIME} />
                    <Text style={styles.stepsAutoBadgeText}>{t('workouts.stepsAuto')}</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={styles.input}
                value={steps}
                onChangeText={v => { setSteps(v); setStepsAuto(false) }}
                placeholder={t('workouts.stepsPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numeric"
              />

              <Text style={styles.sectionLabel}>{t('workouts.intensityLabel')}</Text>
              <View style={styles.quickChipsRow}>
                {['light', 'solid', 'max'].map(i => (
                  <TouchableOpacity key={i} style={[styles.quickChip, intensity === i && styles.quickChipActive]} onPress={() => setIntensity(prev => prev === i ? '' : i)}>
                    <Text style={[styles.quickChipText, intensity === i && styles.quickChipTextActive]}>{t('workouts.int_' + i)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {matches.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>{t('workouts.partner')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.partnerRow}>
                    <TouchableOpacity style={[styles.partnerBtn, !selectedMatch && styles.partnerBtnActive]} onPress={() => setSelectedMatch('')}>
                      <Text style={[styles.partnerBtnText, !selectedMatch && styles.partnerBtnTextActive]}>{t('workouts.noPartner')}</Text>
                    </TouchableOpacity>
                    {matches.map(m => (
                      <TouchableOpacity key={m.matchId} style={[styles.partnerBtn, selectedMatch === m.matchId && styles.partnerBtnActive]} onPress={() => setSelectedMatch(m.matchId)}>
                        {(m as any).partnerPhoto ? (
                          <Image source={{ uri: (m as any).partnerPhoto }} style={styles.partnerAvatar} />
                        ) : (
                          <View style={[styles.partnerAvatar, styles.partnerAvatarEmpty]}><Ionicons name="person" size={10} color="rgba(255,255,255,0.4)" /></View>
                        )}
                        <Text style={[styles.partnerBtnText, selectedMatch === m.matchId && styles.partnerBtnTextActive]}>{m.partnerName}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.sectionLabel}>{t('workouts.rating')}</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(r => (
                  <TouchableOpacity key={r} onPress={() => setRating(r)}>
                    <Text style={[styles.ratingStar, r <= rating && styles.ratingStarActive]}>⭐</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>{t('workouts.notes')}</Text>
              <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} placeholder={t('workouts.notesPlaceholder')} placeholderTextColor="rgba(255,255,255,0.3)" multiline numberOfLines={3} />

              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={BG} /> : (
                  <><Ionicons name="checkmark" size={20} color={BG} /><Text style={styles.saveBtnText}>{t('workouts.save')}</Text></>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Karta 9:16 do udostepnienia — zdjecie profilowe jako tlo + pasek statystyk */}
      <Modal visible={!!shareWorkout} transparent animationType="fade" onRequestClose={() => setShareWorkout(null)}>
        <View style={styles.shareOverlay}>
          {shareWorkout && (
            <ViewShot ref={shareRef} options={{ format: 'png', quality: 1 }} style={styles.shareCard}>
              {myProfile?.photo_urls?.[0] ? (
                <Image source={{ uri: myProfile.photo_urls[0] }} style={styles.shareCardPhoto} blurRadius={0} />
              ) : (
                <LinearGradient colors={typeColors(shareWorkout.workout_type)} style={styles.shareCardPhoto} />
              )}
              <LinearGradient colors={['transparent', 'rgba(13,27,46,0.55)', 'rgba(13,27,46,0.96)']} style={styles.shareCardShade} />
              <View style={styles.shareCardTop}>
                <Text style={styles.shareCardDate}>{formatDate(shareWorkout.workout_date)}</Text>
              </View>
              <View style={styles.shareCardBottom}>
                <View style={styles.shareStatsRow}>
                  <View style={styles.shareStat}>
                    <Text style={styles.shareStatNum}>{shareWorkout.duration_minutes} min</Text>
                    <Text style={styles.shareStatLabel}>{t('workouts.shareTime')}</Text>
                  </View>
                  <View style={styles.shareStat}>
                    <Text style={styles.shareStatNum}>{t('workouts.types.' + shareWorkout.workout_type)}</Text>
                    <Text style={styles.shareStatLabel}>{t('workouts.shareType')}</Text>
                  </View>
                  <View style={styles.shareStat}>
                    <Text style={styles.shareStatNum}>{'🔥'} {(myProfile as any)?.current_streak ?? 0}</Text>
                    <Text style={styles.shareStatLabel}>{t('workouts.shareStreak')}</Text>
                  </View>
                </View>
                <View style={styles.shareBrandRow}>
                  <Text style={styles.shareBrand}>FitnessSwipe</Text>
                  <Text style={styles.shareBrandSub}>fitnessswipe.app</Text>
                </View>
              </View>
            </ViewShot>
          )}
          <View style={styles.shareActions}>
            <TouchableOpacity style={styles.shareGoBtn} onPress={handleShareCard} disabled={sharingCard}>
              {sharingCard ? <ActivityIndicator color={BG} /> : (
                <><Ionicons name="share-social" size={18} color={BG} /><Text style={styles.shareGoBtnText}>{t('workouts.shareCta')}</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setShareWorkout(null)}>
              <Text style={styles.shareCloseBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Ekran sukcesu po zapisie: streak + szybkie udostepnienie karty */}
      <Modal visible={!!successInfo} transparent animationType="fade" onRequestClose={() => setSuccessInfo(null)}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>{successInfo && successInfo.streak > 0 ? '🔥' : '✅'}</Text>
            <Text style={styles.successTitle}>{t('workouts.saved')}</Text>
            {successInfo && successInfo.streak > 0 && (
              <Text style={styles.successStreak}>{t('workouts.streakNow', { count: successInfo.streak })}</Text>
            )}
            <TouchableOpacity
              style={styles.successShareBtn}
              onPress={() => { const w = successInfo?.workout ?? null; setSuccessInfo(null); if (w) setShareWorkout(w) }}
            >
              <Ionicons name="share-social" size={17} color={BG} />
              <Text style={styles.successShareBtnText}>{t('workouts.shareCta')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successCloseBtn} onPress={() => setSuccessInfo(null)}>
              <Text style={styles.successCloseBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(125,197,46,0.2)' },
  statIcon: { marginBottom: 4 },
  statNum: { fontSize: 20, fontWeight: '800', color: PRIMARY },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  viewSwitch: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: BG_LIGHT, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  viewBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10 },
  viewBtnActive: { backgroundColor: 'rgba(125,197,46,0.15)' },
  viewBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  viewBtnTextActive: { color: PRIMARY },
  calendar: { marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  weekNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  weekNavBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: BG_LIGHT, alignItems: 'center', justifyContent: 'center' },
  weekRangeLabel: { fontSize: 13, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  weekStrip: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 16 },
  weekDayCard: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: BG_LIGHT },
  weekDayCardActive: { backgroundColor: PRIMARY },
  weekDayLetter: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  weekDayLetterActive: { color: 'rgba(13,27,46,0.6)' },
  weekDayNumber: { fontSize: 15, fontWeight: '700', color: '#fff', marginTop: 3 },
  weekDayNumberActive: { color: BG },
  weekDayDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 5 },
  daySection: { paddingHorizontal: 16, marginBottom: 16 },
  daySectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  addDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(125,197,46,0.1)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', borderStyle: 'dashed' },
  addDayBtnText: { color: PRIMARY, fontSize: 14, fontWeight: '600' },
  calendarHint: { alignItems: 'center', paddingVertical: 20 },
  calendarHintText: { fontSize: 14, color: 'rgba(255,255,255,0.3)' },
  list: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyIcon: { fontSize: 64 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  addFirstBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  addFirstBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  workoutCard: { flexDirection: 'row', backgroundColor: BG_LIGHT, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 10 },
  workoutStripe: { width: 5 },
  workoutInfo: { flex: 1, padding: 12 },
  workoutTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  workoutTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  workoutType: { fontSize: 15, fontWeight: '700', color: '#fff' },
  workoutDate: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  workoutPartner: { fontSize: 11, color: LIME, fontWeight: '600' },
  workoutNotes: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 16, fontStyle: 'italic' },
  durationPill: { backgroundColor: 'rgba(148,227,54,0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  durationPillText: { fontSize: 11, fontWeight: '700', color: LIME },
  workoutDeleteBtn: { padding: 10, justifyContent: 'flex-start' },
  workoutShareBtn: { padding: 10, justifyContent: 'flex-start' },
  headerStreakPill: { backgroundColor: 'rgba(240,180,41,0.15)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.4)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 },
  headerStreakText: { fontSize: 13, fontWeight: '800', color: '#f0b429' },
  repeatBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.5)', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14, backgroundColor: 'rgba(148,227,54,0.06)' },
  repeatBannerText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: LIME },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
  stepsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepsAutoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(148,227,54,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  stepsAutoBadgeText: { fontSize: 10, fontWeight: '700', color: LIME },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  typeTileWrap: { width: '31.5%' as any },
  typeTile: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 3, position: 'relative', overflow: 'hidden' },
  typeTileActive: { borderWidth: 1.5, borderColor: LIME },
  typeTileInactive: { borderWidth: 1.5, borderColor: 'transparent', opacity: 0.55 },
  typeTileCheck: { position: 'absolute', top: 5, right: 5, width: 15, height: 15, borderRadius: 8, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  typeTileLabel: { fontSize: 10, fontWeight: '700', color: '#fff', paddingHorizontal: 3 },
  durationSlider: { width: '100%', height: 36, marginBottom: 10 },
  partnerAvatar: { width: 20, height: 20, borderRadius: 10 },
  partnerAvatarEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  successCard: { width: '100%', backgroundColor: BG_LIGHT, borderRadius: 22, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(148,227,54,0.3)' },
  successEmoji: { fontSize: 44, marginBottom: 8 },
  successTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  successStreak: { fontSize: 15, fontWeight: '700', color: '#f0b429', marginTop: 6 },
  successShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 14, paddingVertical: 13, width: '100%', marginTop: 18 },
  successShareBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  successCloseBtn: { paddingVertical: 12 },
  successCloseBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  shareCard: { width: 290, aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden', backgroundColor: BG },
  shareCardPhoto: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  shareCardShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  shareCardTop: { position: 'absolute', top: 14, left: 16 },
  shareCardDate: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)', letterSpacing: 1, textTransform: 'uppercase' },
  shareCardBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 },
  shareStatsRow: { flexDirection: 'row', gap: 18, marginBottom: 12 },
  shareStat: {},
  shareStatNum: { fontSize: 17, fontWeight: '800', color: LIME },
  shareStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  shareBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 10 },
  shareBrand: { fontSize: 14, fontWeight: '800', color: '#fff' },
  shareBrandSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  shareActions: { marginTop: 18, width: 290, gap: 8 },
  shareGoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 14, paddingVertical: 14 },
  shareGoBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  shareCloseBtn: { alignItems: 'center', paddingVertical: 10 },
  shareCloseBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  dashCard: { marginHorizontal: 16, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, marginBottom: 12 },
  dashChartRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dashTitle: { fontSize: 12, fontWeight: '700', color: '#fff' },
  dashPartner: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
  dashBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 40 },
  dashBarCol: { justifyContent: 'flex-end' },
  dashBar: { width: 10, borderRadius: 3 },
  breakdownRow: { flexDirection: 'row', gap: 4, marginTop: 10 },
  breakdownSeg: { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  breakdownText: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  quickChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  quickChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  quickChipActive: { backgroundColor: 'rgba(148,227,54,0.15)', borderColor: LIME },
  quickChipText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  quickChipTextActive: { color: LIME },
  durationInput: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, color: '#fff', backgroundColor: 'rgba(255,255,255,0.06)', width: 60 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  formLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeRow: { gap: 10, paddingBottom: 4 },
  typeBtn: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: BG, minWidth: 70 },
  typeBtnActive: { backgroundColor: 'rgba(125,197,46,0.2)', borderColor: PRIMARY },
  typeIcon: { marginBottom: 4 },
  typeLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  typeLabelActive: { color: PRIMARY },
  input: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#fff', backgroundColor: BG },
  textarea: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  partnerRow: { gap: 10, paddingBottom: 4 },
  partnerBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: BG },
  partnerBtnActive: { backgroundColor: 'rgba(148,227,54,0.15)', borderColor: LIME },
  partnerBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  partnerBtnTextActive: { color: LIME, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingStar: { fontSize: 28, opacity: 0.3 },
  ratingStarActive: { opacity: 1 },
  timeStepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 },
  timeStepperGroup: { alignItems: 'center', gap: 8 },
  timeStepperBtn: { width: 44, height: 32, borderRadius: 10, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', alignItems: 'center', justifyContent: 'center' },
  timeStepperValue: { width: 70, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.4)', alignItems: 'center' },
  timeStepperValueText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  timeStepperLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 },
  timeStepperSep: { fontSize: 28, fontWeight: '800', color: 'rgba(255,255,255,0.3)', marginTop: -20 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 16, paddingVertical: 15, marginTop: 20, marginBottom: 8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: BG, fontSize: 16, fontWeight: '800' },
})
