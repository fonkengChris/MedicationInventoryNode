const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const NotificationService = require("../services/notificationService");
const User = require("../models/User");

// Test SMS route - admin only
router.post("/sms", [auth, adminAuth], async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        message: "Phone number and message are required",
      });
    }

    await NotificationService.sendSMS(phoneNumber, message);
    res.json({ message: "Test SMS sent successfully" });
  } catch (error) {
    console.error("SMS test failed:", error);

    // Handle specific Twilio errors
    if (error.code === 21408) {
      return res.status(400).json({
        message:
          "SMS sending is not enabled for this region. Please contact support.",
      });
    }

    res.status(500).json({
      message: "Failed to send test SMS",
      error: error.message,
    });
  }
});

// Test low medication stock notification
router.post("/low-stock-notification", [auth, adminAuth], async (req, res) => {
  try {
    const mockMedication = {
      medicationName: "Test Medication",
      serviceUser: {
        name: "Test Patient",
      },
      quantityInStock: 10,
      dosage: {
        unit: "tablets",
      },
    };

    await NotificationService.notifyLowMedicationStock(mockMedication, 5);
    res.json({ message: "Low stock notification test sent successfully" });
  } catch (error) {
    console.error("Low stock notification test failed:", error);
    res.status(500).json({
      message: "Failed to send low stock notification",
      error: error.message,
    });
  }
});

// Test appointment reminder notification
router.post(
  "/appointment-notification",
  [auth, adminAuth],
  async (req, res) => {
    try {
      const mockAppointment = {
        serviceUser: {
          name: "Test Patient",
        },
        appointmentType: "Check-up",
        dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        location: "Test Clinic",
        provider: "Dr. Test",
      };

      await NotificationService.notifyUpcomingAppointment(mockAppointment);
      res.json({ message: "Appointment notification test sent successfully" });
    } catch (error) {
      console.error("Appointment notification test failed:", error);
      res.status(500).json({
        message: "Failed to send appointment notification",
        error: error.message,
      });
    }
  }
);

// Test rate limiting
router.post("/rate-limit", [auth, adminAuth], async (req, res) => {
  try {
    const userId = req.userId;
    const notificationType = "test";

    // Try to send two notifications in quick succession
    const firstAttempt = await NotificationService.checkRateLimit(
      userId,
      notificationType
    );
    const secondAttempt = await NotificationService.checkRateLimit(
      userId,
      notificationType
    );

    res.json({
      message: "Rate limit test completed",
      firstAttempt: firstAttempt ? "Allowed" : "Blocked",
      secondAttempt: secondAttempt ? "Allowed" : "Blocked",
    });
  } catch (error) {
    res.status(500).json({
      message: "Rate limit test failed",
      error: error.message,
    });
  }
});

// Test notification preferences
router.post(
  "/notification-preferences",
  [auth, adminAuth],
  async (req, res) => {
    try {
      const mockMedication = {
        medicationName: "Test Medication",
        serviceUser: {
          name: "Test Patient",
        },
        quantityInStock: 10,
        dosage: {
          unit: "tablets",
        },
        _id: "test123", // Mock ID for testing
      };

      // Get the current user
      const user = await User.findById(req.userId);

      // Log current preferences
      const currentPreferences = {
        sms: user.notificationPreferences.sms,
        email: user.notificationPreferences.email,
      };

      // Send test notification
      await NotificationService.notifyLowMedicationStock(mockMedication, 5);

      res.json({
        message: "Notification preferences test completed",
        userPreferences: currentPreferences,
        notificationSent: true,
      });
    } catch (error) {
      res.status(500).json({
        message: "Notification preferences test failed",
        error: error.message,
      });
    }
  }
);

// Toggle notification preferences (for testing)
router.post("/toggle-preferences", [auth, adminAuth], async (req, res) => {
  try {
    const { type, channel, enabled } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update the specified preference
    if (type && channel) {
      user.notificationPreferences[channel][type] = enabled;
      await user.save();
    }

    res.json({
      message: "Preferences updated successfully",
      currentPreferences: user.notificationPreferences,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update preferences",
      error: error.message,
    });
  }
});

module.exports = router;
