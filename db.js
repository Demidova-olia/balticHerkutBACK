const mongoose = require('mongoose');
require('dotenv').config();

if (!process.env.DB_URL) {
  console.error('DB_URL is not defined in environment variables!');
  process.exit(1);
}

mongoose.connect(process.env.DB_URL)
.then(() => console.log('MongoDB Connected'))
.catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Error during MongoDB disconnect:', error);
    process.exit(1);
  }
});

process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err);
  process.exit(1);
});