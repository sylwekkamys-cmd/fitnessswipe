import React from 'react'
import { View, Text, StyleSheet, Animated, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

// ============================================================
// Wspolne elementy wizualne relacji: filtry kolorystyczne (tinty)
// i naklejki w 3 stylach — uzywane w edytorze, przegladarce
// stories i podgladzie na profilu, zeby wszedzie wygladaly tak samo.
// ============================================================

// place/text/pr: wlasny tekst zapisany w naklejce (nie w statusie); day: data z dnia dodania.
// s: skala naklejki ustawiona pinchem w edytorze (0.5-3, domyslnie 1)
// activity: statystyki treningu (sport + m/mu = duza wartosc i jednostka,
// tm = czas, ex = tempo/predkosc/kalorie). Tapniecie w edytorze rozsypuje duzy
// napis na osobne, niezaleznie przeciagane zetony (id + chip = indeks zetonu);
// tapniecie zetonu skleja calosc z powrotem.
export type ActivityData = { sport: string; m: string; mu: string; tm?: string; ex?: string; hr?: string; kcal?: string }
export type StatusOverlay = { type: 'time' | 'gym' | 'place' | 'text' | 'day' | 'pr' | 'activity' | 'gif' | 'sticker' | 'slider'; x: number; y: number; v?: number; text?: string; s?: number; id?: string; chip?: number; gifUrl?: string; stickerUrl?: string; sliderEmoji?: string } & Partial<ActivityData>

// Emoji do wyboru jako "buzia" slidera (jak w IG) — stala paleta, wyswietlana w edytorze
export const SLIDER_EMOJIS = ['❤️', '🔥', '😍', '💪', '😂', '👍'] as const

// Sporty do naklejki aktywnosci (etykiety przez i18n: activity.<key>)
export const ACTIVITY_SPORTS = [
  { key: 'run', emoji: '👟' },
  { key: 'ride', emoji: '🚵' },
  { key: 'gym', emoji: '⚡' },
  { key: 'walk', emoji: '👣' },
  { key: 'swim', emoji: '🥽' },
] as const

// Wiersze statystyk budowane z danych aktywnosci (do 5 sztuk zaleznie od pol,
// kazdy niezaleznie przeciagany po rozsypaniu — patrz cycleOverlay). Ikony
// Ionicons w kolku (Wariant 1) — formularz recznego wpisywania ma wlasne
// emoji dopasowane DO tych ikon, nie odwrotnie.
export function activityChips(act: ActivityData): { value: string; label: string; icon: string }[] {
  const isGym = act.sport === 'gym'
  const isRide = act.sport === 'ride'
  const rows: { value: string; label: string; icon: string }[] = []
  if (isGym) {
    rows.push({ value: `${act.m} min`, label: 'CZAS', icon: 'time-outline' })
  } else {
    rows.push({ value: `${act.m} km`, label: 'DYSTANS', icon: 'shuffle-outline' })
    if (act.tm) rows.push({ value: act.tm, label: 'CZAS', icon: 'time-outline' })
    if (act.ex) rows.push({ value: act.ex, label: isRide ? 'PRĘDKOŚĆ' : 'TEMPO', icon: 'flash-outline' })
  }
  if (act.hr) rows.push({ value: `${act.hr} bpm`, label: 'TĘTNO ŚREDNIE', icon: 'heart-outline' })
  if (act.kcal) rows.push({ value: `${act.kcal} kcal`, label: 'KALORIE', icon: 'flame-outline' })
  return rows
}

export const STATUS_FILTERS = ['', 'warm', 'cool', 'neon', 'sunset', 'noir', 'sepia', 'rose', 'ice', 'forest', 'gold', 'fade'] as const

// Efekty nakladane NA filtr (mozna laczyc): winieta + ramki.
// W bazie jada razem z filtrem w jednej kolumnie, rozdzielone "|" (np. "warm|vignette|frame")
export const STATUS_EFFECTS = ['vignette', 'frame', 'framegold'] as const

// Nakladka filtru/efektow: przyjmuje pojedynczy filtr ("warm") albo zlozenie ("warm|vignette")
export function FilterLayer({ id }: { id?: string | null }) {
  if (!id) return null
  const tokens = id.split('|').filter(Boolean)
  if (tokens.length === 0) return null
  return <>{tokens.map(tok => <SingleLayer key={tok} id={tok} />)}</>
}

function SingleLayer({ id }: { id: string }) {
  switch (id) {
    case 'warm':
      return <LinearGradient colors={['rgba(255,150,60,0.20)', 'rgba(255,70,10,0.14)']} style={s.fill} pointerEvents="none" />
    case 'cool':
      return <LinearGradient colors={['rgba(70,150,255,0.20)', 'rgba(10,50,140,0.16)']} style={s.fill} pointerEvents="none" />
    case 'neon':
      return <LinearGradient colors={['rgba(148,227,54,0.20)', 'rgba(0,170,255,0.16)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fill} pointerEvents="none" />
    case 'sunset':
      return <LinearGradient colors={['rgba(255,94,58,0.24)', 'rgba(143,36,237,0.22)']} style={s.fill} pointerEvents="none" />
    case 'noir':
      return <LinearGradient colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.52)']} style={s.fill} pointerEvents="none" />
    case 'sepia':
      return <LinearGradient colors={['rgba(150,100,45,0.26)', 'rgba(70,45,20,0.30)']} style={s.fill} pointerEvents="none" />
    case 'rose':
      return <LinearGradient colors={['rgba(255,110,160,0.20)', 'rgba(190,40,110,0.18)']} style={s.fill} pointerEvents="none" />
    case 'ice':
      return <LinearGradient colors={['rgba(210,235,255,0.22)', 'rgba(90,140,200,0.20)']} style={s.fill} pointerEvents="none" />
    case 'forest':
      return <LinearGradient colors={['rgba(70,180,95,0.18)', 'rgba(10,80,50,0.24)']} style={s.fill} pointerEvents="none" />
    case 'gold':
      return <LinearGradient colors={['rgba(240,180,41,0.22)', 'rgba(170,105,20,0.20)']} style={s.fill} pointerEvents="none" />
    case 'fade':
      return <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(220,220,230,0.12)']} style={s.fill} pointerEvents="none" />
    case 'vignette':
      // Przyciemnione rogi: dwie warstwy obramowania z zaokragleniem daja miekkie przejscie
      return (
        <View style={s.fill} pointerEvents="none">
          <View style={s.vignetteOuter} />
          <View style={s.vignetteInner} />
        </View>
      )
    case 'frame':
      // Cienka biala obwodka przy SAMEJ krawedzi: domyka obraz bez pustego
      // marginesu (rama biegnie po brzegu ekranu, zero odcietego zdjecia)
      return (
        <View style={s.fill} pointerEvents="none">
          <View style={[s.edgeBorder, { borderColor: '#ffffff' }]} />
          <View style={[s.edgeHairline, { borderColor: 'rgba(0,0,0,0.18)' }]} />
        </View>
      )
    case 'framegold':
      // Zlota rama galeryjna: czarny mat zamyka zdjecie + zlota linia glowna i cienka wewnetrzna
      return (
        <View style={s.fill} pointerEvents="none">
          <View style={[s.matte, { borderColor: '#101820' }]} />
          <View style={[s.matteGoldOuter, { borderColor: '#f0b429' }]} />
          <View style={[s.matteLine, { borderColor: 'rgba(240,180,41,0.75)' }]} />
        </View>
      )
    default:
      return null
  }
}

// Delikatne pulsowanie naklejki (rekord/PR — przyciaga wzrok jak live badge)
function Pulse({ children }: { children: React.ReactNode }) {
  const scale = React.useRef(new Animated.Value(1)).current
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.07, duration: 850, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 850, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [scale])
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
}

// Kolory probek do paska wyboru filtru w edytorze
export const FILTER_SWATCHES: Record<string, [string, string]> = {
  '': ['#3a4c63', '#2e415c'],
  warm: ['#ff9650', '#ff4a0a'],
  cool: ['#4696ff', '#0a328c'],
  neon: ['#94e336', '#00aaff'],
  sunset: ['#ff5e3a', '#8f24ed'],
  noir: ['#555', '#111'],
  sepia: ['#96642d', '#462d14'],
  rose: ['#ff6ea0', '#be286e'],
  ice: ['#d2ebff', '#5a8cc8'],
  forest: ['#46b45f', '#0a5032'],
  gold: ['#f0b429', '#aa6914'],
  fade: ['#f2f2f6', '#b9b9c4'],
}

// Pojedynczy wiersz statystyki: biala ikona w kolku + wartosc z jednostka + podpis
function ActStatRow({ r }: { r: { value: string; label: string; icon: string } }) {
  return (
    <View style={s.actRow}>
      <View style={s.actRowIconWrap}>
        <Ionicons name={r.icon as any} size={19} color="#fff" />
      </View>
      <View>
        <Text style={s.actRowValue} numberOfLines={1}>{r.value}</Text>
        <Text style={s.actRowLabel} numberOfLines={1}>{r.label}</Text>
      </View>
    </View>
  )
}

// Tresc naklejki w wybranym stylu (v: 0 szklana / 1 duzy napis / 2 biala klasyczna).
// PR: zloty wyglad + delikatne pulsowanie; text/day/place niosa wlasny tekst w ov.text
export function StickerContent({ type, variant = 0, time, gym, text, act, sportLabel, chipIndex, gifUrl, stickerUrl, sliderEmoji }: {
  type: 'time' | 'gym' | 'place' | 'text' | 'day' | 'pr' | 'activity' | 'gif' | 'sticker' | 'slider'
  variant?: number
  time?: string | null
  gym?: string | null
  text?: string | null
  act?: ActivityData | null
  sportLabel?: string
  chipIndex?: number
  gifUrl?: string | null
  stickerUrl?: string | null
  sliderEmoji?: string | null
}) {
  // Naklejka GIF: sama animacja, bez tekstu ani ramki — tylko zaokraglone rogi
  if (type === 'gif') {
    if (!gifUrl) return null
    return <Image source={{ uri: gifUrl }} style={s.gifSticker} resizeMode="cover" />
  }

  // Naklejka z paczki Giphy Stickers: mniejsza, przezroczyste tlo z natury,
  // wiec bez zadnego zaokraglenia/ramki — czysta grafika
  if (type === 'sticker') {
    if (!stickerUrl) return null
    return <Image source={{ uri: stickerUrl }} style={s.stickerImg} resizeMode="contain" />
  }

  // Naklejka slidera: STATYCZNY podglad (tor + buzia na srodku) — uzywany w edytorze
  // i przy ogladaniu WLASNEJ relacji. Prawdziwe przeciaganie (dla widzow cudzej
  // relacji) renderuje osobny, interaktywny komponent w StoryViewer.tsx
  if (type === 'slider') {
    return (
      <View style={s.sliderWrap}>
        {!!text && <Text style={s.sliderLabel}>{text}</Text>}
        <View style={s.sliderTrack}>
          <View style={[s.sliderHandle, { left: '50%', marginLeft: -22 }]}>
            <Text style={{ fontSize: 20 }}>{sliderEmoji || '❤️'}</Text>
          </View>
        </View>
      </View>
    )
  }

  // Naklejka aktywnosci: karta ze wszystkimi wierszami albo pojedynczy
  // odlaczony wiersz (chipIndex po rozsypaniu — patrz cycleOverlay)
  if (type === 'activity' && act) {
    const rows = activityChips(act)
    if (typeof chipIndex === 'number') {
      const r = rows[chipIndex]
      if (!r) return null
      return (
        <View style={s.actCard}>
          <ActStatRow r={r} />
        </View>
      )
    }
    if (rows.length === 0) return null
    return (
      <View style={s.actCard}>
        {rows.map((r, i) => <ActStatRow key={i} r={r} />)}
      </View>
    )
  }

  // Naklejki bez emoji — czysty tekst
  const raw = type === 'time' ? (time || '--:--') : type === 'gym' ? (gym || '—') : (text || '—')
  const v = ((variant ?? 0) % 3 + 3) % 3
  const isPr = type === 'pr'
  const label = isPr ? `PR · ${raw}` : raw
  // Wlasny tekst zostaje jak wpisany; reszta (poza godzina) wielkimi literami
  const upper = type !== 'time' && type !== 'text'

  let node: React.ReactNode
  if (v === 1) {
    // Duzy goly napis z mocnym cieniem (jak tekst na IG stories)
    node = (
      <Text style={[s.bigText, isPr && { color: '#f0b429' }]}>
        {upper ? label.toUpperCase() : label}
      </Text>
    )
  } else if (v === 2) {
    // Biala klasyczna pigulka (jak lokalizacja na IG)
    node = (
      <View style={s.whitePill}>
        <Text style={[s.whitePillText, isPr && { color: '#8a6206' }]} numberOfLines={1}>{upper ? label.toUpperCase() : label}</Text>
      </View>
    )
  } else {
    // Szklana ciemna pigulka (domyslna, styl apki)
    node = (
      <View style={[s.glassPill, isPr && { borderColor: 'rgba(240,180,41,0.75)' }]}>
        <Text style={[s.glassPillText, isPr && { color: '#f0b429' }]} numberOfLines={1}>{label}</Text>
      </View>
    )
  }
  return isPr ? <Pulse>{node}</Pulse> : <>{node}</>
}

// Naklejki w trybie ogladania (bez interakcji). hideTypes: typy pomijane tutaj,
// bo wywolujacy renderuje dla nich wlasny (np. interaktywny) komponent
export function OverlayPillsView({ status, hideTypes }: { status: any; hideTypes?: string[] }) {
  const overlays: StatusOverlay[] = Array.isArray(status?.overlays) ? status.overlays : []
  if (overlays.length === 0) return null
  return (
    <>
      {overlays.map((ov, i) => {
        if (hideTypes?.includes(ov.type)) return null
        return (
        <View
          key={i}
          style={[
            s.anchor,
            { left: `${Math.min(Math.max(ov.x * 100, 2), 78)}%`, top: `${Math.min(Math.max(ov.y * 100, 6), 84)}%` },
            { transform: [{ scale: ov.s ?? 1 }] },
          ]}
          pointerEvents="none"
        >
          <StickerContent
            type={ov.type} variant={ov.v}
            time={status?.training_time} gym={status?.gym_name} text={ov.text}
            act={ov.type === 'activity' && ov.sport && ov.m && ov.mu ? { sport: ov.sport, m: ov.m, mu: ov.mu, tm: ov.tm, ex: ov.ex, hr: ov.hr, kcal: ov.kcal } : null}
            sportLabel={ov.text ?? undefined}
            chipIndex={ov.chip}
            gifUrl={ov.gifUrl}
            stickerUrl={ov.stickerUrl}
            sliderEmoji={ov.sliderEmoji}
          />
        </View>
        )
      })}
    </>
  )
}

const s = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  anchor: { position: 'absolute', zIndex: 5, maxWidth: '76%' },
  glassPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(10,16,28,0.62)', borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  glassPillIcon: { fontSize: 15 },
  glassPillText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  vignetteOuter: { ...StyleSheet.absoluteFillObject, borderWidth: 70, borderColor: 'rgba(0,0,0,0.22)', borderRadius: 120 },
  vignetteInner: { ...StyleSheet.absoluteFillObject, borderWidth: 34, borderColor: 'rgba(0,0,0,0.22)', borderRadius: 80 },
  frame: { position: 'absolute', top: 14, left: 14, right: 14, bottom: 14, borderWidth: 3, borderRadius: 22, zIndex: 2 },
  // Passe-partout: gruby borderWidth dziala jak mat zakrywajacy brzegi zdjecia —
  // obraz konczy sie wewnatrz ramy, nic nie wystaje poza nia
  matte: { ...StyleSheet.absoluteFillObject, borderWidth: 18, zIndex: 2 },
  matteLine: { position: 'absolute', top: 18, left: 18, right: 18, bottom: 18, borderWidth: 1.5, zIndex: 2 },
  matteGoldOuter: { position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderWidth: 2.5, zIndex: 2 },
  // Cienka rama przy krawedzi ekranu + wewnetrzny wlosek oddzielajacy od zdjecia
  edgeBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 7, zIndex: 2 },
  edgeHairline: { position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, borderWidth: 1, zIndex: 2 },
  bigText: {
    fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  whitePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  whitePillIcon: { fontSize: 14 },
  whitePillText: { fontSize: 14, fontWeight: '900', color: '#16233a', letterSpacing: 0.6 },
  // Zadnej plyty/ramki dookola — wiersze stoja luzem na zdjeciu,
  // jedyna oprawa to biala obwodka samego kolka z ikona
  actCard: { gap: 14 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actRowIconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  actRowValue: {
    fontSize: 19, fontWeight: '800', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  actRowLabel: {
    fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.8, marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  gifSticker: {
    width: 150, height: 150, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  stickerImg: { width: 110, height: 110 },
  sliderWrap: { width: 180, alignItems: 'center' },
  sliderLabel: {
    fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 10, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  sliderTrack: {
    width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
  },
  sliderHandle: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(13,27,46,0.55)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
})
