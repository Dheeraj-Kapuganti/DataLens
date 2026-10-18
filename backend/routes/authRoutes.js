import { Router } from "express";
import { requestOtp, verifyOtp } from "../services/otpService.js";
import { findOrCreateUser } from "../models/userModel.js";
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router();

router.post("/request-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        message: "Enter a valid email address.",
      });
    }

    const result = await requestOtp(req.app.locals.db, email);

    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ message: error.message });
    }

    console.error("OTP request failed:", error.message);

    return res.status(500).json({
      message: "Unable to send a login code right now. Please try again later.",
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        message: "Enter a valid email address and six-digit code.",
      });
    }

    const result = await verifyOtp(req.app.locals.db, email, otp);

    if (!result.valid) {
      return res.status(401).json({ message: result.message });
    }

    const user = await findOrCreateUser(req.app.locals.db, result.email);

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    req.session.userId = user._id.toString();

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    return res.status(200).json({
      message: "Login successful.",
      user: {
        id: user._id.toString(),
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    console.error("OTP verification failed:", error.message);

    return res.status(500).json({
      message: "Unable to verify the code right now. Please try again.",
    });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: 'Unable to log out right now.',
      })
    }

    res.clearCookie('datalens.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })

    return res.json({ message: 'Logged out successfully.' })
  })
})

export default router;
