const express = require("express");
const searchController = require("../controllers/searchController");

const router = express.Router();

router.get("/", searchController.search);
router.post("/", searchController.searchWithAttachments);

module.exports = router;
