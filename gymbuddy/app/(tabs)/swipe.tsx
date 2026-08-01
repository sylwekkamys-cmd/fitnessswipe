import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Alert,
  Image, ActivityIndicator, Dimensions, PanResponder, Animated, ScrollView, Share
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase, getCandidates, doSwipe, decrementSwipes, getMyProfile, checkAndAwardBadges, checkIsAdmin, adminAction, getReferralCode } from '../../lib/supabase'
import type { Profile } from '../../lib/supabase'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { BannerAd, BannerAdSize, loadInterstitial, showInterstitial, loadRewarded, BANNER_ID } from '../../lib/admob'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const SWIPE_THRESHOLD = 120
const LIME2 = '#94e336'

// Ile dni zostalo podroznikowi w miescie (null = nie jest przejazdem / termin minal)
function travelerDaysLeft(profile: any): number | null {
  const until = profile?.traveler_until
  if (!until) return null
  const days = Math.ceil((new Date(String(until).slice(0, 10) + 'T23:59:59').getTime() - Date.now()) / 86400000)
  return days > 0 ? days : null
}

function getSharedTraits(myProfile: any, matchedProfile: any, t: any): { icon: string; text: string }[] {
  const traits: { icon: string; text: string }[] = []

  // Wspolne cele treningowe
  const myGoals: string[] = myProfile?.goals ?? []
  const theirGoals: string[] = matchedProfile?.goals ?? []
  const sharedGoals = myGoals.filter(g => theirGoals.includes(g))
  if (sharedGoals.length > 0) {
    const goalLabel = t('goals.' + sharedGoals[0])
    traits.push({
      icon: 'flag',
      text: sharedGoals.length === 1
        ? (t('swipe.sharedGoal', { goal: goalLabel }) || `Both into ${goalLabel}`)
        : (t('swipe.sharedGoals', { count: sharedGoals.length }) || `${sharedGoals.length} shared training goals`)
    })
  }

  // Ten sam poziom fitness
  if (myProfile?.fitness_level && myProfile.fitness_level === matchedProfile?.fitness_level) {
    traits.push({ icon: 'trophy', text: t('swipe.sameLevel', { level: t('gym.' + myProfile.fitness_level) }) || `Same level: ${myProfile.fitness_level}` })
  }

  // Wspolna pora treningu
  const mySchedule: string[] = myProfile?.schedule ?? []
  const theirSchedule: string[] = matchedProfile?.schedule ?? []
  const sharedSchedule = mySchedule.filter(s => theirSchedule.includes(s))
  if (sharedSchedule.length > 0) {
    traits.push({ icon: 'time', text: t('swipe.sameSchedule', { time: t('schedule.' + sharedSchedule[0]) }) || `Both train ${sharedSchedule[0]}` })
  }

  // Ta sama silownia
  if (myProfile?.gym_name && matchedProfile?.gym_name && myProfile.gym_name.trim().toLowerCase() === matchedProfile.gym_name.trim().toLowerCase()) {
    traits.push({ icon: 'barbell', text: t('swipe.sameGym') || 'Same gym!' })
  }

  return traits.slice(0, 3)
}

function AnimatedMatchIcon() {
  const pulse = useRef(new Animated.Value(1)).current
  const rotate = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  const rotateInterpolate = rotate.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] })

  return (
    <Animated.View style={{
      transform: [{ scale: pulse }, { rotate: rotateInterpolate }],
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: 'rgba(125,197,46,0.2)',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: PRIMARY, marginBottom: 16,
    }}>
      <Ionicons name="barbell" size={40} color={PRIMARY} />
    </Animated.View>
  )
}

function AnimatedButton({ onPress, style, children, disabled }: any) {
  const scale = useRef(new Animated.Value(1)).current
  function handlePressIn() { Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 50 }).start() }
  function handlePressOut() { Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start() }
  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={disabled} activeOpacity={1}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  )
}

function SwipeCard({ profile, onSwipeLeft, onSwipeRight, t, trainingStatus, myProfile, heightStyle }: {
  profile: Profile; onSwipeLeft: () => void; onSwipeRight: () => void; t: any; trainingStatus?: any; myProfile?: Profile | null; heightStyle?: any
}) {
  const pan = useRef(new Animated.ValueXY()).current
  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ['-30deg', '0deg', '30deg'] })
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' })
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' })

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > SWIPE_THRESHOLD) {
        Animated.timing(pan, { toValue: { x: SCREEN_W * 1.5, y: gesture.dy }, duration: 300, useNativeDriver: false }).start(onSwipeRight)
      } else if (gesture.dx < -SWIPE_THRESHOLD) {
        Animated.timing(pan, { toValue: { x: -SCREEN_W * 1.5, y: gesture.dy }, duration: 300, useNativeDriver: false }).start(onSwipeLeft)
      } else {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start()
      }
    },
  })).current

  const photos = profile.photo_urls?.length ? profile.photo_urls : ['https://i.pravatar.cc/400']
  const [photoIndex, setPhotoIndex] = useState(0)
  const myGoals: string[] = (myProfile as any)?.goals ?? []
  const touchStart = useRef({ x: 0, y: 0 })

  function handlePhotoTap(e: any, dir: -1 | 1) {
    const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x)
    const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y)
    if (dx < 10 && dy < 10) {
      setPhotoIndex(i => dir === -1 ? Math.max(0, i - 1) : Math.min(photos.length - 1, i + 1))
    }
  }
  const travelerDays = travelerDaysLeft(profile)
  const isActiveNow = (() => {
    const lastActive = (profile as any).last_active_at
    if (!lastActive) return false
    const diffMinutes = (Date.now() - new Date(lastActive).getTime()) / 60000
    return diffMinutes < 5
  })()

  return (
    <Animated.View style={[styles.card, heightStyle, (profile as any).is_trainer && styles.cardTrainer, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]} {...panResponder.panHandlers}>
      {/* Wszystkie zdjecia zamontowane naraz - tapniecie tylko zmienia widocznosc, bez ponownego ladowania */}
      {photos.map((u, i) => (
        <Image key={i} source={{ uri: u }} style={[styles.cardImage, i !== photoIndex && styles.cardImageHidden]} />
      ))}

      {/* Strefy tapniecia - przelaczanie zdjec (surowe zdarzenia dotyku, bez opoznienia gestow) */}
      {photos.length > 1 && (
        <>
          <View
            style={styles.photoTapLeft}
            onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
            onTouchEnd={e => handlePhotoTap(e, -1)}
          />
          <View
            style={styles.photoTapRight}
            onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
            onTouchEnd={e => handlePhotoTap(e, 1)}
          />
        </>
      )}

      {/* Pasek podroznika - odliczanie dni do wyjazdu (wariant 3) */}
      {travelerDays != null && (
        <LinearGradient
          colors={['rgba(74,37,112,0.95)', 'rgba(122,66,181,0.88)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.travelerBar}
          pointerEvents="none"
        >
          <Text style={styles.travelerBarText} numberOfLines={1}>
            {(profile as any).traveler_city
              ? t('traveler.cardBarCity', { city: (profile as any).traveler_city, count: travelerDays })
              : travelerDays === 1 ? t('traveler.cardBarLast') : t('traveler.cardBar', { count: travelerDays })}
          </Text>
        </LinearGradient>
      )}

      {/* Paski postepu zdjec */}
      {photos.length > 1 && (
        <View style={[styles.photoBars, travelerDays != null && { top: 38 }]}>
          {photos.map((_, i) => (
            <View key={i} style={[styles.photoBar, i === photoIndex && styles.photoBarActive]} />
          ))}
        </View>
      )}

      {/* Gradient overlay — trenerzy dostaja czerń Studia zamiast granatu */}
      <LinearGradient
        colors={(profile as any).is_trainer
          ? ['transparent', 'rgba(11,11,14,0.6)', 'rgba(11,11,14,0.94)']
          : ['transparent', 'rgba(13,27,46,0.55)', 'rgba(13,27,46,0.92)']}
        style={styles.cardGradient}
        pointerEvents="none"
      />

      {/* LIKE / NOPE overlay */}
      <Animated.View style={[styles.overlayLabel, styles.overlayLikeContainer, { opacity: likeOpacity }]}>
        <Text style={styles.overlayLikeText}>LIKE</Text>
      </Animated.View>
      <Animated.View style={[styles.overlayLabel, styles.overlayNopeContainer, { opacity: nopeOpacity }]}>
        <Text style={styles.overlayNopeText}>NOPE</Text>
      </Animated.View>

      {/* Status treningowy - konkretna tresc zamiast generycznego badge */}
      {trainingStatus && (trainingStatus.status_text || trainingStatus.training_time) && (
        <View style={[styles.statusBadge, travelerDays != null && { top: 50 }]}>
          <Ionicons name="flash" size={13} color="#0d1b2e" />
          <Text style={styles.statusBadgeText} numberOfLines={1}>
            {[trainingStatus.training_time, trainingStatus.status_text].filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}

      {/* Szuka partnera na dzis */}
      {trainingStatus?.looking_for_partner && (
        <View style={[styles.partnerBadge, travelerDays != null && { top: 84 }]}>
          <Text style={{ fontSize: 11 }}>🤝</Text>
          <Text style={styles.partnerBadgeText} numberOfLines={1}>{t('trainingStatus.partnerBadge') || 'Szuka partnera na dziś'}</Text>
        </View>
      )}

      {/* Info button */}
      <TouchableOpacity style={[styles.infoBtn, travelerDays != null && { top: 50 }]} onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: profile.id } })}>
        <Ionicons name="information-circle" size={30} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Streak jako badge na zdjeciu */}
      {(profile as any).current_streak > 0 ? (
        <View style={[styles.streakBadge, travelerDays != null && { top: 92 }]}>
          <Text style={{ fontSize: 11 }}>🔥</Text>
          <Text style={styles.streakBadgeText}>{(profile as any).current_streak}</Text>
        </View>
      ) : null}

      {/* Card info */}
      <View style={styles.cardInfo} pointerEvents="box-none">
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName}>{profile.name}{(profile as any).age ? `, ${(profile as any).age}` : ''}</Text>
          {(profile as any)?.is_verified && (
            <Ionicons name="shield-checkmark" size={18} color="#4fc3f7" />
          )}
          {(profile as any)?.is_founder && (
            <Ionicons name="ribbon" size={16} color="#f0b429" />
          )}
          {(profile as any)?.is_trainer && (
            <View style={styles.trainerBadge}>
              <Ionicons name="school" size={11} color="#0d1b2e" />
              <Text style={styles.trainerBadgeText}>{t('trainer.trainerLabel')}</Text>
            </View>
          )}
          {(myProfile as any)?.is_trainer && (profile as any)?.looking_for_trainer && (
            <View style={styles.seekingBadge}>
              <Ionicons name="search" size={10} color="#d4af37" />
              <Text style={styles.seekingBadgeText}>{t('trainer.seekingBadge')}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardMetaRow}>
          {profile.city ? (
            <View style={styles.cardMeta}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.cardCity}>{profile.city}</Text>
            </View>
          ) : null}
          {(profile as any).distance_km != null ? (
            <View style={styles.cardMeta}>
              <Ionicons name="navigate-outline" size={12} color="#94e336" />
              <Text style={styles.cardDistance}>{(profile as any).distance_km < 1 ? '< 1 km' : Math.round((profile as any).distance_km) + ' km'}</Text>
            </View>
          ) : null}
          {isActiveNow ? (
            <View style={styles.cardMeta}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>{t('swipe.activeNow') || 'Online'}</Text>
            </View>
          ) : null}
        </View>
        {((profile as any).fitness_level || (profile as any).experience_years > 0 || (profile as any).preferred_language || (profile as any).training_intensity || (profile as any).looking_for_spotter) ? (
          <View style={styles.pillsRow}>
            {((profile as any).fitness_level || (profile as any).experience_years > 0) ? (
              <View style={styles.pill}>
                <Ionicons name="trophy-outline" size={11} color="#ffd28a" />
                <Text style={styles.pillTextAmber}>
                  {t('gym.' + (profile as any).fitness_level)}
                  {(profile as any).experience_years > 0 ? ` · ${(profile as any).experience_years}` + ' ' + t('ui.years') : ''}
                </Text>
              </View>
            ) : null}
            {(profile as any).preferred_language ? (
              <View style={styles.pill}>
                <Ionicons name="chatbubble-outline" size={11} color="#9fd8ff" />
                <Text style={styles.pillTextBlue}>{t('languages.' + (profile as any).preferred_language) || (profile as any).preferred_language}</Text>
              </View>
            ) : null}
            {(profile as any).training_intensity ? (
              <View style={styles.pill}>
                <Text style={styles.pillTextAmber}>
                  {(profile as any).training_intensity === 'chill' ? '😌 ' + (t('profile.intensity_chill') || 'Na luzie') : (profile as any).training_intensity === 'solid' ? '💪 ' + (t('profile.intensity_solid') || 'Solidnie') : '🔥 ' + (t('profile.intensity_beast') || 'Beast mode')}
                </Text>
              </View>
            ) : null}
            {(profile as any).looking_for_spotter ? (
              <View style={[styles.pill, { backgroundColor: 'rgba(148,227,54,0.25)' }]}>
                <Text style={[styles.pillTextAmber, { color: '#b5e084' }]}>🤝 {t('profile.spotterBadge') || 'Szuka asekuracji'}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {profile.goals && profile.goals.length > 0 && (
          <View style={styles.goalsRow}>
            {profile.goals.slice(0, 3).map(goal => {
              const shared = myGoals.includes(goal)
              return (
                <View key={goal} style={[styles.goalBadge, shared && styles.goalBadgeShared]}>
                  {shared && <Ionicons name="checkmark" size={11} color="#0d1b2e" />}
                  <Text style={[styles.goalBadgeText, shared && styles.goalBadgeSharedText]}>{t('goals.' + goal)}</Text>
                </View>
              )
            })}
          </View>
        )}
        {profile.gym_name ? (
          <View style={styles.gymRow2}>
            <Ionicons name="barbell-outline" size={12} color="#94e336" />
            <Text style={styles.gymText2}>{profile.gym_name}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

export default function SwipeScreen() {
  const { t } = useTranslation()
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [candidates, setCandidates] = useState<Profile[]>([])
  // Konto admina: przycisk szybkiej moderacji w pasku akcji pod karta
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => { checkIsAdmin().then(setIsAdmin).catch(() => { }) }, [])

  // Zimny start: pusta talia zacheca do zapraszania (licznik nowych w okolicy + share z kodem)
  const [weeklyNewNearby, setWeeklyNewNearby] = useState(0)
  useEffect(() => {
    (async () => {
      try {
        const me = await getMyProfile()
        const myLat = (me as any)?.latitude
        const myLng = (me as any)?.longitude
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
        const { data } = await supabase
          .from('profiles')
          .select('latitude, longitude')
          .gte('created_at', weekAgo)
        const R = 6371
        const near = (data ?? []).filter((p: any) => {
          if (myLat == null || myLng == null) return true
          if (p.latitude == null || p.longitude == null) return false
          const dLat = (p.latitude - myLat) * Math.PI / 180
          const dLng = (p.longitude - myLng) * Math.PI / 180
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(myLat * Math.PI / 180) * Math.cos(p.latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 50
        })
        setWeeklyNewNearby(near.length)
      } catch (e) { }
    })()
  }, [])

  async function shareInvite() {
    try {
      const me = await getMyProfile()
      const code = me ? await getReferralCode(me.id) : null
      const msg = t('swipe.inviteMessage', { code: code ?? '' }) + '\nhttps://fitnessswipe.app'
      await Share.share({ message: msg })
    } catch (e) { }
  }

  function openAdminMenu() {
    const card = candidates[currentIndex]
    if (!card) return
    const hasStatus = trainingStatuses.some(s => s.profile_id === card.id)
    const run = async (kind: 'ban' | 'delete_status') => {
      try {
        await adminAction({ action: kind === 'ban' ? 'ban' : 'delete_content', profileId: card.id })
        if (kind === 'ban') {
          setCandidates(prev => prev.filter(c => c.id !== card.id))
          Alert.alert('✅', 'Konto zbanowane')
        } else {
          Alert.alert('✅', 'Relacja usunięta')
        }
      } catch (e: any) { Alert.alert('Błąd', e?.message ?? String(e)) }
    }
    Alert.alert('Moderacja', card.name, [
      { text: 'Anuluj', style: 'cancel' },
      ...(hasStatus ? [{ text: 'Usuń relację', onPress: () => run('delete_status') }] : []),
      {
        text: 'Zbanuj konto', style: 'destructive' as const,
        onPress: () => Alert.alert(`Zbanować ${card.name}?`, 'Konto zostanie zablokowane, profil zniknie z aplikacji.', [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Zbanuj', style: 'destructive', onPress: () => run('ban') },
        ]),
      },
    ])
  }
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null)
  const [showMatch, setShowMatch] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [trainingStatuses, setTrainingStatuses] = useState<any[]>([])
  const [swipeCount, setSwipeCount] = useState(0)
  const [myBadges, setMyBadges] = useState<string[]>([])
  const [isPremium, setIsPremium] = useState(false)
  // Karta-przerywnik "Szukasz trenera?" co 10 swipe'ow (z przesunieciem wzgledem reklam)
  const [totalSwipes, setTotalSwipes] = useState(0)
  const [trainerPromoAt, setTrainerPromoAt] = useState(5)
  const [nearbyTrainers, setNearbyTrainers] = useState<any[]>([])
  // Zmierzona przestrzen na talie: karta nie moze nachodzic na naglowek (Android)
  const [deckH, setDeckH] = useState(0)

  useEffect(() => { loadData() }, [])

  useFocusEffect(
    React.useCallback(() => {
      setCurrentIndex(0)
      setCandidates([])
      loadData()
      loadInterstitial()
      loadRewarded()
    }, [])
  )

  async function loadData() {
    setLoading(true)
    try {
      const profile = await getMyProfile()
      if (!profile) {
        // Zalogowany, ale bez profilu (np. konto e-mail bez ukonczonego kreatora):
        // prowadz przez zgody RODO/kreator zamiast wyrzucac do logowania
        const { data: { session } } = await supabase.auth.getSession()
        router.replace(session?.user ? '/(auth)/gdpr-consent' : '/(auth)/login')
        return
      }
      setMyProfile(profile)
      if (!profile.is_premium && profile.daily_swipes_left <= 0) { setLimitReached(true); setLoading(false); return }
      const savedGender = await AsyncStorage.getItem('filter_gender') ?? ''
      const savedMinAge = await AsyncStorage.getItem('filter_min_age') ?? ''
      const savedMaxAge = await AsyncStorage.getItem('filter_max_age') ?? ''
      const savedRadius = await AsyncStorage.getItem('filter_radius') ?? '50'
      const savedFitnessLevel = await AsyncStorage.getItem('filter_fitness_level') ?? ''
      const savedMinExp = await AsyncStorage.getItem('filter_min_experience') ?? ''
      const savedMaxExp = await AsyncStorage.getItem('filter_max_experience') ?? ''
      const savedGoalsStr = await AsyncStorage.getItem('filter_goals')
      const savedScheduleStr = await AsyncStorage.getItem('filter_schedule')
      const savedGoals: string[] = savedGoalsStr ? JSON.parse(savedGoalsStr) : []
      const savedSchedule: string[] = savedScheduleStr ? JSON.parse(savedScheduleStr) : []
      const savedIntensity = await AsyncStorage.getItem('filter_intensity') ?? ''
      const savedSpotter = (await AsyncStorage.getItem('filter_spotter')) === '1'
      const savedVerifiedOnly = (await AsyncStorage.getItem('filter_verified_only')) === '1'
      console.log('Filtry:', savedGender, savedMinAge, savedMaxAge, savedRadius, savedFitnessLevel)
      const list = await getCandidates(
        profile.id, savedGender,
        savedMinAge ? parseInt(savedMinAge) : 0,
        savedMaxAge ? parseInt(savedMaxAge) : 0,
        parseInt(savedRadius), savedFitnessLevel,
        savedMinExp ? parseInt(savedMinExp) : 0,
        savedMaxExp ? parseInt(savedMaxExp) : 0,
        savedGoals,
        savedSchedule,
        savedIntensity,
        savedSpotter,
        savedVerifiedOnly
      )
      // Pobierz statusy treningowe dla kandydatow
      const ids = list.map((p: any) => p.id)
      if (ids.length > 0) {
        const { data: statuses } = await supabase
          .from('training_status')
          .select('*')
          .in('profile_id', ids)
          .gt('expires_at', new Date().toISOString())
        setTrainingStatuses(statuses ?? [])
      }
      setCandidates(list)
      // Trenerzy z okolicy do karty-przerywnika
      try {
        const { getTrainers } = await import('../../lib/supabase')
        const trainerList = await getTrainers((profile as any).latitude ?? 0, (profile as any).longitude ?? 0, '', parseInt(savedRadius) || 50)
        setNearbyTrainers(trainerList.filter((tr: any) => tr.profile_id !== profile.id).slice(0, 3))
      } catch (e) { }
      setIsPremium((profile as any).is_premium ?? false)
      const { getMyBadges } = await import('../../lib/supabase')
      const badges = await getMyBadges(profile.id)
      setMyBadges(badges)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function checkNewBadges(profileId: string) {
    try {
      const allBadges = await checkAndAwardBadges(profileId)
      const newOnes = allBadges.filter(b => !myBadges.includes(b))
      if (newOnes.length > 0) {
        setMyBadges(allBadges)
        Alert.alert(
          '🏅 ' + (t('achievements.newBadge') || 'New Achievement!'),
          t('achievements.' + newOnes[0] + '_name') || newOnes[0]
        )
      }
    } catch (e) {
      console.log('checkNewBadges error:', e)
    }
  }

  // Mala baza uzytkownikow na start: poszerz promien szukania o 25 km
  async function widenRadius() {
    const current = parseInt((await AsyncStorage.getItem('filter_radius')) ?? '50') || 50
    const next = Math.min(current + 25, 200)
    await AsyncStorage.setItem('filter_radius', String(next))
    Alert.alert('📍', t('swipe.radiusWidened', { km: next }))
    loadData()
  }

  // Zapetlenie talii: przywroc profile pominiete swipe'em w lewo
  async function recycleSkipped() {
    if (!myProfile) return
    await supabase.from('swipes').delete().eq('swiper_id', myProfile.id).eq('direction', 'left')
    setCurrentIndex(0)
    loadData()
  }

  async function handleSwipe(direction: 'left' | 'right') {
    if (!myProfile || currentIndex >= candidates.length) return
    setTotalSwipes(c => c + 1)
    if (!isPremium) {
      const newCount = swipeCount + 1
      setSwipeCount(newCount)
      if (newCount % 10 === 0) await showInterstitial()
    }
    const swiped = candidates[currentIndex]
    const { error: viewError } = await supabase.from('profile_views').upsert({ viewer_id: myProfile.id, viewed_id: swiped.id }, { onConflict: 'viewer_id,viewed_id' })
    if (viewError) console.log('View error:', viewError)
    if (!myProfile.is_premium && direction === 'right') {
      const ok = await decrementSwipes(myProfile.id)
      if (!ok) { setLimitReached(true); return }
      setMyProfile(prev => prev ? { ...prev, daily_swipes_left: prev.daily_swipes_left - 1 } : prev)
    }
    const result = await doSwipe(myProfile.id, swiped.id, direction)
    checkNewBadges(myProfile.id)
    if (result.matched) { setMatchedProfile(swiped); setShowMatch(true) }
    else { setCurrentIndex(prev => prev + 1) }
  }

  function dismissMatch() { setShowMatch(false); setCurrentIndex(prev => prev + 1) }

  // Polka podroznikow: tapniecie awatara wyciaga te karte na wierzch talii
  function bringToFront(profileId: string) {
    setCandidates(prev => {
      const idx = prev.findIndex(p => p.id === profileId)
      if (idx < 0 || idx <= currentIndex) return prev
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.splice(currentIndex, 0, item)
      return copy
    })
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={PRIMARY} />
      <Text style={styles.loadingText}>{t('swipe.searching')}</Text>
    </View>
  )

  if (limitReached) return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>{"⏳"}</Text>
      <Text style={styles.emptyTitle}>{t('swipe.limitReached')}</Text>
      <Text style={styles.emptySub}>{t('swipe.limitSub')}</Text>
      <TouchableOpacity style={styles.premiumButton} onPress={() => router.push('/premium?highlight=swipes' as any)}>
        <Text style={styles.premiumButtonText}>{t('swipe.getPremium')}</Text>
      </TouchableOpacity>
    </View>
  )

  if (candidates.length === 0 || currentIndex >= candidates.length) return (
    <View style={styles.center}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="compass-outline" size={36} color={PRIMARY} />
      </View>
      <Text style={styles.emptyTitle}>{t('swipe.noMore')}</Text>
      <Text style={styles.emptySub}>{t('swipe.noMoreSub')}</Text>

      {/* Zimny start: pusta talia jako silnik zaproszen — licznik nowych w okolicy + share z kodem */}
      {weeklyNewNearby > 0 && (
        <View style={styles.weeklyPill}>
          <Ionicons name="trending-up" size={14} color={LIME2} />
          <Text style={styles.weeklyPillText}>{t('swipe.weeklyJoined', { count: weeklyNewNearby })}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.inviteButton} onPress={shareInvite}>
        <Ionicons name="share-social-outline" size={17} color="#0d1b2e" />
        <Text style={styles.widenButtonText}>{t('swipe.inviteFriends')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/referral' as any)}>
        <Text style={styles.inviteHint}>{t('swipe.inviteReward')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.widenButton} onPress={widenRadius}>
        <Ionicons name="expand-outline" size={17} color="#0d1b2e" />
        <Text style={styles.widenButtonText}>{t('swipe.widenRadius')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.reloadButton} onPress={recycleSkipped}>
        <Text style={styles.reloadButtonText}>{t('swipe.showSkipped')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={loadData} style={{ paddingVertical: 14 }}>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecorationLine: 'underline' }}>{t('common.retry')}</Text>
      </TouchableOpacity>
    </View>
  )

  const currentCard = candidates[currentIndex]
  const nextCard = candidates[currentIndex + 1]
  const travelers = candidates.slice(currentIndex).filter(p => travelerDaysLeft(p) != null)
  // Karta miesci sie w zmierzonym obszarze talii (z marginesem na tylna karte)
  const cardHeightStyle = deckH > 0 && SCREEN_H * 0.62 > deckH - 16
    ? { height: Math.max(deckH - 16, 320) }
    : null

  return (
    <View style={styles.container}>
      <Animated.View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Fitness</Text>
          <Text style={styles.headerTitleSwipe}>Swipe</Text>
        </View>
        {myProfile && !myProfile.is_premium && (
          <View style={styles.counter}>
            <Ionicons name="flame" size={14} color={PRIMARY} />
            <Text style={styles.counterText}>{myProfile.daily_swipes_left + "/20"}</Text>
          </View>
        )}
      </Animated.View>

      {/* Polka "Przejazdem w okolicy" (wariant 4) */}
      {travelers.length > 0 && (
        <View style={styles.travelerShelf}>
          <Text style={styles.travelerShelfTitle}>{t('traveler.shelfTitle')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.travelerShelfRow}>
            {travelers.map((tp: any) => (
              <TouchableOpacity key={tp.id} style={styles.travelerItem} onPress={() => bringToFront(tp.id)}>
                <Image source={{ uri: tp.photo_urls?.[0] ?? 'https://i.pravatar.cc/100' }} style={styles.travelerAvatar} />
                <Text style={styles.travelerName} numberOfLines={1}>{tp.name}</Text>
                {tp.traveler_city ? (
                  <Text style={styles.travelerDays} numberOfLines={1}>{tp.traveler_city}</Text>
                ) : (
                  <Text style={styles.travelerDays}>{t('traveler.days', { count: travelerDaysLeft(tp) })}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.cardsContainer} onLayout={e => setDeckH(e.nativeEvent.layout.height)}>
        {nextCard && (
          <View style={[styles.card, cardHeightStyle, styles.cardBack]}>
            <Image source={{ uri: nextCard.photo_urls?.[0] ?? 'https://i.pravatar.cc/400' }} style={styles.cardImage} />
            <LinearGradient colors={['transparent', 'rgba(13,27,46,0.55)', 'rgba(13,27,46,0.92)']} style={styles.cardGradient} />
          </View>
        )}
        {currentCard && (
          <SwipeCard
            key={currentCard.id}
            profile={currentCard}
            onSwipeLeft={() => handleSwipe('left')}
            onSwipeRight={() => handleSwipe('right')}
            t={t}
            trainingStatus={trainingStatuses.find(s => s.profile_id === currentCard.id)}
            myProfile={myProfile}
            heightStyle={cardHeightStyle}
          />
        )}

        {/* Karta-przerywnik: trenerzy z okolicy (co 10 swipe'ow) */}
        {totalSwipes >= trainerPromoAt && nearbyTrainers.length > 0 && (
          <View style={[styles.card, cardHeightStyle, styles.trainerPromoCard]}>
            <LinearGradient colors={['#0e4a63', '#1a7fa8']} style={styles.trainerPromoGradient}>
              <View style={styles.trainerPromoIcon}>
                <Ionicons name="school" size={30} color="#fff" />
              </View>
              <Text style={styles.trainerPromoTitle}>{t('trainer.promoTitle')}</Text>
              <Text style={styles.trainerPromoSub}>{t('trainer.promoSub')}</Text>
              <View style={styles.trainerPromoAvatars}>
                {nearbyTrainers.map((tr: any, i: number) => (
                  tr.photo_url ? (
                    <Image key={tr.profile_id} source={{ uri: tr.photo_url }} style={[styles.trainerPromoAvatar, i > 0 && { marginLeft: -12 }]} />
                  ) : (
                    <View key={tr.profile_id} style={[styles.trainerPromoAvatar, styles.trainerPromoAvatarEmpty, i > 0 && { marginLeft: -12 }]}>
                      <Ionicons name="person" size={18} color="rgba(255,255,255,0.5)" />
                    </View>
                  )
                ))}
              </View>
              <TouchableOpacity
                style={styles.trainerPromoBtn}
                onPress={() => { setTrainerPromoAt(totalSwipes + 10); router.push('/trainers' as any) }}
              >
                <Text style={styles.trainerPromoBtnText}>{t('trainer.promoCta')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.trainerPromoSkip} onPress={() => setTrainerPromoAt(totalSwipes + 10)}>
                <Text style={styles.trainerPromoSkipText}>{t('trainer.promoSkip')}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}
      </View>

      {!isPremium && BannerAd ? (
        <BannerAd
          unitId={BANNER_ID}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        />
      ) : null}

      <View style={styles.actionsWrap}>
        <View style={styles.actions}>
          {/* Szybka moderacja (tylko konta adminow): ban/usuniecie relacji wprost z talii */}
          {isAdmin && (
            <TouchableOpacity style={[styles.actionBtn, styles.actionAdmin]} onPress={openAdminMenu}>
              <Ionicons name="shield-half" size={18} color="#b388ff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionUndo, !myProfile?.is_premium && styles.actionDisabled]}
            onPress={() => {
              if (!myProfile?.is_premium) { Alert.alert('Premium', t('swipe.undoPremium')); return }
              setCurrentIndex(prev => Math.max(0, prev - 1))
            }}
          >
            <Ionicons name="arrow-undo" size={20} color={myProfile?.is_premium ? '#F59E0B' : '#333'} />
          </TouchableOpacity>

          <AnimatedButton style={[styles.actionBtn, styles.actionNope]} onPress={() => handleSwipe('left')}>
            <Ionicons name="close" size={28} color="#ff4757" />
          </AnimatedButton>

          <AnimatedButton style={[styles.actionBtn, styles.actionLike]} onPress={() => handleSwipe('right')}>
            <Ionicons name="flame" size={28} color="#fff" />
          </AnimatedButton>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBoost, !myProfile?.is_premium && styles.actionDisabled]}
            onPress={() => {
              if (!myProfile?.is_premium) { router.push('/premium?highlight=whoLiked' as any); return }
              router.push('/who-liked-me')
            }}
          >
            <Ionicons name="eye-outline" size={20} color={myProfile?.is_premium ? '#00aaff' : '#333'} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showMatch} transparent animationType="fade">
        <View style={styles.matchOverlay}>
          <View style={styles.matchCard}>
            <AnimatedMatchIcon />
            <Text style={styles.matchTitle}>{t('swipe.match')}</Text>
            <Text style={styles.matchSub}>{t('swipe.matchSub')}</Text>
            <View style={styles.matchPhotos}>
              <Image source={{ uri: myProfile?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100?img=1' }} style={styles.matchPhoto} />
              <View style={styles.matchHeart}><Text style={{fontSize: 20}}>🤝</Text></View>
              <Image source={{ uri: matchedProfile?.photo_urls?.[0] ?? 'https://i.pravatar.cc/100?img=2' }} style={styles.matchPhoto} />
            </View>
            {matchedProfile && <Text style={styles.matchName}>{matchedProfile.name}</Text>}

            {(() => {
              const traits = getSharedTraits(myProfile, matchedProfile, t)
              if (traits.length === 0) return null
              return (
                <View style={styles.sharedTraitsBox}>
                  <Text style={styles.sharedTraitsTitle}>{t('swipe.whyMatch') || 'Why this could be a great match'}</Text>
                  {traits.map((trait, i) => (
                    <View key={i} style={styles.sharedTraitRow}>
                      <Ionicons name={trait.icon as any} size={16} color={PRIMARY} />
                      <Text style={styles.sharedTraitText}>{trait.text}</Text>
                    </View>
                  ))}
                </View>
              )
            })()}

            <TouchableOpacity style={styles.matchButton} onPress={() => { setShowMatch(false); router.push('/(tabs)/matches') }}>
              <Text style={styles.matchButtonText}>{t('swipe.sendMessage')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.matchButtonOutline} onPress={dismissMatch}>
              <Text style={styles.matchButtonOutlineText}>{t('swipe.keepSwiping')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: BG },
  loadingText: { marginTop: 12, fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8 },
  headerTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: 22, color: '#ffffff', letterSpacing: -1, lineHeight: 24, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8, transform: [{ skewX: '-8deg' }] },
  headerTitleSwipe: { fontFamily: 'Outfit_800ExtraBold', fontSize: 16, color: '#94e336', letterSpacing: -0.5, lineHeight: 18, marginTop: -2, textShadowColor: 'rgba(148,227,54,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8, transform: [{ skewX: '-8deg' }] },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BG_LIGHT, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  counterText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  cardsContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', width: SCREEN_W - 32, height: SCREEN_H * 0.62, borderRadius: 24, overflow: 'hidden', backgroundColor: BG_LIGHT, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, elevation: 10 },
  cardBack: { transform: [{ scale: 0.95 }], top: 10 },
  cardImage: { width: '100%', height: '100%', position: 'absolute' },
  cardImageHidden: { opacity: 0 },
  photoTapLeft: { position: 'absolute', top: 0, bottom: '45%', left: 0, width: '50%', zIndex: 3 },
  photoTapRight: { position: 'absolute', top: 0, bottom: '45%', right: 0, width: '50%', zIndex: 3 },
  photoBars: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4, zIndex: 6 },
  photoBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  photoBarActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  overlayLabel: { position: 'absolute', top: 50, zIndex: 10, borderWidth: 3, borderRadius: 12, padding: 8 },
  overlayLikeContainer: { left: 20, borderColor: PRIMARY, transform: [{ rotate: '-20deg' }] },
  overlayLikeText: { fontSize: 28, fontWeight: '800', color: PRIMARY },
  overlayNopeContainer: { right: 20, borderColor: '#ff4757', transform: [{ rotate: '20deg' }] },
  overlayNopeText: { fontSize: 28, fontWeight: '800', color: '#ff4757' },
  infoBtn: { position: 'absolute', top: 22, right: 14, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 4, zIndex: 5 },
  streakBadge: { position: 'absolute', top: 64, right: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(13,27,46,0.6)', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3, zIndex: 5 },
  streakBadgeText: { fontSize: 11, color: '#ffb340', fontWeight: '700' },
  cardInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, paddingBottom: 18, zIndex: 4 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTrainer: { borderWidth: 2.5, borderColor: '#d4af37' },
  seekingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(11,11,14,0.75)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.6)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2.5 },
  seekingBadgeText: { fontSize: 10.5, fontWeight: '800', color: '#d4af37' },
  travelerBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 9, paddingBottom: 8, paddingHorizontal: 14, alignItems: 'center', zIndex: 5 },
  travelerBarText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  travelerShelf: { paddingTop: 6, paddingBottom: 2 },
  travelerShelfTitle: { fontSize: 10.5, fontWeight: '800', color: '#b388ff', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 7 },
  travelerShelfRow: { paddingHorizontal: 20, gap: 14 },
  travelerItem: { alignItems: 'center', width: 58 },
  travelerAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#7a42b5', backgroundColor: BG_LIGHT },
  travelerName: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 4 },
  travelerDays: { fontSize: 9, color: '#b388ff', fontWeight: '700', marginTop: 1 },
  trainerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d4af37', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2.5 },
  trainerBadgeText: { fontSize: 10.5, fontWeight: '800', color: '#0b0b0e' },
  trainerPromoCard: { zIndex: 20, elevation: 20 },
  trainerPromoGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  trainerPromoIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  trainerPromoTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  trainerPromoSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  trainerPromoAvatars: { flexDirection: 'row', marginTop: 18 },
  trainerPromoAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#fff' },
  trainerPromoAvatarEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  trainerPromoBtn: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 22 },
  trainerPromoBtnText: { color: '#0e4a63', fontSize: 15, fontWeight: '800' },
  trainerPromoSkip: { paddingVertical: 12 },
  trainerPromoSkipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textDecorationLine: 'underline' },
  cardName: { fontSize: 24, fontWeight: '700', color: '#fff' },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardCity: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  cardDistance: { fontSize: 13, color: '#94e336', fontWeight: '600' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  onlineText: { fontSize: 13, color: '#94e336', fontWeight: '600' },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4 },
  pillTextAmber: { fontSize: 11, color: '#ffd28a', fontWeight: '600' },
  pillTextBlue: { fontSize: 11, color: '#9fd8ff', fontWeight: '600' },
  goalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  goalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(125,197,46,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(125,197,46,0.45)' },
  goalBadgeText: { color: '#b5e084', fontSize: 11, fontWeight: '600' },
  goalBadgeShared: { backgroundColor: '#94e336', borderColor: '#94e336' },
  goalBadgeSharedText: { color: '#0d1b2e' },
  gymRow2: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  gymText2: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  statusBadge: { position: 'absolute', top: 22, left: 14, right: 60, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(125,197,46,0.95)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4, alignSelf: 'flex-start', zIndex: 5 },
  partnerBadge: { position: 'absolute', top: 56, left: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(13,27,46,0.75)', borderWidth: 1.5, borderColor: '#94e336', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, zIndex: 5 },
  actionAdmin: { width: 46, height: 46, borderWidth: 1.5, borderColor: 'rgba(179,136,255,0.45)', backgroundColor: 'transparent' },
  partnerBadgeText: { fontSize: 11, color: '#94e336', fontWeight: '700' },
  statusBadgeText: { fontSize: 10, color: '#0d1b2e', fontWeight: '800', letterSpacing: 0.5 },
  actionsWrap: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 40, paddingVertical: 14, paddingHorizontal: 24 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 50 },
  actionUndo: { width: 46, height: 46, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'transparent' },
  actionNope: { width: 58, height: 58, borderWidth: 2, borderColor: 'rgba(255,71,87,0.5)', backgroundColor: 'transparent' },
  actionLike: { width: 70, height: 70, backgroundColor: PRIMARY, shadowColor: PRIMARY, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  actionBoost: { width: 46, height: 46, borderWidth: 1.5, borderColor: 'rgba(0,170,255,0.4)', backgroundColor: 'transparent' },
  actionDisabled: { borderColor: '#333' },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  emptySub: { fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  premiumButton: { backgroundColor: PRIMARY, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
  premiumButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  widenButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 24 },
  widenButtonText: { color: '#0d1b2e', fontSize: 15, fontWeight: '800' },
  weeklyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(148,227,54,0.12)', borderWidth: 1, borderColor: 'rgba(148,227,54,0.4)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginTop: 16 },
  weeklyPillText: { fontSize: 12.5, fontWeight: '700', color: LIME2 },
  inviteButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: LIME2, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 14 },
  inviteHint: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8, textDecorationLine: 'underline' },
  reloadButton: { borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 12 },
  reloadButtonText: { color: PRIMARY, fontSize: 15, fontWeight: '600' },
  matchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  matchCard: { backgroundColor: BG_LIGHT, borderRadius: 28, padding: 32, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: 'rgba(125,197,46,0.3)' },
  matchTitle: { fontSize: 30, fontWeight: '800', color: PRIMARY },
  matchSub: { fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 6, textAlign: 'center' },
  matchPhotos: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  matchPhoto: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: PRIMARY },
  matchHeart: { width: 36, height: 36, borderRadius: 18, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', zIndex: 1, marginHorizontal: -8 },
  matchName: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 16 },
  sharedTraitsBox: { backgroundColor: 'rgba(125,197,46,0.08)', borderRadius: 16, padding: 16, marginTop: 16, width: '100%', borderWidth: 1, borderColor: 'rgba(125,197,46,0.25)' },
  sharedTraitsTitle: { fontSize: 12, fontWeight: '700', color: PRIMARY, marginBottom: 10, textAlign: 'center', letterSpacing: 0.3 },
  sharedTraitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sharedTraitText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', flex: 1 },
  matchButton: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 24, width: '100%', alignItems: 'center' },
  matchButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  matchButtonOutline: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32, marginTop: 10, width: '100%', alignItems: 'center' },
  matchButtonOutlineText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
})
