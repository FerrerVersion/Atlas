#!/usr/bin/env node
/**
 * Genera docs/Atlas-Navegacion.pdf a partir de docs/documentacion.html con Chromium (Playwright).
 * Uso: npm run docs:pdf   (requiere `npx playwright install chromium`)
 */
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const html = pathToFileURL(resolve(root, 'docs/documentacion.html')).href
const out = resolve(root, 'docs/Atlas-Navegacion.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#94a3b8;padding:0 16mm;display:flex;justify-content:space-between">
    <span>Atlas · Navegación — Documentación</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
})
await browser.close()
console.log(`PDF generado: ${out}`)
