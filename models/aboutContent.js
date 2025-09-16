const mongoose = require("mongoose");
const { Schema } = mongoose;

const LocalizedSchema = new Schema(
  { en: String, ru: String, fi: String, _source: { type: String, default: "en" } },
  { _id: false, minimize: false }
);

const AboutContentSchema = new Schema(
  {
    heroImageUrl:       { type: String, default: "/assets/Logo.jpg" },
    storeImageUrl:      { type: String, default: "/assets/storefront.jpg" },
    requisitesImageUrl: { type: String, default: "/assets/banner_margins.jpg" },
    gmapsUrl:           { type: String, default: "https://maps.google.com/?q=Limingantie+9,+Oulu" },

    title:            { type: LocalizedSchema, default: () => ({}) },
    subtitle:         { type: LocalizedSchema, default: () => ({}) },
    descriptionIntro: { type: LocalizedSchema, default: () => ({}) },
    descriptionMore:  { type: LocalizedSchema, default: () => ({}) },
    address:          { type: LocalizedSchema, default: () => ({}) },
    hours:            { type: LocalizedSchema, default: () => ({}) },
    reasonsTitle:     { type: LocalizedSchema, default: () => ({}) },
    socialsHandle:    { type: LocalizedSchema, default: () => ({}) },
    requisitesTitle:  { type: LocalizedSchema, default: () => ({}) },

    reasons: { type: [LocalizedSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    collection: "aboutcontents", 
    timestamps: true,
    strict: true,
    minimize: false,
  }
);

module.exports =
  mongoose.models.AboutContent ||
  mongoose.model("AboutContent", AboutContentSchema);
