const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("../middlewares/cloudinary");
const streamifier = require("streamifier");

const uploadToCloudinary = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: filename.split(".")[0],
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};



const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, subcategory, stock } = req.body;

    const existingCategory = await Category.findById(category);
    if (!existingCategory) {
      return res.status(400).json({ message: "Category does not exist" });
    }

    let subcategoryId = null;
    if (subcategory) {
      const existingSubcategory = await Subcategory.findOne({
        _id: subcategory,
        parent: category,
      });

      if (!existingSubcategory) {
        return res.status(400).json({ message: "Subcategory does not exist or does not belong to this category" });
      }

      subcategoryId = existingSubcategory._id;
    }

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
      );
    } else {
      imageUrls = ["http://localhost:3000/images/product.jpg"];
    }

    const product = new Product({
      name,
      description,
      price,
      category,
      subcategory: subcategoryId,
      stock,
      images: imageUrls,
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error.message, error.stack);
    res.status(500).json({ message: "Failed to create product" });
  }
};

const getProducts = async (req, res) => {
  try {
    const { search, category, subcategory, page = 1, limit = 10 } = req.query;

    const query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ name: regex }, { description: regex }];
    }
    if (category) {
      query.category = category;
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

    const skip = (page - 1) * limit;
    const totalProducts = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category")
      .populate("subcategory")
      .skip(skip)
      .limit(parseInt(limit));

    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({ products, totalPages, totalProducts });
  } catch (error) {
    console.error("Error in getProducts:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const getProductsByCategory = async (req, res) => {
  const { categoryId } = req.params;
  
  try {
    const products = await Product.find({ category: categoryId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProductsByCategoryAndSubcategory = async (req, res) => {
  const { categoryId, subcategoryId } = req.params;

  try {
    const products = await Product.find({
      category: categoryId,
      subcategory: subcategoryId
    }).exec();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .populate("category")
      .populate("subcategory");

    if (!product) {
      return res.status(404).send({ error: "Product not found" });
    }

    res.send(product);
  } catch (error) {
    res.status(500).send(error);
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Permission denied. Only ADMIN can update products" });
    }

    const { name, price, category, subcategory, stock } = req.body;
    const updates = {};

    if (req.files && req.files.length > 0) {
      // Удаляем старые изображения
      if (product.images && product.images.length > 0) {
        for (const image of product.images) {
          try {
            if (image.public_id) {
              await cloudinary.uploader.destroy(image.public_id);
            }
          } catch (error) {
            console.error(`Failed to delete image: ${image.public_id}`, error);
          }
        }
      }

      // Загружаем новые изображения
      updates.images = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
      );
    }

    if (price !== undefined && price <= 0) {
      return res.status(400).json({ message: "Price must be greater than 0" });
    }

    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = price;
    if (stock !== undefined) updates.stock = stock;

    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      const existingCategory = await Category.findById(category);
      if (!existingCategory) {
        return res.status(400).json({ message: "Category does not exist" });
      }
      updates.category = category;
    }

    if (subcategory) {
      if (!mongoose.Types.ObjectId.isValid(subcategory)) {
        return res.status(400).json({ message: "Invalid subcategory ID" });
      }
      const parentCategory = updates.category || product.category;
      const existingSubcategory = await Subcategory.findOne({
        _id: subcategory,
        parent: parentCategory,
      });
      if (!existingSubcategory) {
        return res.status(400).json({ message: "Subcategory does not exist or does not belong to this category" });
      }
      updates.subcategory = subcategory;
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
    }).populate("category").populate("subcategory");

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Failed to update product" });
  }
};


const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ message: 'Query parameter "q" is required' });
    }

    const regex = new RegExp(q, "i");

    const products = await Product.find({
      $or: [{ name: regex }, { description: regex }],
    })
      .limit(30)
      .populate("category")
      .populate("subcategory");

    res.status(200).json(products);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id)
      .populate("category")
      .populate("subcategory");

    if (!deletedProduct) {
      return res.status(404).send({ error: "Product not found" });
    }

    res.send({ message: "Product was removed", data: deletedProduct });
  } catch (error) {
    res.status(500).send(error);
  }
};

module.exports = {
  getProducts,
  getProductsByCategory,
  getProductsByCategoryAndSubcategory,
  getProductById,
  createProduct,
  updateProduct,
  searchProducts,
  deleteProduct,
};
