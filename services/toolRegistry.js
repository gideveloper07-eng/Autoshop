const { executeTool } = require("../tools/genericTool");
const toolConfig = require("../config/toolConfig");
const { getDashboardSummary } = require("../tools/dashboardSummaryTool");

const tools = {};

// Register generic tools
Object.entries(toolConfig).forEach(([toolName, config]) => {
  tools[toolName] = {
    description: config.description,

    function: (context, params = {}) =>
      executeTool(toolName, context, params),

    declaration: {
      name: toolName,
      description: config.description,
      parametersJsonSchema: {

    type: "object",

    properties: {}

},
    },
  };
});

// Register composite tool
tools.getDashboardSummary = {
  description: "Returns today's dealership business summary.",

  function: (context) => getDashboardSummary(context),

  declaration: {
    name: "getDashboardSummary",
    description: "Returns today's dealership business summary.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
    },
  },
};

// Build registries
const toolFunctions = {};
const functionDeclarations = [];

Object.values(tools).forEach((tool) => {
  toolFunctions[tool.declaration.name] = tool.function;
  functionDeclarations.push(tool.declaration);
});

module.exports = {
  tools,
  toolFunctions,
  functionDeclarations,
};