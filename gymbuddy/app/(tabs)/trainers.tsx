import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getMyProfile, getTrainers } from '../../lib/supabase'

const LIME = '#94e336'
const BLUE = '#4fc3f7'
const GOLD = '#f0b429'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const SPECS = ['strength', 'weight_loss', 'muscle_gain', 'cardio', 'crossfit', 'hiit', 'yoga', 'pilates', 'boxing', 'running', 'swimming', 'mobility', 'powerlifting', 'calisthenics', 'functional_fitness', 'martial_arts']

export default function TrainersScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [trainers, setTrainers] = useState<any[]>([])
  const [spec, setSpec] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 })
  const [radius, setRadius] = useState(50)
  const [isTrainer, setIsTrainer] = useState(false)

  useEffect(() => { loadData() }, [])
  useEffect(() => { loadTrainers(coords.lat, coords.lng, spec, radius) }, [spec])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      setIsTrainer(!!(me as any)?.is_trainer)
      const lat = (me as any)?.latitude ?? 0
      const lng = (me as any)?.longitude ?? 0
      // Ten sam promien co filtry w talii swipe — jedna spójna zasada odległości
      const savedRadius = parseInt((await AsyncStorage.getItem('filter_radius')) ?? '50') || 50
      setCoords({ lat, lng })
      setRadius(savedRadius)
      setTrainers(await getTrainers(lat, lng, spec, savedRadius))
    } catch (e) { console.log('trainers error:', e) }
    finally { setLoading(false); setRefreshing(false) }
  }

  async function loadTrainers(lat: number, lng: number, s: string, r: number) {
    setTrainers(await getTrainers(lat, lng, s, r))
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('trainer.catalogTitle')}</Text>
        <TouchableOpacity style={styles.becomeBtn} onPress={() => router.push('/trainer-hub' as any)}>
          <Ionicons name={isTrainer ? 'settings-outline' : 'school'} size={13} color="#0d1b2e" />
          <Text style={styles.becomeBtnText}>{isTrainer ? t('trainer.myPanel') : t('trainer.becomeCta')}</Text>
        </TouchableOpacity>
      </View>

      {/* Filtr specjalizacji */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.specsRow}>
        <TouchableOpacity style={[styles.specChip, spec === '' && styles.specChipActive]} onPress={() => setSpec('')}>
          <Text style={[styles.specChipText, spec === '' && styles.specChipTextActive]}>{t('trainer.allSpecs')}</Text>
        </TouchableOpacity>
        {SPECS.map(s => (
          <TouchableOpacity key={s} style={[styles.specChip, spec === s && styles.specChipActive]} onPress={() => setSpec(s)}>
            <Text style={[styles.specChipText, spec === s && styles.specChipTextActive]}>{t('goals.' + s)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={BLUE} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData() }} tintColor={BLUE} />}
        >
          {trainers.map(tr => (
            <TouchableOpacity key={tr.profile_id} style={styles.card} onPress={() => router.push(`/trainer/${tr.profile_id}` as any)} activeOpacity={0.8}>
              {tr.photo_url ? (
                <Image source={{ uri: tr.photo_url }} style={styles.cardPhoto} />
              ) : (
                <View style={[styles.cardPhoto, styles.cardPhotoEmpty]}><Ionicons name="person" size={24} color="rgba(255,255,255,0.3)" /></View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardName} numberOfLines={1}>{tr.name}</Text>
                  {tr.trainer_verified && (
                    <View style={styles.verifiedPill}>
                      <Ionicons name="shield-checkmark" size={11} color={BG} />
                      <Text style={styles.verifiedPillText}>{t('trainer.verifiedShort')}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardMetaRow}>
                  {tr.rating ? (
                    <Text style={styles.cardRating}>{'★'} {tr.rating} ({tr.reviews_count})</Text>
                  ) : (
                    <Text style={styles.cardMetaMuted}>{t('trainer.noReviews')}</Text>
                  )}
                  {tr.distance_km !== null && <Text style={styles.cardMetaMuted}>· {tr.distance_km} km</Text>}
                  {tr.city ? <Text style={styles.cardMetaMuted}>· {tr.city}</Text> : null}
                </View>
                {(tr.specializations ?? []).length > 0 && (
                  <Text style={styles.cardSpecs} numberOfLines={1}>
                    {(tr.specializations ?? []).slice(0, 3).map((s: string) => t('goals.' + s)).join(' · ')}
                  </Text>
                )}
                {tr.price_info ? <Text style={styles.cardPrice} numberOfLines={1}>{tr.price_info}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
          ))}
          {trainers.length === 0 && (
            <View style={styles.empty}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>{"🥇"}</Text>
              <Text style={styles.emptyText}>{t('trainer.emptyCatalog')}</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/trainer-hub' as any)}>
                <Text style={styles.emptyBtnText}>{t('trainer.becomeCta')}</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.pricingNote}>
            <Ionicons name="information-circle-outline" size={15} color="rgba(255,255,255,0.35)" />
            <Text style={styles.pricingNoteText}>{t('trainer.catalogDisclaimer')}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  becomeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11 },
  becomeBtnText: { fontSize: 12, fontWeight: '800', color: '#0d1b2e' },
  specsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 14 },
  specChip: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: BG_LIGHT, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  specChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  specChipText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  specChipTextActive: { color: BG, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardPhoto: { width: 58, height: 58, borderRadius: 29 },
  cardPhotoEmpty: { backgroundColor: '#2e415c', alignItems: 'center', justifyContent: 'center' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15.5, fontWeight: '800', color: '#fff', flexShrink: 1 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: LIME, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  verifiedPillText: { fontSize: 9.5, fontWeight: '800', color: BG },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardRating: { fontSize: 12.5, color: GOLD, fontWeight: '700' },
  cardMetaMuted: { fontSize: 12.5, color: 'rgba(255,255,255,0.4)' },
  cardSpecs: { fontSize: 12, color: BLUE, marginTop: 3 },
  cardPrice: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14.5, textAlign: 'center', marginBottom: 18, paddingHorizontal: 24 },
  emptyBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
  emptyBtnText: { color: BG, fontSize: 14.5, fontWeight: '800' },
  pricingNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingHorizontal: 8, marginTop: 8 },
  pricingNoteText: { flex: 1, fontSize: 11.5, color: 'rgba(255,255,255,0.35)', lineHeight: 16 },
})
