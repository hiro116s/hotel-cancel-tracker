import * as fs from "fs";
import * as puppeteer from "puppeteer";
import { format } from "date-fns";
import * as AWS from "aws-sdk";
import { scrollPageToBottom } from 'puppeteer-autoscroll-down';
import { puppeteerConfig } from "./parse_args";
import { Config, Data } from "./types";

// https://bobbyhadz.com/blog/javascript-error-err-require-esm-of-es-module-node-fetch
import { RequestInfo, RequestInit } from 'node-fetch';
const fetch = (url: RequestInfo, init?: RequestInit) =>
    import('node-fetch').then(({ default: fetch }) => fetch(url, init)); import { v4 as uuidv4 } from "uuid";

const s3Client = new AWS.S3();

const config = JSON.parse(fs.readFileSync("resources/config.json", "utf8")) as Config;
const data = JSON.parse(fs.readFileSync("resources/data.json", "utf8")) as Data;

const viewport = {
    width: 1800,
    height: 1000,
    isMobile: true
};

// https://github.com/puppeteer/puppeteer/issues/1665
const contentHashPageFunction = `(async() => {
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
})()`;

(async () => {
    const browser = await puppeteer.launch(puppeteerConfig);

    const page = await browser.newPage();
    page.setViewport(viewport);
    const now = new Date();
    try {
        await page.goto(config.url);
        await scrollPageToBottom(page, {});
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
        fs.writeFileSync("resources/data.json", JSON.stringify({ prevContentHash: contentHash }, null, 2));
        console.log(`Update was detected and notified LINE account. ${pdfUrl}`);
    } catch (err) {
        console.log(err);
    } finally {
        await browser.close();
    }
})();

async function sendMessageToLine(pdfUrl: string) {
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

function putPdfInS3(pdf: Buffer, fileName: string) {
    const putParams = {
        ACL: "public-read",
        Body: pdf,
        Bucket: config.awsBucketName,
        Key: fileName,
        ContentType: "application/pdf"
    } as AWS.S3.PutObjectRequest;
    s3Client.putObject(putParams, (err, data) => {
        if (err) {
            throw err;
        }
    });
}

