const axios = require("axios");

exports.getResults = async (query) => {
  try {
    const wikiRes = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${query}`
    );

    return {
      query: query,
      results: [
        {
          source: "Wikipedia",
          title: wikiRes.data.title,
          description: wikiRes.data.extract,
        },
      ],
    };
  } catch (error) {
    throw new Error("Failed to fetch data");
  }
};