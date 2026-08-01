import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, StatusBar, Image,
  Animated, Easing, Modal, ScrollView, ActivityIndicator
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import * as ExpoLinking from 'expo-linking'
import { supabase, getMyProfile } from '../../lib/supabase'

// Domyka sesje przegladarki po powrocie z OAuth
WebBrowser.maybeCompleteAuthSession()
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { changeLanguage } from '../../lib/i18n'
import { isBiometricAvailable, getBiometricType, authenticateWithBiometrics, getSecureCredentials, getSecureCredentialsEmail, saveSecureCredentials, clearSecureCredentials } from '../../lib/biometrics'

type Mode = 'login' | 'register'
const PRIMARY = '#7dc52e'
const LIME = '#94e336'

const LANGS = [
  { code: 'pl', flag: '🇵🇱', label: 'Polski' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'bg', flag: '🇧🇬', label: 'Български' },
  { code: 'ro', flag: '🇷🇴', label: 'Română' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
]

function AnimatedButton({ onPress, style, children, disabled }: any) {
  const scale = useRef(new Animated.Value(1)).current
  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start()
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start()
  }
  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={disabled} activeOpacity={1}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  )
}

export default function LoginScreen() {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Prosty wskaznik sily hasla: dlugosc + male/wielkie litery + cyfry/znaki
  function passwordStrength(pw: string): number {
    if (!pw) return 0
    let score = 0
    if (pw.length >= 8) score++
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw) || /[^a-zA-Z0-9]/.test(pw)) score++
    return score
  }
  const [loading, setLoading] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [hardwareAvailable, setHardwareAvailable] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(false)
  const [bioType, setBioType] = useState<'faceId' | 'fingerprint' | 'none'>('none')
  const [bioLoading, setBioLoading] = useState(false)
  const [savedBioEmail, setSavedBioEmail] = useState<string | null>(null)
  const [selectedLang, setSelectedLang] = useState(i18n.language ?? 'pl')
  const [showLangSheet, setShowLangSheet] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetNewPass, setResetNewPass] = useState('')
  const [resetNewPass2, setResetNewPass2] = useState('')
  // Weryfikacja e-maila po rejestracji (6-cyfrowy kod z maila)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  const logoAnim = useRef(new Animated.Value(-100)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const formAnim = useRef(new Animated.Value(60)).current
  const formOpacity = useRef(new Animated.Value(0)).current
  const langAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(formOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(langAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start()
  }, [])

  useEffect(() => {
    AsyncStorage.getItem('remembered_email').then(saved => {
      if (saved) setEmail(saved)
    })
  }, [])

  useEffect(() => {
    async function checkBiometric() {
      const available = await isBiometricAvailable()
      setHardwareAvailable(available)
      if (!available) { setBioAvailable(false); return }
      const type = await getBiometricType()
      setBioType(type)
      const savedEmail = await getSecureCredentialsEmail()
      setSavedBioEmail(savedEmail)
      setBioAvailable(!!savedEmail)
      setBioEnabled(!!savedEmail)
    }
    checkBiometric()
  }, [])

  async function handleBiometricLogin() {
    setBioLoading(true)
    try {
      const promptMessage = t('biometric.promptMessage') || 'Unlock FitnessSwipe'
      const success = await authenticateWithBiometrics(promptMessage)
      if (!success) { setBioLoading(false); return }

      const stored = await getSecureCredentials()
      if (!stored) {
        Alert.alert(t('common.error'), t('biometric.noSession') || 'Please log in with your password first.')
        setBioLoading(false)
        return
      }

      // Prawdziwe logowanie na nowo - zawsze daje swiezy, w pelni wazny token
      // (unikamy problemu z Supabase uniewazniajacym stary refresh token przy signOut)
      const { error } = await supabase.auth.signInWithPassword({
        email: stored.email,
        password: stored.password,
      })

      if (error) {
        // Haslo zostalo zmienione lub dane sa niepoprawne - wyczysc i popros o haslo
        await clearSecureCredentials()
        setBioAvailable(false)
        Alert.alert(t('common.error'), t('biometric.sessionExpired') || 'Please log in with your password.')
        setBioLoading(false)
        return
      }

      router.replace('/(tabs)/swipe')
    } catch (e) {
      Alert.alert(t('common.error'))
    } finally {
      setBioLoading(false)
    }
  }

  async function handleSubmit() {
    if (!email || !password) { Alert.alert(t('auth.fillAll')); return }
    if (password.length < 8) { Alert.alert(t('auth.passwordMin')); return }
    if (mode === 'register' && password !== confirmPassword) { Alert.alert('❌', t('auth.passwordsMismatch') ?? 'Hasła nie są zgodne'); return }
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          // Konto zalozone, ale e-mail niepotwierdzony — doslij kod i otworz weryfikacje
          if (String(error.message).toLowerCase().includes('confirm')) {
            supabase.auth.resend({ type: 'signup', email: email.trim() }).catch(() => { })
            setVerifyCode('')
            setShowVerifyModal(true)
            return
          }
          throw error
        }
        await AsyncStorage.setItem('remembered_email', email)

        const savedEmail = await getSecureCredentialsEmail()
        const alreadyEnabledForThisAccount = savedEmail?.toLowerCase() === email.toLowerCase()

        if (alreadyEnabledForThisAccount) {
          // Odswiez zapisane haslo (na wypadek gdyby sie zmienilo od ostatniego zapisu)
          await saveSecureCredentials(email, password)
          router.replace('/(tabs)/swipe')
        } else if (hardwareAvailable) {
          // Zapytaj czy wlaczyc biometrie - mamy juz email+haslo z formularza
          Alert.alert(
            bioType === 'faceId' ? (t('biometric.enableFaceIdTitle') || 'Enable Face ID?') : (t('biometric.enableFingerprintTitle') || 'Enable Fingerprint Login?'),
            t('biometric.enablePrompt') || 'Log in faster next time without typing your password.',
            [
              {
                text: t('common.cancel') || 'Not now',
                style: 'cancel',
                onPress: () => router.replace('/(tabs)/swipe'),
              },
              {
                text: t('common.enable') || 'Enable',
                onPress: async () => {
                  try {
                    await saveSecureCredentials(email, password)
                  } catch (e) {
                    Alert.alert(t('common.error'), t('biometric.saveFailed') || 'Could not save your session.')
                  }
                  router.replace('/(tabs)/swipe')
                },
              },
            ]
          )
        } else {
          router.replace('/(tabs)/swipe')
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Potwierdzanie e-maila wlaczone: bez sesji do czasu wpisania kodu z maila
        // (chroni przed rejestracja na nieistniejace adresy)
        if (data.session) {
          router.replace('/(auth)/gdpr-consent')
        } else {
          setVerifyCode('')
          setShowVerifyModal(true)
        }
      }
    } catch (e: any) {
      Alert.alert(mode === 'login' ? t('auth.loginError') : t('auth.registerError'))
    } finally {
      setLoading(false)
    }
  }

  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null)

  // Logowanie Google/Apple przez przepływ webowy Supabase:
  // przegladarka systemowa -> powrot deep linkiem z tokenami -> setSession
  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider)
    try {
      // iOS: sesja logowania przechwytuje powrot po samym schemacie, wiec staly adres
      // dziala nawet w Expo Go. Android: adres zalezny od srodowiska (exp:// w Expo Go).
      const redirectTo = Platform.OS === 'ios'
        ? 'fitnessswipe://auth-callback'
        : ExpoLinking.createURL('auth-callback')
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error || !data?.url) throw error ?? new Error('no_auth_url')

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      if (res.type !== 'success' || !res.url) return

      // Tokeny wracaja we fragmencie URL (#access_token=...&refresh_token=...)
      const raw = res.url.split('#')[1] ?? res.url.split('?')[1] ?? ''
      const params: Record<string, string> = {}
      raw.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        if (k) params[k] = decodeURIComponent(v ?? '')
      })
      if (params.error_description) throw new Error(params.error_description)
      if (!params.access_token || !params.refresh_token) throw new Error('missing_tokens')

      const { error: sessErr } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      })
      if (sessErr) throw sessErr

      // Nowe konto -> zgody RODO + kreator profilu; istniejace -> swipe
      const me = await getMyProfile()
      if (me) router.replace('/(tabs)/swipe')
      else router.replace('/(auth)/gdpr-consent')
    } catch (e: any) {
      Alert.alert(t('common.error'), t('auth.oauthError') || 'Logowanie nie powiodło się. Spróbuj ponownie.')
    } finally {
      setOauthLoading(null)
    }
  }

  async function handleResetPassword() {
    if (!resetEmail.trim()) { Alert.alert(t('auth.fillAll')); return }
    setResetLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim())
      if (error) throw error
      setResetSent(true)
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setResetLoading(false) }
  }

  // Potwierdzenie e-maila kodem z maila — verifyOtp tworzy sesje i odblokowuje konto
  async function handleVerifyEmail() {
    if (verifyCode.trim().length < 6) { Alert.alert(t('common.error'), t('auth.resetCodeInvalid')); return }
    setVerifyLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: verifyCode.trim(), type: 'signup' })
      if (error) throw error
      setShowVerifyModal(false)
      setVerifyCode('')
      // iOS: nawigacja w trakcie zamykania modala potrafi ubic apke — odczekaj animacje
      setTimeout(() => router.replace('/(auth)/gdpr-consent'), 450)
    } catch (e: any) {
      Alert.alert(t('common.error'), t('auth.resetCodeInvalid'))
    } finally { setVerifyLoading(false) }
  }

  async function handleResendCode() {
    setResendLoading(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (error) throw error
      Alert.alert('📧', t('auth.verifyResent'))
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setResendLoading(false) }
  }

  // Krok 2 resetu: kod z maila + nowe haslo — verifyOtp loguje, updateUser zmienia haslo.
  // Caly flow dzieje sie w aplikacji (link w mailu nie dziala na mobile).
  async function handleResetVerify() {
    if (resetCode.trim().length < 6) { Alert.alert(t('common.error'), t('auth.resetCodeInvalid')); return }
    if (resetNewPass.length < 8) { Alert.alert(t('auth.passwordMin')); return }
    if (resetNewPass !== resetNewPass2) { Alert.alert('❌', t('auth.passwordsMismatch')); return }
    setResetLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({ email: resetEmail.trim(), token: resetCode.trim(), type: 'recovery' })
      if (error) throw error
      const { error: upErr } = await supabase.auth.updateUser({ password: resetNewPass })
      if (upErr) throw upErr
      setShowResetModal(false)
      setResetSent(false)
      setResetCode(''); setResetNewPass(''); setResetNewPass2('')
      // iOS: nawigacja w trakcie zamykania modala potrafi ubic apke — odczekaj animacje
      setTimeout(() => {
        Alert.alert('✅', t('auth.resetDone'))
        router.replace('/(tabs)/swipe')
      }, 450)
    } catch (e: any) {
      Alert.alert(t('common.error'), t('auth.resetCodeInvalid'))
    } finally { setResetLoading(false) }
  }

  async function handleLangChange(code: string) {
    setSelectedLang(code)
    await changeLanguage(code)
    router.replace('/(auth)/login')
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0d1b2e' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Animated.View style={[styles.header, { transform: [{ translateY: logoAnim }], opacity: logoOpacity }]}>
        <View style={styles.logoContainer}>
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.appName}>FitnessSwipe</Text>
        <Text style={styles.tagline}>{t('auth.tagline') ?? 'Find your workout partner'}</Text>
        {/* Kompaktowy wybor jezyka: przycisk z flaga -> bottom sheet z lista (9 jezykow) */}
        <Animated.View style={{ opacity: langAnim }}>
          <TouchableOpacity style={styles.langPickerBtn} onPress={() => setShowLangSheet(true)}>
            <Text style={styles.langFlag}>{LANGS.find(l => l.code === selectedLang)?.flag ?? '🌍'}</Text>
            <Text style={styles.langPickerText}>{LANGS.find(l => l.code === selectedLang)?.label ?? selectedLang}</Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.formContainer, { transform: [{ translateY: formAnim }], opacity: formOpacity }]}>
        <View style={styles.modeSwitch}>
          <TouchableOpacity style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]} onPress={() => setMode('login')}>
            <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>{t('auth.login')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]} onPress={() => setMode('register')}>
            <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>{t('auth.register')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t('auth.email')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t('auth.password')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, paddingRight: 46 }]}
                placeholder={t('auth.passwordMin')}
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            {mode === 'register' && password.length > 0 && (
              <View style={styles.strengthRow}>
                {[1, 2, 3].map(i => (
                  <View
                    key={i}
                    style={[
                      styles.strengthSeg,
                      passwordStrength(password) >= i && {
                        backgroundColor: passwordStrength(password) === 1 ? '#ff6b6b' : passwordStrength(password) === 2 ? '#ffb340' : '#94e336',
                      },
                    ]}
                  />
                ))}
                <Text style={styles.strengthText}>
                  {passwordStrength(password) === 1 ? (t('auth.pwWeak') || 'Słabe') : passwordStrength(password) === 2 ? (t('auth.pwMedium') || 'OK') : passwordStrength(password) >= 3 ? (t('auth.pwStrong') || 'Mocne') : ''}
                </Text>
              </View>
            )}
          </View>
          {mode === 'register' && (
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>{t('auth.confirmPassword')}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingRight: 46 }, confirmPassword && password !== confirmPassword && styles.inputError]}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
              {confirmPassword && password !== confirmPassword && (
                <Text style={styles.errorText}>{t('auth.passwordsMismatch') ?? 'Hasła nie są zgodne'}</Text>
              )}
            </View>
          )}

          <AnimatedButton
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? t('common.loading') : mode === 'login' ? t('auth.login') : t('auth.register')}
            </Text>
          </AnimatedButton>

          {/* Logowanie spoleczne */}
          <View style={styles.oauthDivider}>
            <View style={styles.oauthLine} />
            <Text style={styles.oauthDividerText}>{t('auth.orContinue') || 'lub'}</Text>
            <View style={styles.oauthLine} />
          </View>
          <View style={styles.oauthRow}>
            <TouchableOpacity style={styles.oauthBtn} onPress={() => handleOAuth('google')} disabled={!!oauthLoading}>
              {oauthLoading === 'google' ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="logo-google" size={18} color="#fff" />
                  <Text style={styles.oauthBtnText}>Google</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.oauthBtn} onPress={() => handleOAuth('apple')} disabled={!!oauthLoading}>
              {oauthLoading === 'apple' ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="logo-apple" size={20} color="#fff" />
                  <Text style={styles.oauthBtnText}>Apple</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {mode === 'login' && bioAvailable && bioEnabled && (
            <TouchableOpacity style={styles.bioTile} onPress={handleBiometricLogin} disabled={bioLoading}>
              <Ionicons name={bioType === 'faceId' ? 'scan-outline' : 'finger-print-outline'} size={22} color={PRIMARY} />
              <View>
                <Text style={styles.bioTileText}>
                  {bioLoading
                    ? (t('common.loading') || 'Loading...')
                    : bioType === 'faceId'
                      ? (t('biometric.loginWithFaceId') || 'Login with Face ID')
                      : (t('biometric.loginWithFingerprint') || 'Login with Fingerprint')}
                </Text>
                {savedBioEmail && <Text style={styles.bioTileEmail}>{savedBioEmail}</Text>}
              </View>
            </TouchableOpacity>
          )}

          {mode === 'login' && (
            <TouchableOpacity onPress={() => { setShowResetModal(true); setResetEmail('') }}>
              <Text style={styles.forgotText}>{t('auth.forgotPassword') ?? 'Nie pamiętasz hasła?'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
            <Text style={styles.switchText}>
              {mode === 'login' ? t('auth.noAccount') + ' ' : t('auth.hasAccount') + ' '}
              <Text style={styles.switchLink}>
                {mode === 'login' ? t('auth.register') : t('auth.login')}
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.guestBtn} onPress={() => router.push('/(auth)/guest-preview' as any)}>
            <Ionicons name="eye-outline" size={16} color="rgba(255,255,255,0.55)" />
            <Text style={styles.guestBtnText}>{t('guest.browseAsGuest')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
      </ScrollView>

      {/* Wybor jezyka: bottom sheet z pelna lista (flaga + nazwa + ✓) */}
      <Modal visible={showLangSheet} transparent animationType="slide" onRequestClose={() => setShowLangSheet(false)}>
        <TouchableOpacity style={styles.langSheetOverlay} activeOpacity={1} onPress={() => setShowLangSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.langSheet}>
            <View style={styles.langSheetHandle} />
            <ScrollView style={{ maxHeight: 420 }}>
              {LANGS.map(lang => {
                const active = selectedLang === lang.code
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langSheetRow, active && styles.langSheetRowActive]}
                    onPress={() => {
                      setShowLangSheet(false)
                      // iOS: nawigacja w trakcie zamykania modala potrafi ubic apke — odczekaj animacje
                      setTimeout(() => handleLangChange(lang.code), 350)
                    }}
                  >
                    <Text style={styles.langFlag}>{lang.flag}</Text>
                    <Text style={[styles.langSheetLabel, active && { color: LIME, fontWeight: '700' }]}>{lang.label}</Text>
                    {active && <Ionicons name="checkmark" size={17} color={LIME} />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Weryfikacja e-maila po rejestracji */}
      <Modal visible={showVerifyModal} animationType="slide" transparent>
        <View style={styles.resetOverlay}>
          <View style={styles.resetModal}>
            <Text style={styles.resetTitle}>{t('auth.verifyTitle')}</Text>
            <Text style={styles.resetSubtitle}>{t('auth.verifySub', { email: email.trim() })}</Text>
            <TextInput
              style={styles.resetInput}
              placeholder={t('auth.resetCodePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={verifyCode}
              onChangeText={setVerifyCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity style={[styles.resetBtn, verifyLoading && styles.resetBtnDisabled]} onPress={handleVerifyEmail} disabled={verifyLoading}>
              <Text style={styles.resetBtnText}>{verifyLoading ? t('common.loading') : t('auth.verifyBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetCancel} onPress={handleResendCode} disabled={resendLoading}>
              <Text style={styles.resetCancelText}>{resendLoading ? t('common.loading') : t('auth.verifyResend')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetCancel} onPress={() => setShowVerifyModal(false)}>
              <Text style={styles.resetCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showResetModal} animationType="slide" transparent>
        <View style={styles.resetOverlay}>
          <View style={styles.resetModal}>
            {!resetSent ? (
              <>
                <Text style={styles.resetTitle}>{t('auth.resetPassword') ?? 'Resetuj hasło'}</Text>
                <Text style={styles.resetSubtitle}>{t('auth.resetSubtitle') ?? 'Wyślemy link resetujący na Twój email'}</Text>
                <TextInput
                  style={styles.resetInput}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={[styles.resetBtn, resetLoading && styles.resetBtnDisabled]} onPress={handleResetPassword} disabled={resetLoading}>
                  <Text style={styles.resetBtnText}>{resetLoading ? t('common.loading') : t('auth.sendResetLink') ?? 'Wyślij link'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resetCancel} onPress={() => setShowResetModal(false)}>
                  <Text style={styles.resetCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.resetTitle}>{t('auth.resetCodeTitle')}</Text>
                <Text style={styles.resetSubtitle}>{resetEmail.trim()}</Text>
                <TextInput
                  style={styles.resetInput}
                  placeholder={t('auth.resetCodePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TextInput
                  style={styles.resetInput}
                  placeholder={t('auth.resetNewPassword')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={resetNewPass}
                  onChangeText={setResetNewPass}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.resetInput}
                  placeholder={t('auth.resetRepeatPassword')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={resetNewPass2}
                  onChangeText={setResetNewPass2}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TouchableOpacity style={[styles.resetBtn, resetLoading && styles.resetBtnDisabled]} onPress={handleResetVerify} disabled={resetLoading}>
                  <Text style={styles.resetBtnText}>{resetLoading ? t('common.loading') : t('auth.resetDo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resetCancel} onPress={() => { setShowResetModal(false); setResetSent(false); setResetCode('') }}>
                  <Text style={styles.resetCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  circle1: { position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(125,197,46,0.08)' },
  circle2: { position: 'absolute', bottom: -80, left: -80, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(0,170,255,0.06)' },
  header: { alignItems: 'center', marginBottom: 36 },
  logoContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(125,197,46,0.3)' },
  logo: { width: 80, height: 80, borderRadius: 40 },
  appName: { fontSize: 34, fontWeight: '800', color: '#7dc52e', letterSpacing: -1 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  langFlag: { fontSize: 20 },
  langPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginTop: 16 },
  langPickerText: { fontSize: 13.5, fontWeight: '600', color: '#fff' },
  langSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  langSheet: { backgroundColor: '#1a2a44', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  langSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 },
  langSheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  langSheetRowActive: { backgroundColor: 'rgba(148,227,54,0.1)' },
  langSheetLabel: { flex: 1, fontSize: 15, color: '#fff' },
  formContainer: { gap: 0 },
  modeSwitch: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, marginBottom: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#7dc52e' },
  modeBtnText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  modeBtnTextActive: { color: '#fff' },
  form: { gap: 16 },
  inputWrapper: { gap: 6 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  oauthDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 12 },
  oauthLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  oauthDividerText: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  oauthRow: { flexDirection: 'row', gap: 10 },
  oauthBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 13 },
  oauthBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  guestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 8 },
  guestBtnText: { fontSize: 13.5, color: 'rgba(255,255,255,0.55)', textDecorationLine: 'underline' },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  strengthSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  strengthText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)', minWidth: 44, textAlign: 'right' },
  inputLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)', paddingLeft: 4 },
  input: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, fontSize: 16, color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)' },
  inputError: { borderColor: '#ff4757' },
  errorText: { fontSize: 12, color: '#ff4757', marginTop: 2, paddingLeft: 4 },
  button: { backgroundColor: '#7dc52e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4, shadowColor: '#7dc52e', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  buttonDisabled: { backgroundColor: '#555', shadowOpacity: 0 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  bioTile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(125,197,46,0.1)', borderWidth: 1.5, borderColor: 'rgba(125,197,46,0.3)', borderRadius: 14, paddingVertical: 14, marginTop: 12 },
  bioTileEmail: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 2 },
  bioTileText: { fontSize: 14, fontWeight: '700', color: PRIMARY },
  forgotText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', textDecorationLine: 'underline' },
  switchText: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 4 },
  switchLink: { color: '#7dc52e', fontWeight: '700' },
  resetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  resetModal: { backgroundColor: '#1a2a44', borderRadius: 24, padding: 28, alignItems: 'center' },
  resetTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  resetSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  resetInput: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)', width: '100%', marginBottom: 12 },
  resetBtn: { backgroundColor: '#7dc52e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%', marginBottom: 8 },
  resetBtnDisabled: { backgroundColor: '#555' },
  resetBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resetCancel: { paddingVertical: 10 },
  resetCancelText: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  resetSuccessIcon: { fontSize: 48, marginBottom: 12 },
})
