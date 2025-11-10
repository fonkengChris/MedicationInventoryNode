const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["superAdmin", "admin", "user"],
    default: "user",
  },
  groups: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  phoneNumber: {
    type: String,
    validate: {
      validator: function (v) {
        // Basic phone number validation
        return /^\+?[\d\s-]+$/.test(v);
      },
      message: (props) => `${props.value} is not a valid phone number!`,
    },
    default: null,
  },
  notificationPreferences: {
    sms: {
      enabled: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      appointments: { type: Boolean, default: true },
    },
    email: {
      enabled: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      appointments: { type: Boolean, default: true },
    },
  },
});

module.exports = mongoose.model("User", userSchema);
