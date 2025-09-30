module.exports = function (app) {
  app.use((req, res, next) => {
    const allowedOrigins = [
      "http://127.0.0.1:5173", 
      "http://localhost:5173",
      "https://med-tracker-pro.vercel.app"
    ];
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }

    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.header("Access-Control-Allow-Headers", "Content-Type, x-auth-token");
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      return res.status(204).send();
    }

    next();
  });
};
