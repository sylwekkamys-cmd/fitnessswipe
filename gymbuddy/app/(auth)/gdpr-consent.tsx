import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PRIMARY = '#7dc52e'
const LIME = '#94e336'
const BG = '#0d1b2e'
const BG_LIGHT = '#1a2a44'

export default function GdprConsentScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!terms || !privacy) { Alert.alert(t('gdpr.requiredError')); return }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('No user')
      // Upsert: uzytkownik moze wrocic do rejestracji po przerwanym onboardingu
      // (np. ponowne logowanie Apple) — istniejacy wiersz zgod nadpisujemy
      const { error } = await supabase.from('gdpr_consents').upsert(
        { user_id: user.id, terms, privacy, marketing },
        { onConflict: 'user_id' }
      )
      if (error) throw error
      const { clearFilterStorage } = await import('../../lib/filters')
      await clearFilterStorage()
      router.replace('/(auth)/create-profile')
    } catch (e: any) {
      Alert.alert(t('common.error') + ': ' + (e?.message || JSON.stringify(e)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={[styles.sheet, { paddingBottom: 24 + Math.max(insets.bottom, 16) }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{"🔒"}</Text>
      </View>
      <Text style={styles.title}>{t('gdpr.title')}</Text>
      <Text style={styles.subtitle}>{t('gdpr.subtitle')}</Text>

      <TouchableOpacity style={styles.row} onPress={() => setTerms(!terms)}>
        <View style={[styles.checkbox, terms && styles.checked]}>
          {terms && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.label}>{t('gdpr.terms')}</Text>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync('https://fitnessswipe.app/terms.html')}>
            <Text style={styles.link}>{t('gdpr.readTerms')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => setPrivacy(!privacy)}>
        <View style={[styles.checkbox, privacy && styles.checked]}>
          {privacy && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.label}>{t('gdpr.privacy')}</Text>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync('https://fitnessswipe.app/privacy.html')}>
            <Text style={styles.link}>{t('gdpr.readPrivacy')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} onPress={() => setMarketing(!marketing)}>
        <View style={[styles.checkbox, marketing && styles.checked]}>
          {marketing && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.label}>{t('gdpr.marketing')}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, (!terms || !privacy || loading) && styles.buttonDisabled]}
        onPress={handleConfirm}
        disabled={!terms || !privacy || loading}
      >
        <Text style={styles.buttonText}>{loading ? t('common.loading') : t('gdpr.confirm')}</Text>
      </TouchableOpacity>

      {/* Wyjscie awaryjne: wyloguj i wroc do logowania (np. zle konto) */}
      <TouchableOpacity
        style={styles.backLink}
        onPress={async () => {
          try { await supabase.auth.signOut() } catch (e) { }
          router.replace('/(auth)/login')
        }}
      >
        <Text style={styles.backLinkText}>← {t('gdpr.backToLogin')}</Text>
      </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  container: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG_LIGHT, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 18 },
  iconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(148,227,54,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, alignSelf: 'center', borderWidth: 1.5, borderColor: 'rgba(148,227,54,0.35)' },
  icon: { fontSize: 28 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 20, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: BG },
  checked: { backgroundColor: LIME, borderColor: LIME },
  checkmark: { color: BG, fontSize: 14, fontWeight: '800' },
  rowText: { flex: 1 },
  label: { fontSize: 14, color: '#fff', lineHeight: 20 },
  link: { fontSize: 12, color: LIME, marginTop: 4, textDecorationLine: 'underline' },
  button: { backgroundColor: LIME, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: BG, fontSize: 16, fontWeight: '800' },
  backLink: { alignItems: 'center', paddingVertical: 14 },
  backLinkText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecorationLine: 'underline' },
})
