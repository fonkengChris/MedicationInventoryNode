const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const superAdminAuth = require("../middleware/superAdminAuth");

// Add this helper function at the top of the file
async function getUserIdFromToken(req) {
  const token = req.header("x-auth-token");
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findOne({ email: decoded.email });
  return user._id;
}

// Register user
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, phoneNumber } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Format phone number if provided
    const formattedPhone = phoneNumber
      ? phoneNumber.replace(/[\s\-\(\)]/g, "")
      : null;

    // Create new user with empty groups array
    user = new User({
      username,
      email,
      password: hashedPassword,
      phoneNumber: formattedPhone, // Add optional phone number
      groups: [], // Explicitly set empty array for groups
      role: "user", // Ensure default role is set
    });

    await user.save();

    // Create JWT token
    const token = jwt.sign(
      {
        email: user.email,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users - admin and superAdmin only
router.get("/", [auth, adminAuth], async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("groups", "name description")
      .sort({ username: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user by ID - admin or self only
router.get("/:id", auth, async (req, res) => {
  try {
    // Get the requesting user's ID from the token
    const token = req.header("x-auth-token");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const requestingUser = await User.findOne({ email: decoded.email });

    // Check if user is admin or requesting their own data
    if (
      requestingUser.role === "user" &&
      requestingUser._id.toString() !== req.params.id
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("groups", "name description");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update user profile - accessible by the user themselves or admins
router.put("/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the requesting user is updating their own profile or is an admin
    const requestingUser = await User.findById(req.userId);
    if (
      req.userId !== req.params.id &&
      requestingUser.role !== "admin" &&
      requestingUser.role !== "superAdmin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this user" });
    }

    // Fields that can be updated
    const updateableFields = [
      "username",
      "email",
      "phoneNumber",
      "groups",
      "notificationPreferences",
    ];

    // Only admins can update roles
    if (
      requestingUser.role === "admin" ||
      requestingUser.role === "superAdmin"
    ) {
      updateableFields.push("role");
    }

    // Update allowed fields
    updateableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        // Special handling for phone number to ensure proper format
        if (field === "phoneNumber") {
          const formattedPhone = req.body[field]
            ? req.body[field].replace(/[\s\-\(\)]/g, "")
            : null;
          user[field] = formattedPhone;
        } else {
          user[field] = req.body[field];
        }
      }
    });

    // If password is being updated
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);
    }

    const updatedUser = await user.save();

    // Remove password from response
    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    res.json(userResponse);
  } catch (err) {
    // Handle duplicate key errors
    if (err.code === 11000) {
      return res.status(400).json({
        message: "Username or email already exists",
      });
    }
    res.status(400).json({ message: err.message });
  }
});

// Delete user - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent deletion of the last superAdmin
    if (user.role === "superAdmin") {
      const superAdminCount = await User.countDocuments({ role: "superAdmin" });
      if (superAdminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the last superAdmin user",
        });
      }
    }

    await User.deleteOne({ _id: req.params.id });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Change password - self only
router.post("/:id/change-password", auth, async (req, res) => {
  try {
    // Get the requesting user's ID from the token
    const token = req.header("x-auth-token");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const requestingUser = await User.findOne({ email: decoded.email });

    // Only allow users to change their own password
    if (requestingUser._id.toString() !== req.params.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isMatch = await bcrypt.compare(
      currentPassword,
      requestingUser.password
    );
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    requestingUser.password = await bcrypt.hash(newPassword, salt);
    await requestingUser.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Debug route to check user groups - remove in production
router.get("/debug/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("groups", "name description")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Also get the raw groups array to see what's stored
    const rawUser = await User.findById(req.params.id).lean();

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        groups: user.groups,
        rawGroups: rawUser.groups,
      },
      groupCount: user.groups ? user.groups.length : 0,
      rawGroupCount: rawUser.groups ? rawUser.groups.length : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
