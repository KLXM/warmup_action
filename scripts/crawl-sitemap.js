const axios = require('axios');
const puppeteer = require('puppeteer');
const xml2js = require('xml2js');
const fs = require('fs');

// Konfiguration
const sitemapUrl = process.env.SITEMAP_URL;
const userAgent = process.env.USER_AGENT || 'SitemapCrawler/1.0';
const resultFile = './crawl-results.json';

// Funktion zum Warten (Sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function crawlSitemap() {
  console.log(`Starting sitemap crawl for: ${sitemapUrl}`);
  const results = [];
  
  try {
    // Sitemap abrufen
    console.log('Fetching sitemap...');
    const response = await axios.get(sitemapUrl);
    
    // XML parsen
    console.log('Parsing sitemap XML...');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);
    
    // URLs aus der Sitemap extrahieren
    let urls = [];
    if (result.urlset && result.urlset.url) {
      // Standard Sitemap
      urls = result.urlset.url.map(url => url.loc[0]);
    } else if (result.sitemapindex && result.sitemapindex.sitemap) {
      // Sitemap-Index - wir nehmen nur die erste Sitemap
      console.log('Detected sitemap index, using first sitemap...');
      const firstSitemapUrl = result.sitemapindex.sitemap[0].loc[0];
      console.log(`Fetching sub-sitemap: ${firstSitemapUrl}`);
      const subResponse = await axios.get(firstSitemapUrl);
      const subResult = await parser.parseStringPromise(subResponse.data);
      if (subResult.urlset && subResult.urlset.url) {
        urls = subResult.urlset.url.map(url => url.loc[0]);
      }
    }
    
    console.log(`Found ${urls.length} URLs in sitemap`);
    
    // Browser starten
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
      headless: true, // In neueren Versionen ist headless: true die Standardeinstellung
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // URLs besuchen
    let count = 0;
    for (const url of urls) {
      count++;
      const startTime = new Date();
      
      try {
        console.log(`[${count}/${urls.length}] Crawling: ${url}`);
        
        // Desktop-Version besuchen
        console.log(`  - Desktop view`);
        const desktopPage = await browser.newPage();
        await desktopPage.setUserAgent(userAgent);
        await desktopPage.setViewport({ width: 1280, height: 800 });
        const desktopResponse = await desktopPage.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        // Status prüfen
        const desktopStatus = desktopResponse.status();
        console.log(`  - Desktop status: ${desktopStatus}`);
        
        // Eine kurze Pause, um die Seite vollständig zu laden
        await sleep(1000);
        
        // Seite schließen
        await desktopPage.close();
        
        // Mobile-Version besuchen
        console.log(`  - Mobile view`);
        const mobilePage = await browser.newPage();
        await mobilePage.setUserAgent(userAgent + ' Mobile');
        await mobilePage.setViewport({ width: 375, height: 667 });
        const mobileResponse = await mobilePage.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 30000 
        });
        
        // Status prüfen
        const mobileStatus = mobileResponse.status();
        console.log(`  - Mobile status: ${mobileStatus}`);
        
        // Eine kurze Pause, um die Seite vollständig zu laden
        await sleep(1000);
        
        // Seite schließen
        await mobilePage.close();
        
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        
        results.push({
          url,
          success: true,
          desktopStatus,
          mobileStatus,
          duration,
          timestamp: new Date().toISOString()
        });
        
        console.log(`  ✓ Completed in ${duration.toFixed(1)}s`);
      } catch (error) {
        console.error(`  ✗ Error crawling ${url}: ${error.message}`);
        results.push({
          url,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Kurze Pause zwischen den Anfragen, um den Server nicht zu überlasten
      await sleep(2000);
    }
    
    // Browser schließen
    await browser.close();
    
    // Ergebnisse speichern
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    
    console.log(`Sitemap crawling completed! Results saved to ${resultFile}`);
    console.log(`Successfully crawled: ${results.filter(r => r.success).length}/${urls.length} URLs`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Script ausführen
crawlSitemap().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
