const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    // Get token from x-auth-token header
    const token = req.header("x-auth-token");

    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user info to request
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userRole = decoded.role;

    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};
