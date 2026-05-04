const searchService = require("../services/searchService");

exports.search = async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const result = await searchService.getResults(query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Something went wrong" });
  }
};

exports.searchWithAttachments = async (req, res) => {
  const query = req.body?.q;
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const result = await searchService.getResults(query, attachments);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Something went wrong" });
  }
};
