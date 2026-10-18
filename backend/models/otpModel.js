
export async function createOtpIndexes(db) {
  const otps = db.collection('otps')

  await otps.createIndex(
    { email: 1 },
    { unique: true }
  )

  await otps.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
  )

  return otps
}
