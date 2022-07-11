const fs = require("fs");
const puppeteer = require("puppeteer");
const format = require("date-fns/format");
const AWS = require("aws-sdk");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const { StatusCodes } = require("http-status-codes");

const s3Client = new AWS.S3();

(async () => {
    const browser = await puppeteer.launch({
        // headless: false,
        // slowMo: 250
    });

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
        if (data.prevContent !== contentHash) {
            console.log("Detected updates");
            const fileName = `${format(now, "yyyy-MM-dd'T'HH:mm:ssa")}.pdf`;
            const pdf = await page.pdf({ format: "a4" });

            const putParams = {
                ACL: "public-read",
                Body: pdf,
                Bucket: config.awsBucketName,
                Key: fileName,
                ContentType: "application/pdf"
            };
            s3Client.putObject(putParams, (err, _) => {
                if (err) {
                    throw err;
                }
            });
            const pdfUrl = `https://${config.awsBucketName}.s3.ap-northeast-1.amazonaws.com/${fileName}`;
            const body1 = {
                "messages": [
                    {
                        "type": "text",
                        "text": `新しいキャンセル情報が見つかりました。
                        URL: ${config.url}
                        pdf: ${pdfUrl}`
                    }
                ]
            }
            const header1 = {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + config.line.channelAccessToken,
                "X-Line-Retry-Key": uuidv4()
            };
            const response = await fetch("https://api.line.me/v2/bot/message/broadcast", {
                method: 'post',
                body: JSON.stringify(body1),
                headers: header1
            });
            if (response.ok) {
                console.log("Successfully sent a message to LINE");
            } else {
                console.log(`Failed to send a message to LINE.  status: ${response.status} ${JSON.stringify(response.json())}`);
                return;
            }
            console.log(pdfUrl);
        }
        fs.writeFileSync("data.json", JSON.stringify(newData, null, 2));
    } catch (err) {
        console.log(err);
    } finally {
        await browser.close();
    }
})();

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
