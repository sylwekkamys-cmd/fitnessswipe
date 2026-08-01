// Wlasny punkt wejscia z diagnostyka bootu.
// expo-router wykonuje przy starcie WSZYSTKIE pliki tras z app/ — jesli ktorys
// rzuci bledem synchronicznie, glowna aplikacja nigdy sie nie rejestruje:
// iOS wisi na splashu bez logu awarii, Android crashuje od razu.
// Dlatego: (1) globalny lapacz bledow od pierwszej linijki, (2) try/catch na
// samym wejsciu + awaryjny ekran pokazujacy pelna tresc bledu.
global.__BOOT_ERRORS = []
try {
  var prevHandler = global.ErrorUtils && global.ErrorUtils.getGlobalHandler && global.ErrorUtils.getGlobalHandler()
  if (global.ErrorUtils && global.ErrorUtils.setGlobalHandler) {
    global.ErrorUtils.setGlobalHandler(function (e, isFatal) {
      try {
        global.__BOOT_ERRORS.push((isFatal ? 'FATAL: ' : '') + String((e && (e.stack || e.message)) || e))
      } catch (x) { }
      // Bledow fatalnych NIE przekazujemy dalej — na Androidzie zabilyby proces,
      // zanim ekran diagnostyczny zdazy cokolwiek pokazac
      if (!isFatal && prevHandler) prevHandler(e, isFatal)
    })
  }
} catch (e) { }

// Sentry startuje PO naszym handlerze ErrorUtils: jego handler owija nasz i woła
// go po wyslaniu raportu, wiec fatale trafiaja do Sentry, a ekran diagnostyczny
// dalej dziala. Brak DSN = monitoring wylaczony, aplikacja dziala normalnie.
try {
  var Constants = require('expo-constants').default
  var sentryDsn = Constants && Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.sentryDsn
  var isExpoGo = Constants && Constants.executionEnvironment === 'storeClient'
  if (sentryDsn && !isExpoGo) {
    var Sentry = require('@sentry/react-native')
    Sentry.init({
      dsn: sentryDsn,
      enabled: !__DEV__,
      // Sam monitoring bledow — bez sladow wydajnosciowych (koszty i szum)
      tracesSampleRate: 0,
      sendDefaultPii: false,
    })
    global.__SENTRY_ENABLED = true
  }
} catch (e) {
  try { global.__BOOT_ERRORS.push('SENTRY INIT: ' + String((e && e.message) || e)) } catch (x) { }
}

function registerFallback() {
  try {
    var RN = require('react-native')
    var React = require('react')
    var Fallback = function () {
      return React.createElement(
        RN.ScrollView,
        { style: { flex: 1, backgroundColor: '#0d1b2e' }, contentContainerStyle: { paddingTop: 70, paddingHorizontal: 18, paddingBottom: 40 } },
        React.createElement(RN.Text, { style: { color: '#ff6b6b', fontSize: 17, fontWeight: '800', marginBottom: 12 } }, 'Diagnostyka startu (entry)'),
        (global.__BOOT_ERRORS.length ? global.__BOOT_ERRORS : ['(brak zlapanych bledow)']).map(function (er, i) {
          return React.createElement(RN.Text, { key: String(i), selectable: true, style: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginBottom: 14 } }, String(er))
        })
      )
    }
    RN.AppRegistry.registerComponent('main', function () { return Fallback })
  } catch (x) { }
}

try {
  require('expo-router/entry')
} catch (e) {
  global.__BOOT_ERRORS.unshift('ENTRY THROW: ' + String((e && (e.stack || e.message)) || e))
  registerFallback()
}
