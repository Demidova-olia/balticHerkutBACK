const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("../middlewares/cloudinary");
const streamifier = require("streamifier");
const path = require("path");
const mongoose = require("mongoose");

const uploadToCloudinary = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    if (!fileBuffer || !filename) {
      return reject(new Error("Invalid file input for Cloudinary upload"));
    }

    const filenameWithoutExt = path.basename(filename, path.extname(filename));

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: filenameWithoutExt,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload error:", error);
          return reject(error);
        }
        if (!result || !result.secure_url || !result.public_id) {
          return reject(new Error("Incomplete Cloudinary upload response"));
        }

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    try {
      streamifier.createReadStream(fileBuffer).pipe(stream);
    } catch (err) {
      console.error("❌ Error creating Cloudinary stream:", err);
      reject(err);
    }
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

    // Проверка прав доступа
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Permission denied. Only ADMIN can update products" });
    }

    const { name, price, category, subcategory, stock } = req.body;
    const updates = {};

    // 🔁 Удаление старых изображений и загрузка новых
    if (req.files && req.files.length > 0) {
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

      try {
        updates.images = await Promise.all(
          req.files.map(file =>
            uploadToCloudinary(file.buffer, file.originalname)
          )
        );
      } catch (err) {
        console.error("Cloudinary upload error:", err);
        return res.status(500).json({ message: "Image upload failed" });
      }
    }

    // ✅ Валидации
    if (price !== undefined) {
      if (price <= 0) {
        return res.status(400).json({ message: "Price must be greater than 0" });
      }
      updates.price = price;
    }

    if (stock !== undefined) updates.stock = stock;
    if (name !== undefined) updates.name = name;

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
        return res.status(400).json({
          message: "Subcategory does not exist or does not belong to this category",
        });
      }
      updates.subcategory = subcategory;
    }

    console.log("Updating product with data:", updates);

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).populate("category").populate("subcategory");

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error.message, error.stack);
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
