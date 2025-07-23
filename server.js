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

// Cloudinary configuration
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

const uploadImage = multer({ storage: imageStorage });
const uploadVideo = multer({ storage: videoStorage });

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
  body('features').optional().isArray().withMessage('Features must be an array'),
  body('technologies').optional().isArray().withMessage('Technologies must be an array'),
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
    res.status(422).json({ message: msg });
  }
});

// Contact Form Routes
app.post("/api/contact/submit", async (req, res) => {
  try {
    await userService.saveContact(req.body);
    res.status(201).json({ message: "Contact submitted successfully" });
  } catch (err) {
    res.status(500).json({ message: err });
  }
});

app.get("/api/contact/all", passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const data = await userService.getContacts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err });
  }
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
      const newBlog = await userService.createBlog(blogData, req.user._id);
      res.status(201).json({ 
        message: "Blog created successfully", 
        blog: newBlog 
      });
    } catch (err) {
      res.status(500).json({ message: err });
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
    res.status(500).json({ message: err });
  }
});

app.get("/api/blogs/:id", async (req, res) => {
  try {
    const blog = await userService.getBlogById(req.params.id);
    res.json(blog);
  } catch (err) {
    res.status(404).json({ message: err });
  }
});

app.put("/api/blogs/:id", 
  passport.authenticate('jwt', { session: false }),
  uploadImage.single('featuredImage'),
  blogValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const updateData = {
        ...req.body,
        ...(req.file && { featuredImage: req.file.path })
      };
      const updatedBlog = await userService.updateBlog(req.params.id, updateData, req.user._id);
      res.json({ 
        message: "Blog updated successfully", 
        blog: updatedBlog 
      });
    } catch (err) {
      res.status(500).json({ message: err });
    }
  }
);

app.delete("/api/blogs/:id", 
  passport.authenticate('jwt', { session: false }), 
  async (req, res) => {
    try {
      await userService.deleteBlog(req.params.id, req.user._id);
      res.json({ message: "Blog deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: err });
    }
  }
);

// Project Routes
app.post("/api/projects", 
  passport.authenticate('jwt', { session: false }),
  uploadVideo.single('projectVideo'),
  projectValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const projectData = {
        ...req.body,
        // Parse JSON strings back to arrays if they exist
        features: req.body.features ? JSON.parse(req.body.features) : [],
        technologies: req.body.technologies ? JSON.parse(req.body.technologies) : [],
        videoUrl: req.file ? req.file.path : null
      };
      const newProject = await userService.createProject(projectData, req.user._id);
      res.status(201).json({ 
        message: "Project created successfully", 
        project: newProject 
      });
    } catch (err) {
      res.status(500).json({ message: err });
    }
  }
);

app.get("/api/projects", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const projects = await userService.getProjects(page, limit);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  try {
    const project = await userService.getProjectById(req.params.id);
    res.json(project);
  } catch (err) {
    res.status(404).json({ message: err });
  }
});

app.put("/api/projects/:id", 
  passport.authenticate('jwt', { session: false }),
  uploadVideo.single('projectVideo'),
  projectValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const updateData = {
        ...req.body,
        // Parse JSON strings back to arrays if they exist
        features: req.body.features ? JSON.parse(req.body.features) : undefined,
        technologies: req.body.technologies ? JSON.parse(req.body.technologies) : undefined,
        ...(req.file && { videoUrl: req.file.path })
      };
      const updatedProject = await userService.updateProject(req.params.id, updateData, req.user._id);
      res.json({ 
        message: "Project updated successfully", 
        project: updatedProject 
      });
    } catch (err) {
      res.status(500).json({ message: err });
    }
  }
);

app.delete("/api/projects/:id", 
  passport.authenticate('jwt', { session: false }), 
  async (req, res) => {
    try {
      await userService.deleteProject(req.params.id, req.user._id);
      res.json({ message: "Project deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: err });
    }
  }
);

// File upload routes (separate endpoints for images/videos)
app.post("/api/upload/image", 
  passport.authenticate('jwt', { session: false }),
  uploadImage.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      res.json({ 
        message: "Image uploaded successfully",
        imageUrl: req.file.path,
        publicId: req.file.filename
      });
    } catch (err) {
      res.status(500).json({ message: "Image upload failed: " + err });
    }
  }
);

app.post("/api/upload/video", 
  passport.authenticate('jwt', { session: false }),
  uploadVideo.single('video'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }
      res.json({ 
        message: "Video uploaded successfully",
        videoUrl: req.file.path,
        publicId: req.file.filename
      });
    } catch (err) {
      res.status(500).json({ message: "Video upload failed: " + err });
    }
  }
);

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