import Purchases, { CustomerInfo, PurchasesOffering } from 'react-native-purchases'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

const ENTITLEMENT_ID = 'FitnessSwipe Premium'

export async function initRevenueCat(userId: string) {
  try {
    // RevenueCat wymaga natywnego buildu - w Expo Go zawsze pomijamy
    if (Constants.appOwnership === 'expo') {
      console.log('RevenueCat: pomijam inicjalizacje w Expo Go')
      return
    }

    // Osobne klucze publiczne per platforma: iOS (appl_...) i Android (goog_...)
    const apiKey = Platform.OS === 'ios'
      ? Constants.expoConfig?.extra?.revenueCatApiKeyIos
      : Constants.expoConfig?.extra?.revenueCatApiKey
    if (!apiKey) {
      console.warn('RevenueCat API key not found for platform:', Platform.OS)
      return
    }

    Purchases.configure({ apiKey, appUserID: userId })

    if (__DEV__) {
      Purchases.setLogLevel('DEBUG' as any)
    }
  } catch (e) {
    console.warn('RevenueCat init failed:', e)
  }
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (Constants.appOwnership === 'expo') return null
  try {
    const offerings = await Purchases.getOfferings()
    return offerings.current ?? null
  } catch (e) {
    console.error('getOfferings error:', e)
    return null
  }
}

export async function purchasePackage(pkg: any): Promise<{ success: boolean; error?: string }> {
  if (Constants.appOwnership === 'expo') return { success: false, error: 'expo_go_not_supported' }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
    if (isPremium) {
      await syncPremiumStatus(true)
    }
    return { success: isPremium }
  } catch (e: any) {
    if (e.userCancelled) {
      return { success: false, error: 'cancelled' }
    }
    return { success: false, error: e?.message ?? 'unknown_error' }
  }
}

export async function restorePurchases(): Promise<{ success: boolean; isPremium: boolean }> {
  if (Constants.appOwnership === 'expo') return { success: false, isPremium: false }
  try {
    const customerInfo = await Purchases.restorePurchases()
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
    await syncPremiumStatus(isPremium)
    return { success: true, isPremium }
  } catch (e) {
    console.error('restorePurchases error:', e)
    return { success: false, isPremium: false }
  }
}

export async function checkPremiumStatus(): Promise<boolean> {
  if (Constants.appOwnership === 'expo') return false
  try {
    const customerInfo = await Purchases.getCustomerInfo()
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
    await syncPremiumStatus(isPremium)
    return isPremium
  } catch (e) {
    console.error('checkPremiumStatus error:', e)
    return false
  }
}

// Zapisuje status premium do Supabase, zeby reszta aplikacji
// (filtry, limity swipe, itp.) mogla korzystac z tej informacji
// bez wywolywania RevenueCat SDK w kazdym miejscu.
async function syncPremiumStatus(isPremium: boolean) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ is_premium: isPremium }).eq('user_id', user.id)
  } catch (e) {
    console.error('syncPremiumStatus error:', e)
  }
}

// ============================================================
// Subskrypcja trenera (osobny entitlement, oferta "trainer")
// ============================================================

const TRAINER_ENTITLEMENT_ID = 'FitnessSwipe Trainer'

export async function getTrainerOffering(): Promise<PurchasesOffering | null> {
  if (Constants.appOwnership === 'expo') return null
  try {
    const offerings = await Purchases.getOfferings()
    return offerings.all['trainer'] ?? null
  } catch (e) {
    console.error('getTrainerOffering error:', e)
    return null
  }
}

export async function purchaseTrainerPackage(pkg: any): Promise<{ success: boolean; error?: string; devMode?: boolean }> {
  // W Expo Go zakupy nie dzialaja — aktywujemy testowo, zeby dalo sie przejsc caly flow
  if (Constants.appOwnership === 'expo') {
    await syncTrainerStatus(true)
    return { success: true, devMode: true }
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    const isTrainer = customerInfo.entitlements.active[TRAINER_ENTITLEMENT_ID] !== undefined
    if (isTrainer) await syncTrainerStatus(true)
    return { success: isTrainer }
  } catch (e: any) {
    if (e.userCancelled) return { success: false, error: 'cancelled' }
    return { success: false, error: e?.message ?? 'unknown_error' }
  }
}

export async function checkTrainerStatus(): Promise<boolean> {
  if (Constants.appOwnership === 'expo') return false
  try {
    const customerInfo = await Purchases.getCustomerInfo()
    const isTrainer = customerInfo.entitlements.active[TRAINER_ENTITLEMENT_ID] !== undefined
    await syncTrainerStatus(isTrainer)
    return isTrainer
  } catch (e) {
    console.error('checkTrainerStatus error:', e)
    return false
  }
}

async function syncTrainerStatus(isTrainer: boolean) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ is_trainer: isTrainer }).eq('user_id', user.id)
  } catch (e) {
    console.error('syncTrainerStatus error:', e)
  }
}
