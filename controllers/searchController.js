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
  const context = req.body?.context && typeof req.body.context === "object" ? req.body.context : null;
  const mode = typeof req.body?.mode === "string" ? req.body.mode : "";

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const result = await searchService.getResults(query, attachments, { context, mode });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Something went wrong" });
  }
};
