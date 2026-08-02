import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import {
  supabase, getMyProfile, getPlanExercises, addPlanExercise, updatePlanExercise,
  deletePlanExercise, resetPlanChecks, updatePlanRest, logWorkoutToday,
} from '../../lib/supabase'
import type { PlanExercise, PlanSet } from '../../lib/supabase'
import { EXERCISE_LIBRARY, EXERCISE_CATEGORIES } from '../../lib/exerciseLibrary'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const REST_OPTIONS = [60, 90, 120, 180]

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [planName, setPlanName] = useState('')
  const [restSeconds, setRestSeconds] = useState(90)
  const [exercises, setExercises] = useState<PlanExercise[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [newExKind, setNewExKind] = useState<'strength' | 'cardio'>('strength')
  // Podpowiedzi z biblioteki popularnych cwiczen — user moze tapnac albo zignorowac i wpisac swoje
  const [libCategory, setLibCategory] = useState<string>('chest')
  const [finishing, setFinishing] = useState(false)
  // Timer przerwy miedzy seriami
  const [restLeft, setRestLeft] = useState(0)
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { load() }, [id])

  useEffect(() => {
    return () => { if (restInterval.current) clearInterval(restInterval.current) }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: plan } = await supabase.from('workout_plans').select('name, rest_seconds').eq('id', id).single()
      if (plan) { setPlanName(plan.name); setRestSeconds(plan.rest_seconds) }
      setExercises(await getPlanExercises(String(id)))
    } finally { setLoading(false) }
  }

  function startRest() {
    if (restInterval.current) clearInterval(restInterval.current)
    setRestLeft(restSeconds)
    restInterval.current = setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) {
          if (restInterval.current) clearInterval(restInterval.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function stopRest() {
    if (restInterval.current) clearInterval(restInterval.current)
    setRestLeft(0)
  }

  // Aktualizacja lokalna + zapis do bazy
  function patchExercise(exId: string, patch: Partial<PlanExercise>, persist = true) {
    setExercises(prev => prev.map(e => (e.id === exId ? { ...e, ...patch } : e)))
    if (persist) updatePlanExercise(exId, patch as any)
  }

  function setSetField(ex: PlanExercise, idx: number, field: 'w' | 'r', raw: string) {
    const num = raw.trim() === '' ? null : parseFloat(raw.replace(',', '.'))
    const sets = ex.sets.map((s, i) => (i === idx ? { ...s, [field]: isNaN(num as any) ? null : num } : s))
    // Bez zapisu przy kazdej literze — zapis w onBlur
    patchExercise(ex.id, { sets }, false)
  }

  function persistSets(ex: PlanExercise) {
    const current = exercises.find(e => e.id === ex.id)
    if (current) updatePlanExercise(ex.id, { sets: current.sets })
  }

  function toggleSet(ex: PlanExercise, idx: number) {
    const sets = ex.sets.map((s, i) => (i === idx ? { ...s, done: !s.done } : s))
    const wasChecking = !ex.sets[idx].done
    const allDone = sets.length > 0 && sets.every(s => s.done)
    patchExercise(ex.id, { sets, done: allDone })
    if (wasChecking) {
      if (allDone) stopRest()
      else startRest()
    }
  }

  function toggleExercise(ex: PlanExercise) {
    const done = !ex.done
    const sets = ex.sets.map(s => ({ ...s, done }))
    patchExercise(ex.id, { done, sets })
    if (done) stopRest()
  }

  function addSet(ex: PlanExercise) {
    const last = ex.sets[ex.sets.length - 1]
    const sets: PlanSet[] = [...ex.sets, { w: last?.w ?? null, r: last?.r ?? null, done: false }]
    patchExercise(ex.id, { sets })
  }

  function removeSet(ex: PlanExercise) {
    if (ex.sets.length <= 1) return
    const sets = ex.sets.slice(0, -1)
    patchExercise(ex.id, { sets, done: sets.every(s => s.done) })
  }

  async function handleAddExercise() {
    if (!newExName.trim()) return
    const ex = await addPlanExercise(String(id), newExName.trim(), exercises.length, newExKind)
    setNewExName('')
    setNewExKind('strength')
    setShowAdd(false)
    if (ex) { setExercises(prev => [...prev, ex]); setExpanded(ex.id) }
  }

  function handleDeleteExercise(ex: PlanExercise) {
    Alert.alert(t('plans.deleteExTitle'), ex.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plans.delete'), style: 'destructive', onPress: async () => { await deletePlanExercise(ex.id); setExercises(prev => prev.filter(e => e.id !== ex.id)) } },
    ])
  }

  async function handleFinish() {
    const doneCount = exercises.filter(e => e.done).length
    if (doneCount === 0) return
    Alert.alert(t('plans.finishTitle'), t('plans.finishMsg', { done: doneCount, total: exercises.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('plans.finishConfirm'),
        onPress: async () => {
          setFinishing(true)
          try {
            stopRest()
            await resetPlanChecks(String(id))
            // Trening z planu podbija passe i laduje w dzienniku (dzisiejszy check-in)
            const me = await getMyProfile()
            let milestoneMsg: string | null = null
            let milestoneTitle: string | null = null
            if (me) {
              try {
                const res = await logWorkoutToday(me.id)
                // Kamien milowy passy — pokaz nagrode zamiast zwyklego potwierdzenia
                if (res.milestone) {
                  milestoneTitle = t('streak.milestoneTitle', { count: res.milestone })
                  milestoneMsg = res.boosted ? t('streak.milestoneBoost') : t('streak.milestoneSwipes', { count: res.bonusSwipes })
                }
              } catch (e) { }
            }
            await load()
            if (milestoneTitle) Alert.alert(milestoneTitle, milestoneMsg ?? '')
            else Alert.alert('💪', t('plans.finished'))
          } finally { setFinishing(false) }
        },
      },
    ])
  }

  async function changeRest(sec: number) {
    setRestSeconds(sec)
    updatePlanRest(String(id), sec)
  }

  const doneCount = exercises.filter(e => e.done).length
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{planName}</Text>
          <Text style={styles.headerSub}>{t('plans.progress', { done: doneCount, total: exercises.length })}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Przerwa miedzy seriami */}
      <View style={styles.restRow}>
        <Text style={styles.restLabel}>☕ {t('plans.restLabel')}</Text>
        {REST_OPTIONS.map(sec => (
          <TouchableOpacity key={sec} style={[styles.restChip, restSeconds === sec && styles.restChipActive]} onPress={() => changeRest(sec)}>
            <Text style={[styles.restChipText, restSeconds === sec && styles.restChipTextActive]}>{fmt(sec)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {exercises.length === 0 && (
          <Text style={styles.emptyHint}>{t('plans.noExercises')}</Text>
        )}
        {exercises.map(ex => {
          const isOpen = expanded === ex.id
          return (
            <View key={ex.id} style={[styles.exCard, ex.done && styles.exCardDone, isOpen && styles.exCardOpen]}>
              <View style={styles.exTopRow}>
                <TouchableOpacity style={[styles.checkbox, ex.done && styles.checkboxOn]} onPress={() => toggleExercise(ex)}>
                  {ex.done && <Ionicons name="checkmark" size={14} color={BG} />}
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setExpanded(isOpen ? null : ex.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {ex.kind === 'cardio' && <Ionicons name="pulse" size={13} color="#4fc3f7" />}
                    <Text style={[styles.exName, ex.done && styles.exNameDone]} numberOfLines={1}>{ex.name}</Text>
                  </View>
                  <Text style={styles.exMeta}>
                    {ex.kind === 'cardio'
                      ? (ex.sets[0]?.w != null || ex.sets[0]?.r != null
                        ? `${ex.sets[0]?.w ?? '—'} min · ${ex.sets[0]?.r ?? '—'} kcal`
                        : t('plans.typeCardio'))
                      : t('plans.setsSummary', { count: ex.sets.length })}
                    {ex.kind !== 'cardio' && ex.sets.some(s => s.done) ? ` · ${ex.sets.filter(s => s.done).length}/${ex.sets.length} ✓` : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setExpanded(isOpen ? null : ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>

              {isOpen && (
                <View style={styles.setsBox}>
                  <View style={styles.setsHeader}>
                    <Text style={[styles.setsHeaderText, { width: 34 }]}>{ex.kind === 'cardio' ? '' : t('plans.setCol')}</Text>
                    <Text style={[styles.setsHeaderText, { flex: 1, textAlign: 'center' }]}>{ex.kind === 'cardio' ? 'MIN' : 'KG'}</Text>
                    <Text style={[styles.setsHeaderText, { flex: 1, textAlign: 'center' }]}>{ex.kind === 'cardio' ? 'KCAL' : t('plans.repsCol')}</Text>
                    <View style={{ width: 34 }} />
                  </View>
                  {ex.sets.map((s, idx) => (
                    <View key={idx} style={styles.setRow}>
                      {ex.kind === 'cardio' ? (
                        <Ionicons name="pulse" size={15} color="#4fc3f7" style={{ width: 34, textAlign: 'center' }} />
                      ) : (
                        <Text style={styles.setNum}>{idx + 1}</Text>
                      )}
                      <TextInput
                        style={[styles.setInput, s.done && styles.setInputDone]}
                        defaultValue={s.w != null ? String(s.w) : ''}
                        onChangeText={txt => setSetField(ex, idx, 'w', txt)}
                        onBlur={() => persistSets(ex)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                      />
                      <TextInput
                        style={[styles.setInput, s.done && styles.setInputDone]}
                        defaultValue={s.r != null ? String(s.r) : ''}
                        onChangeText={txt => setSetField(ex, idx, 'r', txt)}
                        onBlur={() => persistSets(ex)}
                        keyboardType="number-pad"
                        placeholder="—"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                      />
                      <TouchableOpacity style={[styles.setCheck, s.done && styles.setCheckOn]} onPress={() => toggleSet(ex, idx)}>
                        {s.done && <Ionicons name="checkmark" size={13} color={BG} />}
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={styles.setActions}>
                    {ex.kind !== 'cardio' && (
                      <TouchableOpacity style={styles.setActionBtn} onPress={() => addSet(ex)}>
                        <Text style={styles.setActionText}>+ {t('plans.addSet')}</Text>
                      </TouchableOpacity>
                    )}
                    {ex.kind !== 'cardio' && ex.sets.length > 1 && (
                      <TouchableOpacity style={styles.setActionBtn} onPress={() => removeSet(ex)}>
                        <Text style={styles.setActionText}>− {t('plans.removeSet')}</Text>
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => handleDeleteExercise(ex)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={17} color="rgba(255,107,120,0.8)" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>

      {/* Pasek timera przerwy */}
      {restLeft > 0 && (
        <View style={styles.restBar}>
          <Text style={styles.restBarText}>☕ {t('plans.restNow')} <Text style={styles.restBarTime}>{fmt(restLeft)}</Text></Text>
          <TouchableOpacity onPress={stopRest}>
            <Text style={styles.restBarSkip}>{t('plans.skipRest')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Zakoncz trening */}
      {doneCount > 0 && restLeft === 0 && (
        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish} disabled={finishing}>
          {finishing ? <ActivityIndicator color={BG} /> : (
            <Text style={styles.finishBtnText}>{t('plans.finish')} ({doneCount}/{exercises.length})</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Modal dodawania cwiczenia */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('plans.addExercise')}</Text>
            <View style={styles.kindRow}>
              {(['strength', 'cardio'] as const).map(k => {
                const active = newExKind === k
                const accent = k === 'strength' ? LIME : '#4fc3f7'
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindChip, active && { borderColor: accent, backgroundColor: k === 'strength' ? 'rgba(148,227,54,0.12)' : 'rgba(79,195,247,0.12)' }]}
                    onPress={() => { setNewExKind(k); setLibCategory(k === 'cardio' ? 'cardio' : 'chest') }}
                  >
                    <Ionicons name={k === 'strength' ? 'barbell' : 'pulse'} size={16} color={active ? accent : 'rgba(255,255,255,0.5)'} />
                    <Text style={[styles.kindChipText, active && { color: accent }]}>
                      {k === 'strength' ? t('plans.typeStrength') : t('plans.typeCardio')}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={styles.libLabel}>{t('plans.pickFromList')}</Text>
            {newExKind === 'strength' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.libCatRow}>
                {EXERCISE_CATEGORIES.filter(c => c !== 'cardio').map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.libCatChip, libCategory === cat && styles.libCatChipActive]}
                    onPress={() => setLibCategory(cat)}
                  >
                    <Text style={[styles.libCatChipText, libCategory === cat && styles.libCatChipTextActive]}>
                      {t('plans.exLib.cat.' + cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <ScrollView style={styles.libListWrap} showsVerticalScrollIndicator={false}>
              <View style={styles.libPillsWrap}>
                {EXERCISE_LIBRARY.filter(ex => ex.kind === newExKind && ex.category === libCategory).map(ex => {
                  const label = t('plans.exLib.name.' + ex.id)
                  const picked = newExName === label
                  return (
                    <TouchableOpacity
                      key={ex.id}
                      style={[styles.libPill, picked && styles.libPillActive]}
                      onPress={() => setNewExName(label)}
                    >
                      <Text style={[styles.libPillText, picked && styles.libPillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
            <Text style={styles.libLabel}>{t('plans.orTypeOwn')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={newExName}
              onChangeText={setNewExName}
              placeholder={newExKind === 'cardio' ? t('plans.cardioPlaceholder') : t('plans.exercisePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={60}
            />
            <TouchableOpacity style={[styles.sheetSaveBtn, !newExName.trim() && { opacity: 0.4 }]} onPress={handleAddExercise} disabled={!newExName.trim()}>
              <Text style={styles.sheetSaveText}>{t('plans.add')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowAdd(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 55, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: LIME, fontWeight: '700', marginTop: 1 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  restLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginRight: 2 },
  restChip: { backgroundColor: BG_LIGHT, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  restChipActive: { backgroundColor: LIME, borderColor: LIME },
  restChipText: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  restChipTextActive: { color: BG },
  emptyHint: { fontSize: 13.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 40, lineHeight: 20, paddingHorizontal: 24 },
  exCard: { backgroundColor: BG_LIGHT, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)' },
  exCardDone: { opacity: 0.55 },
  exCardOpen: { borderColor: 'rgba(148,227,54,0.4)' },
  exTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: LIME, borderColor: LIME },
  exName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  exNameDone: { textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.6)' },
  exMeta: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  setsBox: { marginTop: 10 },
  setsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  setsHeaderText: { fontSize: 9.5, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  setNum: { width: 34, fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  setInput: { flex: 1, backgroundColor: BG, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', paddingVertical: 8, fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center' },
  setInputDone: { borderColor: 'rgba(148,227,54,0.4)' },
  setCheck: { width: 34, height: 34, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  setCheckOn: { backgroundColor: LIME, borderColor: LIME },
  setActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  setActionBtn: { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  setActionText: { fontSize: 12, fontWeight: '700', color: LIME },
  restBar: { position: 'absolute', left: 16, right: 16, bottom: 20, backgroundColor: '#3a2c08', borderWidth: 1.5, borderColor: 'rgba(240,180,41,0.5)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  restBarText: { fontSize: 14, fontWeight: '700', color: '#ffd28a' },
  restBarTime: { fontSize: 16, fontWeight: '800', color: '#f0b429' },
  restBarSkip: { fontSize: 12.5, color: 'rgba(255,255,255,0.55)', textDecorationLine: 'underline' },
  finishBtn: { position: 'absolute', left: 16, right: 16, bottom: 20, backgroundColor: LIME, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  finishBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 14 },
  sheetInput: { backgroundColor: BG, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#fff' },
  sheetSaveBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  sheetSaveText: { color: BG, fontSize: 15, fontWeight: '800' },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindChip: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: BG, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  kindChipText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  libLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 4 },
  libCatRow: { gap: 6, paddingBottom: 8 },
  libCatChip: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: BG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  libCatChipActive: { backgroundColor: 'rgba(148,227,54,0.15)', borderColor: LIME },
  libCatChipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  libCatChipTextActive: { color: LIME },
  libListWrap: { maxHeight: 130, marginBottom: 10 },
  libPillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  libPill: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: BG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  libPillActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  libPillText: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  libPillTextActive: { color: BG, fontWeight: '800' },
})
