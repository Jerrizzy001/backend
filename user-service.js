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
    type: String, // Cloudinary URL
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
    type: Number, // in minutes
    default: 5
  }
});

// ----- PROJECT SCHEMA -----
let projectSchema = new Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  videoUrl: {
    type: String, // Cloudinary video URL
    default: null
  },
  projectLink: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Project link must be a valid URL'
    }
  },
  githubLink: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'GitHub link must be a valid URL'
    }
  },
  features: [{
    type: String
  }],
  technologies: [{
    type: String
  }],
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
  status: {
    type: String,
    enum: ['completed', 'in-progress', 'planned'],
    default: 'completed'
  }
});

// Add indexes for better performance
blogSchema.index({ date: -1, published: 1 });
projectSchema.index({ date: -1 });
contactSchema.index({ date: -1 });

let User;
let Contact;
let Blog;
let Project;

module.exports.connect = function () {
  return new Promise(function (resolve, reject) {
    let db = mongoose.createConnection(mongoDBConnectionString);

    db.on('error', err => reject(err));

    db.once('open', () => {
      User = db.model("users", userSchema);
      Contact = db.model("contacts", contactSchema);
      Blog = db.model("blogs", blogSchema);
      Project = db.model("projects", projectSchema);
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
        });
      }).catch(err => {
        reject("Unable to find user " + userData.userName);
      });
  });
};

module.exports.getUserById = function (id) {
  return new Promise((resolve, reject) => {
    User.findById(id)
      .select('-password') // Don't return password
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
                // Return user without password
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

module.exports.updateBlog = function (id, updateData, authorId) {
  return new Promise((resolve, reject) => {
    // Auto-generate excerpt if not provided and content is updated
    if (!updateData.excerpt && updateData.content) {
      updateData.excerpt = updateData.content.substring(0, 297) + '...';
    }
    
    // Recalculate read time if content is updated
    if (updateData.content) {
      const wordCount = updateData.content.split(' ').length;
      updateData.readTime = Math.ceil(wordCount / 200);
    }

    updateData.updatedAt = new Date();

    Blog.findOneAndUpdate(
      { _id: id, author: authorId }, // Ensure user can only update their own blogs
      updateData,
      { new: true, runValidators: true }
    )
    .populate('author', 'userName')
    .exec()
    .then(updatedBlog => {
      if (!updatedBlog) return reject("Blog not found or unauthorized");
      resolve(updatedBlog);
    })
    .catch(err => reject("Error updating blog: " + err));
  });
};

module.exports.deleteBlog = function (id, authorId) {
  return new Promise((resolve, reject) => {
    Blog.findOneAndDelete({ _id: id, author: authorId })
      .exec()
      .then(deletedBlog => {
        if (!deletedBlog) return reject("Blog not found or unauthorized");
        
        // Delete associated image from Cloudinary if it exists
        if (deletedBlog.featuredImage) {
          const publicId = deletedBlog.featuredImage.split('/').pop().split('.')[0];
          cloudinary.uploader.destroy(`portfolio/images/${publicId}`)
            .catch(err => console.log("Error deleting image from Cloudinary:", err));
        }
        
        resolve();
      })
      .catch(err => reject("Error deleting blog: " + err));
  });
};

// ----- PROJECT MANAGEMENT -----
module.exports.createProject = function (projectData, authorId) {
  return new Promise((resolve, reject) => {
    const newProject = new Project({
      ...projectData,
      author: authorId
    });
    
    newProject.save()
      .then(savedProject => {
        return Project.findById(savedProject._id).populate('author', 'userName');
      })
      .then(populatedProject => resolve(populatedProject))
      .catch(err => reject("Error creating project: " + err));
  });
};

module.exports.getProjects = function (page = 1, limit = 10) {
  return new Promise((resolve, reject) => {
    const skip = (page - 1) * limit;
    
    Promise.all([
      Project.find()
        .populate('author', 'userName')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Project.countDocuments()
    ])
    .then(([projects, total]) => {
      resolve({
        projects,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalProjects: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1
        }
      });
    })
    .catch(err => reject("Unable to retrieve projects: " + err));
  });
};

module.exports.getProjectById = function (id) {
  return new Promise((resolve, reject) => {
    Project.findById(id)
      .populate('author', 'userName')
      .exec()
      .then(project => {
        if (!project) return reject("Project not found");
        resolve(project);
      })
      .catch(err => reject("Unable to find project: " + err));
  });
};

module.exports.updateProject = function (id, updateData, authorId) {
  return new Promise((resolve, reject) => {
    updateData.updatedAt = new Date();

    Project.findOneAndUpdate(
      { _id: id, author: authorId }, // Ensure user can only update their own projects
      updateData,
      { new: true, runValidators: true }
    )
    .populate('author', 'userName')
    .exec()
    .then(updatedProject => {
      if (!updatedProject) return reject("Project not found or unauthorized");
      resolve(updatedProject);
    })
    .catch(err => reject("Error updating project: " + err));
  });
};

module.exports.deleteProject = function (id, authorId) {
  return new Promise((resolve, reject) => {
    Project.findOneAndDelete({ _id: id, author: authorId })
      .exec()
      .then(deletedProject => {
        if (!deletedProject) return reject("Project not found or unauthorized");
        
        // Delete associated video from Cloudinary if it exists
        if (deletedProject.videoUrl) {
          const publicId = deletedProject.videoUrl.split('/').pop().split('.')[0];
          cloudinary.uploader.destroy(`portfolio/videos/${publicId}`, { resource_type: 'video' })
            .catch(err => console.log("Error deleting video from Cloudinary:", err));
        }
        
        resolve();
      })
      .catch(err => reject("Error deleting project: " + err));
  });
};

// ----- UTILITY FUNCTIONS -----
module.exports.searchBlogs = function (searchTerm, publishedOnly = true) {
  return new Promise((resolve, reject) => {
    const query = {
      $and: [
        publishedOnly ? { published: true } : {},
        {
          $or: [
            { title: { $regex: searchTerm, $options: 'i' } },
            { content: { $regex: searchTerm, $options: 'i' } },
            { tags: { $in: [new RegExp(searchTerm, 'i')] } }
          ]
        }
      ]
    };

    Blog.find(query)
      .populate('author', 'userName')
      .sort({ date: -1 })
      .exec()
      .then(blogs => resolve(blogs))
      .catch(err => reject("Error searching blogs: " + err));
  });
};

module.exports.searchProjects = function (searchTerm) {
  return new Promise((resolve, reject) => {
    const query = {
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { technologies: { $in: [new RegExp(searchTerm, 'i')] } }
      ]
    };

    Project.find(query)
      .populate('author', 'userName')
      .sort({ date: -1 })
      .exec()
      .then(projects => resolve(projects))
      .catch(err => reject("Error searching projects: " + err));
  });
};