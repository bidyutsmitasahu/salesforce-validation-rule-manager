const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema({
  orgId: {
    type: String,
    required: true,
    unique: true
  },
  orgName: {
    type: String,
    required: true
  },
  instanceUrl: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String
  },
  loginUrl: {
    type: String,
    default: "https://login.salesforce.com"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Organization", organizationSchema);