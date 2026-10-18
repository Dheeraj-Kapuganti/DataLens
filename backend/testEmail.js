
import 'dotenv/config'
import { sendTestEmail } from './services/emailService.js'

try {
  const result = await sendTestEmail()
  console.log('Test email sent successfully:', result.messageId)
} catch (error) {
  console.error('Email test failed:', error.message)
  process.exitCode = 1
}
