import { tool } from "ai";
import TurndownService from "turndown";
import { z } from "zod";

export const scrapeWebPage = tool({
  description: "Scrapes a web page and converts HTML content to Markdown",
  parameters: z.object({
    url: z.string().url().describe("The URL to scrape content from"),
    turndownOptions: z
      .object({
        headingStyle: z.enum(["setext", "atx"]).optional(),
        hr: z.string().optional(),
        bulletListMarker: z.enum(["-", "*", "+"]).optional(),
        codeBlockStyle: z.enum(["indented", "fenced"]).optional(),
        emDelimiter: z.enum(["_", "*"]).optional(),
        strongDelimiter: z.enum(["__", "**"]).optional(),
        linkStyle: z.enum(["inlined", "referenced"]).optional(),
        linkReferenceStyle: z
          .enum(["full", "collapsed", "shortcut"])
          .optional(),
      })
      .optional()
      .describe("Custom options for Turndown HTML to Markdown conversion"),
  }),
  execute: async ({ url, turndownOptions }) => {
    console.log("Scraping web page:", url);
    try {
      // Fetch the page content
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }

      // Get the HTML content
      const html = await response.text();

      // Initialize Turndown with options
      const turndownService = new TurndownService(turndownOptions);

      // Convert HTML to Markdown and return
      return turndownService.turndown(html);
    } catch (error) {
      console.error("Error scraping web page:", error);
      throw error;
    }
  },
});
