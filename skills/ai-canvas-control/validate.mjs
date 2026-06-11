#!/usr/bin/env node
/**
 * validate.mjs — config/frontmatter validation for the ai-canvas-control skill
 *
 * Checks:
 *   1. config.json — valid JSON, `mode` in {"local","online"}, `baseUrl` is string
 *   2. SKILL.md   — frontmatter block exists, `name` and `description` non-empty
 *
 * Run: node validate.mjs
 * Exit 0 = all pass; non-zero = at least one failure
 */

import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

let allPassed = true

function pass(msg) {
  console.log(`  PASS  ${msg}`)
}

function fail(msg) {
  console.error(`  FAIL  ${msg}`)
  allPassed = false
}

// ---------------------------------------------------------------------------
// 1. Validate config.json (falls back to config.example.json when the local
//    config has not been created yet — the example must stay valid in-repo)
// ---------------------------------------------------------------------------
const configFile = existsSync(join(__dirname, 'config.json')) ? 'config.json' : 'config.example.json'
console.log(`\n[1] ${configFile}`)

let config
let configIsObject = false // gate for the field checks; kept separate from the
                           // parsed value so a literal `null` in the file (which
                           // JSON.parse returns without throwing) is NOT mistaken
                           // for "nothing to check".
try {
  const raw = readFileSync(join(__dirname, configFile), 'utf8')
  config = JSON.parse(raw)
  pass('valid JSON')

  // JSON.parse('null'), '[]', '42', '"x"' all succeed without throwing but are
  // not config objects (and typeof null === 'object', so null must be excluded
  // explicitly) — reject them so a broken file fails loudly instead of silently
  // skipping the field checks below.
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    fail('config.json must be a JSON object')
  } else {
    configIsObject = true
  }
} catch (e) {
  fail(`cannot read/parse ${configFile}: ${e.message}`)
}

if (configIsObject) {
  const validModes = new Set(['local', 'online'])
  if (validModes.has(config.mode)) {
    pass(`mode = "${config.mode}" (expected: local | online)`)
  } else {
    fail('mode is missing or not valid; expected one of: local, online')
  }

  if (typeof config.baseUrl === 'string') {
    pass(`baseUrl is a string (value: "${config.baseUrl}")`)
  } else {
    fail(`baseUrl must be a string, got: ${typeof config.baseUrl}`)
  }
}

// ---------------------------------------------------------------------------
// 2. Validate SKILL.md frontmatter
// ---------------------------------------------------------------------------
console.log('\n[2] SKILL.md frontmatter')

let skillText
try {
  skillText = readFileSync(join(__dirname, 'SKILL.md'), 'utf8')
  pass('file readable')
} catch (e) {
  fail(`cannot read SKILL.md: ${e.message}`)
  skillText = null
}

if (skillText !== null) {
  // Hand-parse YAML frontmatter: content between first two "---" lines
  const lines = skillText.split('\n')

  if (lines[0].trim() !== '---') {
    fail('SKILL.md must start with a "---" frontmatter opening line')
  } else {
    pass('frontmatter opening "---" found')

    // Find closing ---
    let closeIdx = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        closeIdx = i
        break
      }
    }

    if (closeIdx === -1) {
      fail('frontmatter closing "---" not found')
    } else {
      pass(`frontmatter closing "---" found at line ${closeIdx + 1}`)

      const fmLines = lines.slice(1, closeIdx)

      // Extract key: value pairs (simple single-line YAML, no nesting)
      const fmMap = {}
      for (const line of fmLines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.slice(0, colonIdx).trim()
        const value = line.slice(colonIdx + 1).trim()
        fmMap[key] = value
      }

      // Check `name`
      if (fmMap['name'] && fmMap['name'].length > 0) {
        pass(`name = "${fmMap['name']}"`)
      } else {
        fail('frontmatter `name` is missing or empty')
      }

      // Check `description`
      if (fmMap['description'] && fmMap['description'].length > 0) {
        pass(`description present (${fmMap['description'].length} chars)`)
      } else {
        fail('frontmatter `description` is missing or empty')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('')
if (allPassed) {
  console.log('All checks passed.')
  process.exit(0)
} else {
  console.error('One or more checks failed.')
  process.exit(1)
}
