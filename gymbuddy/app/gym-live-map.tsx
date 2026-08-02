import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Modal, Dimensions, Alert
} from 'react-native'
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getMyProfile, getActiveGymStatuses, groupStatusesByGym, supabase, incrementStatusView, reportUser } from '../lib/supabase'

// Jeden slajd relacji: zdjecie (stary trik z rozmytym tlem) albo wideo.
// Osobny komponent na osobe, zeby kazda instancja miala swoj wlasny, stabilny
// hook odtwarzacza (useVideoPlayer nie moze byc wolany w petli .map() rodzica).
function StoryMediaItem({ person, isActive, muted }: { person: any; isActive: boolean; muted: boolean }) {
  const videoUrl = person.video_url || null
  const player = useVideoPlayer(videoUrl, p => { p.loop = true })
  useEffect(() => {
    if (!videoUrl) return
    player.muted = muted
    if (isActive) player.play(); else player.pause()
  }, [isActive, muted, videoUrl])

  if (videoUrl) {
    return <VideoView player={player} style={[styles.storyImage, !isActive && styles.storyImageHidden]} contentFit="contain" nativeControls={false} />
  }
  const uri = person.status_photo_url || person.profiles?.photo_urls?.[0] || 'https://i.pravatar.cc/400'
  return (
    <View style={[styles.storyImage, !isActive && styles.storyImageHidden]}>
      <Image source={{ uri }} style={styles.storyImage} resizeMode="cover" blurRadius={30} />
      <View style={[styles.storyImage, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <Image source={{ uri }} style={styles.storyImage} resizeMode="contain" />
    </View>
  )
}

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const CARD_W = SCREEN_W * 0.62

// Ciemny styl mapy Google (Android); iOS uzywa userInterfaceStyle="dark"
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa3bf' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1b2e' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#26374f' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7f99' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
]

export default function GymLiveMapScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const locationRequested = useRef(false)
  const [myProfile, setMyProfile] = useState<any>(null)
  const [gymGroups, setGymGroups] = useState<any[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedGym, setSelectedGym] = useState<any>(null)
  const [isLive, setIsLive] = useState(false)
  const [togglingLive, setTogglingLive] = useState(false)
  const [liveStatusId, setLiveStatusId] = useState<string | null>(null)
  const [storyIndex, setStoryIndex] = useState<number | null>(null)
  const [myReactions, setMyReactions] = useState<Record<string, string>>({})
  const [storyMuted, setStoryMuted] = useState(false)
  const [reportingStory, setReportingStory] = useState(false)
  const [liveExpiresAt, setLiveExpiresAt] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const touchStart = useRef({ x: 0, y: 0 })
  const mapRef = useRef<MapView>(null)
  const carouselRef = useRef<ScrollView>(null)

  // Licznik czasu do konca sesji live (auto-wylaczenie po 4h)
  useEffect(() => {
    if (!isLive) return
    const iv = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(iv)
  }, [isLive])

  const liveTimeLeft = (() => {
    if (!isLive || !liveExpiresAt) return null
    const diff = new Date(liveExpiresAt).getTime() - nowTick
    if (diff <= 0) return null
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return `${h}h ${m}m`
  })()

  // Tap w marker: centruje mape i przewija karuzele do karty tej silowni
  function focusGym(index: number) {
    const g = gymGroups[index]
    if (!g) return
    mapRef.current?.animateToRegion({ latitude: g.latitude, longitude: g.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 400)
    carouselRef.current?.scrollTo({ x: index * (CARD_W + 10), animated: true })
  }

  const storyPeople: any[] = selectedGym?.people ?? []
  const REACTION_EMOJIS = ['💪', '🔥', '👊']

  // Wczytaj moje reakcje na statusy osob z wybranej silowni
  useEffect(() => {
    if (!selectedGym || !myProfile) return
    const ids = storyPeople.map(p => p.profile_id)
    if (ids.length === 0) return
    supabase
      .from('status_reactions')
      .select('status_profile_id, emoji')
      .eq('reactor_id', myProfile.id)
      .in('status_profile_id', ids)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { map[r.status_profile_id] = r.emoji })
        setMyReactions(map)
      })
  }, [selectedGym, myProfile])

  async function reactToStatus(statusProfileId: string, emoji: string) {
    if (!myProfile) return
    const current = myReactions[statusProfileId]
    if (current === emoji) {
      // Ponowne tapniecie tej samej reakcji = cofniecie
      setMyReactions(prev => { const copy = { ...prev }; delete copy[statusProfileId]; return copy })
      await supabase.from('status_reactions').delete()
        .eq('status_profile_id', statusProfileId).eq('reactor_id', myProfile.id)
    } else {
      setMyReactions(prev => ({ ...prev, [statusProfileId]: emoji }))
      await supabase.from('status_reactions').upsert(
        { status_profile_id: statusProfileId, reactor_id: myProfile.id, emoji },
        { onConflict: 'status_profile_id,reactor_id' }
      )
    }
  }

  // Zalicz wyswietlenie statusu przy kazdej zmianie ogladanej osoby
  useEffect(() => {
    if (storyIndex != null && myProfile && storyPeople[storyIndex]) {
      incrementStatusView(storyPeople[storyIndex].profile_id, myProfile.id)
    }
  }, [storyIndex])

  // Zgloszenie relacji ogladanej w przegladarce stories — dostepne bezposrednio
  // przy tresci, nie tylko z poziomu profilu (wymog moderacji UGC)
  async function handleReportStory() {
    if (storyIndex == null || !storyPeople[storyIndex]) return
    const person = storyPeople[storyIndex]
    Alert.alert(t('reportBlock.reportStatusTitle'), t('reportBlock.reportStatusMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reportBlock.report'), style: 'destructive', onPress: async () => {
          setReportingStory(true)
          try {
            if (!myProfile) return
            const kind = person.video_url ? 'video' : 'photo'
            await reportUser(myProfile.id, person.profile_id, 'inappropriate_content', `status_${kind}:${person.profile_id}:${Date.now()}`)
            Alert.alert('✅', t('reportBlock.reportedSuccess'))
          } catch (e: any) {
            Alert.alert(t('common.error'), e?.message ?? '')
          } finally { setReportingStory(false) }
        }
      }
    ])
  }

  function handleStoryTap(e: any, dir: -1 | 1) {
    const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x)
    const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y)
    if (dx < 10 && dy < 10) {
      setStoryIndex(i => {
        if (i == null) return i
        const next = i + dir
        if (next < 0) return 0
        if (next >= storyPeople.length) { return null }
        return next
      })
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData()
      initLocation()
    }, [])
  )

  // Lokalizacja bez blokowania ekranu: najpierw ostatnia znana pozycja
  // (natychmiast z cache), potem dokladny fix GPS w tle
  async function initLocation() {
    if (locationRequested.current) return
    locationRequested.current = true
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const last = await Location.getLastKnownPositionAsync()
      if (last) {
        const pos = { latitude: last.coords.latitude, longitude: last.coords.longitude }
        setUserLocation(pos)
        mapRef.current?.animateToRegion({ ...pos, latitudeDelta: 0.1, longitudeDelta: 0.1 }, 500)
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setUserLocation(pos)
      if (!last) mapRef.current?.animateToRegion({ ...pos, latitudeDelta: 0.1, longitudeDelta: 0.1 }, 500)
    } catch (e) { }
  }

  // Dane bez pelnoekranowego spinnera: mapa jest widoczna od razu,
  // a zapytania ida rownolegle; powroty na ekran odswiezaja po cichu
  async function loadData() {
    setRefreshing(true)
    try {
      const me = await getMyProfile()
      setMyProfile(me)
      if (me) {
        // Wiele relacji na profil jest dozwolone (multi-stories), wiec szukamy
        // konkretnego wpisu z is_live=true zamiast zakladac jeden wiersz na profil
        // (maybeSingle() rzucalby blad przy 2+ wierszach)
        const [statuses, myStatusRes] = await Promise.all([
          getActiveGymStatuses(me.id),
          supabase
            .from('training_status')
            .select('id, is_live, expires_at')
            .eq('profile_id', me.id)
            .eq('is_live', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1),
        ])
        setGymGroups(groupStatusesByGym(statuses))
        const myStatus = myStatusRes.data?.[0]
        if (myStatus) {
          setIsLive(true)
          setLiveExpiresAt(myStatus.expires_at)
          setLiveStatusId(myStatus.id)
        } else {
          setIsLive(false)
          setLiveExpiresAt(null)
          setLiveStatusId(null)
        }
      }
    } catch (e) {
      console.log('loadData gym-live-map error:', e)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  const totalActivePeople = gymGroups.reduce((sum, g) => sum + g.people.length, 0)

  function getHeatColors(count: number): { fill: string; stroke: string; radius: number } {
    if (count >= 7) return { fill: 'rgba(255,60,60,0.28)', stroke: 'rgba(255,60,60,0.7)', radius: 320 }
    if (count >= 4) return { fill: 'rgba(255,150,50,0.25)', stroke: 'rgba(255,150,50,0.65)', radius: 290 }
    if (count >= 2) return { fill: 'rgba(255,220,50,0.2)', stroke: 'rgba(255,220,50,0.6)', radius: 260 }
    return { fill: 'rgba(125,197,46,0.18)', stroke: 'rgba(125,197,46,0.5)', radius: 250 }
  }

  async function handleToggleLive() {
    if (!myProfile) return
    setTogglingLive(true)
    try {
      if (isLive) {
        // Stop znika natychmiast z mapy/listy live (is_live=false), ale NIE rusza
        // expires_at — jesli live bylo doczepione do prawdziwej relacji ze zdjeciem,
        // ta relacja ma zyc dalej swoim wlasnym czasem, nie zostac ucieta
        if (liveStatusId) {
          await supabase.from('training_status').update({ is_live: false }).eq('id', liveStatusId)
        }
        setIsLive(false)
        setLiveStatusId(null)
        setLiveExpiresAt(null)
        Alert.alert('👋', t('trainingStatus.sessionEnded') || 'Training session ended')
        await loadData()
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

        const expires_at = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

        // Wiele relacji na profil sa dozwolone — bez unikalnego ograniczenia
        // na profile_id upsert-by-profile juz nie dziala. Doczepiamy live
        // do najnowszej aktywnej relacji (jesli jest), inaczej tworzymy nowy,
        // minimalny wpis tylko z flaga live.
        const { data: existingRows } = await supabase
          .from('training_status')
          .select('id')
          .eq('profile_id', myProfile.id)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
        const existingId = existingRows?.[0]?.id

        if (existingId) {
          await supabase.from('training_status').update({
            is_live: true, expires_at, gym_latitude: gymLat, gym_longitude: gymLng,
          }).eq('id', existingId)
          setLiveStatusId(existingId)
        } else {
          const { data: inserted } = await supabase.from('training_status').insert({
            profile_id: myProfile.id,
            status_text: t('trainingStatus.defaultLiveText') || 'Training now!',
            training_time: '',
            gym_name: '',
            status_photo_url: '',
            expires_at,
            gym_latitude: gymLat,
            gym_longitude: gymLng,
            is_live: true,
          }).select('id').single()
          setLiveStatusId(inserted?.id ?? null)
        }

        setIsLive(true)
        setLiveExpiresAt(expires_at)
        // Auto-zoom do mojej lokalizacji po starcie live
        if (gymLat != null && gymLng != null) {
          mapRef.current?.animateToRegion({ latitude: gymLat, longitude: gymLng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600)
        }
        Alert.alert('💪', t('trainingStatus.sessionStarted') || "You're live! Others can see you're at the gym now.")
        await loadData()
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setTogglingLive(false)
    }
  }

  const initialRegion = userLocation ? {
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  } : {
    latitude: 52.0116,
    longitude: 4.5401,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        customMapStyle={DARK_MAP_STYLE}
        loadingEnabled
        loadingBackgroundColor="#17263c"
        loadingIndicatorColor={LIME}
      >
        {gymGroups.map((group, i) => {
          const heat = getHeatColors(group.people.length)
          const hot = group.people.length >= 7
          const avatar = group.people[0]?.status_photo_url || group.people[0]?.profiles?.photo_urls?.[0]
          return (
            <Marker
              key={i}
              coordinate={{ latitude: group.latitude, longitude: group.longitude }}
              onPress={() => focusGym(i)}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.markerWrap}>
                <View style={[styles.markerRing, { borderColor: heat.stroke }, hot && styles.markerRingHot]}>
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.markerAvatar} />
                  ) : (
                    <View style={[styles.markerAvatar, styles.markerAvatarEmpty]}>
                      <Ionicons name="barbell" size={16} color={PRIMARY} />
                    </View>
                  )}
                  <View style={[styles.markerBadge, { backgroundColor: heat.stroke }]}>
                    <Text style={styles.markerBadgeText}>{hot ? '🔥' : ''}{group.people.length}</Text>
                  </View>
                  {group.people.some((p: any) => p.profiles?.is_trainer) && (
                    <View style={styles.markerTrainerDot}>
                      <Ionicons name="school" size={9} color="#0d1b2e" />
                    </View>
                  )}
                </View>
                <View style={styles.markerLabel}>
                  <Text style={styles.markerLabelText} numberOfLines={1}>{group.gym_name}</Text>
                </View>
              </View>
            </Marker>
          )
        })}

        {isLive && userLocation && (
          <Circle
            center={userLocation}
            radius={200}
            strokeWidth={2}
            strokeColor="rgba(0,170,255,0.7)"
            fillColor="rgba(0,170,255,0.15)"
          />
        )}
      </MapView>

      {/* Plywajacy gorny pasek */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.floatBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>
            🔥 <Text style={{ color: LIME, fontWeight: '800' }}>{totalActivePeople}</Text> {t('liveMap.peopleActiveNow') || 'osób trenuje teraz'}
          </Text>
        </View>
        <TouchableOpacity style={styles.floatBtn} onPress={loadData} disabled={refreshing}>
          {refreshing ? <ActivityIndicator size="small" color={LIME} /> : <Ionicons name="refresh" size={19} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Pusta mapa - podpowiedz (dopiero po pierwszym zaladowaniu danych) */}
      {gymGroups.length === 0 && !loading && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <View style={styles.emptyCard}>
            <Ionicons name="barbell-outline" size={26} color={PRIMARY} />
            <Text style={styles.emptyText}>{t('liveMap.noOneActive') || 'No one is training right now'}</Text>
          </View>
        </View>
      )}

      {/* Wysrodkuj na mnie */}
      <TouchableOpacity
        style={[styles.locateBtn, { bottom: gymGroups.length > 0 ? 216 : 116 }]}
        onPress={() => {
          if (userLocation && mapRef.current) {
            mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 500)
          }
        }}
      >
        <Ionicons name="locate" size={20} color="#4fc3f7" />
      </TouchableOpacity>

      {/* FAB start/stop live */}
      <View style={[styles.fabWrap, { bottom: gymGroups.length > 0 ? 140 : 40 }]}>
        {isLive && liveTimeLeft ? (
          <View style={styles.timeLeftPill}>
            <Text style={styles.timeLeftPillText}>⏳ {liveTimeLeft}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.fab, isLive && styles.fabLive]}
          onPress={handleToggleLive}
          disabled={togglingLive}
        >
          {togglingLive ? (
            <ActivityIndicator color={isLive ? '#fff' : BG} />
          ) : (
            <>
              <Ionicons name={isLive ? 'stop' : 'barbell'} size={24} color={isLive ? '#fff' : BG} />
              <Text style={[styles.fabText, isLive && styles.fabTextLive]}>
                {isLive ? (t('liveMap.stop') || 'STOP') : (t('liveMap.start') || 'START')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Karuzela silowni */}
      {gymGroups.length > 0 && (
        <ScrollView
          ref={carouselRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}
          snapToInterval={CARD_W + 10}
          decelerationRate="fast"
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 10))
            const g = gymGroups[idx]
            if (g && mapRef.current) {
              mapRef.current.animateToRegion({ latitude: g.latitude, longitude: g.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 400)
            }
          }}
        >
          {gymGroups.map((group, i) => {
            const heat = getHeatColors(group.people.length)
            return (
              <TouchableOpacity
                key={i}
                style={[styles.gymCard, { width: CARD_W }]}
                activeOpacity={0.85}
                onPress={() => { setSelectedGym(group); setStoryIndex(0) }}
              >
                <View style={styles.gymCardTop}>
                  <Text style={styles.gymCardName} numberOfLines={1}>{group.gym_name}</Text>
                  <View style={[styles.gymCardBadge, { backgroundColor: heat.stroke }]}>
                    <Text style={styles.gymCardBadgeText}>
                      {group.people.length >= 7 ? '🔥 ' : ''}{group.people.length} {group.people.length === 1 ? (t('liveMap.person') || 'osoba') : (t('liveMap.people') || 'osób')}
                    </Text>
                  </View>
                </View>
                {(() => {
                  const trainer = group.people.find((p: any) => p.profiles?.is_trainer)
                  return trainer ? (
                    <TouchableOpacity
                      style={styles.gymCardTrainerChip}
                      onPress={() => router.push(`/trainer/${trainer.profiles.id}` as any)}
                    >
                      <Ionicons name="school" size={11} color="#4fc3f7" />
                      <Text style={styles.gymCardTrainerText} numberOfLines={1}>
                        {t('trainer.onSite')}: {trainer.profiles?.name}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                })()}
                <View style={styles.gymCardBottom}>
                  <View style={styles.gymCardAvatars}>
                    {group.people.slice(0, 3).map((p: any, idx: number) => (
                      <Image
                        key={idx}
                        source={{ uri: p.profiles?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }}
                        style={[styles.gymCardAvatar, idx > 0 && { marginLeft: -8 }]}
                      />
                    ))}
                    {group.people.length > 3 && (
                      <Text style={styles.gymCardMore}>+{group.people.length - 3}</Text>
                    )}
                  </View>
                  <Text style={styles.gymCardStories}>{t('liveMap.seeStories') || 'Zobacz stories'} →</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* MODAL: Przegladarka statusow w stylu stories */}
      <Modal visible={storyIndex != null} transparent animationType="fade" onRequestClose={() => setStoryIndex(null)}>
        <View style={styles.storyModal}>
          {/* Wszystkie relacje zamontowane naraz - przelaczanie bez ladowania.
              Zdjecie w calosci (contain), luki wypelnia rozmyta kopia (jak Instagram); wideo gra tylko gdy aktywne */}
          {storyPeople.map((person: any, i: number) => (
            <StoryMediaItem key={person.profile_id} person={person} isActive={i === storyIndex} muted={storyMuted} />
          ))}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
            style={styles.storyGradient}
            pointerEvents="none"
          />

          {/* Strefy tapniecia - surowe zdarzenia dotyku */}
          <View
            style={styles.storyTapLeft}
            onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
            onTouchEnd={e => handleStoryTap(e, -1)}
          />
          <View
            style={styles.storyTapRight}
            onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
            onTouchEnd={e => handleStoryTap(e, 1)}
          />

          {/* Paski postepu - jedna kreska na osobe */}
          <View style={styles.storyBars}>
            {storyPeople.map((_: any, i: number) => (
              <View key={i} style={[styles.storyBar, i === storyIndex && styles.storyBarActive]} />
            ))}
          </View>

          <View style={styles.storyTopActions}>
            {storyIndex != null && storyPeople[storyIndex]?.video_url && (
              <TouchableOpacity style={styles.storyActionBtn} onPress={() => setStoryMuted(v => !v)}>
                <Ionicons name={storyMuted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.storyActionBtn} onPress={handleReportStory} disabled={reportingStory}>
              {reportingStory ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="flag-outline" size={19} color="#fff" />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.storyActionBtn} onPress={() => setStoryIndex(null)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {storyIndex != null && storyPeople[storyIndex] ? (
            <View style={styles.storyInfo} pointerEvents="box-none">
              {storyPeople[storyIndex].looking_for_partner ? (
                <View style={styles.partnerChip}>
                  <Text style={{ fontSize: 12 }}>🤝</Text>
                  <Text style={styles.partnerChipText}>{t('trainingStatus.partnerBadge') || 'Szuka partnera na dziś'}</Text>
                </View>
              ) : null}
              <Text style={styles.storyName}>{storyPeople[storyIndex].profiles?.name ?? '...'}</Text>
              {storyPeople[storyIndex].status_text ? <Text style={styles.storyText}>{storyPeople[storyIndex].status_text}</Text> : null}
              <View style={styles.storyMetaRow}>
                {storyPeople[storyIndex].training_time ? (
                  <View style={styles.storyMeta}>
                    <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.storyMetaText}>{storyPeople[storyIndex].training_time}</Text>
                  </View>
                ) : null}
                {storyPeople[storyIndex].gym_name ? (
                  <View style={styles.storyMeta}>
                    <Ionicons name="barbell-outline" size={13} color={PRIMARY} />
                    <Text style={[styles.storyMetaText, { color: PRIMARY }]}>{storyPeople[storyIndex].gym_name}</Text>
                  </View>
                ) : null}
              </View>
              {/* Reakcje na status */}
              <View style={styles.reactionsRow}>
                {REACTION_EMOJIS.map(emoji => {
                  const active = myReactions[storyPeople[storyIndex].profile_id] === emoji
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                      onPress={() => reactToStatus(storyPeople[storyIndex].profile_id, emoji)}
                    >
                      <Text style={{ fontSize: 20 }}>{emoji}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <TouchableOpacity
                style={styles.storyProfileBtn}
                onPress={() => {
                  const pid = storyPeople[storyIndex].profile_id
                  setStoryIndex(null)
                  setSelectedGym(null)
                  router.push({ pathname: '/profile/profile-detail', params: { profileId: pid } } as any)
                }}
              >
                <Ionicons name="person-outline" size={15} color="#0d1b2e" />
                <Text style={styles.storyProfileBtnText}>{t('liveMap.viewProfile') || 'Zobacz profil'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  topBar: { position: 'absolute', top: 54, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(13,27,46,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  countPill: { flex: 1, backgroundColor: 'rgba(13,27,46,0.9)', borderRadius: 21, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  countPillText: { fontSize: 13, color: '#fff', fontWeight: '600', textAlign: 'center' },

  markerWrap: { alignItems: 'center' },
  markerRing: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  markerRingHot: { shadowColor: '#ff3c3c', shadowOpacity: 0.9, shadowRadius: 10, elevation: 8 },
  markerAvatar: { width: 38, height: 38, borderRadius: 19 },
  markerAvatarEmpty: { backgroundColor: BG_LIGHT, alignItems: 'center', justifyContent: 'center' },
  markerBadge: { position: 'absolute', top: -8, right: -10, borderRadius: 9, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 2, borderColor: BG },
  markerBadgeText: { fontSize: 10, fontWeight: '800', color: BG },
  markerTrainerDot: { position: 'absolute', bottom: -5, left: -7, width: 17, height: 17, borderRadius: 9, backgroundColor: '#4fc3f7', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BG },
  markerLabel: { backgroundColor: 'rgba(13,27,46,0.85)', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, maxWidth: 110 },
  markerLabelText: { fontSize: 9, fontWeight: '600', color: '#fff' },

  emptyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(13,27,46,0.92)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  emptyText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  locateBtn: { position: 'absolute', right: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(13,27,46,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  fabWrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 6 },
  timeLeftPill: { backgroundColor: 'rgba(13,27,46,0.9)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  timeLeftPillText: { fontSize: 11, fontWeight: '700', color: '#ffb340' },
  fab: { width: 68, height: 68, borderRadius: 34, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(13,27,46,0.85)', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabLive: { backgroundColor: '#e53935' },
  fabText: { fontSize: 9, fontWeight: '800', color: BG, marginTop: 1 },
  fabTextLive: { color: '#fff' },

  carousel: { position: 'absolute', bottom: 22, left: 0, right: 0 },
  carouselContent: { paddingHorizontal: 14, gap: 10 },
  gymCard: { backgroundColor: 'rgba(13,27,46,0.95)', borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.35)' },
  gymCardTrainerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(79,195,247,0.15)', borderWidth: 1, borderColor: 'rgba(79,195,247,0.4)', borderRadius: 9, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 8, alignSelf: 'flex-start' },
  gymCardTrainerText: { fontSize: 11, fontWeight: '700', color: '#4fc3f7' },
  gymCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gymCardName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' },
  gymCardBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  gymCardBadgeText: { fontSize: 10, fontWeight: '800', color: BG },
  gymCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  gymCardAvatars: { flexDirection: 'row', alignItems: 'center' },
  gymCardAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: BG, backgroundColor: BG_LIGHT },
  gymCardMore: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 5, fontWeight: '600' },
  gymCardStories: { fontSize: 11, fontWeight: '700', color: LIME },

  storyModal: { flex: 1, backgroundColor: '#000' },
  storyImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  storyImageHidden: { opacity: 0 },
  storyGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' },
  storyTapLeft: { position: 'absolute', top: 0, bottom: 160, left: 0, width: '50%', zIndex: 3 },
  storyTapRight: { position: 'absolute', top: 0, bottom: 160, right: 0, width: '50%', zIndex: 3 },
  storyBars: { position: 'absolute', top: 52, left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 6 },
  storyBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  storyBarActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  storyClose: { position: 'absolute', top: 66, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 7 },
  storyTopActions: { position: 'absolute', top: 66, right: 16, flexDirection: 'row', gap: 10, zIndex: 7 },
  storyActionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  storyInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 44, zIndex: 4 },
  storyName: { fontSize: 22, fontWeight: '700', color: '#fff' },
  storyText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  storyMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  storyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storyMetaText: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  partnerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#94e336', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  partnerChipText: { fontSize: 11, fontWeight: '700', color: '#0d1b2e' },
  reactionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reactionBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  reactionBtnActive: { backgroundColor: 'rgba(148,227,54,0.35)', borderWidth: 1.5, borderColor: '#94e336' },
  storyProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, marginTop: 14 },
  storyProfileBtnText: { fontSize: 13, fontWeight: '700', color: '#0d1b2e' },
})
