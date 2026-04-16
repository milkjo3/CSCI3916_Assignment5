const express = require("express");
const bodyParser = require("body-parser");
const passport = require("passport");
const authJwtController = require("./auth_jwt"); // You're not using authController, consider removing it
const jwt = require("jsonwebtoken");
const cors = require("cors");
const User = require("./Users");
const Movie = require("./Movies"); // You're not using Movie, consider removing it
const Review = require("./Reviews");
const { Query } = require("mongoose");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

const router = express.Router();

router.post("/signup", async (req, res) => {
  // Use async/await
  if (!req.body.username || !req.body.password) {
    return res.status(400).json({
      success: false,
      message: "Please include both username and password to signup.",
    }); // 400 Bad Request
  }

  try {
    const user = new User({
      // Create user directly with the data
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
    });

    await user.save(); // Use await with user.save()

    res
      .status(200)
      .json({ success: true, message: "Successfully created new user." }); // 200 Created
  } catch (err) {
    if (err.code === 11000) {
      // Strict equality check (===)
      return res.status(409).json({
        success: false,
        message: "A user with that username already exists.",
      }); // 409 Conflict
    } else {
      console.error(err); // Log the error for debugging
      return res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      }); // 500 Internal Server Error
    }
  }
});

router.post("/signin", async (req, res) => {
  // Use async/await
  try {
    const user = await User.findOne({ username: req.body.username }).select(
      "name username password",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed. User not found.",
      }); // 401 Unauthorized
    }

    const isMatch = await user.comparePassword(req.body.password); // Use await

    if (isMatch) {
      const userToken = { id: user._id, username: user.username }; // Use user._id (standard Mongoose)
      const token = jwt.sign(userToken, process.env.SECRET_KEY, {
        expiresIn: "1h",
      }); // Add expiry to the token (e.g., 1 hour)
      res.json({ success: true, token: "JWT " + token });
    } else {
      res.status(401).json({
        success: false,
        message: "Authentication failed. Incorrect password.",
      }); // 401 Unauthorized
    }
  } catch (err) {
    console.error(err); // Log the error
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    }); // 500 Internal Server Error
  }
});

router
  .route("/movies")
  // Return list of all movies.
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      // Requester wants reviews for each movie
      if (req.query.reviews === "true") {
        // Aggregate
        const result = await Movie.aggregate([
          {
            $lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "movieId",
              as: "movieReviews",
            },
          },
          {
            $addFields: {
              avgRating: { $avg: '$movieReviews.rating' }
            }
          },
          {
            $sort: { avgRating: -1 }
          }
        ]);
        
        return res.status(200).json(result);
      } else {
        // Find all movies
        const movies = await Movie.find();

        // Return a 204 if no movies are found
        if (movies.length === 0) {
          return res.status(204).json();
        }
        return res.status(200).json(movies);
      }
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  })

  // Add a movie to the database.
  .post(authJwtController.isAuthenticated, async (req, res) => {
    try {
      // Check if missing required fields
      if (!req.body.title) {
        return res.status(400).json({
          success: false,
          message: "Cannot POST movie, missing required field: title",
        }); // 400 Bad Request
      }

      // Check if the genre is valid and then create a movie
      const genres = Movie.schema.path("genre").enumValues;
      const movie = new Movie({
        title: req.body.title,
        releaseDate: req.body.releaseDate ? req.body.releaseDate : undefined,
        genre:
          genres.includes(req.body.genre) && typeof req.body.genre === "string"
            ? req.body.genre
            : undefined,
        actors: req.body.actors ? req.body.actors : undefined,
      });

      // Save the movie to the database
      await movie.save();
      res.status(200).json({
        success: true,
        message: "Successfully created new movie.",
        movie: movie,
      });
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  })

  // Route not supported
  .put(authJwtController.isAuthenticated, async (req, res) => {
    return res
      .status(500)
      .json({ success: false, message: "PUT request not supported." });
  })

  // Route not supported
  .delete(authJwtController.isAuthenticated, async (req, res) => {
    return res
      .status(500)
      .json({ success: false, message: "DELETE request not supported." });
  });

router
  .route("/movies/:movieId")
  // Return movie based on title.
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      if (req.query.reviews === "true") {
        // Aggregate
        const result = await Movie.aggregate([
          {
            $match: { _id: new mongoose.Types.ObjectId(req.params.movieId) },
          },
          {
            $lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "movieId",
              as: "movieReviews",
            },
          },
        ]);

        if (result.length === 0) {
          return res.status(204).json();
        }

        // Return the movie
        return res.status(200).json({
          success: true,
          message: "Successfully fetched movie.",
          movie: result,
        });
      } else {
        // Find one movie based on titled
        const movie = await Movie.findOne({ _id: req.params.movieId });

        // Return 204 if none found
        if (!movie) {
          return res.status(204).json();
        }

        // Return the movie
        return res.status(200).json({
          success: true,
          message: "Successfully fetched movie.",
          movie: movie,
        });
      }
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  })

  // Route not supported.
  .post(authJwtController.isAuthenticated, async (req, res) => {
    return res
      .status(500)
      .json({ success: false, message: "POST request not supported." });
  })

  // Update a movie based on the title.
  .put(authJwtController.isAuthenticated, async (req, res) => {
    try {
      // Find movie using title
      const movie = await Movie.findOne({ _id: req.params.movieId });

      // If no movie, return 404
      if (!movie) {
        return res.status(404).json({
          success: false,
          message: "PUT failed, resource cannot be found.",
          resource: `${req.params.movieId}`,
        });
      }

      // Update the movie
      const resource = await Movie.updateOne(
        { _id: req.params.movieId },
        { $set: req.body },
      );
      return res.status(200).json({
        success: true,
        message:
          resource.modifiedCount === 1
            ? "Resource updated successfully."
            : "No changes were needed, resource was already up to data.",
        resource: `${req.params.movieId}`,
      });
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  })

  // Delete a movie based on its title.
  .delete(authJwtController.isAuthenticated, async (req, res) => {
    try {
      // Find the movie by title
      const movie = await Movie.findOne({ _id: req.params.movieId });

      // Return 404 if not found
      if (!movie) {
        return res.status(404).json({
          success: false,
          message: "DELETE failed, resource cannot be found.",
          resource: `${req.params.movieId}`,
        });
      }

      // Delete the movie
      const resource = await Movie.deleteOne({ _id: req.params.movieId });
      if (resource.deletedCount === 1) {
        return res.status(200).json({
          success: true,
          message: "Resource deleted successfully.",
          resource: `${req.params.movieId}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Resource could not be deleted.",
          resource: `${req.params.movieId}`,
        });
      }
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  });

router
  .route("/reviews")
  // Return all reviews
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      // Get all reviews
      const reviews = await Review.find();

      // Return a 204 if no reviews are found
      if (reviews.length === 0) {
        return res.status(204).json();
      }
      return res.status(200).json(reviews);
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  })

  // Create a new review.
  .post(authJwtController.isAuthenticated, async (req, res) => {
    try {
      // Check if missing required fields
      if (!req.body.movieId) {
        return res.status(400).json({
          success: false,
          message: "Cannot POST review, missing required field: movieId",
        }); // 400 Bad Request
      }

      const movie = await Movie.findById(req.body.movieId);
      if (!movie) {
        return res.status(400).json({
          success: false,
          message: "No movie associated with movieId.",
        });
      }

      const review = new Review({
        movieId: req.body.movieId,
        username: req.user.username,
        review: req.body.review ? req.body.review : "",
        rating:
          req.body.rating <= 5 && req.body.rating >= 0
            ? req.body.rating
            : undefined,
      });

      // Save the movie to the database
      await review.save();
      res.status(200).json({ success: true, message: "Review created!" });
    } catch (err) {
      console.log(err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  })

  // Route not supported
  .put(authJwtController.isAuthenticated, async (req, res) => {
    return res
      .status(500)
      .json({ success: false, message: "PUT request not supported." });
  })

  // Route not supported
  .delete(authJwtController.isAuthenticated, async (req, res) => {
    return res
      .status(500)
      .json({ success: false, message: "DELETE request not supported." });
  });

app.use("/", router);

const PORT = process.env.PORT || 8080; // Define PORT before using it
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // for testing only
