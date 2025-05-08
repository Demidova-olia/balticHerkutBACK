const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: "products",
      allowed_formats: ["jpg", "png", "jpeg"],
      transformation: [
        { width: 500, height: 500, crop: "limit" },
      ],
    },
  });