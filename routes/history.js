const express = require("express");
const mongoose = require("mongoose");
const Search = require("../models/Search");

const router = express.Router();

router.get("/", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json([]);
  }

  try {
    const history = await Search.find().sort({ createdAt: -1 }).limit(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to load search history" });
  }
});

router.delete("/", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database is not connected" });
  }

  try {
    await Search.deleteMany({});
    res.json({ message: "Search history cleared" });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear search history" });
  }
});

module.exports = router;
