import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Modal, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Share, Linking
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useTranslation } from 'react-i18next'
import { router, useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import {
  supabase, getMyProfile, getSportsEvents, createSportsEvent,
  joinSportsEvent, leaveSportsEvent, getEventAttendees, deleteSportsEvent
} from '../lib/supabase'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Kazdy sport ma wlasny kolor baneru - ten sam model co karty wyzwan
const SPORT_TYPES = [
  { code: 'running', icon: 'walk', colors: ['#7a3b10', '#c26422'] },
  { code: 'cycling', icon: 'bicycle', colors: ['#4a2570', '#7a42b5'] },
  { code: 'padel', icon: 'tennisball', colors: ['#0f6b46', '#17a06a'] },
  { code: 'pickleball', icon: 'baseball-outline', colors: ['#7a1f4a', '#b53b78'] },
  { code: 'hyrox', icon: 'fitness', colors: ['#5c1010', '#a32020'] },
  { code: 'football', icon: 'football', colors: ['#2d5016', '#4f8422'] },
  { code: 'basketball', icon: 'basketball', colors: ['#7a2410', '#b8441e'] },
  { code: 'tennis', icon: 'tennisball-outline', colors: ['#6b5d10', '#a8921e'] },
  { code: 'swimming', icon: 'water', colors: ['#173f66', '#2e7ab8'] },
  { code: 'other', icon: 'flag', colors: ['#37474f', '#5a7484'] },
]

function getSportColors(sportType: string): [string, string] {
  const s = SPORT_TYPES.find(x => x.code === sportType)
  return (s?.colors as [string, string]) ?? ['#37474f', '#5a7484']
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function nextDayOfWeek(dow: number) {
  const d = new Date()
  const diff = (dow - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d
}

// Szablony szybkiego startu - tapniecie wypelnia caly formularz
const EVENT_TEMPLATES = [
  { key: 'tplRun5k', emoji: '🏃', sport: 'running', time: '09:00', day: 'sunday' },
  { key: 'tplFootball', emoji: '⚽', sport: 'football', time: '18:00', day: 'tomorrow' },
  { key: 'tplPadel', emoji: '🎾', sport: 'padel', time: '19:00', day: 'tomorrow' },
  { key: 'tplHyroxTrain', emoji: '💥', sport: 'hyrox', time: '18:00', day: 'saturday' },
  { key: 'tplPickleball', emoji: '🏓', sport: 'pickleball', time: '17:00', day: 'saturday' },
  { key: 'tplCycling', emoji: '🚴', sport: 'cycling', time: '10:00', day: 'saturday' },
]

function templateDate(day: string): string {
  const now = new Date()
  if (day === 'today') return toDateStr(now)
  if (day === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); return toDateStr(d) }
  if (day === 'saturday') return toDateStr(nextDayOfWeek(6))
  return toDateStr(nextDayOfWeek(0))
}

export default function SportsEventsScreen() {
  const { t } = useTranslation()
  const [myProfile, setMyProfile] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [bigEvents, setBigEvents] = useState<any[]>([])
  const [myEventIds, setMyEventIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [radiusFilter, setRadiusFilter] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'popular' | 'new' | 'soonest'>('soonest')
  const [attendeeAvatars, setAttendeeAvatars] = useState<Record<string, string[]>>({})

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSportType, setNewSportType] = useState('running')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newVenue, setNewVenue] = useState('')
  const [newMaxParticipants, setNewMaxParticipants] = useState('')
  const [newRadiusKm, setNewRadiusKm] = useState('100')
  const [createStage, setCreateStage] = useState<'templates' | 'form'>('templates')
  const [notifyNearby, setNotifyNearby] = useState(true)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showVenueSearch, setShowVenueSearch] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [venueQuery, setVenueQuery] = useState('')
  const [venueResults, setVenueResults] = useState<string[]>([])
  const [venueSearchLoading, setVenueSearchLoading] = useState(false)

  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [attendees, setAttendees] = useState<any[]>([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)

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
        const all = await getSportsEvents((me as any).latitude ?? 0, (me as any).longitude ?? 0)
        setEvents(all)
        // Duze wydarzenia z Ticketmaster (w tle, bez blokowania listy)
        import('../lib/supabase').then(({ getBigEvents }) =>
          getBigEvents((me as any).latitude ?? 0, (me as any).longitude ?? 0).then(setBigEvents)
        ).catch(() => { })
        const { data: mine } = await supabase
          .from('event_attendees').select('event_id').eq('profile_id', me.id)
        setMyEventIds(new Set((mine ?? []).map((m: any) => m.event_id)))
        // Awatary uczestnikow (max 3 na karte)
        const ids = all.map((e: any) => e.id)
        if (ids.length > 0) {
          const { data: attRows } = await supabase
            .from('event_attendees')
            .select('event_id, profiles(photo_urls)')
            .in('event_id', ids)
          const av: Record<string, string[]> = {}
          ;(attRows ?? []).forEach((r: any) => {
            const url = r.profiles?.photo_urls?.[0]
            if (!url) return
            if (!av[r.event_id]) av[r.event_id] = []
            if (av[r.event_id].length < 3) av[r.event_id].push(url)
          })
          setAttendeeAvatars(av)
        }
      }
    } catch (e) {
      console.log('loadData sports-events error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateEvent() {
    if (!myProfile) return
    if (!newTitle.trim()) { Alert.alert(t('events.fillTitle') || 'Please enter a title'); return }
    if (!newDate.trim()) { Alert.alert(t('events.fillDate') || 'Please enter a date'); return }
    if (!newTime.trim()) { Alert.alert(t('events.fillTime') || 'Please enter a time'); return }
    if (!newVenue.trim()) { Alert.alert(t('events.fillVenue') || 'Please enter a venue'); return }

    setCreating(true)
    try {
      let lat = (myProfile as any).latitude ?? 0
      let lng = (myProfile as any).longitude ?? 0
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          lat = loc.coords.latitude
          lng = loc.coords.longitude
        }
      } catch (e) { }

      const radius = Math.min(200, Math.max(1, parseInt(newRadiusKm) || 100))
      const result = await createSportsEvent(
        myProfile.id,
        newTitle.trim(),
        newDescription.trim(),
        newSportType,
        newDate.trim(),
        newTime.trim(),
        newVenue.trim(),
        lat,
        lng,
        newMaxParticipants ? parseInt(newMaxParticipants) : null,
        radius
      )
      if (result.success) {
        // Trener: powiadom obserwujacych o nowym wydarzeniu
        if ((myProfile as any).is_trainer && result.eventId) {
          try {
            const { notifyFollowersNewEvent } = await import('../lib/supabase')
            notifyFollowersNewEvent(myProfile.id, myProfile.name, newTitle.trim(), result.eventId)
          } catch (e) { console.log('notify followers error:', e) }
        }
        // Powiadom matchy w zasiegu o nowym wydarzeniu
        if (notifyNearby) {
          try {
            const { notifyMatchesNearby } = await import('../lib/notifications')
            notifyMatchesNearby(
              myProfile.id, lat, lng, radius,
              '🏃 ' + myProfile.name,
              (t('events.nearbyNotifyBody') || 'utworzył(a) nowe wydarzenie w Twojej okolicy:') + ' „' + newTitle.trim() + '"',
              { type: 'event_new', eventId: result.eventId }
            )
          } catch (e) { }
        }
        setShowCreateModal(false)
        setNewTitle('')
        setNewDescription('')
        setNewDate('')
        setNewTime('')
        setNewVenue('')
        setNewMaxParticipants('')
        await loadData()
        const { checkAndCelebrateBadges } = await import('../lib/badges')
        await checkAndCelebrateBadges(myProfile.id, t)
        Alert.alert('🏃', t('events.created') || 'Event created!')
      } else {
        Alert.alert(t('common.error'))
      }
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  function applyEventTemplate(tpl: any) {
    setNewTitle(t('events.' + tpl.key) || tpl.key)
    setNewSportType(tpl.sport)
    setNewTime(tpl.time)
    setNewDate(templateDate(tpl.day))
    setCreateStage('form')
  }

  // Wyszukiwarka miejsc sportowych w poblizu (Overpass/OSM) - boiska, korty, silownie, baseny
  async function searchVenuesNearby() {
    setVenueSearchLoading(true)
    try {
      let lat: number | null = null
      let lng: number | null = null
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        lat = loc.coords.latitude
        lng = loc.coords.longitude
      }
      if (lat == null || lng == null) { setVenueResults([]); return }

      // Serwerowe wyszukiwanie z cache (Google Places -> Overpass -> Nominatim)
      const { fetchNearbyVenues } = await import('../lib/supabase')
      setVenueResults(await fetchNearbyVenues(lat, lng))
    } catch (e) { setVenueResults([]) }
    finally { setVenueSearchLoading(false) }
  }

  function openVenueSearch() {
    setShowVenueSearch(true)
    if (venueResults.length === 0 && !venueSearchLoading) searchVenuesNearby()
  }

  // AI: "padel jutro o 19 na Mokotowie" -> wypelnione pola formularza
  async function parseWithAI() {
    if (!aiText.trim() || aiParsing) return
    setAiParsing(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai', {
        body: { action: 'parse-event', text: aiText.trim(), today: toDateStr(new Date()) },
      })
      if (error) throw error
      const clean = (data?.content ?? '').replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      if (parsed.sport_type && SPORT_TYPES.some(s => s.code === parsed.sport_type)) setNewSportType(parsed.sport_type)
      if (parsed.event_date) setNewDate(String(parsed.event_date))
      if (parsed.event_time) setNewTime(String(parsed.event_time))
      if (parsed.venue_name) setNewVenue(String(parsed.venue_name))
      if (parsed.title) setNewTitle(String(parsed.title))
    } catch (e) {
      Alert.alert(t('common.error'), t('challenges.aiParseError') || 'Nie udało się rozpoznać opisu — wypełnij pola ręcznie.')
    } finally {
      setAiParsing(false)
    }
  }

  async function handleJoinToggle(eventId: string) {
    if (!myProfile) return
    const isJoined = myEventIds.has(eventId)
    try {
      if (isJoined) {
        await leaveSportsEvent(eventId, myProfile.id)
        setMyEventIds(prev => { const s = new Set(prev); s.delete(eventId); return s })
      } else {
        await joinSportsEvent(eventId, myProfile.id)
        setMyEventIds(prev => new Set(prev).add(eventId))
        const { checkAndCelebrateBadges } = await import('../lib/badges')
        await checkAndCelebrateBadges(myProfile.id, t)
        // Po dolaczeniu: zaproponuj udostepnienie — zapisani przyciagaja kolejnych
        const joinedEvent = events.find((e: any) => e.id === eventId)
        if (joinedEvent) {
          Alert.alert('🎉', t('events.joinedShareAsk'), [
            { text: t('common.share'), onPress: () => handleShareEvent(joinedEvent) },
            { text: 'OK', style: 'cancel' },
          ])
        }
      }
      await loadData()
    } catch (e) {
      Alert.alert(t('common.error'))
    }
  }

  async function openEventDetail(event: any) {
    setSelectedEvent(event)
    setLoadingAttendees(true)
    try {
      const list = await getEventAttendees(event.id)
      setAttendees(list)
    } catch (e) {
      console.log('openEventDetail error:', e)
    } finally {
      setLoadingAttendees(false)
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEvent) return
    Alert.alert(
      t('events.deleteConfirmTitle') || 'Delete event?',
      t('events.deleteConfirmMsg') || 'This will remove the event for all attendees.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteSportsEvent(selectedEvent.id)
            if (success) {
              setSelectedEvent(null)
              await loadData()
            } else {
              Alert.alert(t('common.error'))
            }
          }
        }
      ]
    )
  }

  async function handleShareEvent(event: any) {
    try {
      const link = `https://fitnessswipe.app/event/${event.id}`
      const message = t('events.shareMessage', {
        title: event.title,
        venue: event.venue_name,
        date: event.event_date,
        time: event.event_time,
        link,
      }) || `🏃 Join me for "${event.title}"!\n\n📍 ${event.venue_name}\n📅 ${event.event_date} at ${event.event_time}\n\nJoin here: ${link}`
      await Share.share({ message, title: event.title })
    } catch (e) {
      console.log('Share error:', e)
    }
  }

  function getSportIcon(sportType: string) {
    return SPORT_TYPES.find(s => s.code === sportType)?.icon ?? 'flag'
  }

  function getDaysUntil(eventDate: string) {
    const diff = Math.ceil((new Date(eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diff
  }

  function isNewEvent(createdAt: string) {
    if (!createdAt) return false
    return (Date.now() - new Date(createdAt).getTime()) / 3600000 < 48
  }

  const displayedEvents = events
    .filter(e => activeTab === 'mine' ? myEventIds.has(e.id) : true)
    .filter(e => searchQuery.trim() === '' || e.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .filter(e => radiusFilter === null || e.distance_km == null || e.distance_km <= radiusFilter)
    .sort((a, b) => {
      if (sortBy === 'popular') return (b.attendee_count ?? 0) - (a.attendee_count ?? 0)
      if (sortBy === 'new') return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      return new Date(a.event_date + 'T' + (a.event_time || '00:00')).getTime() - new Date(b.event_date + 'T' + (b.event_time || '00:00')).getTime()
    })

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('events.title') || 'Sports Events'}</Text>
          <Text style={styles.headerSubtitle}>{t('events.subtitle') || 'Local races, matches & meetups'}</Text>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => { setCreateStage('templates'); setShowCreateModal(true) }}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabSwitch}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]} onPress={() => setActiveTab('all')}>
          <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>{t('challenges.allChallenges') || 'All'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'mine' && styles.tabBtnActive]} onPress={() => setActiveTab('mine')}>
          <Text style={[styles.tabBtnText, activeTab === 'mine' && styles.tabBtnTextActive]}>{t('events.myEvents') || 'My events'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('events.searchPlaceholder') || 'Search events...'}
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

      {/* Duze wydarzenia z okolicy (Ticketmaster) */}
      {activeTab === 'all' && bigEvents.length > 0 && (
        <View style={styles.bigEventsSection}>
          <View style={styles.bigEventsHeader}>
            <Text style={styles.bigEventsTitle}>{'🎟️'} {t('events.bigNearby')}</Text>
            <TouchableOpacity onPress={() => router.push('/big-events' as any)}>
              <Text style={styles.bigEventsSeeAll}>{t('events.seeAll')} →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bigEventsRow}>
            {bigEvents.map((be: any) => (
              <TouchableOpacity
                key={be.id}
                style={styles.bigEventCard}
                activeOpacity={0.85}
                onPress={() => be.url && Linking.openURL(be.url).catch(() => { })}
              >
                {be.image ? (
                  <Image source={{ uri: be.image }} style={styles.bigEventImage} />
                ) : (
                  <View style={[styles.bigEventImage, { backgroundColor: '#1a2a44' }]} />
                )}
                <LinearGradient colors={['transparent', 'rgba(13,27,46,0.95)']} style={styles.bigEventShade} />
                <View style={styles.bigEventInfo}>
                  <Text style={styles.bigEventName} numberOfLines={1}>{be.name}</Text>
                  <Text style={styles.bigEventMeta} numberOfLines={1}>
                    {be.date}{be.venue ? ` · ${be.venue}` : ''}{be.city ? ` (${be.city})` : ''}
                  </Text>
                  <Text style={styles.bigEventTickets}>{t('events.tickets')} →</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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
          { code: 'soonest', label: '📅 ' + (t('events.sortSoonest') || 'Najbliższe') },
          { code: 'popular', label: '🔥 ' + (t('challenges.sortPopular') || 'Popularne') },
          { code: 'new', label: '✨ ' + (t('challenges.sortNew') || 'Nowe') },
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
        {displayedEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-outline" size={36} color={PRIMARY} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'mine'
                ? (t('events.noneJoined') || "You haven't joined any events yet")
                : (t('events.noneYet') || 'No events yet')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t('events.createFirst') || 'Create the first one and invite others to join!'}
            </Text>
          </View>
        ) : (
          displayedEvents.map((event) => {
            const isJoined = myEventIds.has(event.id)
            const daysUntil = getDaysUntil(event.event_date)
            const urgent = daysUntil >= 0 && daysUntil <= 1
            const attendeeCount = event.attendee_count ?? 0
            const isFull = !!event.max_participants && attendeeCount >= event.max_participants
            const avatars = attendeeAvatars[event.id] ?? []
            const daysLabel = daysUntil < 0
              ? (t('challenges.ended') || 'Ended')
              : daysUntil === 0
                ? (t('events.today') || 'Dzisiaj')
                : daysUntil === 1
                  ? (t('events.tomorrow') || 'Jutro')
                  : `${daysUntil} ${t('challenges.daysShort') || 'dni'}`
            return (
              <TouchableOpacity key={event.id} style={styles.bannerCard} onPress={() => openEventDetail(event)} activeOpacity={0.85}>
                <LinearGradient colors={getSportColors(event.sport_type)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bannerTop}>
                  <Ionicons name={getSportIcon(event.sport_type) as any} size={76} color="rgba(255,255,255,0.13)" style={styles.bannerGhostIcon} />
                  <View style={styles.bannerTopRow}>
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{(t('events.sportTypes.' + event.sport_type) || event.sport_type).toUpperCase()}</Text>
                    </View>
                    {isNewEvent(event.created_at) && (
                      <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>{t('challenges.new') || 'NEW'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <View style={[styles.daysPill, urgent && styles.daysPillUrgent]}>
                      <Ionicons name="calendar-outline" size={11} color={urgent ? '#ff8080' : 'rgba(255,255,255,0.85)'} />
                      <Text style={[styles.daysPillText, urgent && styles.daysPillTextUrgent]}>{daysLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.bannerTitle} numberOfLines={1}>{event.title}</Text>
                  <Text style={styles.bannerSubtitle} numberOfLines={1}>
                    📍 {event.venue_name} · {event.event_date} {event.event_time}
                  </Text>
                </LinearGradient>
                <View style={styles.bannerBottom}>
                  {avatars.length > 0 ? (
                    <View style={styles.avatarsStack}>
                      {avatars.map((u, idx) => (
                        <Image key={idx} source={{ uri: u }} style={[styles.stackAvatar, idx > 0 && { marginLeft: -8 }]} />
                      ))}
                      <Text style={styles.stackCount}>{attendeeCount}{event.max_participants ? '/' + event.max_participants : ''}</Text>
                    </View>
                  ) : (
                    <View style={styles.avatarsStack}>
                      <Ionicons name="people-outline" size={15} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.stackCount}>{attendeeCount}{event.max_participants ? '/' + event.max_participants : ''}</Text>
                    </View>
                  )}
                  {event.distance_km != null && (
                    <Text style={styles.bannerDistance}>
                      <Ionicons name="navigate-outline" size={11} color={LIME} /> {event.distance_km < 1 ? '< 1 km' : Math.round(event.distance_km) + ' km'}
                    </Text>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={styles.shareBtn} onPress={() => handleShareEvent(event)}>
                    <Ionicons name="share-social-outline" size={17} color="rgba(255,255,255,0.55)" />
                  </TouchableOpacity>
                  {isJoined ? (
                    <TouchableOpacity style={styles.joinedPill} onPress={() => handleJoinToggle(event.id)}>
                      <Ionicons name="checkmark" size={14} color={LIME} />
                      <Text style={styles.joinedPillText}>{t('events.joined') || 'Biorę udział'}</Text>
                    </TouchableOpacity>
                  ) : isFull ? (
                    <View style={styles.fullPill}>
                      <Text style={styles.fullPillText}>{t('events.full') || 'Pełne'}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.joinPill} onPress={() => handleJoinToggle(event.id)}>
                      <Text style={styles.joinPillText}>{t('challenges.joinBtn') || 'Dołącz'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* MODAL: Create Event */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <View style={styles.createModal}>
            <View style={styles.modalHeader}>
              {createStage === 'form' && (
                <TouchableOpacity onPress={() => setCreateStage('templates')} style={{ marginRight: 10 }}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
              )}
              <Text style={styles.modalTitle}>{t('events.newEvent') || 'New Event'}</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {createStage === 'templates' ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>{t('challenges.startFromTemplate') || 'Zacznij od szablonu'}</Text>
                <View style={styles.templatesGrid}>
                  {EVENT_TEMPLATES.map(tpl => (
                    <TouchableOpacity key={tpl.key} style={styles.templateTileWrap} onPress={() => applyEventTemplate(tpl)} activeOpacity={0.85}>
                      <LinearGradient colors={getSportColors(tpl.sport)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.templateTile}>
                        <Text style={{ fontSize: 20 }}>{tpl.emoji}</Text>
                        <Text style={styles.templateTitle} numberOfLines={2}>{t('events.' + tpl.key) || tpl.key}</Text>
                        <Text style={styles.templateMeta}>{tpl.time}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                  {/* Wlasne od zera - rownorzedny kafel z przerywana ramka */}
                  <TouchableOpacity
                    style={styles.templateTileWrap}
                    activeOpacity={0.85}
                    onPress={() => {
                      setNewTitle(''); setNewDate(''); setNewTime(''); setNewVenue(''); setNewSportType('running'); setAiText('')
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
                <LinearGradient colors={getSportColors(newSportType)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bannerTop}>
                  <Ionicons name={getSportIcon(newSportType) as any} size={56} color="rgba(255,255,255,0.13)" style={styles.bannerGhostIcon} />
                  <View style={styles.bannerTopRow}>
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{(t('events.sportTypes.' + newSportType) || newSportType).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {!!newDate && (
                      <View style={styles.daysPill}>
                        <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.85)" />
                        <Text style={styles.daysPillText}>{newDate}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.bannerTitle} numberOfLines={1}>{newTitle || '…'}</Text>
                  <Text style={styles.bannerSubtitle} numberOfLines={1}>
                    📍 {newVenue || '?'}{newTime ? ' · ' + newTime : ''}
                  </Text>
                </LinearGradient>
              </View>

              {/* AI: opisz jednym zdaniem, reszta wypelni sie sama */}
              <View style={styles.aiParseBox}>
                <TextInput
                  style={styles.aiParseInput}
                  placeholder={'✨ ' + (t('events.aiDescribe') || 'np. „padel jutro o 19:00 na Mokotowie"')}
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

              <Text style={styles.label}>{t('events.titleLabel') || 'Title'}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('events.titlePlaceholder') || 'e.g. Sunday Morning 5K Run'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={styles.label}>{t('events.sportType') || 'Sport'}</Text>
              <View style={styles.typeTilesGrid}>
                {SPORT_TYPES.map(s => {
                  const active = newSportType === s.code
                  return (
                    <TouchableOpacity
                      key={s.code}
                      style={styles.typeTileWrap}
                      activeOpacity={0.85}
                      onPress={() => setNewSportType(s.code)}
                    >
                      <LinearGradient
                        colors={getSportColors(s.code)}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={[styles.typeTile, active ? styles.typeTileActive : styles.typeTileInactive]}
                      >
                        {active && (
                          <View style={styles.typeTileCheck}>
                            <Ionicons name="checkmark" size={11} color={BG} />
                          </View>
                        )}
                        <Ionicons name={s.icon as any} size={20} color="#fff" />
                        <Text style={styles.typeTileText} numberOfLines={1}>
                          {t('events.sportTypes.' + s.code) || s.code}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Data: szybkie chipy + kalendarz */}
              <Text style={styles.label}>{t('events.date') || 'Date'}{newDate ? `: ${newDate}` : ''}</Text>
              <View style={styles.quickChipsRow}>
                {([
                  { label: t('events.today') || 'Dziś', value: templateDate('today') },
                  { label: t('events.tomorrow') || 'Jutro', value: templateDate('tomorrow') },
                  { label: t('events.saturday') || 'Sobota', value: templateDate('saturday') },
                  { label: t('events.sunday') || 'Niedziela', value: templateDate('sunday') },
                ]).map(d => (
                  <TouchableOpacity
                    key={d.label}
                    style={[styles.quickChip, newDate === d.value && styles.quickChipActive]}
                    onPress={() => setNewDate(d.value)}
                  >
                    <Text style={[styles.quickChipText, newDate === d.value && styles.quickChipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.quickChip} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickChipText}> {t('events.otherDate') || 'Inna'}</Text>
                </TouchableOpacity>
              </View>

              {/* Godzina: szybkie chipy + zegar */}
              <Text style={styles.label}>{t('events.time') || 'Time'}{newTime ? `: ${newTime}` : ''}</Text>
              <View style={styles.quickChipsRow}>
                {['09:00', '17:00', '18:00', '19:00'].map(tm => (
                  <TouchableOpacity
                    key={tm}
                    style={[styles.quickChip, newTime === tm && styles.quickChipActive]}
                    onPress={() => setNewTime(tm)}
                  >
                    <Text style={[styles.quickChipText, newTime === tm && styles.quickChipTextActive]}>{tm}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.quickChip} onPress={() => setShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickChipText}> {t('trainingStatus.otherTime') || 'Inna…'}</Text>
                </TouchableOpacity>
              </View>

              {/* Miejsce z wyszukiwarka */}
              <Text style={styles.label}>{t('events.venue') || 'Venue / Location'}</Text>
              <View style={styles.venueRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t('events.venuePlaceholder') || 'e.g. Vondelpark, Amsterdam'}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={newVenue}
                  onChangeText={setNewVenue}
                />
                <TouchableOpacity style={styles.venueSearchBtn} onPress={openVenueSearch}>
                  <Ionicons name="search" size={18} color={LIME} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('events.descriptionLabel') || 'Description (optional)'}</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder={t('events.descriptionPlaceholder') || 'Add details, pace, what to bring...'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />

              <Text style={styles.label}>{t('events.maxParticipants') || 'Max participants (optional)'}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('events.unlimited') || 'Unlimited'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newMaxParticipants}
                onChangeText={setNewMaxParticipants}
                keyboardType="numeric"
              />

              {/* Zasieg widocznosci */}
              <Text style={styles.label}>{t('challenges.radiusLabel') || 'Visible within (km)'}</Text>
              <View style={styles.quickChipsRow}>
                {['10', '50', '100', '200'].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.quickChip, newRadiusKm === r && styles.quickChipActive]}
                    onPress={() => setNewRadiusKm(r)}
                  >
                    <Text style={[styles.quickChipText, newRadiusKm === r && styles.quickChipTextActive]}>{r} km</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Powiadom matchy w okolicy */}
              <TouchableOpacity style={styles.notifyRow} onPress={() => setNotifyNearby(v => !v)}>
                <Ionicons name={notifyNearby ? 'notifications' : 'notifications-off-outline'} size={18} color={notifyNearby ? LIME : 'rgba(255,255,255,0.35)'} />
                <Text style={styles.notifyRowText}>{t('challenges.notifyNearby') || 'Powiadom matchy w pobliżu'}</Text>
                <Ionicons name={notifyNearby ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={notifyNearby ? LIME : 'rgba(255,255,255,0.3)'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
                onPress={handleCreateEvent}
                disabled={creating}
              >
                <Text style={styles.submitBtnText}>
                  {creating ? t('common.loading') : (t('events.create') || 'Create Event')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={newDate ? new Date(newDate + 'T12:00:00') : new Date()}
                mode="date"
                minimumDate={new Date()}
                onChange={(e: any, d?: Date) => { setShowDatePicker(false); if (d) setNewDate(toDateStr(d)) }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={(() => { const d = new Date(); if (newTime) { const [h, m] = newTime.split(':').map(Number); if (!isNaN(h)) d.setHours(h, isNaN(m) ? 0 : m) } return d })()}
                mode="time"
                is24Hour
                onChange={(e: any, d?: Date) => { setShowTimePicker(false); if (d) setNewTime(pad(d.getHours()) + ':' + pad(d.getMinutes())) }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Wyszukiwarka miejsc */}
      <Modal visible={showVenueSearch} transparent animationType="slide" onRequestClose={() => setShowVenueSearch(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.venueSheet}>
            <Text style={styles.venueSheetTitle}>{t('events.searchVenue') || 'Szukaj miejsca w pobliżu'}</Text>
            <TextInput
              style={styles.input}
              value={venueQuery}
              onChangeText={setVenueQuery}
              placeholder={t('events.venuePlaceholder') || 'Filtruj po nazwie…'}
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            {venueSearchLoading ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 300, marginTop: 10 }} keyboardShouldPersistTaps="handled">
                {venueQuery.trim().length > 0 && (
                  <TouchableOpacity style={styles.venueRowItem} onPress={() => { setNewVenue(venueQuery.trim()); setShowVenueSearch(false); setVenueQuery('') }}>
                    <Ionicons name="add-circle-outline" size={18} color={LIME} />
                    <Text style={styles.venueRowText}>{(t('trainingStatus.useName') || 'Użyj')}: „{venueQuery.trim()}"</Text>
                  </TouchableOpacity>
                )}
                {venueResults.filter(v => v.toLowerCase().includes(venueQuery.trim().toLowerCase())).map(name => (
                  <TouchableOpacity key={name} style={styles.venueRowItem} onPress={() => { setNewVenue(name); setShowVenueSearch(false); setVenueQuery('') }}>
                    <Ionicons name="location-outline" size={18} color={PRIMARY} />
                    <Text style={styles.venueRowText}>{name}</Text>
                  </TouchableOpacity>
                ))}
                {venueResults.length === 0 && (
                  <Text style={styles.venueEmpty}>{t('profile.gymSearchNone') || 'Nie znaleziono miejsc w pobliżu'}</Text>
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.venueCancel} onPress={() => { setShowVenueSearch(false); setVenueQuery('') }}>
              <Text style={styles.venueCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: Event Detail */}
      <Modal visible={!!selectedEvent} animationType="slide" transparent onRequestClose={() => setSelectedEvent(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedEvent?.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => handleShareEvent(selectedEvent)}>
                  <Ionicons name="share-social-outline" size={22} color="#00aaff" />
                </TouchableOpacity>
                {selectedEvent?.creator_id === myProfile?.id && (
                  <TouchableOpacity onPress={handleDeleteEvent}>
                    <Ionicons name="trash-outline" size={22} color="#ff5050" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setSelectedEvent(null)}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedEvent?.description ? (
                <Text style={styles.detailDescription}>{selectedEvent.description}</Text>
              ) : null}

              <View style={styles.detailInfoCard}>
                <View style={styles.detailInfoRow}>
                  <Ionicons name={getSportIcon(selectedEvent?.sport_type) as any} size={20} color={PRIMARY} />
                  <Text style={styles.detailInfoText}>{t('events.sportTypes.' + selectedEvent?.sport_type) || selectedEvent?.sport_type}</Text>
                </View>
                <View style={styles.detailInfoRow}>
                  <Ionicons name="calendar-outline" size={20} color={PRIMARY} />
                  <Text style={styles.detailInfoText}>{selectedEvent?.event_date} · {selectedEvent?.event_time}</Text>
                </View>
                <View style={styles.detailInfoRow}>
                  <Ionicons name="location-outline" size={20} color={PRIMARY} />
                  <Text style={styles.detailInfoText}>{selectedEvent?.venue_name}</Text>
                </View>
              </View>

              <Text style={styles.participantsTitle}>
                {t('events.attendees') || 'Attendees'} ({attendees.length}{selectedEvent?.max_participants ? '/' + selectedEvent.max_participants : ''})
              </Text>

              {loadingAttendees ? (
                <ActivityIndicator color={PRIMARY} style={{ marginTop: 20 }} />
              ) : (
                attendees.map((a) => (
                  <View key={a.id} style={styles.attendeeRow}>
                    <Image
                      source={{ uri: a.profiles?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }}
                      style={styles.attendeeAvatar}
                    />
                    <Text style={styles.attendeeName}>{a.profiles?.name ?? '...'}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingTop: 55, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  bigEventsSection: { marginBottom: 10 },
  bigEventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  bigEventsTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 },
  bigEventsSeeAll: { fontSize: 11.5, fontWeight: '800', color: '#94e336' },
  bigEventsRow: { paddingHorizontal: 16, gap: 10 },
  bigEventCard: { width: 230, height: 120, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1a2a44' },
  bigEventImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  bigEventShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  bigEventInfo: { position: 'absolute', left: 10, right: 10, bottom: 8 },
  bigEventName: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  bigEventMeta: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  bigEventTickets: { fontSize: 11, fontWeight: '800', color: '#94e336', marginTop: 3 },
  createBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },

  tabSwitch: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabBtnActive: { backgroundColor: PRIMARY },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  tabBtnTextActive: { color: '#fff' },

  searchRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 12 },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 },
  filterIconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(125,197,46,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(125,197,46,0.25)' },
  filterIconBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  radiusFilterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginHorizontal: 20, marginBottom: 12 },
  radiusFilterLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginRight: 4 },
  radiusFilterChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  radiusFilterChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  radiusFilterChipText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  radiusFilterChipTextActive: { color: '#fff' },

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
  shareBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  joinPill: { backgroundColor: LIME, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  joinPillText: { fontSize: 12, fontWeight: '800', color: BG },
  joinedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(148,227,54,0.15)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.4)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  joinedPillText: { fontSize: 12, fontWeight: '700', color: LIME },
  fullPill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  fullPillText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  createModal: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  detailModal: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff', flex: 1, marginRight: 12 },

  label: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)' },

  templatesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateTileWrap: { width: '48%', flexGrow: 1 },
  templateTile: { borderRadius: 14, padding: 12, minHeight: 84, justifyContent: 'space-between' },
  templateTitle: { fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 6 },
  templateMeta: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  customTile: { borderRadius: 14, borderWidth: 2, borderColor: 'rgba(148,227,54,0.45)', borderStyle: 'dashed', padding: 12, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6 },
  customTilePlus: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(148,227,54,0.15)', alignItems: 'center', justifyContent: 'center' },
  customTileText: { fontSize: 12, fontWeight: '700', color: LIME, textAlign: 'center' },
  previewLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginTop: 4, marginBottom: 6, textTransform: 'uppercase' },
  aiParseBox: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  aiParseInput: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.35)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, color: '#fff', backgroundColor: 'rgba(148,227,54,0.06)' },
  aiParseBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  quickChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  quickChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  quickChipActive: { backgroundColor: 'rgba(148,227,54,0.15)', borderColor: LIME },
  quickChipText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  quickChipTextActive: { color: LIME },
  venueRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  venueSearchBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.35)', alignItems: 'center', justifyContent: 'center' },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginTop: 16 },
  notifyRowText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#fff' },
  venueSheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '75%' },
  venueSheetTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  venueRowItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  venueRowText: { fontSize: 14, color: '#fff', flex: 1 },
  venueEmpty: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 20 },
  venueCancel: { marginTop: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  venueCancelText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  typeTilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeTileWrap: { width: '31%', flexGrow: 1 },
  typeTile: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent' },
  typeTileInactive: { opacity: 0.55 },
  typeTileActive: { borderColor: LIME },
  typeTileCheck: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  typeTileText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  submitBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 8 },
  submitBtnDisabled: { backgroundColor: '#555' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  detailDescription: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginBottom: 16 },
  detailInfoCard: { backgroundColor: 'rgba(125,197,46,0.08)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(125,197,46,0.25)', marginBottom: 16, gap: 12 },
  detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailInfoText: { fontSize: 14, color: '#fff', fontWeight: '600' },

  participantsTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  attendeeAvatar: { width: 36, height: 36, borderRadius: 18 },
  attendeeName: { fontSize: 14, fontWeight: '600', color: '#fff' },
})
