require("dotenv").config();

const fs = require("fs");
const path = require("path");
const os = require("os");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const jsforce = require("jsforce");

const unzipper = require("unzipper");
const archiver = require("archiver");
console.log("ARCHIVER TYPE:", typeof archiver);
console.log("ARCHIVER:", archiver);
const xml2js = require("xml2js");

const Organization = require("./models/organization");

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

app.use(express.json());

console.log("Mongo URI =", process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
})
.then(() => {
    console.log("✅ MongoDB Connected");
})
.catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
});

console.log("CLIENT_ID:", process.env.SF_CLIENT_ID);
console.log("REDIRECT_URI:", process.env.SF_REDIRECT_URI);
console.log("LOGIN_URL:", process.env.SF_LOGIN_URL);

let sfTokenStore = {};

const oauth2 = new jsforce.OAuth2({
    loginUrl: process.env.SF_LOGIN_URL,
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
    redirectUri: process.env.SF_REDIRECT_URI
});
app.get("/oauth/authUrl", (req, res) => {

    const authUrl = oauth2.getAuthorizationUrl({
        scope: "api refresh_token id"
    });

    console.log("AUTH URL:", authUrl);

    res.json({
        url: authUrl
    });

});
app.get("/oauth/callback", async (req, res) => {

    try {

        const conn = new jsforce.Connection({
            oauth2
        });

        const code = req.query.code;

        console.log("AUTH CODE:", code);

        await conn.authorize(code);

        console.log("ACCESS TOKEN:", conn.accessToken);
        console.log("INSTANCE URL:", conn.instanceUrl);

        const identity = await conn.identity();

        await Organization.findOneAndUpdate(

            {
                orgId: identity.organization_id
            },

            {
                orgId: identity.organization_id,
                orgName: identity.organization_id,
                instanceUrl: conn.instanceUrl,
                accessToken: conn.accessToken,
                refreshToken: conn.refreshToken || "",
                loginUrl: process.env.SF_LOGIN_URL
            },

            {
                upsert: true,
                returnDocument: "after"
            }

        );

        sfTokenStore = {
            accessToken: conn.accessToken,
            instanceUrl: conn.instanceUrl
        };

        console.log("TOKEN SAVED");

        res.redirect(
            "https://sfvalidation.netlify.app/?status=success"
        );

    }
    catch (err) {

        console.error("AUTHORIZE ERROR:");
        console.error(err);

        res.status(500).send(err.message);

    }

});
function getSfConnection() {

    if (!sfTokenStore.accessToken) {
        throw new Error("Salesforce not authenticated");
    }

    return new jsforce.Connection({

        instanceUrl: sfTokenStore.instanceUrl,

        accessToken: sfTokenStore.accessToken

    });

}
// ---------------- Fetch Validation Rules ----------------

app.get("/api/validation-rules", async (req, res) => {

    try {

        const conn = getSfConnection();

        const query = `
        SELECT Id,
               ValidationName,
               Active,
               Description,
               EntityDefinition.DeveloperName
        FROM ValidationRule
        WHERE EntityDefinition.DeveloperName='Account'
        `;

        const result = await conn.tooling.query(query);

        const rules = result.records.map(rule => ({

            id: rule.Id,

            fullName: `Account.${rule.ValidationName}`,

            name: rule.ValidationName,

            active: rule.Active,

            description: rule.Description

        }));

        console.log("VALIDATION RULES:");
        console.log(rules);

        res.json(rules);

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});


// ---------------- Helper : Extract ZIP ----------------

async function extractZip(zipPath, outputDir) {
    return new Promise((resolve, reject) => {

        fs.createReadStream(zipPath)
            .pipe(
                unzipper.Extract({
                    path: outputDir
                })
            )
            .on("close", resolve)
            .on("error", reject);

    });
              }


// ---------------- Helper : Create ZIP ----------------

async function createZip(sourceDir, outputZip) {

    return new Promise((resolve, reject) => {

        const output = fs.createWriteStream(outputZip);

        const archive = archiver("zip", {
            zlib: {
                level: 9
            }
        });

        output.on("close", resolve);

        archive.on("error", reject);

        archive.pipe(output);

        archive.directory(sourceDir, false);

        archive.finalize();

    });

}


// ---------------- XML Parser ----------------

const parser = new xml2js.Parser();

const builder = new xml2js.Builder({

    xmldec: {

        version: "1.0",

        encoding: "UTF-8"

    }
});


// ---------------- Temporary Folder ----------------

function getTempFolder() {

    const dir = path.join(

        os.tmpdir(),

        "sfdeploy_" + Date.now()

    );

    fs.mkdirSync(dir, {

        recursive: true

    });

    return dir;

    }
app.post("/api/validation-rules/deploy", async (req, res) => {
    try {
        const conn = getSfConnection();
        const { rules } = req.body;

        const tempDir = path.join(os.tmpdir(), "sf-metadata-" + Date.now());
        fs.mkdirSync(tempDir, { recursive: true });

        const zipPath = path.join(tempDir, "retrieve.zip");

        // Retrieve metadata
        const retrieve = conn.metadata.retrieve({
            unpackaged: {
                version: "65.0",
                types: [
                    {
                        name: "CustomObject",
                        members: ["Account"]
                    }
                ]
            }
        });

        const retrieveResult = await retrieve.complete();

        if (!retrieveResult.zipFile) {
            throw new Error("Metadata retrieve failed.");
        }

        fs.writeFileSync(
            zipPath,
            Buffer.from(retrieveResult.zipFile, "base64")
        );
// Extract ZIP
await extractZip(zipPath, tempDir);
console.log("Files after extraction:");
console.log(fs.readdirSync(tempDir, { recursive: true }));
// Print every extracted file
function printFiles(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);

        if (fs.statSync(fullPath).isDirectory()) {
            printFiles(fullPath);
        } else {
            console.log(fullPath);
        }
    });
}

console.log("===== Extracted Files =====");
printFiles(tempDir);
console.log("===========================");

// Verify package.xml
const packageXml = path.join(
    tempDir,
    "unpackaged",
    "package.xml"
);

if (!fs.existsSync(packageXml)) {
    throw new Error("package.xml not found after extraction");
}

// Verify Account.object
const objectFile = path.join(
    tempDir,
    "unpackaged",
    "objects",
    "Account.object"
);

if (!fs.existsSync(objectFile)) {
    throw new Error("Account.object not found.");
        }

        const xml = fs.readFileSync(objectFile, "utf8");

const metadata = await parser.parseStringPromise(xml);


console.log(
    "XML VALIDATION RULES:"
);

console.log(
    JSON.stringify(
        metadata.CustomObject.validationRules,
        null,
        2
    )
);


const validationRules =
    metadata.CustomObject.validationRules || [];


for (const deployRule of rules) {

    const fullName = deployRule.fullName.replace("Account.", "");

    const rule = validationRules.find(
        r => r.fullName &&
             r.fullName[0] === fullName
    );

    if (rule) {

        console.log(
            "Updating:",
            fullName,
            "=>",
            deployRule.active
        );

        rule.active = [
            deployRule.active ? "true" : "false"
        ];
    }
}

        fs.writeFileSync(
            objectFile,
            builder.buildObject(metadata)
        );
console.log(
    "UPDATED ACCOUNT OBJECT:"
);

console.log(
    fs.readFileSync(objectFile,"utf8")
);
    // Create correct Salesforce deployment ZIP

const deployDir = path.join(tempDir, "deploy");

fs.mkdirSync(deployDir, { recursive: true });


// Copy package.xml
fs.mkdirSync(
    path.join(deployDir, "objects"),
    { recursive:true }
);

fs.copyFileSync(
    packageXml,
    path.join(deployDir, "package.xml")
);


// Copy Account.object
fs.copyFileSync(
    objectFile,
    path.join(
        deployDir,
        "objects",
        "Account.object"
    )
);


const deployZip = path.join(tempDir, "deploy.zip");


await createZip(
    deployDir,
    deployZip
);


console.log("DEPLOY ZIP CREATED");

console.log(
    fs.readdirSync(deployDir, {recursive:true})
);
console.log("Deploy ZIP exists:", fs.existsSync(deployZip));
console.log("Deploy ZIP size:", fs.statSync(deployZip).size, "bytes");

console.log("PACKAGE.XML:");
console.log(fs.readFileSync(packageXml, "utf8"));

        const deployBase64 = fs
            .readFileSync(deployZip)
            .toString("base64");

  const deploy = conn.metadata.deploy(deployBase64, {
    rollbackOnError: true
});

const deployResult = await deploy.complete({
    details: true
});      

console.log("DEPLOY RESULT:");
console.log(JSON.stringify(deployResult, null, 2));

if (!deployResult.success) {
    console.log(deployResult.details);
}

res.json({
    success: deployResult.success,
    deployResult
});

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
// Home Route
app.get("/", (req, res) => {
    res.send("Salesforce Backend Running Successfully");
});
// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});
