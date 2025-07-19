const express = require('express');
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const passport = require("passport");
const passportJWT = require("passport-jwt");
const jwt = require("jsonwebtoken");
const userService = require("./user-service.js");

const HTTP_PORT = process.env.PORT || 8080;

const JWTStrategy = passportJWT.Strategy;

// JWT authentication config
passport.use(
  new JWTStrategy(
    {
      jwtFromRequest: (req) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("JWT ")) {
          return authHeader.split(" ")[1];
        }
        return null;
      },
      secretOrKey: process.env.JWT_SECRET
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

// Middleware
app.use(express.json());
app.use(cors());
app.use(passport.initialize());


// ----------- ROUTES -----------

// User Management Routes
app.post("/api/user/login", async (req, res) => {
  try {
    const user = await userService.checkUser(req.body);
    const payload = {
      _id: user._id,
      userName: user.userName
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ message: "Login successful", token });
  } catch (msg) {
    res.status(422).json({ message: msg });
  }
});

app.post("/api/user/register", async (req, res) => {
  try {
    await userService.registerUser(req.body);
    res.status(201).json({ message: "User created successfully" });
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