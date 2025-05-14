const mongoose = require('mongoose');
require('dotenv').config();
const process = require("process");

mongoose
  .connect(process.env.DB_URL)
  .then(() => {
    console.log("MongoDB Connected");
  })
  .catch((error) => {
    console.log("Failed to connect to MongoDB:", error);
  });

process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    console.log("MongoDB disconnected");
    process.exit(0);
  } catch (error) {
    console.error("Error during MongoDB disconnect:", error);
    process.exit(1);
  }
});
