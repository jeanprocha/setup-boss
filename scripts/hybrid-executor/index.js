const { EXECUTION_MODE } = require("./execution-mode");

module.exports = {
  EXECUTION_MODE,
  ...require("./feature-flags"),
  ...require("./hybrid-shadow-runtime"),
};
