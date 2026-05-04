const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const mongoose = require("mongoose");

const searchRoutes = require("./routes/search");
const historyRoutes = require("./routes/history");

const app = express();

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
    })
    .then(() => console.log("MongoDB connected"))
    .catch((err) => {
      console.log(`MongoDB unavailable. History disabled: ${err.message}`);
    });
} else {
  console.log("MONGO_URI not set. Search works, but history will not be saved.");
}

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/three",
  express.static(path.join(__dirname, "node_modules", "three"))
);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/search", searchRoutes);
app.use("/history", historyRoutes);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "smart-search-api",
  });
});

app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "File is too large. Try a PDF or image under 12 MB.",
    });
  }

  if (err) {
    return res.status(400).json({
      error: "The upload could not be read. Try a smaller or different file.",
    });
  }

  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
