import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, TouchableOpacity, Dimensions, Modal, Alert } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { OverlayPillsView, FilterLayer } from '../../components/statusMedia'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile, blockUser, reportUser, incrementStatusView } from '../../lib/supabase'
import type { Profile } from '../../lib/supabase'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const { width: SCREEN_W } = Dimensions.get('window')
const PRIMARY = '#7dc52e'
// Nowoczesny blekit apki (stary akcent #00aaff odstawal od reszty ekranow)
const ACCENT = '#4fc3f7'
const VIOLET = '#b388ff'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

// Odleglosc w linii prostej — ta sama formula co w RPC talii swipe
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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

export default function ProfileViewScreen() {
  const { t } = useTranslation()
  const { profileId } = useLocalSearchParams<{ profileId: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const touchStart = useRef({ x: 0, y: 0 })
  const [trainingStatus, setTrainingStatus] = useState<any>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [showStatusPhoto, setShowStatusPhoto] = useState(false)
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportingStatus, setReportingStatus] = useState(false)

  // Podglad (wyciszony, zapetlony) na karcie profilu
  const statusVideoUrl = trainingStatus?.video_url || null
  const previewPlayer = useVideoPlayer(statusVideoUrl, p => { p.loop = true; p.muted = true; if (statusVideoUrl) p.play() })
  // Pelnoekranowy odtwarzacz w modalu: dzwiek wlaczony, startuje tylko gdy modal otwarty
  const fullPlayer = useVideoPlayer(statusVideoUrl, p => { p.loop = true })

  // Pelnoekranowy odtwarzacz gra tylko, gdy modal jest otwarty (i pauzuje po zamknieciu)
  useEffect(() => {
    if (!statusVideoUrl) return
    if (showStatusPhoto) fullPlayer.play()
    else fullPlayer.pause()
  }, [showStatusPhoto, statusVideoUrl])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single()
        setProfile(data)
        // Odleglosc ode mnie — gdy ktoras strona ma aktywny tryb podroznika,
        // liczymy od miejsca docelowego (spojnie z talia swipe)
        try {
          const me: any = await getMyProfile()
          const d: any = data
          const today = new Date().toISOString().split('T')[0]
          const src = me?.traveler_until && me.traveler_until >= today && me.traveler_lat != null
            ? { lat: me.traveler_lat, lng: me.traveler_lng } : { lat: me?.latitude, lng: me?.longitude }
          const dst = d?.traveler_until && d.traveler_until >= today && d.traveler_lat != null
            ? { lat: d.traveler_lat, lng: d.traveler_lng } : { lat: d?.latitude, lng: d?.longitude }
          if (me && d && me.id !== d.id && src.lat != null && src.lng != null && dst.lat != null && dst.lng != null) {
            setDistanceKm(haversineKm(src.lat, src.lng, dst.lat, dst.lng))
          }
        } catch (e) {}
        try {
          // Przy wielu aktywnych relacjach pokazujemy najnowsza (pelny pager w StoryViewer)
          const { data: statusData } = await supabase
            .from('training_status').select('*')
            .eq('profile_id', profileId)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (statusData) setTrainingStatus(statusData)
        } catch (e) {}
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [profileId])

  async function handleBlock() {
    setShowOptionsMenu(false)
    Alert.alert(
      t('reportBlock.blockTitle'),
      t('reportBlock.blockConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('reportBlock.block'), style: 'destructive', onPress: async () => {
            try {
              const me = await getMyProfile()
              if (!me || !profile) return
              await blockUser(me.id, (profile as any).id)
              Alert.alert('✅', t('reportBlock.blockedSuccess'), [{ text: 'OK', onPress: () => router.back() }])
            } catch (e: any) {
              Alert.alert(t('common.error'), e?.message ?? '')
            }
          }
        }
      ]
    )
  }

  // Zgloszenie konkretnej relacji (nie calego profilu) — dostepne od razu przy tresci,
  // zgodnie z wymogiem sklepow, ze obrazliwa tresc UGC musi dac sie zglosic w miejscu wystapienia
  async function handleReportStatus() {
    Alert.alert(t('reportBlock.reportStatusTitle'), t('reportBlock.reportStatusMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reportBlock.report'), style: 'destructive', onPress: async () => {
          setReportingStatus(true)
          try {
            const me = await getMyProfile()
            if (!me || !profile) return
            const kind = statusVideoUrl ? 'video' : 'photo'
            await reportUser(me.id, (profile as any).id, 'inappropriate_content', `status_${kind}:${profileId}:${trainingStatus?.expires_at ?? ''}`)
            Alert.alert('✅', t('reportBlock.reportedSuccess'))
          } catch (e: any) {
            Alert.alert(t('common.error'), e?.message ?? '')
          } finally { setReportingStatus(false) }
        }
      }
    ])
  }

  async function submitReport(reason: string) {
    setReporting(true)
    try {
      const me = await getMyProfile()
      if (!me || !profile) return
      await reportUser(me.id, (profile as any).id, reason)
      setShowReportModal(false)
      Alert.alert('✅', t('reportBlock.reportedSuccess'))
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message ?? '')
    } finally {
      setReporting(false)
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
  if (!profile) return <View style={styles.center}><Text style={{ color: '#fff' }}>Nie znaleziono profilu</Text></View>

  const p = profile as any
  const photos = p.photo_urls ?? []

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Nawigacja zdjec */}
      <View style={styles.photoContainer}>
        {/* Wszystkie zdjecia zamontowane naraz - tapniecie tylko zmienia widocznosc, bez ponownego ladowania */}
        {(photos.length ? photos : ['https://i.pravatar.cc/400']).map((uri: string, i: number) => (
          <Image key={i} source={{ uri }} style={[styles.mainPhoto, i !== currentPhotoIndex && styles.mainPhotoHidden]} />
        ))}
        {photos.length > 1 && (
          <>
            {/* Strefy tapniecia - surowe zdarzenia dotyku, bez opoznienia gestow */}
            <View
              style={styles.photoTapLeft}
              onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
              onTouchEnd={e => {
                const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x)
                const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y)
                if (dx < 10 && dy < 10) setCurrentPhotoIndex(i => Math.max(0, i - 1))
              }}
            />
            <View
              style={styles.photoTapRight}
              onTouchStart={e => { touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
              onTouchEnd={e => {
                const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x)
                const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y)
                if (dx < 10 && dy < 10) setCurrentPhotoIndex(i => Math.min(photos.length - 1, i + 1))
              }}
            />
            <View style={styles.photoBars}>
              {photos.map((_: any, i: number) => (
                <View key={i} style={[styles.photoBar, i === currentPhotoIndex && styles.photoBarActive]} />
              ))}
            </View>
          </>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.moreBtn} onPress={() => setShowOptionsMenu(true)}>
          <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
        </TouchableOpacity>
        {p.is_verified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={12} color={ACCENT} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        )}
        {/* Zielona kropka statusu na zdjęciu */}
        {trainingStatus && (
          <View style={styles.statusActiveDot}>
            <View style={styles.statusActiveDotInner} />
            <Text style={styles.statusActiveDotText}>{t('trainingStatus.activeIndicator')}</Text>
          </View>
        )}
      </View>

      {/* Miniatury zdjec */}
      {photos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsScroll} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
          {photos.map((uri: string, i: number) => (
            <TouchableOpacity key={i} onPress={() => setCurrentPhotoIndex(i)}>
              <Image source={{ uri }} style={[styles.thumb, i === currentPhotoIndex && styles.thumbActive]} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.infoContainer}>
        {/* Imie */}
        <View style={styles.nameRow}>
          <Text style={styles.name}>{p.name}</Text>
          {p.is_premium && <View style={styles.premiumBadge}><Text style={styles.premiumText}>⭐ Premium</Text></View>}
          {p.is_founder && (
            <View style={styles.founderBadge}>
              <Ionicons name="ribbon" size={11} color="#f0b429" />
              <Text style={styles.founderBadgeText}>{t('profile.founderBadge')}</Text>
            </View>
          )}
        </View>

        {/* Tryb podroznika: miejsce docelowe + notatka (jesli aktywny) */}
        {p.traveler_until && p.traveler_until >= new Date().toISOString().split('T')[0] && (
          <View style={styles.travelerBanner}>
            <Ionicons name="airplane" size={15} color="#b388ff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.travelerBannerText} numberOfLines={1}>
                {p.traveler_city ? t('traveler.detailWithCity', { city: p.traveler_city }) : t('traveler.badge')}
              </Text>
              {p.traveler_note ? <Text style={styles.travelerBannerNote} numberOfLines={2}>{p.traveler_note}</Text> : null}
            </View>
          </View>
        )}

        {/* Lokalizacja + odleglosc ode mnie */}
        {(p.city || distanceKm != null) && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={PRIMARY} />
            <Text style={styles.locationText}>
              {p.city ?? ''}
              {distanceKm != null ? `${p.city ? '  ·  ' : ''}${distanceKm < 1 ? '< 1 km' : Math.round(distanceKm) + ' km'}` : ''}
            </Text>
          </View>
        )}

        {/* Plec, wiek, kraj */}
        {(p.gender || p.age || p.country) && (
          <View style={styles.statsRow}>
            {p.gender ? (
              <View style={styles.statBadge}>
                <Ionicons name={p.gender === 'male' ? 'man-outline' : p.gender === 'female' ? 'woman-outline' : 'person-outline'} size={14} color={ACCENT} />
                <Text style={styles.statText}>{p.gender === 'male' ? t('profile.male') : p.gender === 'female' ? t('profile.female') : t('profile.other')}</Text>
              </View>
            ) : null}
            {p.age ? (
              <View style={styles.statBadge}>
                <Ionicons name="calendar-outline" size={14} color={ACCENT} />
                <Text style={styles.statText}>{p.age} {t('ui.years')}</Text>
              </View>
            ) : null}
            {p.country ? (
              <View style={styles.statBadge}>
                <Text style={styles.statText}>{COUNTRY_FLAGS[p.country] ?? '🌍'} {t('countries.' + p.country)}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Silownia */}
        {p.gym_name && (
          <View style={styles.gymRow}>
            <Ionicons name="barbell-outline" size={16} color={PRIMARY} />
            <Text style={styles.gymText}>{p.gym_name}</Text>
          </View>
        )}

        {/* Staz i poziom */}
        {(p.experience_years > 0 || p.fitness_level || p.training_frequency) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('gym.stepTitle')}</Text>
            <View style={styles.tagsRow}>
              {p.experience_years > 0 && (
                <View style={styles.infoBadge}>
                  <Ionicons name="time-outline" size={14} color={ACCENT} />
                  <Text style={styles.infoBadgeText}>{p.experience_years} {t('ui.years')}</Text>
                </View>
              )}
              {p.fitness_level && (
                <View style={styles.infoBadge}>
                  <Ionicons name="fitness-outline" size={14} color={ACCENT} />
                  <Text style={styles.infoBadgeText}>{t('gym.' + p.fitness_level)}</Text>
                </View>
              )}
              {p.training_frequency && (
                <View style={styles.infoBadge}>
                  <Ionicons name="calendar-outline" size={14} color={ACCENT} />
                  <Text style={styles.infoBadgeText}>{p.training_frequency}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Status treningowy */}
        {trainingStatus && (
          <View style={styles.statusCard}>
            <View style={styles.statusCardHeader}>
              <View style={styles.statusDot} />
              <Text style={styles.statusCardTitle}>{t('trainingStatus.activeStatusProfile')}</Text>
              <Text style={styles.statusCardTime}>24h</Text>
              <TouchableOpacity onPress={handleReportStatus} disabled={reportingStatus} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {reportingStatus ? <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" /> : (
                  <Ionicons name="flag-outline" size={15} color="rgba(255,255,255,0.4)" />
                )}
              </TouchableOpacity>
            </View>
            {statusVideoUrl ? (
              <TouchableOpacity onPress={async () => {
                setShowStatusPhoto(true)
                try {
                  const me = await getMyProfile()
                  if (me) incrementStatusView(profileId as string, me.id)
                } catch (e) { }
              }}>
                <VideoView player={previewPlayer} style={styles.statusPhoto} contentFit="cover" nativeControls={false} />
                <FilterLayer id={trainingStatus.filter} />
                <View style={styles.statusPhotoOverlay}>
                  <Ionicons name="play-circle-outline" size={20} color="#fff" />
                  <Text style={styles.statusPhotoOverlayText}>{t('trainingStatus.tapToPlay')}</Text>
                </View>
              </TouchableOpacity>
            ) : trainingStatus.status_photo_url && trainingStatus.status_photo_url.length > 0 && (
              <TouchableOpacity onPress={async () => {
                setShowStatusPhoto(true)
                // Wyswietlenie relacji liczy sie dopiero przy jej otwarciu (raz na osobe)
                try {
                  const me = await getMyProfile()
                  if (me) incrementStatusView(profileId as string, me.id)
                } catch (e) { }
              }}>
                <Image source={{ uri: trainingStatus.status_photo_url }} style={styles.statusPhoto} />
                <FilterLayer id={trainingStatus.filter} />
                {/* Ukryty preload pelnego rozmiaru - modal otwiera sie bez dekodowania */}
                <Image source={{ uri: trainingStatus.status_photo_url }} style={styles.statusPhotoPreload} resizeMode="contain" />
                <View style={styles.statusPhotoOverlay}>
                  <Ionicons name="expand-outline" size={20} color="#fff" />
                  <Text style={styles.statusPhotoOverlayText}>{t('trainingStatus.tapToEnlarge')}</Text>
                </View>
              </TouchableOpacity>
            )}
            {trainingStatus.status_text ? <Text style={styles.statusCardText}>{trainingStatus.status_text}</Text> : null}
            {trainingStatus.training_time ? (
              <View style={styles.statusMeta}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
                <Text style={styles.statusMetaText}>{trainingStatus.training_time}</Text>
              </View>
            ) : null}
            {trainingStatus.gym_name ? (
              <View style={styles.statusMeta}>
                <Ionicons name="barbell-outline" size={14} color="#7dc52e" />
                <Text style={[styles.statusMetaText, { color: '#7dc52e' }]}>{trainingStatus.gym_name}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Bio */}
        {p.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.aboutMe')}</Text>
            <Text style={styles.bio}>{p.bio}</Text>
          </View>
        )}

        {/* Trener: przejscie do wizytowki (obserwowanie, opinie, kontakt) */}
        {(p as any).is_trainer && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.trainerBanner} onPress={() => router.push(`/trainer/${p.id}` as any)} activeOpacity={0.8}>
              <View style={styles.trainerBannerIcon}>
                <Ionicons name="school" size={20} color="#4fc3f7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.trainerBannerTitle}>{t('trainer.trainerLabel')}</Text>
                <Text style={styles.trainerBannerSub}>{t('trainer.viewTrainerCard')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#4fc3f7" />
            </TouchableOpacity>
          </View>
        )}

        {/* Panel zaufania — weryfikacja, staz, streak */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('safety.trustTitle')}</Text>
          <View style={styles.trustCard}>
            <View style={styles.trustRow}>
              <Ionicons name={p.is_verified ? 'shield-checkmark' : 'shield-outline'} size={17} color={p.is_verified ? '#94e336' : 'rgba(255,255,255,0.3)'} />
              <Text style={[styles.trustText, !p.is_verified && { color: 'rgba(255,255,255,0.4)' }]}>
                {p.is_verified ? t('safety.trustVerified') : t('safety.trustNotVerified')}
              </Text>
            </View>
            {p.created_at && (
              <View style={styles.trustRow}>
                <Ionicons name="calendar" size={17} color="#94e336" />
                <Text style={styles.trustText}>
                  {t('safety.trustMemberSince', { date: new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
                </Text>
              </View>
            )}
            {(p as any).current_streak > 0 && (
              <View style={styles.trustRow}>
                <Ionicons name="flame" size={17} color="#f0b429" />
                <Text style={styles.trustText}>{t('safety.trustStreak', { count: (p as any).current_streak })}</Text>
              </View>
            )}
            {/* Kroki tylko za zgoda wlasciciela (show_steps) i tylko dzisiejsze */}
            {(p as any).show_steps && (p as any).steps_today != null && (p as any).steps_date === new Date().toISOString().split('T')[0] && (
              <View style={styles.trustRow}>
                <Ionicons name="footsteps" size={17} color="#4fc3f7" />
                <Text style={styles.trustText}>{t('health.stepsTodayCount', { count: (p as any).steps_today })}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Cele */}
        {p.goals && p.goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.trainingGoals')}</Text>
            <View style={styles.tagsRow}>
              {p.goals.map((g: string) => (
                <View key={g} style={styles.tag}>
                  <View style={[styles.tagDot, { backgroundColor: '#94e336' }]} />
                  <Text style={styles.tagText}>{t('goals.' + g)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Rekordy — kafle-trofea */}
        {Array.isArray(p.gym_records) && p.gym_records.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('records.title')}</Text>
            <View style={styles.recordsGrid}>
              {p.gym_records.map((r: any, i: number) => {
                const c = ['#94e336', '#4fc3f7', '#f0b429', '#b388ff'][i % 4]
                return (
                  <View key={r.key ?? i} style={[styles.recordTile, { borderColor: c + '55', backgroundColor: c + '14' }]}>
                    <Ionicons name="trophy" size={20} color={c} />
                    <Text style={styles.recordTileLabel} numberOfLines={1}>
                      {r.label || t('records.ex_' + r.key)}
                    </Text>
                    <Text style={[styles.recordTileValue, { color: c }]}>{r.value} {r.unit}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Ulubione cwiczenia */}
        {p.preferred_exercises && p.preferred_exercises.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('gym.preferredExercises')}</Text>
            <View style={styles.tagsRow}>
              {p.preferred_exercises.map((e: string) => (
                <View key={e} style={[styles.tag, styles.tagNeutral]}>
                  <View style={[styles.tagDot, { backgroundColor: ACCENT }]} />
                  <Text style={styles.tagText}>{t('gym.' + e)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Harmonogram */}
        {p.schedule && p.schedule.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.trainingSchedule')}</Text>
            <View style={styles.tagsRow}>
              {p.schedule.map((s: string) => (
                <View key={s} style={[styles.tag, styles.tagNeutral]}>
                  <View style={[styles.tagDot, { backgroundColor: VIOLET }]} />
                  <Text style={styles.tagText}>{t('schedule.' + s)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Modal pelnego zdjecia statusu */}
      <Modal visible={showStatusPhoto} transparent animationType="fade">
        <View style={styles.photoModal}>
          <TouchableOpacity style={styles.photoModalClose} onPress={() => setShowStatusPhoto(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.photoModalMediaWrap}>
            {statusVideoUrl ? (
              <VideoView player={fullPlayer} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls />
            ) : trainingStatus?.status_photo_url ? (
              <Image source={{ uri: trainingStatus.status_photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            ) : null}
            {trainingStatus && <FilterLayer id={trainingStatus.filter} />}
            {trainingStatus && <OverlayPillsView status={trainingStatus} />}
          </View>
          <View style={styles.photoModalInfo}>
            {trainingStatus?.status_text ? <Text style={styles.photoModalText}>{trainingStatus.status_text}</Text> : null}
            {trainingStatus?.training_time && <Text style={styles.photoModalMeta}>🕐 {trainingStatus.training_time}</Text>}
            {trainingStatus?.gym_name && <Text style={styles.photoModalMeta}>🏋️ {trainingStatus.gym_name}</Text>}
            <TouchableOpacity style={styles.photoModalReport} onPress={handleReportStatus} disabled={reportingStatus}>
              <Ionicons name="flag-outline" size={13} color="rgba(255,255,255,0.6)" />
              <Text style={styles.photoModalReportText}>{t('reportBlock.report')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal opcji (zglos/zablokuj) */}
      <Modal visible={showOptionsMenu} transparent animationType="fade">
        <TouchableOpacity style={styles.optionsOverlay} activeOpacity={1} onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.optionsSheet}>
            <TouchableOpacity style={styles.optionRow} onPress={() => { setShowOptionsMenu(false); setShowReportModal(true) }}>
              <Ionicons name="flag-outline" size={20} color="#fff" />
              <Text style={styles.optionRowText}>{t('reportBlock.report')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRow} onPress={handleBlock}>
              <Ionicons name="ban-outline" size={20} color="#ff4757" />
              <Text style={[styles.optionRowText, { color: '#ff4757' }]}>{t('reportBlock.block')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionRowCancel} onPress={() => setShowOptionsMenu(false)}>
              <Text style={styles.optionRowCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal wyboru powodu zgloszenia */}
      <Modal visible={showReportModal} transparent animationType="fade">
        <View style={styles.optionsOverlay}>
          <View style={styles.optionsSheet}>
            <Text style={styles.reportTitle}>{t('reportBlock.reportTitle')}</Text>
            <Text style={styles.reportSubtitle}>{t('reportBlock.reportSubtitle')}</Text>
            {['inappropriate_content', 'fake_profile', 'harassment', 'spam', 'other'].map(reason => (
              <TouchableOpacity key={reason} style={styles.optionRow} disabled={reporting} onPress={() => submitReport(reason)}>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
                <Text style={styles.optionRowText}>{t('reportBlock.' + reason)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.optionRowCancel} onPress={() => setShowReportModal(false)}>
              <Text style={styles.optionRowCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  photoContainer: { position: 'relative', width: SCREEN_W, height: SCREEN_W * 1.2 },
  mainPhoto: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  mainPhotoHidden: { opacity: 0 },
  photoTapLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' },
  photoTapRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' },
  photoBars: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  photoBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  photoBarActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  backBtn: { position: 'absolute', top: 50, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  moreBtn: { position: 'absolute', top: 50, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  optionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  optionsSheet: { backgroundColor: '#1a2a44', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  optionRowText: { fontSize: 15, color: '#fff', fontWeight: '500' },
  optionRowCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  optionRowCancelText: { fontSize: 15, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  reportTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginBottom: 4, textAlign: 'center' },
  reportSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16, textAlign: 'center' },
  verifiedBadge: { position: 'absolute', top: 50, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,170,255,0.2)', borderWidth: 1, borderColor: 'rgba(0,170,255,0.5)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedText: { fontSize: 11, color: ACCENT, fontWeight: '600' },
  statusActiveDot: { position: 'absolute', bottom: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(13,27,46,0.8)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(125,197,46,0.5)' },
  statusActiveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  statusActiveDotText: { fontSize: 11, color: PRIMARY, fontWeight: '600' },
  thumbsScroll: { backgroundColor: BG_LIGHT },
  thumb: { width: 60, height: 75, borderRadius: 8, opacity: 0.6 },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: PRIMARY },
  infoContainer: { padding: 20 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  name: { fontSize: 28, fontWeight: '800', color: '#fff' },
  premiumBadge: { backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  premiumText: { fontSize: 13, color: '#F59E0B', fontWeight: '700' },
  founderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(240,180,41,0.12)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(240,180,41,0.5)' },
  founderBadgeText: { fontSize: 11, color: '#f0b429', fontWeight: '800' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  locationText: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  travelerBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(122,66,181,0.12)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.35)', borderRadius: 12, padding: 10, marginBottom: 12 },
  travelerBannerText: { fontSize: 13, fontWeight: '700', color: '#b388ff' },
  travelerBannerNote: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BG_LIGHT, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  statText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  gymRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(125,197,46,0.1)', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(125,197,46,0.2)' },
  gymText: { fontSize: 15, color: PRIMARY, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  recordsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recordTile: { width: '47.8%', borderRadius: 16, borderWidth: 1, padding: 13, alignItems: 'center', gap: 3 },
  recordTileLabel: { fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  recordTileValue: { fontSize: 17, fontWeight: '900' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Dot-chipy jak w edycji profilu/ustawieniach: ciemne tlo + kropka koloru kategorii
  tag: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: BG_LIGHT, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(148,227,54,0.5)' },
  tagNeutral: { borderColor: 'rgba(255,255,255,0.14)' },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  infoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BG_LIGHT, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  infoBadgeText: { fontSize: 13, color: '#fff' },
  bio: { fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 24 },
  trainerBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(79,195,247,0.1)', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: 'rgba(79,195,247,0.4)' },
  trainerBannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(79,195,247,0.15)', alignItems: 'center', justifyContent: 'center' },
  trainerBannerTitle: { fontSize: 15, fontWeight: '800', color: '#4fc3f7' },
  trainerBannerSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  trustCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trustText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  statusCard: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.4)' },
  statusCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  statusCardTitle: { flex: 1, fontSize: 12, color: PRIMARY, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusCardTime: { fontSize: 11, color: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusPhoto: { width: '100%', height: 200, borderRadius: 12, marginBottom: 12 },
  statusPhotoPreload: { position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: SCREEN_W * 1.2, opacity: 0, pointerEvents: 'none' },
  statusPhotoOverlay: { position: 'absolute', bottom: 12, right: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)', paddingVertical: 6, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  statusPhotoOverlayText: { fontSize: 12, color: '#fff', fontWeight: '500' },
  statusCardText: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 8 },
  statusMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusMetaText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  photoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  photoModalClose: { position: 'absolute', top: 50, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  photoModalImage: { width: SCREEN_W, height: SCREEN_W * 1.2 },
  photoModalMediaWrap: { width: SCREEN_W, height: SCREEN_W * 1.2, position: 'relative' },
  photoModalInfo: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: 'rgba(13,27,46,0.9)', borderRadius: 16, padding: 16 },
  photoModalText: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 6 },
  photoModalMeta: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  photoModalReport: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start' },
  photoModalReportText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textDecorationLine: 'underline' },
})
