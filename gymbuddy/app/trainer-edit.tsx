import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Switch, KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import { supabase, getMyProfile, getMyTrainerProfile, upsertTrainerProfile } from '../lib/supabase'

// Studio trenera: czern + zloto
const SBG = '#0b0b0e'
const SCARD = '#17171c'
const GOLD = '#d4af37'
const SBORDER = 'rgba(212,175,55,0.35)'

const SPECS = ['strength', 'weight_loss', 'muscle_gain', 'cardio', 'crossfit', 'hiit', 'yoga', 'pilates', 'boxing', 'running', 'swimming', 'mobility', 'powerlifting', 'calisthenics', 'functional_fitness', 'martial_arts']

export default function TrainerEditScreen() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingCert, setUploadingCert] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [specializations, setSpecializations] = useState<string[]>([])
  const [experienceYears, setExperienceYears] = useState('')
  const [description, setDescription] = useState('')
  const [priceInfo, setPriceInfo] = useState('')
  const [instagram, setInstagram] = useState('')
  const [website, setWebsite] = useState('')
  const [certStatus, setCertStatus] = useState('none')
  const [showInDeck, setShowInDeck] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setProfile(me)
      setShowInDeck((me as any).trainer_show_in_deck !== false)
      const tp = await getMyTrainerProfile(me.id)
      if (tp) {
        setSpecializations(tp.specializations ?? [])
        setExperienceYears(String(tp.experience_years ?? ''))
        setDescription(tp.description ?? '')
        setPriceInfo(tp.price_info ?? '')
        setInstagram(tp.instagram ?? '')
        setWebsite(tp.website ?? '')
        setCertStatus(tp.cert_status ?? 'none')
      }
    } finally { setLoading(false) }
  }

  function toggleSpec(s: string) {
    setSpecializations(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    try {
      const ok = await upsertTrainerProfile(profile.id, {
        specializations,
        experience_years: parseInt(experienceYears) || 0,
        description: description.trim(),
        price_info: priceInfo.trim(),
        instagram: instagram.trim(),
        website: website.trim(),
      })
      await supabase.from('profiles').update({ trainer_show_in_deck: showInDeck }).eq('id', profile.id)
      if (ok) { Alert.alert('✅', t('trainer.saved')); router.back() }
      else Alert.alert(t('common.error'))
    } finally { setSaving(false) }
  }

  async function handleUploadCert() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert(t('common.error')); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled || !result.assets[0]) return
    setUploadingCert(true)
    try {
      const uri = result.assets[0].uri
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `${user.id}/certificate_${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri, name: `cert.${ext}`, type: `image/${ext}` } as any)
      const { error } = await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
      if (error) { Alert.alert(t('common.error') + ': ' + error.message); return }
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      await upsertTrainerProfile(profile.id, { certificate_url: data.publicUrl, cert_status: 'pending' })
      setCertStatus('pending')
      // Push do moderatorow — certyfikat czeka na weryfikacje w panelu admina
      supabase.functions.invoke('notify-admins', { body: { kind: 'cert' } }).catch(() => { })
      Alert.alert('📄', t('trainer.certSent'))
    } finally { setUploadingCert(false) }
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={GOLD} /></View>
  )

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: SBG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('trainer.editCard')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.certBanner, certStatus === 'approved' && { borderColor: 'rgba(148,227,54,0.5)' }, certStatus === 'pending' && { borderColor: SBORDER }, certStatus === 'rejected' && { borderColor: 'rgba(255,107,107,0.5)' }]}>
        <Ionicons
          name={certStatus === 'approved' ? 'shield-checkmark' : certStatus === 'pending' ? 'hourglass' : certStatus === 'rejected' ? 'close-circle' : 'shield-outline'}
          size={18}
          color={certStatus === 'approved' ? '#94e336' : certStatus === 'rejected' ? '#ff6b6b' : GOLD}
        />
        <Text style={styles.certText}>
          {certStatus === 'approved' ? t('trainer.certApproved') : certStatus === 'pending' ? t('trainer.certPending') : certStatus === 'rejected' ? t('trainer.certRejected') : t('trainer.certNone')}
        </Text>
        {certStatus !== 'approved' && certStatus !== 'pending' && (
          <TouchableOpacity style={styles.certBtn} onPress={handleUploadCert} disabled={uploadingCert}>
            {uploadingCert ? <ActivityIndicator size="small" color={SBG} /> : (
              <Text style={styles.certBtnText}>{t('trainer.uploadCert')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.fieldLabel}>{t('trainer.specializations')}</Text>
      <View style={styles.chipsWrap}>
        {SPECS.map(s => (
          <TouchableOpacity key={s} style={[styles.chip, specializations.includes(s) && styles.chipActive]} onPress={() => toggleSpec(s)}>
            <Text style={[styles.chipText, specializations.includes(s) && styles.chipTextActive]}>{t('goals.' + s)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>{t('trainer.experience')}</Text>
      <TextInput style={styles.input} value={experienceYears} onChangeText={setExperienceYears} keyboardType="number-pad" placeholder="5" placeholderTextColor="rgba(255,255,255,0.3)" />

      <Text style={styles.fieldLabel}>{t('trainer.description')}</Text>
      <TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription} multiline numberOfLines={4} placeholder={t('trainer.descriptionPlaceholder')} placeholderTextColor="rgba(255,255,255,0.3)" />

      <Text style={styles.fieldLabel}>{t('trainer.priceInfo')}</Text>
      <TextInput style={styles.input} value={priceInfo} onChangeText={setPriceInfo} placeholder={t('trainer.pricePlaceholder')} placeholderTextColor="rgba(255,255,255,0.3)" />
      <Text style={styles.fieldHint}>{t('trainer.pricingDisclaimer')}</Text>

      <Text style={styles.fieldLabel}>Instagram</Text>
      <TextInput style={styles.input} value={instagram} onChangeText={setInstagram} autoCapitalize="none" placeholder="@twoj_profil" placeholderTextColor="rgba(255,255,255,0.3)" />

      <Text style={styles.fieldLabel}>{t('trainer.website')}</Text>
      <TextInput style={styles.input} value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="https://twojastrona.pl" placeholderTextColor="rgba(255,255,255,0.3)" />

      <View style={styles.deckRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deckLabel}>{t('trainer.showInDeck')}</Text>
          <Text style={styles.deckSub}>{t('trainer.showInDeckSub')}</Text>
        </View>
        <Switch
          value={showInDeck}
          onValueChange={setShowInDeck}
          trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(212,175,55,0.5)' }}
          thumbColor={showInDeck ? GOLD : '#fff'}
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color={SBG} /> : (
          <><Ionicons name="checkmark" size={19} color={SBG} /><Text style={styles.saveBtnText}>{t('trainer.save')}</Text></>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SBG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SBG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 55, paddingBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  certBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: SCARD, borderRadius: 14, marginHorizontal: 16, padding: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 18 },
  certText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  certBtn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  certBtnText: { color: SBG, fontSize: 12, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(212,175,55,0.8)', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 8, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  chip: { borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: SCARD, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipActive: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  chipTextActive: { color: SBG, fontWeight: '700' },
  input: { backgroundColor: SCARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, marginHorizontal: 20, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  fieldHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', paddingHorizontal: 22, marginTop: -6, marginBottom: 12, lineHeight: 16 },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SCARD, borderRadius: 14, marginHorizontal: 16, padding: 14, marginTop: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  deckLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },
  deckSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 16, paddingVertical: 15, marginHorizontal: 20, marginTop: 18 },
  saveBtnText: { color: SBG, fontSize: 16, fontWeight: '800' },
})
