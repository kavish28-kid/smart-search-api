const express = require("express");
const cors = require("cors");
require("dotenv").config();

const searchRoutes = require("./routes/search");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/search", searchRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});