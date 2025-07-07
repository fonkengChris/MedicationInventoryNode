const express = require("express");
const router = express.Router();
const Group = require("../models/group");
const User = require("../models/User");
const ServiceUser = require("../models/service_user");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const superAdminAuth = require("../middleware/superAdminAuth");

// Get all groups
router.get("/", auth, async (req, res) => {
  try {
    const groups = await Group.find().populate("createdBy", "username email");
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create new group - admin only
router.post("/", [auth, adminAuth], async (req, res) => {
  try {
    const group = new Group({
      name: req.body.name,
      description: req.body.description,
      createdBy: req.userId,
    });

    const newGroup = await group.save();
    res.status(201).json(newGroup);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update group - admin only
router.put("/:id", [auth, adminAuth], async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (req.body.name) group.name = req.body.name;
    if (req.body.description) group.description = req.body.description;

    const updatedGroup = await group.save();
    res.json(updatedGroup);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add users to group - admin only
router.post("/:id/users", [auth, adminAuth], async (req, res) => {
  try {
    const { userIds } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    await User.updateMany(
      { _id: { $in: userIds } },
      { $addToSet: { groups: group._id } }
    );

    res.json({ message: "Users added to group successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add service users to group - admin only
router.post("/:id/service-users", [auth, adminAuth], async (req, res) => {
  try {
    const { serviceUserIds } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    await ServiceUser.updateMany(
      { _id: { $in: serviceUserIds } },
      { group: group._id }
    );

    res.json({ message: "Service users added to group successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get users in group
router.get("/:id/users", auth, async (req, res) => {
  try {
    const users = await User.find({ groups: req.params.id })
      .select("-password")
      .populate("groups");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get service users in group
router.get("/:id/service-users", auth, async (req, res) => {
  try {
    const serviceUsers = await ServiceUser.find({
      group: req.params.id,
    }).populate("group");
    res.json(serviceUsers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get one group by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate("createdBy", "username email")
      .lean();

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Get users in the group
    const users = await User.find({ groups: group._id })
      .select("username email role phoneNumber")
      .lean();

    // Get service users in the group
    const serviceUsers = await ServiceUser.find({ group: group._id })
      .select("name dateOfBirth nhsNumber address phoneNumber")
      .lean();

    // Add users and service users to the response
    const response = {
      ...group,
      users,
      serviceUsers,
      userCount: users.length,
      serviceUserCount: serviceUsers.length,
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete group - superAdmin only
router.delete("/:id", [auth, superAdminAuth], async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    await ServiceUser.updateMany(
      { group: group._id },
      { $unset: { group: "" } }
    );

    await User.updateMany(
      { groups: group._id },
      { $pull: { groups: group._id } }
    );

    await Group.deleteOne({ _id: req.params.id });
    res.json({ message: "Group deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Check if user is in group
router.get("/:id/check-user/:userId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate("groups", "name description")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isInGroup = user.groups.some(
      (group) => group._id.toString() === req.params.id
    );

    res.json({
      userId: req.params.userId,
      groupId: req.params.id,
      isInGroup,
      userGroups: user.groups,
      groupCount: user.groups.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Manually assign user to group (for testing) - admin only
router.post("/:id/assign-user/:userId", [auth, adminAuth], async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Add group to user's groups array if not already present
    if (!user.groups.includes(group._id)) {
      user.groups.push(group._id);
      await user.save();
    }

    // Return updated user with populated groups
    const updatedUser = await User.findById(req.params.userId)
      .select("-password")
      .populate("groups", "name description");

    res.json({
      message: "User assigned to group successfully",
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
