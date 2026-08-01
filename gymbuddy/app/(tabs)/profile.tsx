import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Image, ScrollView, ActivityIndicator, TextInput, Modal, FlatList, Switch, Dimensions
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, logWorkoutToday, checkStreakStatus, logRestDay } from '../../lib/supabase'
import GymRecordsEditor, { GymRecord, cleanRecords } from '../../components/GymRecordsEditor'
import GroupedChips, { GOAL_GROUPS, EXERCISE_GROUPS } from '../../components/GroupedChips'
import type { Profile } from '../../lib/supabase'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const ACCENT = '#00aaff'
const { width: SCREEN_W } = Dimensions.get('window')

const ALL_GOALS = ['strength','cardio','weight_loss','muscle_gain','flexibility','endurance','crossfit','running','swimming','cycling','martial_arts','bjj','mma','karate','judo','kickboxing','muay_thai','wrestling','climbing','hiit','powerlifting','calisthenics','padel','pickleball','pilates','yoga','tennis','boxing','functional_fitness','walking','hyrox','mobility','injury_recovery','competition_prep','general_health','stress_relief','longevity']
const ALL_SCHEDULES = ['morning','afternoon','evening','weekdays','weekends','lunch_break','late_night','flexible']
const ALL_EXERCISES = ['bench_press','squat','deadlift','pull_up','push_up','running','cycling','swimming','yoga','stretching','hiit','boxing','crossfit','olympic_lifting','kettlebell','rowing','hip_thrust','core_abs','sprints','mobility_drills']

const COUNTRY_FLAGS: Record<string, string> = {
  'PL': '🇵🇱', 'DE': '🇩🇪', 'GB': '🇬🇧', 'FR': '🇫🇷', 'ES': '🇪🇸',
  'NL': '🇳🇱', 'IT': '🇮🇹', 'PT': '🇵🇹', 'BE': '🇧🇪', 'SE': '🇸🇪',
  'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'CZ': '🇨🇿', 'SK': '🇸🇰',
  'HU': '🇭🇺', 'AT': '🇦🇹', 'CH': '🇨🇭', 'UA': '🇺🇦', 'US': '🇺🇸',
  'RO': '🇷🇴', 'BG': '🇧🇬', 'HR': '🇭🇷', 'SI': '🇸🇮', 'RS': '🇷🇸',
  'GR': '🇬🇷', 'TR': '🇹🇷', 'IE': '🇮🇪', 'IS': '🇮🇸', 'LU': '🇱🇺',
  'EE': '🇪🇪', 'LV': '🇱🇻', 'LT': '🇱🇹', 'CA': '🇨🇦', 'AU': '🇦🇺',
  'JP': '🇯🇵', 'BR': '🇧🇷', 'MX': '🇲🇽', 'ZA': '🇿🇦', 'IN': '🇮🇳',
}
const COUNTRY_CODES = ['PL','DE','GB','FR','ES','NL','IT','PT','BE','SE','NO','DK','FI','CZ','SK','HU','AT','CH','UA','US','RO','BG','HR','SI','RS','GR','TR','IE','IS','LU','EE','LV','LT','CA','AU','JP','BR','MX','ZA','IN']

const LANG_FLAGS: Record<string, string> = { pl: '🇵🇱', en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', nl: '🇳🇱' }

// Grupa chipow ze zwijaniem: pokazuje `limit`, reszta pod "+N wiecej"
function ChipGroup({ items, limit = 6, filled = false, moreLabel }: {
  items: string[]; limit?: number; filled?: boolean; moreLabel: (n: number) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, limit)
  const hidden = items.length - limit
  return (
    <View style={styles.aboutChipsWrap}>
      {visible.map(label => (
        <View key={label} style={[styles.aboutChip, filled && styles.aboutChipFilled]}>
          <Text style={[styles.aboutChipText, filled && styles.aboutChipTextFilled]}>{label}</Text>
        </View>
      ))}
      {!expanded && hidden > 0 && (
        <TouchableOpacity style={styles.aboutChipMore} onPress={() => setExpanded(true)}>
          <Text style={styles.aboutChipMoreText}>{moreLabel(hidden)}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Kompletnosc profilu: % + pierwsze brakujace pole
function profileCompleteness(p: any, t: any): { pct: number; missing: string | null } {
  const checks: { done: boolean; label: string }[] = [
    { done: (p?.photo_urls?.length ?? 0) >= 1, label: t('profile.addPhoto') },
    { done: !!p?.bio, label: 'Bio' },
    { done: (p?.goals?.length ?? 0) > 0, label: t('profile.trainingGoals') },
    { done: !!p?.city, label: t('profile.city') },
    { done: !!p?.gym_name, label: t('profile.gym') },
    { done: !!p?.fitness_level, label: t('gym.fitnessLevel') },
    { done: !!p?.training_frequency, label: t('gym.frequency') },
    { done: !!p?.training_intensity, label: t('profile.intensityLabel') || 'Intensywność' },
  ]
  const done = checks.filter(c => c.done).length
  const firstMissing = checks.find(c => !c.done)
  return { pct: Math.round((done / checks.length) * 100), missing: firstMissing?.label ?? null }
}

// Jednolity wiersz sekcji (styl ustawien iOS): kolorowa ikonka w kwadraciku + nazwa + strzalka
function SettingsRow({ icon, color, label, sub, onPress, right, locked }: {
  icon: string; color: string; label: string; sub?: string; onPress?: () => void; right?: React.ReactNode; locked?: boolean
}) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={[styles.settingsRowIcon, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={15} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingsRowLabel}>{label}</Text>
        {sub ? <Text style={styles.settingsRowSubText} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {locked ? (
        <Text style={{ fontSize: 13 }}>🔒</Text>
      ) : right !== undefined ? right : (
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
      )}
    </TouchableOpacity>
  )
}

// Zwijana sekcja edycji profilu (akordeon) — formularz przestal wymagac
// scrollowania przez wszystko naraz; otwarta jest jedna sekcja na raz.
// Zdefiniowana na poziomie pliku, zeby TextInputy w srodku nie traciły
// focusu przy kazdym renderze (stabilny typ komponentu).
function EditSection({ icon, color, title, sub, open, onToggle, children }: {
  icon: any; color: string; title: string; sub?: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <View style={accStyles.card}>
      <TouchableOpacity style={accStyles.header} onPress={onToggle} activeOpacity={0.8}>
        <View style={[accStyles.icon, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={accStyles.title}>{title}</Text>
        {sub ? <Text style={accStyles.sub}>{sub}</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={open ? color : 'rgba(255,255,255,0.35)'} />
      </TouchableOpacity>
      {open && <View style={accStyles.body}>{children}</View>}
    </View>
  )
}

const accStyles = StyleSheet.create({
  card: { backgroundColor: '#1a2a44', borderRadius: 16, marginTop: 10, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#fff' },
  sub: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
})

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  // Kroki (Apple Health / Health Connect): kafelek-pierscien + wykres tygodnia po tapnieciu
  const [todaySteps, setTodaySteps] = useState<number | null>(null)
  const [weekSteps, setWeekSteps] = useState<{ date: string; steps: number }[] | null>(null)
  const [showStepsModal, setShowStepsModal] = useState(false)
  const [weekLoading, setWeekLoading] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isInvisible, setIsInvisible] = useState(false)
  const [togglingInvisible, setTogglingInvisible] = useState(false)
  const [streak, setStreak] = useState(0)
  const [loggedToday, setLoggedToday] = useState(false)
  const [loggingWorkout, setLoggingWorkout] = useState(false)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  // Wejscie z ekranu weryfikacji ("dodaj zdjecie") od razu otwiera edycje profilu
  const params = useLocalSearchParams<{ edit?: string }>()
  useEffect(() => { if (params.edit === '1') setEditing(true) }, [params.edit])
  const [saving, setSaving] = useState(false)
  // Akordeon edycji: otwarta jedna sekcja na raz
  const [openSection, setOpenSection] = useState<string | null>('photos')
  const [gymRecords, setGymRecords] = useState<GymRecord[]>([])
  const [activeTab, setActiveTab] = useState<'profile' | 'liked'>('profile')
  const [whoLiked, setWhoLiked] = useState<Profile[]>([])
  const [whoLikedLoading, setWhoLikedLoading] = useState(false)
  const [stats, setStats] = useState<any>(null)
  // Ref zamiast stanu: useFocusEffect trzyma stare domkniecie, wiec warunek
  // "pierwsze wejscie" na stanie `profile` zawsze widzial null i resetowal scroll
  const loadedOnce = React.useRef(false)

  // Edit states
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [gymName, setGymName] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [schedule, setSchedule] = useState<string[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const [age, setAge] = useState('')
  const [country, setCountry] = useState('')
  const [lookingFor, setLookingFor] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('en')
  const [experienceYears, setExperienceYears] = useState(0)
  const [experienceMonths, setExperienceMonths] = useState(0)
  const [fitnessLevel, setFitnessLevel] = useState('')
  const [preferredExercises, setPreferredExercises] = useState<string[]>([])
  const [trainingFrequency, setTrainingFrequency] = useState('')
  const [trainingIntensity, setTrainingIntensity] = useState('')
  const [sessionLength, setSessionLength] = useState('')
  const [lookingForSpotter, setLookingForSpotter] = useState(false)
  const [showCountryModal, setShowCountryModal] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const [showAgePicker, setShowAgePicker] = useState(false)
  const [gymSearchLoading, setGymSearchLoading] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [gymSuggestionsEdit, setGymSuggestionsEdit] = useState<string[]>([])

  useEffect(() => { loadProfile() }, [])

  useFocusEffect(
    React.useCallback(() => {
      loadProfile()
    }, [])
  )

  function calcAge(dateStr: string): number {
    const date = new Date(dateStr)
    const today = new Date()
    let age = today.getFullYear() - date.getFullYear()
    const m = today.getMonth() - date.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--
    return age
  }

  async function loadProfile() {
    // Pelny loader tylko przy pierwszym wejsciu — ciche odswiezenie przy powrocie
    // nie resetuje pozycji przewijania
    if (!loadedOnce.current) setLoading(true)
    const p = await getMyProfile()
    loadedOnce.current = true
    setProfile(p)
    // Kroki z urzadzenia (tylko buildy z modulem natywnym; w Expo Go cicho pomijane)
    try {
      const { isHealthSupported, isHealthConnected, getTodaySteps } = await import('../../lib/health')
      if (isHealthSupported() && (await isHealthConnected())) {
        getTodaySteps().then(s => setTodaySteps(s)).catch(() => { })
      }
    } catch (e) { }
    if (p) {
      setName(p.name ?? '')
      setBio(p.bio ?? '')
      setCity(p.city ?? '')
      setGymName(p.gym_name ?? '')
      setGoals(p.goals ?? [])
      setSchedule(p.schedule ?? [])
      setPhotos(p.photo_urls ?? [])
      const bd = (p as any).birth_date
      setAge(bd ? calcAge(bd).toString() : ((p as any).age?.toString() ?? ''))
      setCountry((p as any).country ?? '')
      setLookingFor((p as any).looking_for ?? '')
      setPreferredLanguage((p as any).preferred_language ?? 'en')
      setIsInvisible((p as any).is_invisible ?? false)
      setExperienceYears((p as any).experience_years ?? 0)
      setExperienceMonths((p as any).experience_months ?? 0)
      setIsInvisible((p as any).is_invisible ?? false)
      setFitnessLevel((p as any).fitness_level ?? '')
      setPreferredExercises((p as any).preferred_exercises ?? [])
      setTrainingFrequency((p as any).training_frequency ?? '')
      setTrainingIntensity((p as any).training_intensity ?? '')
      setSessionLength((p as any).session_length ?? '')
      setLookingForSpotter((p as any).looking_for_spotter ?? false)
      setGymRecords(Array.isArray((p as any).gym_records) ? (p as any).gym_records : [])
    }
    if (p?.is_premium) {
      loadStats(p.id)
    }
    if (p?.id) {
      const streakStatus = await checkStreakStatus(p.id)
      setStreak(streakStatus.currentStreak)
      setLoggedToday(streakStatus.loggedToday)
    }
    setLoading(false)
  }

  async function handleToggleInvisible() {
    if (!profile) return
    if (!profile.is_premium) { router.push('/premium?highlight=invisible' as any); return }
    setTogglingInvisible(true)
    try {
      const newValue = !isInvisible
      await supabase.from('profiles').update({ is_invisible: newValue }).eq('id', profile.id)
      setIsInvisible(newValue)
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setTogglingInvisible(false)
    }
  }

  // Passa liczy sie TYLKO z realnych wpisow w dzienniku treningow —
  // przycisk prowadzi do dziennika zamiast odhaczac jednym tapnieciem
  // (feedback testerow: inaczej ludzie klikaja tylko zeby podbic passe)
  function handleLogWorkout() {
    if (loggedToday) return
    router.push('/workouts')
  }

  async function handleRestDay() {
    if (!profile || loggingWorkout || loggedToday) return
    setLoggingWorkout(true)
    try {
      const result = await logRestDay(profile.id)
      if (result.success) {
        setLoggedToday(true)
        Alert.alert(
          '😴 ' + (t('streak.restDayTaken') || 'Rest day logged'),
          (t('streak.restDaysLeft') || 'Rest days left this week') + ': ' + (result.restDaysLeft ?? 0)
        )
      } else if (result.error === 'limit_reached') {
        Alert.alert(t('streak.restLimitTitle') || 'Weekly limit reached', t('streak.restLimitDesc') || "You've used both rest days this week")
      } else if (result.error === 'already_logged') {
        Alert.alert(t('streak.alreadyLoggedTitle') || 'Already logged today')
      }
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setLoggingWorkout(false)
    }
  }

  async function loadStats(profileId: string) {
    try {
      const { data } = await supabase.rpc('get_profile_stats', { profile_id: profileId })
      setStats(data)
    } catch (e) { console.error(e) }
  }

  async function loadWhoLiked() {
    if (!profile) return
    setWhoLikedLoading(true)
    try {
      const { data } = await supabase.rpc('get_who_liked_me', { my_id: profile.id })
      setWhoLiked(data ?? [])
    } catch (e) { console.error(e) }
    finally { setWhoLikedLoading(false) }
  }

  // Wybor zrodla: aparat lub galeria
  function pickPhoto() {
    Alert.alert(t('profile.addPhoto'), '', [
      { text: t('common.camera'), onPress: () => launchPicker('camera') },
      { text: t('common.gallery'), onPress: () => launchPicker('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  async function launchPicker(source: 'camera' | 'gallery') {
    let result: ImagePicker.ImagePickerResult
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') { Alert.alert(t('common.error')); return }
      result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 5], quality: 0.8 })
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { Alert.alert(t('common.error')); return }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 5], quality: 0.8 })
    }
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri, name: `photo.${ext}`, type: `image/${ext}` } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
      if (error) { Alert.alert(t('common.error') + ': ' + error.message); return }
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      setPhotos(prev => [...prev, data.publicUrl])
    }
  }

  function removePhoto(index: number) {
    if (photos.length <= 2) { Alert.alert(t('profile.minPhotos')); return }
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  // Zmiana kolejnosci zdjec bez usuwania (pierwsze = glowne)
  function movePhoto(index: number, dir: -1 | 1) {
    setPhotos(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function detectLocation() {
    setLocationLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { Alert.alert(t('common.error'), t('profile.locationPermission')); return }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [address] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      if (address.city) {
        setCity(address.city)
        await supabase.from('profiles').update({
          city: address.city,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }).eq('id', (profile as any).id)
        Alert.alert('✅', address.city)
      }
    } catch (e) { Alert.alert(t('common.error'), t('profile.gymSearchError')) }
    finally { setLocationLoading(false) }
  }

  async function searchGyms() {
    const lat = (profile as any)?.latitude
    const lng = (profile as any)?.longitude
    if (!lat || !lng) { Alert.alert(t('common.error'), t('profile.gymSearchNoLocation')); return }
    setGymSearchLoading(true)
    // Serwerowe wyszukiwanie z cache (Google Places -> Overpass -> Nominatim)
    const { fetchNearbyGyms } = await import('../../lib/supabase')
    const gyms = await fetchNearbyGyms(lat, lng)

    if (gyms.length > 0) setGymSuggestionsEdit(gyms)
    else Alert.alert(t('profile.gymSearchNone'), t('profile.gymSearchNoneSub'))
    setGymSearchLoading(false)
  }

  async function handleSave() {
    if (!profile) return
    if (photos.length < 2) { Alert.alert(t('profile.minPhotos')); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        name, bio, city, gym_name: gymName, goals, schedule, photo_urls: photos,
        age: parseInt(age) || 0, country, looking_for: lookingFor, preferred_language: preferredLanguage,
        experience_years: experienceYears, experience_months: experienceMonths, fitness_level: fitnessLevel,
        preferred_exercises: preferredExercises, training_frequency: trainingFrequency,
        training_intensity: trainingIntensity, session_length: sessionLength,
        looking_for_spotter: lookingForSpotter,
        gym_records: cleanRecords(gymRecords),
      }).eq('id', profile.id)
      if (error) throw error
      await loadProfile()
      setEditing(false)
      Alert.alert(t('profile.saved'), t('profile.profileUpdated'))
    } catch (e: any) { Alert.alert(t('common.error') + ': ' + e?.message) }
    finally { setSaving(false) }
  }

  function toggleGoal(g: string) { setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]) }
  function toggleSchedule(s: string) { setSchedule(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]) }
  function toggleExercise(e: string) { setPreferredExercises(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]) }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  // ===== EDITING MODE =====
  if (editing) return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.editContainer}>
        <View style={styles.editHeaderRow}>
          <Text style={styles.editTitle}>{t('profile.editProfile')}</Text>
        </View>

        {/* Pasek kompletnosci profilu — liczony na zywo z edytowanych pol */}
        {(() => {
          const live = {
            photo_urls: photos, bio, goals, city, gym_name: gymName,
            fitness_level: fitnessLevel, training_frequency: trainingFrequency, training_intensity: trainingIntensity,
          }
          const { pct, missing } = profileCompleteness(live, t)
          return (
            <View style={styles.completeCard}>
              <View style={styles.completeTopRow}>
                <Text style={styles.completePct}>{t('profile.completeLabel', { pct })}</Text>
                {missing && pct < 100 ? <Text style={styles.completeMissing} numberOfLines={1}>→ {missing}</Text> : null}
              </View>
              <View style={styles.completeTrack}>
                <View style={[styles.completeFill, { width: `${pct}%` }]} />
              </View>
            </View>
          )
        })()}

        {/* ===== ZDJECIA ===== */}
        <EditSection
          icon="images-outline" color="#94e336" title={t('profile.photos')} sub={`${photos.length}/6`}
          open={openSection === 'photos'} onToggle={() => setOpenSection(s => s === 'photos' ? null : 'photos')}
        >
        <View style={styles.photosGrid}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photoThumb} />
              {i === 0 && (
                <View style={styles.editMainPhotoPill}>
                  <Text style={styles.editMainPhotoPillText}>{t('profile.mainPhoto') || 'Główne'}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(i)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
              {i > 0 && (
                <TouchableOpacity style={[styles.movePhotoBtn, { left: 4 }]} onPress={() => movePhoto(i, -1)}>
                  <Ionicons name="chevron-back" size={14} color="#fff" />
                </TouchableOpacity>
              )}
              {i < photos.length - 1 && (
                <TouchableOpacity style={[styles.movePhotoBtn, { right: 4 }]} onPress={() => movePhoto(i, 1)}>
                  <Ionicons name="chevron-forward" size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
              <Ionicons name="add" size={28} color={LIME} />
              <Text style={styles.addPhotoLabel}>{t('profile.addPhoto')}</Text>
            </TouchableOpacity>
          )}
        </View>
        </EditSection>

        {/* ===== PODSTAWY ===== */}
        <EditSection
          icon="person-outline" color="#4fc3f7" title={t('profile.basicsSection') || 'Podstawy'}
          open={openSection === 'basics'} onToggle={() => setOpenSection(s => s === 'basics' ? null : 'basics')}
        >
        <Text style={styles.editLabel}>{t('profile.gender')}</Text>
        <View style={styles.tagsGrid}>
          {[{ code: 'male', label: t('profile.male') }, { code: 'female', label: t('profile.female') }, { code: 'other', label: t('profile.other') }].map(g => (
            <TouchableOpacity key={g.code} style={[styles.tagSelect, (profile as any)?.gender === g.code && styles.tagSelectActive]} onPress={async () => {
              if (!profile) return
              await supabase.from('profiles').update({ gender: g.code }).eq('id', profile.id)
              await loadProfile()
            }}>
              <Text style={[styles.tagSelectText, (profile as any)?.gender === g.code && styles.tagSelectTextActive]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.editLabel}>{t('profile.age')}</Text>
        <View style={[styles.selectorBtn, { opacity: 0.6 }]}>
          <Text style={styles.selectorBtnText}>{age ? age + ' ' + t('ui.years') : t('profile.agePlaceholder')}</Text>
          <Ionicons name="lock-closed-outline" size={16} color="rgba(255,255,255,0.3)" />
        </View>

        <Text style={styles.editLabel}>{t('profile.country')}</Text>
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowCountryModal(true)}>
          <Text style={styles.selectorBtnText}>
            {country ? (COUNTRY_FLAGS[country] ?? '🌍') + '  ' + t('countries.' + country) : t('profile.countryPlaceholder')}
          </Text>
          <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>

        <Text style={styles.editLabel}>{t('profile.name')}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('profile.namePlaceholder')} placeholderTextColor="rgba(255,255,255,0.3)" />
        </EditSection>

        {/* ===== LOKALIZACJA I BIO ===== */}
        <EditSection
          icon="location-outline" color="#f0b429" title={t('profile.locationSection') || 'Lokalizacja i bio'}
          open={openSection === 'location'} onToggle={() => setOpenSection(s => s === 'location' ? null : 'location')}
        >
        {/* Miasto WYLACZNIE z GPS (jak w trybie podroznika) — bez recznego wpisywania */}
        <Text style={styles.editLabel}>{t('profile.city')}</Text>
        <Text style={styles.gpsHintEdit}>{t('traveler.gpsHint')}</Text>
        <TouchableOpacity style={styles.gymSearchBtn} onPress={detectLocation} disabled={locationLoading}>
          {locationLoading ? <ActivityIndicator color={PRIMARY} size="small" /> : (
            <Ionicons name={city ? 'checkmark-circle' : 'locate-outline'} size={18} color={city ? LIME : PRIMARY} />
          )}
          <Text style={[styles.gymSearchBtnText, !!city && { color: LIME }]}>
            {locationLoading ? t('common.loading') : (city || t('traveler.useLocation'))}
          </Text>
        </TouchableOpacity>

        <Text style={styles.editLabel}>{t('profile.gym')}</Text>
        <TouchableOpacity style={styles.gymSearchBtn} onPress={searchGyms} disabled={gymSearchLoading}>
          {gymSearchLoading ? <ActivityIndicator color={PRIMARY} size="small" /> : <Ionicons name="search" size={16} color={PRIMARY} />}
          <Text style={styles.gymSearchBtnText}>{gymSearchLoading ? t('common.loading') : t('ui.findGyms') + ' ' + (city || t('ui.myCity'))}</Text>
        </TouchableOpacity>
        {gymSuggestionsEdit.length > 0 && (
          <View style={styles.suggestions}>
            {gymSuggestionsEdit.map((g, i) => (
              <TouchableOpacity key={i} style={styles.suggestionItem} onPress={() => { setGymName(g); setGymSuggestionsEdit([]) }}>
                <Text style={styles.suggestionText}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput style={styles.input} value={gymName} onChangeText={setGymName} placeholder={t('profile.gymSearch')} placeholderTextColor="rgba(255,255,255,0.3)" />

        <Text style={styles.editLabel}>{t('profile.bio')}</Text>
        <TextInput style={[styles.input, styles.textarea]} value={bio} onChangeText={setBio} placeholder={t('profile.bioPlaceholder')} placeholderTextColor="rgba(255,255,255,0.3)" multiline numberOfLines={4} />
        </EditSection>

        {/* ===== TRENING I PREFERENCJE ===== */}
        <EditSection
          icon="barbell-outline" color="#b388ff" title={t('profile.trainingSection') || 'Trening i preferencje'}
          open={openSection === 'training'} onToggle={() => setOpenSection(s => s === 'training' ? null : 'training')}
        >
        <Text style={styles.editLabel}>{t('profile.goals')}</Text>
        <GroupedChips groups={GOAL_GROUPS} selected={goals} onToggle={toggleGoal} itemPrefix="goals." groupPrefix="goalGroups." chipBg={BG} />

        <Text style={styles.editLabel}>{t('profile.schedule')}</Text>
        <View style={styles.tagsGrid}>
          {ALL_SCHEDULES.map(s => (
            <TouchableOpacity key={s} style={[styles.tagSelect, schedule.includes(s) && styles.tagSelectActive]} onPress={() => toggleSchedule(s)}>
              <Text style={[styles.tagSelectText, schedule.includes(s) && styles.tagSelectTextActive]}>{t('schedule.' + s)}</Text>
            </TouchableOpacity>
          ))}
        </View>



        <Text style={styles.editLabel}>{t('gym.experienceYears')}</Text>
        <View style={styles.expStepperRow}>
          <View style={styles.expStepperBox}>
            <Text style={styles.expStepperLabel}>{t('workouts.year') || 'Years'}</Text>
            <View style={styles.expStepperControls}>
              <TouchableOpacity style={styles.expStepperBtn} onPress={() => setExperienceYears(Math.max(0, experienceYears - 1))}>
                <Text style={styles.expStepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.expStepperValue}>{experienceYears}</Text>
              <TouchableOpacity style={styles.expStepperBtn} onPress={() => setExperienceYears(Math.min(30, experienceYears + 1))}>
                <Text style={styles.expStepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.expStepperBox}>
            <Text style={styles.expStepperLabel}>{t('workouts.month') || 'Months'}</Text>
            <View style={styles.expStepperControls}>
              <TouchableOpacity style={styles.expStepperBtn} onPress={() => setExperienceMonths(Math.max(0, experienceMonths - 1))}>
                <Text style={styles.expStepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.expStepperValue}>{experienceMonths}</Text>
              <TouchableOpacity style={styles.expStepperBtn} onPress={() => setExperienceMonths(Math.min(11, experienceMonths + 1))}>
                <Text style={styles.expStepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {experienceYears === 0 && experienceMonths === 0 && (
          <Text style={styles.expBeginner}>{t('gym.beginner') || 'Just starting out'} 💪</Text>
        )}

        <Text style={styles.editLabel}>{t('profile.preferredLanguage') || 'Preferred communication language'}</Text>
        <View style={styles.tagsGrid}>
          {[
            { code: 'pl', label: 'Polski' },
            { code: 'en', label: 'English' },
            { code: 'de', label: 'Deutsch' },
            { code: 'fr', label: 'Français' },
            { code: 'es', label: 'Español' },
            { code: 'nl', label: 'Nederlands' },
            { code: 'bg', label: 'Български' },
            { code: 'ro', label: 'Română' },
            { code: 'tr', label: 'Türkçe' },
          ].map(o => (
            <TouchableOpacity key={o.code} style={[styles.tagSelect, preferredLanguage === o.code && styles.tagSelectActive]} onPress={() => setPreferredLanguage(o.code)}>
              <Text style={[styles.tagSelectText, preferredLanguage === o.code && styles.tagSelectTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.editLabel}>{t('gym.fitnessLevel')}</Text>
        <View style={styles.tagsGrid}>
          {[{ code: 'beginner', label: t('gym.beginner') }, { code: 'intermediate', label: t('gym.intermediate') }, { code: 'advanced', label: t('gym.advanced') }, { code: 'pro', label: t('gym.pro') }].map(l => (
            <TouchableOpacity key={l.code} style={[styles.tagSelect, fitnessLevel === l.code && styles.tagSelectActive]} onPress={() => setFitnessLevel(l.code)}>
              <Text style={[styles.tagSelectText, fitnessLevel === l.code && styles.tagSelectTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.editLabel}>{t('gym.frequency')}</Text>
        <View style={styles.tagsGrid}>
          {[{ code: '1-2', label: t('gym.freq1') }, { code: '3-4', label: t('gym.freq2') }, { code: '5+', label: t('gym.freq3') }, { code: 'daily', label: t('gym.freq4') }].map(f => (
            <TouchableOpacity key={f.code} style={[styles.tagSelect, trainingFrequency === f.code && styles.tagSelectActive]} onPress={() => setTrainingFrequency(f.code)}>
              <Text style={[styles.tagSelectText, trainingFrequency === f.code && styles.tagSelectTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.editLabel}>{t('profile.intensityLabel') || 'Intensywność treningu'}</Text>
        <View style={styles.tagsGrid}>
          {[
            { code: 'chill', label: '😌 ' + (t('profile.intensity_chill') || 'Na luzie') },
            { code: 'solid', label: '💪 ' + (t('profile.intensity_solid') || 'Solidnie') },
            { code: 'beast', label: '🔥 ' + (t('profile.intensity_beast') || 'Beast mode') },
          ].map(o => (
            <TouchableOpacity key={o.code} style={[styles.tagSelect, trainingIntensity === o.code && styles.tagSelectActive]} onPress={() => setTrainingIntensity(trainingIntensity === o.code ? '' : o.code)}>
              <Text style={[styles.tagSelectText, trainingIntensity === o.code && styles.tagSelectTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.editLabel}>{t('profile.sessionLabel') || 'Długość sesji'}</Text>
        <View style={styles.tagsGrid}>
          {[
            { code: 'short', label: t('profile.session_short') || '30-45 min' },
            { code: 'medium', label: t('profile.session_medium') || '60-90 min' },
            { code: 'long', label: t('profile.session_long') || '2h+' },
          ].map(o => (
            <TouchableOpacity key={o.code} style={[styles.tagSelect, sessionLength === o.code && styles.tagSelectActive]} onPress={() => setSessionLength(sessionLength === o.code ? '' : o.code)}>
              <Text style={[styles.tagSelectText, sessionLength === o.code && styles.tagSelectTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.tagSelect, { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 12, marginTop: 4 }, lookingForSpotter && styles.tagSelectActive]}
          onPress={() => setLookingForSpotter(v => !v)}
        >
          <Text style={{ fontSize: 15 }}>🤝</Text>
          <Text style={[styles.tagSelectText, lookingForSpotter && styles.tagSelectTextActive]}>
            {t('profile.spotterToggle') || 'Szukam kogoś do asekuracji przy ciężarach'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.editLabel}>{t('gym.preferredExercises')}</Text>
        <GroupedChips groups={EXERCISE_GROUPS} selected={preferredExercises} onToggle={toggleExercise} itemPrefix="gym." groupPrefix="exGroups." chipBg={BG} />
        </EditSection>

        {/* ===== REKORDY ===== */}
        <EditSection
          icon="trophy-outline" color="#f0b429" title={t('records.title')} sub={gymRecords.length > 0 ? String(gymRecords.length) : undefined}
          open={openSection === 'records'} onToggle={() => setOpenSection(s => s === 'records' ? null : 'records')}
        >
          <GymRecordsEditor records={gymRecords} onChange={setGymRecords} />
        </EditSection>

        {/* Modal wieku */}
        <Modal visible={showAgePicker} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.ageModalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('profile.age')}</Text>
                <TouchableOpacity style={styles.ageModalDoneBtn} onPress={() => setShowAgePicker(false)}>
                  <Text style={styles.ageModalDone}>{t('ui.done')}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.ageScrollView} showsVerticalScrollIndicator={false}>
                {Array.from({ length: 82 }, (_, i) => i + 18).map(a => (
                  <TouchableOpacity key={a} style={[styles.ageOption, age === String(a) && styles.ageOptionActive]} onPress={() => setAge(String(a))}>
                    <Text style={[styles.ageOptionText, age === String(a) && styles.ageOptionTextActive]}>{a} {t('ui.years')}</Text>
                    {age === String(a) && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Modal kraju */}
        <Modal visible={showCountryModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.countryModalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('profile.country')}</Text>
                <TouchableOpacity onPress={() => { setShowCountryModal(false); setCountrySearch('') }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <TextInput style={styles.modalSearch} placeholder={t('ui.searchCountry')} placeholderTextColor="rgba(255,255,255,0.3)" value={countrySearch} onChangeText={setCountrySearch} />
              <FlatList
                data={COUNTRY_CODES.filter(code => t('countries.' + code).toLowerCase().includes(countrySearch.toLowerCase()))}
                keyExtractor={item => item}
                renderItem={({ item: code }) => (
                  <TouchableOpacity style={[styles.countryItem, country === code && styles.countryItemActive]} onPress={() => { setCountry(code); setShowCountryModal(false); setCountrySearch('') }}>
                    <Text style={styles.countryFlag}>{COUNTRY_FLAGS[code]}</Text>
                    <Text style={[styles.countryName, country === code && styles.countryNameActive]}>{t('countries.' + code)}</Text>
                    {country === code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        <View style={styles.navRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )

  // ===== VIEW MODE =====
  return (
    <>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* HERO - glowne zdjecie z imieniem i danymi na gradiencie */}
      <View style={styles.hero}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.heroImageWrap}
          onPress={() => { if (photos[0]) { setViewingPhoto(photos[0]); setViewingPhotoIndex(0) } }}
        >
          <Image source={{ uri: photos[0] ?? 'https://i.pravatar.cc/300' }} style={styles.heroImage} />
        </TouchableOpacity>
        <LinearGradient
          colors={['transparent', 'rgba(13,27,46,0.55)', BG]}
          locations={[0.45, 0.8, 1]}
          style={styles.heroGradient}
          pointerEvents="none"
        />
        <TouchableOpacity style={styles.heroSettingsBtn} onPress={() => router.push('/settings' as any)}>
          <Ionicons name="settings-outline" size={17} color="#fff" />
        </TouchableOpacity>
        <View style={styles.heroInfo} pointerEvents="none">
          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>
              {profile?.name}{(profile as any)?.age ? `, ${(profile as any).age}` : ''}
            </Text>
            {(profile as any)?.is_verified && <Ionicons name="shield-checkmark" size={19} color="#4fc3f7" />}
            {profile?.is_premium && <Text style={{ fontSize: 15 }}>⭐</Text>}
            {(profile as any)?.is_founder && <Ionicons name="ribbon" size={17} color="#f0b429" />}
          </View>
          {(profile?.city || profile?.gym_name) ? (
            <Text style={styles.heroMeta} numberOfLines={1}>
              {[profile?.city ? '📍 ' + profile.city : null, profile?.gym_name ? '🏋️ ' + profile.gym_name : null].filter(Boolean).join('  ·  ')}
            </Text>
          ) : null}
        </View>
        {photos.length > 1 && (
          <View style={styles.heroThumbs}>
            {photos.slice(1, 3).map((uri, i) => (
              <TouchableOpacity key={i} onPress={() => { setViewingPhoto(uri); setViewingPhotoIndex(i + 1) }}>
                <Image source={{ uri }} style={styles.heroThumb} />
              </TouchableOpacity>
            ))}
            {photos.length > 3 && (
              <TouchableOpacity style={styles.heroThumbMore} onPress={() => { setViewingPhoto(photos[3]); setViewingPhotoIndex(3) }}>
                <Text style={styles.heroThumbMoreText}>+{photos.length - 3}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'profile' && styles.tabBtnActive]}
          onPress={() => setActiveTab('profile')}
        >
          <Ionicons name="person-outline" size={18} color={activeTab === 'profile' ? PRIMARY : 'rgba(255,255,255,0.4)'} />
          <Text style={[styles.tabBtnText, activeTab === 'profile' && styles.tabBtnTextActive]}>{t('tabs.profile')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'liked' && styles.tabBtnActive]}
          onPress={() => {
            if (!profile?.is_premium) { router.push('/premium?highlight=whoLiked' as any); return }
            setActiveTab('liked')
            loadWhoLiked()
          }}
        >
          <Ionicons name="eye-outline" size={18} color={activeTab === 'liked' ? PRIMARY : 'rgba(255,255,255,0.4)'} />
          <Text style={[styles.tabBtnText, activeTab === 'liked' && styles.tabBtnTextActive]}>
            {t('whoLiked.title')} {!profile?.is_premium ? '🔒' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'profile' ? (
        <View style={styles.infoContainer}>

          {/* ============ SEKCJA DARMOWA ============ */}

          {/* Pasek liczb: seria / matche / wyswietlenia */}
          <View style={styles.metricsRow}>
            <TouchableOpacity style={styles.metricTile} onPress={() => router.push('/workouts')} activeOpacity={0.8}>
              <Text style={[styles.metricNum, { color: '#ffb340' }]}>🔥 {streak}</Text>
              <Text style={styles.metricLabel}>{t('streak.inARow') || 'workout streak'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.metricTile} onPress={() => router.push('/(tabs)/matches')} activeOpacity={0.8}>
              <Text style={[styles.metricNum, { color: LIME }]}>{stats?.matches ?? 0}</Text>
              <Text style={styles.metricLabel}>{t('stats.matches')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.metricTile}
              onPress={() => profile?.is_premium ? router.push('/profile-viewers' as any) : router.push('/premium?highlight=stats' as any)}
              activeOpacity={0.8}
            >
              <Text style={[styles.metricNum, { color: '#4fc3f7' }]}>{profile?.is_premium ? (stats?.views ?? 0) : '🔒'}</Text>
              <Text style={styles.metricLabel}>{t('stats.views')}</Text>
            </TouchableOpacity>
          </View>

          {/* Akcje streaka */}
          <View style={styles.streakActionsRow}>
            <TouchableOpacity
              style={[styles.streakMainBtn, loggedToday && styles.streakMainBtnDone]}
              onPress={handleLogWorkout}
              disabled={loggedToday || loggingWorkout}
            >
              <Ionicons name={loggedToday ? 'checkmark-circle' : 'add-circle-outline'} size={17} color={loggedToday ? LIME : BG} />
              <Text style={[styles.streakMainBtnText, loggedToday && styles.streakMainBtnTextDone]}>
                {loggedToday ? (t('streak.doneToday') || 'Done today') : (t('streak.logWorkout') || 'Log workout')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.restSmallBtn, loggedToday && { opacity: 0.4 }]}
              onPress={handleRestDay}
              disabled={loggedToday || loggingWorkout}
            >
              <Ionicons name="bed-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.restSmallBtnText}>{t('streak.restDay') || 'Rest day'}</Text>
            </TouchableOpacity>
          </View>

          {/* Ranking pass w okolicy (30 km) — lokalna rywalizacja */}
          <TouchableOpacity style={styles.leaderboardBtn} onPress={() => router.push('/leaderboard' as any)}>
            <Ionicons name="trophy-outline" size={15} color="#f0b429" />
            <Text style={styles.leaderboardBtnText}>{t('leaderboard.title')}</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          {/* Pierscien aktywnosci: dzisiejsze kroki vs cel; tap = wykres tygodnia */}
          {todaySteps !== null && (() => {
            const goal = 8000
            const pct = Math.min(1, todaySteps / goal)
            const R = 32
            const CIRC = 2 * Math.PI * R
            return (
              <TouchableOpacity
                style={styles.stepsCard}
                activeOpacity={0.8}
                onPress={async () => {
                  setShowStepsModal(true)
                  if (!weekSteps) {
                    setWeekLoading(true)
                    try {
                      const { getWeekSteps } = await import('../../lib/health')
                      setWeekSteps(await getWeekSteps())
                    } catch (e) { }
                    finally { setWeekLoading(false) }
                  }
                }}
              >
                <View style={{ width: 76, height: 76 }}>
                  <Svg width={76} height={76}>
                    <Circle cx={38} cy={38} r={R} stroke="rgba(255,255,255,0.1)" strokeWidth={8} fill="none" />
                    <Circle
                      cx={38} cy={38} r={R}
                      stroke={LIME} strokeWidth={8} fill="none" strokeLinecap="round"
                      strokeDasharray={`${CIRC * pct} ${CIRC}`}
                      transform="rotate(-90 38 38)"
                    />
                  </Svg>
                  <View style={styles.stepsRingCenter} pointerEvents="none">
                    <Text style={styles.stepsRingValue}>{todaySteps.toLocaleString()}</Text>
                    <Text style={styles.stepsRingGoal}>/ {goal.toLocaleString()}</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepsTitle}>👟 {t('health.stepsTitle')}</Text>
                  <Text style={styles.stepsSub}>{t('health.goalPct', { pct: Math.round(pct * 100) })}</Text>
                  <Text style={[styles.stepsVisibility, !(profile as any)?.show_steps && { color: 'rgba(255,255,255,0.35)' }]}>
                    {(profile as any)?.show_steps ? '✓ ' + t('health.visibleOnProfile') : t('health.hiddenOnProfile')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )
          })()}

          {/* Wykres tygodnia po tapnieciu w pierscien */}
          <Modal visible={showStepsModal} transparent animationType="slide" onRequestClose={() => setShowStepsModal(false)}>
            <TouchableOpacity style={styles.stepsModalOverlay} activeOpacity={1} onPress={() => setShowStepsModal(false)}>
              <View style={styles.stepsModalSheet} onStartShouldSetResponder={() => true}>
                <View style={styles.stepsModalHandle} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                  <Text style={styles.stepsModalTitle}>👟 {t('health.weekTitle')}</Text>
                  <Text style={styles.stepsModalToday}>{(todaySteps ?? 0).toLocaleString()}</Text>
                </View>
                {weekLoading ? (
                  <ActivityIndicator color={LIME} style={{ marginVertical: 30 }} />
                ) : weekSteps ? (
                  <>
                    <View style={styles.weekChartRow}>
                      {(() => {
                        const maxSteps = Math.max(...weekSteps.map(d => d.steps), 1)
                        return weekSteps.map((d, i) => {
                          const isToday = i === weekSteps.length - 1
                          return (
                            <View key={d.date} style={styles.weekBarCol}>
                              <Text style={styles.weekBarValue}>{d.steps >= 1000 ? (d.steps / 1000).toFixed(1) + 'k' : d.steps}</Text>
                              <View style={styles.weekBarTrack}>
                                <View style={[styles.weekBarFill, {
                                  height: `${Math.max(4, Math.round((d.steps / maxSteps) * 100))}%` as any,
                                  backgroundColor: isToday ? LIME : 'rgba(148,227,54,0.3)',
                                }]} />
                              </View>
                              <Text style={[styles.weekBarLabel, isToday && { color: LIME, fontWeight: '800' }]}>
                                {isToday ? t('chat.today') : new Date(d.date + 'T12:00:00').toLocaleDateString(i18n.language, { weekday: 'short' })}
                              </Text>
                            </View>
                          )
                        })
                      })()}
                    </View>
                    <Text style={styles.weekAvg}>
                      {t('health.weekAvg', { avg: Math.round(weekSteps.reduce((s, d) => s + d.steps, 0) / weekSteps.length).toLocaleString() })}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.weekAvg}>{t('common.error')}</Text>
                )}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* ===== O MNIE ===== */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>{t('profile.aboutMe') || 'O mnie'}</Text>
            <TouchableOpacity style={styles.sectionEditBtn} onPress={() => setEditing(true)}>
              <Ionicons name="pencil" size={12} color={LIME} />
              <Text style={styles.sectionEditBtnText}>{t('profile.editProfile')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sectionCard}>
            {/* Miernik kompletnosci profilu */}
            {(() => {
              const comp = profileCompleteness(profile, t)
              if (comp.pct >= 100) return null
              return (
                <TouchableOpacity style={styles.completeness} onPress={() => setEditing(true)} activeOpacity={0.8}>
                  <View style={styles.completenessRow}>
                    <Text style={styles.completenessText}>
                      {(t('profile.completeLabel', { pct: comp.pct }) || `Profil uzupełniony w ${comp.pct}%`)}
                    </Text>
                    {comp.missing && (
                      <Text style={styles.completenessAdd}>+ {comp.missing}</Text>
                    )}
                  </View>
                  <View style={styles.completenessTrack}>
                    <View style={[styles.completenessFill, { width: `${comp.pct}%` }]} />
                  </View>
                </TouchableOpacity>
              )
            })()}

            {/* Chipy podstawowe: plec / kraj / jezyk (z flagami) */}
            {(profile as any)?.gender || (profile as any)?.country || (profile as any)?.preferred_language ? (
              <View style={styles.statsRow}>
                {(profile as any)?.gender ? (
                  <View style={styles.statBadge}>
                    <Ionicons name={(profile as any).gender === 'male' ? 'man-outline' : (profile as any).gender === 'female' ? 'woman-outline' : 'person-outline'} size={14} color="#00aaff" />
                    <Text style={styles.statText}>{(profile as any).gender === 'male' ? t('profile.male') : (profile as any).gender === 'female' ? t('profile.female') : t('profile.other')}</Text>
                  </View>
                ) : null}
                {(profile as any)?.country ? <View style={styles.statBadge}><Text style={styles.statText}>{COUNTRY_FLAGS[(profile as any).country] ?? '🌍'} {t('countries.' + (profile as any).country)}</Text></View> : null}
                {(profile as any)?.preferred_language ? (
                  <View style={styles.statBadge}>
                    <Text style={styles.statText}>{LANG_FLAGS[(profile as any).preferred_language] ?? '💬'} {t('languages.' + (profile as any).preferred_language) || (profile as any).preferred_language}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Bio jako wyeksponowany cytat */}
            {profile?.bio ? (
              <View style={styles.bioQuote}>
                <Text style={styles.bioQuoteText}>„{profile.bio}"</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.addBioCta} onPress={() => setEditing(true)}>
                <Text style={styles.addBioCtaText}>✨ {t('profile.addBio') || 'Dodaj bio — profile z opisem dostają więcej matchy'}</Text>
              </TouchableOpacity>
            )}

            {/* Bento: kluczowe fakty */}
            <View style={styles.bentoGrid}>
              {((profile as any)?.fitness_level || (profile as any)?.experience_years > 0) ? (
                <View style={styles.bentoTile}>
                  <Text style={styles.bentoLabel}>{t('gym.fitnessLevel')}</Text>
                  <Text style={[styles.bentoValue, { color: '#ffd28a' }]}>🏆 {(profile as any)?.fitness_level ? t('gym.' + (profile as any).fitness_level) : '—'}</Text>
                  {(profile as any)?.experience_years > 0 && (
                    <Text style={styles.bentoSub}>{(profile as any).experience_years} {t('ui.years')}</Text>
                  )}
                </View>
              ) : null}
              {(profile as any)?.training_intensity ? (
                <View style={styles.bentoTile}>
                  <Text style={styles.bentoLabel}>{t('profile.intensityLabel') || 'Intensywność'}</Text>
                  <Text style={[styles.bentoValue, { color: '#ff9a9a' }]}>
                    {(profile as any).training_intensity === 'chill' ? '😌 ' + (t('profile.intensity_chill') || 'Na luzie') : (profile as any).training_intensity === 'solid' ? '💪 ' + (t('profile.intensity_solid') || 'Solidnie') : '🔥 ' + (t('profile.intensity_beast') || 'Beast mode')}
                  </Text>
                  {(profile as any)?.session_length && (
                    <Text style={styles.bentoSub}>{(profile as any).session_length === 'short' ? (t('profile.session_short') || '30-45 min') : (profile as any).session_length === 'medium' ? (t('profile.session_medium') || '60-90 min') : (t('profile.session_long') || '2h+')}</Text>
                  )}
                </View>
              ) : null}
              {(profile as any)?.training_frequency ? (
                <View style={styles.bentoTile}>
                  <Text style={styles.bentoLabel}>{t('gym.frequency')}</Text>
                  <Text style={[styles.bentoValue, { color: LIME }]}>
                    {(profile as any).training_frequency === '1-2' ? t('gym.freq1') : (profile as any).training_frequency === '3-4' ? t('gym.freq2') : (profile as any).training_frequency === '5+' ? t('gym.freq3') : (profile as any).training_frequency === 'daily' ? t('gym.freq4') : (profile as any).training_frequency}
                  </Text>
                  {profile?.schedule && profile.schedule.length > 0 && (
                    <Text style={styles.bentoSub} numberOfLines={1}>{profile.schedule.slice(0, 2).map(s => t('schedule.' + s)).join(' · ')}</Text>
                  )}
                </View>
              ) : null}
              {(profile as any)?.looking_for_spotter ? (
                <View style={[styles.bentoTile, styles.bentoTileHighlight]}>
                  <Text style={[styles.bentoLabel, { color: LIME }]}>{t('profile.spotterLabel') || 'Asekuracja'}</Text>
                  <Text style={[styles.bentoValue, { color: '#b5e084' }]}>🤝 {t('profile.spotterBadge') || 'Szuka asekuracji'}</Text>
                </View>
              ) : null}
            </View>

            {/* Cele */}
            {profile?.goals && profile.goals.length > 0 && (
              <>
                <Text style={styles.aboutGroupLabel}>🎯 {t('profile.trainingGoals')}</Text>
                <ChipGroup
                  items={profile.goals.map(g => t('goals.' + g) || g)}
                  filled
                  moreLabel={n => (t('ui.moreChips', { count: n }) || `+${n} więcej`)}
                />
              </>
            )}

            {/* Cwiczenia */}
            {(profile as any)?.preferred_exercises && (profile as any).preferred_exercises.length > 0 && (
              <>
                <Text style={styles.aboutGroupLabel}>🏋️ {t('gym.preferredExercises')}</Text>
                <ChipGroup
                  items={(profile as any).preferred_exercises.map((e: string) => t('gym.' + e) || e)}
                  moreLabel={n => (t('ui.moreChips', { count: n }) || `+${n} więcej`)}
                />
              </>
            )}

            {/* Pory treningu */}
            {profile?.schedule && profile.schedule.length > 0 && (
              <>
                <Text style={styles.aboutGroupLabel}>🕐 {t('profile.trainingSchedule')}</Text>
                <ChipGroup
                  items={profile.schedule.map(s => t('schedule.' + s) || s)}
                  moreLabel={n => (t('ui.moreChips', { count: n }) || `+${n} więcej`)}
                />
              </>
            )}
          </View>

          {/* ===== AKTYWNOŚĆ ===== */}
          <Text style={styles.sectionHeader}>{t('profile.sectionActivity') || 'Aktywność'}</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="flash" color="#4f8422" label={t('trainingStatus.profileButton')} onPress={() => router.push('/training-status')} />
            <View style={styles.rowDivider} />
            <SettingsRow icon="body" color="#7a42b5" label={t('body.title')} onPress={() => router.push('/body' as any)} />
            <View style={styles.rowDivider} />
            <SettingsRow icon="clipboard" color="#4f8422" label={t('plans.title')} onPress={() => router.push('/plans' as any)} />
            <View style={styles.rowDivider} />
            <SettingsRow icon="map" color="#2e7ab8" label={t('liveMap.viewButton') || "Who's at the gym now"} onPress={() => router.push('/gym-live-map' as any)} />
            <View style={styles.rowDivider} />
            <SettingsRow icon="ribbon" color="#b8921e" label={t('achievements.title') || 'Achievements'} onPress={() => router.push('/achievements' as any)} />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="calendar"
              color="#1a7fa8"
              label={t('workouts.title')}
              onPress={() => router.push('/workouts')}
            />
          </View>

          {/* ===== SPOŁECZNOŚĆ ===== */}
          <Text style={styles.sectionHeader}>{t('profile.sectionCommunity') || 'Społeczność'}</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="podium" color="#6b5d10" label={t('gymRanking.entry')} onPress={() => router.push('/gym-ranking' as any)} />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="airplane"
              color="#4a2570"
              label={t('traveler.toggle')}
              sub={(profile as any)?.traveler_until && (profile as any).traveler_until >= new Date().toISOString().split('T')[0]
                ? t('traveler.activeUntil', { date: (profile as any).traveler_until })
                : t('traveler.toggleSub')}
              onPress={() => router.push('/traveler' as any)}
            />
            <View style={styles.rowDivider} />
            {!(profile as any)?.is_trainer && (
              <>
                <SettingsRow
                  icon="search"
                  color="#1a7fa8"
                  label={t('trainer.seekingToggle')}
                  sub={t('trainer.seekingToggleSub')}
                  right={
                    <Switch
                      value={!!(profile as any)?.looking_for_trainer}
                      onValueChange={async (v) => {
                        setProfile((prev: any) => ({ ...prev, looking_for_trainer: v }))
                        await supabase.from('profiles').update({ looking_for_trainer: v }).eq('id', profile!.id)
                      }}
                      trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(212,175,55,0.5)' }}
                      thumbColor={(profile as any)?.looking_for_trainer ? '#d4af37' : '#fff'}
                    />
                  }
                />
                <View style={styles.rowDivider} />
              </>
            )}
            {(profile as any)?.is_verified ? (
              <SettingsRow
                icon="shield-checkmark"
                color="#2e7ab8"
                label={t('verification.successTitle')}
                right={<Ionicons name="checkmark-circle" size={18} color={LIME} />}
              />
            ) : (
              <SettingsRow icon="shield-checkmark" color="#2e7ab8" label={t('verification.title')} onPress={() => router.push('/verification')} />
            )}
          </View>

          {/* ===== PREMIUM ===== */}
          <Text style={styles.sectionHeader}>⭐ {t('profile.premiumSection') || 'Premium'}</Text>
          <View style={styles.sectionCard}>
            <SettingsRow
              icon="eye-off"
              color="#546e7a"
              label={t('profile.invisibleMode') || 'Invisible mode'}
              locked={!profile?.is_premium}
              onPress={!profile?.is_premium ? () => router.push('/premium?highlight=invisible' as any) : undefined}
              right={profile?.is_premium ? (
                <Switch
                  value={isInvisible}
                  onValueChange={handleToggleInvisible}
                  disabled={togglingInvisible}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(0,170,255,0.5)' }}
                  thumbColor={isInvisible ? '#00aaff' : '#fff'}
                />
              ) : undefined}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="star"
              color="#b8921e"
              label={profile?.is_premium ? t('profile.managePremium') : t('profile.goPremium')}
              onPress={() => router.push('/premium')}
            />
          </View>
        </View>
      ) : (
        <View style={styles.infoContainer}>
          {whoLikedLoading ? (
            <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 40 }} />
          ) : whoLiked.length === 0 ? (
            <View style={styles.emptyLiked}>
              <View style={styles.emptyLikedIconCircle}>
                <Ionicons name="eye-off-outline" size={36} color="#00aaff" />
              </View>
              <Text style={styles.emptyLikedTitle}>{t('whoLiked.empty')}</Text>
              <Text style={styles.emptyLikedSub}>{t('whoLiked.emptySub')}</Text>
            </View>
          ) : (
            <View style={styles.likedGrid}>
              {whoLiked.map(p => {
                const photo = p.photo_urls?.[0]
                return (
                  <View key={p.id} style={styles.likedCard}>
                    <TouchableOpacity onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: p.id } })}>
                      <Image source={{ uri: photo ?? 'https://i.pravatar.cc/200' }} style={styles.likedPhoto} />
                      {(p as any).is_verified && <View style={styles.likedVerified}><Text>✅</Text></View>}
                      <View style={styles.likedInfo}>
                        <Text style={styles.likedName}>{p.name}</Text>
                        {p.city ? <Text style={styles.likedCity}>📍 {p.city}</Text> : null}
                      </View>
                    </TouchableOpacity>
                    <View style={styles.likedActions}>
                      <TouchableOpacity style={styles.likedPassBtn} onPress={async () => {
                        if (!profile) return
                        await supabase.from('swipes').insert({ swiper_id: profile.id, swiped_id: p.id, direction: 'left' })
                        setWhoLiked(prev => prev.filter(x => x.id !== p.id))
                      }}>
                        <Ionicons name="close" size={20} color="#ff4757" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.likedLikeBtn} onPress={async () => {
                        if (!profile) return
                        const result = await supabase.from('swipes').insert({ swiper_id: profile.id, swiped_id: p.id, direction: 'right' })
                        setWhoLiked(prev => prev.filter(x => x.id !== p.id))
                        Alert.alert('🤝 ' + t('swipe.match'), t('swipe.matchSub'))
                      }}>
                        <Ionicons name="flame" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      )}
    </ScrollView>

    <Modal visible={!!viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(null)}>
      <View style={styles.photoViewerOverlay}>
        <TouchableOpacity style={styles.photoViewerClose} onPress={() => setViewingPhoto(null)}>
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: viewingPhotoIndex * 400, y: 0 }}
          style={{ flex: 1 }}
        >
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoViewerPage}>
              <Image source={{ uri }} style={styles.photoViewerImage} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        {photos.length > 1 && (
          <View style={styles.photoViewerDots}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.photoViewerDot, i === viewingPhotoIndex && styles.photoViewerDotActive]} />
            ))}
          </View>
        )}
      </View>
    </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  photosScroll: { marginTop: 16 },
  hero: { width: SCREEN_W, height: SCREEN_W * 1.05, backgroundColor: BG_LIGHT },
  heroImageWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%' },
  heroSettingsBtn: { position: 'absolute', top: 54, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  heroInfo: { position: 'absolute', left: 16, right: 110, bottom: 14 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroName: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroMeta: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  heroThumbs: { position: 'absolute', right: 12, bottom: 14, flexDirection: 'row', gap: 5 },
  heroThumb: { width: 30, height: 40, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: BG_LIGHT },
  heroThumbMore: { width: 30, height: 40, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroThumbMoreText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  trainerCta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 10 },
  trainerCtaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  trainerCtaTitle: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  trainerCtaSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  metricTile: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  metricNum: { fontSize: 18, fontWeight: '800', color: '#fff' },
  metricLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3 },
  streakActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  leaderboardBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(240,180,41,0.08)', borderWidth: 1, borderColor: 'rgba(240,180,41,0.3)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, marginBottom: 4 },
  stepsCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: BG_LIGHT, borderRadius: 18, padding: 14, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(148,227,54,0.25)' },
  stepsRingCenter: { position: 'absolute', top: 0, left: 0, width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  stepsRingValue: { fontSize: 13, fontWeight: '800', color: '#fff' },
  stepsRingGoal: { fontSize: 9.5, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  stepsTitle: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  stepsSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  stepsVisibility: { fontSize: 11, color: LIME, marginTop: 5, fontWeight: '600' },
  stepsModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  stepsModalSheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 38 },
  stepsModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  stepsModalTitle: { fontSize: 16.5, fontWeight: '800', color: '#fff' },
  stepsModalToday: { fontSize: 22, fontWeight: '800', color: LIME },
  weekChartRow: { flexDirection: 'row', gap: 8, height: 150, alignItems: 'flex-end' },
  weekBarCol: { flex: 1, alignItems: 'center', height: '100%' },
  weekBarValue: { fontSize: 9.5, color: 'rgba(255,255,255,0.5)', marginBottom: 3 },
  weekBarTrack: { flex: 1, width: '68%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'flex-end', overflow: 'hidden' },
  weekBarFill: { width: '100%', borderRadius: 6 },
  weekBarLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 5 },
  weekAvg: { fontSize: 12.5, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 14 },
  leaderboardBtnText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#f0b429' },
  streakMainBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: LIME, borderRadius: 14, paddingVertical: 11 },
  streakMainBtnDone: { backgroundColor: 'rgba(148,227,54,0.15)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)' },
  streakMainBtnText: { fontSize: 13, fontWeight: '800', color: BG },
  streakMainBtnTextDone: { color: LIME },
  restSmallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  restSmallBtnText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(148,227,54,0.1)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  sectionEditBtnText: { fontSize: 11, fontWeight: '700', color: LIME },
  sectionCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  completeness: { marginBottom: 12 },
  completenessRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  completenessText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  completenessAdd: { fontSize: 11, fontWeight: '700', color: LIME },
  completenessTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  completenessFill: { height: 4, borderRadius: 2, backgroundColor: LIME },
  bioQuote: { backgroundColor: 'rgba(255,255,255,0.04)', borderLeftWidth: 3, borderLeftColor: LIME, borderRadius: 12, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: 12, marginTop: 10 },
  bioQuoteText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 21 },
  addBioCta: { borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)', borderStyle: 'dashed', borderRadius: 12, padding: 12, marginTop: 10, alignItems: 'center' },
  addBioCtaText: { fontSize: 12, color: '#b5e084', fontWeight: '600', textAlign: 'center' },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  bentoTile: { width: '48%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 10 },
  bentoTileHighlight: { backgroundColor: 'rgba(148,227,54,0.1)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.4)' },
  bentoLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textTransform: 'uppercase' },
  bentoValue: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 3 },
  bentoSub: { fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  aboutGroupLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 7 },
  aboutChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aboutChip: { borderWidth: 1, borderColor: 'rgba(125,197,46,0.4)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  aboutChipFilled: { backgroundColor: LIME, borderColor: LIME },
  aboutChipText: { fontSize: 12, color: '#b5e084', fontWeight: '600' },
  aboutChipTextFilled: { color: BG, fontWeight: '700' },
  aboutChipMore: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  aboutChipMoreText: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  settingsRowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingsRowLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  settingsRowSubText: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8, marginLeft: 39 },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  photoViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  photoViewerPage: { width: 400, alignItems: 'center', justifyContent: 'center' },
  photoViewerImage: { width: 400, height: '80%' },
  photoViewerDots: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  photoViewerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  photoViewerDotActive: { backgroundColor: '#94e336', width: 20 },
  photo: { width: 100, height: 130, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  photoMain: { width: 150, height: 190, borderRadius: 16, borderWidth: 2, borderColor: PRIMARY },
  tabsRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 4, backgroundColor: BG_LIGHT, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: 'rgba(125,197,46,0.15)' },
  tabBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  tabBtnTextActive: { color: PRIMARY },
  infoContainer: { padding: 20 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  name: { fontSize: 28, fontWeight: '800', color: '#fff' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  city: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  premiumBadge: { backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  premiumText: { fontSize: 13, color: '#F59E0B', fontWeight: '700' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
  statBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,170,255,0.1)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(0,170,255,0.2)' },
  statText: { fontSize: 13, color: ACCENT, fontWeight: '600' },
  gymRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, backgroundColor: 'rgba(125,197,46,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(125,197,46,0.2)' },
  gym: { fontSize: 15, color: PRIMARY, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  bio: { fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 24 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: 'rgba(125,197,46,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  tagText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  tagSchedule: { backgroundColor: 'rgba(0,170,255,0.1)', borderColor: 'rgba(0,170,255,0.3)' },
  tagScheduleText: { color: ACCENT },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 24, justifyContent: 'center' },
  editButtonText: { color: PRIMARY, fontSize: 16, fontWeight: '700' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,170,255,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  verifyBtnText: { color: '#00aaff', fontSize: 15, fontWeight: '600' },
  invisibleBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  invisibleBtnActive: { backgroundColor: 'rgba(148,227,54,0.1)', borderColor: 'rgba(148,227,54,0.4)' },
  invisibleBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
  invisibleBtnTextActive: { color: '#94e336' },
  invisibleLock: { fontSize: 13, marginLeft: 4 },
  premiumSectionDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 4 },
  accordionWrap: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  accordionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accordionTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  accordionBody: { paddingHorizontal: 16, paddingBottom: 16 },
  premiumSectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(245,158,11,0.2)' },
  premiumSectionLabel: { fontSize: 12, fontWeight: '800', color: '#F59E0B', letterSpacing: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,170,255,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  verifiedBadgeText: { color: '#00aaff', fontSize: 15, fontWeight: '600' },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  invisibleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,170,255,0.06)', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: 'rgba(0,170,255,0.2)' },
  invisibleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 10 },
  invisibleTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  invisibleTitleDisabled: { color: 'rgba(255,255,255,0.4)' },
  invisibleSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, maxWidth: 220 },
  statusBtnText: { color: PRIMARY, fontSize: 15, fontWeight: '600' },
  liveMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,170,255,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  liveMapBtnText: { color: '#00aaff', fontSize: 15, fontWeight: '600' },
  referralBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  referralBtnText: { color: '#F59E0B', fontSize: 15, fontWeight: '600' },
  achievementsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  achievementsBtnText: { color: PRIMARY, fontSize: 15, fontWeight: '600' },
  workoutsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,170,255,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  workoutsBtnText: { color: '#00aaff', fontSize: 15, fontWeight: '600' },
  premiumBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  premiumBtnText: { color: '#F59E0B', fontSize: 15, fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, justifyContent: 'center' },
  logoutBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,71,87,0.3)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 12, marginBottom: 32, justifyContent: 'center' },
  deleteBtnText: { color: '#ff4757', fontSize: 15, fontWeight: '600' },
  statsCards: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  streakCard: { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.25)' },
  streakTopRow: { marginBottom: 14 },
  streakLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakFire: { fontSize: 32 },
  streakNumber: { fontSize: 20, fontWeight: '800', color: '#fff' },
  streakLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  streakButtonsRow: { flexDirection: 'row', gap: 10 },
  streakBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  streakBtnFlex: { flex: 1.3 },
  streakBtnDone: { backgroundColor: 'rgba(148,227,54,0.15)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)' },
  streakBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  streakBtnTextDone: { color: '#94e336' },
  restDayBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10 },
  restDayBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  restDayHint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10, textAlign: 'center' },
  statCard: { flex: 1, borderRadius: 20, padding: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'transparent', overflow: 'hidden' },
  statCardNum: { fontSize: 30, fontWeight: '500', color: '#fff', lineHeight: 30 },
  statCardLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  statCardBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 12 },
  statCardBarFill: { height: 3, borderRadius: 2 },
  statCardBadge: { fontSize: 10, color: '#7dc52e', backgroundColor: 'rgba(125,197,46,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', alignSelf: 'flex-start', marginBottom: 10 },
  statCardIcon: { alignSelf: 'flex-end', marginBottom: 4 },
  emptyLiked: { alignItems: 'center', paddingTop: 40 },
  emptyLikedIcon: { fontSize: 56, marginBottom: 16 },
  emptyLikedIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,170,255,0.1)', borderWidth: 1.5, borderColor: 'rgba(0,170,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyLikedTitle: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  emptyLikedSub: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 8 },
  likedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  likedCard: { width: '47%', backgroundColor: BG_LIGHT, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  likedPhoto: { width: '100%', height: 160 },
  likedVerified: { position: 'absolute', top: 8, right: 8 },
  likedInfo: { padding: 10 },
  likedName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  likedCity: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  likedActions: { flexDirection: 'row', gap: 8, padding: 10, paddingTop: 0 },
  likedPassBtn: { flex: 1, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,71,87,0.1)', borderWidth: 1, borderColor: 'rgba(255,71,87,0.3)', alignItems: 'center', justifyContent: 'center' },
  likedLikeBtn: { flex: 1, height: 36, borderRadius: 18, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  editContainer: { padding: 20 },
  editTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  editHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  editMainPhotoPill: { position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(148,227,54,0.9)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  editMainPhotoPillText: { fontSize: 9, fontWeight: '800', color: BG },
  editLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.45)', marginBottom: 7, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#fff', backgroundColor: BG, width: '100%' },
  completeCard: { backgroundColor: 'rgba(148,227,54,0.08)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.3)', borderRadius: 14, padding: 12, marginTop: 10 },
  completeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 },
  completePct: { fontSize: 12.5, fontWeight: '800', color: '#b5e084' },
  completeMissing: { flex: 1, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', textAlign: 'right' },
  completeTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)' },
  completeFill: { height: 6, borderRadius: 3, backgroundColor: LIME },
  textarea: { height: 100, textAlignVertical: 'top', paddingTop: 12 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  photoWrapper: { position: 'relative', width: 90, height: 115 },
  photoThumb: { width: 90, height: 115, borderRadius: 10 },
  removeBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  movePhotoBtn: { position: 'absolute', bottom: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addPhotoBtn: { width: 90, height: 115, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(148,227,54,0.4)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(148,227,54,0.05)' },
  addPhotoLabel: { fontSize: 11, color: LIME, marginTop: 4, fontWeight: '600' },
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tagSelect: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: BG },
  tagSelectActive: { borderColor: 'rgba(148,227,54,0.5)' },
  tagSelectText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  tagSelectTextActive: { color: '#fff', fontWeight: '600' },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG, width: '100%' },
  selectorBtnText: { fontSize: 15, color: '#fff' },
  expStepperRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  expStepperBox: { flex: 1, backgroundColor: BG, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  expStepperLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 10, fontWeight: '600' },
  expStepperControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  expStepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(125,197,46,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  expStepperBtnText: { fontSize: 20, color: PRIMARY, fontWeight: '700', lineHeight: 24 },
  expStepperValue: { fontSize: 28, fontWeight: '800', color: '#fff', minWidth: 36, textAlign: 'center' },
  expBeginner: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 8 },
  cityRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 0 },
  cityInput: { flex: 1, marginBottom: 0 },
  cityGpsBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.3)', alignItems: 'center', justifyContent: 'center' },
  gymSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(125,197,46,0.1)', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  gymSearchBtnText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  gpsHintEdit: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 7, lineHeight: 15 },
  suggestions: { backgroundColor: BG_LIGHT, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 8, overflow: 'hidden' },
  suggestionItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  suggestionText: { fontSize: 14, color: '#fff' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 32 },
  cancelButton: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  cancelButtonText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: LIME, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  saveButtonText: { color: BG, fontSize: 16, fontWeight: '800' },
  buttonDisabled: { backgroundColor: '#444' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 20, paddingTop: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalSearch: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#fff', backgroundColor: BG, marginBottom: 12, marginHorizontal: 20 },
  countryModalContainer: { backgroundColor: '#0d1b2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },
  countryItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  countryItemActive: { backgroundColor: 'rgba(125,197,46,0.1)' },
  countryFlag: { fontSize: 26 },
  countryName: { flex: 1, fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  countryNameActive: { color: PRIMARY, fontWeight: '700' },
  ageModalContainer: { backgroundColor: '#0d1b2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  ageModalDoneBtn: { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  ageModalDone: { fontSize: 15, color: '#fff', fontWeight: '700' },
  ageScrollView: { maxHeight: 300 },
  ageOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  ageOptionActive: { backgroundColor: 'rgba(125,197,46,0.1)' },
  ageOptionText: { fontSize: 17, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  ageOptionTextActive: { color: PRIMARY, fontWeight: '700', fontSize: 18 },
})
