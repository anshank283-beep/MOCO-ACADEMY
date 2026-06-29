const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  chatType: {
    type: String,
    enum: ['group', 'private'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  }
});

// Index for faster queries
messageSchema.index({ chatType: 1, timestamp: -1 });
messageSchema.index({ sender: 1, recipient: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
