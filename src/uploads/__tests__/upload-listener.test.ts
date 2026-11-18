import { spawn } from "node:child_process";
import http from "node:http";
import { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mockXeroClientModule,
} from "../../test-support/mock-xero-client.js";

vi.mock("../../clients/xero-client.js", () => mockXeroClientModule());

const { startUploadServer } = await import("../upload-server.js");
const { UploadLinks, getListenerProblem } = await import("../upload-links.js");

import type { UploadConfig } from "../upload-config.js";

const configOn = (port: number): UploadConfig => ({
  port,
  publicUrl: "https://mcp.example.com/xero-upload",
  pathPrefix: "/xero-upload",
  ttlMs: 600_000,
  maxBytes: 1024,
});

const freePort = async (): Promise<number> => {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
};

const started: http.Server[] = [];
afterEach(async () => {
  for (const server of started.splice(0)) {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
  vi.restoreAllMocks();
});

describe("upload listener lifecycle", () => {
  it("listens on loopback only and reports itself healthy", async () => {
    const port = await freePort();
    const server = startUploadServer(configOn(port), new UploadLinks(1000), {
      input: new PassThrough(),
    });
    started.push(server);

    await vi.waitFor(() => expect(server.listening).toBe(true));
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
    expect(getListenerProblem()).toBeNull();
  });

  it("never keeps the process alive by itself", async () => {
    const unref = vi.spyOn(http.Server.prototype, "unref");
    const port = await freePort();
    started.push(
      startUploadServer(configOn(port), new UploadLinks(1000), {
        input: new PassThrough(),
      }),
    );

    expect(unref).toHaveBeenCalled();
  });

  it("an unref'd listener lets a stdio process end when stdin closes", async () => {
    // The property the fix relies on, shown on a real process: with unref() the
    // process exits at stdin's end; without it, it would hang until killed.
    const script = `
      const http = require("node:http");
      const server = http.createServer(() => {});
      server.unref();
      server.listen(0, "127.0.0.1");
      process.stdin.on("data", () => {});
      process.stdin.once("end", () => server.close());
    `;
    const child = spawn(process.execPath, ["-e", script], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );

    child.stdin.end();
    const code = await Promise.race([
      exited,
      new Promise<string>((resolve) => setTimeout(() => resolve("hung"), 5000)),
    ]);
    child.kill();

    expect(code).toBe(0);
  });

  it("closes when the client's side of stdio closes", async () => {
    const input = new PassThrough();
    const port = await freePort();
    const server = startUploadServer(configOn(port), new UploadLinks(1000), {
      input,
    });
    started.push(server);
    await vi.waitFor(() => expect(server.listening).toBe(true));

    input.end();
    input.resume();

    await vi.waitFor(() => expect(server.listening).toBe(false));
    expect(getListenerProblem()).toMatch(/stopped/);
  });

  it("keeps trying a busy port, and takes it once it is free", async () => {
    const holder = http.createServer();
    await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
    const { port } = holder.address() as AddressInfo;

    const server = startUploadServer(configOn(port), new UploadLinks(1000), {
      input: new PassThrough(),
      retryMs: 20,
      retries: 100,
    });
    started.push(server);

    await vi.waitFor(() => expect(getListenerProblem()).toMatch(/EADDRINUSE/));
    expect(server.listening).toBe(false);

    await new Promise((resolve) => holder.close(resolve));

    await vi.waitFor(() => expect(server.listening).toBe(true));
    expect(getListenerProblem()).toBeNull();
  });

  it("gives up on a busy port after its retries, and says so", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const holder = http.createServer();
    await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
    started.push(holder);
    const { port } = holder.address() as AddressInfo;

    const server = startUploadServer(configOn(port), new UploadLinks(1000), {
      input: new PassThrough(),
      retryMs: 5,
      retries: 2,
    });
    started.push(server);

    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(server.listening).toBe(false);
    expect(getListenerProblem()).toMatch(/EADDRINUSE/);
  });
});
