const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

let mongoDBConnectionString = process.env.MONGO_URI;

let Schema = mongoose.Schema;

// ----- USER SCHEMA -----
let userSchema = new Schema({
  userName: {
    type: String,
    unique: true
  },
  password: String
});

let contactSchema = new Schema({
  name: String,
  email: String,
  reason: String,
  date: {
    type: Date,
    default: Date.now
  }
});

let User;
let Contact;

module.exports.connect = function () {
  return new Promise(function (resolve, reject) {
    let db = mongoose.createConnection(mongoDBConnectionString);

    db.on('error', err => reject(err));

    db.once('open', () => {
      User = db.model("users", userSchema);
      Contact = db.model("contacts", contactSchema);
      resolve();
    });
  });
};

// ----- CHECK ADMIN LOGIN -----
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

// ----- SAVE CONTACT FORM -----
module.exports.saveContact = function (contactData) {
  return new Promise((resolve, reject) => {
    const newContact = new Contact(contactData);
    newContact.save()
      .then(() => resolve())
      .catch(err => reject("Error saving contact: " + err));
  });
};

// ----- GET ALL CONTACT SUBMISSIONS -----
module.exports.getContacts = function () {
  return new Promise((resolve, reject) => {
    Contact.find()
      .sort({ date: -1 }) // newest first
      .exec()
      .then(data => resolve(data))
      .catch(err => reject("Unable to retrieve contacts: " + err));
  });
};

// ----- GET USER BY ID (used in JWT) -----
module.exports.getUserById = function (id) {
  return new Promise((resolve, reject) => {
    User.findById(id)
      .exec()
      .then(user => {
        if (!user) return reject("User not found");
        resolve(user);
      })
      .catch(err => reject("Unable to find user"));
  });
};


// ----- REGISTER NEW USER -----
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
          bcrypt.hash(userData.password, salt, (err, hash) => {
            if (err) reject(err);
            
            new User({
              userName: userData.userName,
              password: hash
            }).save()
              .then(() => resolve())
              .catch(err => reject(err));
          });
        });
      })
      .catch(err => reject(err));
  });
};
