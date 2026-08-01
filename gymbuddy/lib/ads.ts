import { InterstitialAd, AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads'
import { Platform } from 'react-native'
import Constants from 'expo-constants'

const IS_DEV = __DEV__

const INTERSTITIAL_ID = IS_DEV
  ? TestIds.INTERSTITIAL
  : Platform.OS === 'ios'
    ? Constants.expoConfig?.extra?.admobInterstitialIos
    : Constants.expoConfig?.extra?.admobInterstitialAndroid

const REWARDED_ID = IS_DEV
  ? TestIds.REWARDED
  : Platform.OS === 'ios'
    ? Constants.expoConfig?.extra?.admobRewardedIos
    : Constants.expoConfig?.extra?.admobRewardedAndroid

let interstitial: InterstitialAd | null = null
let swipeCount = 0

export function initAds() {
  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
    requestNonPersonalizedAdsOnly: true,
  })
  interstitial.load()
}

export function trackSwipeAndShowAd(isPremium: boolean) {
  if (isPremium) return
  swipeCount++
  if (swipeCount % 5 === 0 && interstitial) {
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitial?.show()
      // Zaladuj nastepna reklame
      interstitial?.load()
    })
    if (interstitial.loaded) {
      interstitial.show()
      interstitial.load()
    }
  }
}

export function showRewardedAd(onRewarded: (amount: number) => void) {
  const rewarded = RewardedAd.createForAdRequest(REWARDED_ID, {
    requestNonPersonalizedAdsOnly: true,
  })
  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewarded.show()
  })
  rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
    onRewarded(reward.amount)
  })
  rewarded.load()
}