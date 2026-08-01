import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const SECURE_EMAIL_KEY = 'bio_email'
const SECURE_PASSWORD_KEY = 'bio_password'

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync()
    const isEnrolled = await LocalAuthentication.isEnrolledAsync()
    return hasHardware && isEnrolled
  } catch (e) {
    return false
  }
}

export async function getBiometricType(): Promise<'faceId' | 'fingerprint' | 'none'> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'faceId'
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint'
    return 'none'
  } catch (e) {
    return 'none'
  }
}

export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    })
    return result.success
  } catch (e) {
    return false
  }
}

// ============================================================
// Bezpieczne przechowywanie danych logowania (email + haslo)
// Uzywamy tego zamiast tokenow sesji, bo Supabase uniewaznia
// refresh token przy KAZDYM signOut() (nawet ze scope: 'local'),
// wiec proba "odtworzenia" starej sesji zawsze konczy sie bledem.
// Zamiast tego, Face ID odblokowuje zaszyfrowane dane logowania,
// a aplikacja loguje sie na nowo (signInWithPassword) - dokladnie
// tak jak dziala to w aplikacjach bankowych.
// ============================================================

export async function saveSecureCredentials(email: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_EMAIL_KEY, email)
  await SecureStore.setItemAsync(SECURE_PASSWORD_KEY, password)
}

export async function getSecureCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const email = await SecureStore.getItemAsync(SECURE_EMAIL_KEY)
    const password = await SecureStore.getItemAsync(SECURE_PASSWORD_KEY)
    if (!email || !password) return null
    return { email, password }
  } catch (e) {
    return null
  }
}

export async function getSecureCredentialsEmail(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_EMAIL_KEY)
  } catch (e) {
    return null
  }
}

export async function clearSecureCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_EMAIL_KEY)
    await SecureStore.deleteItemAsync(SECURE_PASSWORD_KEY)
  } catch (e) {
    // ignoruj
  }
}
