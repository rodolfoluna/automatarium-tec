import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import Backend from 'i18next-http-backend'
import dayjs from 'dayjs'
import 'dayjs/locale/es'
import 'dayjs/locale/bg'

// Contains the different locale codes as the key and locale names as the value
export const locales = {
  es: 'Español',
  en: 'English',
  bg: 'Български'
}

// Contains the locale namespaces that are files
const localeNamespaces = [
  'common'
]

i18n.use(Backend).use(initReactI18next).init({
  lng: JSON.parse(localStorage.getItem('automatarium-preferences'))?.state.preferences.language,
  fallbackLng: ['es', 'en'],
  supportedLngs: Object.keys(locales),
  defaultNS: localeNamespaces.at(0),
  ns: localeNamespaces,
  debug: process.env.NODE_ENV === 'development',
  react: {
    useSuspense: true
  },
  interpolation: {
    escapeValue: false
  },
  backend: {
    loadPath: './locales/{{lng}}/{{ns}}.json'
  }
})

// Fechas relativas ("hace 5 minutos") en el idioma de la app
const setDayjsLocale = (lng?: string) => dayjs.locale(['es', 'bg'].includes(lng) ? lng : 'en')
setDayjsLocale(i18n.language)
i18n.on('languageChanged', setDayjsLocale)

export default i18n
