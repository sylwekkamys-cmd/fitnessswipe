// Klucze klienckie (Supabase anon, RevenueCat public, AdMob).
// Zrodla w kolejnosci: zmienne srodowiskowe EAS -> lokalny keys.json.
// Jesli klucze Supabase sa puste, build MUSI sie wywalic — pusta konfiguracja
// oznacza aplikacje, ktora crashuje na starcie (lekcja z wersji 22).
let fileKeys = {}
try { fileKeys = require('./keys.json') } catch (e) { }

const keys = {
  supabaseUrl: process.env.SUPABASE_URL || fileKeys.supabaseUrl || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || fileKeys.supabaseAnonKey || '',
  revenueCatApiKey: process.env.REVENUECAT_API_KEY || fileKeys.revenueCatApiKey || '',
  revenueCatApiKeyIos: process.env.REVENUECAT_API_KEY_IOS || fileKeys.revenueCatApiKeyIos || '',
  admobInterstitialAndroid: process.env.ADMOB_INTERSTITIAL_ANDROID || fileKeys.admobInterstitialAndroid || '',
  admobBannerAndroid: process.env.ADMOB_BANNER_ANDROID || fileKeys.admobBannerAndroid || '',
  admobRewardedAndroid: process.env.ADMOB_REWARDED_ANDROID || fileKeys.admobRewardedAndroid || '',
}

if (!keys.supabaseUrl || !keys.supabaseAnonKey) {
  throw new Error(
    'BLAD KONFIGURACJI: brak kluczy Supabase. Ustaw zmienne EAS (SUPABASE_URL, SUPABASE_ANON_KEY) albo dodaj keys.json. Przerywam build, zeby nie wypuscic aplikacji, ktora crashuje na starcie.'
  )
}

export default {
  expo: {
    name: 'FitnessSwipe',
    slug: 'fitnessswipe',
    scheme: 'fitnessswipe',
    version: '1.0.0',
    // Tlo okna (Android windowBackground / iOS root view): kazda szpara przy
    // animacjach klawiatury jest granatowa zamiast systemowej bieli
    backgroundColor: '#0d1b2e',
    icon: './assets/images/icon.png',
    splash: {
      image: './assets/images/logo.png',
      resizeMode: 'contain',
      backgroundColor: '#0d1b2e'
    },
   ios: {
  bundleIdentifier: 'com.fitnessswipe.app',
  icon: './assets/images/logo.png',
  requireFullScreen: true,
  supportsTablet: false,
  associatedDomains: ['applinks:fitnessswipe.app'],
  // Jawny entitlement HealthKit: EAS synchronizuje uprawnienia profilu na tej
  // podstawie (sam plugin healthkit dodaje go dopiero w prebuildzie na serwerze,
  // wiec bez tego wpisu profil provisioningowy nie dostawal HealthKit i build padal)
  entitlements: {
    'com.apple.developer.healthkit': true
  },
  infoPlist: {
    UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
    UIBackgroundModes: ['remote-notification'],
    ITSAppUsesNonExemptEncryption: false,
    NSLocationWhenInUseUsageDescription: 'FitnessSwipe uses your location to find workout partners near your gym within a chosen radius.',
    NSPhotoLibraryUsageDescription: 'FitnessSwipe needs access to your photos to let you upload profile pictures so other users can find and recognize you.',
    NSCameraUsageDescription: 'FitnessSwipe uses your camera to take profile pictures and workout status photos or videos you choose to share.',
    NSMicrophoneUsageDescription: 'FitnessSwipe uses your microphone to record audio when you create a short workout status video.',
    NSFaceIDUsageDescription: 'FitnessSwipe uses Face ID to let you quickly and securely unlock the app without typing your password.'
  }
},
    android: {
  package: 'com.fitnessswipe.app',
  versionCode: 21,
  adaptiveIcon: {
    foregroundImage: './assets/images/logo.png',
    backgroundColor: '#0d1b2e'
  },
  permissions: [
    'android.permission.health.READ_STEPS',
    'android.permission.health.READ_EXERCISE',
    // Dystans do naklejek aktywnosci — kazdy typ danych Health Connect MUSI byc
    // zadeklarowany w manifescie, inaczej requestPermission wywala cale polaczenie
    'android.permission.health.READ_DISTANCE'
  ],
  intentFilters: [
    {
      action: 'VIEW',
      autoVerify: true,
      data: [
        { scheme: 'https', host: 'fitnessswipe.app', pathPrefix: '/challenge' },
        { scheme: 'https', host: 'fitnessswipe.app', pathPrefix: '/event' },
        { scheme: 'https', host: 'fitnessswipe.app', pathPrefix: '/trainer' }
      ],
      category: ['BROWSABLE', 'DEFAULT']
    }
  ],
  config: {
    googleMaps: {
      apiKey: 'AIzaSyDNBH36Ju28D7WkvqlPqnYzKy0PTDlroJg'
    }
  }
},
plugins: [
      'expo-video',
      'expo-audio',
      ['@kingstinct/react-native-healthkit', {
        NSHealthShareUsageDescription: 'FitnessSwipe reads your step count from Apple Health to power step challenges, duels and the optional activity display on your profile.',
        background: false
      }],
      ['expo-notifications', {
        icon: './assets/images/logo.png',
        color: '#7dc52e'
      }],
      ['react-native-google-mobile-ads', {
        androidAppId: 'ca-app-pub-1123592682017029~2225836525',
        iosAppId: 'ca-app-pub-1123592682017029~2225836525',
      }],
      'react-native-health-connect',
      ['expo-build-properties', {
        android: {
          minSdkVersion: 26
        }
      }]
    ],
    extra: {
      eas: {
        projectId: 'd4d0b0a6-7bf5-427e-8359-bb9377eb6d5a'
      },
      supabaseUrl: keys.supabaseUrl,
      supabaseAnonKey: keys.supabaseAnonKey,
      revenueCatApiKey: keys.revenueCatApiKey,
      revenueCatApiKeyIos: keys.revenueCatApiKeyIos,
      admobInterstitialAndroid: keys.admobInterstitialAndroid,
      admobBannerAndroid: keys.admobBannerAndroid,
      admobRewardedAndroid: keys.admobRewardedAndroid,
    }
  }
}