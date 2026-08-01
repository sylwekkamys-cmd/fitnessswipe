import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { supabase, getMyProfile } from '../lib/supabase'

// Tryb podroznika jako pelny ekran (wczesniej: sam przelacznik w Ustawieniach).
// Nowosc: cel podrozy (miasto + wspolrzedne) — bez tego talia liczyla dystans
// od lokalizacji DOMOWEJ, wiec podroznik nie byl realnie widoczny na miejscu.

const VIOLET = '#b388ff'
const VIOLET_DARK = '#7a42b5'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'
const LIME = '#94e336'

const DURATIONS = [
  { key: 'week1', days: 7 },
  { key: 'week2', days: 14 },
  { key: 'month1', days: 30 },
] as const

function daysLeft(until: string | null): number | null {
  if (!until) return null
  const diff = new Date(until + 'T23:59:59').getTime() - Date.now()
  const d = Math.ceil(diff / 86400000)
  return d >= 0 ? d : null
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TravelerScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [existingUntil, setExistingUntil] = useState<string | null>(null)
  const [durationDays, setDurationDays] = useState<number>(7)
  // Wlasny termin wybrany recznie — nadpisuje presety, gdy ustawiony
  const [customUntil, setCustomUntil] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [city, setCity] = useState('')
  const [note, setNote] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile()
        if (!p) return
        setProfileId(p.id)
        const until = (p as any).traveler_until ?? null
        const active = !!until && until >= new Date().toISOString().split('T')[0]
        setEnabled(active)
        setExistingUntil(active ? until : null)
        // Zapisany termin traktujemy jako wlasna date — user moze go zmienic presetem lub pickerem
        if (active) setCustomUntil(until)
        setCity((p as any).traveler_city ?? '')
        setNote((p as any).traveler_note ?? '')
        setLat((p as any).traveler_lat ?? null)
        setLng((p as any).traveler_lng ?? null)
      } catch (e) { }
      finally { setLoading(false) }
    })()
  }, [])

  // Miasto pochodzi WYLACZNIE z GPS (reverse-geocode) — bez recznego wpisywania,
  // zeby nikt nie mogl "przeskakiwac" po miastach bez faktycznego tam bycia
  async function useCurrentLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { Alert.alert(t('common.error'), t('trainingStatus.noPermission')); return }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [address] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      setLat(loc.coords.latitude)
      setLng(loc.coords.longitude)
      setCity(address?.city || address?.region || t('traveler.somewhere'))
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally { setLocating(false) }
  }

  async function handleSave() {
    if (!profileId) return
    if (enabled && (lat == null || lng == null)) {
      Alert.alert(t('common.error'), t('traveler.locationRequired'))
      return
    }
    setSaving(true)
    try {
      if (!enabled) {
        await supabase.from('profiles').update({
          traveler_until: null, traveler_city: null, traveler_lat: null, traveler_lng: null, traveler_note: null,
        }).eq('id', profileId)
        setExistingUntil(null)
        Alert.alert('✈️', t('traveler.turnedOff'))
      } else {
        const until = customUntil ?? new Date(Date.now() + durationDays * 86400000).toISOString().split('T')[0]
        await supabase.from('profiles').update({
          traveler_until: until,
          traveler_city: city.trim() || null,
          traveler_lat: lat,
          traveler_lng: lng,
          traveler_note: note.trim() || null,
        }).eq('id', profileId)
        setExistingUntil(until)
        Alert.alert('✈️', t('traveler.saved'))
      }
      router.back()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setSaving(false) }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={VIOLET} /></View>

  const left = daysLeft(existingUntil)

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('traveler.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.introCard}>
        <View style={styles.introIcon}><Ionicons name="airplane" size={22} color={VIOLET} /></View>
        <Text style={styles.introText}>{t('traveler.explain')}</Text>
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>{t('traveler.toggle')}</Text>
          {left != null ? (
            <Text style={styles.toggleSub}>{t('traveler.activeStatus', { count: left, city: city || t('traveler.somewhere') })}</Text>
          ) : (
            <Text style={styles.toggleSub}>{t('traveler.toggleSub')}</Text>
          )}
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(122,66,181,0.6)' }}
          thumbColor={enabled ? VIOLET : '#fff'}
        />
      </View>

      {enabled && (
        <>
          <Text style={styles.sectionLabel}>{t('traveler.howLong')}</Text>
          <View style={styles.chipsRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d.key}
                style={[styles.chip, !customUntil && durationDays === d.days && styles.chipActive]}
                onPress={() => { setDurationDays(d.days); setCustomUntil(null) }}
              >
                <Text style={[styles.chipText, !customUntil && durationDays === d.days && styles.chipTextActive]}>{t('traveler.' + d.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Wlasny termin — uzytkownik sam wybiera date zamiast gotowych okresow */}
          <TouchableOpacity
            style={[styles.customDateBtn, !!customUntil && styles.customDateBtnActive]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color={customUntil ? BG : VIOLET} />
            <Text style={[styles.customDateBtnText, !!customUntil && { color: BG }]}>
              {customUntil ? t('traveler.customDateUntil', { date: customUntil }) : t('traveler.customDate')}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={customUntil ? new Date(customUntil + 'T12:00:00') : new Date(Date.now() + 86400000)}
              mode="date"
              minimumDate={new Date(Date.now() + 86400000)}
              onChange={(e: any, d?: Date) => { setShowDatePicker(false); if (d) setCustomUntil(toDateStr(d)) }}
            />
          )}

          <Text style={styles.sectionLabel}>{t('traveler.whereLabel')}</Text>
          <Text style={styles.gpsHint}>{t('traveler.gpsHint')}</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={useCurrentLocation} disabled={locating}>
            {locating ? <ActivityIndicator size="small" color={VIOLET} /> : (
              <Ionicons name={lat != null ? 'checkmark-circle' : 'locate-outline'} size={18} color={lat != null ? LIME : VIOLET} />
            )}
            <Text style={[styles.locationBtnText, lat != null && { color: LIME }]}>
              {lat != null ? (city || t('traveler.locationSet')) : t('traveler.useLocation')}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>{t('traveler.noteLabel')}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={note}
            onChangeText={setNote}
            placeholder={t('traveler.notePlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.3)"
            multiline
            maxLength={100}
          />
        </>
      )}

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color={BG} /> : <Text style={styles.saveBtnText}>{t('common.save')}</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  introCard: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(122,66,181,0.1)', borderWidth: 1, borderColor: 'rgba(179,136,255,0.3)', borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 16, alignItems: 'flex-start' },
  introIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(179,136,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.8)', lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BG_LIGHT, borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 8 },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toggleSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  sectionLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginTop: 18, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16 },
  chip: { flex: 1, backgroundColor: BG_LIGHT, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  chipActive: { backgroundColor: VIOLET },
  chipText: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  chipTextActive: { color: BG },
  customDateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: BG_LIGHT, borderRadius: 12, paddingVertical: 11, marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderColor: 'rgba(179,136,255,0.4)' },
  customDateBtnActive: { backgroundColor: VIOLET, borderColor: VIOLET },
  customDateBtnText: { fontSize: 12.5, fontWeight: '700', color: VIOLET },
  input: { backgroundColor: BG_LIGHT, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#fff', marginHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  gpsHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginHorizontal: 16, marginTop: -2, marginBottom: 8, lineHeight: 16 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BG_LIGHT, borderRadius: 12, paddingVertical: 13, marginHorizontal: 16, borderWidth: 1.5, borderColor: 'rgba(179,136,255,0.4)' },
  locationBtnText: { fontSize: 13.5, fontWeight: '700', color: VIOLET },
  saveBtn: { backgroundColor: VIOLET, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginHorizontal: 16, marginTop: 26 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: BG },
})
