#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const filename = process.argv[2] || 'filters.js'
const filters = require(path.resolve(filename))

const { gmail, outDir, sieve } = require('./index')

// Generate individual sieve rules without header
const rules = filters.map(sieve.MultiRule)

const MAX_FILE_SIZE = 50000 // 50k characters

// Ensure out directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

// Split sieve rules into chunks that fit within ProtonMail's size limit
const sieveFiles = []
let currentFileContent = sieve.Header
let currentFileRules = []
let fileIndex = 1

for (const rule of rules) {
  const potentialContent = currentFileContent + rule + '\n'

  if (potentialContent.length > MAX_FILE_SIZE && currentFileRules.length > 0) {
    // Save current file and start a new one
    const outputFile = path.join(outDir, `${fileIndex}.sieve`)
    fs.writeFileSync(outputFile, currentFileContent)
    sieveFiles.push(outputFile)

    // Start new file with header
    fileIndex++
    currentFileContent = sieve.Header + rule + '\n'
    currentFileRules = [rule]
  }
  // Add rule to current file
  else {
    currentFileContent = potentialContent
    currentFileRules.push(rule)
  }
}

// Write the last file if there are remaining rules
if (currentFileRules.length > 0) {
  const outputFile = path.join(outDir, `${fileIndex}.sieve`)
  fs.writeFileSync(outputFile, currentFileContent)
  sieveFiles.push(outputFile)
}

// Write the Gmail filter import file
const gmailFile = path.join(outDir, 'gmail.xml')
fs.writeFileSync(gmailFile, gmail(filters))

console.info(`Sieve script split into 50k chunks and written to ./out:`)
sieveFiles.forEach(file => console.info(`  ${path.basename(file)}`))
console.info(`Gmail filter import file written to ./out:`)
console.info(`  ${path.basename(gmailFile)}`)
