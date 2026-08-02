import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Modal, Image, ImageBackground, Dimensions, KeyboardAvoidingView, Platform, PanResponder, Pressable } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { File } from 'expo-file-system'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { supabase, getMyProfile } from '../lib/supabase'
import { StickerContent, FilterLayer, STATUS_FILTERS, STATUS_EFFECTS, FILTER_SWATCHES, ACTIVITY_SPORTS, activityChips, OverlayPillsView } from '../components/statusMedia'
import ViewShot from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import * as LegacyFS from 'expo-file-system/legacy'
import StoryViewer from '../components/StoryViewer'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const { width: SCREEN_W } = Dimensions.get('window')

// Limity relacji wideo: krotkie jak stories + twardy sufit rozmiaru (koszty transferu Supabase)
const MAX_VIDEO_SECONDS = 16
const MAX_VIDEO_BYTES = 20 * 1024 * 1024

const STATUS_PRESET_ICONS = [
  'flame-outline', 'body-outline', 'pulse-outline', 'flash-outline', 'hand-right-outline', 'bicycle-outline'
]

// activity: naklejka statystyk treningu (sport, m/mu = duza wartosc+jednostka, tm czas, ex tempo/kcal);
// id + chip = pojedynczy zeton po rozsypaniu (kazdy przeciagany osobno)
type Overlay = { type: 'time' | 'gym' | 'place' | 'text' | 'day' | 'pr' | 'activity'; x: number; y: number; v?: number; text?: string; s?: number; sport?: string; m?: string; mu?: string; tm?: string; ex?: string; id?: string; chip?: number }

// Przeciagalna naklejka (styl IG): pozycja znormalizowana 0..1 wzgledem obszaru medium.
// Przeciaganie = zmiana pozycji, tapniecie = zmiana stylu (3 warianty), ✕ = usuniecie,
// pinch dwoma palcami = zmiana rozmiaru (0.5x-3x, zapisywana w naklejce).
function StickerPill({ ov, time, gym, area, onChange, onCycle, onRemove, onScale }: {
  ov: Overlay
  time: string | null
  gym: string | null
  area: { w: number; h: number }
  onChange: (x: number, y: number) => void
  onCycle: () => void
  onRemove: () => void
  onScale: (s: number) => void
}) {
  // (tekst wlasnej lokalizacji jedzie w ov.text)
  const ovRef = useRef(ov)
  ovRef.current = ov
  const areaRef = useRef(area)
  areaRef.current = area
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onCycleRef = useRef(onCycle)
  onCycleRef.current = onCycle
  const onScaleRef = useRef(onScale)
  onScaleRef.current = onScale
  const startRef = useRef({ x: 0, y: 0 })
  const pinchStartDist = useRef<number | null>(null)
  const pinchStartScale = useRef(1)
  const didPinch = useRef(false)

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, g) => evt.nativeEvent.touches.length === 2 || Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        startRef.current = { x: ovRef.current.x, y: ovRef.current.y }
        pinchStartDist.current = null
        didPinch.current = false
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches
        // Dwa palce = pinch: skala wzgledem poczatkowego rozstawu palcow
        if (touches.length === 2) {
          const dx = touches[0].pageX - touches[1].pageX
          const dy = touches[0].pageY - touches[1].pageY
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (pinchStartDist.current == null) {
            pinchStartDist.current = dist
            pinchStartScale.current = ovRef.current.s ?? 1
            didPinch.current = true
            return
          }
          const scale = Math.min(3, Math.max(0.5, pinchStartScale.current * dist / pinchStartDist.current))
          onScaleRef.current(Math.round(scale * 100) / 100)
          return
        }
        // Po pinchu nie wracamy do przeciagania w tym samym gescie (naklejka by "skakala")
        if (didPinch.current) return
        const a = areaRef.current
        if (!a.w || !a.h) return
        const x = Math.min(Math.max(startRef.current.x + g.dx / a.w, 0.02), 0.78)
        const y = Math.min(Math.max(startRef.current.y + g.dy / a.h, 0.05), 0.85)
        onChangeRef.current(x, y)
      },
      onPanResponderRelease: (_, g) => {
        // Tapniecie (bez ruchu i bez pincha) = przelacz styl naklejki
        if (!didPinch.current && Math.abs(g.dx) < 5 && Math.abs(g.dy) < 5) onCycleRef.current()
        pinchStartDist.current = null
        didPinch.current = false
      },
      onPanResponderTerminate: () => {
        pinchStartDist.current = null
        didPinch.current = false
      },
    })
  ).current

  return (
    <View
      {...responder.panHandlers}
      style={[stickerStyles.anchor, { left: `${ov.x * 100}%`, top: `${ov.y * 100}%` }]}
    >
      <View style={{ transform: [{ scale: ov.s ?? 1 }] }}>
        <StickerContent
          type={ov.type} variant={ov.v} time={time} gym={gym} text={ov.text}
          act={ov.type === 'activity' && ov.sport && ov.m && ov.mu ? { sport: ov.sport, m: ov.m, mu: ov.mu, tm: ov.tm, ex: ov.ex } : null}
          sportLabel={ov.text ?? undefined}
          chipIndex={ov.chip}
        />
      </View>
      <TouchableOpacity style={stickerStyles.removeBtn} onPress={onRemove} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={stickerStyles.removeTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

const stickerStyles = StyleSheet.create({
  anchor: { position: 'absolute', zIndex: 5, maxWidth: '76%' },
  removeBtn: { position: 'absolute', top: -9, right: -9, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  removeTxt: { fontSize: 10, color: '#fff', fontWeight: '700' },
})

function pad(n: number) { return String(n).padStart(2, '0') }
function nowHHMM(offsetHours = 0) {
  const d = new Date(Date.now() + offsetHours * 3600000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TrainingStatusScreen() {
  const { t, i18n } = useTranslation()
  const i18nLang = i18n.language ?? 'en'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Wiele relacji naraz (max 3): overview = lista aktywnych, editor = tworzenie NOWEJ.
  // Opublikowanej relacji nie da sie edytowac — tylko usunac albo udostepnic dalej.
  const MAX_STORIES = 3
  const [myStories, setMyStories] = useState<any[]>([])
  const [mode, setMode] = useState<'overview' | 'editor'>('editor')
  const [shareTarget, setShareTarget] = useState<any>(null)
  const [sharingStory, setSharingStory] = useState(false)
  const shareShotRef = useRef<any>(null)
  // Podglad wlasnej relacji (ta sama przegladarka co u ogladajacych)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [myProfileObj, setMyProfileObj] = useState<any>(null)
  const [statusText, setStatusText] = useState('')
  const [trainingTime, setTrainingTime] = useState('')
  const [gymName, setGymName] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [timeHour, setTimeHour] = useState(18)
  const [timeMinute, setTimeMinute] = useState(0)
  const [statusPhoto, setStatusPhoto] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  // Naklejki na relacji (przeciagalne pigulki: godzina / silownia) + filtr kolorystyczny
  const [overlays, setOverlays] = useState<Overlay[]>([])
  const [mediaArea, setMediaArea] = useState({ w: 0, h: 0 })
  const [filterId, setFilterId] = useState('')
  // Efekty (winieta/ramki) — mozna laczyc z filtrem; w bazie jada razem w kolumnie filter ("warm|vignette")
  const [effects, setEffects] = useState<string[]>([])
  const filterValue = [filterId, ...effects].filter(Boolean).join('|')
  // Kolumna narzedzi po prawej (jak IG): zwiniete ikony, tap rozwija panel obok
  const [toolOpen, setToolOpen] = useState<'filters' | 'effects' | 'stickers' | 'time' | 'presets' | 'activity' | null>(null)
  // Naklejka aktywnosci: wybrany sport otwiera formularz (prefill z Apple Health / Health Connect)
  const [actSport, setActSport] = useState<string | null>(null)
  const [actDist, setActDist] = useState('')
  const [actMins, setActMins] = useState('')
  const [actKcal, setActKcal] = useState('')
  // Modale naklejek z wlasnym tekstem (dowolny tekst / rekord PR)
  const [showTextModal, setShowTextModal] = useState(false)
  const [textStickerInput, setTextStickerInput] = useState('')
  const [showPrModal, setShowPrModal] = useState(false)
  const [prInput, setPrInput] = useState('')
  const [showPlaceModal, setShowPlaceModal] = useState(false)
  const [placeInput, setPlaceInput] = useState('')
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([])
  const [placeLoading, setPlaceLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Podglad wideo w tle ekranu: wyciszony, zapetlony (jak podglad relacji przed publikacja)
  const bgPlayer = useVideoPlayer(videoUrl, p => { p.loop = true; p.muted = true; if (videoUrl) p.play() })
  const [videoPaused, setVideoPaused] = useState(false)
  function toggleVideoPlay() {
    if (videoPaused) bgPlayer.play()
    else bgPlayer.pause()
    setVideoPaused(p => !p)
  }
  const [isLive, setIsLive] = useState(false)
  const [togglingLive, setTogglingLive] = useState(false)
  const [lookingForPartner, setLookingForPartner] = useState(false)
  const [notifyMatches, setNotifyMatches] = useState(true)
  const [showGymSearch, setShowGymSearch] = useState(false)
  const [gymQuery, setGymQuery] = useState('')
  const [gymResults, setGymResults] = useState<string[]>([])
  const [gymSearchLoading, setGymSearchLoading] = useState(false)
  const [reactions, setReactions] = useState<Record<string, number>>({})
  const [myId, setMyId] = useState<string | null>(null)
  const [showViewers, setShowViewers] = useState(false)
  const [viewers, setViewers] = useState<any[]>([])
  const [viewersLoading, setViewersLoading] = useState(false)

  useEffect(() => { loadStatus() }, [])

  // Lista widzow relacji (jak na Instagramie) — otwierana tapnieciem licznika
  async function openViewers() {
    if (!myId) return
    setShowViewers(true)
    setViewersLoading(true)
    try {
      const { getStatusViewers } = await import('../lib/supabase')
      setViewers(await getStatusViewers(myId))
    } catch (e) { }
    finally { setViewersLoading(false) }
  }

  function viewedAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${Math.max(mins, 1)} min`
    return `${Math.floor(mins / 60)} h`
  }

  async function loadStatus() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setMyId(me.id)
      setMyProfileObj(me)
      // Wszystkie aktywne relacje (najstarsza pierwsza) — opublikowanych nie edytujemy,
      // wiec NIC nie laduje sie do edytora; sa tylko na liscie w trybie przegladu
      const { data } = await supabase
        .from('training_status')
        .select('*')
        .eq('profile_id', me.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
      const stories = data ?? []
      setMyStories(stories)
      setIsLive(stories.some((s: any) => s.is_live))
      setMode(stories.length > 0 ? 'overview' : 'editor')
      // Reakcje na moje relacje (licznik wspolny dla calego zestawu)
      const { data: rx } = await supabase
        .from('status_reactions')
        .select('emoji')
        .eq('status_profile_id', me.id)
      const counts: Record<string, number> = {}
      ;(rx ?? []).forEach((r: any) => { counts[r.emoji] = (counts[r.emoji] ?? 0) + 1 })
      setReactions(counts)
    } catch (e) { }
    finally { setLoading(false) }
  }

  // Czysty edytor na NOWA relacje (nigdy nie wypelniamy go opublikowana)
  function startNewStory() {
    if (myStories.length >= MAX_STORIES) {
      Alert.alert('📚', t('trainingStatus.storiesLimit', { max: MAX_STORIES }))
      return
    }
    setStatusText('')
    setTrainingTime('')
    setGymName('')
    setStatusPhoto(null)
    setVideoUrl(null)
    setOverlays([])
    setFilterId('')
    setEffects([])
    setLookingForPartner(false)
    setSelectedPreset(null)
    setMode('editor')
  }

  function storyTimeLeft(story: any): string {
    const diff = new Date(story.expires_at).getTime() - Date.now()
    if (diff <= 0) return '0h 0min'
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}min`
  }

  function incHour() { setTimeHour(h => (h + 1) % 24) }
  function decHour() { setTimeHour(h => (h - 1 + 24) % 24) }
  function incMinute() { setTimeMinute(m => (m + 5) % 60) }
  function decMinute() { setTimeMinute(m => (m - 5 + 60) % 60) }

  // Napis daty: dzien tygodnia w jezyku apki + DD.MM (tekst zapisany w naklejce w momencie dodania)
  function dayLabel() {
    const d = new Date()
    let wd = ''
    try { wd = d.toLocaleDateString(i18nLang, { weekday: 'long' }) } catch (e) { }
    const dm = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
    return wd ? `${wd.toUpperCase()} ${dm}` : dm
  }

  // Naklejki: dodanie/zdjecie pigulki danego typu i zmiana pozycji przy przeciaganiu.
  // place/text/pr pytaja o tresc w modalu, day dostaje date od razu
  function toggleOverlay(type: Overlay['type']) {
    const exists = overlays.some(o => o.type === type)
    if (!exists) {
      if (type === 'place') {
        // Wlasna lokalizacja: wpisanie nazwy albo wybor z miejsc w poblizu
        setPlaceInput('')
        setShowPlaceModal(true)
        if (placeSuggestions.length === 0 && !placeLoading) searchPlacesNearby()
        return
      }
      if (type === 'text') { setTextStickerInput(''); setShowTextModal(true); return }
      if (type === 'pr') { setPrInput(''); setShowPrModal(true); return }
      if (type === 'day') {
        setOverlays(prev => [...prev, { type: 'day' as const, text: dayLabel(), x: 0.24, y: 0.12, v: 1 }])
        return
      }
    }
    setOverlays(prev => exists
      ? prev.filter(o => o.type !== type)
      : [...prev, { type, x: 0.3, y: type === 'time' ? 0.18 : 0.3, v: 0 }])
  }
  function addPlaceOverlay(name?: string) {
    const text = (name ?? placeInput).trim()
    if (!text) return
    setOverlays(prev => [...prev.filter(o => o.type !== 'place'), { type: 'place' as const, text, x: 0.3, y: 0.45, v: 0 }])
    setShowPlaceModal(false)
  }
  function addTextOverlay() {
    const text = textStickerInput.trim()
    if (!text) return
    setOverlays(prev => [...prev.filter(o => o.type !== 'text'), { type: 'text' as const, text, x: 0.22, y: 0.5, v: 1 }])
    setShowTextModal(false)
  }
  function addPrOverlay() {
    const text = prInput.trim()
    if (!text) return
    setOverlays(prev => [...prev.filter(o => o.type !== 'pr'), { type: 'pr' as const, text, x: 0.24, y: 0.6, v: 0 }])
    setShowPrModal(false)
  }

  // Naklejka aktywnosci: wybor sportu -> formularz z prefillowaniem z dzisiejszego
  // treningu (Apple Health / Health Connect); wartosci zawsze da sie nadpisac recznie
  function openActivityForm(sport: string) {
    setToolOpen(null)
    setActSport(sport)
    setActDist('')
    setActMins('')
    setActKcal('')
    import('../lib/health')
      .then(async h => {
        const w = await h.getTodayWorkout()
        if (!w) return
        setActMins(m => m || String(w.durationMin))
        if (w.distanceKm) setActDist(d => d || String(w.distanceKm))
      })
      .catch(() => { })
  }

  // Wspolny builder danych naklejki: uzywa go i podglad na zywo w modalu,
  // i faktyczne naklejenie — podglad zawsze pokazuje dokladnie to, co wyladuje
  function buildActivityData(sport: string, distStr: string, minsStr: string, kcalStr: string): { m: string; mu: string; tm?: string; ex?: string } {
    const dist = parseFloat(distStr.replace(',', '.'))
    const mins = parseInt(minsStr, 10)
    const kcal = parseInt(kcalStr, 10)
    const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
    const tmStr = mins > 0 ? (mins >= 60 ? `${Math.floor(mins / 60)}h ${pad(mins % 60)}m` : `${mins} min`) : undefined

    if (sport === 'gym') {
      return { m: mins > 0 ? String(mins) : '0', mu: 'MIN', ex: kcal > 0 ? `${kcal} kcal` : undefined }
    }
    let ex: string | undefined
    if (dist > 0 && mins > 0) {
      if (sport === 'ride') {
        ex = `${fmt1(dist / (mins / 60))} km/h`
      } else {
        const p = mins / dist
        ex = `${Math.floor(p)}:${pad(Math.round((p - Math.floor(p)) * 60))} /km`
      }
    }
    return { m: dist > 0 ? fmt1(dist) : '0', mu: 'KM', tm: tmStr, ex }
  }

  function activityFormValid(): boolean {
    if (!actSport) return false
    return actSport === 'gym'
      ? parseInt(actMins, 10) > 0
      : parseFloat(actDist.replace(',', '.')) > 0
  }

  function addActivityOverlay() {
    if (!actSport || !activityFormValid()) return
    const data = buildActivityData(actSport, actDist, actMins, actKcal)
    setOverlays(prev => [...prev.filter(o => o.type !== 'activity'), {
      type: 'activity' as const, sport: actSport, ...data,
      text: t('activity.' + actSport), x: 0.16, y: 0.3, v: 0,
    }])
    setActSport(null)
  }

  // Sugerowane miejsca w poblizu: nasza edge function z cache (odporna na
  // przeciazenia publicznych serwerow Overpass — raz znalezione miejsca dla
  // okolicy dzialaja dla wszystkich przez 7 dni)
  async function searchPlacesNearby() {
    setPlaceLoading(true)
    try {
      let lat: number | null = null
      let lng: number | null = null
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        lat = loc.coords.latitude
        lng = loc.coords.longitude
      }
      if (lat == null || lng == null) { setPlaceSuggestions([]); return }

      const { data, error } = await supabase.functions.invoke('nearby-places', { body: { lat, lng, lang: i18nLang } })
      if (error) { setPlaceSuggestions([]); return }
      setPlaceSuggestions(Array.isArray(data?.places) ? data.places : [])
    } catch (e) { setPlaceSuggestions([]) }
    finally { setPlaceLoading(false) }
  }
  // Dodaje naklejke danego typu, jesli jest medium i jeszcze jej nie ma
  // (wybor godziny/silowni od razu wrzuca odpowiednia naklejke na relacje)
  function ensureOverlay(type: 'time' | 'gym') {
    if (!statusPhoto && !videoUrl) return
    setOverlays(prev => prev.some(o => o.type === type)
      ? prev
      : [...prev, { type, x: 0.3, y: type === 'time' ? 0.18 : 0.3, v: 0 }])
  }
  function applyQuickTime(value: string) {
    setTrainingTime(value)
    ensureOverlay('time')
    setToolOpen(null)
  }
  // Tozsamosc naklejki: typ, a przy rozsypanych zetonach aktywnosci — unikalne id
  const ovKey = (o: Overlay) => o.id ?? o.type

  function moveOverlay(ov: Overlay, x: number, y: number) {
    setOverlays(prev => prev.map(o => (ovKey(o) === ovKey(ov) ? { ...o, x, y } : o)))
  }
  function removeOverlay(ov: Overlay) {
    // Usuniecie jednego zetonu aktywnosci zdejmuje cala naklejke (pol statystyk nie ma sensu)
    if (ov.type === 'activity') { setOverlays(prev => prev.filter(o => o.type !== 'activity')); return }
    toggleOverlay(ov.type)
  }
  function cycleOverlay(ov: Overlay) {
    if (ov.type === 'activity') {
      const act = ov.sport && ov.m && ov.mu ? { sport: ov.sport, m: ov.m, mu: ov.mu, tm: ov.tm, ex: ov.ex } : null
      if (!act) return
      if (ov.chip == null) {
        // Duzy napis -> rozsyp na osobne, niezaleznie przeciagane zetony
        const chips = activityChips(act)
        const spread = chips.map((_, i) => ({
          ...ov,
          id: 'act' + i,
          chip: i,
          x: Math.min(0.78, Math.max(0.02, ov.x + i * 0.19)),
          y: Math.min(0.85, Math.max(0.05, ov.y + (i % 2 === 1 ? 0.06 : 0))),
          v: 1,
        }))
        setOverlays(prev => [...prev.filter(o => o.type !== 'activity'), ...spread])
      } else {
        // Tapniety zeton skleja calosc z powrotem w duzy napis (w miejscu zetonu)
        setOverlays(prev => [...prev.filter(o => o.type !== 'activity'), {
          ...ov, id: undefined, chip: undefined, v: 0,
          x: Math.min(0.6, ov.x), y: ov.y,
        }])
      }
      return
    }
    setOverlays(prev => prev.map(o => (ovKey(o) === ovKey(ov) ? { ...o, v: ((o.v ?? 0) + 1) % 3 } : o)))
  }
  function scaleOverlay(ov: Overlay, s: number) {
    setOverlays(prev => prev.map(o => (ovKey(o) === ovKey(ov) ? { ...o, s } : o)))
  }

  // Plaska lista opcji — nagrywanie filmu jest bezposrednio pod reka
  // (wczesniej zakopane dwa poziomy w menu: Aparat -> Film -> Aparat)
  function pickPhoto() {
    Alert.alert(t('trainingStatus.addMedia'), '', [
      { text: '📷 ' + t('trainingStatus.takePhoto'), onPress: () => takeStatusPhoto() },
      { text: '🎥 ' + t('trainingStatus.recordVideo'), onPress: () => recordStatusVideo() },
      { text: '🖼 ' + t('trainingStatus.fromGallery'), onPress: () => pickFromGallery() },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  async function uploadPhotoAsset(uri: string) {
    setUploadingPhoto(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${user.id}/status_${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri, name: `status.${ext}`, type: `image/${ext}` } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
      if (error) { Alert.alert(t('trainingStatus.uploadError'), error.message); return }
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      setStatusPhoto(data.publicUrl)
      setVideoUrl(null) // wzajemnie wykluczne ze zdjeciem
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setUploadingPhoto(false) }
  }

  // Limit dlugosci wymuszony na kamerze (videoMaxDuration), przy galerii
  // walidowany po fakcie. Bez transkodowania — limity trzymaja koszty transferu.
  async function uploadVideoAsset(asset: ImagePicker.ImagePickerAsset) {
    const durationSec = (asset.duration ?? 0) / 1000
    if (durationSec > MAX_VIDEO_SECONDS) {
      Alert.alert(t('trainingStatus.videoTooLong'), t('trainingStatus.videoTooLongMsg'))
      return
    }
    setUploadingPhoto(true)
    try {
      const file = new File(asset.uri)
      if (file.exists && file.size > MAX_VIDEO_BYTES) {
        Alert.alert(t('trainingStatus.videoTooBig'), t('trainingStatus.videoTooBigMsg'))
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'mp4'
      const path = `${user.id}/status_video_${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri: asset.uri, name: `status.${ext}`, type: `video/${ext}` } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `video/${ext}`, upsert: true })
      if (error) { Alert.alert(t('trainingStatus.uploadError'), error.message); return }
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      setVideoUrl(data.publicUrl)
      setStatusPhoto(null) // wzajemnie wykluczne z wideo
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setUploadingPhoto(false) }
  }

  async function takeStatusPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert(t('trainingStatus.noPermission')); return }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 })
    if (!result.canceled && result.assets[0]) await uploadPhotoAsset(result.assets[0].uri)
  }

  async function recordStatusVideo() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert(t('trainingStatus.noPermission')); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 15, quality: 0.5 } as any)
    if (!result.canceled && result.assets[0]) await uploadVideoAsset(result.assets[0])
  }

  // Galeria przyjmuje i zdjecia, i filmy — typ rozpoznajemy po assecie
  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert(t('trainingStatus.noPermission')); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.7 })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (asset.type === 'video') await uploadVideoAsset(asset)
    else await uploadPhotoAsset(asset.uri)
  }

  // Wyszukiwarka silowni w poblizu (Overpass/OSM) - dziala wszedzie, takze w podrozy
  async function searchGymsNearby() {
    setGymSearchLoading(true)
    try {
      let lat: number | null = null
      let lng: number | null = null
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        lat = loc.coords.latitude
        lng = loc.coords.longitude
      }
      if (lat == null || lng == null) { setGymResults([]); return }

      // Serwerowe wyszukiwanie z cache (Google Places -> Overpass -> Nominatim)
      const { fetchNearbyGyms } = await import('../lib/supabase')
      setGymResults(await fetchNearbyGyms(lat, lng, i18nLang))
    } catch (e) { setGymResults([]) }
    finally { setGymSearchLoading(false) }
  }

  function openGymSearch() {
    setShowGymSearch(true)
    if (gymResults.length === 0 && !gymSearchLoading) searchGymsNearby()
  }

  // Push do wszystkich matchy: "X jest teraz na silowni!"
  async function notifyMyMatches(me: any) {
    try {
      const { data: matchData } = await supabase
        .from('matches')
        .select('profile_a_id, profile_b_id')
        .or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`)
        .not('is_trainer_chat', 'is', true)
      if (!matchData || matchData.length === 0) return
      const { notifyProfile } = await import('../lib/notifications')
      for (const m of matchData) {
        const otherId = m.profile_a_id === me.id ? m.profile_b_id : m.profile_a_id
        notifyProfile(otherId, '💪 ' + me.name, t('trainingStatus.liveNotifyBody') || 'jest teraz na siłowni!', { type: 'live' })
      }
    } catch (e) { console.log('notifyMyMatches error:', e) }
  }

  async function handleToggleLive() {
    setTogglingLive(true)
    try {
      const me = await getMyProfile()
      if (!me) return

      if (isLive) {
        await supabase.from('training_status').update({ is_live: false }).eq('profile_id', me.id)
        setIsLive(false)
        await loadStatus()
        Alert.alert('👋', t('trainingStatus.sessionEnded') || 'Training session ended')
      } else {
        let gymLat: number | null = null
        let gymLng: number | null = null
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            gymLat = loc.coords.latitude
            gymLng = loc.coords.longitude
          }
        } catch (e) { }

        // Bezpieczenstwo: automatyczne wylaczenie po 4h na wypadek zapomnienia
        const expires_at = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

        // Live doczepiamy do najnowszej aktywnej relacji; bez relacji tworzymy goly wpis live
        const latest = myStories[myStories.length - 1]
        if (latest) {
          await supabase.from('training_status').update({
            is_live: true,
            gym_name: gymName.trim() || latest.gym_name,
            gym_latitude: gymLat,
            gym_longitude: gymLng,
          }).eq('id', latest.id)
        } else {
          await supabase.from('training_status').insert({
            profile_id: me.id,
            status_text: statusText.trim() || (t('trainingStatus.defaultLiveText') || 'Training now!'),
            training_time: trainingTime,
            gym_name: gymName.trim(),
            status_photo_url: statusPhoto ?? '',
            video_url: videoUrl ?? '',
            overlays,
            filter: filterValue,
            expires_at,
            gym_latitude: gymLat,
            gym_longitude: gymLng,
            is_live: true,
            looking_for_partner: lookingForPartner,
            view_count: 0,
          })
        }
        setIsLive(true)
        await loadStatus()
        if (notifyMatches) notifyMyMatches(me)
        Alert.alert('💪', t('trainingStatus.sessionStarted') || "You're live! Others can see you're at the gym now.")
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setTogglingLive(false)
    }
  }

  async function handleSave() {
    // Relacja MUSI miec zdjecie lub wideo — teksty sa naklejkami na medium, nie sama trescia
    if (!statusPhoto && !videoUrl) {
      Alert.alert(t('common.error'), t('trainingStatus.emptyStatus'))
      return
    }
    setSaving(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      let gymLat: number | null = null
      let gymLng: number | null = null
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          gymLat = loc.coords.latitude
          gymLng = loc.coords.longitude
        }
      } catch (e) { }

      if (myStories.length >= MAX_STORIES) {
        Alert.alert('📚', t('trainingStatus.storiesLimit', { max: MAX_STORIES }))
        return
      }
      // Pierwsza relacja swiezego zestawu = czyste konto reakcji i wyswietlen
      if (myStories.length === 0) {
        await supabase.from('status_reactions').delete().eq('status_profile_id', me.id)
        await supabase.from('status_views').delete().eq('status_profile_id', me.id)
      }

      // Zawsze NOWY wiersz — opublikowanych relacji nie edytujemy
      await supabase.from('training_status').insert({
        profile_id: me.id,
        status_text: statusText.trim(),
        training_time: trainingTime,
        gym_name: gymName.trim(),
        status_photo_url: statusPhoto ?? '',
        video_url: videoUrl ?? '',
        overlays,
        filter: filterValue,
        expires_at,
        gym_latitude: gymLat,
        gym_longitude: gymLng,
        looking_for_partner: lookingForPartner,
        view_count: 0,
      })
      await loadStatus()
      Alert.alert('✅', t('trainingStatus.statusSet'))
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setSaving(false) }
  }

  // Usuwanie POJEDYNCZEJ relacji; przy ostatniej sprzatamy tez reakcje/wyswietlenia
  function handleDeleteStory(story: any) {
    Alert.alert(t('trainingStatus.deleteConfirmTitle'), t('trainingStatus.deleteConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trainingStatus.delete'), style: 'destructive', onPress: async () => {
        const me = await getMyProfile()
        if (!me) return
        await supabase.from('training_status').delete().eq('id', story.id)
        if (myStories.length <= 1) {
          await supabase.from('status_reactions').delete().eq('status_profile_id', me.id)
          await supabase.from('status_views').delete().eq('status_profile_id', me.id)
          setReactions({})
          setIsLive(false)
        }
        await loadStatus()
      }}
    ])
  }

  // Udostepnianie na inne sociale: zdjecie = zlozona karta (media+filtr+naklejki),
  // wideo = plik pobrany do cache i przekazany do systemowego arkusza
  async function shareStoryExternal(story: any) {
    if (story.video_url) {
      setSharingStory(true)
      try {
        const dest = LegacyFS.cacheDirectory + 'fitnessswipe-story.mp4'
        const { uri } = await LegacyFS.downloadAsync(story.video_url, dest)
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'video/mp4', dialogTitle: 'FitnessSwipe' })
        }
      } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
      finally { setSharingStory(false) }
      return
    }
    setShareTarget(story)
  }

  async function captureAndShare() {
    if (!shareShotRef.current?.capture) return
    setSharingStory(true)
    try {
      const uri = await shareShotRef.current.capture()
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'FitnessSwipe' })
      }
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setSharingStory(false) }
  }

  const quickTimes = [
    { label: t('trainingStatus.quickNow') || 'Teraz', value: nowHHMM() },
    { label: '+1h', value: nowHHMM(1) },
    { label: '17:00', value: '17:00' },
    { label: '18:00', value: '18:00' },
    { label: '19:00', value: '19:00' },
  ]

  const filteredGyms = gymResults.filter(g => g.toLowerCase().includes(gymQuery.trim().toLowerCase()))

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  // ===== PRZEGLAD: aktywne relacje (bez edycji — usun / udostepnij / dodaj kolejna) =====
  if (mode === 'overview') {
    // Tlo CALEJ strony (nie pojedynczych kart): wlasne zdjecie profilowe, przyciemnione,
    // zeby karty ponizej (polprzezroczyste) mialy spojny motyw zamiast plaskiego koloru
    const pageBgUri = myProfileObj?.photo_urls?.[0]
    return (
    <ImageBackground
      source={pageBgUri ? { uri: pageBgUri } : undefined}
      style={styles.container}
      resizeMode="contain"
      blurRadius={8}
    >
      <View style={styles.ovPageScrim} pointerEvents="none" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('trainingStatus.myStoriesTitle')}</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {myStories.map((story, idx) => {
          return (
          <View key={story.id} style={styles.ovCard}>
            {/* Tap w miniature/tresc = pelnoekranowy podglad relacji */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
              activeOpacity={0.8}
              onPress={() => setPreviewIndex(idx)}
            >
              <View style={styles.ovThumbWrap}>
                {story.video_url ? (
                  <View style={[styles.ovThumb, styles.ovThumbVideo]}>
                    <Ionicons name="videocam" size={22} color="#fff" />
                  </View>
                ) : (
                  <Image source={{ uri: story.status_photo_url }} style={styles.ovThumb} />
                )}
                {story.is_live && (
                  <View style={styles.ovLiveBadge}><Text style={styles.ovLiveBadgeText}>LIVE</Text></View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ovTimeLeft}>⏳ {storyTimeLeft(story)} {t('trainingStatus.timeLeft')}</Text>
                {story.status_text ? <Text style={styles.ovText} numberOfLines={1}>{story.status_text}</Text> : null}
                <View style={styles.ovStatsRow}>
                  <TouchableOpacity style={styles.statPill} onPress={openViewers}>
                    <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.statPillText}>{story.view_count ?? 0}</Text>
                  </TouchableOpacity>
                  {story.looking_for_partner ? <Text style={{ fontSize: 12 }}>🤝</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.ovActions}>
              <TouchableOpacity style={styles.ovActionBtn} onPress={() => shareStoryExternal(story)} disabled={sharingStory}>
                {sharingStory ? <ActivityIndicator size="small" color={LIME} /> : <Ionicons name="share-social-outline" size={19} color={LIME} />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.ovActionBtn} onPress={() => handleDeleteStory(story)}>
                <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
              </TouchableOpacity>
            </View>
          </View>
          )
        })}

        {Object.keys(reactions).length > 0 && (
          <View style={styles.ovReactionsRow}>
            {/* Tap w pigulke reakcji = ta sama lista co widzowie (kto i czym zareagowal) */}
            {Object.entries(reactions).map(([emoji, count]) => (
              <TouchableOpacity key={emoji} style={styles.statPill} onPress={openViewers}>
                <Text style={{ fontSize: 12 }}>{emoji}</Text>
                <Text style={styles.statPillText}>{count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.ovAddBtn, myStories.length >= MAX_STORIES && { opacity: 0.45 }]}
          onPress={startNewStory}
        >
          <Ionicons name="add-circle" size={20} color={BG} />
          <Text style={styles.ovAddBtnText}>{t('trainingStatus.addAnother', { n: myStories.length, max: MAX_STORIES })}</Text>
        </TouchableOpacity>
        <Text style={styles.ovHint}>{t('trainingStatus.noEditHint')}</Text>
      </ScrollView>

      {/* Pelnoekranowy podglad wlasnych relacji (bez nabijania wyswietlen — guard w lib) */}
      <StoryViewer
        visible={previewIndex != null}
        people={myStories.map(s => ({ ...s, profiles: { id: myId, name: myProfileObj?.name, photo_urls: myProfileObj?.photo_urls } }))}
        initialIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        myProfile={myProfileObj}
        onShare={(story) => { setPreviewIndex(null); setTimeout(() => shareStoryExternal(story), 350) }}
      />

      {/* Kompozycja zdjecia do udostepnienia na inne sociale (media+filtr+naklejki+branding) */}
      <Modal visible={!!shareTarget} transparent animationType="fade" onRequestClose={() => setShareTarget(null)}>
        <View style={styles.shareOverlay}>
          <ViewShot ref={shareShotRef} options={{ format: 'png', quality: 1 }} style={styles.shareCard}>
            {shareTarget?.status_photo_url ? (
              <>
                <Image source={{ uri: shareTarget.status_photo_url }} style={styles.shareCardBgBlur} blurRadius={28} />
                <View style={styles.shareCardShade} />
                <Image source={{ uri: shareTarget.status_photo_url }} style={styles.shareCardImg} resizeMode="contain" />
                <FilterLayer id={shareTarget.filter} />
                <OverlayPillsView status={shareTarget} />
              </>
            ) : null}
            <View style={styles.shareBrandRow}>
              <Text style={styles.shareBrand}>FitnessSwipe</Text>
              <Text style={styles.shareBrandSub}>fitnessswipe.app</Text>
            </View>
          </ViewShot>
          <View style={styles.shareActions}>
            <TouchableOpacity style={styles.shareGoBtn} onPress={captureAndShare} disabled={sharingStory}>
              {sharingStory ? <ActivityIndicator color={BG} /> : (
                <><Ionicons name="share-social" size={17} color={BG} /><Text style={styles.shareGoBtnText}>{t('trainingStatus.shareExternal')}</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setShareTarget(null)}>
              <Text style={styles.shareCloseBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  )
  }

  return (
    <View style={styles.container}>
      {/* Tlo: wideo (pelny ekran), zdjecie statusu albo gradient.
          Zdjecie w calosci (contain), luki wypelnia rozmyta kopia */}
      {videoUrl ? (
        <VideoView player={bgPlayer} style={styles.bg} contentFit="cover" nativeControls={false} />
      ) : statusPhoto ? (
        <>
          <Image source={{ uri: statusPhoto }} style={styles.bg} resizeMode="cover" blurRadius={30} />
          <View style={[styles.bg, { backgroundColor: 'rgba(13,27,46,0.35)' }]} />
          <Image source={{ uri: statusPhoto }} style={styles.bg} resizeMode="contain" />
        </>
      ) : (
        <LinearGradient colors={['#24405f', BG]} style={styles.bg} />
      )}

      {/* Filtr kolorystyczny + efekty na zywo (jak IG) */}
      {(statusPhoto || videoUrl) && <FilterLayer id={filterValue} />}

      <LinearGradient
        colors={['rgba(13,27,46,0.75)', 'rgba(13,27,46,0.1)', 'rgba(13,27,46,0.96)']}
        locations={[0, 0.35, 0.78]}
        style={styles.bg}
        pointerEvents="none"
      />

      {/* Wideo: tapniecie w tlo pauzuje/wznawia odtwarzanie */}
      {videoUrl && (
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleVideoPlay}>
          {videoPaused && (
            <View style={styles.videoPausedOverlay} pointerEvents="none">
              <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.85)" />
            </View>
          )}
        </Pressable>
      )}

      {/* Naklejki na zdjeciu/wideo — przeciagalne po calym ekranie */}
      {(statusPhoto || videoUrl) && overlays.length > 0 && (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
          onLayout={e => setMediaArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {overlays.map(ov => (
            <StickerPill
              key={ov.id ?? ov.type}
              ov={ov}
              time={trainingTime}
              gym={gymName}
              area={mediaArea}
              onChange={(x, y) => moveOverlay(ov, x, y)}
              onCycle={() => cycleOverlay(ov)}
              onRemove={() => removeOverlay(ov)}
              onScale={s => scaleOverlay(ov, s)}
            />
          ))}
        </View>
      )}

      {/* Gorny pasek */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.roundBtn}
          onPress={() => { if (myStories.length > 0) setMode('overview'); else router.back() }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('trainingStatus.planTitle') || 'Status 24h'}</Text>
        <View style={styles.topBtns}>
          <TouchableOpacity style={styles.roundBtn} onPress={pickPhoto} disabled={uploadingPhoto}>
            {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera-outline" size={21} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Znacznik wideo + kosz — POD gornym paskiem, nic sie nie naklada */}
      {videoUrl && (
        <View style={styles.videoTopRow}>
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={13} color="#fff" />
            <Text style={styles.videoBadgeText}>{t('trainingStatus.videoPreview')}</Text>
          </View>
          <TouchableOpacity style={styles.videoRemoveBtn} onPress={() => { setVideoUrl(null); setVideoPaused(false) }}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Kolumna narzedzi po prawej (zwiniete ikony; tap rozwija panel obok).
          Filtry i naklejki tylko przy zdjeciu/wideo; partner i presety zawsze. */}
      {(() => {
        const hasMedia = !!(statusPhoto || videoUrl)
        const railTop = videoUrl ? 200 : 150
        // Presety ("Teksty") to naklejki na medium — bez zdjecia/wideo nie ma ich gdzie polozyc
        const railItems = hasMedia ? ['filters', 'effects', 'stickers', 'activity', 'partner', 'presets'] : ['stickers', 'partner']
        const panelTop = (k: string) => railTop + railItems.indexOf(k) * 66
        return (
          <>
            <View style={[styles.toolRail, { top: railTop }]}>
              {hasMedia && (
                <View style={styles.toolItem}>
                  <TouchableOpacity
                    style={[styles.toolBtn, toolOpen === 'filters' && styles.toolBtnActive]}
                    onPress={() => setToolOpen(o => (o === 'filters' ? null : 'filters'))}
                  >
                    <Ionicons name="color-palette-outline" size={20} color={toolOpen === 'filters' || filterId ? LIME : '#fff'} />
                  </TouchableOpacity>
                  <Text style={styles.toolLabel}>{t('trainingStatus.toolFilters')}</Text>
                </View>
              )}
              {hasMedia && (
                <View style={styles.toolItem}>
                  <TouchableOpacity
                    style={[styles.toolBtn, toolOpen === 'effects' && styles.toolBtnActive]}
                    onPress={() => setToolOpen(o => (o === 'effects' ? null : 'effects'))}
                  >
                    <Ionicons name="sparkles-outline" size={19} color={toolOpen === 'effects' || effects.length > 0 ? LIME : '#fff'} />
                  </TouchableOpacity>
                  <Text style={styles.toolLabel}>{t('trainingStatus.toolEffects')}</Text>
                </View>
              )}
              <View style={styles.toolItem}>
                <TouchableOpacity
                  style={[styles.toolBtn, (toolOpen === 'stickers' || toolOpen === 'time') && styles.toolBtnActive]}
                  onPress={() => setToolOpen(o => (o === 'stickers' || o === 'time' ? null : 'stickers'))}
                >
                  <Text style={[styles.toolBtnAa, (toolOpen === 'stickers' || toolOpen === 'time' || overlays.length > 0) && { color: LIME }]}>Aa</Text>
                </TouchableOpacity>
                <Text style={styles.toolLabel}>{t('trainingStatus.toolStickers')}</Text>
              </View>
              {hasMedia && (
                <View style={styles.toolItem}>
                  <TouchableOpacity
                    style={[styles.toolBtn, toolOpen === 'activity' && styles.toolBtnActive]}
                    onPress={() => setToolOpen(o => (o === 'activity' ? null : 'activity'))}
                  >
                    <Ionicons name="stopwatch-outline" size={19} color={toolOpen === 'activity' || overlays.some(o => o.type === 'activity') ? LIME : '#fff'} />
                  </TouchableOpacity>
                  <Text style={styles.toolLabel}>{t('activity.tool')}</Text>
                </View>
              )}
              <View style={styles.toolItem}>
                <TouchableOpacity
                  style={[styles.toolBtn, lookingForPartner && styles.toolBtnActive]}
                  onPress={() => setLookingForPartner(v => !v)}
                >
                  <Ionicons name="people-outline" size={20} color={lookingForPartner ? LIME : '#fff'} />
                </TouchableOpacity>
                <Text style={styles.toolLabel}>{t('trainingStatus.toolPartner')}</Text>
              </View>
              {hasMedia && (
                <View style={styles.toolItem}>
                  <TouchableOpacity
                    style={[styles.toolBtn, toolOpen === 'presets' && styles.toolBtnActive]}
                    onPress={() => setToolOpen(o => (o === 'presets' ? null : 'presets'))}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={19} color={toolOpen === 'presets' || overlays.some(o => o.type === 'text') ? LIME : '#fff'} />
                  </TouchableOpacity>
                  <Text style={styles.toolLabel}>{t('trainingStatus.toolPresets')}</Text>
                </View>
              )}
            </View>

            {hasMedia && toolOpen === 'filters' && (
              <View style={[styles.toolPanel, { top: panelTop('filters'), maxHeight: 320 }]}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {STATUS_FILTERS.map(f => (
                    <TouchableOpacity key={f || 'none'} style={styles.toolPanelRow} onPress={() => { setFilterId(f); setToolOpen(null) }}>
                      <LinearGradient colors={FILTER_SWATCHES[f]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.filterSwatch} />
                      <Text style={[styles.toolPanelText, filterId === f && { color: LIME, fontWeight: '800' }]}>
                        {t('trainingStatus.filter_' + (f || 'none'))}
                      </Text>
                      {filterId === f && <Ionicons name="checkmark" size={14} color={LIME} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Efekty: winieta/ramki — multi-select, mozna laczyc z filtrem */}
            {hasMedia && toolOpen === 'effects' && (
              <View style={[styles.toolPanel, { top: panelTop('effects') }]}>
                {STATUS_EFFECTS.map(ef => {
                  const active = effects.includes(ef)
                  return (
                    <TouchableOpacity
                      key={ef}
                      style={styles.toolPanelRow}
                      onPress={() => setEffects(prev => active ? prev.filter(x => x !== ef) : [...prev, ef])}
                    >
                      <Text style={[styles.toolPanelText, active && { color: LIME, fontWeight: '800' }]}>{t('trainingStatus.effect_' + ef)}</Text>
                      {active && <Ionicons name="checkmark" size={14} color={LIME} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Naklejki: godzina/silownia od razu sugeruja wartosc (panel godzin / wyszukiwarka silowni).
                Bez medium ustawiaja tylko pola statusu; reszta to czyste naklejki, wiec wymaga medium. */}
            {toolOpen === 'stickers' && (
              <View style={[styles.toolPanel, { top: panelTop('stickers') }]}>
                {(hasMedia ? (['time', 'gym', 'place', 'text', 'day', 'pr'] as const) : (['time', 'gym'] as const)).map(tp => {
                  const active = overlays.some(o => o.type === tp)
                  const label =
                    tp === 'time' ? t('trainingStatus.stickerTime')
                    : tp === 'gym' ? t('trainingStatus.stickerGym')
                    : tp === 'place' ? t('trainingStatus.stickerPlace')
                    : tp === 'text' ? t('trainingStatus.stickerText')
                    : tp === 'day' ? t('trainingStatus.stickerDay')
                    : t('trainingStatus.stickerPr')
                  const onPress = () => {
                    if (active) { toggleOverlay(tp); setToolOpen(null); return }
                    if (tp === 'time') { setToolOpen('time'); return }
                    if (tp === 'gym') { setToolOpen(null); openGymSearch(); return }
                    toggleOverlay(tp)
                    setToolOpen(null)
                  }
                  return (
                    <TouchableOpacity key={tp} style={styles.toolPanelRow} onPress={onPress}>
                      <Text style={[styles.toolPanelText, active && { color: LIME, fontWeight: '800' }]}>{label}</Text>
                      {active && <Ionicons name="checkmark" size={14} color={LIME} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Aktywnosc: wybor sportu -> formularz statystyk; ponowne tapniecie na aktywna usuwa */}
            {hasMedia && toolOpen === 'activity' && (
              <View style={[styles.toolPanel, { top: panelTop('activity') }]}>
                {ACTIVITY_SPORTS.map(sp => (
                  <TouchableOpacity key={sp.key} style={styles.toolPanelRow} onPress={() => openActivityForm(sp.key)}>
                    <Text style={{ fontSize: 15 }}>{sp.emoji}</Text>
                    <Text style={styles.toolPanelText}>{t('activity.' + sp.key)}</Text>
                  </TouchableOpacity>
                ))}
                {overlays.some(o => o.type === 'activity') && (
                  <TouchableOpacity
                    style={styles.toolPanelRow}
                    onPress={() => { setOverlays(prev => prev.filter(o => o.type !== 'activity')); setToolOpen(null) }}
                  >
                    <Ionicons name="trash-outline" size={14} color="#ff6b6b" />
                    <Text style={[styles.toolPanelText, { color: '#ff6b6b' }]}>{t('trainingStatus.delete')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Szybki wybor godziny — wybrana godzina od razu laduje jako naklejka */}
            {toolOpen === 'time' && (
              <View style={[styles.toolPanel, { top: panelTop('stickers') }]}>
                {quickTimes.map(qt => (
                  <TouchableOpacity key={qt.label} style={styles.toolPanelRow} onPress={() => applyQuickTime(qt.value)}>
                    <Text style={[styles.toolPanelText, trainingTime === qt.value && { color: LIME, fontWeight: '800' }]}>
                      {qt.label}{qt.label !== qt.value ? ` · ${qt.value}` : ''}
                    </Text>
                    {trainingTime === qt.value && <Ionicons name="checkmark" size={14} color={LIME} />}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.toolPanelRow} onPress={() => { setToolOpen(null); setShowTimePicker(true) }}>
                  <Text style={styles.toolPanelText}>{t('trainingStatus.otherTime') || 'Inna…'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Presety = gotowe naklejki tekstowe na zdjecie/wideo (nie osobna tresc relacji) */}
            {toolOpen === 'presets' && (
              <View style={[styles.toolPanel, { top: panelTop('presets'), maxHeight: 300, minWidth: 190 }]}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {STATUS_PRESET_ICONS.map((icon, i) => {
                    const presetText = t('trainingStatus.preset' + (i + 1))
                    const active = overlays.some(o => o.type === 'text' && o.text === presetText)
                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.toolPanelRow}
                        onPress={() => {
                          setOverlays(prev => active
                            ? prev.filter(o => o.type !== 'text')
                            : [...prev.filter(o => o.type !== 'text'), { type: 'text' as const, text: presetText, x: 0.22, y: 0.5, v: 1 }])
                          setToolOpen(null)
                        }}
                      >
                        <Ionicons name={icon as any} size={15} color={active ? LIME : 'rgba(255,255,255,0.7)'} />
                        <Text style={[styles.toolPanelText, active && { color: LIME, fontWeight: '800' }]}>{presetText}</Text>
                        {active && <Ionicons name="checkmark" size={14} color={LIME} />}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            )}
          </>
        )
      })()}

      <KeyboardAvoidingView
        style={styles.bottomWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        {/* Ustawiony tekst / godzina / silownia — male pigulki informacyjne (edycja przez kolumne narzedzi) */}
        {(!!statusText.trim() || !!trainingTime || !!gymName) && (
          <View style={styles.metaChipsRow}>
            {!!statusText.trim() && (
              <TouchableOpacity style={styles.metaChip} onPress={() => { setStatusText(''); setSelectedPreset(null) }}>
                <Ionicons name="chatbubble-ellipses-outline" size={12} color={LIME} />
                <Text style={styles.metaChipText} numberOfLines={1}>{statusText.trim()}</Text>
                <Ionicons name="close" size={11} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
            {!!trainingTime && (
              <TouchableOpacity style={styles.metaChip} onPress={() => { setTrainingTime(''); setOverlays(prev => prev.filter(o => o.type !== 'time')) }}>
                <Ionicons name="time-outline" size={12} color={LIME} />
                <Text style={styles.metaChipText}>{trainingTime}</Text>
                <Ionicons name="close" size={11} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
            {!!gymName && (
              <TouchableOpacity style={styles.metaChip} onPress={() => { setGymName(''); setOverlays(prev => prev.filter(o => o.type !== 'gym')) }}>
                <Ionicons name="barbell-outline" size={12} color={LIME} />
                <Text style={styles.metaChipText} numberOfLines={1}>{gymName}</Text>
                <Ionicons name="close" size={11} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Live + powiadom matche */}
        <View style={styles.liveRow}>
          <TouchableOpacity style={[styles.livePill, isLive && styles.livePillActive]} onPress={handleToggleLive} disabled={togglingLive}>
            {togglingLive ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <View style={[styles.liveDot, isLive && styles.liveDotActive]} />
                <Text style={styles.livePillText}>
                  {isLive ? (t('trainingStatus.liveNow') || "You're live!") : (t('trainingStatus.imAtGym') || "I'm at the gym now")}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.notifyToggle} onPress={() => setNotifyMatches(v => !v)}>
            <Ionicons name={notifyMatches ? 'notifications' : 'notifications-off-outline'} size={17} color={notifyMatches ? LIME : 'rgba(255,255,255,0.35)'} />
          </TouchableOpacity>
        </View>
        <Text style={styles.notifyHint}>
          {notifyMatches ? (t('trainingStatus.notifyMatchesOn') || 'Twoje matche dostaną powiadomienie, gdy przejdziesz w tryb live') : (t('trainingStatus.notifyMatchesOff') || 'Powiadomienia dla matchy wyłączone')}
        </Text>

        {/* Udostepnij */}
        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={BG} /> : (
            <>
              <Ionicons name="flash" size={18} color={BG} />
              <Text style={styles.saveBtnText}>{t('trainingStatus.shareBtn') || 'Udostępnij na 24h'}</Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Modal wyszukiwarki silowni */}
      <Modal visible={showGymSearch} transparent animationType="slide" onRequestClose={() => setShowGymSearch(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('trainingStatus.searchGym') || 'Szukaj siłowni w pobliżu'}</Text>
            <TextInput
              style={styles.sheetInput}
              value={gymQuery}
              onChangeText={setGymQuery}
              placeholder={t('trainingStatus.gymPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            {gymSearchLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={styles.gymList} keyboardShouldPersistTaps="handled">
                {gymQuery.trim().length > 0 && (
                  <TouchableOpacity style={styles.gymRow} onPress={() => { setGymName(gymQuery.trim()); ensureOverlay('gym'); setShowGymSearch(false); setGymQuery('') }}>
                    <Ionicons name="add-circle-outline" size={18} color={LIME} />
                    <Text style={styles.gymRowText}>{(t('trainingStatus.useName') || 'Użyj')}: „{gymQuery.trim()}"</Text>
                  </TouchableOpacity>
                )}
                {filteredGyms.map(name => (
                  <TouchableOpacity key={name} style={styles.gymRow} onPress={() => { setGymName(name); ensureOverlay('gym'); setShowGymSearch(false); setGymQuery('') }}>
                    <Ionicons name="barbell-outline" size={18} color={PRIMARY} />
                    <Text style={styles.gymRowText}>{name}</Text>
                  </TouchableOpacity>
                ))}
                {gymResults.length === 0 && (
                  <Text style={styles.gymEmpty}>{t('profile.gymSearchNone') || 'Nie znaleziono siłowni w pobliżu'}</Text>
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => { setShowGymSearch(false); setGymQuery('') }}>
              <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal wlasnej lokalizacji do naklejki */}
      <Modal visible={showPlaceModal} transparent animationType="slide" onRequestClose={() => setShowPlaceModal(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('trainingStatus.placeTitle')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={placeInput}
              onChangeText={setPlaceInput}
              placeholder={t('trainingStatus.placePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={40}
              autoFocus
            />

            {/* Sugerowane miejsca w poblizu (OSM) — tap dodaje naklejke od razu */}
            {placeLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 14 }} />
            ) : (
              (() => {
                const filtered = placeSuggestions.filter(p => p.toLowerCase().includes(placeInput.trim().toLowerCase()))
                return filtered.length > 0 ? (
                  <ScrollView style={styles.placeList} keyboardShouldPersistTaps="handled">
                    <Text style={styles.placeListLabel}>{t('trainingStatus.placeNearby')}</Text>
                    {filtered.map(name => (
                      <TouchableOpacity key={name} style={styles.placeRow} onPress={() => addPlaceOverlay(name)}>
                        <Ionicons name="location-outline" size={16} color={PRIMARY} />
                        <Text style={styles.placeRowText} numberOfLines={1}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null
              })()
            )}

            <TouchableOpacity style={[styles.placeAddBtn, !placeInput.trim() && { opacity: 0.4 }]} onPress={() => addPlaceOverlay()} disabled={!placeInput.trim()}>
              <Text style={styles.placeAddBtnText}>{t('trainingStatus.placeAdd')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowPlaceModal(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal wlasnego tekstu naklejki */}
      <Modal visible={showTextModal} transparent animationType="slide" onRequestClose={() => setShowTextModal(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('trainingStatus.textTitle')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={textStickerInput}
              onChangeText={setTextStickerInput}
              placeholder={t('trainingStatus.textPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={60}
              autoFocus
            />
            <TouchableOpacity style={[styles.placeAddBtn, !textStickerInput.trim() && { opacity: 0.4 }]} onPress={addTextOverlay} disabled={!textStickerInput.trim()}>
              <Text style={styles.placeAddBtnText}>{t('trainingStatus.placeAdd')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowTextModal(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Formularz naklejki aktywnosci: dystans/czas (silownia: czas/kalorie),
          prefill z dzisiejszego treningu w Apple Health / Health Connect */}
      <Modal visible={!!actSport} transparent animationType="slide" onRequestClose={() => setActSport(null)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {/* Podglad naklejki NA ZYWO — dokladnie ta trafi na zdjecie */}
            {actSport && (() => {
              const preview = buildActivityData(actSport, actDist, actMins, actKcal)
              return (
                <LinearGradient colors={['#24405f', '#0d1b2e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actPreviewCard}>
                  <View style={{ transform: [{ scale: 0.8 }] }}>
                    <StickerContent
                      type="activity"
                      variant={0}
                      act={{ sport: actSport, ...preview }}
                      sportLabel={t('activity.' + actSport)}
                    />
                  </View>
                </LinearGradient>
              )
            })()}

            <View style={styles.actInputsRow}>
              {actSport !== 'gym' && (
                <View style={styles.actInputBox}>
                  <Text style={styles.actInputLabel}>{t('activity.distKm')}</Text>
                  <TextInput
                    style={styles.actInput}
                    value={actDist}
                    onChangeText={setActDist}
                    placeholder="0,0"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="decimal-pad"
                    maxLength={6}
                    autoFocus
                  />
                </View>
              )}
              <View style={styles.actInputBox}>
                <Text style={styles.actInputLabel}>{t('activity.timeMin')}</Text>
                <TextInput
                  style={styles.actInput}
                  value={actMins}
                  onChangeText={setActMins}
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  keyboardType="number-pad"
                  maxLength={4}
                  autoFocus={actSport === 'gym'}
                />
              </View>
              {actSport === 'gym' && (
                <View style={styles.actInputBox}>
                  <Text style={styles.actInputLabel}>{t('activity.kcalOpt')}</Text>
                  <TextInput
                    style={styles.actInput}
                    value={actKcal}
                    onChangeText={setActKcal}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
              )}
            </View>

            <Text style={styles.actHint}>{t('activity.hint')}</Text>
            <TouchableOpacity
              style={[styles.placeAddBtn, !activityFormValid() && { opacity: 0.4 }]}
              onPress={addActivityOverlay}
              disabled={!activityFormValid()}
            >
              <Text style={styles.placeAddBtnText}>{t('activity.stick')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setActSport(null)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal rekordu (PR) — zlota pulsujaca naklejka */}
      <Modal visible={showPrModal} transparent animationType="slide" onRequestClose={() => setShowPrModal(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('trainingStatus.prTitle')}</Text>
            <TextInput
              style={styles.sheetInput}
              value={prInput}
              onChangeText={setPrInput}
              placeholder={t('trainingStatus.prPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={30}
              autoFocus
            />
            <TouchableOpacity style={[styles.placeAddBtn, !prInput.trim() && { opacity: 0.4 }]} onPress={addPrOverlay} disabled={!prInput.trim()}>
              <Text style={styles.placeAddBtnText}>{t('trainingStatus.placeAdd')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowPrModal(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal listy widzow relacji (jak na Instagramie) */}
      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={() => setShowViewers(false)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{'👁️‍🗨️'} {t('trainingStatus.viewersTitle')}</Text>
            {viewersLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={styles.viewersList}>
                {viewers.map((v: any) => (
                  <TouchableOpacity
                    key={v.viewer_id}
                    style={styles.viewerRow}
                    onPress={() => { setShowViewers(false); router.push({ pathname: '/profile/profile-detail', params: { profileId: v.viewer_id } } as any) }}
                  >
                    {v.profiles?.photo_urls?.[0] ? (
                      <Image source={{ uri: v.profiles.photo_urls[0] }} style={styles.viewerAvatar} />
                    ) : (
                      <View style={[styles.viewerAvatar, { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={16} color="rgba(255,255,255,0.35)" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.viewerName}>{v.profiles?.name}</Text>
                      <Text style={styles.viewerTime}>{viewedAgo(v.viewed_at)}</Text>
                    </View>
                    {v.emoji ? <Text style={{ fontSize: 18 }}>{v.emoji}</Text> : null}
                  </TouchableOpacity>
                ))}
                {viewers.length === 0 && (
                  <Text style={styles.gymEmpty}>{t('trainingStatus.viewersEmpty')}</Text>
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowViewers(false)}>
              <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal wyboru godziny */}
      <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>{t('trainingStatus.trainingTime')}</Text>
            <View style={styles.pickerRow}>
              <View style={styles.pickerCol}>
                <TouchableOpacity style={styles.pickerArrow} onPress={incHour}><Ionicons name="chevron-up" size={22} color={PRIMARY} /></TouchableOpacity>
                <Text style={styles.pickerValue}>{pad(timeHour)}</Text>
                <TouchableOpacity style={styles.pickerArrow} onPress={decHour}><Ionicons name="chevron-down" size={22} color={PRIMARY} /></TouchableOpacity>
              </View>
              <Text style={styles.pickerColon}>:</Text>
              <View style={styles.pickerCol}>
                <TouchableOpacity style={styles.pickerArrow} onPress={incMinute}><Ionicons name="chevron-up" size={22} color={PRIMARY} /></TouchableOpacity>
                <Text style={styles.pickerValue}>{pad(timeMinute)}</Text>
                <TouchableOpacity style={styles.pickerArrow} onPress={decMinute}><Ionicons name="chevron-down" size={22} color={PRIMARY} /></TouchableOpacity>
              </View>
            </View>
            <View style={styles.pickerBtns}>
              <TouchableOpacity style={styles.pickerCancel} onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerOk} onPress={() => { setTrainingTime(`${pad(timeHour)}:${pad(timeMinute)}`); ensureOverlay('time'); setShowTimePicker(false) }}>
                <Text style={styles.pickerOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  bg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  videoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12 },
  videoPausedOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  filterSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  toolRail: { position: 'absolute', right: 16, alignItems: 'center', gap: 9, zIndex: 8 },
  toolItem: { alignItems: 'center', gap: 2 },
  toolLabel: { fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3, lineHeight: 13 },
  toolBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  toolBtnActive: { borderColor: LIME },
  toolBtnAa: { fontSize: 15, fontWeight: '900', color: '#fff' },
  toolPanel: { position: 'absolute', right: 68, backgroundColor: 'rgba(10,16,28,0.94)', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 5, zIndex: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', minWidth: 150 },
  toolPanelRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 9 },
  toolPanelText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: '#fff' },
  videoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  videoBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  videoRemoveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54 },
  topTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  topBtns: { flexDirection: 'row', gap: 8 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  statusMeta: { paddingHorizontal: 16, marginTop: 12 },
  timeBarTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  timeBarFill: { height: 3, borderRadius: 2, backgroundColor: LIME },
  statusMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  timeLeftText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 6 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  ovPageScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,27,46,0.82)' },
  ovCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(26,42,68,0.55)', borderRadius: 18, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ovThumbWrap: { position: 'relative' },
  ovThumb: { width: 64, height: 84, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' },
  ovThumbVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#24405f' },
  ovLiveBadge: { position: 'absolute', top: -5, left: -5, backgroundColor: '#ff4757', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 },
  ovLiveBadgeText: { fontSize: 8.5, fontWeight: '900', color: '#fff' },
  ovTimeLeft: { fontSize: 12.5, fontWeight: '700', color: LIME },
  ovText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  ovStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  ovActions: { gap: 8 },
  ovActionBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ovReactionsRow: { flexDirection: 'row', gap: 6, marginBottom: 12, marginTop: 2 },
  ovAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 16, paddingVertical: 14, marginTop: 6 },
  ovAddBtnText: { fontSize: 15, fontWeight: '800', color: BG },
  ovHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  shareCard: { width: 290, aspectRatio: 9 / 16, borderRadius: 18, overflow: 'hidden', backgroundColor: BG },
  shareCardBgBlur: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  shareCardShade: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.35)' },
  shareCardImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  shareBrandRow: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(13,27,46,0.75)' },
  shareBrand: { fontSize: 13, fontWeight: '800', color: '#fff' },
  shareBrandSub: { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  shareActions: { marginTop: 18, width: 290, gap: 8 },
  shareGoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 14, paddingVertical: 14 },
  shareGoBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  shareCloseBtn: { alignItems: 'center', paddingVertical: 10 },
  shareCloseBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  statPillText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  bottomWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 30 },
  metaChipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', maxWidth: '70%' },
  metaChipText: { fontSize: 12, color: '#fff', fontWeight: '700', flexShrink: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  livePill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 22, paddingVertical: 11, borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.6)', backgroundColor: 'rgba(125,197,46,0.12)' },
  livePillActive: { borderColor: '#ff5050', backgroundColor: 'rgba(255,80,80,0.15)' },
  livePillText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: LIME },
  liveDotActive: { backgroundColor: '#ff5050' },
  notifyToggle: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  notifyHint: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6, textAlign: 'center' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 16, paddingVertical: 14, marginTop: 10 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: BG },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '75%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  sheetInput: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#fff', backgroundColor: BG },
  actHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 8, marginBottom: 4 },
  actPreviewCard: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14, minHeight: 130, overflow: 'hidden' },
  actInputsRow: { flexDirection: 'row', gap: 8 },
  actInputBox: { flex: 1, backgroundColor: BG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  actInputLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginBottom: 2 },
  actInput: { fontSize: 18, fontWeight: '800', color: '#fff', padding: 0 },
  placeAddBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  placeAddBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  placeList: { marginTop: 10, maxHeight: 220 },
  placeListLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  placeRowText: { flex: 1, fontSize: 14, color: '#fff' },
  gymList: { marginTop: 10, maxHeight: 300 },
  viewersList: { marginTop: 4, maxHeight: 360 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  viewerAvatar: { width: 38, height: 38, borderRadius: 19 },
  viewerName: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  viewerTime: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  gymRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  gymRowText: { fontSize: 14, color: '#fff', flex: 1 },
  gymEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 20 },
  sheetCancel: { marginTop: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  sheetCancelText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  pickerBox: { backgroundColor: BG_LIGHT, borderRadius: 20, padding: 24, width: SCREEN_W - 80 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 16 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  pickerCol: { alignItems: 'center' },
  pickerArrow: { padding: 6 },
  pickerValue: { fontSize: 34, fontWeight: '800', color: '#fff', width: 64, textAlign: 'center' },
  pickerColon: { fontSize: 30, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  pickerBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  pickerCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  pickerCancelText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  pickerOk: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: LIME, borderRadius: 12 },
  pickerOkText: { fontSize: 14, color: BG, fontWeight: '800' },
})
