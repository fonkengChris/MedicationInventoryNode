const jwt = require("jsonwebtoken");

function signToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      username: user.username,
    },
    process.env.JWT_SECRET
  );
}

module.exports = { signToken };

