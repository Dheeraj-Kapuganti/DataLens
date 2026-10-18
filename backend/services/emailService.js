
import nodemailer from 'nodemailer'

const email = process.env.SMTP_EMAIL
const appPassword = process.env.SMTP_APP_PASSWORD?.replace(/\s/g, '')

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: email,
    pass: appPassword,
  },
})

export async function sendTestEmail() {
  if (!email || !appPassword) {
    throw new Error('SMTP credentials are missing from .env')
  }

  await transporter.verify()

  return transporter.sendMail({
    from: `"DataLens" <${email}>`,
    to: email,
    subject: 'DataLens Email Setup Test',
    text: 'Success! DataLens can now send emails through Gmail SMTP.',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>DataLens Email Setup</h2>
        <p>Success! Your Gmail SMTP configuration is working.</p>
        <p>You can now proceed with email OTP authentication.</p>
      </div>
    `,
  })
}

export async function sendOtpEmail(recipient, otp) {
  if (!email || !appPassword) {
    throw new Error('SMTP credentials are missing from .env')
  }

  return transporter.sendMail({
    from: `"DataLens" <${email}>`,
    to: recipient,
    subject: 'Your DataLens Login Code',
    text: `Your DataLens login code is ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>DataLens Login</h2>
        <p>Use the following code to continue:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">
          ${otp}
        </div>
        <p>This code expires in 5 minutes. Do not share it with anyone.</p>
      </div>
    `,
  })
}
