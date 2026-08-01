import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal, Alert, Animated, PanResponder, Pressable, LayoutAnimation, UIManager } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ScreenCapture from 'expo-screen-capture'
import * as ImagePicker from 'expo-image-picker'
import * as ExpoLocation from 'expo-location'
import { Linking } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase, subscribeToMessages, getMyProfile, getBlockedIds, markMessagesAsRead, getMessageReactions, setMessageReaction, subscribeToReactions, REACTION_EMOJIS, REACTION_EMOJIS_EXTENDED, isOnline, touchLastSeen } from '../../lib/supabase'
import type { Message, Profile, MessageReaction } from '../../lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Plynne rozsuwanie karty zalacznikow na Androidzie
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// Motywy rozmowy (wspolne dla obu stron, zapis w matches.chat_theme):
// gradient tla + kolor wlasnych dymkow + kolor tekstu na nich + dymki rozmowcy
const CHAT_THEMES: Record<string, { label: string; bg: [string, string]; bubbleMe: string; onMe: string; bubbleOther: string }> = {
  lime: { label: 'Lime', bg: ['#0d1b2e', '#0d1b2e'], bubbleMe: '#7dc52e', onMe: '#0d1b2e', bubbleOther: '#1a2a44' },
  sunset: { label: 'Sunset', bg: ['#1a0e08', '#3b1f10'], bubbleMe: '#f0b429', onMe: '#1a0e08', bubbleOther: 'rgba(255,255,255,0.09)' },
  ocean: { label: 'Ocean', bg: ['#071c26', '#0c4a6e'], bubbleMe: '#4fc3f7', onMe: '#071c26', bubbleOther: 'rgba(255,255,255,0.09)' },
  violet: { label: 'Violet', bg: ['#140b24', '#3d1d5c'], bubbleMe: '#b388ff', onMe: '#140b24', bubbleOther: 'rgba(255,255,255,0.09)' },
  forest: { label: 'Forest', bg: ['#08150f', '#14532d'], bubbleMe: '#4ade80', onMe: '#08150f', bubbleOther: 'rgba(255,255,255,0.09)' },
  crimson: { label: 'Crimson', bg: ['#190909', '#6b1d1d'], bubbleMe: '#ff8787', onMe: '#190909', bubbleOther: 'rgba(255,255,255,0.10)' },
}

// Swipe-to-reply jak na Messengerze: cudza wiadomosc ciagniesz w prawo,
// wlasna w lewo. Prog ~55 px wyzwala cytat, dymek wraca sprezynka.
function SwipeableReply({ direction, enabled, onTrigger, children }: {
  direction: 'left' | 'right'
  enabled: boolean
  onTrigger: () => void
  children: React.ReactNode
}) {
  const tx = useRef(new Animated.Value(0)).current
  const propsRef = useRef({ direction, enabled, onTrigger })
  const triggered = useRef(false)
  useEffect(() => { propsRef.current = { direction, enabled, onTrigger } })
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Przejmujemy gest dopiero przy zdecydowanie poziomym ruchu we wlasciwa strone
    // (wysoki prog, zeby scroll i tapniecia nie ruszaly dymkow)
    onMoveShouldSetPanResponder: (_e, g) => {
      const p = propsRef.current
      if (!p.enabled) return false
      if (Math.abs(g.dx) < 20 || Math.abs(g.dx) < Math.abs(g.dy) * 2) return false
      return p.direction === 'right' ? g.dx > 0 : g.dx < 0
    },
    // Gdy juz prowadzimy gest, nie oddawajmy go liscie (Android czesto probuje przejac)
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => {
      const p = propsRef.current
      const dx = p.direction === 'right' ? Math.max(0, Math.min(g.dx, 90)) : Math.min(0, Math.max(g.dx, -90))
      tx.setValue(dx)
      // Cytat ustawiamy juz w trakcie przeciagania — pewniejsze niz czekanie na
      // puszczenie (ktorego moze nie byc, jesli system przerwie gest)
      if (!triggered.current && Math.abs(dx) >= 60) {
        triggered.current = true
        p.onTrigger()
      }
    },
    onPanResponderRelease: () => {
      triggered.current = false
      Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 7 }).start()
    },
    onPanResponderTerminate: () => {
      triggered.current = false
      Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start()
    },
  })).current
  const iconOpacity = direction === 'right'
    ? tx.interpolate({ inputRange: [0, 55], outputRange: [0, 1], extrapolate: 'clamp' })
    : tx.interpolate({ inputRange: [-55, 0], outputRange: [1, 0], extrapolate: 'clamp' })
  return (
    <View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', opacity: iconOpacity }, direction === 'right' ? { left: 10 } : { right: 10 }]}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(148,227,54,0.15)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-undo" size={17} color="#94e336" />
        </View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...pan.panHandlers}>{children}</Animated.View>
    </View>
  )
}

// Glosowka w dymku: play/pauza + pasek postepu + czas
function VoiceBubble({ uri, duration, isMe }: { uri: string; duration: number; isMe: boolean }) {
  const player = useAudioPlayer(uri)
  const status = useAudioPlayerStatus(player)
  const total = status.duration && status.duration > 0 ? status.duration : duration
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0
  const fg = isMe ? '#0d1b2e' : '#94e336'
  const track = isMe ? 'rgba(13,27,46,0.25)' : 'rgba(255,255,255,0.15)'

  function toggle() {
    if (status.playing) { player.pause(); return }
    // expo-audio nie cofa sie samo po zakonczeniu — recznie od poczatku
    if (total > 0 && status.currentTime >= total - 0.1) player.seekTo(0)
    player.play()
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 170, paddingVertical: 2 }}>
      <TouchableOpacity onPress={toggle} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isMe ? 'rgba(13,27,46,0.15)' : 'rgba(148,227,54,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={17} color={fg} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: track }}>
          <View style={{ height: 4, borderRadius: 2, width: `${Math.round(progress * 100)}%`, backgroundColor: fg }} />
        </View>
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: isMe ? 'rgba(13,27,46,0.6)' : 'rgba(255,255,255,0.55)' }}>
        {fmt(status.playing || status.currentTime > 0 ? status.currentTime : total)}
      </Text>
    </View>
  )
}

export default function ChatScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const flatListRef = useRef<FlatList>(null)
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [isBlocked, setIsBlocked] = useState(false)
  const [isTrainerChat, setIsTrainerChat] = useState(false)
  const [clientSharesMeasurements, setClientSharesMeasurements] = useState(false)
  const [showSafetySheet, setShowSafetySheet] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [duoWeeks, setDuoWeeks] = useState(0)
  const [duoThisWeek, setDuoThisWeek] = useState(false)
  const [icebreakers, setIcebreakers] = useState<string[]>([])
  const [iceLoading, setIceLoading] = useState(false)
  const [showIcePanel, setShowIcePanel] = useState(false)
  const [duel, setDuel] = useState<any>(null)
  const [showDuelModal, setShowDuelModal] = useState(false)
  const [duelMetric, setDuelMetric] = useState<'workouts' | 'steps'>('workouts')
  const [duelDays, setDuelDays] = useState(7)
  const [duelStake, setDuelStake] = useState('')
  const [duelBusy, setDuelBusy] = useState(false)
  const [duelExpanded, setDuelExpanded] = useState(false)
  // Reakcje: mapa message_id -> lista reakcji; target dla paska i arkusza "kto zareagowal"
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null)
  const [showAllEmojis, setShowAllEmojis] = useState(false)
  const [whoTarget, setWhoTarget] = useState<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  // Messenger-pack: "pisze...", odpowiadanie, status online
  const [otherTyping, setOtherTyping] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null)
  const typingChannelRef = useRef<any>(null)
  const typingTimeoutRef = useRef<any>(null)
  const lastTypingSentRef = useRef(0)
  // Wyszukiwarka w rozmowie: filtrowanie lokalne (cala historia jest juz w pamieci)
  const [searchMode, setSearchMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  // Motyw rozmowy + menu po przytrzymaniu tla
  const [chatTheme, setChatTheme] = useState('lime')
  const [showChatOptions, setShowChatOptions] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const theme = CHAT_THEMES[chatTheme] ?? CHAT_THEMES.lime
  // GIF-y (Giphy przez edge function gif-search)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState<{ id: string; preview: string; url: string }[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const gifSearchTimer = useRef<any>(null)
  // Media i edycja: zdjecia, glosowki, tryb edycji wiadomosci
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageViewer, setImageViewer] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Message | null>(null)
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(audioRecorder)

  // Arkusz bezpieczenstwa przy pierwszym otwarciu KAZDEJ nowej rozmowy
  // (wczesniej: globalna flaga raz na urzadzenie — kolejne matche go nie widzialy)
  useEffect(() => {
    if (!matchId) return
    AsyncStorage.getItem('safety_sheet_shown_' + matchId).then(v => {
      if (v !== '1') setShowSafetySheet(true)
    })
  }, [matchId])

  // Prywatnosc rozmow: blokada zrzutow ekranu TYLKO w czacie.
  // Android: twarda blokada (czarny zrzut); iOS: blokada nagrywania + ostrzezenie po zrzucie.
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync().catch(() => { })
    const sub = ScreenCapture.addScreenshotListener(() => {
      Alert.alert(t('common.screenshotWarningTitle'), t('common.screenshotWarningMsg'))
    })
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => { })
      sub.remove()
    }
  }, [])

  async function dismissSafetySheet() {
    setShowSafetySheet(false)
    if (matchId) await AsyncStorage.setItem('safety_sheet_shown_' + matchId, '1')
  }

  // Trener po wspolnym treningu prosi o opinie — dopiero to odblokowuje ocene
  async function handleAskForReview() {
    if (!myProfile || !otherProfile) return
    Alert.alert(
      t('trainer.askReviewTitle'),
      t('trainer.askReviewMsg', { name: otherProfile.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('trainer.askReviewSend'),
          onPress: async () => {
            setSendingInvite(true)
            try {
              const { sendReviewInvite } = await import('../../lib/supabase')
              const result = await sendReviewInvite(otherProfile.id)
              if (result.success) {
                const { notifyProfile } = await import('../../lib/notifications')
                notifyProfile(
                  otherProfile.id,
                  `⭐ ${myProfile.name}`,
                  t('trainer.askReviewPush'),
                  { type: 'review_invite', trainerId: myProfile.id }
                )
                Alert.alert('✅', t('trainer.askReviewSent', { name: otherProfile.name }))
              } else {
                Alert.alert(t('common.error'))
              }
            } finally { setSendingInvite(false) }
          },
        },
      ]
    )
  }

  const myProfileRef = useRef<Profile | null>(null)
  useEffect(() => { myProfileRef.current = myProfile }, [myProfile])

  useEffect(() => {
    loadChat()
    const channel = subscribeToMessages(
      matchId,
      (msg) => {
        setMessages(prev => {
          // Nie duplikuj - wiadomosc mogla juz zostac dodana optymistycznie lub przez odpowiedz inserta
          if (prev.some(m => m.id === msg.id)) return prev
          const tempIdx = prev.findIndex(m => (m as any).pending && m.sender_id === msg.sender_id && m.content === msg.content)
          if (tempIdx >= 0) {
            const copy = [...prev]
            copy[tempIdx] = msg
            return copy
          }
          return [...prev, msg]
        })
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
        const me = myProfileRef.current
        if (me && msg.sender_id !== me.id) markMessagesAsRead(matchId, me.id)
      },
      (updatedMsg) => {
        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m))
      }
    )
    // Reakcje na zywo: kazda zmiana w tabeli (RLS ogranicza do moich rozmow) odswieza mape
    const reactionChannel = subscribeToReactions(String(matchId), false, () => loadReactions(messagesRef.current))
    // "Pisze...": lekki kanal broadcast, bez zapisu do bazy
    const typingChannel = supabase.channel(`typing:${matchId}`)
    typingChannel.on('broadcast', { event: 'typing' }, (payload: any) => {
      const me = myProfileRef.current
      if (!me || payload?.payload?.profileId === me.id) return
      setOtherTyping(true)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3500)
    }).on('broadcast', { event: 'theme' }, (payload: any) => {
      // Druga strona zmienila motyw — przemaluj na zywo
      const key = payload?.payload?.key
      if (key && CHAT_THEMES[key]) setChatTheme(key)
    }).subscribe()
    typingChannelRef.current = typingChannel
    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(reactionChannel)
      supabase.removeChannel(typingChannel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [matchId])

  // Sygnal "pisze" najwyzej raz na 2 s, tylko gdy cos faktycznie jest w polu
  function handleTextChange(v: string) {
    setText(v)
    const me = myProfileRef.current
    if (!me || !v.trim()) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < 2000) return
    lastTypingSentRef.current = now
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { profileId: me.id } })
  }

  // Status online rozmowcy: odswiezany co 30 s
  useEffect(() => {
    if (!otherProfile) return
    setOtherLastSeen((otherProfile as any).last_seen_at ?? null)
    const iv = setInterval(async () => {
      try {
        const { data } = await supabase.from('profiles').select('last_seen_at').eq('id', (otherProfile as any).id).single()
        if (data) setOtherLastSeen(data.last_seen_at)
      } catch (e) { }
    }, 30000)
    return () => clearInterval(iv)
  }, [otherProfile?.id])

  // Wspolna wysylka wiadomosci medialnej (zdjecie/glosowka) z optymistycznym dymkiem
  async function sendMediaMessage(fields: Partial<Message>, pushLabel: string) {
    if (!myProfile || isBlocked) return
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    const tempMsg = {
      id: tempId, match_id: matchId, sender_id: myProfile.id, content: '',
      sent_at: new Date().toISOString(), read_at: null, pending: true, ...fields,
    } as unknown as Message
    setMessages(prev => [...prev, tempMsg])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ match_id: matchId, sender_id: myProfile.id, content: '', ...fields })
        .select()
        .single()
      if (error) throw error
      if (data) {
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev.filter(m => m.id !== tempId)
          return prev.map(m => m.id === tempId ? data : m)
        })
      }
      if (otherProfile) {
        const { notifyProfile } = await import('../../lib/notifications')
        notifyProfile(otherProfile.id, myProfile.name, pushLabel, { type: 'message', matchId })
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      Alert.alert(t('common.error'))
    }
  }

  async function uploadChatImage(uri: string) {
    setUploadingImage(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${user.id}/chat_${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri, name: `chat.${ext}`, type: `image/${ext}` } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
      if (error) { Alert.alert(t('common.error'), error.message); return }
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      await sendMediaMessage({ image_url: data.publicUrl }, '📷 ' + t('chat.photoMsg'))
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setUploadingImage(false) }
  }

  // Karta zalacznikow pod przyciskiem "+": rozsuwa sie nad polem tekstowym
  function toggleAttachMenu() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setShowAttachMenu(v => !v)
  }

  async function pickFromCamera() {
    toggleAttachMenu()
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 })
    if (!result.canceled && result.assets[0]) uploadChatImage(result.assets[0].uri)
  }

  async function pickFromGallery() {
    toggleAttachMenu()
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 } as any)
    if (!result.canceled && result.assets[0]) uploadChatImage(result.assets[0].uri)
  }

  // Zmiana motywu: lokalnie, w bazie (dla obu stron) i broadcastem na zywo
  async function applyTheme(key: string) {
    setShowThemePicker(false)
    setChatTheme(key)
    try {
      await supabase.from('matches').update({ chat_theme: key }).eq('id', matchId)
      typingChannelRef.current?.send({ type: 'broadcast', event: 'theme', payload: { key, profileId: myProfile?.id } })
    } catch (e) { }
  }

  async function fetchGifs(q: string) {
    setGifLoading(true)
    try {
      const { data } = await supabase.functions.invoke('gif-search', { body: { q, lang: i18n.language } })
      setGifResults(data?.gifs ?? [])
    } catch (e) { setGifResults([]) }
    finally { setGifLoading(false) }
  }

  function openGifPicker() {
    setShowGifPicker(true)
    setGifQuery('')
    fetchGifs('')
  }

  // Wyszukiwanie z opoznieniem — nie strzelamy do funkcji przy kazdej literze
  function handleGifQuery(v: string) {
    setGifQuery(v)
    if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current)
    gifSearchTimer.current = setTimeout(() => fetchGifs(v.trim()), 450)
  }

  function sendGif(gif: { url: string }) {
    setShowGifPicker(false)
    sendMediaMessage({ image_url: gif.url }, 'GIF 🎬')
  }

  // Lokalizacja: zawsze aktualna pozycja GPS; etykieta to nazwa silowni z profilu
  // (gdy uzytkownik jest wlasnie na treningu) albo adres z geokodera
  async function handleShareLocation() {
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
      if (status !== 'granted') { Alert.alert(t('chat.locationDenied')); return }
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
      let addressLabel = t('chat.myLocation')
      try {
        const geo = await ExpoLocation.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        const g = geo[0]
        if (g) addressLabel = [g.street, g.city].filter(Boolean).join(', ') || addressLabel
      } catch (e) { }
      const send = (name: string) => sendMediaMessage(
        { location_lat: pos.coords.latitude, location_lng: pos.coords.longitude, location_name: name },
        '📍 ' + name
      )
      const gymName = (myProfile as any)?.gym_name
      if (gymName) {
        Alert.alert(t('chat.locationLabelTitle'), '', [
          { text: '🏋️ ' + gymName, onPress: () => send(gymName) },
          { text: '📍 ' + addressLabel, onPress: () => send(addressLabel) },
          { text: t('common.cancel'), style: 'cancel' },
        ])
      } else {
        send(addressLabel)
      }
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
  }

  function openInMaps(msg: Message) {
    const { location_lat: lat, location_lng: lng, location_name: name } = msg
    if (lat == null || lng == null) return
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name ?? 'Pin')}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(name ?? 'Pin')})`
    Linking.openURL(url).catch(() => { })
  }

  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync()
      if (!perm.granted) { Alert.alert(t('chat.micDenied')); return }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      setRecording(true)
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
  }

  async function stopRecording(send: boolean) {
    const durSec = Math.round((recorderState.durationMillis ?? 0) / 1000)
    setRecording(false)
    try {
      await audioRecorder.stop()
      // Po nagrywaniu wracamy do trybu odtwarzania (iOS inaczej gra po cichu)
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
      if (!send) return
      const uri = audioRecorder.uri
      if (!uri || durSec < 1) return
      setSendingVoice(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const path = `${user.id}/voice_${Date.now()}.m4a`
      const formData = new FormData()
      formData.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: 'audio/m4a', upsert: true })
      if (error) { Alert.alert(t('common.error'), error.message); return }
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      await sendMediaMessage({ audio_url: data.publicUrl, audio_duration: durSec }, '🎤 ' + t('chat.voiceMsg'))
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setSendingVoice(false) }
  }

  // Edycja: tresc laduje do pola, wyslanie nadpisuje wiadomosc
  function startEditing(msg: Message) {
    setReactionTarget(null)
    setReplyTo(null)
    setEditTarget(msg)
    setText(msg.content)
  }

  async function saveEdit() {
    if (!editTarget || !text.trim()) return
    const content = text.trim()
    const editedAt = new Date().toISOString()
    const target = editTarget
    setEditTarget(null)
    setText('')
    setMessages(prev => prev.map(m => m.id === target.id ? { ...m, content, edited_at: editedAt } : m))
    await supabase.from('messages').update({ content, edited_at: editedAt }).eq('id', target.id)
  }

  // Cofniecie wyslania: tresc znika u obu stron (miekkie usuniecie)
  function handleUnsend(msg: Message) {
    setReactionTarget(null)
    Alert.alert(t('chat.unsendTitle'), t('chat.unsendMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.unsend'), style: 'destructive', onPress: async () => {
          const deletedAt = new Date().toISOString()
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '', deleted_at: deletedAt } : m))
          await supabase.from('messages').update({ content: '', deleted_at: deletedAt }).eq('id', msg.id)
        },
      },
    ])
  }

  async function loadReactions(msgs: Message[]) {
    try {
      const ids = msgs.filter(m => !String(m.id).startsWith('temp-')).map(m => m.id)
      const rows = await getMessageReactions(ids)
      const map: Record<string, MessageReaction[]> = {}
      rows.forEach(r => { (map[r.message_id] = map[r.message_id] ?? []).push(r) })
      setReactions(map)
    } catch (e) { }
  }

  async function pickReaction(emoji: string) {
    const msg = reactionTarget
    setReactionTarget(null)
    if (!msg || !myProfile || String(msg.id).startsWith('temp-')) return
    const mine = (reactions[msg.id] ?? []).find(r => r.profile_id === myProfile.id)
    const next = mine?.emoji === emoji ? null : emoji
    // Optymistycznie, realtime i tak zaraz wyrowna
    setReactions(prev => {
      const rest = (prev[msg.id] ?? []).filter(r => r.profile_id !== myProfile.id)
      return { ...prev, [msg.id]: next ? [...rest, { message_id: msg.id, profile_id: myProfile.id, emoji: next }] : rest }
    })
    await setMessageReaction(msg.id, myProfile.id, next)
    // Push do autora wiadomosci (tylko cudze wiadomosci i tylko przy dodaniu)
    if (next && otherProfile && msg.sender_id === otherProfile.id) {
      try {
        const { notifyProfile } = await import('../../lib/notifications')
        notifyProfile(otherProfile.id, `${next} ${myProfile.name}`, t('chat.reactedPush', { emoji: next }), { type: 'message', matchId })
      } catch (e) { }
    }
  }

  async function loadChat() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setMyProfile(me)
      touchLastSeen(me.id)
      const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single()
      if (match?.chat_theme && CHAT_THEMES[match.chat_theme]) setChatTheme(match.chat_theme)
      setIsTrainerChat(!!match?.is_trainer_chat)
      let other: any = null
      if (match) {
        const otherId = match.profile_a_id === me.id ? match.profile_b_id : match.profile_a_id
        const res = await supabase.from('profiles').select('*').eq('id', otherId).single()
        other = res.data
        setOtherProfile(other)
        const blockedIds = await getBlockedIds(me.id)
        setIsBlocked(blockedIds.includes(otherId))
        // Trener: czy podopieczny udostepnil pomiary sylwetki (linijka w naglowku)
        if ((me as any).is_trainer && match?.is_trainer_chat) {
          supabase.from('measurement_shares')
            .select('owner_profile_id')
            .eq('trainer_profile_id', me.id)
            .eq('owner_profile_id', otherId)
            .maybeSingle()
            .then(({ data }) => setClientSharesMeasurements(!!data))
        }
      }
      const { data: msgs } = await supabase.from('messages').select('*').eq('match_id', matchId).order('sent_at', { ascending: true })
      setMessages(msgs ?? [])
      loadReactions(msgs ?? [])
      await markMessagesAsRead(matchId, me.id)
      loadExtras(me, other, msgs ?? [])
    } finally {
      setLoading(false)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200)
    }
  }

  // Wspolna passa, pojedynek i lodolamacze — dogrywane w tle po zaladowaniu czatu
  async function loadExtras(me: any, other: any, msgs: any[]) {
    try {
      const { getDuoStreaks, getDuel, getIcebreakers } = await import('../../lib/supabase')
      if (other) {
        getDuoStreaks(me.id).then(map => setDuoWeeks(map[other.id] ?? 0)).catch(() => { })
        // Czy w tym tygodniu para ma juz wspolny trening? (termin przedluzenia passy)
        const now = new Date()
        const monday = new Date(now)
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
        const mondayStr = monday.toISOString().split('T')[0]
        supabase.from('workouts').select('id', { count: 'exact', head: true })
          .or(`and(creator_id.eq.${me.id},partner_id.eq.${other.id}),and(creator_id.eq.${other.id},partner_id.eq.${me.id})`)
          .gte('workout_date', mondayStr)
          .then(({ count }) => setDuoThisWeek((count ?? 0) > 0))
      }
      const d = await getDuel(String(matchId))
      setDuel(d)
      // Kroki do pojedynku: raportuj wlasne z Health Connect (jesli polaczony)
      if (d && d.status === 'active' && d.metric === 'steps' && d.starts_at) {
        try {
          const { getStepsBetween, isHealthConnected } = await import('../../lib/health')
          if (await isHealthConnected()) {
            const steps = await getStepsBetween(new Date(d.starts_at + 'T00:00:00'), new Date())
            if (steps !== null) {
              const { reportDuelSteps } = await import('../../lib/supabase')
              await reportDuelSteps(d.id, steps)
            }
          }
        } catch (e) { }
      }
      // Lodolamacze AI: przy pustej rozmowie pobieramy od razu (karta na srodku)
      if (msgs.length === 0 && other) fetchIcebreakers(me, other)
    } catch (e) { }
  }

  // Pobiera 3 propozycje pierwszej wiadomosci; uzywane tez przez "Wylosuj inne" i iskierke ✨
  async function fetchIcebreakers(me?: any, other?: any) {
    const m = me ?? myProfile
    const o = other ?? otherProfile
    if (!m || !o || iceLoading) return
    setIceLoading(true)
    try {
      const { getIcebreakers } = await import('../../lib/supabase')
      const LANG_NAMES: Record<string, string> = { pl: 'Polish', en: 'English', de: 'German', fr: 'French', es: 'Spanish', nl: 'Dutch' }
      const langName = LANG_NAMES[i18n.language] ?? 'English'
      const list = await getIcebreakers(m, o, langName)
      setIcebreakers(list)
    } catch (e) { }
    finally { setIceLoading(false) }
  }

  // Iskierka przy polu tekstowym (dostepna takze w trakcie rozmowy)
  function toggleIcePanel() {
    if (!showIcePanel && icebreakers.length === 0) fetchIcebreakers()
    setShowIcePanel(v => !v)
  }

  async function handleCreateDuel() {
    if (!myProfile || !otherProfile || duelBusy) return
    setDuelBusy(true)
    try {
      const { createDuel, getDuel } = await import('../../lib/supabase')
      const result = await createDuel(String(matchId), duelMetric, duelStake.trim(), duelDays)
      if (result.success) {
        setShowDuelModal(false)
        setDuel(await getDuel(String(matchId)))
        const { notifyProfile } = await import('../../lib/notifications')
        notifyProfile(otherProfile.id, `⚔️ ${myProfile.name}`, t('duel.pushChallenge'), { type: 'duel', matchId })
      } else if (result.error === 'duel_exists') {
        Alert.alert('⚔️', t('duel.alreadyExists'))
      } else {
        Alert.alert(t('common.error'))
      }
    } finally { setDuelBusy(false) }
  }

  async function handleRespondDuel(accept: boolean) {
    if (!duel || duelBusy) return
    setDuelBusy(true)
    try {
      const { respondDuel, getDuel } = await import('../../lib/supabase')
      const ok = await respondDuel(duel.id, accept)
      if (ok) {
        setDuel(await getDuel(String(matchId)))
        if (accept && otherProfile && myProfile) {
          const { notifyProfile } = await import('../../lib/notifications')
          notifyProfile(otherProfile.id, `⚔️ ${myProfile.name}`, t('duel.pushAccepted'), { type: 'duel', matchId })
        }
      }
    } finally { setDuelBusy(false) }
  }

  async function sendMessage() {
    if (!text.trim() || !myProfile || isBlocked) return
    if (editTarget) { saveEdit(); return }
    const content = text.trim()
    const replyId = replyTo && !String(replyTo.id).startsWith('temp-') ? replyTo.id : null
    setText('')
    setReplyTo(null)

    // Optymistycznie: dymek pojawia sie od razu, serwer potwierdza w tle
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    const tempMsg = {
      id: tempId, match_id: matchId, sender_id: myProfile.id, content,
      sent_at: new Date().toISOString(), read_at: null, pending: true, reply_to_id: replyId,
    } as unknown as Message
    setMessages(prev => [...prev, tempMsg])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50)

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ match_id: matchId, sender_id: myProfile.id, content, reply_to_id: replyId })
        .select()
        .single()
      if (error) throw error
      if (data) {
        setMessages(prev => {
          // Realtime mogl juz podmienic tymczasowa wiadomosc na prawdziwa
          if (prev.some(m => m.id === data.id)) return prev.filter(m => m.id !== tempId)
          return prev.map(m => m.id === tempId ? data : m)
        })
      }
      if (otherProfile) {
        const { notifyProfile } = await import('../../lib/notifications')
        notifyProfile(otherProfile.id, myProfile.name, content, { type: 'message', matchId })
      }
    } catch (e) {
      // Nie wyszlo - cofnij dymek i przywroc tekst do pola
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(content)
    }
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  }

  // Skok do wiadomosci z wynikow wyszukiwania + chwilowe podswietlenie dymka
  function jumpToMessage(id: string) {
    setSearchMode(false)
    setSearchTerm('')
    const index = messages.findIndex(m => m.id === id)
    if (index < 0) return
    setTimeout(() => {
      try { flatListRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }) } catch (e) { }
    }, 150)
    setHighlightedId(id)
    setTimeout(() => setHighlightedId(null), 2200)
  }

  // Etykieta wiadomosci do cytatow i podgladow (media zamiast pustej tresci)
  function msgPreviewLabel(m?: Message | null): string {
    if (!m || m.deleted_at) return t('chat.deletedMsg')
    if (m.image_url?.includes('giphy')) return 'GIF 🎬'
    if (m.image_url) return '📷 ' + t('chat.photoMsg')
    if (m.audio_url) return '🎤 ' + t('chat.voiceMsg')
    if (m.location_lat != null) return '📍 ' + (m.location_name || t('chat.locationMsg'))
    return m.content
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return t('chat.today') || 'Dzisiaj'
    if (date.toDateString() === yesterday.toDateString()) return t('chat.yesterday') || 'Wczoraj'
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
  }

  function renderMessage({ item, index }: { item: Message; index: number }) {
    const isMe = item.sender_id === myProfile?.id
    const prevMsg = messages[index - 1]
    const showDate = !prevMsg || formatDate(prevMsg.sent_at) !== formatDate(item.sent_at)
    const showAvatar = !isMe && (!messages[index + 1] || messages[index + 1].sender_id !== item.sender_id)

    return (
      <>
        {showDate && (
          <View style={styles.dateDivider}>
            <Text style={styles.dateDividerText}>{formatDate(item.sent_at)}</Text>
          </View>
        )}
        <SwipeableReply
          direction={isMe ? 'left' : 'right'}
          enabled={!(item as any).pending && !item.deleted_at}
          onTrigger={() => setReplyTo(item)}
        >
        <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
          {!isMe && (
            <View style={styles.avatarSpace}>
              {showAvatar ? <Image source={{ uri: otherProfile?.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={styles.msgAvatar} /> : null}
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => !(item as any).pending && !item.deleted_at && setReactionTarget(item)}
            delayLongPress={280}
            style={[styles.bubble, isMe ? [styles.bubbleMe, { backgroundColor: theme.bubbleMe }] : [styles.bubbleOther, { backgroundColor: theme.bubbleOther }], item.deleted_at ? styles.bubbleDeleted : null, item.id === highlightedId ? styles.bubbleHighlighted : null]}
          >
            {!item.deleted_at && item.reply_to_id ? (() => {
              const orig = messages.find(m => m.id === item.reply_to_id)
              const origName = orig ? (orig.sender_id === myProfile?.id ? t('chat.you') : otherProfile?.name ?? '') : ''
              return (
                <View style={[styles.quoteBox, isMe ? styles.quoteBoxMe : styles.quoteBoxOther]}>
                  <Text style={[styles.quoteName, isMe ? styles.quoteNameMe : null]} numberOfLines={1}>{origName}</Text>
                  <Text style={[styles.quoteText, isMe ? styles.quoteTextMe : null]} numberOfLines={2}>
                    {msgPreviewLabel(orig)}
                  </Text>
                </View>
              )
            })() : null}
            {!item.deleted_at && item.story_reply ? (
              <View style={styles.storyReplyTag}>
                <Ionicons name="return-up-forward" size={12} color={isMe ? 'rgba(13,27,46,0.6)' : 'rgba(255,255,255,0.6)'} />
                <Text style={[styles.storyReplyTagText, isMe ? { color: 'rgba(13,27,46,0.6)' } : null]}>{t('chat.storyReplyTag')}</Text>
              </View>
            ) : null}
            {item.deleted_at ? (
              <Text style={[styles.deletedText, isMe ? { color: 'rgba(13,27,46,0.55)' } : null]}>{t('chat.deletedMsg')}</Text>
            ) : item.image_url ? (
              <View>
                <TouchableOpacity onPress={() => setImageViewer(item.image_url!)} activeOpacity={0.85}>
                  <Image source={{ uri: item.image_url }} style={styles.chatImage} />
                </TouchableOpacity>
                {item.content && !item.content.startsWith('📷') && item.content !== 'GIF 🎬' ? (
                  <Text style={[styles.bubbleText, { marginTop: 6 }, isMe ? [styles.bubbleTextMe, { color: theme.onMe }] : styles.bubbleTextOther]}>{item.content}</Text>
                ) : null}
              </View>
            ) : item.audio_url ? (
              <VoiceBubble uri={item.audio_url} duration={item.audio_duration ?? 0} isMe={isMe} />
            ) : item.location_lat != null && item.location_lng != null ? (
              <TouchableOpacity onPress={() => openInMaps(item)} activeOpacity={0.85}>
                <View style={styles.mapWrap} pointerEvents="none">
                  <MapView
                    style={styles.mapPreview}
                    liteMode
                    initialRegion={{ latitude: item.location_lat, longitude: item.location_lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                  >
                    <Marker coordinate={{ latitude: item.location_lat, longitude: item.location_lng }} />
                  </MapView>
                </View>
                <View style={styles.mapLabelRow}>
                  <Ionicons name="location" size={14} color={isMe ? '#0d1b2e' : '#94e336'} />
                  <Text style={[styles.mapLabelText, isMe ? { color: '#0d1b2e' } : null]} numberOfLines={1}>{item.location_name ?? ''}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.bubbleText, isMe ? [styles.bubbleTextMe, { color: theme.onMe }] : styles.bubbleTextOther]}>{item.content}</Text>
            )}
            <View style={styles.msgFooter}>
              {item.edited_at && !item.deleted_at ? (
                <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>{t('chat.edited')} ·</Text>
              ) : null}
              <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>{formatTime(item.sent_at)}</Text>
              {isMe && ((item as any).pending ? (
                <Ionicons name="time-outline" size={13} color="rgba(13,27,46,0.45)" />
              ) : (
                <Ionicons
                  name={item.read_at ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.read_at ? '#0d1b2e' : 'rgba(13,27,46,0.45)'}
                />
              ))}
            </View>
          </TouchableOpacity>
        </View>
        </SwipeableReply>
        {(reactions[item.id] ?? []).length > 0 && (
          <TouchableOpacity
            style={[styles.reactPillsRow, isMe ? styles.reactPillsRowMe : styles.reactPillsRowOther]}
            onPress={() => setWhoTarget(item.id)}
            activeOpacity={0.7}
          >
            {Object.entries(
              (reactions[item.id] ?? []).reduce((acc: Record<string, number>, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc }, {})
            ).map(([emoji, count]) => {
              const mine = (reactions[item.id] ?? []).some(r => r.emoji === emoji && r.profile_id === myProfile?.id)
              return (
                <View key={emoji} style={[styles.reactPill, mine && styles.reactPillMine]}>
                  <Text style={styles.reactPillText}>{emoji} {count > 1 ? count : ''}</Text>
                </View>
              )
            })}
          </TouchableOpacity>
        )}
      </>
    )
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <LinearGradient colors={theme.bg} style={StyleSheet.absoluteFill} />
      {/* Naglowek podaza za motywem: na kolorowych tlach szklana nakladka zamiast sztywnego granatu */}
      <View style={[styles.header, chatTheme !== 'lime' && { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/matches' as any) }} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerProfile}
          onPress={() => otherProfile && router.push({ pathname: '/profile/profile-detail', params: { profileId: otherProfile.id } })}
        >
          <Image source={{ uri: otherProfile?.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={[styles.headerAvatar, { borderColor: theme.bubbleMe + '66' }]} />
          <View>
            <Text style={[styles.headerName, (otherProfile as any)?.is_trainer && { color: '#d4af37' }]}>{otherProfile?.name ?? '...'}</Text>
            {isOnline(otherLastSeen) ? (
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>{t('chat.online')}</Text>
              </View>
            ) : (
              <Text style={styles.headerSub}>{otherProfile?.city ?? ''}</Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSearchMode(v => !v); setSearchTerm('') }} style={{ marginRight: 10 }}>
          <Ionicons name="search" size={22} color={searchMode ? '#94e336' : 'rgba(255,255,255,0.7)'} />
        </TouchableOpacity>
        {/* Pomiary podopiecznego: zloty przycisk, tylko gdy klient dal zgode */}
        {clientSharesMeasurements && otherProfile && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/client-measurements', params: { clientId: otherProfile.id, clientName: otherProfile.name } })}
            style={{ marginRight: 10 }}
          >
            <Ionicons name="body-outline" size={24} color="#f0b429" />
          </TouchableOpacity>
        )}
        {/* Prosba o opinie tylko w rozmowach klient-trener (skrzynka Studia), nie w zwyklych matchach */}
        {(myProfile as any)?.is_trainer && isTrainerChat && otherProfile && (
          <TouchableOpacity onPress={handleAskForReview} disabled={sendingInvite} style={{ marginRight: 10 }}>
            {sendingInvite ? <ActivityIndicator size="small" color="#f0b429" /> : (
              <Ionicons name="star-outline" size={24} color="#f0b429" />
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => otherProfile && router.push({ pathname: '/profile/profile-detail', params: { profileId: otherProfile.id } })}>
          <Ionicons name="information-circle-outline" size={26} color={PRIMARY} />
        </TouchableOpacity>
      </View>

      {/* Wyszukiwarka w rozmowie: pasek + lista trafien (filtrowanie lokalne) */}
      {searchMode && (
        <View>
          <View style={styles.searchBarRow}>
            <Ionicons name="search" size={17} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('chat.searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={searchTerm}
              onChangeText={setSearchTerm}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setSearchMode(false); setSearchTerm('') }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={19} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
          {searchTerm.trim().length >= 2 && (() => {
            const term = searchTerm.trim().toLowerCase()
            const hits = messages
              .filter(m => !m.deleted_at && m.content && m.content.toLowerCase().includes(term))
              .slice()
              .reverse()
              .slice(0, 50)
            return (
              <View style={styles.searchResults}>
                {hits.length === 0 ? (
                  <Text style={styles.searchEmpty}>{t('chat.searchNoResults')}</Text>
                ) : (
                  <FlatList
                    data={hits}
                    keyExtractor={m => 'hit-' + m.id}
                    style={{ maxHeight: 280 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: hit }) => (
                      <TouchableOpacity style={styles.searchHitRow} onPress={() => jumpToMessage(hit.id)}>
                        <Text style={styles.searchHitName}>
                          {hit.sender_id === myProfile?.id ? t('chat.you') : otherProfile?.name ?? ''} · {formatDate(hit.sent_at)} {formatTime(hit.sent_at)}
                        </Text>
                        <Text style={styles.searchHitText} numberOfLines={2}>{hit.content}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            )
          })()}
        </View>
      )}

      {/* Wspolna passa pary — duet plomienia z terminem przedluzenia */}
      {duoWeeks > 0 && myProfile && otherProfile && (
        <LinearGradient
          colors={['rgba(240,180,41,0.16)', 'rgba(255,71,87,0.10)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.duoBanner}
        >
          <View style={styles.duoAvatars}>
            <Image source={{ uri: myProfile.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={styles.duoAvatar} />
            <Image source={{ uri: otherProfile.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={[styles.duoAvatar, { marginLeft: -10 }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.duoBannerTitle}>{'🔥'} {t('duo.bannerTitle', { count: duoWeeks })}</Text>
            <Text style={styles.duoBannerSub}>{duoThisWeek ? t('duo.weekDone') : t('duo.extendHint')}</Text>
          </View>
        </LinearGradient>
      )}

      {/* Baner pojedynku 1v1: przeciaganie liny + zwijana pigulka */}
      {duel && duel.status !== 'declined' && myProfile && (
        duel.status === 'pending' ? (
          <View style={styles.duelBanner}>
            {duel.opponent_id === myProfile.id ? (
              <>
                <Text style={styles.duelTitle}>{'⚔️'} {t('duel.challengedYou', { metric: t('duel.metric_' + duel.metric), days: duel.duration_days })}</Text>
                {duel.stake ? <Text style={styles.duelStake}>{t('duel.stakeLabel')}: {duel.stake}</Text> : null}
                <View style={styles.duelBtnRow}>
                  <TouchableOpacity style={styles.duelAcceptBtn} onPress={() => handleRespondDuel(true)} disabled={duelBusy}>
                    <Text style={styles.duelAcceptText}>{t('duel.accept')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.duelDeclineBtn} onPress={() => handleRespondDuel(false)} disabled={duelBusy}>
                    <Text style={styles.duelDeclineText}>{t('duel.decline')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.duelTitle}>{'⚔️'} {t('duel.waitingForResponse')}</Text>
            )}
          </View>
        ) : (() => {
          const myScore = duel.challenger_id === myProfile.id ? duel.challenger_score : duel.opponent_score
          const theirScore = duel.challenger_id === myProfile.id ? duel.opponent_score : duel.challenger_score
          const total = (myScore ?? 0) + (theirScore ?? 0)
          const myPct = total > 0 ? Math.round(((myScore ?? 0) / total) * 100) : 50
          const daysLeft = duel.ends_at ? Math.max(0, Math.ceil((new Date(String(duel.ends_at).slice(0, 10) + 'T23:59:59').getTime() - Date.now()) / 86400000)) : 0
          const finished = duel.status === 'finished'

          if (!duelExpanded) return (
            <TouchableOpacity style={styles.duelPill} onPress={() => setDuelExpanded(true)}>
              <Text style={styles.duelPillText}>
                {finished && duel.winner_id === myProfile.id ? '🏆' : '⚔️'} <Text style={{ color: '#94e336' }}>{myScore}</Text> : <Text style={{ color: '#ff8a94' }}>{theirScore}</Text>
                {finished ? '' : ` · ⏳ ${daysLeft} ${t('duel.days')}`} <Text style={{ color: 'rgba(255,255,255,0.4)' }}>▾</Text>
              </Text>
            </TouchableOpacity>
          )
          return (
            <TouchableOpacity
              style={[styles.duelBanner, finished && { borderColor: 'rgba(240,180,41,0.5)' }]}
              activeOpacity={0.85}
              onPress={() => setDuelExpanded(false)}
            >
              <Text style={styles.duelTugTitle}>
                {finished
                  ? (duel.winner_id === null ? `${'⚔️'} ${t('duel.draw')}` : duel.winner_id === myProfile.id ? `${'🏆'} ${t('duel.youWon')}` : `${'⚔️'} ${t('duel.youLost')}`)
                  : `${'⚔️'} ${t('duel.metric_' + duel.metric)} · ${daysLeft === 1 ? t('duel.lastDay') : t('duel.daysLeft', { count: daysLeft })}`}
              </Text>
              <View style={styles.duelTugRow}>
                <Image source={{ uri: myProfile.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={[styles.duelTugAvatar, { borderColor: '#94e336' }]} />
                <Text style={[styles.duelTugScore, { color: '#94e336' }]}>{myScore}</Text>
                <View style={styles.duelTugTrack}>
                  <View style={{ flex: myPct, backgroundColor: '#94e336' }} />
                  <View style={{ flex: 100 - myPct, backgroundColor: '#ff4757' }} />
                </View>
                <Text style={[styles.duelTugScore, { color: '#ff8a94' }]}>{theirScore}</Text>
                <Image source={{ uri: otherProfile?.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={[styles.duelTugAvatar, { borderColor: '#ff4757' }]} />
              </View>
              {duel.stake ? <Text style={styles.duelTugStake}>{'🎁'} {t('duel.stakeLabel')}: {duel.stake}</Text> : null}
              <Text style={styles.duelCollapseHint}>{'▴'}</Text>
            </TouchableOpacity>
          )
        })()
      )}

      {/* Przytrzymanie tla (poza dymkami) otwiera opcje rozmowy — jak na Messengerze */}
      <Pressable style={{ flex: 1 }} onLongPress={() => setShowChatOptions(true)} delayLongPress={420}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onScrollToIndexFailed={info => {
          // Daleka wiadomosc jeszcze nie zmierzona — najpierw szacunkowy offset, potem ponowny skok
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
          setTimeout(() => {
            try { flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }) } catch (e) { }
          }, 350)
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Image source={{ uri: otherProfile?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.emptyChatAvatar} />
            <Text style={styles.emptyChatName}>{otherProfile?.name}</Text>
            <Text style={styles.emptyChatText}>{t('chat.emptyChat')}</Text>

            {/* Karta lodolamaczy na srodku pustego czatu */}
            {!isBlocked && (iceLoading || icebreakers.length > 0) && (
              <View style={styles.iceCard}>
                <Text style={styles.iceCardEmoji}>{'💬'}</Text>
                <Text style={styles.iceCardTitle}>{t('chat.iceCardTitle')}</Text>
                {iceLoading ? (
                  <ActivityIndicator color={PRIMARY} style={{ marginVertical: 12 }} />
                ) : (
                  icebreakers.map((ice, i) => (
                    <TouchableOpacity key={i} style={styles.iceChip} onPress={() => setText(ice)}>
                      <Text style={styles.iceChipText}>{ice}</Text>
                    </TouchableOpacity>
                  ))
                )}
                {!iceLoading && (
                  <TouchableOpacity onPress={() => fetchIcebreakers()}>
                    <Text style={styles.iceReroll}>{'🔄'} {t('chat.iceReroll')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      </Pressable>

      {isBlocked ? (
        <View style={[styles.blockedNotice, { paddingBottom: 16 + insets.bottom }]}>
          <Ionicons name="ban-outline" size={18} color="rgba(255,255,255,0.4)" />
          <Text style={styles.blockedNoticeText}>{t('chat.blockedNotice')}</Text>
        </View>
      ) : (
        <>
        {/* Panel lodolamaczy rozwijany iskierka ✨ (w trakcie rozmowy) */}
        {showIcePanel && messages.length > 0 && (
          <View style={styles.icePanel}>
            <Text style={styles.iceLabel}>{'✨'} {t('chat.icebreakersLabel')}</Text>
            {iceLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 10 }} />
            ) : (
              icebreakers.map((ice, i) => (
                <TouchableOpacity key={i} style={styles.iceChip} onPress={() => { setText(ice); setShowIcePanel(false) }}>
                  <Text style={styles.iceChipText}>{ice}</Text>
                </TouchableOpacity>
              ))
            )}
            {!iceLoading && (
              <TouchableOpacity onPress={() => fetchIcebreakers()}>
                <Text style={styles.iceReroll}>{'🔄'} {t('chat.iceReroll')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {otherTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{otherProfile?.name ?? ''} {t('chat.typing')}</Text>
          </View>
        )}
        {replyTo && !editTarget && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyPreviewName}>{t('chat.replyingTo', { name: replyTo.sender_id === myProfile?.id ? t('chat.you') : otherProfile?.name ?? '' })}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>{msgPreviewLabel(replyTo)}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={19} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        )}
        {editTarget && (
          <View style={styles.replyPreview}>
            <View style={[styles.replyPreviewBar, { backgroundColor: '#4fc3f7' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyPreviewName, { color: '#4fc3f7' }]}>{t('chat.editing')}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>{editTarget.content}</Text>
            </View>
            <TouchableOpacity onPress={() => { setEditTarget(null); setText('') }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={19} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        )}
        {recording ? (
          <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom, alignItems: 'center', backgroundColor: chatTheme === 'lime' ? BG_LIGHT : 'rgba(255,255,255,0.07)' }]}>
            <TouchableOpacity onPress={() => stopRecording(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={22} color="#ff6b6b" />
            </TouchableOpacity>
            <View style={styles.recordingPill}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                {t('chat.recording')} {Math.floor((recorderState.durationMillis ?? 0) / 60000)}:{String(Math.floor(((recorderState.durationMillis ?? 0) / 1000) % 60)).padStart(2, '0')}
              </Text>
            </View>
            <TouchableOpacity style={styles.sendBtn} onPress={() => stopRecording(true)} disabled={sendingVoice}>
              {sendingVoice ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        ) : (
        <>
        {/* Rozsuwana karta zalacznikow: aparat, galeria, lokalizacja, GIF, AI */}
        {showAttachMenu && !editTarget && (
          <View style={[styles.attachPanel, chatTheme !== 'lime' && { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
            {[
              { key: 'cam', icon: 'camera' as const, label: t('chat.camera'), onPress: pickFromCamera },
              { key: 'gal', icon: 'images' as const, label: t('chat.gallery'), onPress: pickFromGallery },
              { key: 'loc', icon: 'location' as const, label: t('chat.location'), onPress: () => { toggleAttachMenu(); handleShareLocation() } },
            ].map(a => (
              <TouchableOpacity key={a.key} style={styles.attachTile} onPress={a.onPress}>
                <View style={styles.attachTileIcon}><Ionicons name={a.icon} size={21} color="#94e336" /></View>
                <Text style={styles.attachTileLabel} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.attachTile} onPress={() => { toggleAttachMenu(); openGifPicker() }}>
              <View style={styles.attachTileIcon}><Text style={{ fontSize: 12, fontWeight: '900', color: '#94e336' }}>GIF</Text></View>
              <Text style={styles.attachTileLabel}>GIF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachTile} onPress={() => { toggleAttachMenu(); toggleIcePanel() }}>
              <View style={styles.attachTileIcon}><Text style={{ fontSize: 18 }}>{'✨'}</Text></View>
              <Text style={styles.attachTileLabel}>AI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachTile}
              onPress={() => { toggleAttachMenu(); duel && duel.status !== 'declined' ? Alert.alert('⚔️', t('duel.alreadyExists')) : setShowDuelModal(true) }}
            >
              <View style={styles.attachTileIcon}><Text style={{ fontSize: 18 }}>{'⚔️'}</Text></View>
              <Text style={styles.attachTileLabel} numberOfLines={1}>{t('chat.duelTile')}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom, backgroundColor: chatTheme === 'lime' ? BG_LIGHT : 'rgba(255,255,255,0.07)' }]}>
          {!editTarget && (
            <TouchableOpacity onPress={toggleAttachMenu} style={styles.mediaBtn} disabled={uploadingImage}>
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#94e336" />
              ) : (
                <Ionicons name={showAttachMenu ? 'close-circle' : 'add-circle'} size={27} color="#94e336" />
              )}
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.input}
            placeholder={t('chat.placeholder')}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={500}
          />
          {!text.trim() && !editTarget && (
            <TouchableOpacity onPress={startRecording} style={styles.mediaBtn}>
              <Ionicons name="mic-outline" size={23} color="#94e336" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: theme.bubbleMe }, !text.trim() && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim()}
          >
            <Ionicons name={editTarget ? 'checkmark' : 'send'} size={20} color={theme.onMe} />
          </TouchableOpacity>
        </View>
        </>
        )}
        </>
      )}

      {/* Modal tworzenia pojedynku */}
      <Modal visible={showDuelModal} transparent animationType="slide" onRequestClose={() => setShowDuelModal(false)}>
        <View style={styles.duelOverlay}>
          <View style={styles.duelSheet}>
            <View style={styles.safetyHandle} />
            <Text style={styles.duelModalTitle}>{'⚔️'} {t('duel.createTitle', { name: otherProfile?.name ?? '' })}</Text>

            <Text style={styles.duelLabel}>{t('duel.metricLabel')}</Text>
            <View style={styles.duelChipsRow}>
              {(['workouts', 'steps'] as const).map(m => (
                <TouchableOpacity key={m} style={[styles.duelChip, duelMetric === m && styles.duelChipActive]} onPress={() => setDuelMetric(m)}>
                  <Text style={[styles.duelChipText, duelMetric === m && styles.duelChipTextActive]}>{t('duel.metric_' + m)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {duelMetric === 'steps' && <Text style={styles.duelHint}>{t('duel.stepsHint')}</Text>}

            <Text style={styles.duelLabel}>{t('duel.daysLabel')}</Text>
            <View style={styles.duelChipsRow}>
              {[3, 7, 14].map(d => (
                <TouchableOpacity key={d} style={[styles.duelChip, duelDays === d && styles.duelChipActive]} onPress={() => setDuelDays(d)}>
                  <Text style={[styles.duelChipText, duelDays === d && styles.duelChipTextActive]}>{d} {t('duel.days')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.duelLabel}>{t('duel.stakeInputLabel')}</Text>
            <TextInput
              style={styles.duelInput}
              value={duelStake}
              onChangeText={setDuelStake}
              placeholder={t('duel.stakePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={80}
            />

            <TouchableOpacity style={styles.duelSendBtn} onPress={handleCreateDuel} disabled={duelBusy}>
              {duelBusy ? <ActivityIndicator color="#0d1b2e" /> : (
                <Text style={styles.duelSendBtnText}>{t('duel.send')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowDuelModal(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Jednorazowy arkusz bezpieczenstwa przed pierwszym wspolnym treningiem */}
      <Modal visible={showSafetySheet} transparent animationType="slide" onRequestClose={dismissSafetySheet}>
        <View style={styles.safetyOverlay}>
          <View style={styles.safetySheet}>
            <View style={styles.safetyHandle} />
            <Text style={styles.safetyTitle}>
              {otherProfile?.name ? t('safety.sheetTitleName', { name: otherProfile.name }) : t('safety.sheetTitle')}
            </Text>
            <View style={styles.safetyRule}>
              <Ionicons name="location" size={17} color="#94e336" />
              <Text style={styles.safetyRuleText}>{t('safety.rule1')}</Text>
            </View>
            <View style={styles.safetyRule}>
              <Ionicons name="share-social" size={17} color="#94e336" />
              <Text style={styles.safetyRuleText}>{t('safety.rule2')}</Text>
            </View>
            <View style={styles.safetyRule}>
              <Ionicons name="call" size={17} color="#94e336" />
              <Text style={styles.safetyRuleText}>{t('safety.rule3')}</Text>
            </View>
            <TouchableOpacity style={styles.safetyBtn} onPress={dismissSafetySheet}>
              <Text style={styles.safetyBtnText}>{t('safety.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Opcje rozmowy — przytrzymanie tla (jak na Messengerze) */}
      <Modal visible={showChatOptions} transparent animationType="slide" onRequestClose={() => setShowChatOptions(false)}>
        <TouchableOpacity style={styles.whoOverlay} activeOpacity={1} onPress={() => setShowChatOptions(false)}>
          <View style={styles.whoSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.whoHandle} />
            <TouchableOpacity style={styles.msgActionRow} onPress={() => { setShowChatOptions(false); setShowThemePicker(true) }}>
              <Ionicons name="color-palette-outline" size={20} color="#94e336" />
              <Text style={styles.msgActionText}>{t('chat.themeTitle')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.msgActionRow} onPress={() => { setShowChatOptions(false); setSearchMode(true); setSearchTerm('') }}>
              <Ionicons name="search" size={20} color="#fff" />
              <Text style={styles.msgActionText}>{t('chat.searchMenu')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.msgActionRow, { borderBottomWidth: 0 }]} onPress={() => { setShowChatOptions(false); otherProfile && router.push({ pathname: '/profile/profile-detail', params: { profileId: otherProfile.id } }) }}>
              <Ionicons name="person-outline" size={20} color="#fff" />
              <Text style={styles.msgActionText}>{t('chat.viewProfile')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Wybor motywu rozmowy */}
      <Modal visible={showThemePicker} transparent animationType="slide" onRequestClose={() => setShowThemePicker(false)}>
        <TouchableOpacity style={styles.whoOverlay} activeOpacity={1} onPress={() => setShowThemePicker(false)}>
          <View style={styles.whoSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.whoHandle} />
            <Text style={styles.whoTitle}>{t('chat.themeTitle')}</Text>
            <Text style={styles.themeHint}>{t('chat.themeHint')}</Text>
            <View style={styles.themeGrid}>
              {Object.entries(CHAT_THEMES).map(([key, th]) => (
                <TouchableOpacity key={key} style={styles.themeItem} onPress={() => applyTheme(key)}>
                  <LinearGradient colors={th.bg} style={[styles.themeSwatch, chatTheme === key && styles.themeSwatchActive]}>
                    <View style={[styles.themeSwatchBubble, { backgroundColor: th.bubbleMe }]} />
                  </LinearGradient>
                  <Text style={[styles.themeLabel, chatTheme === key && { color: th.bubbleMe }]}>{th.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Wybor GIF-a (Giphy) */}
      <Modal visible={showGifPicker} transparent animationType="slide" onRequestClose={() => setShowGifPicker(false)}>
        <View style={styles.whoOverlay}>
          <View style={[styles.whoSheet, { maxHeight: '75%' }]}>
            <View style={styles.whoHandle} />
            <View style={styles.gifSearchRow}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.gifSearchInput}
                placeholder={t('chat.gifSearch')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={gifQuery}
                onChangeText={handleGifQuery}
              />
              <TouchableOpacity onPress={() => setShowGifPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            {gifLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={gifResults}
                keyExtractor={g => g.id}
                numColumns={2}
                keyboardShouldPersistTaps="handled"
                columnWrapperStyle={{ gap: 8 }}
                contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                ListEmptyComponent={<Text style={styles.searchEmpty}>{t('chat.searchNoResults')}</Text>}
                renderItem={({ item: gif }) => (
                  <TouchableOpacity style={styles.gifTile} onPress={() => sendGif(gif)} activeOpacity={0.8}>
                    <Image source={{ uri: gif.preview }} style={styles.gifTileImg} />
                  </TouchableOpacity>
                )}
              />
            )}
            <Text style={styles.gifAttribution}>Powered by GIPHY</Text>
          </View>
        </View>
      </Modal>

      {/* Pelny ekran zdjecia z czatu */}
      <Modal visible={!!imageViewer} transparent animationType="fade" onRequestClose={() => setImageViewer(null)}>
        <View style={styles.imageViewerBg}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setImageViewer(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {imageViewer && <Image source={{ uri: imageViewer }} style={styles.imageViewerImg} resizeMode="contain" />}
        </View>
      </Modal>

      {/* Pasek reakcji po przytrzymaniu wiadomosci; "+" rozwija pelna siatke */}
      <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => { setReactionTarget(null); setShowAllEmojis(false) }}>
        <TouchableOpacity style={styles.reactOverlay} activeOpacity={1} onPress={() => { setReactionTarget(null); setShowAllEmojis(false) }}>
          {!showAllEmojis ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={styles.reactBar}>
                {REACTION_EMOJIS.map(emoji => {
                  const mine = reactionTarget && (reactions[reactionTarget.id] ?? []).some(r => r.emoji === emoji && r.profile_id === myProfile?.id)
                  return (
                    <TouchableOpacity key={emoji} style={[styles.reactBarBtn, mine && styles.reactBarBtnMine]} onPress={() => { setShowAllEmojis(false); pickReaction(emoji) }}>
                      <Text style={{ fontSize: 26 }}>{emoji}</Text>
                    </TouchableOpacity>
                  )
                })}
                <TouchableOpacity style={styles.reactMoreBtn} onPress={() => setShowAllEmojis(true)}>
                  <Ionicons name="add" size={22} color="#94e336" />
                </TouchableOpacity>
              </View>
              <View style={styles.msgActions} onStartShouldSetResponder={() => true}>
                <TouchableOpacity style={styles.msgActionRow} onPress={() => { const m = reactionTarget; setReactionTarget(null); if (m) setReplyTo(m) }}>
                  <Ionicons name="arrow-undo-outline" size={18} color="#fff" />
                  <Text style={styles.msgActionText}>{t('chat.reply')}</Text>
                </TouchableOpacity>
                {reactionTarget?.sender_id === myProfile?.id && !reactionTarget?.image_url && !reactionTarget?.audio_url && reactionTarget?.location_lat == null && (
                  <TouchableOpacity style={styles.msgActionRow} onPress={() => reactionTarget && startEditing(reactionTarget)}>
                    <Ionicons name="pencil-outline" size={18} color="#fff" />
                    <Text style={styles.msgActionText}>{t('chat.edit')}</Text>
                  </TouchableOpacity>
                )}
                {reactionTarget?.sender_id === myProfile?.id && (
                  <TouchableOpacity style={[styles.msgActionRow, { borderBottomWidth: 0 }]} onPress={() => reactionTarget && handleUnsend(reactionTarget)}>
                    <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
                    <Text style={[styles.msgActionText, { color: '#ff6b6b' }]}>{t('chat.unsend')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.reactGrid} onStartShouldSetResponder={() => true}>
              {REACTION_EMOJIS_EXTENDED.map(emoji => {
                const mine = reactionTarget && (reactions[reactionTarget.id] ?? []).some(r => r.emoji === emoji && r.profile_id === myProfile?.id)
                return (
                  <TouchableOpacity key={emoji} style={[styles.reactGridBtn, mine && styles.reactBarBtnMine]} onPress={() => { setShowAllEmojis(false); pickReaction(emoji) }}>
                    <Text style={{ fontSize: 25 }}>{emoji}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Kto zareagowal — arkusz z lista osob */}
      <Modal visible={!!whoTarget} transparent animationType="slide" onRequestClose={() => setWhoTarget(null)}>
        <TouchableOpacity style={styles.whoOverlay} activeOpacity={1} onPress={() => setWhoTarget(null)}>
          <View style={styles.whoSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.whoHandle} />
            <Text style={styles.whoTitle}>{t('chat.reactionsTitle')}</Text>
            {(whoTarget ? reactions[whoTarget] ?? [] : []).map(r => {
              const isMine = r.profile_id === myProfile?.id
              const person = isMine ? myProfile : otherProfile
              return (
                <View key={r.profile_id} style={styles.whoRow}>
                  <Image source={{ uri: person?.photo_urls?.[0] ?? 'https://i.pravatar.cc/40' }} style={styles.whoAvatar} />
                  <Text style={styles.whoName}>{isMine ? t('chat.you') : person?.name ?? '...'}</Text>
                  <Text style={{ fontSize: 20 }}>{r.emoji}</Text>
                </View>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: BG_LIGHT, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 12 },
  backBtn: { padding: 4 },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(125,197,46,0.4)' },
  headerName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  messagesList: { padding: 16, paddingBottom: 8 },
  dateDivider: { alignItems: 'center', marginVertical: 12 },
  dateDividerText: { fontSize: 12, color: 'rgba(255,255,255,0.3)', backgroundColor: BG_LIGHT, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  msgRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  avatarSpace: { width: 32, marginRight: 6 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: BG_LIGHT, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#0d1b2e', fontWeight: '500' },
  bubbleTextOther: { color: '#fff' },
  msgTime: { fontSize: 10 },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  msgTimeMe: { color: 'rgba(13,27,46,0.55)' },
  msgTimeOther: { color: 'rgba(255,255,255,0.3)' },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyChatAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, borderWidth: 3, borderColor: PRIMARY },
  emptyChatName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptyChatText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 22 },
  searchBarRow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: BG_LIGHT, marginHorizontal: 14, marginBottom: 8, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14.5, color: '#fff' },
  searchResults: { backgroundColor: BG_LIGHT, marginHorizontal: 14, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  searchEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 16 },
  searchHitRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  searchHitName: { fontSize: 11, fontWeight: '800', color: '#94e336', marginBottom: 2 },
  searchHitText: { fontSize: 13.5, color: 'rgba(255,255,255,0.8)' },
  bubbleHighlighted: { borderWidth: 2, borderColor: '#94e336' },
  chatImage: { width: 210, height: 210, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.2)' },
  imageViewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  imageViewerImg: { width: '100%', height: '80%' },
  mediaBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  themeHint: { fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 14, marginTop: -4 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
  themeItem: { alignItems: 'center', gap: 6, width: 86 },
  themeSwatch: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  themeSwatchActive: { borderWidth: 2.5, borderColor: '#fff' },
  themeSwatchBubble: { width: 22, height: 22, borderRadius: 11 },
  themeLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  attachPanel: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', backgroundColor: BG_LIGHT, paddingVertical: 13, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  attachTile: { alignItems: 'center', gap: 5, width: 56 },
  attachTileIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)', alignItems: 'center', justifyContent: 'center' },
  attachTileLabel: { fontSize: 10.5, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  gifSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  gifSearchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: '#fff' },
  gifTile: { flex: 1, aspectRatio: 1.35, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.25)' },
  gifTileImg: { width: '100%', height: '100%' },
  gifAttribution: { fontSize: 10.5, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 10 },
  mapWrap: { width: 220, height: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)' },
  mapPreview: { width: 220, height: 120 },
  mapLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, maxWidth: 220 },
  mapLabelText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#94e336' },
  recordingPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: BG, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff6b6b' },
  recordingText: { fontSize: 13.5, color: '#fff', fontWeight: '600' },
  storyReplyTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  storyReplyTagText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' },
  quoteBox: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  quoteBoxMe: { borderLeftColor: 'rgba(13,27,46,0.45)', backgroundColor: 'rgba(13,27,46,0.12)' },
  quoteBoxOther: { borderLeftColor: 'rgba(148,227,54,0.6)', backgroundColor: 'rgba(255,255,255,0.05)' },
  quoteName: { fontSize: 11, fontWeight: '800', color: '#94e336', marginBottom: 1 },
  quoteNameMe: { color: 'rgba(13,27,46,0.75)' },
  quoteText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  quoteTextMe: { color: 'rgba(13,27,46,0.6)' },
  deletedText: { fontSize: 14, fontStyle: 'italic', color: 'rgba(255,255,255,0.4)' },
  bubbleDeleted: { opacity: 0.75 },
  msgActions: { backgroundColor: BG_LIGHT, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 220, overflow: 'hidden' },
  msgActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  msgActionText: { fontSize: 14.5, fontWeight: '600', color: '#fff' },
  typingRow: { paddingHorizontal: 18, paddingBottom: 4 },
  typingText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' },
  replyPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BG_LIGHT, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 14, paddingVertical: 8 },
  replyPreviewBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#94e336' },
  replyPreviewName: { fontSize: 11.5, fontWeight: '800', color: '#94e336' },
  replyPreviewText: { fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#94e336' },
  onlineText: { fontSize: 12, color: '#94e336', fontWeight: '600' },
  reactPillsRow: { flexDirection: 'row', gap: 4, marginTop: -6, marginBottom: 10 },
  reactPillsRowMe: { alignSelf: 'flex-end', marginRight: 16 },
  reactPillsRowOther: { alignSelf: 'flex-start', marginLeft: 52 },
  reactPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: BG_LIGHT, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2 },
  reactPillMine: { borderColor: 'rgba(148,227,54,0.55)', backgroundColor: 'rgba(148,227,54,0.12)' },
  reactPillText: { fontSize: 12, color: '#fff' },
  reactOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  reactBar: { flexDirection: 'row', gap: 10, backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.5)', borderRadius: 26, paddingHorizontal: 16, paddingVertical: 10 },
  reactBarBtn: { padding: 4, borderRadius: 18 },
  reactBarBtnMine: { backgroundColor: 'rgba(148,227,54,0.2)' },
  reactMoreBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.4)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  reactGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.5)', borderRadius: 22, padding: 14, marginHorizontal: 28 },
  reactGridBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  whoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  whoSheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  whoHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  whoTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 10 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  whoAvatar: { width: 34, height: 34, borderRadius: 17 },
  whoName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: BG_LIGHT, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 10 },
  blockedNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: BG_LIGHT, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  blockedNoticeText: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  input: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#fff', maxHeight: 100, backgroundColor: BG },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#333' },
  duoBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(240,180,41,0.45)', borderRadius: 14, marginHorizontal: 12, marginTop: 8, paddingVertical: 9, paddingHorizontal: 12 },
  duoAvatars: { flexDirection: 'row' },
  duoAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#f0b429' },
  duoBannerTitle: { fontSize: 12.5, fontWeight: '800', color: '#f0b429' },
  duoBannerSub: { fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  duelBanner: { backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(255,71,87,0.4)', borderRadius: 14, marginHorizontal: 12, marginTop: 8, padding: 12 },
  duelTitle: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  duelStake: { fontSize: 12, color: '#f0b429', marginTop: 4, fontWeight: '600' },
  duelBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  duelAcceptBtn: { flex: 1, backgroundColor: '#94e336', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  duelAcceptText: { fontSize: 13, fontWeight: '800', color: '#0d1b2e' },
  duelDeclineBtn: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  duelDeclineText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  duelPill: { alignSelf: 'center', backgroundColor: BG_LIGHT, borderWidth: 1.5, borderColor: 'rgba(255,71,87,0.5)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 },
  duelPillText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  duelTugTitle: { fontSize: 12.5, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 9 },
  duelTugRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  duelTugAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  duelTugScore: { fontSize: 15, fontWeight: '800' },
  duelTugTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)' },
  duelTugStake: { fontSize: 11.5, color: '#f0b429', fontWeight: '600', textAlign: 'center', marginTop: 8 },
  duelCollapseHint: { fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 },
  iceLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  iceChip: { backgroundColor: 'rgba(148,227,54,0.08)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  iceChipText: { fontSize: 13, color: '#c9f29b', lineHeight: 18 },
  iceCard: { backgroundColor: BG_LIGHT, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)', borderRadius: 16, padding: 16, marginTop: 22, width: '100%' },
  iceCardEmoji: { fontSize: 26, textAlign: 'center' },
  iceCardTitle: { fontSize: 14.5, fontWeight: '700', color: '#fff', textAlign: 'center', marginTop: 4, marginBottom: 12 },
  iceReroll: { fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingVertical: 7 },
  icePanel: { backgroundColor: '#16233a', borderTopWidth: 1, borderTopColor: 'rgba(125,197,46,0.25)', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  iceFab: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  duelOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  duelSheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  duelModalTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 14 },
  duelLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  duelChipsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  duelChip: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: BG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  duelChipActive: { backgroundColor: '#94e336', borderColor: '#94e336' },
  duelChipText: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  duelChipTextActive: { color: BG, fontWeight: '800' },
  duelHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: -6, marginBottom: 10 },
  duelInput: { backgroundColor: BG, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 14 },
  duelSendBtn: { backgroundColor: '#ff4757', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  duelSendBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  safetyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  safetySheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  safetyHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  safetyTitle: { fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16 },
  safetyRule: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  safetyRuleText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 20 },
  safetyBtn: { backgroundColor: '#94e336', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  safetyBtnText: { color: '#0d1b2e', fontSize: 15, fontWeight: '800' },
})
