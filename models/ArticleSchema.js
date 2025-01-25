const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema for a blog post
const articleSchema = new Schema({
  author: {
    type: Schema.Types.ObjectId,  // Reference to the User model
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: Array,
    default: []
  },
  publishTime: {
    type: Date,
    default: Date.now
  },
  images: [{
    name: String,
    originalName: String,
    path: String,
    _id: false
  }],
  videos: [{
    name: String,
    originalName: String,
    path: String,
    _id: false
  }],
  likes: [],
  tags: [{
    type: String
  }],
  comments: [{
    user: {
      type: Schema.Types.ObjectId, // Reference to the User model
      ref: 'User'
    },
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  isPublic: {
    type: Boolean,
    default: false // Assuming posts are public by default
  },
  views: {
    type: Number,
    default: 0
  }
});

// Create a model from the schema
const article = mongoose.model('BlogPost', articleSchema);

module.exports = article;
