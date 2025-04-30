require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/categoryModel');
const Subcategory = require('./models/subcategoryModel');
const Product = require('./models/productModel');

const MONGO_URI = process.env.DB_URL;

if (!MONGO_URI) {
  console.error('❌ DB_URL is not defined in .env file');
  process.exit(1);
}

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
  seedData();
}).catch((err) => console.error('MongoDB connection error:', err));

async function seedData() {
  try {
    await Category.deleteMany({});
    await Subcategory.deleteMany({});
    await Product.deleteMany({});

    // Categories
    const categories = await Category.insertMany([
      { name: 'Fruits', description: 'Fresh fruits' },
      { name: 'Vegetables', description: 'Organic vegetables' },
      { name: 'Dairy', description: 'Milk, cheese and more' },
    ]);

    // Subcategories
    const fruitsSubcategories = await Subcategory.insertMany([
      { name: 'Citrus', parent: categories[0]._id },
      { name: 'Berries', parent: categories[0]._id },
    ]);

    const vegetablesSubcategories = await Subcategory.insertMany([
      { name: 'Leafy Greens', parent: categories[1]._id },
      { name: 'Root Vegetables', parent: categories[1]._id },
    ]);

    const dairySubcategories = await Subcategory.insertMany([
      { name: 'Milk', parent: categories[2]._id },
      { name: 'Cheese', parent: categories[2]._id },
    ]);

    // Products
    await Product.insertMany([
      {
        name: 'Orange',
        description: 'Juicy and fresh oranges.',
        price: 1.5,
        category: categories[0]._id,
        subcategory: fruitsSubcategories[0]._id,
        stock: 100,
        images: ['https://via.placeholder.com/150']
      },
      {
        name: 'Strawberries',
        description: 'Sweet red strawberries.',
        price: 3.0,
        category: categories[0]._id,
        subcategory: fruitsSubcategories[1]._id,
        stock: 60,
        images: ['https://via.placeholder.com/150']
      },
      {
        name: 'Spinach',
        description: 'Fresh green spinach.',
        price: 2.0,
        category: categories[1]._id,
        subcategory: vegetablesSubcategories[0]._id,
        stock: 50,
        images: ['https://via.placeholder.com/150']
      },
      {
        name: 'Carrot',
        description: 'Crunchy orange carrots.',
        price: 1.0,
        category: categories[1]._id,
        subcategory: vegetablesSubcategories[1]._id,
        stock: 70,
        images: ['https://via.placeholder.com/150']
      },
      {
        name: 'Whole Milk',
        description: '1 liter of fresh whole milk.',
        price: 1.2,
        category: categories[2]._id,
        subcategory: dairySubcategories[0]._id,
        stock: 200,
        images: ['https://via.placeholder.com/150']
      },
      {
        name: 'Cheddar Cheese',
        description: 'Aged cheddar cheese block.',
        price: 4.5,
        category: categories[2]._id,
        subcategory: dairySubcategories[1]._id,
        stock: 40,
        images: ['https://via.placeholder.com/150']
      },
    ]);

    console.log('✅ Seed completed successfully');
    process.exit();
  } catch (error) {
    console.error('❌ Error while seeding data:', error);
    process.exit(1);
  }
}
