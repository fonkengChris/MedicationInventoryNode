const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const token = req.header("x-auth-token");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ email: decoded.email });

    if (user.role !== "superAdmin") {
      return res
        .status(403)
        .json({ message: "Access denied. Super Admin privileges required." });
    }
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};
