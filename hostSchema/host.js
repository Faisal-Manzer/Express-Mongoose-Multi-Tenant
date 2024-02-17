const mongoose = require("mongoose");

const hostSchema = new mongoose.Schema({
  host: String,
  db: String,
});

module.exports = hostSchema;
