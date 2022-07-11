const fs = require("fs");
const puppeteer = require("puppeteer");
const format = require("date-fns/format");
const AWS = require("aws-sdk");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

const s3Client = new AWS.S3();

const puppeteerConfig = {
    // headless: false,
    // slowMo: 250
};

(async () => {
    const browser = await puppeteer.launch(puppeteerConfig);

    const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
    const data = JSON.parse(fs.readFileSync("data.json", "utf8"));

    const page = await browser.newPage();
    const now = new Date();
    try {
        await page.goto(config.url);
        const contentHash = await page.evaluate(contentHashPageFunction);
        const newData = {
            ...data,
            prevContent: contentHash
        };
        if (data.prevContent === contentHash) {
            console.log("No update is detected.  Shutdown the task");
            return;
        }
        const fileName = `${format(now, "yyyy-MM-dd'T'HH:mm:ssa")}.pdf`;
        const pdf = await page.pdf({ format: "a4" });
        const pdfUrl = `https://${config.awsBucketName}.s3.ap-northeast-1.amazonaws.com/${fileName}`;
        putPdfInS3(fileName, pdf);
        sendMessageToLine(pdfUrl);
        fs.writeFileSync("data.json", JSON.stringify(newData, null, 2));
        console.log("Update was detected and notified LINE account.");
    } catch (err) {
        console.log(err);
    } finally {
        await browser.close();
    }
})();

function putPdfInS3(fileName, pdf) {
    const putParams = {
        ACL: "public-read",
        Body: pdf,
        Bucket: config.awsBucketName,
        Key: fileName,
        ContentType: "application/pdf"
    };
    s3Client.putObject(putParams);
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

    const content = document.getElementById("htlCntntArea");
    if (content !== null) {
        return sha256(content.outerHTML);
    }
    const err = document.getElementById("errorAreaWrap")
    if (err !== null) {
        return sha256(err.outerHTML);
    }
    throw new Error("This might be not Rakuten Travel site");
}
