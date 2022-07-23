const puppeteer = require("puppeteer"); /// import puppeteer from "puppeteer";
const defaultDelay = 1000; // Increase this if running on a laggy browser or device
const debugBool = true;
const debug = {
  log: (...strings) => debugBool && console.log(strings.join(" ")),
};
const xlsx = require('xlsx');

// Get the data
async function getPageData(url, page) {
  await page.goto(url);
  try {
    await page.waitForSelector('[role="main"]');
  } catch (e) {
    movingOn();
  }

  //Shop Name
  const shopName = (await page.$eval('[role="main"]', (element) => element.getAttribute("aria-label"))) || "No shop name provided";

  //Shop Address
  const address = (await page.$eval('button[data-item-id="address"]', (element) => element.innerText)) || "Delivery service (No address)";

  //Website
  const website = (await page.$eval('[data-tooltip="Open website"]', (element) => element.innerText)) || "No website provided";

  const returnObj = {
    shop: shopName?.trim(),
    address: address?.trim(),
    website: website?.trim(),
  };

  console.log(returnObj);

  return returnObj;
  //await browser.close();
}

//Get Links

async function getLinks(page) {
  // Scrolling to bottom of page
  let newScrollHeight = 0;
  let scrollHeight = 1000;
  let divSelector = "[role='main'] > div:nth-child(2) > div";

  debug.log("Waiting for the page to load in");
  await page.waitForTimeout(defaultDelay * 11);

  debug.log("Starting to scroll now");
  while (true) {
    try {
      await page.waitForSelector(divSelector);
    } catch (e) {
      movingOn();
    }

    await page.evaluate((scrollHeight, divSelector) => document.querySelector(divSelector).scrollTo(0, scrollHeight), scrollHeight, divSelector);

    await page.waitForTimeout(defaultDelay);

    newScrollHeight = await page.$eval(divSelector, (div) => div.scrollHeight);
    debug.log("scrolled by", newScrollHeight);

    if (scrollHeight === newScrollHeight) {
      break;
    } else {
      scrollHeight = newScrollHeight;
    }
  }
  debug.log("finished scrolling");

  // Get results
  const searchResults = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a"))
      .map((el) => el.href)
      .filter((link) => link.match(/https:\/\/www.google.com\/maps\//g, link) && !link.match(/\=https:\/\/www.google.com\/maps\//g, link))
  );

  console.log(searchResults);
  debug.log("I got", searchResults.length, "results");
  return searchResults;
}

async function isNextButtonDisabled(page) {
  const state = await page.$eval('button[aria-label=" Next page "]', (button) => (button.getAttribute("disabled") ? true : false));
  debug.log("We are", state ? " at the end of the pages" : "not at the end of the pages");
  return state;
}

function movingOn() {
  debug.log("Wait timed out, moving on...");
}

function genericMovingOn() {
  debug.log("Recieved an error, attempting to move on...");
}

async function main(searchQuery = "food distributors in Chicago") {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const [page] = await browser.pages();

  await page.goto("https://www.google.com/maps/?q=" + searchQuery);
  try {
    await page.waitForNavigation({ waitUntil: "domcontentloaded" });
  } catch (e) {
    movingOn();
  }
  await page.waitForTimeout(defaultDelay * 10);

  let allLinks = [];

  let isDisabled;

  try {
    isDisabled = await isNextButtonDisabled(page);
  } catch (e) {
    genericMovingOn();
  }

  while (!isDisabled) {
    // If it hasn't go to the next page

    try {
      const links = await getLinks(page);
      allLinks.push(...links);
      await page.$eval('button[aria-label=" Next page "]', (element) => element.click());
      debug.log("moving to the next page");
    } catch (e) {
      genericMovingOn();
    }

    try {
      isDisabled = await isNextButtonDisabled(page);
    } catch (e) {
      genericMovingOn();
    }

    if (isDisabled) break;

    try {
      await page.waitForNavigation({ waitUntil: "domcontentloaded" });
    } catch (e) {
      movingOn();
    }
  }

  allLinks = Array.from(new Set(allLinks));

  console.log(allLinks);

  let scrapedData = [];

  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i];
    try {
      const data = await getPageData(link, page);
      scrapedData.push(data);
    } catch (e) {
      genericMovingOn();
    }
  }

  scrapedData = scrapedData.filter(Boolean)

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(scrapedData);
  xlsx.utils.book_append_sheet(wb,ws), {origin: -1};
  xlsx.writeFile(wb,"food.xlsx");

  console.log(scrapedData);
  debug.log("Scrape complete!");
}

console.clear();
main();