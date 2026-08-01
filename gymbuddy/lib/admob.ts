import Constants from 'expo-constants'
import { Platform } from 'react-native'

const isExpoGo = Constants.appOwnership === 'expo'
// Reklamy tylko na Androidzie: jednostki AdMob sa zarejestrowane dla Androida,
// a iOS v1 startuje bez reklam (bez ATT i bez pustych bannerow)
const adsDisabled = isExpoGo || Platform.OS !== 'android'

// Jesli Expo Go - uzywaj mock, jesli natywny build - uzywaj prawdziwych reklam
let BannerAd: any = null
let BannerAdSize: any = { BANNER: 'BANNER' }
let InterstitialAd: any = null
let RewardedAd: any = null
let AdEventType: any = { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' }
let RewardedAdEventType: any = { LOADED: 'loaded', EARNED_REWARD: 'earned_reward' }
let TestIds: any = {
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
}

if (!adsDisabled) {
  try {
    const ads = require('react-native-google-mobile-ads')
    BannerAd = ads.BannerAd
    BannerAdSize = ads.BannerAdSize
    InterstitialAd = ads.InterstitialAd
    RewardedAd = ads.RewardedAd
    AdEventType = ads.AdEventType
    RewardedAdEventType = ads.RewardedAdEventType
    TestIds = ads.TestIds
  } catch (e) {
    console.log('AdMob not available:', e)
  }
}

export { BannerAd, BannerAdSize }

const isDev = __DEV__

const INTERSTITIAL_ID = isDev
  ? TestIds.INTERSTITIAL
  : (Constants.expoConfig?.extra?.admobInterstitialAndroid ?? TestIds.INTERSTITIAL)

const REWARDED_ID = isDev
  ? TestIds.REWARDED
  : (Constants.expoConfig?.extra?.admobRewardedAndroid ?? TestIds.REWARDED)

export const BANNER_ID = isDev
  ? TestIds.BANNER
  : (Constants.expoConfig?.extra?.admobBannerAndroid ?? TestIds.BANNER)

// ============================================================
// Interstitial
// ============================================================

let interstitial: any = null
let interstitialLoaded = false

export function loadInterstitial() {
  if (adsDisabled || !InterstitialAd) return
  try {
    interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
      requestNonPersonalizedAdsOnly: true,
    })
    interstitial.addAdEventListener(AdEventType.LOADED, () => { interstitialLoaded = true })
    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoaded = false
      loadInterstitial()
    })
    interstitial.load()
  } catch (e) { console.log('Interstitial load error:', e) }
}

export async function showInterstitial(): Promise<void> {
  if (adsDisabled || !interstitial || !interstitialLoaded) return
  return new Promise((resolve) => {
    try {
      interstitial.addAdEventListener(AdEventType.CLOSED, () => resolve())
      interstitial.addAdEventListener(AdEventType.ERROR, () => resolve())
      interstitial.show()
    } catch (e) { resolve() }
  })
}

// ============================================================
// Rewarded
// ============================================================

let rewarded: any = null
let rewardedLoaded = false

export function loadRewarded() {
  if (adsDisabled || !RewardedAd) return
  try {
    rewarded = RewardedAd.createForAdRequest(REWARDED_ID, {
      requestNonPersonalizedAdsOnly: true,
    })
    rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => { rewardedLoaded = true })
    rewarded.load()
  } catch (e) { console.log('Rewarded load error:', e) }
}

export async function showRewarded(): Promise<{ rewarded: boolean; amount: number }> {
  if (adsDisabled || !rewarded || !rewardedLoaded) return { rewarded: false, amount: 0 }
  return new Promise((resolve) => {
    try {
      rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: any) => {
        resolve({ rewarded: true, amount: reward.amount })
      })
      rewarded.addAdEventListener(AdEventType.CLOSED, () => {
        rewardedLoaded = false
        loadRewarded()
        resolve({ rewarded: false, amount: 0 })
      })
      rewarded.addAdEventListener(AdEventType.ERROR, () => resolve({ rewarded: false, amount: 0 }))
      rewarded.show()
    } catch (e) { resolve({ rewarded: false, amount: 0 }) }
  })
}
