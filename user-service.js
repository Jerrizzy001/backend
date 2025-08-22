const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;

let mongoDBConnectionString = process.env.MONGO_URI;

let Schema = mongoose.Schema;

// ----- USER SCHEMA -----
let userSchema = new Schema({
  userName: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ----- CONTACT SCHEMA -----
let contactSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});

// ----- BLOG SCHEMA -----
let blogSchema = new Schema({
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  featuredImage: {
    type: String,
    default: null
  },
  date: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  published: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String
  }],
  excerpt: {
    type: String,
    maxlength: 300
  },
  readTime: {
    type: Number,
    default: 5
  }
});

// Add indexes for better performance
blogSchema.index({ date: -1, published: 1 });
contactSchema.index({ date: -1 });

let User;
let Contact;
let Blog;

module.exports.connect = function () {
  return new Promise(function (resolve, reject) {
    let db = mongoose.createConnection(mongoDBConnectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    db.on('error', err => {
      console.error('MongoDB connection error:', err);
      reject(err);
    });

    db.once('open', () => {
      console.log('Connected to MongoDB successfully');
      User = db.model("users", userSchema);
      Contact = db.model("contacts", contactSchema);
      Blog = db.model("blogs", blogSchema);
      resolve();
    });
  });
};

// ----- USER MANAGEMENT -----
module.exports.checkUser = function (userData) {
  return new Promise(function (resolve, reject) {
    User.findOne({ userName: userData.userName })
      .exec()
      .then(user => {
        if (!user) return reject("User not found");
        bcrypt.compare(userData.password, user.password).then(res => {
          if (res === true) {
            resolve(user);
          } else {
            reject("Incorrect password for user " + userData.userName);
          }
        }).catch(err => reject("Error comparing passwords"));
      }).catch(err => {
        reject("Unable to find user " + userData.userName);
      });
  });
};

module.exports.getUserById = function (id) {
  return new Promise((resolve, reject) => {
    User.findById(id)
      .select('-password')
      .exec()
      .then(user => {
        if (!user) return reject("User not found");
        resolve(user);
      })
      .catch(err => reject("Unable to find user"));
  });
};

module.exports.registerUser = function (userData) {
  return new Promise((resolve, reject) => {
    if (userData.password !== userData.password2) {
      reject("Passwords do not match");
      return;
    }

    User.findOne({ userName: userData.userName })
      .then(user => {
        if (user) return reject("Username already exists");
        
        bcrypt.genSalt(10, (err, salt) => {
          if (err) return reject(err);
          
          bcrypt.hash(userData.password, salt, (err, hash) => {
            if (err) return reject(err);
            
            const newUser = new User({
              userName: userData.userName,
              password: hash
            });

            newUser.save()
              .then(savedUser => {
                const userResponse = {
                  _id: savedUser._id,
                  userName: savedUser.userName,
                  createdAt: savedUser.createdAt
                };
                resolve(userResponse);
              })
              .catch(err => reject(err));
          });
        });
      })
      .catch(err => reject(err));
  });
};

// ----- CONTACT MANAGEMENT -----
module.exports.saveContact = function (contactData) {
  return new Promise((resolve, reject) => {
    const newContact = new Contact(contactData);
    newContact.save()
      .then(() => resolve())
      .catch(err => reject("Error saving contact: " + err));
  });
};

module.exports.getContacts = function () {
  return new Promise((resolve, reject) => {
    Contact.find()
      .sort({ date: -1 })
      .exec()
      .then(data => resolve(data))
      .catch(err => reject("Unable to retrieve contacts: " + err));
  });
};

// ----- BLOG MANAGEMENT -----
module.exports.createBlog = function (blogData, authorId) {
  return new Promise((resolve, reject) => {
    // Auto-generate excerpt if not provided
    if (!blogData.excerpt && blogData.content) {
      blogData.excerpt = blogData.content.substring(0, 297) + '...';
    }
    
    // Calculate read time (average 200 words per minute)
    if (blogData.content) {
      const wordCount = blogData.content.split(' ').length;
      blogData.readTime = Math.ceil(wordCount / 200);
    }

    const newBlog = new Blog({
      ...blogData,
      author: authorId
    });
    
    newBlog.save()
      .then(savedBlog => {
        return Blog.findById(savedBlog._id).populate('author', 'userName');
      })
      .then(populatedBlog => resolve(populatedBlog))
      .catch(err => reject("Error creating blog: " + err));
  });
};

module.exports.getBlogs = function (publishedOnly = true, page = 1, limit = 10) {
  return new Promise((resolve, reject) => {
    const query = publishedOnly ? { published: true } : {};
    const skip = (page - 1) * limit;
    
    Promise.all([
      Blog.find(query)
        .populate('author', 'userName')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Blog.countDocuments(query)
    ])
    .then(([blogs, total]) => {
      resolve({
        blogs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalBlogs: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1
        }
      });
    })
    .catch(err => reject("Unable to retrieve blogs: " + err));
  });
};

module.exports.getBlogById = function (id) {
  return new Promise((resolve, reject) => {
    Blog.findById(id)
      .populate('author', 'userName')
      .exec()
      .then(blog => {
        if (!blog) return reject("Blog not found");
        resolve(blog);
      })
      .catch(err => reject("Unable to find blog: " + err));
  });
};