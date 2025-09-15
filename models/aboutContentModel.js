const mongoose = require("mongoose");

const Localized = mongoose.Schema.Types.Mixed;

const AboutContentSchema = new mongoose.Schema(
  {
    heroImageUrl: { type: String, default: "" },
    storeImageUrl: { type: String, default: "" },
    requisitesImageUrl: { type: String, default: "" },

    title: { type: Localized, default: "" },
    subtitle: { type: Localized, default: "" },
    descriptionIntro: { type: Localized, default: "" },
    descriptionMore: { type: Localized, default: "" },
    address: { type: Localized, default: "" },
    hours: { type: Localized, default: "" },
    reasonsTitle: { type: Localized, default: "" },
    requisitesTitle: { type: Localized, default: "" },
    socialsHandle: { type: Localized, default: "" },

    gmapsUrl: { type: String, default: "" },

    reasons: { type: [Localized], default: [] },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("AboutContent", AboutContentSchema);
