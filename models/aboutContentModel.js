const mongoose = require('mongoose');

const AboutContentSchema = new mongoose.Schema({
  heroImageUrl: String,
  heading: { type: String, default: 'About Us' },
  subheading: { type: String, default: '' },

  store: {
    title: { type: String, default: 'Our Store' },
    description: { type: String, default: '' },
    address: { type: String, default: '' },
    hours:   { type: String, default: '' },
    mapUrl:  { type: String, default: '' },
    imageUrl: String,
  },

  reasonsTitle: { type: String, default: 'Why Baltic Herkut?' },
  reasons: { type: [String], default: [] },

  requisitesTitle: { type: String, default: 'Requisites' },
  requisitesImageUrl: String,

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('AboutContent', AboutContentSchema);
