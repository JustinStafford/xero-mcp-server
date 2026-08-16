#!/usr/bin/env node
/**
 * Interactive authorisation for the standard OAuth 2.0 flow.
 *
 *   npm run authorise           connect an organisation
 *   npm run authorise -- --list show currently connected organisations
 *   npm run authorise -- --reset  forget the stored token set
 *
 * Run once per organisation. Each run returns a token set covering every
 * organisation authorised so far — connections accumulate against the app, so
 * a second run does not disconnect the first org.
 *
 * Deliberately standalone: it does not import the MCP client, so it stays
 * usable before any token exists.
 */
import http from "node:http";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";
import { XeroClient } from "xero-node";

import { DEFAULT_REDIRECT_URI, XERO_AUTH_SCOPES } from "../clients/scopes.js";
import {
  clearTokenSet,
  getTokenFilePath,
  readTokenSet,
  writeTokenSet,
  StoredTokenSet,
} from "../clients/token-store.js";

dotenv.config();

const clientId = process.env.XERO_CLIENT_ID;
const clientSecret = process.env.XERO_CLIENT_SECRET;
const redirectUri = process.env.XERO_REDIRECT_URI || DEFAULT_REDIRECT_URI;

if (!clientId || !clientSecret) {
  console.error(
    "XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set in .env before authorising.",
  );
  process.exit(1);
}

const buildClient = () =>
  new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: XERO_AUTH_SCOPES,
    httpTimeout: 30000,
  });

const listConnections = async (): Promise<void> => {
  const stored = readTokenSet();
  if (!stored) {
    console.log(`No token set stored at ${getTokenFilePath()}.`);
    console.log("Run `npm run authorise` to connect an organisation.");
    return;
  }

  const xero = buildClient();
  xero.setTokenSet(stored);

  // fullOrgDetails=false keeps this to a single GET /connections instead of an
  // extra getOrganisations call per tenant.
  const tenants = await xero.updateTenants(false);
  console.log(`Connected organisations (${tenants.length}):`);
  for (const tenant of tenants) {
    console.log(`  ${tenant.tenantName}  [${tenant.tenantType}]  ${tenant.tenantId}`);
  }
};

const authoriseOnce = async (): Promise<boolean> => {
  const xero = buildClient();
  await xero.initialize();

  const consentUrl = await xero.buildConsentUrl();
  const port = Number(new URL(redirectUri).port || 80);
  let succeeded = false;

  console.log("\nOpen this URL to authorise an organisation:\n");
  console.log(consentUrl);
  console.log("\nPick ONE organisation on the consent screen.\n");

  await new Promise<void>((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith(new URL(redirectUri).pathname)) {
        res.writeHead(404).end("not found");
        return;
      }

      try {
        const tokenSet = await xero.apiCallback(
          `${redirectUri.replace(/\/[^/]*$/, "")}${req.url}`,
        );

        if (!tokenSet.refresh_token) {
          throw new Error(
            "No refresh token returned — offline_access was not granted. " +
              "Tokens would not survive a restart.",
          );
        }

        writeTokenSet(tokenSet as StoredTokenSet);

        const tenants = await xero.updateTenants(false);

        succeeded = true;

        console.log("Authorised.\n");
        console.log(`  token set: ${getTokenFilePath()}`);
        console.log(`  refresh token: stored`);
        console.log(`  connected organisations (${tenants.length}):`);
        for (const tenant of tenants) {
          console.log(`    ${tenant.tenantName}  [${tenant.tenantType}]`);
        }

        res.writeHead(200, { "Content-Type": "text/html" }).end(
          `<html><body style="font-family:system-ui;padding:3rem;max-width:34rem">
             <h2>Authorised</h2>
             <p>${tenants.length} organisation(s) connected. You can close this tab.</p>
           </body></html>`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\nAuthorisation failed: ${message}`);
        res.writeHead(500, { "Content-Type": "text/html" }).end(
          `<html><body style="font-family:system-ui;padding:3rem">
             <h2>Authorisation failed</h2><pre>${message}</pre>
           </body></html>`,
        );
        process.exitCode = 1;
      } finally {
        setTimeout(() => server.close(() => resolve()), 250);
      }
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `\nPort ${port} is already in use. On macOS, ControlCenter (AirPlay ` +
            `Receiver) binds port 5000 — set XERO_REDIRECT_URI to a free port ` +
            `and register it on your Xero app.`,
        );
      } else {
        console.error(`\nCallback server error: ${error.message}`);
      }
      process.exitCode = 1;
      resolve();
    });

    server.listen(port);
  });

  return succeeded;
};

/**
 * Authorise organisations one after another in a single sitting.
 *
 * Each pass connects exactly one organisation — Xero's consent screen has no
 * multi-select — but connections accumulate against the app, so looping here
 * avoids re-running the command once per entity.
 */
const authorise = async (): Promise<void> => {
  const rl = readline.createInterface({ input, output });

  try {
    for (;;) {
      const succeeded = await authoriseOnce();
      if (!succeeded) break;

      const again = await rl.question(
        "\nAuthorise another organisation? [y/N] ",
      );
      if (!/^y/i.test(again.trim())) break;
    }
  } finally {
    rl.close();
  }

  console.log("");
  await listConnections();
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.includes("--reset")) {
    clearTokenSet();
    console.log(`Cleared ${getTokenFilePath()}.`);
    return;
  }

  if (args.includes("--list")) {
    await listConnections();
    return;
  }

  await authorise();
};

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
