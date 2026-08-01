import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import GymRecordsEditor, { GymRecord, cleanRecords } from '../../components/GymRecordsEditor'
import GroupedChips, { GOAL_GROUPS, EXERCISE_GROUPS } from '../../components/GroupedChips'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ExpoLinking from 'expo-linking'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const STEPS = 11
const DRAFT_KEY = 'profile_draft'

const COUNTRY_FLAGS: Record<string, string> = {
  'PL': '🇵🇱', 'DE': '🇩🇪', 'GB': '🇬🇧', 'FR': '🇫🇷', 'ES': '🇪🇸',
  'NL': '🇳🇱', 'IT': '🇮🇹', 'PT': '🇵🇹', 'BE': '🇧🇪', 'AT': '🇦🇹',
  'CH': '🇨🇭', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮',
  'CZ': '🇨🇿', 'SK': '🇸🇰', 'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬',
  'HR': '🇭🇷', 'SI': '🇸🇮', 'RS': '🇷🇸', 'UA': '🇺🇦', 'GR': '🇬🇷',
  'TR': '🇹🇷', 'IE': '🇮🇪', 'IS': '🇮🇸', 'LU': '🇱🇺', 'EE': '🇪🇪',
  'LV': '🇱🇻', 'LT': '🇱🇹', 'US': '🇺🇸', 'CA': '🇨🇦', 'AU': '🇦🇺',
  'JP': '🇯🇵', 'BR': '🇧🇷', 'MX': '🇲🇽', 'ZA': '🇿🇦', 'IN': '🇮🇳',
}
const COUNTRY_CODES = ['PL','DE','GB','FR','ES','NL','IT','PT','BE','AT','CH','SE','NO','DK','FI','CZ','SK','HU','RO','BG','HR','SI','RS','UA','GR','TR','IE','IS','LU','EE','LV','LT','US','CA','AU','JP','BR','MX','ZA','IN']

// Mapowanie nazw z GPS na kody ISO
const GPS_TO_CODE: Record<string, string> = {
  'Poland': 'PL', 'Germany': 'DE', 'United Kingdom': 'GB', 'France': 'FR',
  'Spain': 'ES', 'Netherlands': 'NL', 'Italy': 'IT', 'Portugal': 'PT',
  'Belgium': 'BE', 'Austria': 'AT', 'Switzerland': 'CH', 'Sweden': 'SE',
  'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI', 'Czech Republic': 'CZ',
  'Slovakia': 'SK', 'Hungary': 'HU', 'Romania': 'RO', 'Bulgaria': 'BG',
  'Croatia': 'HR', 'Slovenia': 'SI', 'Serbia': 'RS', 'Ukraine': 'UA',
  'Greece': 'GR', 'Turkey': 'TR', 'Ireland': 'IE', 'Iceland': 'IS',
  'Luxembourg': 'LU', 'Estonia': 'EE', 'Latvia': 'LV', 'Lithuania': 'LT',
  'United States': 'US', 'Canada': 'CA', 'Australia': 'AU', 'Japan': 'JP',
  'Brazil': 'BR', 'Mexico': 'MX', 'South Africa': 'ZA', 'India': 'IN',
  'Polska': 'PL', 'Niemcy': 'DE', 'Francja': 'FR', 'Hiszpania': 'ES',
  'Holandia': 'NL', 'Nederland': 'NL',
}

const ALL_GOALS = ['strength','cardio','weight_loss','muscle_gain','flexibility','endurance','crossfit','running','swimming','cycling','martial_arts','bjj','mma','karate','judo','kickboxing','muay_thai','wrestling','climbing','hiit','powerlifting','calisthenics','padel','pickleball','pilates','yoga','tennis','boxing','functional_fitness','walking','hyrox','mobility','injury_recovery','competition_prep','general_health','stress_relief','longevity']
const ALL_SCHEDULES = ['morning','afternoon','evening','weekdays','weekends','lunch_break','late_night','flexible']
const ALL_EXERCISES = ['bench_press','squat','deadlift','pull_up','push_up','running','cycling','swimming','yoga','stretching','hiit','boxing','crossfit','olympic_lifting','kettlebell','rowing','hip_thrust','core_abs','sprints','mobility_drills']
const POLISH_CITIES = ['Warszawa','Krakow','Lodz','Wroclaw','Poznan','Gdansk','Szczecin','Bydgoszcz','Lublin','Katowice','Bialystok','Gdynia','Czestochowa','Radom','Sosnowiec','Torun','Kielce','Rzeszow','Gliwice','Zabrze','Bytom','Olsztyn','Bielsko-Biala','Zielona Gora','Rybnik']
const GYM_CHAINS = ['Calypso Fitness','FitFabric','Holmes Place','Zdrofit','Fabryka Formy','Gold Gym','McFIT','Fitness World','Gym One','Atletico','CityFit','Energyfit','CrossFit','Orange Fitness','Bodymax','Iron Gym','FitArena','Sport Club','Muscle Power']

export default function CreateProfileScreen() {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [bioGenerating, setBioGenerating] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [gymSearchLoading, setGymSearchLoading] = useState(false)
  const [showCountryModal, setShowCountryModal] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState(new Date(2000, 0, 1))
  // Data urodzenia: trzy pola DD/MM/RRRR (systemowy picker byl nieczytelny na ciemnym tle)
  const [bdDay, setBdDay] = useState('')
  const [bdMonth, setBdMonth] = useState('')
  const [bdYear, setBdYear] = useState('')
  const [dobFocus, setDobFocus] = useState('')
  const bdMonthRef = React.useRef<TextInput>(null)
  const bdYearRef = React.useRef<TextInput>(null)
  const [country, setCountry] = useState('')
  
  const [photos, setPhotos] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [gymName, setGymName] = useState('')
  const [city, setCity] = useState('')
  const [schedule, setSchedule] = useState<string[]>([])
  const [citySuggestions, setCitySuggestions] = useState<string[]>([])
  const [gymSuggestions, setGymSuggestions] = useState<string[]>([])

  const [lookingFor, setLookingFor] = useState('any')
  const [referralCode, setReferralCode] = useState('')
  const [gymRecords, setGymRecords] = useState<GymRecord[]>([])
  const [preferredLanguage, setPreferredLanguage] = useState(i18n.language || 'en')
  const [experienceYears, setExperienceYears] = useState(0)
  const [experienceMonths, setExperienceMonths] = useState(0)
  const [fitnessLevel, setFitnessLevel] = useState('')
  const [preferredExercises, setPreferredExercises] = useState<string[]>([])
  const [trainingFrequency, setTrainingFrequency] = useState('')
  const [trainingIntensity, setTrainingIntensity] = useState('')
  const [sessionLength, setSessionLength] = useState('')
  const [lookingForSpotter, setLookingForSpotter] = useState(false)

  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)

  const GENDER_OPTIONS = [
    { code: 'male', label: t('profile.male') },
    { code: 'female', label: t('profile.female') },
    { code: 'other', label: t('profile.other') },
  ]

  const LOOKING_FOR_OPTIONS = [
    { code: 'male', label: t('profile.male') },
    { code: 'female', label: t('profile.female') },
    { code: 'any', label: t('settings.everyone') },
  ]

  const PREFERRED_LANG_OPTIONS = [
    { code: 'pl', label: 'Polski' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'es', label: 'Español' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'bg', label: 'Български' },
    { code: 'ro', label: 'Română' },
    { code: 'tr', label: 'Türkçe' },
  ]

  const FITNESS_LEVELS = [
    { code: 'beginner', label: t('gym.beginner') },
    { code: 'intermediate', label: t('gym.intermediate') },
    { code: 'advanced', label: t('gym.advanced') },
    { code: 'pro', label: t('gym.pro') },
  ]

  const FREQUENCY_OPTIONS = [
    { code: '1-2', label: t('gym.freq1') },
    { code: '3-4', label: t('gym.freq2') },
    { code: '5+', label: t('gym.freq3') },
    { code: 'daily', label: t('gym.freq4') },
  ]

  const EXERCISE_LABELS: Record<string, string> = {
    bench_press: t('gym.bench_press'), squat: t('gym.squat'), deadlift: t('gym.deadlift'),
    pull_up: t('gym.pull_up'), push_up: t('gym.push_up'), running: t('gym.running'),
    cycling: t('gym.cycling'), swimming: t('gym.swimming'), yoga: t('gym.yoga'),
    stretching: t('gym.stretching'), hiit: t('gym.hiit'), boxing: t('gym.boxing'),
    crossfit: t('gym.crossfit'), olympic_lifting: t('gym.olympic_lifting'),
    kettlebell: t('gym.kettlebell'), rowing: t('gym.rowing'), hip_thrust: t('gym.hip_thrust'),
    core_abs: t('gym.core_abs'), sprints: t('gym.sprints'), mobility_drills: t('gym.mobility_drills'),
  }

  const INTENSITY_OPTIONS = [
    { code: 'chill', label: '😌 ' + (t('profile.intensity_chill') || 'Na luzie') },
    { code: 'solid', label: '💪 ' + (t('profile.intensity_solid') || 'Solidnie') },
    { code: 'beast', label: '🔥 ' + (t('profile.intensity_beast') || 'Beast mode') },
  ]

  const SESSION_OPTIONS = [
    { code: 'short', label: t('profile.session_short') || '30-45 min' },
    { code: 'medium', label: t('profile.session_medium') || '60-90 min' },
    { code: 'long', label: t('profile.session_long') || '2h+' },
  ]

  const filteredCountries = COUNTRY_CODES.filter(code =>
    t('countries.' + code).toLowerCase().includes(countrySearch.toLowerCase())
  )

  // Krok wymagany = nie mozna pominac; walidacja per krok
  // Sklada date urodzenia z trzech pol; error rozroznia niekompletna/bledna/za mlody
  function parseBirth(): { date: Date | null; error: 'incomplete' | 'invalid' | 'tooYoung' | null } {
    if (bdDay === '' || bdMonth === '' || bdYear.length < 4) return { date: null, error: 'incomplete' }
    const d = parseInt(bdDay), m = parseInt(bdMonth), y = parseInt(bdYear)
    const now = new Date()
    if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31 || y < now.getFullYear() - 100 || y > now.getFullYear()) {
      return { date: null, error: 'invalid' }
    }
    const date = new Date(y, m - 1, d)
    // np. 31 lutego przeskoczyloby na marzec — odrzucamy
    if (date.getDate() !== d || date.getMonth() !== m - 1) return { date: null, error: 'invalid' }
    if (calcAge(date) < 18) return { date: null, error: 'tooYoung' }
    return { date, error: null }
  }

  useEffect(() => {
    const { date } = parseBirth()
    if (date) setBirthDate(date)
  }, [bdDay, bdMonth, bdYear])

  function stepValid(): boolean {
    if (step === 1) return name.trim().length > 0
    if (step === 2) return gender.length > 0 && parseBirth().date !== null
    if (step === 4) return photos.length >= 2
    return true
  }

  function stepSkippable(): boolean {
    return ![1, 2, 4].includes(step)
  }

  function nextStep() {
    if (!stepValid()) return
    if (step < STEPS) setStep(step + 1)
    else handleSubmit()
  }

  function skipStep() {
    if (step < STEPS) setStep(step + 1)
    else handleSubmit()
  }

  // Wznowienie rejestracji: szkic w pamieci telefonu, przypisany do konta
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setAuthUserId(user?.id ?? null)
      // Sign in with Apple/Google przekazuje imie w metadanych konta — wypelniamy
      // je wstepnie, zeby nie prosic o dane juz podane przez dostawce logowania
      // (wymog Apple, Guideline 4). Szkic roboczy (ponizej) moze je nadpisac.
      const metaName = String(
        user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.user_metadata?.given_name ?? ''
      ).trim()
      if (metaName) setName(metaName.split(' ')[0])
      const raw = await AsyncStorage.getItem(DRAFT_KEY)
      if (raw) {
        try {
          const d = JSON.parse(raw)
          // Szkic innego konta (lub bez wlasciciela) - odrzuc,
          // zeby nowy uzytkownik nie widzial cudzych danych
          if (user?.id && d.userId !== user.id) {
            await AsyncStorage.removeItem(DRAFT_KEY)
            setDraftLoaded(true)
            return
          }
          if (d.name) setName(d.name)
          if (d.bio) setBio(d.bio)
          if (d.gender) setGender(d.gender)
          if (d.birthDate) {
            const bd = new Date(d.birthDate)
            setBirthDate(bd)
            setBdDay(String(bd.getDate()))
            setBdMonth(String(bd.getMonth() + 1))
            setBdYear(String(bd.getFullYear()))
          }
          if (d.country) setCountry(d.country)
          if (d.photos?.length) setPhotos(d.photos)
          if (d.goals?.length) setGoals(d.goals)
          if (d.gymName) setGymName(d.gymName)
          if (d.city) setCity(d.city)
          if (d.schedule?.length) setSchedule(d.schedule)
          if (d.lookingFor) setLookingFor(d.lookingFor)
          if (d.preferredLanguage) setPreferredLanguage(d.preferredLanguage)
          if (d.experienceYears) setExperienceYears(d.experienceYears)
          if (d.experienceMonths) setExperienceMonths(d.experienceMonths)
          if (d.fitnessLevel) setFitnessLevel(d.fitnessLevel)
          if (d.preferredExercises?.length) setPreferredExercises(d.preferredExercises)
          if (d.trainingFrequency) setTrainingFrequency(d.trainingFrequency)
          if (d.trainingIntensity) setTrainingIntensity(d.trainingIntensity)
          if (d.sessionLength) setSessionLength(d.sessionLength)
          if (d.lookingForSpotter) setLookingForSpotter(d.lookingForSpotter)
          if (d.referralCode) setReferralCode(d.referralCode)
          if (d.step) setStep(d.step)
        } catch (e) { }
      }
      setDraftLoaded(true)
    })()
  }, [])

  useEffect(() => {
    if (!draftLoaded) return
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({
      userId: authUserId,
      step, name, bio, gender, birthDate: birthDate.toISOString(), country, photos, goals,
      gymName, city, schedule, lookingFor, preferredLanguage, experienceYears, experienceMonths,
      fitnessLevel, preferredExercises, trainingFrequency, referralCode,
      trainingIntensity, sessionLength, lookingForSpotter,
    })).catch(() => { })
  }, [step, name, bio, gender, birthDate, country, photos, goals, gymName, city, schedule,
    lookingFor, preferredLanguage, experienceYears, experienceMonths, fitnessLevel,
    preferredExercises, trainingFrequency, referralCode, draftLoaded,
    trainingIntensity, sessionLength, lookingForSpotter])

  // Kod polecajacy z linku zaproszenia (fitnessswipe://... lub https://fitnessswipe.app?ref=KOD)
  const deepLinkUrl = ExpoLinking.useURL()
  useEffect(() => {
    if (!deepLinkUrl) return
    try {
      const parsed = ExpoLinking.parse(deepLinkUrl)
      const code = (parsed.queryParams?.ref ?? parsed.queryParams?.code) as string | undefined
      if (code && !referralCode) setReferralCode(String(code).toUpperCase())
    } catch (e) { }
  }, [deepLinkUrl])

  // Wybor zrodla: aparat lub galeria
  function pickPhoto() {
    Alert.alert(t('profile.addPhoto') || 'Zdjęcie', '', [
      { text: t('common.camera'), onPress: () => launchProfilePicker('camera') },
      { text: t('common.gallery'), onPress: () => launchProfilePicker('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  async function launchProfilePicker(source: 'camera' | 'gallery') {
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
    if (!result.canceled && result.assets[0]) setPhotos(prev => [...prev, result.assets[0].uri])
  }

  function removePhoto(index: number) { setPhotos(prev => prev.filter((_, i) => i !== index)) }
  function toggleGoal(goal: string) { setGoals(prev => prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]) }
  function toggleSchedule(s: string) { setSchedule(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]) }
  function toggleExercise(e: string) { setPreferredExercises(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]) }

  function calcAge(date: Date): number {
    const today = new Date()
    let age = today.getFullYear() - date.getFullYear()
    const m = today.getMonth() - date.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--
    return age
  }

  async function detectLocation() {
    setLocationLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { setLocationLoading(false); return }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setUserLat(loc.coords.latitude)
      setUserLng(loc.coords.longitude)
      const [address] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      if (address.city) setCity(address.city)
      Alert.alert('✅', t('ui.searchCity') + ': ' + (address.city ?? ''))
    } catch (e) {
      Alert.alert(t('common.error'), 'Nie udalo sie wykryc lokalizacji')
    } finally { setLocationLoading(false) }
  }

  async function searchGyms(cityName: string) {
    if (!userLat || !userLng) { Alert.alert(t('common.error'), t('profile.gymSearchNoLocation')); return }
    setGymSearchLoading(true)
    // Serwerowe wyszukiwanie z cache (Google Places -> Overpass -> Nominatim)
    const { fetchNearbyGyms } = await import('../../lib/supabase')
    const gyms = await fetchNearbyGyms(userLat, userLng)

    if (gyms.length > 0) setGymSuggestions(gyms)
    else Alert.alert(t('profile.gymSearchNone'), t('profile.gymSearchNoneSub'))
    setGymSearchLoading(false)
  }

  async function generateBio() {
    if (goals.length === 0) { Alert.alert(t('profile.goals')); return }
    setBioGenerating(true)
    try {
      const goalLabels = goals.map(g => t('goals.' + g)).join(', ')
      const lang = i18n.language || 'en'
      const langName = lang === 'pl' ? 'Polish' : lang === 'de' ? 'German' : lang === 'fr' ? 'French' : lang === 'es' ? 'Spanish' : lang === 'nl' ? 'Dutch' : 'English'
      const { data, error } = await supabase.functions.invoke('ai', {
        body: { action: 'generate-bio', name, goals: goalLabels, city, langName },
      })
      if (error) throw error
      const generated = data?.content
      if (generated) { setBio(generated.trim()); Alert.alert('✅', t('profile.bio') + ' ' + t('ui.generateBioBtn')) }
    } catch (e: any) { Alert.alert(t('common.error') + ': ' + e?.message) }
    finally { setBioGenerating(false) }
  }

  async function uploadPhotos(userId: string): Promise<string[]> {
    const urls: string[] = []
    for (let i = 0; i < photos.length; i++) {
      const uri = photos[i]
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${userId}/${Date.now()}_${i}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri, name: `photo_${i}.${ext}`, type: `image/${ext}` } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')
      let latitude = userLat
      let longitude = userLng
      if (!latitude || !longitude) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            latitude = loc.coords.latitude
            longitude = loc.coords.longitude
          }
        } catch (e) { console.log('Brak lokalizacji') }
      }
      const photoUrls = await uploadPhotos(user.id)
      const { error, data: newProfile } = await supabase.from('profiles').insert({
        user_id: user.id, name: name.trim(), bio: bio.trim(), goals, schedule,
        gym_name: gymName.trim(), city: city.trim(), photo_urls: photoUrls, lang: i18n.language || 'en',
        gender, age: calcAge(birthDate), birth_date: birthDate.toISOString().split('T')[0], country: country.trim(),
        looking_for: lookingFor, preferred_language: preferredLanguage, experience_years: experienceYears, experience_months: experienceMonths,
        fitness_level: fitnessLevel, preferred_exercises: preferredExercises,
        training_frequency: trainingFrequency, latitude, longitude,
        training_intensity: trainingIntensity, session_length: sessionLength,
        looking_for_spotter: lookingForSpotter,
        gym_records: cleanRecords(gymRecords),
      }).select('id').single()
      if (error) throw error

      if (referralCode.trim() && newProfile) {
        const { applyReferralCode } = await import('../../lib/supabase')
        await applyReferralCode(newProfile.id, referralCode.trim())
      }

      await AsyncStorage.removeItem(DRAFT_KEY)
      router.replace('/(tabs)/swipe')
    } catch (e: any) { Alert.alert(t('common.error') + ': ' + e?.message) }
    finally { setLoading(false) }
  }

  // Tytuly i podtytuly mikro-krokow
  const STEP_TITLES: Record<number, { title: string; sub?: string }> = {
    1: { title: t('profile.qName') || 'Jak masz na imię?' },
    2: { title: t('profile.qGender') || 'Kim jesteś?' },
    3: { title: t('profile.qCountry') || 'Skąd jesteś?', sub: t('profile.qCountrySub') || 'Pomożemy Ci znaleźć ludzi w okolicy' },
    4: { title: t('profile.qPhotos') || 'Pokaż się! 📸', sub: t('profile.qPhotosSub') || 'Dodaj przynajmniej 1 zdjęcie' },
    5: { title: t('profile.qGoals') || 'Jakie masz cele treningowe?', sub: t('profile.qGoalsSub') || 'Wybierz wszystkie, które pasują' },
    6: { title: t('profile.qLevel') || 'Na jakim jesteś poziomie?' },
    7: { title: t('profile.qRecords') || 'Twoje rekordy 🏆', sub: t('profile.qRecordsSub') || 'Opcjonalnie — pokażemy je na Twoim profilu' },
    8: { title: t('profile.qExercises') || 'Co i kiedy lubisz trenować?' },
    9: { title: t('profile.qLocation') || 'Gdzie trenujesz?' },
    10: { title: t('profile.qLooking') || 'Kogo szukasz?' },
    11: { title: t('profile.qBio') || 'Opowiedz coś o sobie', sub: t('profile.qBioSub') || 'Ostatni krok — możesz też pominąć' },
  }

  function renderStepContent() {
    if (step === 1) return (
      <TextInput
        style={styles.bigInput}
        placeholder={t('profile.namePlaceholder')}
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={30}
      />
    )

    if (step === 2) return (
      <>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map(g => (
            <TouchableOpacity key={g.code} style={[styles.genderTile, gender === g.code && styles.genderTileActive]} onPress={() => setGender(g.code)}>
              <Text style={{ fontSize: 26 }}>{g.code === 'male' ? '👨' : g.code === 'female' ? '👩' : '🧑'}</Text>
              <Text style={[styles.genderTileText, gender === g.code && styles.genderTileTextActive]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('profile.age')}</Text>
        <View style={styles.dobRow}>
          <View style={[styles.dobField, dobFocus === 'd' && styles.dobFieldFocused]}>
            <TextInput
              style={styles.dobInput}
              value={bdDay}
              onChangeText={txt => {
                const v = txt.replace(/\D/g, '').slice(0, 2)
                setBdDay(v)
                if (v.length === 2) bdMonthRef.current?.focus()
              }}
              onFocus={() => setDobFocus('d')}
              onBlur={() => setDobFocus('')}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="DD"
              placeholderTextColor="rgba(255,255,255,0.25)"
            />
            <Text style={styles.dobLabel}>{t('profile.dobDay')}</Text>
          </View>
          <View style={[styles.dobField, dobFocus === 'm' && styles.dobFieldFocused]}>
            <TextInput
              ref={bdMonthRef}
              style={styles.dobInput}
              value={bdMonth}
              onChangeText={txt => {
                const v = txt.replace(/\D/g, '').slice(0, 2)
                setBdMonth(v)
                if (v.length === 2) bdYearRef.current?.focus()
              }}
              onFocus={() => setDobFocus('m')}
              onBlur={() => setDobFocus('')}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="MM"
              placeholderTextColor="rgba(255,255,255,0.25)"
            />
            <Text style={styles.dobLabel}>{t('profile.dobMonth')}</Text>
          </View>
          <View style={[styles.dobField, styles.dobFieldYear, dobFocus === 'y' && styles.dobFieldFocused]}>
            <TextInput
              ref={bdYearRef}
              style={styles.dobInput}
              value={bdYear}
              onChangeText={txt => setBdYear(txt.replace(/\D/g, '').slice(0, 4))}
              onFocus={() => setDobFocus('y')}
              onBlur={() => setDobFocus('')}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="RRRR"
              placeholderTextColor="rgba(255,255,255,0.25)"
            />
            <Text style={styles.dobLabel}>{t('profile.dobYear')}</Text>
          </View>
        </View>
        {(() => {
          const { date, error } = parseBirth()
          if (date) return <Text style={styles.dobOk}>{calcAge(date)} {t('ui.years')} ✓</Text>
          if (error === 'invalid') return <Text style={styles.dobErr}>{t('profile.dobInvalid')}</Text>
          if (error === 'tooYoung') return <Text style={styles.dobErr}>{t('profile.dobTooYoung')}</Text>
          return null
        })()}
      </>
    )

    if (step === 3) return (
      <TouchableOpacity style={styles.pickerField} onPress={() => setShowCountryModal(true)}>
        <Text style={styles.pickerFieldText}>
          {country ? (COUNTRY_FLAGS[country] ?? '🌍') + '  ' + t('countries.' + country) : t('profile.countryPlaceholder')}
        </Text>
        <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
    )

    if (step === 4) return (
      <>
        <View style={styles.tipBanner}>
          <Text style={{ fontSize: 15 }}>💡</Text>
          <Text style={styles.tipBannerText}>{t('profile.photoTip') || 'Profile ze zdjęciem z siłowni dostają najwięcej matchy 💪'}</Text>
        </View>
        {photos.length < 2 && (
          <Text style={styles.minPhotosHint}>{t('profile.minPhotos')}</Text>
        )}
        <View style={styles.photosGrid}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photo} />
              {i === 0 && <View style={styles.mainPhotoPill}><Text style={styles.mainPhotoPillText}>{t('profile.mainPhoto') || 'Główne'}</Text></View>}
              <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(i)}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity style={styles.addPhoto} onPress={pickPhoto}>
              <Ionicons name="add" size={26} color={LIME} />
              <Text style={styles.addPhotoText}>{t('profile.addPhoto')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    )

    if (step === 5) return (
      <GroupedChips groups={GOAL_GROUPS} selected={goals} onToggle={toggleGoal} itemPrefix="goals." groupPrefix="goalGroups." />
    )

    if (step === 6) return (
      <>
        <View style={styles.chipsWrap}>
          {FITNESS_LEVELS.map(l => (
            <TouchableOpacity key={l.code} style={[styles.chip, fitnessLevel === l.code && styles.chipActive]} onPress={() => setFitnessLevel(l.code)}>
              <Text style={[styles.chipText, fitnessLevel === l.code && styles.chipTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('gym.experienceYears')}</Text>
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
        <Text style={styles.fieldLabel}>{t('gym.frequency')}</Text>
        <View style={styles.chipsWrap}>
          {FREQUENCY_OPTIONS.map(f => (
            <TouchableOpacity key={f.code} style={[styles.chip, trainingFrequency === f.code && styles.chipActive]} onPress={() => setTrainingFrequency(f.code)}>
              <Text style={[styles.chipText, trainingFrequency === f.code && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('profile.intensityLabel') || 'Intensywność treningu'}</Text>
        <View style={styles.chipsWrap}>
          {INTENSITY_OPTIONS.map(o => (
            <TouchableOpacity key={o.code} style={[styles.chip, trainingIntensity === o.code && styles.chipActive]} onPress={() => setTrainingIntensity(trainingIntensity === o.code ? '' : o.code)}>
              <Text style={[styles.chipText, trainingIntensity === o.code && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('profile.sessionLabel') || 'Długość sesji'}</Text>
        <View style={styles.chipsWrap}>
          {SESSION_OPTIONS.map(o => (
            <TouchableOpacity key={o.code} style={[styles.chip, sessionLength === o.code && styles.chipActive]} onPress={() => setSessionLength(sessionLength === o.code ? '' : o.code)}>
              <Text style={[styles.chipText, sessionLength === o.code && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    )

    // Krok 7: rekordy silowe (opcjonalne)
    if (step === 7) return (
      <GymRecordsEditor records={gymRecords} onChange={setGymRecords} />
    )

    if (step === 8) return (
      <>
        <GroupedChips groups={EXERCISE_GROUPS} selected={preferredExercises} onToggle={toggleExercise} itemPrefix="gym." groupPrefix="exGroups." />
        <Text style={styles.fieldLabel}>{t('profile.schedule')}</Text>
        <View style={styles.chipsWrap}>
          {ALL_SCHEDULES.map(s => (
            <TouchableOpacity key={s} style={[styles.chip, schedule.includes(s) && styles.chipActive]} onPress={() => toggleSchedule(s)}>
              <Text style={[styles.chipText, schedule.includes(s) && styles.chipTextActive]}>{t('schedule.' + s)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    )

    if (step === 9) return (
      <>
        {/* Miasto WYLACZNIE z GPS (jak w trybie podroznika) — bez recznego wpisywania,
            zeby lokalizacje w apce byly prawdziwe */}
        <Text style={styles.fieldLabel}>{t('profile.city')}</Text>
        <Text style={styles.gpsHint}>{t('traveler.gpsHint')}</Text>
        <TouchableOpacity style={styles.locationBtn} onPress={detectLocation} disabled={locationLoading}>
          {locationLoading ? <ActivityIndicator color={PRIMARY} size="small" /> : (
            <Ionicons name={city ? 'checkmark-circle' : 'locate-outline'} size={18} color={city ? LIME : PRIMARY} />
          )}
          <Text style={[styles.locationBtnText, !!city && { color: LIME }]}>
            {locationLoading ? t('common.loading') : (city || t('traveler.useLocation'))}
          </Text>
        </TouchableOpacity>
        <Text style={styles.fieldLabel}>{t('profile.gym')}</Text>
        <TouchableOpacity style={styles.locationBtn} onPress={() => searchGyms(city)} disabled={gymSearchLoading}>
          {gymSearchLoading ? <ActivityIndicator color={PRIMARY} size="small" /> : <Ionicons name="search" size={18} color={PRIMARY} />}
          <Text style={styles.locationBtnText}>{gymSearchLoading ? t('common.loading') : t('ui.findGyms') + ' ' + (city || t('ui.myCity'))}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={t('profile.gymSearch')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={gymName}
          onChangeText={(text) => {
            setGymName(text)
            if (text.length > 0) setGymSuggestions(GYM_CHAINS.filter(g => g.toLowerCase().includes(text.toLowerCase())).slice(0, 6))
            else setGymSuggestions([])
          }}
        />
        {gymSuggestions.length > 0 && (
          <View style={styles.suggestions}>
            {gymSuggestions.map((g, i) => (
              <TouchableOpacity key={i} style={styles.suggestionItem} onPress={() => { setGymName(g); setGymSuggestions([]) }}>
                <Text style={styles.suggestionText}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </>
    )

    if (step === 10) return (
      <>
        <View style={styles.chipsWrap}>
          {LOOKING_FOR_OPTIONS.map(o => (
            <TouchableOpacity key={o.code} style={[styles.chip, lookingFor === o.code && styles.chipActive]} onPress={() => setLookingFor(o.code)}>
              <Text style={[styles.chipText, lookingFor === o.code && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('profile.preferredLanguage') || 'Preferred communication language'}</Text>
        <View style={styles.chipsWrap}>
          {PREFERRED_LANG_OPTIONS.map(o => (
            <TouchableOpacity key={o.code} style={[styles.chip, preferredLanguage === o.code && styles.chipActive]} onPress={() => setPreferredLanguage(o.code)}>
              <Text style={[styles.chipText, preferredLanguage === o.code && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Asekuracja - unikalna opcja dla apki gym-partnerowej */}
        <TouchableOpacity style={[styles.spotterToggle, lookingForSpotter && styles.spotterToggleActive]} onPress={() => setLookingForSpotter(v => !v)}>
          <Text style={{ fontSize: 18 }}>🤝</Text>
          <Text style={[styles.spotterToggleText, lookingForSpotter && styles.spotterToggleTextActive]}>
            {t('profile.spotterToggle') || 'Szukam kogoś do asekuracji przy ciężarach'}
          </Text>
          <Ionicons name={lookingForSpotter ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={lookingForSpotter ? BG : 'rgba(255,255,255,0.35)'} />
        </TouchableOpacity>
      </>
    )

    // Krok 11: bio + AI + kod polecajacy
    return (
      <>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder={t('profile.bioPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
        />
        <TouchableOpacity style={styles.aiBioBtn} onPress={generateBio} disabled={bioGenerating}>
          {bioGenerating ? <ActivityIndicator color={BG} /> : (
            <>
              <Ionicons name="sparkles" size={16} color={BG} />
              <Text style={styles.aiBioBtnText}>{t('ui.generateBioBtn')}</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.aiHint}>{t('ui.generateBioHint') || 'Uses your selected goals above to write your bio'}</Text>

        <Text style={styles.fieldLabel}>{t('referral.haveCode') || 'Have a referral code? (optional)'}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('referral.codePlaceholder') || 'e.g. FIT-AB12CD'}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={referralCode}
          onChangeText={(v) => setReferralCode(v.toUpperCase())}
          autoCapitalize="characters"
        />
      </>
    )
  }

  const isLast = step === STEPS
  const valid = stepValid()

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Gorny pasek: wstecz + postep + licznik */}
      <View style={styles.topBar}>
        {step > 1 ? (
          <TouchableOpacity style={styles.topBackBtn} onPress={() => setStep(step - 1)}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / STEPS) * 100}%` }]} />
        </View>
        <Text style={styles.stepCounter}>{step}/{STEPS}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.qTitle}>{STEP_TITLES[step].title}</Text>
        {STEP_TITLES[step].sub ? <Text style={styles.qSub}>{STEP_TITLES[step].sub}</Text> : null}
        {renderStepContent()}

        {/* Przyciski w tresci - zawsze da sie do nich przewinac */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.nextBtn, (!valid || loading) && styles.nextBtnDisabled]}
            onPress={nextStep}
            disabled={!valid || loading}
          >
            {loading ? <ActivityIndicator color={BG} /> : (
              <Text style={styles.nextBtnText}>
                {isLast ? (t('profile.completeProfile')) : (t('common.next'))} {isLast ? '🎉' : '→'}
              </Text>
            )}
          </TouchableOpacity>
          {stepSkippable() && !loading && (
            <TouchableOpacity onPress={skipStep}>
              <Text style={styles.skipText}>{t('profile.skipStep') || 'Pomiń ten krok'}</Text>
            </TouchableOpacity>
          )}
          {/* Wyjscie awaryjne z kreatora (tylko pierwszy krok): wyloguj i wroc do logowania */}
          {step === 1 && !loading && (
            <TouchableOpacity
              style={{ alignItems: 'center', paddingVertical: 12 }}
              onPress={async () => {
                try { await supabase.auth.signOut() } catch (e) { }
                router.replace('/(auth)/login')
              }}
            >
              <Text style={styles.skipText}>← {t('gdpr.backToLogin')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Modal wyboru kraju */}
      <Modal visible={showCountryModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.country')}</Text>
              <TouchableOpacity onPress={() => { setShowCountryModal(false); setCountrySearch('') }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder={t('ui.searchCountry')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            <FlatList
              data={filteredCountries}
              keyExtractor={item => item}
              renderItem={({ item: code }) => (
                <TouchableOpacity
                  style={[styles.countryItem, country === code && styles.countryItemActive]}
                  onPress={() => { setCountry(code); setShowCountryModal(false); setCountrySearch('') }}
                >
                  <Text style={styles.countryFlag}>{COUNTRY_FLAGS[code]}</Text>
                  <Text style={[styles.countryName, country === code && styles.countryNameActive]}>{t('countries.' + code)}</Text>
                  {country === code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 },
  topBackBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: LIME },
  stepCounter: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', minWidth: 36, textAlign: 'right' },

  content: { flexGrow: 1, padding: 24, paddingTop: 20 },
  qTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 6 },
  qSub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 18, lineHeight: 20 },

  bigInput: { fontSize: 24, fontWeight: '700', color: '#fff', borderBottomWidth: 2, borderBottomColor: 'rgba(148,227,54,0.4)', paddingVertical: 10, marginTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 8, marginTop: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#fff', backgroundColor: BG_LIGHT },
  textarea: { height: 110, textAlignVertical: 'top', paddingTop: 12, marginTop: 12 },

  genderRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  genderTile: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 16, paddingVertical: 16, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  genderTileActive: { borderColor: LIME, backgroundColor: 'rgba(148,227,54,0.1)' },
  genderTileText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  genderTileTextActive: { color: LIME },

  pickerField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, backgroundColor: BG_LIGHT, marginTop: 12 },
  pickerFieldText: { fontSize: 16, color: '#fff' },

  tipBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(148,227,54,0.1)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.3)', borderRadius: 14, padding: 12, marginBottom: 16 },
  tipBannerText: { flex: 1, fontSize: 12, color: '#b5e084', lineHeight: 17 },
  minPhotosHint: { fontSize: 12, color: '#ffb340', fontWeight: '600', marginBottom: 10 },

  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoWrapper: { width: 100, height: 125, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: '100%' },
  mainPhotoPill: { position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(148,227,54,0.9)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  mainPhotoPillText: { fontSize: 9, fontWeight: '800', color: BG },
  removeBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 100, height: 125, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(148,227,54,0.4)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(148,227,54,0.05)' },
  addPhotoText: { fontSize: 11, color: LIME, marginTop: 4, fontWeight: '600' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: BG_LIGHT },
  chipActive: { borderColor: 'rgba(148,227,54,0.5)' },
  chipText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  expStepperRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  expStepperBox: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  expStepperLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 10, fontWeight: '600' },
  expStepperControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  expStepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(125,197,46,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  expStepperBtnText: { fontSize: 20, color: PRIMARY, fontWeight: '700', lineHeight: 24 },
  expStepperValue: { fontSize: 28, fontWeight: '800', color: '#fff', minWidth: 36, textAlign: 'center' },

  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(125,197,46,0.1)', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', marginTop: 12 },
  locationBtnText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
  gpsHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 8, lineHeight: 16 },
  suggestions: { backgroundColor: BG_LIGHT, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginTop: 4, overflow: 'hidden' },
  suggestionItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  suggestionText: { fontSize: 14, color: '#fff' },

  aiBioBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 14, paddingVertical: 13, marginTop: 10 },
  aiBioBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  aiHint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 8 },

  bottomBar: { paddingTop: 28, gap: 10, alignItems: 'center', marginTop: 'auto' },
  dobRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dobField: { flex: 1, backgroundColor: BG_LIGHT, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, alignItems: 'center', paddingVertical: 10 },
  dobFieldYear: { flex: 1.4 },
  dobFieldFocused: { borderColor: LIME },
  dobInput: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', width: '100%', padding: 0 },
  dobLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginTop: 3, textTransform: 'uppercase' },
  dobOk: { fontSize: 13, fontWeight: '700', color: LIME, textAlign: 'center', marginTop: 10 },
  dobErr: { fontSize: 13, fontWeight: '600', color: '#ff6b78', textAlign: 'center', marginTop: 10 },
  nextBtn: { backgroundColor: LIME, borderRadius: 16, paddingVertical: 16, alignItems: 'center', width: '100%' },
  nextBtnDisabled: { opacity: 0.35 },
  nextBtnText: { color: BG, fontSize: 16, fontWeight: '800' },
  skipText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600', paddingVertical: 4 },
  spotterToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderRadius: 14, padding: 14, marginTop: 20, borderWidth: 2, borderColor: 'transparent' },
  spotterToggleActive: { backgroundColor: LIME, borderColor: LIME },
  spotterToggleText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff' },
  spotterToggleTextActive: { color: BG },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalSearch: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#fff', backgroundColor: BG, marginBottom: 12 },
  countryItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  countryItemActive: { backgroundColor: 'rgba(125,197,46,0.1)' },
  countryFlag: { fontSize: 28 },
  countryName: { flex: 1, fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  countryNameActive: { color: PRIMARY, fontWeight: '700' },
})
