
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { sendOtpEmail } from './emailService.js'
import { createOtpIndexes } from '../models/otpModel.js'

const OTP_EXPIRY_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5

function hashOtp(email, otp) {
  const secret = process.env.OTP_SECRET

  if (!secret) {
    throw new Error('OTP_SECRET is missing from .env')
  }

  return createHmac('sha256', secret)
    .update(`${email}:${otp}`)
    .digest('hex')
}

function hashesMatch(expected, actual) {
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(actual, 'hex')

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  )
}

export async function requestOtp(db, emailAddress) {
  const email = emailAddress.trim().toLowerCase()
  const otps = await createOtpIndexes(db)
  const now = new Date()
  const existing = await otps.findOne({ email })

  if (
    existing?.lastSentAt &&
    now.getTime() - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    const error = new Error('Please wait 60 seconds before requesting another code.')
    error.status = 429
    throw error
  }

  const otp = String(randomInt(0, 1000000)).padStart(6, '0')

  await otps.updateOne(
    { email },
    {
      $set: {
        otpHash: hashOtp(email, otp),
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
        lastSentAt: now,
        attempts: 0,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  )

  try {
    await sendOtpEmail(email, otp)
  } catch (error) {
    await otps.deleteOne({ email })
    throw error
  }

  return {
    message: 'If the email can receive messages, a login code has been sent.',
  }
}

export async function verifyOtp(db, emailAddress, submittedOtp) {
  const email = emailAddress.trim().toLowerCase()
  const otps = await createOtpIndexes(db)
  const record = await otps.findOne({ email })

  if (!record) {
    return { valid: false, message: 'Invalid or expired code.' }
  }

  if (record.expiresAt <= new Date()) {
    await otps.deleteOne({ _id: record._id })
    return { valid: false, message: 'Invalid or expired code.' }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await otps.deleteOne({ _id: record._id })
    return { valid: false, message: 'Too many attempts. Request a new code.' }
  }

  const isValid =
    typeof submittedOtp === 'string' &&
    /^\d{6}$/.test(submittedOtp) &&
    hashesMatch(record.otpHash, hashOtp(email, submittedOtp))

  if (!isValid) {
    const attempts = record.attempts + 1

    await otps.updateOne(
      {
        _id: record._id,
        attempts: record.attempts,
      },
      {
        $set: { attempts },
      }
    )

    return {
      valid: false,
      message:
        attempts >= MAX_ATTEMPTS
          ? 'Too many attempts. Request a new code.'
          : 'Invalid or expired code.',
    }
  }

  await otps.deleteOne({ _id: record._id })

  return { valid: true, email }
}
