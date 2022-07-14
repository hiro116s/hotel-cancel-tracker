const fs = require("fs");
const puppeteer = require("puppeteer");
const format = require("date-fns/format");
const AWS = require("aws-sdk");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const { scrollPageToBottom } = require('puppeteer-autoscroll-down')

const s3Client = new AWS.S3();

const puppeteerConfig = {
    // headless: false,
    // slowMo: 250
};
const viewport = {
    width: 1800,
    height: 1000
};

const config = JSON.parse(fs.readFileSync("resources/config.json", "utf8"));
const data = JSON.parse(fs.readFileSync("resources/data.json", "utf8"));

(async () => {
    const browser = await puppeteer.launch(puppeteerConfig);

    const page = await browser.newPage();
    page.setViewport(viewport);
    const now = new Date();
    try {
        await page.goto(config.url);
        await scrollPageToBottom(page);
        const contentHash = await page.evaluate(contentHashPageFunction);
        if (data.prevContentHash === contentHash) {
            console.log("No update is detected.  Shutdown the task");
            return;
        }
        const fileName = `${format(now, "yyyy-MM-dd'T'HH:mm:ssa")}.pdf`;
        const pdf = await page.pdf({ format: "a4" });
        const pdfUrl = `https://${config.awsBucketName}.s3.ap-northeast-1.amazonaws.com/${fileName}`;
        putPdfInS3(pdf, fileName);
        await sendMessageToLine(pdfUrl);
        fs.writeFileSync("data.json", JSON.stringify({ prevContentHash: contentHash }, null, 2));
        console.log(`Update was detected and notified LINE account. ${pdfUrl}`);
    } catch (err) {
        console.log(err);
    } finally {
        await browser.close();
    }
})();

function putPdfInS3(pdf, fileName) {
    const putParams = {
        ACL: "public-read",
        Body: pdf,
        Bucket: config.awsBucketName,
        Key: fileName,
        ContentType: "application/pdf"
    };
    s3Client.putObject(putParams, (err, data) => {
        if (err) {
            throw err;
        }
    });
}

async function sendMessageToLine(pdfUrl) {
    const body = {
        "messages": [
            {
                "type": "text",
                "text": `新しいキャンセル情報が見つかりました。\nURL: ${config.url}\npdf: ${pdfUrl}`
            }
        ]
    };
    const header = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.line.channelAccessToken,
        "X-Line-Retry-Key": uuidv4()
    };
    const response = await fetch("https://api.line.me/v2/bot/message/broadcast", {
        method: 'post',
        body: JSON.stringify(body),
        headers: header
    });
    if (response.ok) {
        console.log("Successfully a message is sent to LINE");
        return;
    } else {
        throw Error(`Failed to send a message to LINE.  status: ${response.status} ${JSON.stringify(response.json())}`);
    }
}

async function contentHashPageFunction() {
    // Define the function inside the page function so that the browser can use this function.
    async function sha256(text) {
        const uint8 = new TextEncoder().encode(text)
        const digest = await crypto.subtle.digest("SHA-256", uint8)
        return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("")
    }

    const plans = document.querySelectorAll(".htlPlnRmTypLst");
    if (plans.length === 0) {
        return sha256("no_plan");
    }
    let text = "";
    for (const plan of plans) {
        text += plan.outerHTML + "___";
    }
    return sha256(text);
}
