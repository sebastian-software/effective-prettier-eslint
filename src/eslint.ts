import path from "path"

import { CLIEngine } from "eslint"
import chalk from "chalk"

import { debug } from "./log"
import { APP_ROOT_PATH, ESLINT_ROOT_PATH } from "./util"
import { FormatOptions } from "./types"

// ESLint loads its plugins from the given or current CWD.
// Unfortunately in some situations the CWD e.g. when running inside
// Visual Studio Code is '/'. On this folder it does not find any plugins
// as all. This uses the location of Eslint which should be stable
// in one project to load all of its dependencies.
// Via: https://stackoverflow.com/a/49455609

const warnedOnRules = new Set()

function warnRuleNotFound(ruleId) {
  if (warnedOnRules.has(ruleId)) {
    return
  }

  debug(`Did not found rule ${ruleId}!`)
  warnedOnRules.add(ruleId)
}

const eslintInstanceCache = new Map()

const cwdEsLint = new CLIEngine({
  // Assumption is that the path where eslint installed also contains the
  // relevant plugins. Therefor, also to be able to cache the instance, we
  // execute this once per eslint installation only.
  cwd: ESLINT_ROOT_PATH,
  useEslintrc: true
})

function getRuleLevel(entry) {
  return Array.isArray(entry) ? entry[0] : entry
}

export function preboot(flags) {
  const rootFile = path.join(process.cwd(), "index.js")
  getEslintInstance(rootFile, flags)
}

export function getEslintInstance(filePath: string, flags: FormatOptions = {}) {
  const rawFileConfig = cwdEsLint.getConfigForFile(filePath)
  const stringifiedFileConfig = JSON.stringify(rawFileConfig)

  const cachedEslintInstance = eslintInstanceCache.get(stringifiedFileConfig)
  if (cachedEslintInstance) {
    return cachedEslintInstance
  }

  if (flags.debug) {
    debug(`FLAGS: ${JSON.stringify(flags)}`)
    debug(`ESLINT_ROOT_PATH: ${ESLINT_ROOT_PATH}`)
    debug(`APP_ROOT_PATH: ${APP_ROOT_PATH}`)
  }

  // This can be used to enable debug mode in eslint
  // require("debug").enable("eslint:*,-eslint:code-path");

  const localEslint = new CLIEngine({
    cwd: flags.autoRoot ? ESLINT_ROOT_PATH : process.cwd(),
    useEslintrc: false,
    plugins: rawFileConfig.plugins
  })
  const rules = localEslint.getRules()
  const fileRules = rawFileConfig.rules

  Object.entries(fileRules).forEach(([ name, rule ]) => {
    const ruleImpl = rules.get(name)
    if (ruleImpl) {
      if (getRuleLevel(rule) === "off") {
        delete fileRules[name]
        return
      }

      // console.log(ruleImpl.meta)
      if (ruleImpl.meta && ruleImpl.meta.fixable) {
        // That's a flag being introduced by @typescript-eslint
        // to mark rules which require the type checker
        if (
          ruleImpl.meta.docs &&
          ruleImpl.meta.docs.requiresTypeChecking &&
          !flags.enableTyped
        ) {
          // Disable type-based formatting rule
          // This is typically too slow for regular execution
          delete fileRules[name]
          if (flags.debug) {
            debug(
              `- Disabled type-based auto-fixable rule: ${name} [${ruleImpl.meta.type}] [fixes: ${ruleImpl.meta.fixable}]`
            )
          }
        } else if (flags.debug) {
          debug(
            `- Auto fixing: ${name} [${ruleImpl.meta.type}] [fixes: ${ruleImpl.meta.fixable}]`
          )
        }
      } else {
        // Disable all non-fixable rules
        delete fileRules[name]
      }
    } else {
      warnRuleNotFound(name)
    }
  })

  if (flags.debug) {
    debug("Enabled rules:", fileRules)
  } else if (flags.verbose) {
    debug(`Enabled ${Object.keys(fileRules).length} auto-fixable rules`)
  }

  // Warn on "error"-level auto-fixable rules
  Object.entries(fileRules).forEach(([ name, rule ]) => {
    if (getRuleLevel(rule) === "error") {
      debug(
        chalk.yellow(
          `Hint: Rule "${name}" is auto-fixable and need not be set to level error!`
        ),
        rule
      )
    }
  })

  // Force override for prevent building up type information
  const parserOptions = rawFileConfig.parserOptions
  if (parserOptions && !flags.enableTyped) {
    delete parserOptions.project
  }

  const eslintInstance = new CLIEngine({
    ...rawFileConfig,

    parserOptions,

    // Using the app root is key here as otherwise we wouldn't
    // correctly deal with the .eslintignore file which is only
    // loaded from one location and is typically stored in the projects
    // root folder.
    cwd: flags.autoRoot ? APP_ROOT_PATH : process.cwd(),

    rules: fileRules,
    useEslintrc: false,
    fix: true,
    ignore: !flags.skipIgnore,
    globals: []
  })

  eslintInstanceCache.set(stringifiedFileConfig, eslintInstance)
  return eslintInstance
}
