const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  position: {
    type: String,
    required: true
  },
  resumeText: {
    type: String,
    required: true
  },
  isStart: {
    type: Boolean,
    default: false
  },
  riskScore: {
    type: Number,
    default: 0
  },
  violations: [{
    type: { type: String }, // e.g., 'face_missing', 'multiple_faces', 'object_detected', 'tab_switch', 'fullscreen_exit'
    timestamp: { type: Date, default: Date.now },
    riskIncrease: Number
  }],
  startTime: Date,
  endTime: Date,
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'terminated'],
    default: 'pending'
  },
  chatTranscript: [{
    role: String,
    message: String,
    timestamp: Date
  }]
}, { timestamps: true });

module.exports = mongoose.model('Interview', interviewSchema);
