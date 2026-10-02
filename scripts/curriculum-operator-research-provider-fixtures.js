"use strict";

/** Sanitized OpenAI Responses + web_search shapes (no live URLs beyond example.edu). */

const LIVE_WEB_SEARCH_MESSAGE_SHAPE = {
  output: [
    { type: "web_search_call", id: "ws_test", status: "completed" },
    {
      type: "message",
      content: [{
        type: "output_text",
        text: "Preschool spring planting ideas with citations.",
        annotations: [
          {
            type: "url_citation",
            start_index: 0,
            end_index: 12,
            url_citation: {
              url: "https://www.example.edu/spring-planting-preschool",
              title: "Spring Planting for Preschool",
            },
          },
          {
            type: "url_citation",
            start_index: 12,
            end_index: 24,
            url_citation: {
              url: "https://www.example.edu/spring-planting-preschool",
              title: "Spring Planting for Preschool",
            },
          },
          {
            type: "url_citation",
            start_index: 24,
            end_index: 36,
            url_citation: {
              url: "https://extension.example.edu/garden-seeds",
              title: "Garden Seeds with Young Children",
            },
          },
        ],
      }],
    },
  ],
};

const NAEYC_CONTROL_MESSAGE_SHAPE = {
  output: [{
    content: [{
      annotations: [
        { url: "https://www.example.edu/naeyc-a", title: "NAEYC Garden A", text: "one" },
        { url: "https://www.example.edu/naeyc-b", title: "NAEYC Garden B", text: "two" },
        { url: "https://www.example.edu/naeyc-c", title: "NAEYC Garden C", text: "three" },
        { url: "https://www.example.edu/naeyc-d", title: "NAEYC Garden D", text: "four" },
      ],
    }],
  }],
};

module.exports = {
  LIVE_WEB_SEARCH_MESSAGE_SHAPE,
  NAEYC_CONTROL_MESSAGE_SHAPE,
};
