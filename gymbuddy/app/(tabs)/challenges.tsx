import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Modal, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Share
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { router, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  supabase, getMyProfile, getChallenges, getMyChallenges, createChallenge,
  joinChallenge, leaveChallenge, updateChallengeProgress, getChallengeParticipants,
  deleteChallenge
} from '../../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Kazdy typ celu ma wlasny kolor baneru
const GOAL_TYPES = [
  { code: 'weight_loss', icon: 'trending-down', unit: 'kg', colors: ['#0e4a63', '#1a7fa8'] },
  { code: 'distance_running', icon: 'walk', unit: 'km', colors: ['#7a3b10', '#c26422'] },
  { code: 'distance_cycling', icon: 'bicycle', unit: 'km', colors: ['#4a2570', '#7a42b5'] },
  { code: 'padel_sessions', icon: 'tennisball', unit: 'sessions', colors: ['#0f6b46', '#17a06a'] },
  { code: 'pickleball_sessions', icon: 'baseball-outline', unit: 'sessions', colors: ['#7a1f4a', '#b53b78'] },
  { code: 'hyrox', icon: 'fitness', unit: 'workouts', colors: ['#5c1010', '#a32020'] },
  { code: 'walking_steps', icon: 'footsteps', unit: 'steps', colors: ['#2d5016', '#4f8422'] },
  { code: 'cold_exposure', icon: 'snow', unit: 'sessions', colors: ['#173f66', '#2e7ab8'] },
  { code: 'custom', icon: 'flag', unit: '', colors: ['#37474f', '#5a7484'] },
]

function getGoalColors(goalType: string): [string, string] {
  const g = GOAL_TYPES.find(x => x.code === goalType)
  return (g?.colors as [string, string]) ?? ['#37474f', '#5a7484']
}

// Szablony szybkiego startu - tapniecie wypelnia caly formularz
const CHALLENGE_TEMPLATES = [
  { key: 'tplRun50', emoji: '🏃', type: 'distance_running', value: '50', unit: 'km', days: '30' },
  { key: 'tplWorkouts30', emoji: '💪', type: 'custom', value: '30', unitKey: 'unitWorkouts', days: '30' },
  { key: 'tplPadel10', emoji: '🎾', type: 'padel_sessions', value: '10', unitKey: 'unitSessions', days: '30' },
  { key: 'tplHyrox', emoji: '💥', type: 'hyrox', value: '8', unitKey: 'unitWorkouts', days: '56' },
  { key: 'tplPickle10', emoji: '🏓', type: 'pickleball_sessions', value: '10', unitKey: 'unitSessions', days: '30' },
  { key: 'tplLose5', emoji: '⚖️', type: 'weight_loss', value: '5', unit: 'kg', days: '60' },
  { key: 'tplCold15', emoji: '🧊', type: 'cold_exposure', value: '15', unitKey: 'unitSessions', days: '30' },
  { key: 'tplCycle200', emoji: '🚴', type: 'distance_cycling', value: '200', unit: 'km', days: '30' },
  { key: 'tplSteps300k', emoji: '🚶', type: 'walking_steps', value: '300000', unitKey: 'unitSteps', days: '30' },
]

// Pierscien postepu wokol procentu (jak aktywnosc w smartwatchu); 🏅 po ukonczeniu
function ProgressRing({ pct }: { pct: number }) {
  const R = 17
  const C = 2 * Math.PI * R
  const done = pct >= 100
  return (
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={44} height={44} style={{ position: 'absolute' }}>
        <Circle cx={22} cy={22} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={4} fill="none" />
        <Circle
          cx={22} cy={22} r={R}
          stroke={done ? '#ffc732' : LIME}
          strokeWidth={4} fill="none"
          strokeDasharray={`${C}`}
          strokeDashoffset={C * (1 - Math.min(1, pct / 100))}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </Svg>
      {done ? (
        <Text style={{ fontSize: 15 }}>🏅</Text>
      ) : (
        <Text style={{ fontSize: 9, fontWeight: '800', color: LIME }}>{Math.round(pct)}%</Text>
      )}
    </View>
  )
}

export default function ChallengesScreen() {
  const { t } = useTranslation()
  const [myProfile, setMyProfile] = useState<any>(null)
  const [todaySteps, setTodaySteps] = useState<number | null>(null)
  const [challenges, setChallenges] = useState<any[]>([])
  const [myChallengeIds, setMyChallengeIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [radiusFilter, setRadiusFilter] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'popular' | 'new' | 'ending'>('popular')
  const [myProgressMap, setMyProgressMap] = useState<Record<string, number>>({})
  const [participantAvatars, setParticipantAvatars] = useState<Record<string, string[]>>({})
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteMatches, setInviteMatches] = useState<any[]>([])
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newGoalType, setNewGoalType] = useState('weight_loss')
  const [newGoalValue, setNewGoalValue] = useState('')
  const [newGoalUnit, setNewGoalUnit] = useState('kg')
  const [newDurationDays, setNewDurationDays] = useState('30')
  const [newRadiusKm, setNewRadiusKm] = useState('50')
  const [createStage, setCreateStage] = useState<'templates' | 'form'>('templates')
  const [notifyNearby, setNotifyNearby] = useState(true)
  const [aiText, setAiText] = useState('')
  const [aiParsing, setAiParsing] = useState(false)

  const [selectedChallenge, setSelectedChallenge] = useState<any>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [myProgress, setMyProgress] = useState('')
  const [updatingProgress, setUpdatingProgress] = useState(false)
  // Wyzwania na kroki: gdy zegarek/telefon jest podpiety, postep dobija sie sam
  // (syncStepsToChallenges) — reczne wpisywanie chowamy, chyba ze user sam je odblokuje
  const [stepOverrides, setStepOverrides] = useState<Set<string>>(new Set())
  const STEP_OVERRIDE_KEY = 'challenge_step_manual_override'

  useEffect(() => {
    AsyncStorage.getItem(STEP_OVERRIDE_KEY).then(raw => {
      if (raw) { try { setStepOverrides(new Set(JSON.parse(raw))) } catch (e) { } }
    })
  }, [])

  function enableManualSteps(challengeId: string) {
    setStepOverrides(prev => {
      const next = new Set(prev).add(challengeId)
      AsyncStorage.setItem(STEP_OVERRIDE_KEY, JSON.stringify([...next])).catch(() => { })
      return next
    })
  }

  // Kroki sa auto-synchronizowane wtedy i tylko wtedy, gdy user ma podpiety
  // zegarek/telefon (todaySteps !== null) i nie wlaczyl recznego trybu sam
  function isStepAutoSynced(challenge: any): boolean {
    return challenge?.goal_type === 'walking_steps' && todaySteps !== null && !stepOverrides.has(challenge.id)
  }

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [])
  )

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      setMyProfile(me)
      if (me) {
        // Health Connect: kroki z zegarka automatycznie dobijaja wyzwania krokowe
        try {
          const { syncStepsToChallenges, getTodaySteps } = await import('../../lib/health')
          await syncStepsToChallenges(me.id)
          setTodaySteps(await getTodaySteps())
        } catch (e) { }
        const all = await getChallenges((me as any).latitude ?? 0, (me as any).longitude ?? 0)
        setChallenges(all)
        const mine = await getMyChallenges(me.id)
        setMyChallengeIds(new Set(mine.map((m: any) => m.challenge_id)))
        // Moj postep per wyzwanie - do pierscienia na karcie
        const pm: Record<string, number> = {}
        mine.forEach((m: any) => { pm[m.challenge_id] = m.current_progress ?? 0 })
        setMyProgressMap(pm)
        // Awatary uczestnikow (max 3 na karte)
        const ids = all.map((c: any) => c.id)
        if (ids.length > 0) {
          const { data: partRows } = await supabase
            .from('challenge_participants')
            .select('challenge_id, profiles(photo_urls)')
            .in('challenge_id', ids)
          const av: Record<string, string[]> = {}
          ;(partRows ?? []).forEach((r: any) => {
            const url = r.profiles?.photo_urls?.[0]
            if (!url) return
            if (!av[r.challenge_id]) av[r.challenge_id] = []
            if (av[r.challenge_id].length < 3) av[r.challenge_id].push(url)
          })
          setParticipantAvatars(av)
        }
      }
    } catch (e) {
      console.log('loadData challenges error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateChallenge() {
    if (!myProfile) return
    if (!newTitle.trim()) { Alert.alert(t('challenges.fillTitle') || 'Please enter a title'); return }
    const goalValue = parseFloat(newGoalValue)
    if (!goalValue || goalValue <= 0) { Alert.alert(t('challenges.fillGoal') || 'Please enter a valid goal'); return }
    const days = parseInt(newDurationDays) || 30
    const radius = Math.min(200, Math.max(1, parseInt(newRadiusKm) || 50))

    setCreating(true)
    try {
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + days)
      const result = await createChallenge(
        myProfile.id,
        newTitle.trim(),
        newDescription.trim(),
        newGoalType,
        goalValue,
        newGoalUnit,
        endDate.toISOString().split('T')[0],
        radius,
        (myProfile as any).latitude ?? 0,
        (myProfile as any).longitude ?? 0
      )
      if (result.success) {
        // Powiadom matchy w zasiegu o nowym wyzwaniu
        if (notifyNearby) {
          try {
            const { notifyMatchesNearby } = await import('../../lib/notifications')
            notifyMatchesNearby(
              myProfile.id,
              (myProfile as any).latitude ?? 0,
              (myProfile as any).longitude ?? 0,
              radius,
              '🏆 ' + myProfile.name,
              (t('challenges.nearbyNotifyBody') || 'utworzył(a) nowe wyzwanie w Twojej okolicy:') + ' „' + newTitle.trim() + '"',
              { type: 'challenge_new', challengeId: result.challengeId }
            )
          } catch (e) { }
        }
        setShowCreateModal(false)
        setNewTitle('')
        setNewDescription('')
        setNewGoalValue('')
        setNewDurationDays('30')
        setNewRadiusKm('50')
        await loadData()
        const { checkAndCelebrateBadges } = await import('../../lib/badges')
        await checkAndCelebrateBadges(myProfile.id, t)
        Alert.alert('💪', t('challenges.created') || 'Challenge created!')
      } else {
        Alert.alert(t('common.error'))
      }
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  function applyTemplate(tpl: any) {
    const unit = tpl.unit ?? (t('challenges.' + tpl.unitKey) || tpl.unitKey)
    setNewTitle(t('challenges.' + tpl.key) || tpl.key)
    setNewGoalType(tpl.type)
    setNewGoalValue(tpl.value)
    setNewGoalUnit(unit)
    setNewDurationDays(tpl.days)
    setCreateStage('form')
  }

  // AI: "chce przebiec 80 km w 3 tygodnie" -> wypelnione pola formularza
  async function parseWithAI() {
    if (!aiText.trim() || aiParsing) return
    setAiParsing(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai', {
        body: { action: 'parse-challenge', text: aiText.trim() },
      })
      if (error) throw error
      const clean = (data?.content ?? '').replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      if (parsed.goal_type && GOAL_TYPES.some(g => g.code === parsed.goal_type)) setNewGoalType(parsed.goal_type)
      if (parsed.goal_value) setNewGoalValue(String(parsed.goal_value))
      if (parsed.goal_unit) setNewGoalUnit(String(parsed.goal_unit))
      if (parsed.duration_days) setNewDurationDays(String(parsed.duration_days))
      if (parsed.title) setNewTitle(String(parsed.title))
    } catch (e) {
      Alert.alert(t('common.error'), t('challenges.aiParseError') || 'Nie udało się rozpoznać opisu — wypełnij pola ręcznie.')
    } finally {
      setAiParsing(false)
    }
  }

  // Auto-tytul z typu + wartosci + czasu, np. "Bieganie: 50 km w 30 dni"
  function buildAutoTitle() {
    const goalLabel = t('challenges.goalTypes.' + newGoalType) || newGoalType
    const title = t('challenges.autoTitle', {
      goal: goalLabel,
      value: newGoalValue || '?',
      unit: newGoalUnit,
      days: newDurationDays || '30',
    }) || `${goalLabel}: ${newGoalValue} ${newGoalUnit} w ${newDurationDays} dni`
    setNewTitle(title)
  }

  async function handleJoinToggle(challengeId: string) {
    if (!myProfile) return
    const isJoined = myChallengeIds.has(challengeId)
    try {
      if (isJoined) {
        await leaveChallenge(challengeId, myProfile.id)
        setMyChallengeIds(prev => { const s = new Set(prev); s.delete(challengeId); return s })
      } else {
        await joinChallenge(challengeId, myProfile.id)
        setMyChallengeIds(prev => new Set(prev).add(challengeId))
        const { checkAndCelebrateBadges } = await import('../../lib/badges')
        await checkAndCelebrateBadges(myProfile.id, t)
      }
      await loadData()
    } catch (e) {
      Alert.alert(t('common.error'))
    }
  }

  async function openChallengeDetail(challenge: any) {
    setSelectedChallenge(challenge)
    setLoadingParticipants(true)
    setMyProgress('')
    try {
      const parts = await getChallengeParticipants(challenge.id)
      setParticipants(parts)
      const mine = parts.find((p: any) => p.profile_id === myProfile?.id)
      if (mine) setMyProgress(String(mine.current_progress ?? 0))
    } catch (e) {
      console.log('openChallengeDetail error:', e)
    } finally {
      setLoadingParticipants(false)
    }
  }

  async function handleUpdateProgress() {
    if (!selectedChallenge || !myProfile) return
    const progress = parseFloat(myProgress)
    if (isNaN(progress) || progress < 0) { Alert.alert(t('challenges.invalidProgress') || 'Please enter a valid number'); return }
    setUpdatingProgress(true)
    try {
      const before = myProgressMap[selectedChallenge.id] ?? 0
      await updateChallengeProgress(selectedChallenge.id, myProfile.id, progress)
      setMyProgressMap(prev => ({ ...prev, [selectedChallenge.id]: progress }))
      const goal = selectedChallenge.goal_value ?? 1
      if (before < goal && progress >= goal) celebrateCompletion(selectedChallenge)
      await openChallengeDetail(selectedChallenge)
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setUpdatingProgress(false)
    }
  }

  // Szybki "+" na karcie - dobija postep o 1 bez otwierania szczegolow
  async function quickAddProgress(challenge: any) {
    if (!myProfile) return
    const current = myProgressMap[challenge.id] ?? 0
    const goal = challenge.goal_value ?? 1
    const next = current + 1
    setMyProgressMap(prev => ({ ...prev, [challenge.id]: next }))
    const ok = await updateChallengeProgress(challenge.id, myProfile.id, next)
    if (!ok) {
      setMyProgressMap(prev => ({ ...prev, [challenge.id]: current }))
      return
    }
    if (current < goal && next >= goal) celebrateCompletion(challenge)
  }

  async function celebrateCompletion(challenge: any) {
    Alert.alert(
      '🎉 ' + (t('challenges.completedTitle') || 'Wyzwanie ukończone!'),
      (t('challenges.completedMsg') || 'Cel osiągnięty:') + ' ' + challenge.title
    )
    try {
      if (!myProfile) return
      const { data: existing } = await supabase
        .from('profile_badges')
        .select('id')
        .eq('profile_id', myProfile.id)
        .eq('badge_code', 'challenge_completed')
        .maybeSingle()
      if (!existing) {
        const { error } = await supabase
          .from('profile_badges')
          .insert({ profile_id: myProfile.id, badge_code: 'challenge_completed' })
        if (!error) {
          Alert.alert(
            '🏅 ' + (t('achievements.newBadge') || 'New Achievement!'),
            t('achievements.challenge_completed_name') || 'Challenge Master'
          )
        }
      }
    } catch (e) { console.log('celebrateCompletion badge error:', e) }
  }

  // Zapraszanie matchy do wyzwania (push in-app)
  async function openInviteMatches() {
    if (!myProfile) return
    setShowInviteModal(true)
    setLoadingInvites(true)
    setInvitedIds(new Set())
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .or(`profile_a_id.eq.${myProfile.id},profile_b_id.eq.${myProfile.id}`)
        .not('is_trainer_chat', 'is', true)
      const list: any[] = []
      for (const m of matchData ?? []) {
        const otherId = m.profile_a_id === myProfile.id ? m.profile_b_id : m.profile_a_id
        const { data: other } = await supabase.from('profiles').select('id, name, photo_urls').eq('id', otherId).single()
        if (other) list.push(other)
      }
      setInviteMatches(list)
    } catch (e) { console.log('openInviteMatches error:', e) }
    finally { setLoadingInvites(false) }
  }

  async function handleInviteMatch(other: any) {
    if (!myProfile || !selectedChallenge || invitedIds.has(other.id)) return
    setInvitedIds(prev => new Set(prev).add(other.id))
    try {
      const { notifyProfile } = await import('../../lib/notifications')
      notifyProfile(
        other.id,
        '🏆 ' + myProfile.name,
        (t('challenges.inviteBody') || 'zaprasza Cię do wyzwania') + ' „' + selectedChallenge.title + '"',
        { type: 'challenge_invite', challengeId: selectedChallenge.id }
      )
    } catch (e) { console.log('handleInviteMatch error:', e) }
  }

  async function handleDeleteChallenge() {
    if (!selectedChallenge) return
    Alert.alert(
      t('challenges.deleteConfirmTitle') || 'Delete challenge?',
      t('challenges.deleteConfirmMsg') || 'This will remove the challenge for all participants. This cannot be undone.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteChallenge(selectedChallenge.id)
            if (success) {
              setSelectedChallenge(null)
              await loadData()
            } else {
              Alert.alert(t('common.error'))
            }
          }
        }
      ]
    )
  }

  async function handleShareChallenge(challenge: any) {
    try {
      const daysLeft = getDaysLeft(challenge.end_date)
      const link = `https://fitnessswipe.app/challenge/${challenge.id}`
      const message = t('challenges.shareMessage', {
        title: challenge.title,
        goal: `${challenge.goal_value} ${challenge.goal_unit}`,
        days: daysLeft,
        link,
      }) || `💪 Join me on the "${challenge.title}" challenge on FitnessSwipe!\n\nGoal: ${challenge.goal_value} ${challenge.goal_unit} in ${daysLeft} days.\n\nJoin here: ${link}`

      await Share.share({
        message,
        title: challenge.title,
      })
    } catch (e) {
      console.log('Share error:', e)
    }
  }

  function getGoalIcon(goalType: string) {
    return GOAL_TYPES.find(g => g.code === goalType)?.icon ?? 'flag'
  }

  function getDaysLeft(endDate: string) {
    const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
  }

  function isNewChallenge(createdAt: string) {
    const hoursSinceCreation = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
    return hoursSinceCreation < 48
  }

  const displayedChallenges = challenges
    .filter(c => activeTab === 'mine' ? myChallengeIds.has(c.id) : true)
    .filter(c => searchQuery.trim() === '' || c.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .filter(c => radiusFilter === null || c.distance_km == null || c.distance_km <= radiusFilter)
    .sort((a, b) => {
      if (sortBy === 'popular') return (b.participant_count ?? 0) - (a.participant_count ?? 0)
      if (sortBy === 'new') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return getDaysLeft(a.end_date) - getDaysLeft(b.end_date)
    })

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('challenges.title') || 'Challenges'}</Text>
          <Text style={styles.headerSubtitle}>{t('challenges.subtitle') || 'Set goals, track progress, stay motivated'}</Text>
        </View>
        <TouchableOpacity style={styles.eventsLinkBtn} onPress={() => router.push('/sports-events' as any)}>
          <Ionicons name="flag" size={22} color="#00aaff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.createBtn} onPress={() => { setCreateStage('templates'); setShowCreateModal(true) }}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Kroki dzis z Health Connect */}
      {todaySteps !== null && (
        <View style={styles.stepsPill}>
          <Text style={styles.stepsPillText}>{'👟'} {todaySteps.toLocaleString()} {t('health.stepsToday')}</Text>
        </View>
      )}

      {/* Kafel: ekipa na dzis (jednodniowe ogloszenia "szukam ludzi") */}
      <TouchableOpacity onPress={() => router.push('/squad' as any)} activeOpacity={0.85}>
        <LinearGradient colors={['#3f6212', '#7dc52e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.trainersTile}>
          <Ionicons name="flash" size={18} color="#fff" />
          <Text style={styles.trainersTileText}>{t('squad.tileTitle')}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Kafel: katalog trenerow */}
      <TouchableOpacity onPress={() => router.push('/trainers' as any)} activeOpacity={0.85}>
        <LinearGradient colors={['#0e4a63', '#1a7fa8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.trainersTile}>
          <Ionicons name="school" size={18} color="#fff" />
          <Text style={styles.trainersTileText}>{t('trainer.nearbyBanner')}</Text>
          <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.8)" />
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.tabSwitch}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]} onPress={() => setActiveTab('all')}>
          <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>{t('challenges.allChallenges') || 'All'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'mine' && styles.tabBtnActive]} onPress={() => setActiveTab('mine')}>
          <Text style={[styles.tabBtnText, activeTab === 'mine' && styles.tabBtnTextActive]}>{t('challenges.myChallenges') || 'My challenges'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('challenges.searchPlaceholder') || 'Search challenges...'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterIconBtn, radiusFilter !== null && styles.filterIconBtnActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options" size={18} color={radiusFilter !== null ? '#fff' : PRIMARY} />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.radiusFilterRow}>
          <Text style={styles.radiusFilterLabel}>{t('challenges.maxDistance') || 'Max distance'}:</Text>
          {[10, 50, 100, 200].map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusFilterChip, radiusFilter === r && styles.radiusFilterChipActive]}
              onPress={() => setRadiusFilter(radiusFilter === r ? null : r)}
            >
              <Text style={[styles.radiusFilterChipText, radiusFilter === r && styles.radiusFilterChipTextActive]}>{r} km</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Sortowanie */}
      <View style={styles.sortRow}>
        {([
          { code: 'popular', label: '🔥 ' + (t('challenges.sortPopular') || 'Popularne') },
          { code: 'new', label: '✨ ' + (t('challenges.sortNew') || 'Nowe') },
          { code: 'ending', label: '⏳ ' + (t('challenges.sortEnding') || 'Kończą się') },
        ] as const).map(s => (
          <TouchableOpacity
            key={s.code}
            style={[styles.sortChip, sortBy === s.code && styles.sortChipActive]}
            onPress={() => setSortBy(s.code)}
          >
            <Text style={[styles.sortChipText, sortBy === s.code && styles.sortChipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {displayedChallenges.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="trophy-outline" size={36} color={PRIMARY} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'mine'
                ? (t('challenges.noneJoined') || "You haven't joined any challenges yet")
                : (t('challenges.noneYet') || 'No challenges yet')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t('challenges.createFirst') || 'Create the first one and invite others to join!'}
            </Text>
          </View>
        ) : (
          displayedChallenges.map((challenge) => {
            const isJoined = myChallengeIds.has(challenge.id)
            const participantCount = challenge.participant_count ?? 0
            const daysLeft = getDaysLeft(challenge.end_date)
            const urgent = daysLeft > 0 && daysLeft <= 3
            const goal = challenge.goal_value ?? 1
            const pct = Math.min(100, ((myProgressMap[challenge.id] ?? 0) / goal) * 100)
            const avatars = participantAvatars[challenge.id] ?? []
            return (
              <TouchableOpacity key={challenge.id} style={styles.bannerCard} onPress={() => openChallengeDetail(challenge)} activeOpacity={0.85}>
                <LinearGradient colors={getGoalColors(challenge.goal_type)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bannerTop}>
                  <Ionicons name={getGoalIcon(challenge.goal_type) as any} size={76} color="rgba(255,255,255,0.13)" style={styles.bannerGhostIcon} />
                  <View style={styles.bannerTopRow}>
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{(t('challenges.goalTypes.' + challenge.goal_type) || challenge.goal_type).toUpperCase()}</Text>
                    </View>
                    {isNewChallenge(challenge.created_at) && (
                      <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>{t('challenges.new') || 'NEW'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <View style={[styles.daysPill, urgent && styles.daysPillUrgent]}>
                      <Ionicons name="time-outline" size={11} color={urgent ? '#ff8080' : 'rgba(255,255,255,0.85)'} />
                      <Text style={[styles.daysPillText, urgent && styles.daysPillTextUrgent]}>
                        {daysLeft > 0 ? `${daysLeft} ${t('challenges.daysShort') || 'dni'}` : (t('challenges.ended') || 'Ended')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.bannerTitle} numberOfLines={1}>{challenge.title}</Text>
                  <Text style={styles.bannerSubtitle}>
                    {t('challenges.goal') || 'Goal'}: {challenge.goal_value} {challenge.goal_unit}
                  </Text>
                </LinearGradient>
                <View style={styles.bannerBottom}>
                  {avatars.length > 0 ? (
                    <View style={styles.avatarsStack}>
                      {avatars.map((u, idx) => (
                        <Image key={idx} source={{ uri: u }} style={[styles.stackAvatar, idx > 0 && { marginLeft: -8 }]} />
                      ))}
                      <Text style={styles.stackCount}>{participantCount}</Text>
                    </View>
                  ) : (
                    <View style={styles.avatarsStack}>
                      <Ionicons name="people-outline" size={15} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.stackCount}>{participantCount}</Text>
                    </View>
                  )}
                  {challenge.distance_km != null && (
                    <Text style={styles.bannerDistance}>
                      <Ionicons name="navigate-outline" size={11} color={LIME} /> {challenge.distance_km < 1 ? '< 1 km' : Math.round(challenge.distance_km) + ' km'}
                    </Text>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={styles.shareBtn} onPress={() => handleShareChallenge(challenge)}>
                    <Ionicons name="share-social-outline" size={17} color="rgba(255,255,255,0.55)" />
                  </TouchableOpacity>
                  {isJoined ? (
                    <View style={styles.progressGroup}>
                      <ProgressRing pct={pct} />
                      {pct < 100 && daysLeft > 0 && !isStepAutoSynced(challenge) && (
                        <TouchableOpacity style={styles.quickAddBtn} onPress={() => quickAddProgress(challenge)}>
                          <Ionicons name="add" size={22} color={BG} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.joinPill} onPress={() => handleJoinToggle(challenge.id)}>
                      <Text style={styles.joinPillText}>{t('challenges.joinBtn') || 'Dołącz'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* MODAL: Create Challenge */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <View style={styles.createModal}>
            <View style={styles.modalHeader}>
              {createStage === 'form' && (
                <TouchableOpacity onPress={() => setCreateStage('templates')} style={{ marginRight: 10 }}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
              )}
              <Text style={styles.modalTitle}>{t('challenges.newChallenge') || 'New Challenge'}</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {createStage === 'templates' ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>{t('challenges.startFromTemplate') || 'Zacznij od szablonu'}</Text>
                <View style={styles.templatesGrid}>
                  {CHALLENGE_TEMPLATES.map(tpl => (
                    <TouchableOpacity key={tpl.key} style={styles.templateTileWrap} onPress={() => applyTemplate(tpl)} activeOpacity={0.85}>
                      <LinearGradient colors={getGoalColors(tpl.type)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.templateTile}>
                        <Text style={{ fontSize: 20 }}>{tpl.emoji}</Text>
                        <Text style={styles.templateTitle} numberOfLines={2}>{t('challenges.' + tpl.key) || tpl.key}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                  {/* Wlasne od zera - rownorzedny kafel z przerywana ramka */}
                  <TouchableOpacity
                    style={styles.templateTileWrap}
                    activeOpacity={0.85}
                    onPress={() => {
                      setNewTitle(''); setNewGoalValue(''); setNewGoalType('weight_loss'); setNewGoalUnit('kg'); setNewDurationDays('30'); setAiText('')
                      setCreateStage('form')
                    }}
                  >
                    <View style={styles.customTile}>
                      <View style={styles.customTilePlus}>
                        <Ionicons name="add" size={18} color={LIME} />
                      </View>
                      <Text style={styles.customTileText}>{t('challenges.customFromScratch') || 'Własne od zera'}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Podglad na zywo - karta buduje sie podczas wypelniania */}
              <Text style={styles.previewLabel}>{t('challenges.previewLabel') || 'Tak zobaczą to inni'}</Text>
              <View style={styles.bannerCard}>
                <LinearGradient colors={getGoalColors(newGoalType)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bannerTop}>
                  <Ionicons name={getGoalIcon(newGoalType) as any} size={56} color="rgba(255,255,255,0.13)" style={styles.bannerGhostIcon} />
                  <View style={styles.bannerTopRow}>
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{(t('challenges.goalTypes.' + newGoalType) || newGoalType).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <View style={styles.daysPill}>
                      <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.daysPillText}>{newDurationDays || '30'} {t('challenges.daysShort') || 'dni'}</Text>
                    </View>
                  </View>
                  <Text style={styles.bannerTitle} numberOfLines={1}>{newTitle || '…'}</Text>
                  <Text style={styles.bannerSubtitle}>
                    {t('challenges.goal') || 'Goal'}: {newGoalValue || '?'} {newGoalUnit}
                  </Text>
                </LinearGradient>
              </View>

              {/* AI: opisz jednym zdaniem, reszta wypelni sie sama */}
              <View style={styles.aiParseBox}>
                <TextInput
                  style={styles.aiParseInput}
                  placeholder={'✨ ' + (t('challenges.aiDescribe') || 'Opisz jednym zdaniem, np. „przebiegnę 80 km w 3 tygodnie"')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={aiText}
                  onChangeText={setAiText}
                />
                <TouchableOpacity
                  style={[styles.aiParseBtn, (!aiText.trim() || aiParsing) && { opacity: 0.5 }]}
                  onPress={parseWithAI}
                  disabled={!aiText.trim() || aiParsing}
                >
                  {aiParsing ? <ActivityIndicator size="small" color={BG} /> : <Ionicons name="sparkles" size={16} color={BG} />}
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('challenges.titleLabel') || 'Title'}</Text>
              <View style={styles.titleRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t('challenges.titlePlaceholder') || 'e.g. Lose 5kg by September'}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={newTitle}
                  onChangeText={setNewTitle}
                />
                <TouchableOpacity style={styles.autoTitleBtn} onPress={buildAutoTitle}>
                  <Text style={{ fontSize: 16 }}>✨</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('challenges.descriptionLabel') || 'Description (optional)'}</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder={t('challenges.descriptionPlaceholder') || 'Add some details or motivation...'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />

              <Text style={styles.label}>{t('challenges.goalType') || 'Goal type'}</Text>
              <View style={styles.typeTilesGrid}>
                {GOAL_TYPES.map(g => {
                  const active = newGoalType === g.code
                  return (
                    <TouchableOpacity
                      key={g.code}
                      style={styles.typeTileWrap}
                      activeOpacity={0.85}
                      onPress={() => { setNewGoalType(g.code); setNewGoalUnit(g.unit) }}
                    >
                      <LinearGradient
                        colors={getGoalColors(g.code)}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={[styles.typeTile, active ? styles.typeTileActive : styles.typeTileInactive]}
                      >
                        {active && (
                          <View style={styles.typeTileCheck}>
                            <Ionicons name="checkmark" size={11} color={BG} />
                          </View>
                        )}
                        <Ionicons name={g.icon as any} size={20} color="#fff" />
                        <Text style={styles.typeTileText} numberOfLines={1}>
                          {t('challenges.goalTypes.' + g.code) || g.code}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('challenges.goalValue') || 'Goal value'}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="5"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={newGoalValue}
                    onChangeText={setNewGoalValue}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('challenges.unit') || 'Unit'}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="kg"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={newGoalUnit}
                    onChangeText={setNewGoalUnit}
                  />
                </View>
              </View>

              {/* Chipy jednostek - jedno tapniecie zamiast wpisywania */}
              <View style={styles.unitChipsRow}>
                {['kg', 'km', t('challenges.unitSteps') || 'kroki', t('challenges.unitWorkouts') || 'treningi', t('challenges.unitSessions') || 'sesje'].map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitChip, newGoalUnit === u && styles.unitChipActive]}
                    onPress={() => setNewGoalUnit(u)}
                  >
                    <Text style={[styles.unitChipText, newGoalUnit === u && styles.unitChipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('challenges.duration') || 'Duration (days)'}</Text>
              <View style={styles.unitChipsRow}>
                {['7', '14', '30', '60'].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.unitChip, newDurationDays === d && styles.unitChipActive]}
                    onPress={() => setNewDurationDays(d)}
                  >
                    <Text style={[styles.unitChipText, newDurationDays === d && styles.unitChipTextActive]}>{d} {t('challenges.daysShort') || 'dni'}</Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={styles.durationInput}
                  placeholder="30"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={['7', '14', '30', '60'].includes(newDurationDays) ? '' : newDurationDays}
                  onChangeText={setNewDurationDays}
                  keyboardType="numeric"
                />
              </View>

              <Text style={styles.label}>{t('challenges.radiusLabel') || 'Visible within (km)'}</Text>
              <View style={styles.radiusPresetsRow}>
                {['10', '50', '100', '200'].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.radiusPresetBtn, newRadiusKm === r && styles.radiusPresetBtnActive]}
                    onPress={() => setNewRadiusKm(r)}
                  >
                    <Text style={[styles.radiusPresetText, newRadiusKm === r && styles.radiusPresetTextActive]}>{r} km</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.radiusHint}>{t('challenges.radiusHint') || 'Max 200 km. Only nearby users will see this challenge.'}</Text>

              {/* Powiadom matchy w okolicy */}
              <TouchableOpacity style={styles.notifyRow} onPress={() => setNotifyNearby(v => !v)}>
                <Ionicons name={notifyNearby ? 'notifications' : 'notifications-off-outline'} size={18} color={notifyNearby ? LIME : 'rgba(255,255,255,0.35)'} />
                <Text style={styles.notifyRowText}>{t('challenges.notifyNearby') || 'Powiadom matchy w pobliżu'}</Text>
                <Ionicons name={notifyNearby ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={notifyNearby ? LIME : 'rgba(255,255,255,0.3)'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
                onPress={handleCreateChallenge}
                disabled={creating}
              >
                <Text style={styles.submitBtnText}>
                  {creating ? t('common.loading') : (t('challenges.create') || 'Create Challenge')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Challenge Detail */}
      <Modal visible={!!selectedChallenge} animationType="slide" transparent onRequestClose={() => setSelectedChallenge(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedChallenge?.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => handleShareChallenge(selectedChallenge)}>
                  <Ionicons name="share-social-outline" size={22} color="#00aaff" />
                </TouchableOpacity>
                {selectedChallenge?.creator_id === myProfile?.id && (
                  <TouchableOpacity onPress={handleDeleteChallenge}>
                    <Ionicons name="trash-outline" size={22} color="#ff5050" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setSelectedChallenge(null)}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {selectedChallenge?.description ? (
                <Text style={styles.detailDescription}>{selectedChallenge.description}</Text>
              ) : null}

              <View style={styles.detailGoalCard}>
                <Ionicons name={getGoalIcon(selectedChallenge?.goal_type) as any} size={28} color={PRIMARY} />
                <Text style={styles.detailGoalText}>
                  {t('challenges.goal') || 'Goal'}: {selectedChallenge?.goal_value} {selectedChallenge?.goal_unit}
                </Text>
                <Text style={styles.detailGoalDays}>
                  {getDaysLeft(selectedChallenge?.end_date ?? '')} {t('challenges.daysLeft') || 'days left'}
                </Text>
              </View>

              {myChallengeIds.has(selectedChallenge?.id) && isStepAutoSynced(selectedChallenge) ? (
                <View style={styles.autoSyncCard}>
                  <Ionicons name="watch-outline" size={18} color={LIME} />
                  <Text style={styles.autoSyncText}>{t('challenges.stepsAutoSynced')}</Text>
                  <TouchableOpacity onPress={() => enableManualSteps(selectedChallenge.id)}>
                    <Text style={styles.autoSyncManualLink}>{t('challenges.enterManually')}</Text>
                  </TouchableOpacity>
                </View>
              ) : myChallengeIds.has(selectedChallenge?.id) && (
                <View style={styles.progressUpdateRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder={t('challenges.yourProgress') || 'Your progress'}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={myProgress}
                    onChangeText={setMyProgress}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={[styles.updateProgressBtn, updatingProgress && styles.submitBtnDisabled]}
                    onPress={handleUpdateProgress}
                    disabled={updatingProgress}
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {myChallengeIds.has(selectedChallenge?.id) && (
                <TouchableOpacity
                  style={styles.groupChatBtn}
                  onPress={() => {
                    setSelectedChallenge(null)
                    router.push({ pathname: '/challenge-chat', params: { challengeId: selectedChallenge.id, challengeTitle: selectedChallenge.title } } as any)
                  }}
                >
                  <Ionicons name="chatbubbles-outline" size={20} color={PRIMARY} />
                  <Text style={styles.groupChatBtnText}>{t('challenges.groupChat') || 'Group Chat'}</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}

              {myChallengeIds.has(selectedChallenge?.id) && (
                <TouchableOpacity style={styles.inviteBtn} onPress={openInviteMatches}>
                  <Ionicons name="person-add-outline" size={20} color="#00aaff" />
                  <Text style={styles.groupChatBtnText}>{t('challenges.inviteMatch') || 'Zaproś matcha'}</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}

              <Text style={styles.participantsTitle}>
                {t('challenges.leaderboard') || 'Leaderboard'} ({participants.length})
              </Text>

              {loadingParticipants ? (
                <ActivityIndicator color={PRIMARY} style={{ marginTop: 20 }} />
              ) : (
                participants.map((p, i) => {
                  const goalValue = selectedChallenge?.goal_value ?? 1
                  const progress = p.current_progress ?? 0
                  const pct = Math.min(100, Math.round((progress / goalValue) * 100))
                  return (
                    <View key={p.id} style={styles.participantRow}>
                      <Text style={styles.participantRank}>{i + 1}</Text>
                      <Image
                        source={{ uri: p.profiles?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }}
                        style={styles.participantAvatar}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.participantName}>{p.profiles?.name ?? '...'}</Text>
                        <View style={styles.progressBarBg}>
                          <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                        </View>
                      </View>
                      <Text style={styles.participantProgress}>{progress}/{goalValue}</Text>
                    </View>
                  )
                })
              )}
            </ScrollView>

            {/* MODAL: Zapros matcha — zagniezdzony w modalu szczegolow, bo iOS
                nie zaprezentuje rownoleglego modala, dopoki ten jest otwarty */}
            <Modal visible={showInviteModal} animationType="slide" transparent onRequestClose={() => setShowInviteModal(false)}>
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowInviteModal(false)}>
                <View style={styles.inviteModal}>
                  <Text style={styles.inviteTitle}>{t('challenges.inviteMatch') || 'Zaproś matcha'}</Text>
                  {loadingInvites ? (
                    <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} />
                  ) : inviteMatches.length === 0 ? (
                    <Text style={styles.inviteEmpty}>{t('matches.noMatches') || 'Brak dopasowań'}</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 360 }}>
                      {inviteMatches.map(m => {
                        const sent = invitedIds.has(m.id)
                        return (
                          <TouchableOpacity key={m.id} style={styles.inviteRow} onPress={() => handleInviteMatch(m)} disabled={sent}>
                            <Image source={{ uri: m.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.inviteAvatar} />
                            <Text style={styles.inviteName}>{m.name}</Text>
                            <View style={[styles.inviteSendBtn, sent && styles.inviteSendBtnSent]}>
                              <Ionicons name={sent ? 'checkmark' : 'paper-plane-outline'} size={16} color={sent ? BG : '#fff'} />
                            </View>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  )}
                  <TouchableOpacity style={styles.inviteClose} onPress={() => setShowInviteModal(false)}>
                    <Text style={styles.inviteCloseText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  stepsPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 10 },
  stepsPillText: { fontSize: 12.5, fontWeight: '700', color: LIME },
  trainersTile: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, marginHorizontal: 16, marginBottom: 12 },
  trainersTileText: { flex: 1, fontSize: 13.5, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4, maxWidth: 250 },
  createBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  eventsLinkBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1.5, borderColor: 'rgba(0,170,255,0.3)', alignItems: 'center', justifyContent: 'center' },

  tabSwitch: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 12 },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 },
  filterIconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(125,197,46,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(125,197,46,0.25)' },
  filterIconBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  radiusFilterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginHorizontal: 20, marginBottom: 16 },
  radiusFilterLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginRight: 4 },
  radiusFilterChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  radiusFilterChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  radiusFilterChipText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  radiusFilterChipTextActive: { color: '#fff' },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabBtnActive: { backgroundColor: PRIMARY },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  tabBtnTextActive: { color: '#fff' },

  list: { flex: 1, paddingHorizontal: 20 },

  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 20 },

  sortRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 12 },
  sortChip: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sortChipActive: { backgroundColor: 'rgba(148,227,54,0.15)', borderColor: LIME },
  sortChipText: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  sortChipTextActive: { color: LIME },

  bannerCard: { borderRadius: 18, overflow: 'hidden', backgroundColor: BG_LIGHT, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  bannerTop: { padding: 14, paddingBottom: 12 },
  bannerGhostIcon: { position: 'absolute', right: 6, top: 2 },
  bannerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeChip: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  typeChipText: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 },
  newBadge: { backgroundColor: 'rgba(255,80,80,0.25)', borderWidth: 1, borderColor: 'rgba(255,120,120,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { fontSize: 9, fontWeight: '800', color: '#ffb0b0', letterSpacing: 0.5 },
  daysPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  daysPillUrgent: { backgroundColor: 'rgba(255,80,80,0.3)' },
  daysPillText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  daysPillTextUrgent: { color: '#ff8080' },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 8 },
  bannerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bannerBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  avatarsStack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stackAvatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: BG_LIGHT, backgroundColor: BG },
  stackCount: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '600', marginLeft: 3 },
  bannerDistance: { fontSize: 11, color: LIME, fontWeight: '600' },
  progressGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickAddBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  joinPill: { backgroundColor: LIME, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  joinPillText: { fontSize: 12, fontWeight: '800', color: BG },
  shareBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,170,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(0,170,255,0.25)', borderRadius: 14, padding: 14, marginBottom: 20 },
  inviteModal: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  inviteTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 16 },
  inviteEmpty: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 24 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  inviteAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: BG },
  inviteName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' },
  inviteSendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,170,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  inviteSendBtnSent: { backgroundColor: LIME },
  inviteClose: { marginTop: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14 },
  inviteCloseText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  createModal: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  detailModal: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff', flex: 1, marginRight: 12 },

  label: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)' },

  templatesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateTileWrap: { width: '48%', flexGrow: 1 },
  templateTile: { borderRadius: 14, padding: 12, minHeight: 74, justifyContent: 'space-between' },
  templateTitle: { fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 6 },
  customTile: { borderRadius: 14, borderWidth: 2, borderColor: 'rgba(148,227,54,0.45)', borderStyle: 'dashed', padding: 12, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 6 },
  customTilePlus: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(148,227,54,0.15)', alignItems: 'center', justifyContent: 'center' },
  customTileText: { fontSize: 12, fontWeight: '700', color: LIME, textAlign: 'center' },
  previewLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginTop: 4, marginBottom: 6, textTransform: 'uppercase' },
  aiParseBox: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  aiParseInput: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, color: '#fff', backgroundColor: 'rgba(148,227,54,0.06)' },
  aiParseBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  autoTitleBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.35)', alignItems: 'center', justifyContent: 'center' },
  unitChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  unitChip: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  unitChipActive: { backgroundColor: 'rgba(148,227,54,0.15)', borderColor: LIME },
  unitChipText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  unitChipTextActive: { color: LIME },
  durationInput: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, color: '#fff', backgroundColor: 'rgba(255,255,255,0.06)', width: 64 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginTop: 16 },
  notifyRowText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff' },

  typeTilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeTileWrap: { width: '31%', flexGrow: 1 },
  typeTile: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent' },
  typeTileInactive: { opacity: 0.55 },
  typeTileActive: { borderColor: LIME },
  typeTileCheck: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  typeTileText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  radiusPresetsRow: { flexDirection: 'row', gap: 8 },
  radiusPresetBtn: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  radiusPresetBtnActive: { borderColor: PRIMARY, backgroundColor: 'rgba(125,197,46,0.1)' },
  radiusPresetText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '700' },
  radiusPresetTextActive: { color: PRIMARY },
  radiusHint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 },

  submitBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 8 },
  submitBtnDisabled: { backgroundColor: '#555' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  detailDescription: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginBottom: 16 },
  detailGoalCard: { backgroundColor: 'rgba(125,197,46,0.08)', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(125,197,46,0.25)', marginBottom: 16 },
  detailGoalText: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 8 },
  detailGoalDays: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },

  progressUpdateRow: { flexDirection: 'row', gap: 10, marginBottom: 20, alignItems: 'center' },
  autoSyncCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG_LIGHT, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(148,227,54,0.25)', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20 },
  autoSyncText: { flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', lineHeight: 17 },
  autoSyncManualLink: { fontSize: 12, fontWeight: '700', color: LIME, textDecorationLine: 'underline' },
  groupChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(125,197,46,0.08)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.25)', borderRadius: 14, padding: 14, marginBottom: 20 },
  groupChatBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#fff' },
  updateProgressBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },

  participantsTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  participantRank: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.4)', width: 20, textAlign: 'center' },
  participantAvatar: { width: 40, height: 40, borderRadius: 20 },
  participantName: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
  progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: PRIMARY, borderRadius: 3 },
  participantProgress: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
})
