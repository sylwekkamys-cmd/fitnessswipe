import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Image } from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, getCandidates, checkIsAdmin, exportMyData } from '../lib/supabase'
import GroupedChips, { GOAL_GROUPS } from '../components/GroupedChips'
import type { Profile } from '../lib/supabase'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import Slider from '@react-native-community/slider'
import { LinearGradient } from 'expo-linear-gradient'
import { changeLanguage } from '../lib/i18n'
import { isHealthSupported, isHealthConnected, connectHealth, disconnectHealth } from '../lib/health'
import { isBiometricAvailable, getBiometricType, authenticateWithBiometrics, getSecureCredentialsEmail, saveSecureCredentials, clearSecureCredentials } from '../lib/biometrics'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const LANGS = [
  { code: 'pl', flag: '🇵🇱', label: 'Polski' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'bg', flag: '🇧🇬', label: 'Български' },
  { code: 'ro', flag: '🇷🇴', label: 'Română' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
]

const ALL_GOALS = ['strength','cardio','weight_loss','muscle_gain','flexibility','endurance','crossfit','running','swimming','cycling','martial_arts','bjj','mma','karate','judo','kickboxing','muay_thai','wrestling','climbing','hiit','powerlifting','calisthenics','padel','pickleball','pilates','yoga','tennis','boxing','functional_fitness','walking','hyrox','mobility','injury_recovery','competition_prep','general_health','stress_relief','longevity']
const ALL_SCHEDULES = ['morning','afternoon','evening','weekdays','weekends','lunch_break','late_night','flexible']

// Kolorowy mini-kafel wyboru (jak typy wyzwan)
function FilterTile({ emoji, label, colors, active, onPress }: {
  emoji?: string; label: string; colors: [string, string]; active: boolean; onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.filterTileWrap} activeOpacity={0.85} onPress={onPress}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.filterTile, active ? styles.filterTileActive : styles.filterTileInactive]}
      >
        {active && (
          <View style={styles.filterTileCheck}>
            <Ionicons name="checkmark" size={10} color={BG} />
          </View>
        )}
        {emoji ? <Text style={{ fontSize: 18 }}>{emoji}</Text> : null}
        <Text style={styles.filterTileText} numberOfLines={1}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  )
}

// Jednolity wiersz sekcji (styl ustawien iOS) - jak w profilu
function SettingsRow({ icon, color, label, sub, onPress, right, danger }: {
  icon: string; color: string; label: string; sub?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean
}) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={[styles.settingsRowIcon, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={15} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingsRowLabel, danger && { color: '#ff6b6b' }]}>{label}</Text>
        {sub ? <Text style={styles.settingsRowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? (
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
      ) : null}
    </TouchableOpacity>
  )
}

export default function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterGender, setFilterGender] = useState('any')
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricType, setBiometricType] = useState<'faceId' | 'fingerprint' | 'none'>('none')
  const [biometricEnabled, setBiometricEnabledState] = useState(false)
  const [togglingBiometric, setTogglingBiometric] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('')
  const [filterMinAge, setFilterMinAge] = useState('')
  const [filterMaxAge, setFilterMaxAge] = useState('')
  const [filterRadius, setFilterRadius] = useState('50')
  const [filterFitnessLevel, setFilterFitnessLevel] = useState('')
  const [filterMinExperience, setFilterMinExperience] = useState('')
  const [filterMaxExperience, setFilterMaxExperience] = useState('')
  const [filterGoals, setFilterGoals] = useState<string[]>([])
  const [filterSchedule, setFilterSchedule] = useState<string[]>([])
  const [filterIntensity, setFilterIntensity] = useState('')
  const [filterSpotter, setFilterSpotter] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [healthConnected, setHealthConnected] = useState(false)
  const [showStepsPref, setShowStepsPref] = useState(false)
  const [connectingHealth, setConnectingHealth] = useState(false)
  const [notifMatches, setNotifMatches] = useState(true)
  const [notifMessages, setNotifMessages] = useState(true)
  const [selectedLang, setSelectedLang] = useState(i18n.language ?? 'pl')
  const [userEmail, setUserEmail] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showLangModal, setShowLangModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // Licznik wynikow na zywo - przelicza dopasowania po kazdej zmianie filtra (z opoznieniem)
  useEffect(() => {
    if (!showFilters || !profile) return
    setCountLoading(true)
    const tm = setTimeout(async () => {
      try {
        const list = await getCandidates(
          profile.id,
          filterGender,
          filterMinAge ? parseInt(filterMinAge) : 0,
          filterMaxAge ? parseInt(filterMaxAge) : 0,
          parseInt(filterRadius) || 50,
          filterFitnessLevel,
          filterMinExperience ? parseInt(filterMinExperience) : 0,
          filterMaxExperience ? parseInt(filterMaxExperience) : 0,
          filterGoals,
          filterSchedule,
          filterIntensity,
          filterSpotter
        )
        setMatchCount(list.length)
      } catch (e) {
        setMatchCount(null)
      } finally {
        setCountLoading(false)
      }
    }, 600)
    return () => clearTimeout(tm)
  }, [showFilters, profile, filterGender, filterMinAge, filterMaxAge, filterRadius,
    filterFitnessLevel, filterMinExperience, filterMaxExperience, filterGoals,
    filterSchedule, filterIntensity, filterSpotter])

  useEffect(() => { loadData() }, [])

  // Panel moderacji — pozycja w menu widoczna tylko dla adminow
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => { checkIsAdmin().then(setIsAdmin).catch(() => { }) }, [])

  async function loadData() {
    setLoading(true)
    const p = await getMyProfile()
    setProfile(p)
    if (p) {
      setNotifMatches((p as any).notif_matches ?? true)
      setNotifMessages((p as any).notif_messages ?? true)
      setShowStepsPref(!!(p as any).show_steps)
    }
    const { data: { user } } = await supabase.auth.getUser()
    setUserEmail(user?.email ?? '')
    const savedGender = await AsyncStorage.getItem('filter_gender')
    const savedMinAge = await AsyncStorage.getItem('filter_min_age')
    const savedMaxAge = await AsyncStorage.getItem('filter_max_age')
    const savedRadius = await AsyncStorage.getItem('filter_radius')
    const savedFitnessLevel = await AsyncStorage.getItem('filter_fitness_level')
    const savedMinExp = await AsyncStorage.getItem('filter_min_experience')
    const savedMaxExp = await AsyncStorage.getItem('filter_max_experience')
    const savedGoals = await AsyncStorage.getItem('filter_goals')
    const savedSchedule = await AsyncStorage.getItem('filter_schedule')
    if (savedGoals !== null) setFilterGoals(JSON.parse(savedGoals))
    if (savedSchedule !== null) setFilterSchedule(JSON.parse(savedSchedule))
    const savedIntensity = await AsyncStorage.getItem('filter_intensity')
    const savedSpotter = await AsyncStorage.getItem('filter_spotter')
    if (savedIntensity !== null) setFilterIntensity(savedIntensity)
    if (savedSpotter !== null) setFilterSpotter(savedSpotter === '1')
    setVerifiedOnly((await AsyncStorage.getItem('filter_verified_only')) === '1')
    setHealthConnected(await isHealthConnected())
    if (savedGender !== null) setFilterGender(savedGender)
    if (savedMinAge !== null) setFilterMinAge(savedMinAge)
    if (savedMaxAge !== null) setFilterMaxAge(savedMaxAge)
    if (savedRadius !== null) setFilterRadius(savedRadius)
    if (savedFitnessLevel !== null) setFilterFitnessLevel(savedFitnessLevel)
    if (savedMinExp !== null) setFilterMinExperience(savedMinExp)
    if (savedMaxExp !== null) setFilterMaxExperience(savedMaxExp)

    const available = await isBiometricAvailable()
    setBiometricAvailable(available)
    if (available) {
      const type = await getBiometricType()
      setBiometricType(type)
      const { data: { user } } = await supabase.auth.getUser()
      const savedEmail = await getSecureCredentialsEmail()
      setBiometricEnabledState(!!savedEmail && savedEmail.toLowerCase() === (user?.email ?? '').toLowerCase())
    }

    setLoading(false)
  }

  async function saveFilters() {
    setSaving(true)
    try {
      await AsyncStorage.setItem('filter_gender', filterGender)
      await AsyncStorage.setItem('filter_min_age', filterMinAge)
      await AsyncStorage.setItem('filter_max_age', filterMaxAge)
      await AsyncStorage.setItem('filter_radius', filterRadius)
      await AsyncStorage.setItem('filter_fitness_level', filterFitnessLevel)
      await AsyncStorage.setItem('filter_min_experience', filterMinExperience)
      await AsyncStorage.setItem('filter_max_experience', filterMaxExperience)
      await AsyncStorage.setItem('filter_goals', JSON.stringify(filterGoals))
      await AsyncStorage.setItem('filter_schedule', JSON.stringify(filterSchedule))
      await AsyncStorage.setItem('filter_intensity', filterIntensity)
      await AsyncStorage.setItem('filter_spotter', filterSpotter ? '1' : '')
      Alert.alert(t('settings.saved'), t('settings.filtersSaved'))
    } finally { setSaving(false) }
  }

  async function handleToggleBiometric(value: boolean) {
    if (value) {
      // Musimy poprosic o haslo, bo nie mamy go w pamieci w tym miejscu
      setShowPasswordModal(true)
    } else {
      setTogglingBiometric(true)
      try {
        await clearSecureCredentials()
        setBiometricEnabledState(false)
      } catch (e) {
        Alert.alert(t('common.error'))
      } finally {
        setTogglingBiometric(false)
      }
    }
  }

  async function handleConfirmPasswordAndEnable() {
    if (!confirmPasswordInput) { Alert.alert(t('auth.fillAll')); return }
    setTogglingBiometric(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { Alert.alert(t('common.error')); setTogglingBiometric(false); return }

      // Zweryfikuj haslo probujac sie zalogowac
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: confirmPasswordInput })
      if (error) {
        Alert.alert(t('common.error'), t('biometric.wrongPassword') || 'Incorrect password.')
        setTogglingBiometric(false)
        return
      }

      const promptMessage = t('biometric.confirmEnable') || 'Confirm to enable biometric login'
      const success = await authenticateWithBiometrics(promptMessage)
      if (!success) {
        setTogglingBiometric(false)
        return
      }

      await saveSecureCredentials(user.email, confirmPasswordInput)
      setBiometricEnabledState(true)
      setShowPasswordModal(false)
      setConfirmPasswordInput('')
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setTogglingBiometric(false)
    }
  }

  function toggleFilterGoal(g: string) {
    setFilterGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  function toggleFilterSchedule(s: string) {
    setFilterSchedule(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleLangChange(code: string) {
    setSelectedLang(code)
    // useTranslation odswieza wszystkie teksty reaktywnie — zadna nawigacja nie jest potrzebna
    await changeLanguage(code)
  }

  async function handleLogout() {
    // Filtry sa wspolne dla urzadzenia — czyscimy, zeby nie przeciekly do innego konta
    const { clearFilterStorage } = await import('../lib/filters')
    await clearFilterStorage()
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  // Usuniecie konta: dwustopniowe potwierdzenie z wpisaniem slowa
  function handleDeleteAccount() {
    setDeleteText('')
    setShowDeleteModal(true)
  }

  async function confirmDeleteAccount() {
    const word = t('settings.deleteWord') || 'USUŃ'
    if (deleteText.trim().toUpperCase() !== word.toUpperCase()) return
    setDeleting(true)
    try {
      await supabase.rpc('delete_user_account')
      setShowDeleteModal(false)
      router.replace('/(auth)/login')
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setDeleting(false)
    }
  }

  // Zapis preferencji powiadomien do profilu (odbiorca jest sprawdzany przy wysylce)
  async function toggleNotif(field: 'notif_matches' | 'notif_messages', value: boolean) {
    if (field === 'notif_matches') setNotifMatches(value)
    else setNotifMessages(value)
    if (profile) {
      await supabase.from('profiles').update({ [field]: value }).eq('id', profile.id)
    }
  }

  // Streszczenie aktywnych filtrow na wierszu
  function filterSummary(): string {
    const parts: string[] = []
    const genderLabels: Record<string, string> = {
      any: t('settings.everyone'), male: t('profile.male'), female: t('profile.female'), other: t('profile.other'),
    }
    parts.push(genderLabels[filterGender] ?? t('settings.everyone'))
    if (filterMinAge || filterMaxAge) parts.push(`${filterMinAge || '18'}-${filterMaxAge || '99'}`)
    parts.push(`${filterRadius} km`)
    if (filterFitnessLevel) parts.push(t('gym.' + filterFitnessLevel))
    if (filterIntensity) parts.push(filterIntensity === 'chill' ? '😌' : filterIntensity === 'solid' ? '💪' : '🔥')
    if (filterSpotter) parts.push('🤝')
    if (filterGoals.length > 0) parts.push(`🎯 ${filterGoals.length}`)
    return parts.join(' · ')
  }

  async function clearFilters() {
    setFilterGender('any')
    setFilterMinAge('')
    setFilterMaxAge('')
    setFilterRadius('50')
    setFilterFitnessLevel('')
    setFilterMinExperience('')
    setFilterMaxExperience('')
    setFilterGoals([])
    setFilterSchedule([])
    setFilterIntensity('')
    setFilterSpotter(false)
    await AsyncStorage.multiRemove(['filter_gender', 'filter_min_age', 'filter_max_age', 'filter_fitness_level', 'filter_min_experience', 'filter_max_experience', 'filter_goals', 'filter_schedule', 'filter_intensity', 'filter_spotter'])
    await AsyncStorage.setItem('filter_radius', '50')
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  return (
    <>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      {/* Karta konta */}
      <TouchableOpacity style={styles.accountCard} onPress={() => router.push('/premium')} activeOpacity={0.85}>
        {profile?.photo_urls?.[0] ? (
          <Image source={{ uri: profile.photo_urls[0] }} style={styles.accountAvatar} />
        ) : (
          <View style={[styles.accountAvatar, styles.accountAvatarEmpty]}>
            <Ionicons name="person" size={20} color="rgba(255,255,255,0.35)" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.accountName}>{profile?.name}</Text>
          {userEmail ? <Text style={styles.accountEmail} numberOfLines={1}>{userEmail}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View style={[styles.premiumPill, !profile?.is_premium && styles.premiumPillFree]}>
            <Text style={[styles.premiumPillText, !profile?.is_premium && styles.premiumPillTextFree]}>
              {profile?.is_premium ? '⭐ Premium' : t('settings.free')}
            </Text>
          </View>
          {isAdmin && (
            <View style={styles.adminPill}>
              <Ionicons name="shield-half" size={10} color="#b388ff" />
              <Text style={styles.adminPillText}>Admin</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* ===== WYSZUKIWANIE ===== */}
      <Text style={styles.sectionHeader}>{t('settings.sectionSearch') || 'Wyszukiwanie'}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="options"
          color="#4f8422"
          label={t('settings.filters')}
          sub={filterSummary()}
          onPress={() => setShowFilters(true)}
        />
      </View>

      {/* ===== APLIKACJA ===== */}
      <Text style={styles.sectionHeader}>{t('settings.sectionApp') || 'Aplikacja'}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="language"
          color="#2e7ab8"
          label={t('settings.language')}
          onPress={() => setShowLangModal(true)}
          right={
            <Text style={{ fontSize: 14 }}>
              {LANGS.find(l => l.code === selectedLang)?.flag ?? '🌍'} <Text style={styles.rowValueText}>{LANGS.find(l => l.code === selectedLang)?.label ?? ''}</Text>
            </Text>
          }
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="notifications"
          color="#b8921e"
          label={t('settings.newMatches')}
          sub={t('settings.newMatchesDesc')}
          right={
            <Switch
              value={notifMatches}
              onValueChange={v => toggleNotif('notif_matches', v)}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(148,227,54,0.5)' }}
              thumbColor={notifMatches ? LIME : '#fff'}
            />
          }
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="chatbubble"
          color="#b8921e"
          label={t('settings.newMessages')}
          sub={t('settings.newMessagesDesc')}
          right={
            <Switch
              value={notifMessages}
              onValueChange={v => toggleNotif('notif_messages', v)}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(148,227,54,0.5)' }}
              thumbColor={notifMessages ? LIME : '#fff'}
            />
          }
        />
      </View>

      {/* ===== BEZPIECZENSTWO ===== */}
      {biometricAvailable && (
        <>
          <Text style={styles.sectionHeader}>{t('settings.security') || 'Bezpieczeństwo'}</Text>
          <View style={styles.sectionCard}>
            <SettingsRow
              icon={biometricType === 'faceId' ? 'scan' : 'finger-print'}
              color="#7a42b5"
              label={biometricType === 'faceId' ? (t('biometric.faceIdLogin') || 'Face ID Login') : (t('biometric.fingerprintLogin') || 'Fingerprint Login')}
              sub={t('biometric.subtitle') || 'Unlock the app without typing your password'}
              right={
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleToggleBiometric}
                  disabled={togglingBiometric}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(148,227,54,0.5)' }}
                  thumbColor={biometricEnabled ? LIME : '#fff'}
                />
              }
            />
          </View>
        </>
      )}

      {/* ===== POŁĄCZENIA (kroki: Health Connect na Androidzie, Apple Health na iOS) ===== */}
      <Text style={styles.sectionHeader}>{t('health.section')}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="fitness"
          color="#0f6b46"
          label={Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}
          sub={healthConnected ? t('health.connected') : t('health.connectSub')}
          onPress={async () => {
            const providerName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'
            if (!isHealthSupported()) {
              Alert.alert(providerName, t('health.needsBuild'))
              return
            }
            if (healthConnected) {
              Alert.alert(providerName, t('health.disconnectConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('health.disconnect'), style: 'destructive', onPress: async () => { await disconnectHealth(); setHealthConnected(false) } },
              ])
              return
            }
            setConnectingHealth(true)
            try {
              const result = await connectHealth()
              if (result.success) {
                setHealthConnected(true)
                Alert.alert('✅', t('health.connectedMsg'))
              } else if (result.error === 'denied') {
                Alert.alert(t('common.error'), t('health.denied'))
              } else {
                Alert.alert(t('common.error'), t('health.unavailable'))
              }
            } finally { setConnectingHealth(false) }
          }}
          right={connectingHealth ? <ActivityIndicator size="small" color={LIME} /> : (
            healthConnected ? <Ionicons name="checkmark-circle" size={20} color={LIME} /> : undefined
          )}
        />
        {/* Prywatnosc krokow: widocznosc na profilu wylacznie za zgoda */}
        {healthConnected && (
          <>
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="footsteps"
              color="#4f8422"
              label={t('health.showOnProfile')}
              sub={t('health.showOnProfileSub')}
              right={
                <Switch
                  value={showStepsPref}
                  onValueChange={async (v) => {
                    setShowStepsPref(v)
                    if (!profile) return
                    // Wylaczenie od razu czysci opublikowane kroki
                    await supabase.from('profiles').update(
                      v ? { show_steps: true } : { show_steps: false, steps_today: null, steps_date: null }
                    ).eq('id', (profile as any).id)
                    if (v) {
                      try {
                        const { syncStepsToProfile } = await import('../lib/health')
                        syncStepsToProfile((profile as any).id, true)
                      } catch (e) { }
                    }
                  }}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(148,227,54,0.5)' }}
                  thumbColor={showStepsPref ? LIME : '#fff'}
                />
              }
            />
          </>
        )}
      </View>

      {/* ===== BEZPIECZEŃSTWO ===== */}
      <Text style={styles.sectionHeader}>{t('safety.section')}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="shield-checkmark"
          color="#2d5016"
          label={(profile as any)?.is_verified ? t('safety.verified') : t('safety.verifyPhoto')}
          onPress={() => router.push('/verification' as any)}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="book"
          color="#6b5d10"
          label={t('safety.rulesTitle')}
          onPress={() => Alert.alert(
            t('safety.rulesTitle'),
            `📍 ${t('safety.rule1')}\n\n🔗 ${t('safety.rule2')}\n\n📞 ${t('safety.rule3')}`
          )}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="ban"
          color="#546e7a"
          label={t('reportBlock.blockedUsersTitle')}
          onPress={() => router.push('/blocked-users')}
        />
        {isAdmin && (
          <>
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="shield-half"
              color="#7a1f3d"
              label="Moderacja"
              sub="Zgłoszenia użytkowników"
              onPress={() => router.push('/admin' as any)}
            />
          </>
        )}
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="people"
          color="#0f6b46"
          label={t('safety.verifiedOnly')}
          right={
            <Switch
              value={verifiedOnly}
              onValueChange={async (v) => {
                setVerifiedOnly(v)
                await AsyncStorage.setItem('filter_verified_only', v ? '1' : '0')
              }}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(148,227,54,0.5)' }}
              thumbColor={verifiedOnly ? LIME : '#fff'}
            />
          }
        />
      </View>

      {/* ===== KONTO ===== */}
      <Text style={styles.sectionHeader}>{t('settings.account')}</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon="star"
          color="#b8921e"
          label={profile?.is_premium ? t('profile.managePremium') : t('profile.goPremium')}
          onPress={() => router.push('/premium')}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="download"
          color="#1a7fa8"
          label={t('settings.exportData')}
          sub={exporting ? t('settings.exportSending') : undefined}
          onPress={exporting ? undefined : async () => {
            setExporting(true)
            try {
              await exportMyData()
              Alert.alert('✅', t('settings.exportInfo'))
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? t('settings.exportFailed'))
            } finally { setExporting(false) }
          }}
          right={exporting ? <ActivityIndicator size="small" color="#1a7fa8" /> : undefined}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="log-out"
          color="#7a3b10"
          label={t('settings.logout')}
          onPress={handleLogout}
        />
        <View style={styles.rowDivider} />
        <SettingsRow
          icon="trash"
          color="#a32020"
          label={t('settings.deleteAccount')}
          danger
          onPress={handleDeleteAccount}
        />
      </View>

      {/* Stopka: wersja + linki prawne */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>FitnessSwipe v1.0.0 · © 2026</Text>
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync('https://fitnessswipe.app/terms.html')}>
            <Text style={styles.footerLink}>{t('gdpr.readTerms')}</Text>
          </TouchableOpacity>
          <Text style={styles.footerText}> · </Text>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync('https://fitnessswipe.app/privacy.html')}>
            <Text style={styles.footerLink}>{t('gdpr.readPrivacy')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>

    {/* ARKUSZ: Filtry wyszukiwania */}
    <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('settings.filters')}</Text>
            <TouchableOpacity onPress={clearFilters}>
              <Text style={styles.clearText}>{t('settings.clearFilters') || 'Wyczyść'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ===== KIM JEST ===== */}
            <Text style={styles.filterSection}>{t('settings.sectionWho') || 'Z kim chcesz trenować?'}</Text>
            <View style={styles.tilesGrid}>
              <FilterTile emoji="🌍" label={t('settings.everyone')} colors={['#37474f', '#5a7484']} active={filterGender === 'any'} onPress={() => setFilterGender('any')} />
              <FilterTile emoji="👩" label={t('profile.female')} colors={['#7a1f4a', '#b53b78']} active={filterGender === 'female'} onPress={() => setFilterGender('female')} />
              <FilterTile emoji="👨" label={t('profile.male')} colors={['#173f66', '#2e7ab8']} active={filterGender === 'male'} onPress={() => setFilterGender('male')} />
              <FilterTile emoji="🧑" label={t('profile.other')} colors={['#4a2570', '#7a42b5']} active={filterGender === 'other'} onPress={() => setFilterGender('other')} />
            </View>

            <View style={styles.sliderHeader}>
              <Text style={styles.label}>{t('settings.ageRange')}</Text>
              <Text style={styles.sliderValue}>{filterMinAge || '18'} – {filterMaxAge || '80'} {t('ui.years')}</Text>
            </View>
            <Text style={styles.sliderSub}>{t('settings.from')}</Text>
            <Slider
              style={styles.slider}
              minimumValue={18} maximumValue={80} step={1}
              value={parseInt(filterMinAge) || 18}
              onValueChange={v => setFilterMinAge(String(Math.min(v, parseInt(filterMaxAge) || 80)))}
              minimumTrackTintColor={LIME} maximumTrackTintColor="rgba(255,255,255,0.15)" thumbTintColor={LIME}
            />
            <Text style={styles.sliderSub}>{t('settings.to')}</Text>
            <Slider
              style={styles.slider}
              minimumValue={18} maximumValue={80} step={1}
              value={parseInt(filterMaxAge) || 80}
              onValueChange={v => setFilterMaxAge(String(Math.max(v, parseInt(filterMinAge) || 18)))}
              minimumTrackTintColor={LIME} maximumTrackTintColor="rgba(255,255,255,0.15)" thumbTintColor={LIME}
            />

            <Text style={styles.label}>{t('gym.fitnessLevel')}</Text>
            <View style={styles.tilesGrid}>
              <FilterTile label={t('settings.everyone')} colors={['#37474f', '#5a7484']} active={filterFitnessLevel === ''} onPress={() => setFilterFitnessLevel('')} />
              <FilterTile label={t('gym.beginner')} colors={['#0f6b46', '#17a06a']} active={filterFitnessLevel === 'beginner'} onPress={() => setFilterFitnessLevel('beginner')} />
              <FilterTile label={t('gym.intermediate')} colors={['#6b5d10', '#a8921e']} active={filterFitnessLevel === 'intermediate'} onPress={() => setFilterFitnessLevel('intermediate')} />
              <FilterTile label={t('gym.advanced')} colors={['#7a3b10', '#c26422']} active={filterFitnessLevel === 'advanced'} onPress={() => setFilterFitnessLevel('advanced')} />
              <FilterTile label={t('gym.pro')} colors={['#5c1010', '#a32020']} active={filterFitnessLevel === 'pro'} onPress={() => setFilterFitnessLevel('pro')} />
            </View>

            {/* ===== GDZIE ===== */}
            <Text style={styles.filterSection}>{t('settings.sectionWhere') || 'Gdzie'}</Text>
            <View style={styles.sliderHeader}>
              <Text style={styles.label}>{t('settings.radius')}</Text>
              <Text style={[styles.sliderValue, { color: '#4fc3f7' }]}>{t('settings.upTo') || 'do'} {filterRadius} km</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={5} maximumValue={200} step={5}
              value={parseInt(filterRadius) || 50}
              onValueChange={v => setFilterRadius(String(v))}
              minimumTrackTintColor="#4fc3f7" maximumTrackTintColor="rgba(255,255,255,0.15)" thumbTintColor="#4fc3f7"
            />

            {/* ===== JAK TRENUJE ===== */}
            <Text style={styles.filterSection}>{t('settings.sectionHow') || 'Jak trenuje'}</Text>
            <View style={styles.sliderHeader}>
              <Text style={styles.label}>{t('gym.experienceYears')}</Text>
              <Text style={styles.sliderValue}>{filterMinExperience || '0'} – {filterMaxExperience || '30'} {t('ui.years')}</Text>
            </View>
            <Text style={styles.sliderSub}>{t('settings.from')}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0} maximumValue={30} step={1}
              value={parseInt(filterMinExperience) || 0}
              onValueChange={v => setFilterMinExperience(String(Math.min(v, parseInt(filterMaxExperience) || 30)))}
              minimumTrackTintColor={LIME} maximumTrackTintColor="rgba(255,255,255,0.15)" thumbTintColor={LIME}
            />
            <Text style={styles.sliderSub}>{t('settings.to')}</Text>
            <Slider
              style={styles.slider}
              minimumValue={0} maximumValue={30} step={1}
              value={parseInt(filterMaxExperience) || 30}
              onValueChange={v => setFilterMaxExperience(String(Math.max(v, parseInt(filterMinExperience) || 0)))}
              minimumTrackTintColor={LIME} maximumTrackTintColor="rgba(255,255,255,0.15)" thumbTintColor={LIME}
            />

            <Text style={styles.label}>{t('profile.intensityLabel') || 'Intensywność treningu'}</Text>
            <View style={styles.tilesGrid}>
              <FilterTile emoji="😌" label={t('profile.intensity_chill') || 'Na luzie'} colors={['#0f6b46', '#17a06a']} active={filterIntensity === 'chill'} onPress={() => setFilterIntensity(filterIntensity === 'chill' ? '' : 'chill')} />
              <FilterTile emoji="💪" label={t('profile.intensity_solid') || 'Solidnie'} colors={['#6b5d10', '#a8921e']} active={filterIntensity === 'solid'} onPress={() => setFilterIntensity(filterIntensity === 'solid' ? '' : 'solid')} />
              <FilterTile emoji="🔥" label={t('profile.intensity_beast') || 'Beast'} colors={['#5c1010', '#a32020']} active={filterIntensity === 'beast'} onPress={() => setFilterIntensity(filterIntensity === 'beast' ? '' : 'beast')} />
            </View>

            <Text style={styles.label}>{t('settings.trainingGoals') || 'Training Goals'}</Text>
            <GroupedChips groups={GOAL_GROUPS} selected={filterGoals} onToggle={toggleFilterGoal} itemPrefix="goals." groupPrefix="goalGroups." chipBg={BG} />

            <Text style={styles.label}>{t('settings.trainingSchedule') || 'Training Schedule'}</Text>
            <View style={styles.chipsRow}>
              {ALL_SCHEDULES.map(s => (
                <TouchableOpacity key={s} style={[styles.chip, filterSchedule.includes(s) && styles.chipActive]} onPress={() => toggleFilterSchedule(s)}>
                  <Text style={[styles.chipText, filterSchedule.includes(s) && styles.chipTextActive]}>{t('schedule.' + s)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.chip, { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, marginTop: 8 }, filterSpotter && styles.chipActive]} onPress={() => setFilterSpotter(v => !v)}>
              <Text style={[styles.chipText, filterSpotter && styles.chipTextActive]}>
                🤝 {t('settings.filterSpotter') || 'Tylko osoby szukające asekuracji'}
              </Text>
            </TouchableOpacity>

            {/* Przycisk z licznikiem wynikow na zywo */}
            <TouchableOpacity
              style={[styles.applyBtn, saving && { opacity: 0.6 }]}
              onPress={async () => { await saveFilters(); setShowFilters(false) }}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={BG} size="small" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.applyBtnText}>
                    {t('settings.showResults') || 'Pokaż wyniki'}
                    {matchCount !== null ? ` (${matchCount >= 50 ? '50+' : matchCount})` : ''}
                  </Text>
                  {countLoading && <ActivityIndicator color={BG} size="small" />}
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* MODAL: Jezyk */}
    <Modal visible={showLangModal} animationType="slide" transparent onRequestClose={() => setShowLangModal(false)}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowLangModal(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('settings.language')}</Text>
          {LANGS.map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.langRow, selectedLang === lang.code && styles.langRowActive]}
              onPress={async () => { setShowLangModal(false); await handleLangChange(lang.code) }}
            >
              <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
              <Text style={[styles.langRowText, selectedLang === lang.code && styles.langRowTextActive]}>{lang.label}</Text>
              {selectedLang === lang.code && <Ionicons name="checkmark-circle" size={20} color={LIME} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>

    {/* MODAL: Usuniecie konta - potwierdzenie slowem */}
    <Modal visible={showDeleteModal} animationType="fade" transparent onRequestClose={() => setShowDeleteModal(false)}>
      <KeyboardAvoidingView style={styles.pwOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.pwModal}>
          <Text style={{ fontSize: 40, textAlign: 'center' }}>⚠️</Text>
          <Text style={styles.pwTitle}>{t('settings.deleteAccount')}</Text>
          <Text style={styles.pwSubtitle}>{t('settings.deleteConfirm')}</Text>
          <Text style={styles.deleteHint}>
            {(t('settings.deleteTypeToConfirm') || 'Wpisz {{word}}, aby potwierdzić').replace('{{word}}', t('settings.deleteWord') || 'USUŃ')}
          </Text>
          <TextInput
            style={styles.pwInput}
            placeholder={t('settings.deleteWord') || 'USUŃ'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={deleteText}
            onChangeText={setDeleteText}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.deleteConfirmBtn, (deleteText.trim().toUpperCase() !== (t('settings.deleteWord') || 'USUŃ').toUpperCase() || deleting) && { opacity: 0.4 }]}
            onPress={confirmDeleteAccount}
            disabled={deleteText.trim().toUpperCase() !== (t('settings.deleteWord') || 'USUŃ').toUpperCase() || deleting}
          >
            {deleting ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.deleteConfirmBtnText}>{t('profile.deleteBtn')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.pwCancelBtn} onPress={() => setShowDeleteModal(false)}>
            <Text style={styles.pwCancelBtnText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* MODAL: haslo do biometrii */}
    <Modal visible={showPasswordModal} animationType="slide" transparent onRequestClose={() => setShowPasswordModal(false)}>
      <KeyboardAvoidingView style={styles.pwOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.pwModal}>
          <Text style={styles.pwTitle}>{t('biometric.confirmPasswordTitle') || 'Confirm your password'}</Text>
          <Text style={styles.pwSubtitle}>{t('biometric.confirmPasswordSubtitle') || 'This lets us securely enable Face ID login.'}</Text>
          <TextInput
            style={styles.pwInput}
            placeholder={t('auth.password') || 'Password'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={confirmPasswordInput}
            onChangeText={setConfirmPasswordInput}
            secureTextEntry
            autoFocus
          />
          <TouchableOpacity
            style={[styles.pwConfirmBtn, togglingBiometric && styles.pwConfirmBtnDisabled]}
            onPress={handleConfirmPasswordAndEnable}
            disabled={togglingBiometric}
          >
            <Text style={styles.pwConfirmBtnText}>
              {togglingBiometric ? (t('common.loading') || 'Loading...') : (t('common.confirm') || 'Confirm')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pwCancelBtn} onPress={() => { setShowPasswordModal(false); setConfirmPasswordInput('') }}>
            <Text style={styles.pwCancelBtnText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 55, paddingBottom: 12 },
  headerBackBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },

  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#24405f', borderRadius: 18, padding: 14 },
  accountAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: BG_LIGHT },
  accountAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  accountEmail: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  premiumPill: { backgroundColor: 'rgba(255,199,50,0.15)', borderWidth: 1, borderColor: 'rgba(255,199,50,0.4)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  premiumPillText: { fontSize: 11, fontWeight: '700', color: '#ffc732' },
  premiumPillFree: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  premiumPillTextFree: { color: 'rgba(255,255,255,0.55)' },
  adminPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(179,136,255,0.14)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(179,136,255,0.45)' },
  adminPillText: { fontSize: 10.5, fontWeight: '800', color: '#b388ff' },

  sectionHeader: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  sectionCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  settingsRowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingsRowLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  settingsRowSub: { fontSize: 11, color: '#94e336', marginTop: 1 },
  rowValueText: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  rowDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8, marginLeft: 39 },

  footer: { alignItems: 'center', marginTop: 24 },
  footerText: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  footerLinks: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  footerLink: { fontSize: 11, color: 'rgba(148,227,54,0.7)', textDecorationLine: 'underline' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 8 },
  clearText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },

  label: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: BG },
  chipActive: { borderColor: 'rgba(148,227,54,0.5)' },
  chipText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  ageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  ageInputWrapper: { flex: 1 },
  ageInputLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 },
  ageInput: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#fff', backgroundColor: BG, textAlign: 'center' },
  ageSeparator: { fontSize: 18, color: 'rgba(255,255,255,0.3)', paddingBottom: 12 },
  applyBtn: { backgroundColor: LIME, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: BG },
  filterSection: { fontSize: 12, fontWeight: '800', color: LIME, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 4 },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  filterTileWrap: { width: '23%', flexGrow: 1 },
  filterTile: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 4, alignItems: 'center', gap: 3, borderWidth: 2, borderColor: 'transparent' },
  filterTileInactive: { opacity: 0.55 },
  filterTileActive: { borderColor: LIME },
  filterTileCheck: { position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  filterTileText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  sliderHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sliderValue: { fontSize: 13, fontWeight: '700', color: LIME, marginBottom: 8 },
  sliderSub: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  slider: { width: '100%', height: 34 },

  langRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  langRowActive: { backgroundColor: 'rgba(148,227,54,0.1)' },
  langRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  langRowTextActive: { color: LIME },

  pwOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  pwModal: { backgroundColor: BG_LIGHT, borderRadius: 24, padding: 24, width: '100%' },
  pwTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 6 },
  pwSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 6, lineHeight: 19 },
  deleteHint: { fontSize: 12, color: '#ff8080', textAlign: 'center', marginTop: 12, fontWeight: '600' },
  pwInput: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#fff', backgroundColor: BG, marginTop: 12, textAlign: 'center' },
  pwConfirmBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  pwConfirmBtnDisabled: { opacity: 0.5 },
  pwConfirmBtnText: { fontSize: 15, fontWeight: '800', color: BG },
  deleteConfirmBtn: { backgroundColor: '#c62828', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  deleteConfirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  pwCancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  pwCancelBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
})
