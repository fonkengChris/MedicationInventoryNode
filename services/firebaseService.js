const admin = require("firebase-admin");

// Initialize Firebase Admin with environment variables or service account
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  // Use environment variable for production
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  // Use local file for development
  try {
    serviceAccount = require("../config/medication-inventory-bf350-firebase-adminsdk-fbsvc-9d84adec39.json");
  } catch (error) {
    console.warn("Firebase service account not found, Firebase features will be disabled");
    serviceAccount = null;
  }
}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

class FirebaseService {
  static async sendPushNotification(tokens, title, body, data = {}) {
    try {
      if (!serviceAccount) {
        console.warn("Firebase not initialized, skipping push notification");
        return { successCount: 0, failureCount: 0, responses: [] };
      }

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
