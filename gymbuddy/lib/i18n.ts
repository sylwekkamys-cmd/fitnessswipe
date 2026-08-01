import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'

import pl from '../i18n/pl.json'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import nl from '../i18n/nl.json'
import fr from '../i18n/fr.json'
import de from '../i18n/de.json'
import bg from '../i18n/bg.json'
import ro from '../i18n/ro.json'
import tr from '../i18n/tr.json'

const LANG_KEY = 'app_language'

i18n.use(initReactI18next).init({
  resources: {
    pl: { translation: pl },
    en: { translation: en },
    es: { translation: es },
    nl: { translation: nl },
    fr: { translation: fr },
    de: { translation: de },
    bg: { translation: bg },
    ro: { translation: ro },
    tr: { translation: tr },
  },
  lng: 'pl',
  fallbackLng: 'pl',
  interpolation: { escapeValue: false },
})

AsyncStorage.getItem(LANG_KEY).then(lang => {
  if (lang && lang !== i18n.language) {
    i18n.changeLanguage(lang)
  }
})

export async function changeLanguage(lang: string) {
  await AsyncStorage.setItem(LANG_KEY, lang)
  await i18n.changeLanguage(lang)
}

export default i18n