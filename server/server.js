require('dotenv').config();
console.log('CLIENT_ID:', process.env.SF_CLIENT_ID);
console.log('REDIRECT_URI:', process.env.SF_REDIRECT_URI);
console.log('LOGIN_URL:', process.env.SF_LOGIN_URL);
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const app = express();
const jsforce = require('jsforce');
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
let sfTokenStore = {};
const oauth2 = new jsforce.OAuth2({
  loginUrl: process.env.SF_LOGIN_URL,
  clientId: process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  redirectUri: process.env.SF_REDIRECT_URI
});
console.log("OAuth2 Config:");
console.log(oauth2);
//1. OAuth Login
app.get('/oauth/authUrl', (req, res) => {
  const authUrl = oauth2.getAuthorizationUrl({ scope: 'api refresh_token' });
  console.log("AUTH URL=", authUrl);
  res.json({ url: authUrl });
});

 //2. OAuth Callback
app.get('/oauth/callback', async (req, res) => {
  try {
    const conn = new jsforce.Connection({ oauth2 });
    const code = req.query.code;
    console.log("AUTH CODE:", code);
    console.log("BEFORE AUTHORIZE");
    await conn.authorize(code);
    console.log("AFTER AUTHORIZE");
    console.log("ACCESS TOKEN:", conn.accessToken);
    console.log("INSTANCE URL:", conn.instanceUrl);
sfTokenStore = {
  accessToken: conn.accessToken,
  instanceUrl: conn.instanceUrl
};

console.log(sfTokenStore);

   res.redirect('https://sfvalidation.netlify.app/?status=success');

  } catch (err) {
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
// 3. Fetch Validation Rules via Tooling API
app.get('/api/validation-rules', async (req, res) => {
  try {
    const conn = getSfConnection();
    // Querying ValidationRule metadata via Tooling API
    const query = "SELECT Id,ValidationName, Active, Description, EntityDefinition.DeveloperName FROM ValidationRule WHERE EntityDefinition.DeveloperName = 'Account'";
    const result = await conn.tooling.query(query);
    console.log("VALIDATION RULE RESULT:");
    console.log(result.records);
    res.json(result.records);
  }
  catch (error) {
    console.error("VALIDATION RULE ERROR:");
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/toggle/:id", async (req, res) => {
  try {
    const conn = getSfConnection();

    const result = await conn.tooling.update(
      "ValidationRule",
      {
        Id: req.params.id,
        Active: req.body.active
      }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Update/Deploy Validation Rule State
app.post('/api/validation-rules/deploy', async (req, res) => {
  const { rules } = req.body;

  console.log("DEPLOY API HIT");
  console.log("DEPLOY REQUEST:", req.body);

  try {
    const conn = getSfConnection();

    const updateRecords = rules.map(rule => ({
      Id: rule.id,
      Metadata: {
        active: rule.active
      }
    }));

    const results = await conn.tooling.update(
      'ValidationRule',
      updateRecords
    );

    console.log("DEPLOY RESULT:");
    console.log(JSON.stringify(results, null, 2));

    res.json({ success: true, results });

  } catch (error) {
    console.error("DEPLOY ERROR:");
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
app.get("/", (req, res) => {
  res.send("Salesforce Backend Running Successfully");
});

app.listen(process.env.PORT, () => {
  console.log(`Backend server running on port ${process.env.PORT}`);
});