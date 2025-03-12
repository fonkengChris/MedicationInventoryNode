const admin = require("firebase-admin");

// Initialize Firebase Admin with your service account
const serviceAccount = require("../config/medication-inventory-bf350-firebase-adminsdk-fbsvc-9d84adec39.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

class FirebaseService {
  static async sendPushNotification(tokens, title, body, data = {}) {
    try {
      const message = {
        notification: {
          title,
          body,
        },
        data,
        tokens: Array.isArray(tokens) ? tokens : [tokens], // Ensure tokens is an array
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log("Successfully sent notifications:", response.successCount);

      if (response.failureCount > 0) {
        console.error(
          "Failed notifications:",
          response.responses.filter((r) => !r.success)
        );
      }

      return response;
    } catch (error) {
      console.error("Error sending push notification:", error);
      throw error;
    }
  }
}

module.exports = FirebaseService;
