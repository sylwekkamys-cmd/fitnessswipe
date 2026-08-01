import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase, getMyProfile } from '../lib/supabase'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

const GESTURES = [
  { emoji: '✌️', label: 'Peace sign (two fingers)' },
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '🤙', label: 'Shaka (pinky and thumb)' },
  { emoji: '☝️', label: 'One finger up' },
]

export default function VerificationScreen() {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [photo, setPhoto] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [gesture] = useState(() => GESTURES[Math.floor(Math.random() * GESTURES.length)])
  // Zweryfikowany profil nie robi weryfikacji drugi raz — od razu ekran "juz zweryfikowany".
  // Bez zdjecia profilowego weryfikacja tez nie startuje — AI porownuje selfie z tym zdjeciem,
  // wiec bez niego badge "Zweryfikowany" nie potwierdzalby niczego sensownego.
  const [checkingVerified, setCheckingVerified] = useState(true)
  const [alreadyVerified, setAlreadyVerified] = useState(false)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    getMyProfile()
      .then(p => {
        setAlreadyVerified((p as any)?.is_verified === true)
        setProfilePhotoUrl((p as any)?.photo_urls?.[0] ?? null)
      })
      .catch(() => { })
      .finally(() => setCheckingVerified(false))
  }, [])

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      const { status: galleryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (galleryStatus !== 'granted') { Alert.alert(t('common.error')); return }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri)
      return
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri)
  }

  // Zdjecie profilowe (zdalne URL) trzeba pobrac lokalnie, zeby odczytac jako base64
  async function downloadToBase64(url: string): Promise<string> {
    const local = FileSystem.cacheDirectory + 'verify_ref.jpg'
    await FileSystem.downloadAsync(url, local)
    return await FileSystem.readAsStringAsync(local, { encoding: 'base64' })
  }

  async function verifyWithAI() {
    if (!photo || !profilePhotoUrl) return
    setLoading(true)
    try {
      const profile = await getMyProfile()
      if (!profile) throw new Error('No profile')

      const base64 = await FileSystem.readAsStringAsync(photo, { encoding: 'base64' })
      const referenceBase64 = await downloadToBase64(profilePhotoUrl)

      const { data, error } = await supabase.functions.invoke('ai', {
        body: { action: 'verify-photo', gestureLabel: `${gesture.emoji} ${gesture.label}`, imageBase64: base64, referenceImageBase64: referenceBase64 },
      })
      if (error) throw error
      const text = data?.content ?? '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)

      if (result.face_visible && result.gesture_correct && result.is_real_person && result.same_person) {
        const ext = 'jpg'
        const path = `${profile.id}/verification.${ext}`
        const formData = new FormData()
        formData.append('file', { uri: photo, name: `verification.${ext}`, type: `image/${ext}` } as any)
        await supabase.storage.from('profile-photos').upload(path, formData, { contentType: `image/${ext}`, upsert: true })
        const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path)
        await supabase.from('profiles').update({ is_verified: true, verification_photo: urlData.publicUrl }).eq('id', profile.id)
        setStep(3)
      } else {
        Alert.alert(t('verification.failed'),
          !result.face_visible ? t('verification.noFace') :
          !result.gesture_correct ? t('verification.noGesture') :
          !result.same_person ? t('verification.notSamePerson') :
          t('verification.notReal'))
        setPhoto(null)
        setStep(2)
      }
    } catch (e: any) {
      console.log('Blad weryfikacji:', e)
      Alert.alert(t('common.error'), t('common.retry'))
      setPhoto(null)
    } finally { setLoading(false) }
  }

  if (checkingVerified) return (
    <View style={styles.successContainer}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )

  // Bez zdjecia profilowego nie ma z czym porownac selfie — zablokuj start
  if (!alreadyVerified && !profilePhotoUrl) return (
    <View style={styles.successContainer}>
      <View style={styles.successBadge}>
        <Ionicons name="image-outline" size={38} color={BG} />
      </View>
      <Text style={styles.successTitle}>{t('verification.needPhotoTitle')}</Text>
      <Text style={[styles.subtitle, { marginBottom: 24 }]}>{t('verification.needPhotoSub')}</Text>
      <TouchableOpacity style={[styles.button, { alignSelf: 'stretch' }]} onPress={() => router.replace('/(tabs)/profile?edit=1' as any)}>
        <Text style={styles.buttonText}>{t('verification.addPhotoBtn')}</Text>
      </TouchableOpacity>
    </View>
  )

  // Profil juz zweryfikowany — informacja zamiast ponownej weryfikacji
  if (alreadyVerified && step !== 3) return (
    <View style={styles.successContainer}>
      <View style={styles.successBadge}>
        <Ionicons name="shield-checkmark" size={38} color={BG} />
      </View>
      <Text style={styles.successTitle}>{t('verification.alreadyVerified')}</Text>
      <View style={styles.successCard}>
        <View style={styles.successRow}>
          <Ionicons name="ribbon-outline" size={18} color={PRIMARY} />
          <Text style={styles.successRowText}>{t('verification.badge')}</Text>
        </View>
        <View style={styles.successRow}>
          <Ionicons name="trending-up-outline" size={18} color={PRIMARY} />
          <Text style={styles.successRowText}>{t('verification.higher')}</Text>
        </View>
        <View style={styles.successRow}>
          <Ionicons name="people-outline" size={18} color={PRIMARY} />
          <Text style={styles.successRowText}>{t('verification.morematches')}</Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.button, { alignSelf: 'stretch' }]} onPress={() => router.back()}>
        <Text style={styles.buttonText}>{t('verification.backToProfile')}</Text>
      </TouchableOpacity>
    </View>
  )

  if (step === 1) return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{"🛡️"}</Text>
      </View>
      <Text style={styles.title}>{t('verification.title')}</Text>
      <Text style={styles.subtitle}>{t('verification.subtitle')}</Text>
      <View style={styles.benefitsList}>
        <View style={styles.benefit}><Text style={styles.benefitIcon}>✅</Text><Text style={styles.benefitText}>{t('verification.badge')}</Text></View>
        <View style={styles.benefit}><Text style={styles.benefitIcon}>🔝</Text><Text style={styles.benefitText}>{t('verification.higher')}</Text></View>
        <View style={styles.benefit}><Text style={styles.benefitIcon}>💪</Text><Text style={styles.benefitText}>{t('verification.morematches')}</Text></View>
        <View style={styles.benefit}><Text style={styles.benefitIcon}>🔒</Text><Text style={styles.benefitText}>{t('verification.private')}</Text></View>
      </View>
      <Text style={styles.howTitle}>{t('verification.howTitle')}</Text>
      <View style={styles.steps}>
        <View style={styles.stepItem}><View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View><Text style={styles.stepText}>{t('verification.step1')}</Text></View>
        <View style={styles.stepItem}><View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View><Text style={styles.stepText}>{t('verification.step2')}</Text></View>
        <View style={styles.stepItem}><View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View><Text style={styles.stepText}>{t('verification.step3')}</Text></View>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => setStep(2)}>
        <Text style={styles.buttonText}>{t('verification.start')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )

  if (step === 2) return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => { setPhoto(null); setStep(1) }}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.title}>{t('verification.selfieTitle')}</Text>
      <Text style={styles.subtitle}>{t('verification.selfieSubtitle')}</Text>
      <View style={styles.gestureCard}>
        <Text style={styles.gestureEmoji}>{gesture.emoji}</Text>
        <Text style={styles.gestureLabel}>{gesture.label}</Text>
      </View>
      {photo ? (
        <View style={styles.photoContainer}>
          <Image source={{ uri: photo }} style={styles.photo} />
          <TouchableOpacity style={styles.retakeBtn} onPress={() => setPhoto(null)}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retakeBtnText}>{t('verification.retake')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
          <Ionicons name="camera" size={48} color="rgba(255,255,255,0.4)" />
          <Text style={styles.cameraBtnText}>{t('verification.selfieTitle')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.button, (!photo || loading) && styles.buttonDisabled]} onPress={verifyWithAI} disabled={!photo || loading}>
        {loading ? (
          <><ActivityIndicator color="#fff" size="small" /><Text style={styles.buttonText}>  {t('verification.verifying')}</Text></>
        ) : (
          <Text style={styles.buttonText}>{t('verification.verify')}</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.privacyNote}>🔒 {t('verification.privacyNote')}</Text>
    </ScrollView>
  )

  return (
    <View style={styles.successContainer}>
      <View style={styles.successBadge}>
        <Ionicons name="shield-checkmark" size={38} color={BG} />
      </View>
      <Text style={styles.successTitle}>{t('verification.successTitle')}</Text>
      <View style={styles.successCard}>
        <View style={styles.successRow}>
          <Ionicons name="ribbon-outline" size={18} color={PRIMARY} />
          <Text style={styles.successRowText}>{t('verification.badge')}</Text>
        </View>
        <View style={styles.successRow}>
          <Ionicons name="trending-up-outline" size={18} color={PRIMARY} />
          <Text style={styles.successRowText}>{t('verification.higher')}</Text>
        </View>
        <View style={styles.successRow}>
          <Ionicons name="people-outline" size={18} color={PRIMARY} />
          <Text style={styles.successRowText}>{t('verification.morematches')}</Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.button, { alignSelf: 'stretch' }]} onPress={() => router.replace('/(tabs)/profile')}>
        <Text style={styles.buttonText}>{t('verification.backToProfile')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: BG, paddingBottom: 48, paddingTop: 60 },
  successContainer: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 32 },
  backBtn: { position: 'absolute', top: 50, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  iconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(125,197,46,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, alignSelf: 'center', borderWidth: 2, borderColor: 'rgba(125,197,46,0.3)' },
  icon: { fontSize: 48 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  benefitsList: { backgroundColor: BG_LIGHT, borderRadius: 16, padding: 16, marginBottom: 24, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { fontSize: 22 },
  benefitText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },
  howTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  steps: { gap: 12, marginBottom: 28 },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stepText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  gestureCard: { backgroundColor: BG_LIGHT, borderRadius: 20, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 2, borderColor: 'rgba(125,197,46,0.3)' },
  gestureEmoji: { fontSize: 72, marginBottom: 12 },
  gestureLabel: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  cameraBtn: { width: '100%', height: 220, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: BG_LIGHT, marginBottom: 24, gap: 12 },
  cameraBtnText: { fontSize: 15, color: 'rgba(255,255,255,0.4)' },
  photoContainer: { alignItems: 'center', marginBottom: 24, gap: 12 },
  photo: { width: 220, height: 220, borderRadius: 20, borderWidth: 3, borderColor: PRIMARY },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  retakeBtnText: { color: '#fff', fontSize: 14 },
  button: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  buttonDisabled: { backgroundColor: '#333' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  privacyNote: { fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 16, lineHeight: 18 },
  successBadge: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#94e336', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 20, textAlign: 'center' },
  successCard: { alignSelf: 'stretch', backgroundColor: BG_LIGHT, borderRadius: 16, padding: 16, gap: 12, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  successRowText: { flex: 1, fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
})
