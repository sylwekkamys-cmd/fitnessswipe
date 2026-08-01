# GymBuddy — Setup Script
# Uruchom: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host "Tworzenie struktury folderow..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path "app\(auth)" | Out-Null
New-Item -ItemType Directory -Force -Path "app\(tabs)" | Out-Null
New-Item -ItemType Directory -Force -Path "app\chat" | Out-Null
New-Item -ItemType Directory -Force -Path "lib" | Out-Null
New-Item -ItemType Directory -Force -Path "i18n" | Out-Null

Write-Host "Tworzenie plikow..." -ForegroundColor Cyan

# ============================================================
# app/index.tsx
# ============================================================
@'
import { Redirect } from 'expo-router'

export default function Index() {
  return <Redirect href="/(auth)/login" />
}
'@ | Set-Content -Encoding UTF8 "app\index.tsx"

# ============================================================
# app/_layout.tsx
# ============================================================
@'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { supabase } from '../lib/supabase'
import '../lib/i18n'

export default function RootLayout() {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      setChecked(true)
    })
  }, [])

  if (!checked) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[matchId]" options={{ headerShown: true, title: '' }} />
    </Stack>
  )
}
'@ | Set-Content -Encoding UTF8 "app\_layout.tsx"

# ============================================================
# app/(auth)/_layout.tsx
# ============================================================
@'
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  )
}
'@ | Set-Content -Encoding UTF8 "app\(auth)\_layout.tsx"

# ============================================================
# app/(auth)/login.tsx
# ============================================================
@'
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'

type Mode = 'login' | 'register'

export default function LoginScreen() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email || !password) return
    if (password.length < 8) {
      Alert.alert(t('auth.passwordMin'))
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/(tabs)/swipe')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        router.replace('/(auth)/gdpr-consent')
      }
    } catch (e: any) {
      Alert.alert(mode === 'login' ? t('auth.loginError') : t('auth.registerError'))
    } finally {
      setLoading(false)
    }
  }

  const ORANGE = '#FF6B35'

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>💪</Text>
        <Text style={[styles.appName, { color: ORANGE }]}>GymBuddy</Text>
        <Text style={styles.tagline}>
          {mode === 'login' ? t('auth.login') : t('auth.register')}
        </Text>
      </View>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {mode === 'register' && (
          <Text style={styles.hint}>{t('auth.passwordMin')}</Text>
        )}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: loading ? '#ccc' : ORANGE }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? t('common.loading') : mode === 'login' ? t('auth.login') : t('auth.register')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.switchRow}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          <Text style={styles.switchText}>
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
          </Text>
          <Text style={[styles.switchLink, { color: ORANGE }]}>
            {mode === 'login' ? t('auth.register') : t('auth.login')}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 64, marginBottom: 8 },
  appName: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 16, color: '#666', marginTop: 4 },
  form: { gap: 12 },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1a1a1a', backgroundColor: '#fafafa' },
  hint: { fontSize: 12, color: '#999', paddingLeft: 4, marginTop: -4 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16 },
  switchText: { color: '#666', fontSize: 14 },
  switchLink: { fontSize: 14, fontWeight: '600' },
})
'@ | Set-Content -Encoding UTF8 "app\(auth)\login.tsx"

# ============================================================
# app/(auth)/gdpr-consent.tsx
# ============================================================
@'
import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'

const ORANGE = '#FF6B35'

export default function GdprConsentScreen() {
  const { t } = useTranslation()
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!terms || !privacy) { Alert.alert(t('gdpr.requiredError')); return }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')
      const { error } = await supabase.from('gdpr_consents').insert({ user_id: user.id, terms, privacy, marketing })
      if (error) throw error
      router.replace('/(auth)/create-profile')
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('gdpr.title')}</Text>
      <Text style={styles.subtitle}>{t('gdpr.subtitle')}</Text>
      <TouchableOpacity style={styles.row} onPress={() => setTerms(!terms)}>
        <View style={[styles.checkbox, terms && styles.checked]}>{terms && <Text style={styles.checkmark}>✓</Text>}</View>
        <View style={styles.rowText}>
          <Text style={styles.label}>{t('gdpr.terms')}</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://gymbuddy.app/terms')}><Text style={styles.link}>{t('gdpr.readTerms')}</Text></TouchableOpacity>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => setPrivacy(!privacy)}>
        <View style={[styles.checkbox, privacy && styles.checked]}>{privacy && <Text style={styles.checkmark}>✓</Text>}</View>
        <View style={styles.rowText}>
          <Text style={styles.label}>{t('gdpr.privacy')}</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://gymbuddy.app/privacy')}><Text style={styles.link}>{t('gdpr.readPrivacy')}</Text></TouchableOpacity>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => setMarketing(!marketing)}>
        <View style={[styles.checkbox, marketing && styles.checked]}>{marketing && <Text style={styles.checkmark}>✓</Text>}</View>
        <View style={styles.rowText}><Text style={styles.label}>{t('gdpr.marketing')}</Text></View>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, (!terms || !privacy || loading) && styles.buttonDisabled]} onPress={handleConfirm} disabled={!terms || !privacy || loading}>
        <Text style={styles.buttonText}>{loading ? t('common.loading') : t('gdpr.confirm')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checked: { backgroundColor: ORANGE, borderColor: ORANGE },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rowText: { flex: 1 },
  label: { fontSize: 15, color: '#1a1a1a', lineHeight: 22 },
  link: { fontSize: 13, color: ORANGE, marginTop: 4, textDecorationLine: 'underline' },
  button: { backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
'@ | Set-Content -Encoding UTF8 "app\(auth)\gdpr-consent.tsx"

# ============================================================
# app/(auth)/create-profile.tsx
# ============================================================
@'
import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'

const ORANGE = '#FF6B35'
const STEPS = 4
const ALL_GOALS = ['strength','cardio','weight_loss','muscle_gain','flexibility','endurance','crossfit','running','swimming','cycling','martial_arts','climbing','hiit','powerlifting','calisthenics']
const ALL_SCHEDULES = ['morning','evening','weekdays','weekends']

export default function CreateProfileScreen() {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [bioGenerating, setBioGenerating] = useState(false)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [schedule, setSchedule] = useState<string[]>([])
  const [gymName, setGymName] = useState('')
  const [city, setCity] = useState('')

  function nextStep() {
    if (step === 1 && !name.trim()) { Alert.alert(t('profile.name'), t('common.error')); return }
    if (step === 2 && photos.length < 2) { Alert.alert(t('profile.photosRequired')); return }
    if (step < STEPS) setStep(step + 1)
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Brak uprawnien do galerii'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 5], quality: 0.8 })
    if (!result.canceled && result.assets[0]) setPhotos(prev => [...prev, result.assets[0].uri])
  }

  function removePhoto(index: number) { setPhotos(prev => prev.filter((_, i) => i !== index)) }
  function toggleGoal(goal: string) { setGoals(prev => prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]) }
  function toggleSchedule(s: string) { setSchedule(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]) }

  async function generateBio() {
    if (goals.length === 0) { Alert.alert('Wybierz najpierw cele treningowe'); return }
    setBioGenerating(true)
    try {
      const goalLabels = goals.map(g => t(`goals.${g}`)).join(', ')
      const prompt = `Napisz krotkie, motywujace bio (max 120 slow) dla uzytkownika aplikacji do znajdowania partnera treningowego. Imie: ${name}. Cele: ${goalLabels}. Miasto: ${city || 'Polska'}. Bio powinno byc w pierwszej osobie, energiczne. Tylko bio, bez dodatkowych komentarzy.`
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.8 } }),
      })
      const data = await response.json()
      const generated = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (generated) setBio(generated.trim())
    } catch { Alert.alert(t('common.error')) } finally { setBioGenerating(false) }
  }

  async function uploadPhotos(userId: string): Promise<string[]> {
    const urls: string[] = []
    for (let i = 0; i < photos.length; i++) {
      const uri = photos[i]
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `${userId}/${Date.now()}_${i}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      const { error } = await supabase.storage.from('profile-photos').upload(path, blob, { contentType: `image/${ext}` })
      if (error) throw error
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')
      const photoUrls = await uploadPhotos(user.id)
      const { error } = await supabase.from('profiles').insert({ user_id: user.id, name: name.trim(), bio: bio.trim(), goals, schedule, gym_name: gymName.trim(), city: city.trim(), photo_urls: photoUrls, lang: 'pl' })
      if (error) throw error
      router.replace('/(tabs)/swipe')
    } catch (e) { Alert.alert(t('common.error')) } finally { setLoading(false) }
  }

  function ProgressBar() {
    return (
      <View style={styles.progressContainer}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={[styles.progressDot, i + 1 <= step && styles.progressDotActive]} />
        ))}
      </View>
    )
  }

  if (step === 1) return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProgressBar />
      <Text style={styles.stepTitle}>{t('profile.step1')}</Text>
      <Text style={styles.label}>{t('profile.name')}</Text>
      <TextInput style={styles.input} placeholder={t('profile.namePlaceholder')} placeholderTextColor="#999" value={name} onChangeText={setName} />
      <Text style={styles.label}>{t('profile.bio')}</Text>
      <TextInput style={[styles.input, styles.textarea]} placeholder={t('profile.bioPlaceholder')} placeholderTextColor="#999" value={bio} onChangeText={setBio} multiline numberOfLines={4} />
      <TouchableOpacity style={styles.buttonSecondary} onPress={generateBio} disabled={bioGenerating}>
        {bioGenerating ? <ActivityIndicator color={ORANGE} /> : <Text style={styles.buttonSecondaryText}>✨ {t('profile.generateBio')}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={nextStep}><Text style={styles.buttonText}>{t('common.next')}</Text></TouchableOpacity>
    </ScrollView>
  )

  if (step === 2) return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProgressBar />
      <Text style={styles.stepTitle}>{t('profile.step2')}</Text>
      <Text style={styles.subtitle}>{t('profile.photosRequired')}</Text>
      <View style={styles.photosGrid}>
        {photos.map((uri, i) => (
          <View key={i} style={styles.photoWrapper}>
            <Image source={{ uri }} style={styles.photo} />
            <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}><Text style={styles.removePhotoText}>✕</Text></TouchableOpacity>
          </View>
        ))}
        {photos.length < 5 && (
          <TouchableOpacity style={styles.addPhoto} onPress={pickPhoto}>
            <Text style={styles.addPhotoIcon}>+</Text>
            <Text style={styles.addPhotoText}>{t('profile.addPhoto')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.buttonOutline} onPress={() => setStep(1)}><Text style={styles.buttonOutlineText}>{t('common.back')}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonFlex, photos.length < 2 && styles.buttonDisabled]} onPress={nextStep} disabled={photos.length < 2}><Text style={styles.buttonText}>{t('common.next')}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  )

  if (step === 3) return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProgressBar />
      <Text style={styles.stepTitle}>{t('profile.step3')}</Text>
      <View style={styles.tagsGrid}>
        {ALL_GOALS.map(goal => (
          <TouchableOpacity key={goal} style={[styles.tag, goals.includes(goal) && styles.tagActive]} onPress={() => toggleGoal(goal)}>
            <Text style={[styles.tagText, goals.includes(goal) && styles.tagTextActive]}>{t(`goals.${goal}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.buttonOutline} onPress={() => setStep(2)}><Text style={styles.buttonOutlineText}>{t('common.back')}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonFlex]} onPress={nextStep}><Text style={styles.buttonText}>{t('common.next')}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  )

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProgressBar />
      <Text style={styles.stepTitle}>{t('profile.step4')}</Text>
      <Text style={styles.label}>{t('profile.city')}</Text>
      <TextInput style={styles.input} placeholder="np. Warszawa" placeholderTextColor="#999" value={city} onChangeText={setCity} />
      <Text style={styles.label}>{t('profile.gym')}</Text>
      <TextInput style={styles.input} placeholder={t('profile.gymSearch')} placeholderTextColor="#999" value={gymName} onChangeText={setGymName} />
      <Text style={styles.label}>{t('profile.schedule')}</Text>
      <View style={styles.tagsGrid}>
        {ALL_SCHEDULES.map(s => (
          <TouchableOpacity key={s} style={[styles.tag, schedule.includes(s) && styles.tagActive]} onPress={() => toggleSchedule(s)}>
            <Text style={[styles.tagText, schedule.includes(s) && styles.tagTextActive]}>{t(`schedule.${s}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.buttonOutline} onPress={() => setStep(3)}><Text style={styles.buttonOutlineText}>{t('common.back')}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonFlex, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('profile.completeProfile')}</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#fff', paddingBottom: 48 },
  progressContainer: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0' },
  progressDotActive: { backgroundColor: ORANGE },
  stepTitle: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 20 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#1a1a1a', backgroundColor: '#fafafa' },
  textarea: { height: 100, textAlignVertical: 'top', paddingTop: 12 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  photoWrapper: { width: 100, height: 125, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addPhoto: { width: 100, height: 125, borderRadius: 12, borderWidth: 2, borderColor: '#e0e0e0', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa' },
  addPhotoIcon: { fontSize: 28, color: '#bbb' },
  addPhotoText: { fontSize: 11, color: '#bbb', marginTop: 4, textAlign: 'center' },
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24, marginTop: 8 },
  tag: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
  tagActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  tagText: { fontSize: 14, color: '#555', fontWeight: '500' },
  tagTextActive: { color: '#fff' },
  button: { backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  buttonFlex: { flex: 1 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonSecondary: { borderWidth: 1.5, borderColor: ORANGE, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  buttonSecondaryText: { color: ORANGE, fontSize: 15, fontWeight: '600' },
  buttonOutline: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', marginTop: 16 },
  buttonOutlineText: { color: '#666', fontSize: 15, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
})
'@ | Set-Content -Encoding UTF8 "app\(auth)\create-profile.tsx"

# ============================================================
# app/(tabs)/_layout.tsx
# ============================================================
@'
import { Tabs } from 'expo-router'

const ORANGE = '#FF6B35'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingBottom: 4, height: 60 },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="swipe" options={{ title: 'Swipe', tabBarIcon: ({ focused }) => { const { Text } = require('react-native'); return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>🔥</Text> } }} />
      <Tabs.Screen name="matches" options={{ title: 'Matche', tabBarIcon: ({ focused }) => { const { Text } = require('react-native'); return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>💪</Text> } }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => { const { Text } = require('react-native'); return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>👤</Text> } }} />
    </Tabs>
  )
}
'@ | Set-Content -Encoding UTF8 "app\(tabs)\_layout.tsx"

# ============================================================
# app/(tabs)/swipe.tsx
# ============================================================
@'
import React, { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, ActivityIndicator, Dimensions } from 'react-native'
import Swiper from 'react-native-deck-swiper'
import { useTranslation } from 'react-i18next'
import { supabase, getCandidates, doSwipe, decrementSwipes, getMyProfile } from '../../lib/supabase'
import type { Profile } from '../../lib/supabase'
import { router } from 'expo-router'

const { width: SCREEN_W } = Dimensions.get('window')
const ORANGE = '#FF6B35'

export default function SwipeScreen() {
  const { t } = useTranslation()
  const swiperRef = useRef<any>(null)
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [candidates, setCandidates] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [cardIndex, setCardIndex] = useState(0)
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null)
  const [showMatch, setShowMatch] = useState(false)
  const [limitReached, setLimitReached] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const profile = await getMyProfile()
      if (!profile) { router.replace('/(auth)/login'); return }
      setMyProfile(profile)
      if (!profile.is_premium && profile.daily_swipes_left <= 0) { setLimitReached(true); setLoading(false); return }
      const list = await getCandidates(profile.id)
      setCandidates(list)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  async function handleSwipe(direction: 'left' | 'right', index: number) {
    if (!myProfile) return
    const swiped = candidates[index]
    if (!swiped) return
    if (!myProfile.is_premium) {
      const ok = await decrementSwipes(myProfile.id)
      if (!ok) { setLimitReached(true); return }
      setMyProfile(prev => prev ? { ...prev, daily_swipes_left: prev.daily_swipes_left - 1 } : prev)
    }
    const result = await doSwipe(myProfile.id, swiped.id, direction)
    if (result.matched) { setMatchedProfile(swiped); setShowMatch(true) }
    setCardIndex(prev => prev + 1)
  }

  function renderCard(profile: Profile) {
    if (!profile) return null
    const photo = profile.photo_urls?.[0] ?? 'https://i.pravatar.cc/400'
    return (
      <View style={styles.card}>
        <Image source={{ uri: photo }} style={styles.cardImage} />
        <View style={styles.cardOverlay}>
          <Text style={styles.cardName}>{profile.name}</Text>
          <Text style={styles.cardCity}>{profile.city}</Text>
          {profile.gym_name ? <Text style={styles.cardGym}>🏋️ {profile.gym_name}</Text> : null}
          <View style={styles.goalsRow}>
            {profile.goals.slice(0, 3).map(goal => (
              <View key={goal} style={styles.goalBadge}><Text style={styles.goalBadgeText}>{t(`goals.${goal}`)}</Text></View>
            ))}
          </View>
          {profile.bio ? <Text style={styles.cardBio} numberOfLines={2}>{profile.bio}</Text> : null}
        </View>
      </View>
    )
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>

  if (limitReached) return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>⏳</Text>
      <Text style={styles.emptyTitle}>{t('swipe.limitReached')}</Text>
      <Text style={styles.emptySub}>{t('swipe.limitSub')}</Text>
      <TouchableOpacity style={styles.premiumButton} onPress={() => router.push('/premium')}><Text style={styles.premiumButtonText}>{t('swipe.getPremium')}</Text></TouchableOpacity>
    </View>
  )

  if (candidates.length === 0 || cardIndex >= candidates.length) return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>🏋️</Text>
      <Text style={styles.emptyTitle}>{t('swipe.noMore')}</Text>
      <Text style={styles.emptySub}>{t('swipe.noMoreSub')}</Text>
      <TouchableOpacity style={styles.reloadButton} onPress={loadData}><Text style={styles.reloadButtonText}>{t('common.retry')}</Text></TouchableOpacity>
    </View>
  )

  return (
    <View style={styles.container}>
      {myProfile && !myProfile.is_premium && (
        <View style={styles.counter}><Text style={styles.counterText}>{myProfile.daily_swipes_left} / 20</Text></View>
      )}
      <Swiper
        ref={swiperRef}
        cards={candidates}
        renderCard={renderCard}
        cardIndex={cardIndex}
        onSwipedLeft={i => handleSwipe('left', i)}
        onSwipedRight={i => handleSwipe('right', i)}
        backgroundColor="transparent"
        stackSize={3}
        stackSeparation={12}
        animateCardOpacity
        overlayLabels={{
          left: { title: 'NOPE', style: { label: styles.overlayNope, wrapper: styles.overlayWrapperLeft } },
          right: { title: 'LIKE', style: { label: styles.overlayLike, wrapper: styles.overlayWrapperRight } },
        }}
        disableBottomSwipe
        disableTopSwipe
      />
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionNope]} onPress={() => swiperRef.current?.swipeLeft()}>
          <Text style={styles.actionNopeText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionLike]} onPress={() => swiperRef.current?.swipeRight()}>
          <Text style={styles.actionLikeText}>💪</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={showMatch} transparent animationType="fade">
        <View style={styles.matchOverlay}>
          <View style={styles.matchCard}>
            <Text style={styles.matchEmoji}>🎉</Text>
            <Text style={styles.matchTitle}>{t('swipe.match')}</Text>
            <Text style={styles.matchSub}>{t('swipe.matchSub')}</Text>
            {matchedProfile && <Image source={{ uri: matchedProfile.photo_urls?.[0] }} style={styles.matchPhoto} />}
            {matchedProfile && <Text style={styles.matchName}>{matchedProfile.name}</Text>}
            <TouchableOpacity style={styles.matchButton} onPress={() => { setShowMatch(false); router.push('/(tabs)/matches') }}><Text style={styles.matchButtonText}>{t('swipe.sendMessage')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.matchButtonOutline} onPress={() => setShowMatch(false)}><Text style={styles.matchButtonOutlineText}>{t('swipe.keepSwiping')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f5f5f5' },
  counter: { position: 'absolute', top: 16, right: 16, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, zIndex: 10, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  counterText: { fontSize: 13, fontWeight: '600', color: ORANGE },
  card: { width: SCREEN_W - 32, height: SCREEN_W * 1.35, borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  cardImage: { width: '100%', height: '100%', position: 'absolute' },
  cardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 24, backgroundColor: 'rgba(0,0,0,0.45)' },
  cardName: { fontSize: 26, fontWeight: '800', color: '#fff' },
  cardCity: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  cardGym: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  goalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  goalBadge: { backgroundColor: ORANGE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  goalBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardBio: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 18 },
  overlayLike: { fontSize: 28, fontWeight: '800', color: '#4CAF50', borderWidth: 3, borderColor: '#4CAF50', borderRadius: 8, padding: 8 },
  overlayNope: { fontSize: 28, fontWeight: '800', color: '#F44336', borderWidth: 3, borderColor: '#F44336', borderRadius: 8, padding: 8 },
  overlayWrapperLeft: { flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: 40, marginLeft: -20 },
  overlayWrapperRight: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', marginTop: 40, marginLeft: 20 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 40, paddingVertical: 24, position: 'absolute', bottom: 20, left: 0, right: 0 },
  actionBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  actionNope: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#F44336' },
  actionNopeText: { fontSize: 24, color: '#F44336' },
  actionLike: { backgroundColor: ORANGE },
  actionLikeText: { fontSize: 28 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  emptySub: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  premiumButton: { backgroundColor: ORANGE, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
  premiumButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  reloadButton: { borderWidth: 1.5, borderColor: ORANGE, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
  reloadButtonText: { color: ORANGE, fontSize: 15, fontWeight: '600' },
  matchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  matchCard: { backgroundColor: '#fff', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%' },
  matchEmoji: { fontSize: 56, marginBottom: 8 },
  matchTitle: { fontSize: 28, fontWeight: '800', color: ORANGE },
  matchSub: { fontSize: 15, color: '#666', marginTop: 6, textAlign: 'center' },
  matchPhoto: { width: 100, height: 100, borderRadius: 50, marginTop: 20, borderWidth: 3, borderColor: ORANGE },
  matchName: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginTop: 10 },
  matchButton: { backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginTop: 24, width: '100%', alignItems: 'center' },
  matchButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  matchButtonOutline: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32, marginTop: 10, width: '100%', alignItems: 'center' },
  matchButtonOutlineText: { color: '#666', fontSize: 15, fontWeight: '600' },
})
'@ | Set-Content -Encoding UTF8 "app\(tabs)\swipe.tsx"

# ============================================================
# app/(tabs)/matches.tsx
# ============================================================
@'
import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase, getMyProfile } from '../../lib/supabase'
import type { Profile } from '../../lib/supabase'
import { router } from 'expo-router'

const ORANGE = '#FF6B35'

export default function MatchesScreen() {
  const { t } = useTranslation()
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadMatches() }, [])

  async function loadMatches() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      const { data: matchData } = await supabase.from('matches').select('*').or(`profile_a_id.eq.${me.id},profile_b_id.eq.${me.id}`).order('matched_at', { ascending: false })
      if (!matchData) return
      const enriched: any[] = []
      for (const match of matchData) {
        const otherId = match.profile_a_id === me.id ? match.profile_b_id : match.profile_a_id
        const { data: otherProfile } = await supabase.from('profiles').select('*').eq('id', otherId).single()
        if (otherProfile) enriched.push({ ...match, otherProfile })
      }
      setMatches(enriched)
    } finally { setLoading(false) }
  }

  function renderMatch({ item }: { item: any }) {
    const photo = item.otherProfile.photo_urls?.[0]
    return (
      <TouchableOpacity style={styles.row} onPress={() => router.push(`/chat/${item.id}`)} activeOpacity={0.7}>
        <Image source={{ uri: photo ?? 'https://i.pravatar.cc/100' }} style={styles.avatar} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{item.otherProfile.name}</Text>
          <Text style={styles.rowSub}>{item.otherProfile.city}</Text>
          <View style={styles.goalsRow}>
            {item.otherProfile.goals.slice(0, 2).map((g: string) => (
              <View key={g} style={styles.badge}><Text style={styles.badgeText}>{t(`goals.${g}`)}</Text></View>
            ))}
          </View>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    )
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>

  if (matches.length === 0) return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon}>💪</Text>
      <Text style={styles.emptyTitle}>Brak matchow</Text>
      <Text style={styles.emptySub}>Swipuj dalej zeby znalezc partnera treningowego</Text>
      <TouchableOpacity style={styles.swipeButton} onPress={() => router.push('/(tabs)/swipe')}><Text style={styles.swipeButtonText}>Swipuj teraz</Text></TouchableOpacity>
    </View>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Twoje matche ({matches.length})</Text>
      <FlatList data={matches} keyExtractor={item => item.id} renderItem={renderMatch} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={styles.separator} />} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', padding: 20, paddingBottom: 12 },
  list: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  rowSub: { fontSize: 13, color: '#888', marginTop: 2 },
  goalsRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { backgroundColor: '#FFF0EB', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: ORANGE, fontWeight: '600' },
  arrow: { fontSize: 22, color: '#ccc' },
  separator: { height: 1, backgroundColor: '#f0f0f0' },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  swipeButton: { backgroundColor: ORANGE, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
  swipeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
'@ | Set-Content -Encoding UTF8 "app\(tabs)\matches.tsx"

# ============================================================
# app/(tabs)/profile.tsx
# ============================================================
@'
import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'

const ORANGE = '#FF6B35'

export default function ProfileScreen() {
  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  async function handleDeleteAccount() {
    Alert.alert('Usun konto', 'Na pewno? Tej operacji nie mozna cofnac.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Tak, usun moje konto', style: 'destructive', onPress: async () => {
        await supabase.rpc('delete_user_account')
        router.replace('/(auth)/login')
      }}
    ])
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Wyloguj sie</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleDeleteAccount}>
        <Text style={styles.buttonText}>Usun konto i dane (RODO)</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', marginBottom: 32 },
  button: { backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  buttonDanger: { backgroundColor: '#F44336' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
'@ | Set-Content -Encoding UTF8 "app\(tabs)\profile.tsx"

# ============================================================
# app/chat/[matchId].tsx
# ============================================================
@'
import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase, subscribeToMessages, getMyProfile } from '../../lib/supabase'
import type { Message, Profile } from '../../lib/supabase'

const ORANGE = '#FF6B35'

export default function ChatScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const { t } = useTranslation()
  const flatListRef = useRef<FlatList>(null)
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadChat()
    const channel = subscribeToMessages(matchId, (msg) => {
      setMessages(prev => [...prev, msg])
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    })
    return () => { supabase.removeChannel(channel) }
  }, [matchId])

  async function loadChat() {
    setLoading(true)
    try {
      const me = await getMyProfile()
      if (!me) return
      setMyProfile(me)
      const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single()
      if (match) {
        const otherId = match.profile_a_id === me.id ? match.profile_b_id : match.profile_a_id
        const { data: other } = await supabase.from('profiles').select('*').eq('id', otherId).single()
        setOtherProfile(other)
      }
      const { data: msgs } = await supabase.from('messages').select('*').eq('match_id', matchId).order('sent_at', { ascending: true })
      setMessages(msgs ?? [])
    } finally {
      setLoading(false)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200)
    }
  }

  async function sendMessage() {
    if (!text.trim() || !myProfile || sending) return
    setSending(true)
    const content = text.trim()
    setText('')
    try {
      await supabase.from('messages').insert({ match_id: matchId, sender_id: myProfile.id, content })
    } catch (e) { setText(content) } finally { setSending(false) }
  }

  function renderMessage({ item }: { item: Message }) {
    const isMe = item.sender_id === myProfile?.id
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>{item.content}</Text>
          <Text style={styles.msgTime}>{new Date(item.sent_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      </View>
    )
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <Text style={styles.headerName}>{otherProfile?.name ?? '...'}</Text>
        <Text style={styles.headerSub}>{otherProfile?.city}</Text>
      </View>
      <FlatList ref={flatListRef} data={messages} keyExtractor={item => item.id} renderItem={renderMessage} contentContainerStyle={styles.messagesList}
        ListEmptyComponent={<View style={styles.emptyChat}><Text style={styles.emptyChatText}>Napisz pierwsza wiadomosc do {otherProfile?.name} 💪</Text></View>}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} placeholder={t('chat.placeholder')} placeholderTextColor="#999" value={text} onChangeText={setText} multiline maxLength={500} />
        <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]} onPress={sendMessage} disabled={!text.trim() || sending}>
          <Text style={styles.sendBtnText}>›</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  messagesList: { padding: 16, gap: 8 },
  msgRow: { marginBottom: 8 },
  msgRowMe: { alignItems: 'flex-end' },
  msgRowOther: { alignItems: 'flex-start' },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: ORANGE, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff' },
  bubbleTextOther: { color: '#1a1a1a' },
  msgTime: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 4, alignSelf: 'flex-end' },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyChatText: { fontSize: 15, color: '#aaa', textAlign: 'center', lineHeight: 22 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', gap: 10 },
  input: { flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1a1a1a', maxHeight: 100, backgroundColor: '#fafafa' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#ddd' },
  sendBtnText: { color: '#fff', fontSize: 24, fontWeight: '700', marginLeft: 2 },
})
'@ | Set-Content -Encoding UTF8 "app\chat\[matchId].tsx"

# ============================================================
# lib/supabase.ts
# ============================================================
@'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
})

export type Profile = {
  id: string; user_id: string; name: string; bio: string; goals: string[]
  gym_name: string; gym_place_id: string; city: string; schedule: string[]
  is_premium: boolean; daily_swipes_left: number; swipe_reset_date: string
  photo_urls: string[]; lang: string; created_at: string; updated_at: string
}

export type Match = { id: string; profile_a_id: string; profile_b_id: string; matched_at: string }
export type Message = { id: string; match_id: string; sender_id: string; content: string; sent_at: string }

export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single()
  return data
}

export async function getCandidates(myProfileId: string): Promise<Profile[]> {
  const { data: alreadySwiped } = await supabase.from('swipes').select('swiped_id').eq('swiper_id', myProfileId)
  const excludeIds = [myProfileId, ...(alreadySwiped?.map((s: any) => s.swiped_id) ?? [])]
  const { data } = await supabase.from('profiles').select('*').not('id', 'in', `(${excludeIds.join(',')})`).limit(50)
  return data ?? []
}

export async function doSwipe(swiperId: string, swipedId: string, direction: 'left' | 'right'): Promise<{ matched: boolean; matchId?: string }> {
  const { error } = await supabase.from('swipes').insert({ swiper_id: swiperId, swiped_id: swipedId, direction })
  if (error) throw error
  if (direction === 'right') {
    const { data: match } = await supabase.from('matches').select('id').or(`and(profile_a_id.eq.${swiperId},profile_b_id.eq.${swipedId}),and(profile_a_id.eq.${swipedId},profile_b_id.eq.${swiperId})`).single()
    if (match) return { matched: true, matchId: match.id }
  }
  return { matched: false }
}

export async function decrementSwipes(profileId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('daily_swipes_left, is_premium, swipe_reset_date').eq('id', profileId).single()
  if (!profile) return false
  const today = new Date().toISOString().split('T')[0]
  if (profile.swipe_reset_date < today && !profile.is_premium) {
    await supabase.from('profiles').update({ daily_swipes_left: 20, swipe_reset_date: today }).eq('id', profileId)
    return true
  }
  if (!profile.is_premium && profile.daily_swipes_left <= 0) return false
  if (!profile.is_premium) await supabase.from('profiles').update({ daily_swipes_left: profile.daily_swipes_left - 1 }).eq('id', profileId)
  return true
}

export function subscribeToMessages(matchId: string, onMessage: (msg: Message) => void) {
  return supabase.channel(`messages:${matchId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, payload => onMessage(payload.new as Message)).subscribe()
}

export async function deleteMyAccount(): Promise<void> {
  await supabase.rpc('delete_user_account')
}
'@ | Set-Content -Encoding UTF8 "lib\supabase.ts"

# ============================================================
# lib/i18n.ts
# ============================================================
@'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import pl from '../i18n/pl.json'
import en from '../i18n/en.json'

i18n.use(initReactI18next).init({
  resources: {
    pl: { translation: pl },
    en: { translation: en },
  },
  lng: 'pl',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
'@ | Set-Content -Encoding UTF8 "lib\i18n.ts"

# ============================================================
# i18n/pl.json
# ============================================================
@'
{
  "common": { "next": "Dalej", "back": "Wróć", "save": "Zapisz", "cancel": "Anuluj", "loading": "Ładowanie...", "error": "Wystąpił błąd", "retry": "Spróbuj ponownie" },
  "auth": { "login": "Zaloguj się", "register": "Zarejestruj się", "email": "Adres e-mail", "password": "Hasło", "passwordMin": "Minimum 8 znaków", "noAccount": "Nie masz konta?", "hasAccount": "Masz już konto?", "loginError": "Nieprawidłowy e-mail lub hasło", "registerError": "Rejestracja nie powiodła się" },
  "gdpr": { "title": "Zanim zaczniesz", "subtitle": "Wymagamy Twojej zgody zgodnie z RODO", "terms": "Akceptuję Regulamin aplikacji", "privacy": "Akceptuję Politykę prywatności", "marketing": "Zgadzam się na otrzymywanie powiadomień marketingowych (opcjonalnie)", "readTerms": "Przeczytaj regulamin", "readPrivacy": "Przeczytaj politykę prywatności", "requiredError": "Wymagana zgoda na regulamin i politykę prywatności", "confirm": "Akceptuję i kontynuuję" },
  "profile": { "step1": "Podstawowe dane", "step2": "Twoje zdjęcia", "step3": "Cel treningowy", "step4": "Siłownia i grafik", "name": "Imię", "namePlaceholder": "Jak masz na imię?", "bio": "O sobie", "bioPlaceholder": "Napisz kilka słów o swoich celach treningowych...", "generateBio": "Wygeneruj bio z AI", "generating": "Generuję...", "photos": "Zdjęcia profilowe", "photosRequired": "Wymagane minimum 2 zdjęcia", "addPhoto": "Dodaj zdjęcie", "goals": "Cele treningowe", "schedule": "Kiedy trenujesz?", "gym": "Twoja siłownia", "gymSearch": "Szukaj siłowni...", "city": "Miasto", "completeProfile": "Utwórz profil" },
  "goals": { "strength": "Siła", "cardio": "Cardio", "weight_loss": "Odchudzanie", "muscle_gain": "Masa mięśniowa", "flexibility": "Elastyczność", "endurance": "Wytrzymałość", "crossfit": "CrossFit", "running": "Bieganie", "swimming": "Pływanie", "cycling": "Kolarstwo", "martial_arts": "Sztuki walki", "climbing": "Wspinaczka", "hiit": "HIIT", "powerlifting": "Powerlifting", "calisthenics": "Kalistenika" },
  "schedule": { "morning": "Rano", "evening": "Wieczorem", "weekdays": "Dni robocze", "weekends": "Weekendy" },
  "swipe": { "noMore": "Brak nowych profili", "noMoreSub": "Wróć jutro lub znajdź więcej osób w okolicy", "limitReached": "Wykorzystałeś dzisiejsze swipe'y", "limitSub": "Odblokuj premium żeby swipować bez limitu", "getPremium": "Przejdź na Premium", "match": "To jest Match!", "matchSub": "Wy dwoje polubiliście się nawzajem", "sendMessage": "Wyślij wiadomość", "keepSwiping": "Swipuj dalej" },
  "chat": { "placeholder": "Napisz wiadomość...", "send": "Wyślij", "matchedWith": "Dopasowano z" },
  "premium": { "title": "GymBuddy Premium", "unlimited": "Nieograniczone swipe'y", "seeWhoLiked": "Zobacz kto Cię polubił", "price": "9,99 zł / miesiąc", "subscribe": "Subskrybuj Premium" },
  "settings": { "title": "Ustawienia", "language": "Język", "deleteAccount": "Usuń konto i dane", "deleteConfirm": "Na pewno? Tej operacji nie można cofnąć.", "deleteButton": "Tak, usuń moje konto", "privacy": "Polityka prywatności", "terms": "Regulamin", "logout": "Wyloguj się" }
}
'@ | Set-Content -Encoding UTF8 "i18n\pl.json"

# ============================================================
# i18n/en.json
# ============================================================
@'
{
  "common": { "next": "Next", "back": "Back", "save": "Save", "cancel": "Cancel", "loading": "Loading...", "error": "Something went wrong", "retry": "Try again" },
  "auth": { "login": "Log in", "register": "Create account", "email": "Email address", "password": "Password", "passwordMin": "Minimum 8 characters", "noAccount": "Don't have an account?", "hasAccount": "Already have an account?", "loginError": "Invalid email or password", "registerError": "Registration failed" },
  "gdpr": { "title": "Before you start", "subtitle": "We need your consent in accordance with GDPR", "terms": "I accept the Terms of Service", "privacy": "I accept the Privacy Policy", "marketing": "I agree to receive marketing notifications (optional)", "readTerms": "Read terms of service", "readPrivacy": "Read privacy policy", "requiredError": "You must accept the terms and privacy policy", "confirm": "Accept and continue" },
  "profile": { "step1": "Basic info", "step2": "Your photos", "step3": "Training goals", "step4": "Gym & schedule", "name": "Name", "namePlaceholder": "What's your name?", "bio": "About you", "bioPlaceholder": "Tell us about your training goals...", "generateBio": "Generate bio with AI", "generating": "Generating...", "photos": "Profile photos", "photosRequired": "Minimum 2 photos required", "addPhoto": "Add photo", "goals": "Training goals", "schedule": "When do you train?", "gym": "Your gym", "gymSearch": "Search for a gym...", "city": "City", "completeProfile": "Create profile" },
  "goals": { "strength": "Strength", "cardio": "Cardio", "weight_loss": "Weight loss", "muscle_gain": "Muscle gain", "flexibility": "Flexibility", "endurance": "Endurance", "crossfit": "CrossFit", "running": "Running", "swimming": "Swimming", "cycling": "Cycling", "martial_arts": "Martial arts", "climbing": "Climbing", "hiit": "HIIT", "powerlifting": "Powerlifting", "calisthenics": "Calisthenics" },
  "schedule": { "morning": "Morning", "evening": "Evening", "weekdays": "Weekdays", "weekends": "Weekends" },
  "swipe": { "noMore": "No more profiles", "noMoreSub": "Come back tomorrow or expand your area", "limitReached": "You've used today's swipes", "limitSub": "Upgrade to Premium to swipe without limits", "getPremium": "Get Premium", "match": "It's a Match!", "matchSub": "You both liked each other", "sendMessage": "Send a message", "keepSwiping": "Keep swiping" },
  "chat": { "placeholder": "Type a message...", "send": "Send", "matchedWith": "Matched with" },
  "premium": { "title": "GymBuddy Premium", "unlimited": "Unlimited swipes", "seeWhoLiked": "See who liked you", "price": "€2.99 / month", "subscribe": "Subscribe to Premium" },
  "settings": { "title": "Settings", "language": "Language", "deleteAccount": "Delete account and data", "deleteConfirm": "Are you sure? This cannot be undone.", "deleteButton": "Yes, delete my account", "privacy": "Privacy Policy", "terms": "Terms of Service", "logout": "Log out" }
}
'@ | Set-Content -Encoding UTF8 "i18n\en.json"

Write-Host "Gotowe! Wszystkie pliki zostaly utworzone." -ForegroundColor Green
Write-Host "Pamietaj o pliku .env z kluczami Supabase i Gemini!" -ForegroundColor Yellow
