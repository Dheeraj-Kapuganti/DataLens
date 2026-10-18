
export async function findOrCreateUser(db, emailAddress) {
  const email = emailAddress.trim().toLowerCase()
  const users = db.collection('users')

  await users.createIndex(
    { email: 1 },
    { unique: true }
  )

  const now = new Date()

  await users.updateOne(
    { email },
    {
      $setOnInsert: {
        email,
        createdAt: now,
      },
      $set: {
        lastLoginAt: now,
      },
    },
    { upsert: true }
  )

  return users.findOne(
    { email },
    {
      projection: {
        email: 1,
        createdAt: 1,
        lastLoginAt: 1,
      },
    }
  )
}
