
export async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId

    if (!userId) {
      return res.status(401).json({
        message: 'Please log in to continue.',
      })
    }

    const user = await req.app.locals.db
      .collection('users')
      .findOne(
        { _id: (await import('mongodb')).ObjectId.createFromHexString(userId) },
        {
          projection: {
            email: 1,
            createdAt: 1,
            lastLoginAt: 1,
          },
        }
      )

    if (!user) {
      return res.status(401).json({
        message: 'Your session is invalid. Please log in again.',
      })
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }

    next()
  } catch {
    return res.status(401).json({
      message: 'Unable to verify your session. Please log in again.',
    })
  }
}
