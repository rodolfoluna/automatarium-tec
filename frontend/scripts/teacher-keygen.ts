/**
 * Genera las llaves de un grupo o semestre.
 *
 *   yarn workspace frontend keygen                 -> pide la contraseña del profesor
 *   yarn workspace frontend keygen --dev           -> llaves de desarrollo (contraseña "profesor-dev")
 *
 * Produce:
 *   - teacher-key.json          llave PRIVADA del profesor, cifrada con su contraseña. NO se sube al repo.
 *   - .env.production.local     secreto de la app y llave pública, que Parcel inyecta al compilar.
 */
import { writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { exportTeacherKeyFile, generateTeacherKeyPair, toB64 } from '@automatarium/secure-file'

const args = process.argv.slice(2)
const isDev = args.includes('--dev')
const outDir = resolve(args[args.indexOf('--out') + 1] && args.includes('--out') ? args[args.indexOf('--out') + 1] : '.')

const askPassword = async () => {
  if (process.env.ATEC_TEACHER_PASSWORD) return process.env.ATEC_TEACHER_PASSWORD
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const pass = await rl.question('Contraseña del profesor (mínimo 8 caracteres): ')
  const again = await rl.question('Repite la contraseña: ')
  rl.close()
  if (pass !== again) throw new Error('Las contraseñas no coinciden')
  return pass
}

const main = async () => {
  const password = isDev ? 'profesor-dev' : await askPassword()
  const keyFile = await exportTeacherKeyFile(await generateTeacherKeyPair(), password)
  const appSecret = toB64(crypto.getRandomValues(new Uint8Array(32)))

  if (isDev) {
    writeFileSync(resolve('src/tec/dev-keys.json'), JSON.stringify({ appSecret, teacherPublicKey: keyFile.publicKey }, null, 2) + '\n')
    writeFileSync(resolve('../dev-keys/teacher-key.dev.json'), JSON.stringify(keyFile, null, 2) + '\n')
    console.log('Llaves de desarrollo actualizadas (contraseña: profesor-dev)')
    return
  }

  const keyPath = resolve(outDir, 'teacher-key.json')
  const envPath = resolve(outDir, '.env.production.local')
  if (existsSync(keyPath) && !args.includes('--force')) {
    throw new Error(`${keyPath} ya existe. Usa --force para reemplazarlo (las entregas anteriores ya no se podrán abrir con la nueva llave).`)
  }
  writeFileSync(keyPath, JSON.stringify(keyFile, null, 2) + '\n')
  writeFileSync(envPath, [
    `ATEC_APP_SECRET=${appSecret}`,
    `ATEC_TEACHER_PUBLIC_KEY=${JSON.stringify(keyFile.publicKey)}`,
    ''
  ].join('\n'))
  console.log(`Llave privada del profesor: ${keyPath}  (guárdala en un lugar seguro, NO la compartas)`)
  console.log(`Configuración de compilación: ${envPath}`)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
