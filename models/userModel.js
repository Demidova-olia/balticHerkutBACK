// models/userModel.js
const mongoose = require("mongoose");
const ROLES = require("../config/roles");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      validate: {
        validator(value) {
          return /^[\p{L}\p{N}_-]{3,}$/u.test(value);
        },
        message: (props) => `${props.value} is not a valid username`,
      },
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator(value) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },
        message: (props) => `${props.value} is not a valid email`,
      },
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    profilePicture: {
      type: String,

      default: "/images/no-image.svg",
    },

    address: {
      street: { type: String },
      city: { type: String },
      postalCode: { type: String },
      country: { type: String },
    },

    phoneNumber: {
      type: String,
      unique: true, 
      sparse: true,  
      validate: {
        validator(value) {
          if (!value) return true;
          return /^\+?[0-9]{7,15}$/.test(value);
        },
        message: (props) => `${props.value} is not a valid phone number`,
      },
    },

    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);


module.exports = mongoose.model("User", userSchema);
