/* eslint-disable import/no-commonjs */
module.exports = (api) => {
  const environment = api.env()
  const caller = api.caller((inst) => (inst && inst.name) || "any")

  const isBundler = caller === "rollup-plugin-babel"
  const isCli = caller === "@babel/node"
  const isTest = (/\b(test)\b/).exec(environment)
  const modules = (isTest && !isBundler) || isCli ? "commonjs" : false

  return {
    sourceMaps: true,
    plugins: [
      [
        "@babel/proposal-object-rest-spread",
        {
          useBuiltIns: true,
          loose: true
        }
      ],
      [
        "@babel/transform-runtime",
        {
          helpers: true
        }
      ]
    ].filter(Boolean),
    presets: [
      [
        "@babel/env",
        {
          useBuiltIns: "usage",
          targets: {
            node: 10
          },
          corejs: 3,
          loose: true,
          modules
        }
      ],
      [
        "@babel/typescript",
        {
          // We like JSX everywhere. No reason why we have to deal with
          // legacy type assertion supported in earlier versions.
          allExtensions: true,
          isTSX: true
        }
      ]
    ]
  }
}
