const User = require("../models/User");
const ServiceUser = require("../models/service_user");

const groupAuth = async (req, res, next) => {
  try {
    // Skip check for superAdmin and admin
    if (req.user.role === "superAdmin" || req.user.role === "admin") {
      return next();
    }

    const user = await User.findById(req.user.id).populate("groups");

    // If accessing a service user
    if (req.params.serviceUserId) {
      const serviceUser = await ServiceUser.findById(
        req.params.serviceUserId
      ).populate("group");

      if (!serviceUser) {
        return res.status(404).json({ message: "Service user not found" });
      }

      // Check if user has access to the service user's group
      const hasAccess = user.groups.some(
        (userGroup) =>
          userGroup._id.toString() === serviceUser.group?.toString()
      );

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied: No group access" });
      }
    }

    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = groupAuth;
