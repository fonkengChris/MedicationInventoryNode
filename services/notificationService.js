const User = require("../models/User");
const nodemailer = require("nodemailer");
const FirebaseService = require("./firebaseService");
const twilio = require("twilio");
require("dotenv").config();

// Configure nodemailer (you'll need to add these env variables)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const rateLimit = new Map(); // Store last notification times

class NotificationService {
  // Add SMS templates
  static templates = {
    lowStock: (medication, days) =>
      `ALERT: Low stock of ${medication.medicationName}. ${days} days remaining. Current stock: ${medication.quantityInStock} ${medication.dosage.unit}`,

    appointment: (appointment) =>
      `REMINDER: Appointment tomorrow for ${
        appointment.serviceUser.name
      }\nType: ${appointment.appointmentType}\nTime: ${new Date(
        appointment.dateTime
      ).toLocaleString()}\nLocation: ${appointment.location}\nProvider: ${
        appointment.provider
      }`,
  };

  static async checkRateLimit(
    userId,
    type,
    identifier = "",
    minInterval = 3600000
  ) {
    const key = `${userId}-${type}-${identifier}`;
    const lastNotification = rateLimit.get(key);
    const now = Date.now();

    if (lastNotification && now - lastNotification < minInterval) {
      return false;
    }

    rateLimit.set(key, now);
    return true;
  }

  static async notifyLowMedicationStock(medication, daysRemaining) {
    try {
      // Ensure medication.serviceUser is populated with group information
      if (!medication.serviceUser.group) {
        await medication.populate(
          "serviceUser",
          "name group dateOfBirth nhsNumber"
        );
      }

      // Get all admins and users who have the service user's group in their groups array
      const users = await User.find({
        $or: [
          { role: { $in: ["admin", "superAdmin"] } },
          {
            role: "user",
            groups: { $in: [medication.serviceUser.group] }, // Check if service user's group is in user's groups array
            "notificationPreferences.sms.lowStock": true,
          },
        ],
      });

      const subject = `Low Medication Stock Alert: ${medication.medicationName}`;
      const emailMessage = `
        Low stock alert for ${medication.medicationName}
        Service User: ${medication.serviceUser.name}
        Current stock will last for ${daysRemaining} days
        Current quantity: ${medication.quantityInStock} ${medication.dosage.unit}
      `;
      const smsMessage = this.templates.lowStock(medication, daysRemaining);

      // Send notifications to all relevant users
      for (const user of users) {
        // Check rate limit for this user with medication ID
        if (
          await this.checkRateLimit(
            user._id,
            "lowStock",
            medication._id.toString()
          )
        ) {
          // Send email if enabled
          if (user.notificationPreferences.email.lowStock) {
            await this.sendEmail(user.email, subject, emailMessage);
          }

          // Send SMS if enabled and phone number exists
          if (user.notificationPreferences.sms.lowStock && user.phoneNumber) {
            await this.sendSMS(user.phoneNumber, smsMessage);
          }
        }
      }

      // Send push notifications to users who have FCM tokens
      const tokens = users
        .filter((user) => user.fcmToken)
        .map((user) => user.fcmToken);

      if (tokens.length > 0) {
        await FirebaseService.sendPushNotification(
          tokens,
          "Low Medication Stock Alert",
          smsMessage,
          {
            type: "LOW_STOCK",
            medicationId: medication._id.toString(),
            daysRemaining: daysRemaining.toString(),
          }
        );
      }
    } catch (error) {
      console.error("Failed to send low stock notification:", error);
      throw error;
    }
  }

  static async notifyUpcomingAppointment(appointment) {
    try {
      // Ensure appointment.serviceUser is populated with group information
      if (!appointment.serviceUser.group) {
        await appointment.populate(
          "serviceUser",
          "name group dateOfBirth nhsNumber"
        );
      }

      // Get all admins and users who have the service user's group in their groups array
      const users = await User.find({
        $or: [
          { role: { $in: ["admin", "superAdmin"] } },
          {
            role: "user",
            groups: { $in: [appointment.serviceUser.group] }, // Check if service user's group is in user's groups array
            "notificationPreferences.sms.appointments": true,
          },
        ],
      });

      const subject = `Appointment Reminder for ${appointment.serviceUser.name}`;
      const emailMessage = `
        Reminder: Appointment tomorrow
        Service User: ${appointment.serviceUser.name}
        Type: ${appointment.appointmentType}
        Time: ${new Date(appointment.dateTime).toLocaleString()}
        Location: ${appointment.location}
        Provider: ${appointment.provider}
      `;
      const smsMessage = this.templates.appointment(appointment);

      // Send notifications to all relevant users
      for (const user of users) {
        // Check rate limit for this user
        if (await this.checkRateLimit(user._id, "appointment")) {
          // Send email if enabled
          if (user.notificationPreferences.email.appointments) {
            await this.sendEmail(user.email, subject, emailMessage);
          }

          // Send SMS if enabled and phone number exists
          if (
            user.notificationPreferences.sms.appointments &&
            user.phoneNumber
          ) {
            await this.sendSMS(user.phoneNumber, smsMessage);
          }
        }
      }

      // Send push notifications to users who have FCM tokens
      const tokens = users
        .filter((user) => user.fcmToken)
        .map((user) => user.fcmToken);

      if (tokens.length > 0) {
        await FirebaseService.sendPushNotification(
          tokens,
          "Upcoming Appointment",
          smsMessage,
          {
            type: "APPOINTMENT_REMINDER",
            appointmentId: appointment._id.toString(),
            dateTime: appointment.dateTime.toISOString(),
          }
        );
      }
    } catch (error) {
      console.error("Failed to send appointment notification:", error);
      throw error;
    }
  }

  static async notifyMedicationAnomaly(medicationSummary, anomaly) {
    try {
      const subject = `Medication Anomaly Alert: ${medicationSummary.medication.name}`;
      const emailMessage = `
        Anomaly detected for ${medicationSummary.medication.name}
        Service User: ${medicationSummary.serviceUser.name}
        Type: ${anomaly.type}
        Message: ${anomaly.message}
        Week: ${new Date(anomaly.week).toLocaleDateString()}
      `;

      // Get all admins and users who have the service user's group in their groups array
      const users = await User.find({
        $or: [
          { role: { $in: ["admin", "superAdmin"] } },
          {
            role: "user",
            groups: { $in: [medicationSummary.serviceUser.group] },
            "notificationPreferences.sms.anomalies": true,
          },
        ],
      });

      // Send notifications to all relevant users
      for (const user of users) {
        // Check rate limit for this user with medication ID
        if (
          await this.checkRateLimit(
            user._id,
            "anomaly",
            medicationSummary.medication._id.toString()
          )
        ) {
          // Send email if enabled
          if (user.notificationPreferences.email.anomalies) {
            await this.sendEmail(user.email, subject, emailMessage);
          }

          // Send SMS if enabled and phone number exists
          if (user.notificationPreferences.sms.anomalies && user.phoneNumber) {
            await this.sendSMS(user.phoneNumber, anomaly.message);
          }
        }
      }

      // Send push notifications to users who have FCM tokens
      const tokens = users
        .filter((user) => user.fcmToken)
        .map((user) => user.fcmToken);

      if (tokens.length > 0) {
        await FirebaseService.sendPushNotification(
          tokens,
          "Medication Anomaly Alert",
          anomaly.message,
          {
            type: "MEDICATION_ANOMALY",
            medicationId: medicationSummary.medication._id.toString(),
            anomalyType: anomaly.type,
          }
        );
      }
    } catch (error) {
      console.error("Failed to send anomaly notification:", error);
      throw error;
    }
  }

  static async sendEmail(to, subject, message) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text: message,
      });
    } catch (error) {
      console.error("Email sending failed:", error);
    }
  }

  // Add new SMS method
  static async sendSMS(to, message) {
    try {
      if (!validatePhoneNumber(to)) {
        throw new Error(
          "Invalid phone number format. Must be in international format (e.g., +44XXXXXXXXXX)"
        );
      }

      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to,
      });
    } catch (error) {
      console.error("SMS sending failed:", error);
      throw error;
    }
  }
}

function validatePhoneNumber(phoneNumber) {
  // Basic validation for international format
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
}

module.exports = NotificationService;
