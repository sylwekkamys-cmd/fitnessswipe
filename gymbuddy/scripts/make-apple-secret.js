// Generuje client secret (JWT) dla Sign in with Apple - do wklejenia w Supabase.
// Uzycie:
//   node scripts/make-apple-secret.js TEAM_ID KEY_ID "C:\sciezka\do\AuthKey_XXX.p8"
// Sekret jest wazny ~6 miesiecy - po tym czasie wygeneruj nowy i podmien w Supabase.

const crypto = require('crypto')
const fs = require('fs')

const [teamId, keyId, p8Path] = process.argv.slice(2)
const CLIENT_ID = 'com.fitnessswipe.app.signin'

if (!teamId || !keyId || !p8Path) {
  console.log('Uzycie: node scripts/make-apple-secret.js TEAM_ID KEY_ID "C:\\sciezka\\AuthKey_XXX.p8"')
  process.exit(1)
}
if (!fs.existsSync(p8Path)) {
  console.log('Nie znaleziono pliku: ' + p8Path)
  process.exit(1)
}

const pk = fs.readFileSync(p8Path, 'utf8')
const now = Math.floor(Date.now() / 1000)
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')

const header = b64({ alg: 'ES256', kid: keyId })
const payload = b64({
  iss: teamId,
  iat: now,
  exp: now + 15550000, // ~180 dni (maks. dozwolone przez Apple)
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
})
const signature = crypto
  .sign('sha256', Buffer.from(header + '.' + payload), { key: pk, dsaEncoding: 'ieee-p1363' })
  .toString('base64url')

console.log('\n=== APPLE CLIENT SECRET (wklej w Supabase -> Providers -> Apple -> Secret Key) ===\n')
console.log(header + '.' + payload + '.' + signature)
console.log('\nWazny do: ' + new Date((now + 15550000) * 1000).toLocaleDateString())
