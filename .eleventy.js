export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({
    "node_modules/glider-js/glider.min.js": "assets/js/vendor/glider.min.js",
    "node_modules/glider-js/glider.min.css": "assets/css/vendor/glider.min.css",
  });
  eleventyConfig.addPassthroughCopy("CNAME");

  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
