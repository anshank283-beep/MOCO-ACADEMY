const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  googleMeetLink: {
    type: String,
    default: ''
  },
  nextSessionDate: {
    type: Date,
    default: null
  },
  sessionTitle: {
    type: String,
    default: 'Sunday Live Session'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
