const express = require('express');
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { body, validationResult } = require('express-validator');

dotenv.config();

const passport = require("passport");
const passportJWT = require("passport-jwt");
const jwt = require("jsonwebtoken");
const userService = require("./user-service.js");

const HTTP_PORT = process.env.PORT || 8080;

const JWTStrategy = passportJWT.Strategy;
const ExtractJwt = passportJWT.ExtractJwt;

// Cloudinary configuration - only if credentials are provided
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  // Cloudinary storage for images
  const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'portfolio/images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1200, height: 800, crop: 'limit', quality: 'auto' }]
    }
  });

  // Cloudinary storage for videos
  const videoStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'portfolio/videos',
      resource_type: 'video',
      allowed_formats: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
      transformation: [{ width: 1280, height: 720, crop: 'limit', quality: 'auto' }]
    }
  });

  var uploadImage = multer({ storage: imageStorage });
  var uploadVideo = multer({ storage: videoStorage });
} else {
  console.warn('Cloudinary credentials not found. File uploads will be disabled.');
  // Fallback to memory storage if Cloudinary is not configured
  var uploadImage = multer({ storage: multer.memoryStorage() });
  var uploadVideo = multer({ storage: multer.memoryStorage() });
}

// JWT authentication config
passport.use(
  new JWTStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
      ignoreExpiration: false
    },
    async (jwt_payload, done) => {
      try {
        const user = await userService.getUserById(jwt_payload._id);
        if (user) return done(null, user);
        else return done(null, false);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      message: "Validation failed", 
      errors: errors.array() 
    });
  }
  next();
};

// Blog validation
const blogValidation = [
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('content').notEmpty().withMessage('Content is required'),
  body('published').optional().isBoolean().withMessage('Published must be boolean')
];

// Project validation
const projectValidation = [
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('description').optional().trim(),
  body('features').optional(),
  body('technologies').optional(),
  body('projectLink').optional().isURL().withMessage('Project link must be a valid URL')
];

// Middleware
app.use(express.json());
app.use(cors());
app.use(passport.initialize());

// ----------- ROUTES -----------

// User Management Routes
app.post("/api/user/login", async (req, res) => {
  try {
    const user = await userService.checkUser(req.body);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const payload = {
      _id: user._id,
      userName: user.userName
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        userName: user.userName
      }
    });
  } catch (msg) {
    console.error("Login error:", msg);
    res.status(401).json({ message: "Authentication failed" });
  }
});

app.post("/api/user/register", async (req, res) => {
  try {
    const newUser = await userService.registerUser(req.body);
    const payload = {
      _id: newUser._id,
      userName: newUser.userName
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ 
      message: "User created successfully", 
      token,
      user: {
        _id: newUser._id,
        userName: newUser.userName
      }
    });
  } catch (msg) {
    console.error("Registration error:", msg);
    res.status(422).json({ message: msg });
  }
});

// Contact Form Routes
app.post("/api/contact/submit", async (req, res) => {
  try {
    await userService.saveContact(req.body);
    res.status(201).json({ message: "Contact submitted successfully" });
  } catch (err) {
    console.error("Contact submission error:", err);
    res.status(500).json({ message: err });
  }
});

app.get("/api/contact/all", passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const data = await userService.getContacts();
    res.json(data);
  } catch (err) {
    console.error("Get contacts error:", err);
    res.status(500).json({ message: err });
  }
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// Blog Routes
app.post("/api/blogs", 
  passport.authenticate('jwt', { session: false }),
  uploadImage.single('featuredImage'),
  blogValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const blogData = {
        ...req.body,
        featuredImage: req.file ? req.file.path : null
      };
      
      // Parse published field as boolean
      if (blogData.published !== undefined) {
        blogData.published = blogData.published === 'true';
      }
      
      const newBlog = await userService.createBlog(blogData, req.user._id);
      res.status(201).json({ 
        message: "Blog created successfully", 
        blog: newBlog 
      });
    } catch (err) {
      console.error("Create blog error:", err);
      res.status(500).json({ message: err.message || err });
    }
  }
);

app.get("/api/blogs", async (req, res) => {
  try {
    const publishedOnly = req.query.published !== 'false';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const blogs = await userService.getBlogs(publishedOnly, page, limit);
    res.json(blogs);
  } catch (err) {
    console.error("Get blogs error:", err);
    res.status(500).json({ message: err.message || err });
  }
});

app.get("/api/blogs/:id", async (req, res) => {
  try {
    const blog = await userService.getBlogById(req.params.id);
    res.json(blog);
  } catch (err) {
    console.error("Get blog error:", err);
    res.status(404).json({ message: err.message || err });
  }
});

// Add other blog routes as needed...

// ----------- SERVER INIT -----------
userService.connect()
  .then(() => {
    app.listen(HTTP_PORT, () => {
      console.log("API listening on: " + HTTP_PORT);
    });
  })
  .catch((err) => {
    console.log("Unable to start the server: " + err);
    process.exit();
  });