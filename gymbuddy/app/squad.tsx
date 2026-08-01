import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Modal, TextInput, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { supabase, getMyProfile, getTodaySquads, createSquad, joinSquad, leaveSquad, deleteSquad, kickSquadMember, fetchNearbyVenues } from '../lib/supabase'

// Ekipa na dzis: jednodniowe ogloszenia "szukam ludzi" (padel, pilka itd.).
// Sekcja "gramy za chwile" z odliczaniem + duze liczniki miejsc. Znika o polnocy.

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const SPORTS = [
  { key: 'padel', icon: 'tennisball-outline', color: '#94e336' },
  { key: 'football', icon: 'football-outline', color: '#4fc3f7' },
  { key: 'basketball', icon: 'basketball-outline', color: '#ffb340' },
  { key: 'tennis', icon: 'tennisball-outline', color: '#f0b429' },
  { key: 'running', icon: 'walk-outline', color: '#b388ff' },
  { key: 'gym', icon: 'barbell-outline', color: '#7dc52e' },
  { key: 'yoga', icon: 'body-outline', color: '#ff6b9d' },
  { key: 'other', icon: 'ellipsis-horizontal-outline', color: '#8fa3bd' },
] as const

function pad(n: number) { return String(n).padStart(2, '0') }
function nowHHMM(offsetHours = 0) {
  const d = new Date(Date.now() + offsetHours * 3600000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Minuty do startu (dzisiejsza data + time_text)
function minutesToStart(timeText: string): number {
  const [h, m] = String(timeText).split(':').map(Number)
  if (isNaN(h)) return 0
  const start = new Date()
  start.setHours(h, m || 0, 0, 0)
  return Math.round((start.getTime() - Date.now()) / 60000)
}

export default function SquadScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [squads, setSquads] = useState<any[]>([])
  const [me, setMe] = useState<any>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Szczegoly ogloszenia: pelna lista zgloszonych (tap w karte)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Formularz nowego ogloszenia
  const [showCreate, setShowCreate] = useState(false)
  const [newSport, setNewSport] = useState<string>('padel')
  const [newOther, setNewOther] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newVenue, setNewVenue] = useState('')
  const [newSpots, setNewSpots] = useState(4)
  const [creating, setCreating] = useState(false)
  const [venueSuggestions, setVenueSuggestions] = useState<string[]>([])
  const [venueLoading, setVenueLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const my = await getMyProfile()
      if (!my) return
      setMe(my)
      setSquads(await getTodaySquads((my as any).latitude ?? null, (my as any).longitude ?? null, 50))
    } catch (e) { }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
    // Odliczanie "za X min" odswieza sie samo
    const iv = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(iv)
  }, [load])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function openCreate() {
    setNewSport('padel')
    setNewOther('')
    setNewTime(nowHHMM(1))
    setNewVenue('')
    setNewSpots(4)
    setShowCreate(true)
    if (venueSuggestions.length === 0 && !venueLoading) loadVenueSuggestions()
  }

  async function loadVenueSuggestions() {
    setVenueLoading(true)
    try {
      let lat = (me as any)?.latitude ?? null
      let lng = (me as any)?.longitude ?? null
      if (lat == null || lng == null) {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          lat = loc.coords.latitude
          lng = loc.coords.longitude
        }
      }
      if (lat != null && lng != null) setVenueSuggestions(await fetchNearbyVenues(lat, lng))
    } catch (e) { }
    finally { setVenueLoading(false) }
  }

  async function handleCreate() {
    if (!me) return
    if (!/^\d{1,2}:\d{2}$/.test(newTime.trim())) { Alert.alert(t('common.error'), t('squad.badTime')); return }
    // "Inne" wymaga wpisania wlasnej aktywnosci (jedzie w kolumnie note)
    if (newSport === 'other' && !newOther.trim()) { Alert.alert(t('common.error'), t('squad.otherRequired')); return }
    setCreating(true)
    try {
      await createSquad({
        creatorId: me.id,
        sport: newSport,
        timeText: newTime.trim(),
        venue: newVenue.trim(),
        spotsTotal: newSpots,
        note: newSport === 'other' ? newOther.trim() : '',
        lat: (me as any).latitude ?? null,
        lng: (me as any).longitude ?? null,
      })
      setShowCreate(false)
      await load()
      // Push do matchy: "szukam ludzi na padla o 19:00"
      try {
        const { data: matchData } = await supabase
          .from('matches')
          .select('profile_a_id, profile_b_id')
          .or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`)
          .not('is_trainer_chat', 'is', true)
        if (matchData && matchData.length > 0) {
          const { notifyProfile } = await import('../lib/notifications')
          const body = t('squad.pushBody', { sport: newSport === 'other' ? newOther.trim() : t('squad.sport_' + newSport), time: newTime.trim() })
          for (const m of matchData) {
            const otherId = m.profile_a_id === me.id ? m.profile_b_id : m.profile_a_id
            notifyProfile(otherId, `⚡ ${me.name}`, body, { type: 'squad' })
          }
        }
      } catch (e) { }
      Alert.alert('⚡', t('squad.created'))
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setCreating(false) }
  }

  async function handleJoinLeave(squad: any) {
    if (!me) return
    const joined = squad.member_ids.includes(me.id)
    setBusyId(squad.id)
    try {
      if (joined) {
        await leaveSquad(squad.id, me.id)
      } else {
        await joinSquad(squad.id, me.id)
        // Powiadom cala ekipe (nie tylko organizatora) — sklad sie powiekszyl
        try {
          const { notifyProfile } = await import('../lib/notifications')
          const others: string[] = [...new Set([squad.creator_id, ...(squad.member_ids ?? [])])]
            .filter((id: string) => id !== me.id)
          others.forEach((id: string) =>
            notifyProfile(id, `⚡ ${me.name}`, t('squad.joinPushBody', { sport: sportLabel(squad) }), { type: 'squad' })
          )
        } catch (e) { }
      }
      await load()
    } catch (e: any) { Alert.alert(t('common.error'), e?.message) }
    finally { setBusyId(null) }
  }

  function handleDelete(squad: any) {
    Alert.alert(t('squad.deleteTitle'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trainingStatus.delete'), style: 'destructive', onPress: async () => { await deleteSquad(squad.id); await load() } },
    ])
  }

  // Organizator moze wyrzucic uczestnika (spam/troll) — tap na avatar z ✕
  function confirmKick(squad: any, member: any) {
    Alert.alert(t('squad.removeMember', { name: member.name }), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trainingStatus.delete'), style: 'destructive', onPress: async () => {
        try { await kickSquadMember(squad.id, member.id); await load() }
        catch (e: any) { Alert.alert(t('common.error'), e?.message) }
      }},
    ])
  }

  function sportOf(key: string) { return SPORTS.find(s => s.key === key) ?? SPORTS[SPORTS.length - 1] }

  // "Inne" pokazuje wlasna aktywnosc wpisana przez organizatora (kolumna note)
  function sportLabel(squad: any) {
    return squad.sport === 'other' && squad.note ? squad.note : t('squad.sport_' + squad.sport)
  }

  function countdownLabel(mins: number): string {
    if (mins <= 0) return t('squad.now')
    if (mins < 60) return t('squad.inMin', { count: mins })
    return t('squad.inTime', { time: `${Math.floor(mins / 60)}:${pad(mins % 60)}` })
  }

  function renderCard(squad: any, urgent: boolean) {
    const sport = sportOf(squad.sport)
    const joined = (squad.member_ids ?? []).length
    const free = Math.max(0, squad.spots_total - joined)
    const amMember = me && squad.member_ids.includes(me.id)
    const isCreator = me && squad.creator_id === me.id
    const mins = minutesToStart(squad.time_text)
    const busy = busyId === squad.id
    return (
      <TouchableOpacity
        key={squad.id}
        activeOpacity={0.85}
        onPress={() => setDetailId(squad.id)}
        style={[styles.card, { borderColor: sport.color + '30' }, urgent && styles.cardUrgent]}
      >
        <View style={styles.cardTop}>
          <LinearGradient
            colors={urgent ? ['#ff6b6b', '#8f2424'] : [sport.color, sport.color + '55']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.sportIcon}
          >
            <Ionicons name={sport.icon as any} size={19} color={BG} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {sportLabel(squad)} · {squad.time_text}{squad.venue ? ` · ${squad.venue}` : ''}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {squad.profiles?.name}{squad.distance_km != null ? ` · ${squad.distance_km < 1 ? '<1' : Math.round(squad.distance_km)} km` : ''}
            </Text>
          </View>
          {urgent ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.countdown}>{countdownLabel(mins)}</Text>
              <Text style={styles.countdownSub}>{t('squad.start')} {squad.time_text}</Text>
            </View>
          ) : (
            <View style={[styles.spotsPill, free === 0 && styles.spotsPillFull]}>
              <Text style={[styles.spotsText, free === 0 && { color: '#ff6b6b' }]}>{joined}/{squad.spots_total}</Text>
            </View>
          )}
        </View>

        {urgent && (
          <View style={styles.urgentSpotsRow}>
            <Text style={styles.urgentSpotsText}>
              {free === 0 ? t('squad.full') : t('squad.missing', { count: free })}
            </Text>
            <Text style={[styles.spotsText, { fontSize: 15 }]}>{joined}/{squad.spots_total}</Text>
          </View>
        )}

        {/* Uczestnicy: avatary; organizator moze usunac kazdego tapnieciem (✕) */}
        {(squad.members ?? []).length > 0 && (
          <View style={styles.membersRow}>
            {(squad.members ?? []).slice(0, 8).map((m: any) => (
              <TouchableOpacity
                key={m.id}
                style={styles.memberWrap}
                disabled={!isCreator || m.id === me?.id}
                onPress={() => confirmKick(squad, m)}
              >
                {m.photo_urls?.[0] ? (
                  <Image source={{ uri: m.photo_urls[0] }} style={styles.memberAvatar} />
                ) : (
                  <View style={[styles.memberAvatar, styles.memberAvatarEmpty]}>
                    <Ionicons name="person" size={12} color="rgba(255,255,255,0.4)" />
                  </View>
                )}
                {isCreator && m.id !== me?.id && (
                  <View style={styles.memberKick}><Ionicons name="close" size={9} color="#fff" /></View>
                )}
              </TouchableOpacity>
            ))}
            {(squad.members ?? []).length > 8 && (
              <Text style={styles.memberMore}>+{(squad.members ?? []).length - 8}</Text>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {busy ? <ActivityIndicator color={PRIMARY} style={{ flex: 1, paddingVertical: 8 }} /> : (
            <>
              {isCreator ? (
                <TouchableOpacity style={[styles.joinBtn, styles.joinBtnGhost]} onPress={() => handleDelete(squad)}>
                  <Ionicons name="trash-outline" size={15} color="#ff6b6b" />
                  <Text style={[styles.joinBtnGhostText, { color: '#ff6b6b' }]}>{t('trainingStatus.delete')}</Text>
                </TouchableOpacity>
              ) : amMember ? (
                <TouchableOpacity style={[styles.joinBtn, styles.joinBtnGhost]} onPress={() => handleJoinLeave(squad)}>
                  <Ionicons name="checkmark-circle" size={15} color={LIME} />
                  <Text style={styles.joinBtnGhostText}>{t('squad.joined')}</Text>
                </TouchableOpacity>
              ) : free === 0 ? (
                <View style={[styles.joinBtn, styles.joinBtnDisabled]}>
                  <Text style={styles.joinBtnGhostText}>{t('squad.full')}</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.joinBtn} onPress={() => handleJoinLeave(squad)}>
                  <Text style={styles.joinBtnText}>{t('squad.join')}</Text>
                </TouchableOpacity>
              )}
              {!isCreator && (
                <TouchableOpacity
                  style={styles.profileBtn}
                  onPress={() => router.push({ pathname: '/profile/profile-detail', params: { profileId: squad.creator_id } } as any)}
                >
                  <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>

  const withMins = squads.map(s => ({ ...s, _mins: minutesToStart(s.time_text) }))
  const soon = withMins.filter(s => s._mins <= 120 && s._mins > -90)
  const later = withMins.filter(s => s._mins > 120 || s._mins <= -90)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>⚡ {t('squad.title')}</Text>
          <Text style={styles.headerSub}>{t('squad.vanish')} · 50 km</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {squads.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.25)" />
            <Text style={styles.emptyText}>{t('squad.empty')}</Text>
          </View>
        )}

        {soon.length > 0 && <Text style={styles.sectionUrgent}>{t('squad.soonHeader')}</Text>}
        {soon.map(s => renderCard(s, true))}

        {later.length > 0 && <Text style={styles.sectionLater}>{t('squad.laterHeader')}</Text>}
        {later.map(s => renderCard(s, false))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openCreate}>
        <Ionicons name="add" size={19} color={BG} />
        <Text style={styles.fabText}>{t('squad.create')}</Text>
      </TouchableOpacity>

      {/* Szczegoly ogloszenia: kto sie zglosil */}
      <Modal visible={!!detailId} transparent animationType="slide" onRequestClose={() => setDetailId(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {(() => {
              const squad = squads.find(s => s.id === detailId)
              if (!squad) return null
              const sport = sportOf(squad.sport)
              const joined = (squad.member_ids ?? []).length
              const free = Math.max(0, squad.spots_total - joined)
              const amMember = me && squad.member_ids.includes(me.id)
              const isCreator = me && squad.creator_id === me.id
              const busy = busyId === squad.id
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 4 }}>
                    <LinearGradient colors={[sport.color, sport.color + '55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sportIcon}>
                      <Ionicons name={sport.icon as any} size={19} color={BG} />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetTitle}>{sportLabel(squad)} · {squad.time_text}</Text>
                      {squad.venue ? <Text style={styles.cardSub}>{squad.venue}</Text> : null}
                    </View>
                    <View style={[styles.spotsPill, free === 0 && styles.spotsPillFull]}>
                      <Text style={[styles.spotsText, free === 0 && { color: '#ff6b6b' }]}>{joined}/{squad.spots_total}</Text>
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>{t('squad.membersTitle', { count: joined })}</Text>
                  <ScrollView style={{ maxHeight: 320 }}>
                    {(squad.members ?? []).map((m: any) => (
                      <View key={m.id} style={styles.detailRow}>
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                          onPress={() => { setDetailId(null); router.push({ pathname: '/profile/profile-detail', params: { profileId: m.id } } as any) }}
                        >
                          {m.photo_urls?.[0] ? (
                            <Image source={{ uri: m.photo_urls[0] }} style={styles.detailAvatar} />
                          ) : (
                            <View style={[styles.detailAvatar, styles.memberAvatarEmpty]}>
                              <Ionicons name="person" size={15} color="rgba(255,255,255,0.4)" />
                            </View>
                          )}
                          <Text style={styles.detailName} numberOfLines={1}>{m.name}</Text>
                          {m.id === squad.creator_id && (
                            <View style={styles.organizerPill}><Text style={styles.organizerPillText}>{t('squad.organizer')}</Text></View>
                          )}
                        </TouchableOpacity>
                        {isCreator && m.id !== me?.id && (
                          <TouchableOpacity style={styles.detailKickBtn} onPress={() => confirmKick(squad, m)}>
                            <Ionicons name="close" size={14} color="#ff6b6b" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </ScrollView>

                  {/* Czat ekipy: dla czlonkow — do ustalenia szczegolow spotkania.
                      Nawigacja po zamknieciu modala (setTimeout — iOS crashuje przy push w trakcie dismissu) */}
                  {amMember && (
                    <TouchableOpacity
                      style={styles.squadChatBtn}
                      onPress={() => {
                        const chatTitle = `${sportLabel(squad)} · ${squad.time_text}`
                        setDetailId(null)
                        setTimeout(() => router.push({ pathname: '/squad-chat', params: { squadId: squad.id, title: chatTitle } } as any), 400)
                      }}
                    >
                      <Ionicons name="chatbubbles" size={17} color={BG} />
                      <Text style={styles.squadChatBtnText}>{t('squad.chat')}</Text>
                    </TouchableOpacity>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                    {busy ? <ActivityIndicator color={PRIMARY} style={{ flex: 1, paddingVertical: 10 }} /> : isCreator ? (
                      <TouchableOpacity style={[styles.joinBtn, styles.joinBtnGhost]} onPress={() => { setDetailId(null); handleDelete(squad) }}>
                        <Ionicons name="trash-outline" size={15} color="#ff6b6b" />
                        <Text style={[styles.joinBtnGhostText, { color: '#ff6b6b' }]}>{t('trainingStatus.delete')}</Text>
                      </TouchableOpacity>
                    ) : amMember ? (
                      <TouchableOpacity style={[styles.joinBtn, styles.joinBtnGhost]} onPress={() => handleJoinLeave(squad)}>
                        <Ionicons name="checkmark-circle" size={15} color={LIME} />
                        <Text style={styles.joinBtnGhostText}>{t('squad.joined')}</Text>
                      </TouchableOpacity>
                    ) : free === 0 ? (
                      <View style={[styles.joinBtn, styles.joinBtnDisabled]}>
                        <Text style={styles.joinBtnGhostText}>{t('squad.full')}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.joinBtn} onPress={() => handleJoinLeave(squad)}>
                        <Text style={styles.joinBtnText}>{t('squad.join')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setDetailId(null)}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </>
              )
            })()}
          </View>
        </View>
      </Modal>

      {/* Nowe ogloszenie */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('squad.createTitle')}</Text>

            <Text style={styles.fieldLabel}>{t('squad.fieldSport')}</Text>
            <View style={styles.sportGrid}>
              {SPORTS.map(s => {
                const active = newSport === s.key
                return (
                  <TouchableOpacity key={s.key} style={styles.sportTileWrap} onPress={() => setNewSport(s.key)} activeOpacity={0.85}>
                    {active ? (
                      <LinearGradient colors={[s.color, s.color + '55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sportTile}>
                        <Ionicons name={s.icon as any} size={22} color={BG} />
                        <Text style={[styles.sportTileText, { color: BG, fontWeight: '800' }]}>{t('squad.sport_' + s.key)}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.sportTile, styles.sportTileIdle]}>
                        <Ionicons name={s.icon as any} size={22} color={s.color} />
                        <Text style={styles.sportTileText} numberOfLines={1}>{t('squad.sport_' + s.key)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* "Inne": wlasna aktywnosc wpisana recznie */}
            {newSport === 'other' && (
              <TextInput
                style={[styles.venueInput, { marginTop: 8 }]}
                value={newOther}
                onChangeText={setNewOther}
                placeholder={t('squad.otherPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                maxLength={25}
                autoFocus
              />
            )}

            <Text style={styles.fieldLabel}>{t('squad.fieldTime')}</Text>
            <View style={styles.chipsWrap}>
              {[nowHHMM(1), '17:00', '18:00', '19:00', '20:00'].map(tm => (
                <TouchableOpacity key={tm} style={[styles.sportChip, newTime === tm && { backgroundColor: LIME }]} onPress={() => setNewTime(tm)}>
                  <Text style={[styles.sportChipText, newTime === tm && { color: BG, fontWeight: '800' }]}>{tm}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.timeInput}
                value={newTime}
                onChangeText={setNewTime}
                placeholder="19:30"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>

            <Text style={styles.fieldLabel}>{t('squad.fieldVenue')}</Text>
            <TextInput
              style={styles.venueInput}
              value={newVenue}
              onChangeText={setNewVenue}
              placeholder={t('squad.venuePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={60}
            />
            {venueLoading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 6 }} /> : (
              venueSuggestions.filter(v => v.toLowerCase().includes(newVenue.trim().toLowerCase())).slice(0, 4).map(v => (
                <TouchableOpacity key={v} style={styles.venueRow} onPress={() => setNewVenue(v)}>
                  <Ionicons name="location-outline" size={14} color={PRIMARY} />
                  <Text style={styles.venueRowText} numberOfLines={1}>{v}</Text>
                </TouchableOpacity>
              ))
            )}

            <Text style={styles.fieldLabel}>{t('squad.fieldSpots')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setNewSpots(v => Math.max(2, v - 1))}>
                <Ionicons name="remove" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.spotsBig}>{newSpots}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setNewSpots(v => Math.min(30, v + 1))}>
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.createBtn, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BG} /> : (
                <Text style={styles.createBtnText}>{t('squad.createBtn')}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setShowCreate(false)}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 70 },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },
  sectionUrgent: { fontSize: 10.5, fontWeight: '800', color: '#ff6b6b', letterSpacing: 1.2, marginTop: 4 },
  sectionLater: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2, marginTop: 10 },
  card: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 13, gap: 10, borderWidth: 1 },
  cardUrgent: { backgroundColor: 'rgba(255,107,107,0.07)', borderColor: 'rgba(255,107,107,0.4)' },
  membersRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberWrap: { position: 'relative' },
  memberAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  memberAvatarEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  memberKick: { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#ff5050', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BG_LIGHT },
  memberMore: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginLeft: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  detailAvatar: { width: 38, height: 38, borderRadius: 19 },
  detailName: { fontSize: 14, fontWeight: '700', color: '#fff', flexShrink: 1 },
  organizerPill: { backgroundColor: 'rgba(148,227,54,0.15)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 },
  organizerPillText: { fontSize: 9.5, fontWeight: '800', color: LIME },
  detailKickBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,80,80,0.12)', alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sportIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cardSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  countdown: { fontSize: 16, fontWeight: '900', color: '#ff6b6b' },
  countdownSub: { fontSize: 9.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  spotsPill: { backgroundColor: 'rgba(148,227,54,0.14)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  spotsPillFull: { backgroundColor: 'rgba(255,107,107,0.14)' },
  spotsText: { fontSize: 14, fontWeight: '900', color: LIME },
  urgentSpotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  urgentSpotsText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  joinBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: LIME, borderRadius: 12, paddingVertical: 10 },
  squadChatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: LIME, borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  squadChatBtnText: { fontSize: 14.5, fontWeight: '800', color: BG },
  joinBtnText: { fontSize: 13.5, fontWeight: '800', color: BG },
  joinBtnGhost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  joinBtnGhostText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  joinBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.05)' },
  profileBtn: { width: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 28, right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIME, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 13, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabText: { fontSize: 13.5, fontWeight: '800', color: BG },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '88%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  fieldLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 7 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sportChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  sportChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sportTileWrap: { flexBasis: '22%', flexGrow: 1 },
  sportTile: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', gap: 4 },
  sportTileIdle: { backgroundColor: 'rgba(255,255,255,0.07)' },
  sportTileText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  timeInput: { backgroundColor: BG, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, color: '#fff', minWidth: 64, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  venueInput: { backgroundColor: BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#fff', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  venueRowText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  stepBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  spotsBig: { fontSize: 26, fontWeight: '900', color: '#fff', minWidth: 44, textAlign: 'center' },
  createBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  createBtnText: { fontSize: 15, fontWeight: '800', color: BG },
})
