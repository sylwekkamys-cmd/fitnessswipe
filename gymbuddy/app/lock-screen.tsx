import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { authenticateWithBiometrics, getBiometricType } from '../lib/biometrics'

const PRIMARY = '#7dc52e'
const BG = '#0d1b2e'

export default function LockScreen() {
  const { t } = useTranslation()
  const [authenticating, setAuthenticating] = useState(false)
  const [failed, setFailed] = useState(false)
  const [bioType, setBioType] = useState<'faceId' | 'fingerprint' | 'none'>('none')

  useEffect(() => {
    getBiometricType().then(setBioType)
    handleAuthenticate()
  }, [])

  async function handleAuthenticate() {
    setAuthenticating(true)
    setFailed(false)
    const promptMessage = t('biometric.promptMessage') || 'Unlock FitnessSwipe'
    const success = await authenticateWithBiometrics(promptMessage)
    setAuthenticating(false)
    if (success) {
      router.replace('/(tabs)/swipe')
    } else {
      setFailed(true)
    }
  }

  async function handleUsePassword() {
    const { clearFilterStorage } = await import('../lib/filters')
    await clearFilterStorage()
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  function handleSkip() {
    router.replace('/(tabs)/swipe')
  }

  const iconName = bioType === 'faceId' ? 'scan-outline' : 'finger-print-outline'

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.appName}>FitnessSwipe</Text>

        <View style={styles.iconCircle}>
          <Ionicons name={iconName as any} size={48} color={PRIMARY} />
        </View>

        <Text style={styles.title}>
          {failed ? (t('biometric.failedTitle') || 'Authentication failed') : (t('biometric.title') || 'Unlock to continue')}
        </Text>

        {failed && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleAuthenticate} disabled={authenticating}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryBtnText}>{t('biometric.tryAgain') || 'Try Again'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.passwordBtn} onPress={handleUsePassword}>
          <Text style={styles.passwordBtnText}>{t('biometric.usePassword') || 'Use password instead'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipBtnText}>{t('biometric.skip') || 'Skip'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 40 },
  logoContainer: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(125,197,46,0.3)' },
  logo: { width: 70, height: 70, borderRadius: 35 },
  appName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 40 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(125,197,46,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 2, borderColor: 'rgba(125,197,46,0.3)' },
  title: { fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginBottom: 16 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  passwordBtn: { paddingVertical: 12 },
  passwordBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', textDecorationLine: 'underline' },
  skipBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  skipBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
})
