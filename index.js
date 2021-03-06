#!/usr/bin/env node

const htmlToText = require('html-to-text');
const juice = require('juice');
const fs = require('fs');
const path = require('path');
const sass = require('sass');
const Inky = require('inky').Inky;
const cheerio = require('cheerio');
const chalk = require('chalk');

const TEMPLATE_DIR = process.env.SMOOTHIE_TEMPLATE_DIR;
const TEMPLATE_BUILD_DIR = process.env.SMOOTHIE_BUILD_TEMPLATE_DIR;
const LAYOUT_FILE = process.env.SMOOTHIE_LAYOUT_FILE
  ? process.env.SMOOTHIE_LAYOUT_FILE
  : undefined;
const CSS_FILE = process.env.SMOOTHIE_CSS_FILE
  ? process.env.SMOOTHIE_CSS_FILE
  : undefined;
const SCSS_FILE = process.env.SMOOTHIE_SCSS_FILE
  ? process.env.SMOOTHIE_SCSS_FILE
  : undefined;
const USE_FOUNDATION = process.env.SMOOTHIE_USE_FOUNDATION
  ? process.env.SMOOTHIE_USE_FOUNDATION == 'true'
  : false;
const HTML_ONLY = process.env.SMOOTHIE_HTML_ONLY == 'true';

const btoa = string => {
  return new Buffer(string).toString('base64');
};

const atob = string => {
  return Buffer(string, 'base64').toString('ascii');
};

class SmoothieException {
  constructor(message) {
    this.message = message;
  }
}

try {
  if (!TEMPLATE_DIR) throw new SmoothieException('No template dir specified');
  // fs.accessSync(TEMPLATE_DIR, fs.F_OK);
  foundation_path_old = path.join('node_modules/foundation-emails/dist','foundation-emails.css');
  foundation_path_new = path.join('assets/node_modules/foundation-emails/dist','foundation-emails.css');
  var foundation_path = foundation_path_old;
  try {
    fs.accessSync(foundation_path_old, fs.constants.F_OK);
  } catch(e) {
    fs.accessSync(foundation_path_new, fs.constants.F_OK);
    foundation_path = foundation_path_new;
  }
  const FOUNDATION_STYLE_PATH = foundation_path;


  console.log('Preparing to compile the following template files:');
  const templateFiles = fs
    .readdirSync(TEMPLATE_DIR)
    .filter(file => {
      if (HTML_ONLY) {
        return file.includes('.html.eex')
      } else {
        return file.includes('.eex')
      }
    });
  console.log(templateFiles.map(file => '- ' + file).join('\n'));

  let css = USE_FOUNDATION
    ? fs.readFileSync(FOUNDATION_STYLE_PATH, 'utf8')
    : '';

  if (SCSS_FILE) {
    css += sass.renderSync({ file: SCSS_FILE }).css;
  } else if (CSS_FILE) {
    css += fs.readFileSync(CSS_FILE, 'utf8');
  }

  const JUICE_OPTIONS = {
    preserveImportant: true,
    removeStyleTags: true,
    extraCss: css
  };

  let layout = '';
  try {
    layout = LAYOUT_FILE ? fs.readFileSync(LAYOUT_FILE, 'utf8') : '{content}';
  } catch (e) {
    if (e.code != 'EEXIST')
      throw new SmoothieException('Layout file not found');
    else
      throw e;
  }

  if (LAYOUT_FILE) console.log(`Using layout file: ${LAYOUT_FILE}`);
  else console.log('No layout specified');

  const escapeEex = text =>
    text.replace(/<%(.*?)%>/g, (match, p1) => `{{{${btoa(p1)}}}}`);
  const unescapeEex = text =>
    text.replace(/{{{(.*?)}}}/g, (match, p1) => `<%${atob(p1)}%>`);
  const compileInky = $ => new Inky({}).releaseTheKraken($);

  templateFiles.forEach(file => {
    let template = fs.readFileSync(path.join(TEMPLATE_DIR, file), {
      encoding: 'utf-8'
    });
    textFile = file.replace('html.eex', 'txt.eex')

    try {
      fs.mkdirSync(TEMPLATE_BUILD_DIR);
    } catch (e) {
      if (e.code != 'EEXIST') throw e;
    }

    if (file.includes('html.eex')) {
      template = layout.replace('{content}', template);
      let $ = cheerio.load(escapeEex(template), { xmlMode: true });
      // const templateCss = $('style').contents().toArray().reduce((prev, curr) => prev + curr.data, '');
      // do not remove inline styles, they could contain things like media queries
      // $('style').remove();
      template = USE_FOUNDATION ? compileInky($) : $.html();
      template = unescapeEex(template);

      const juicedTemplate = juice(template, JUICE_OPTIONS);
      fs.writeFileSync(path.join(TEMPLATE_BUILD_DIR, file), juicedTemplate);

      console.log('Created ' + file);

      if (!HTML_ONLY && !templateFiles.includes(textFile)) {
        const textTemplate = unescapeEex(
          htmlToText.fromString(escapeEex(template), { uppercaseHeadings: false })
        );
        fs.writeFileSync(path.join(TEMPLATE_BUILD_DIR, textFile), textTemplate);
        console.log('Created ' + textFile);
      }

    } else if (file.includes('txt.eex')) {
      fs.writeFileSync(path.join(TEMPLATE_BUILD_DIR, textFile), template);
      console.log('Copied ' + textFile);
    }
  });
  console.log('Done \uD83D\uDE4F');
} catch (error) {
  if (error instanceof SmoothieException) {
    console.error(
      chalk.bold(chalk.underline(chalk.red('Error:'))),
      error.message
    );
  } else {
    throw error;
  }
}
