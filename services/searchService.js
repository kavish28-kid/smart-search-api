const axios = require("axios");
const mongoose = require("mongoose");
const Search = require("../models/Search");

const http = axios.create({
  timeout: 8000,
  headers: {
    "User-Agent": "smart-search-api/1.0",
  },
});

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const compactText = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const decodeHtmlEntities = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripHtml = (value) =>
  compactText(decodeHtmlEntities(value.replace(/<\/?[^>]+(>|$)/g, "")));

const normalizeUrl = (url) => compactText(url).replace(/\/$/, "");

const simplify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const getQueryIntent = (query) => {
  const lower = query.toLowerCase();

  if (/\b(joke|jokes|funny|roast|meme|laugh)\b/.test(lower)) {
    return "creative";
  }

  if (/\b(girl|boy|crush|love|relationship|date|dating|impress|fall in love)\b/.test(lower)) {
    return "advice";
  }

  if (/^(tell|write|make|create|give|suggest|explain|summarize|help)\b/.test(lower)) {
    return "assistant";
  }

  return "search";
};

const scoreResult = (query, result) => {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const title = result.title.toLowerCase();
  const description = result.description.toLowerCase();
  const simpleQuery = simplify(query);
  const simpleTitle = simplify(result.title);

  let score = result.source === "DuckDuckGo" ? 10 : 8;

  for (const word of queryWords) {
    if (title.includes(word)) score += 5;
    if (description.includes(word)) score += 2;
  }

  if (title === query.toLowerCase()) score += 10;
  if (simpleTitle === simpleQuery) score += 12;
  if (result.description.length > 80) score += 2;
  if (result.description.length > 200) score += 4;

  return score;
};

const rankAndDedupeResults = (query, results) => {
  const seen = new Set();

  return results
    .map((result) => ({
      ...result,
      url: normalizeUrl(result.url),
      score: scoreResult(query, result),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((result) => {
      const key = result.url || `${result.source}:${result.title}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return result.title && result.description;
    });
};

const buildRelatedQuestions = (query, results) => {
  const intent = getQueryIntent(query);

  if (intent === "creative") {
    return [
      "Tell me smarter jokes",
      "Make them short and clean",
      "Give me jokes for friends",
      "Explain why the joke is funny",
    ];
  }

  if (intent === "advice") {
    return [
      "How do I start a respectful conversation?",
      "How can I build confidence?",
      "What mistakes should I avoid?",
      "How do I know if someone is interested?",
    ];
  }

  if (intent === "assistant") {
    return [
      `Explain ${query} more simply`,
      `Give examples about ${query}`,
      `What should I know next about ${query}?`,
      `Make a step-by-step guide for ${query}`,
    ];
  }

  const topTitle = results[0]?.title || query;

  return [
    `What is ${topTitle}?`,
    `Why is ${topTitle} important?`,
    `How does ${topTitle} work?`,
    `What are the latest facts about ${query}?`,
  ];
};

const searchWikipedia = async (query) => {
  const { data } = await http.get("https://en.wikipedia.org/w/api.php", {
    params: {
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: 5,
      format: "json",
      origin: "*",
    },
  });

  return (data.query?.search || []).map((item) => ({
    source: "Wikipedia",
    title: item.title,
    description: stripHtml(item.snippet),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
      item.title.replace(/\s+/g, "_")
    )}`,
  }));
};

const searchDuckDuckGo = async (query) => {
  const { data } = await http.get("https://api.duckduckgo.com/", {
    params: {
      q: query,
      format: "json",
      no_html: 1,
      skip_disambig: 1,
    },
  });

  const results = [];

  if (data.AbstractText) {
    results.push({
      source: "DuckDuckGo",
      title: data.Heading || query,
      description: data.AbstractText,
      url: data.AbstractURL,
    });
  }

  for (const topic of data.RelatedTopics || []) {
    if (topic.Text && topic.FirstURL) {
      results.push({
        source: "DuckDuckGo",
        title: topic.Text.split(" - ")[0],
        description: topic.Text,
        url: topic.FirstURL,
      });
    }
  }

  return results.slice(0, 5);
};

const formatAttachmentContext = (attachments = []) =>
  attachments
    .slice(0, 6)
    .map((file, index) => {
      const parts = [
        `${index + 1}. ${file.name || "Untitled file"}`,
        `type: ${file.type || "unknown"}`,
        `size: ${file.size || 0} bytes`,
      ];

      if (file.text) {
        parts.push(`content excerpt: ${compactText(file.text).slice(0, 1800)}`);
      }

      if (file.inlineData?.mimeType) {
        parts.push(`full file included for AI reading: ${file.inlineData.mimeType}`);
      }

      return parts.join(" | ");
    })
    .join("\n");

const buildGeminiParts = (query, results, attachments) => {
  const intent = getQueryIntent(query);
  const context = results
    .slice(0, 6)
    .map((result, index) => `${index + 1}. ${result.title}: ${result.description}`)
    .join("\n");
  const attachmentContext = formatAttachmentContext(attachments);
  const inlineParts = attachments
    .filter((file) => file.inlineData?.data && file.inlineData?.mimeType)
    .slice(0, 4)
    .map((file) => ({
      inlineData: {
        mimeType: file.inlineData.mimeType,
        data: file.inlineData.data,
      },
    }));

  return [
    {
      text: `You are a premium AI search assistant. Understand the user's intent before answering.

Behavior:
- If the user asks for jokes, fun, ideas, writing, or casual help, answer directly and creatively.
- If the user asks for dating or love advice, be respectful and practical. Do not give manipulative tricks; help them build confidence, kindness, and honest conversation.
- If the user asks for facts, use web sources and attached files when useful.
- If attached files are present, use them first.
- Do not behave like a command parser. The answer should feel natural and helpful.

Return:
1. A direct answer that matches the request.
2. Useful points, examples, or steps when helpful.
3. If a PDF/image is attached, explain the important content from that file.
4. Mention when sources or files are weak, incomplete, or unreadable.

Query: ${query}
Detected intent: ${intent}

Attached files:
${attachmentContext || "None"}

Web sources:
${context || "None"}`,
    },
    ...inlineParts,
  ];
};

const generateGeminiAnswer = async (query, results, attachments = []) => {
  const intent = getQueryIntent(query);

  if (
    !process.env.GEMINI_API_KEY ||
    (intent === "search" && results.length === 0 && attachments.length === 0)
  ) {
    return null;
  }

  const { data } = await http.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      contents: [
        {
          parts: buildGeminiParts(query, results, attachments),
        },
      ],
      generationConfig: {
        temperature: intent === "creative" ? 0.75 : 0.25,
        maxOutputTokens: 1200,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    },
    {
      params: {
        key: process.env.GEMINI_API_KEY,
      },
    }
  );

  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
};

const saveSearch = async (query) => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  await Search.create({ query });
};

exports.getResults = async (query, attachments = []) => {
  const cleanQuery = compactText(query);

  const searchSettled = await Promise.allSettled([
    searchWikipedia(cleanQuery),
    searchDuckDuckGo(cleanQuery),
  ]);

  const rawResults = searchSettled.flatMap((item) =>
    item.status === "fulfilled" ? item.value : []
  );

  const results = rankAndDedupeResults(cleanQuery, rawResults);
  const aiAnswer = await generateGeminiAnswer(cleanQuery, results, attachments).catch(() => null);
  await saveSearch(cleanQuery).catch(() => null);

  return {
    query: cleanQuery,
    attachments: attachments.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      readable: Boolean(file.text),
      inline: Boolean(file.inlineData?.data),
    })),
    answer: {
      provider: aiAnswer ? "Gemini" : "none",
      model: aiAnswer ? GEMINI_MODEL : null,
      text: aiAnswer,
    },
    aiProvider: aiAnswer ? "Gemini" : null,
    totalResults: results.length,
    providers: ["Wikipedia", "DuckDuckGo"],
    relatedQuestions: buildRelatedQuestions(cleanQuery, results),
    results,
  };
};
