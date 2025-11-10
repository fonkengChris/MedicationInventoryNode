const express = require("express");

module.exports = function createTestApp() {
  const app = express();
  require("./cors")(app);
  require("./routes")(app);
  return app;
};

