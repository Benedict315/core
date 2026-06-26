import { describe, it, expect, vi } from "vitest";
import {
  connectWallet,
  disconnectWallet,
  signTransaction,
  emptyWalletState,
  collectMultiSignatures,
  diagnoseWalletConnection,
} from "../wallet/index";
import {
  InMemorySigningHistoryStore,
  getSigningHistory,
  exportSigningHistory,
} from "../wallet/signingHistory";
import { FreighterAdapter } from "../wallet/adapters/freighter";
import { XBullAdapter } from "../wallet/adapters/xbull";
import { LobstrAdapter } from "../wallet/adapters/lobstr";
import { WalletType } from "../wallet/types";
import type { WalletAdapter, SWKInstance } from "../wallet/types";
import { ok, err, SorokitErrorCode } from "../shared/response";

function mockKit(overrides?: Partial<SWKInstance>): SWKInstance {
  return {
    getAddress: vi.fn().mockResolvedValue({
      address: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWNA",
    }),
    signTransaction: vi
      .fn()
      .mockResolvedValue({ signedTxXdr: "signed-xdr-string" }),
    ...overrides,
  };
}

describe("wallet adapters", () => {
  describe("FreighterAdapter", () => {
    it("walletType is FREIGHTER", () => {
      expect(new FreighterAdapter(mockKit()).walletType).toBe(
        WalletType.FREIGHTER,
      );
    });

    it("isAvailable() returns false in Node", () => {
      expect(new FreighterAdapter(mockKit()).isAvailable()).toBe(false);
    });

    it("connect() returns status error with WALLET_BROWSER_ONLY in Node", async () => {
      const result = await new FreighterAdapter(mockKit()).connect();
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error.code).toBe(SorokitErrorCode.WALLET_BROWSER_ONLY);
      }
    });

    it("disconnect() always returns status ok", async () => {
      const result = await new FreighterAdapter(mockKit()).disconnect();
      expect(result.status).toBe("ok");
    });

    it("signTransaction() returns status error with WALLET_BROWSER_ONLY in Node", async () => {
      const result = await new FreighterAdapter(mockKit()).signTransaction({
        transactionXdr: "xdr",
        networkPassphrase: "Test SDF Network ; September 2015",
      });
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error.code).toBe(SorokitErrorCode.WALLET_BROWSER_ONLY);
      }
    });
  });

  describe("XBullAdapter", () => {
    it("walletType is XBULL", () => {
      expect(new XBullAdapter(mockKit()).walletType).toBe(WalletType.XBULL);
    });

    it("connect() returns status error with WALLET_BROWSER_ONLY in Node", async () => {
      const result = await new XBullAdapter(mockKit()).connect();
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error.code).toBe(SorokitErrorCode.WALLET_BROWSER_ONLY);
      }
    });
  });

  describe("LobstrAdapter", () => {
    it("walletType is LOBSTR", () => {
      expect(new LobstrAdapter(mockKit()).walletType).toBe(WalletType.LOBSTR);
    });

    it("connect() returns status error with WALLET_BROWSER_ONLY in Node", async () => {
      const result = await new LobstrAdapter(mockKit()).connect();
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.error.code).toBe(SorokitErrorCode.WALLET_BROWSER_ONLY);
      }
    });
  });
});

describe("wallet module functions", () => {
  it("emptyWalletState() returns status ok with disconnected state", () => {
    const result = emptyWalletState();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.connected).toBe(false);
      expect(result.data.publicKey).toBeNull();
      expect(result.data.walletType).toBeNull();
    }
  });

  it("connectWallet() returns status error with WALLET_BROWSER_ONLY in Node", async () => {
    const result = await connectWallet(new FreighterAdapter(mockKit()));
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(SorokitErrorCode.WALLET_BROWSER_ONLY);
    }
  });

  it("disconnectWallet() returns status ok with clean state", async () => {
    const result = await disconnectWallet(new FreighterAdapter(mockKit()));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.connected).toBe(false);
      expect(result.data.publicKey).toBeNull();
    }
  });

  it("signTransaction() returns status error with WALLET_BROWSER_ONLY in Node", async () => {
    const result = await signTransaction(new FreighterAdapter(mockKit()), {
      transactionXdr: "some-xdr",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(SorokitErrorCode.WALLET_BROWSER_ONLY);
    }
  });

  it("signTransaction() returns WALLET_SIGN_REJECTED when adapter throws a rejection error", async () => {
    const rejectingAdapter: import("../wallet/types").WalletAdapter = {
      walletType: WalletType.FREIGHTER,
      isAvailable: () => true,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn().mockRejectedValue(new Error("User rejected the request")),
    };
    const result = await signTransaction(rejectingAdapter, {
      transactionXdr: "some-xdr",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(SorokitErrorCode.WALLET_SIGN_REJECTED);
    }
  });

  it("signTransaction() returns WALLET_SIGN_FAILED when adapter throws a non-rejection error", async () => {
    const failingAdapter: import("../wallet/types").WalletAdapter = {
      walletType: WalletType.FREIGHTER,
      isAvailable: () => true,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn().mockRejectedValue(new Error("Network timeout")),
    };
    const result = await signTransaction(failingAdapter, {
      transactionXdr: "some-xdr",
      networkPassphrase: "Test SDF Network ; September 2015",
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(SorokitErrorCode.WALLET_SIGN_FAILED);
    }
  });
});

describe("collectMultiSignatures (#22)", () => {
  it("returns WALLET_SIGN_FAILED when signers list is empty", async () => {
    const result = await collectMultiSignatures("xdr-0", [], vi.fn());
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(SorokitErrorCode.WALLET_SIGN_FAILED);
    }
  });

  it("calls signFn once for a single signer and returns the signed XDR", async () => {
    const signFn = vi.fn().mockResolvedValue(ok("xdr-signed-alice"));
    const result = await collectMultiSignatures("xdr-0", ["alice"], signFn);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data).toBe("xdr-signed-alice");
    }
    expect(signFn).toHaveBeenCalledOnce();
    expect(signFn).toHaveBeenCalledWith("xdr-0", "alice");
  });

  it("chains signatures for multiple signers sequentially", async () => {
    const signFn = vi
      .fn()
      .mockResolvedValueOnce(ok("xdr-after-alice"))
      .mockResolvedValueOnce(ok("xdr-after-bob"));

    const result = await collectMultiSignatures(
      "xdr-0",
      ["alice", "bob"],
      signFn,
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data).toBe("xdr-after-bob");
    }
    // Each call receives the output of the previous
    expect(signFn).toHaveBeenNthCalledWith(1, "xdr-0", "alice");
    expect(signFn).toHaveBeenNthCalledWith(2, "xdr-after-alice", "bob");
  });

  it("stops and returns the error if an intermediate signer fails", async () => {
    const signFn = vi
      .fn()
      .mockResolvedValueOnce(ok("xdr-after-alice"))
      .mockResolvedValueOnce(err(SorokitErrorCode.WALLET_SIGN_REJECTED, "Bob rejected"));

    const result = await collectMultiSignatures(
      "xdr-0",
      ["alice", "bob", "carol"],
      signFn,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe(SorokitErrorCode.WALLET_SIGN_REJECTED);
    }
    // carol should never have been called
    expect(signFn).toHaveBeenCalledTimes(2);
  });

  it("stops immediately if the first signer fails", async () => {
    const signFn = vi
      .fn()
      .mockResolvedValue(err(SorokitErrorCode.WALLET_NOT_CONNECTED, "not connected"));

    const result = await collectMultiSignatures(
      "xdr-0",
      ["alice", "bob"],
      signFn,
    );
    expect(result.status).toBe("error");
    expect(signFn).toHaveBeenCalledOnce();
  });
});

function fakeAdapter(overrides?: Partial<WalletAdapter>): WalletAdapter {
  return {
    walletType: WalletType.FREIGHTER,
    isAvailable: () => true,
    connect: async () => ok("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWNA"),
    disconnect: async () => ok(undefined),
    signTransaction: async () => ok("signed"),
    ...overrides,
  };
}

describe("diagnoseWalletConnection (#34)", () => {
  function find(report: { checks: { name: string; status: string }[] }, name: string) {
    return report.checks.find((c) => c.name === name);
  }

  it("reports healthy when the wallet is available and connects", async () => {
    const result = await diagnoseWalletConnection(fakeAdapter());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.healthy).toBe(true);
    expect(find(result.data, "wallet_installed")?.status).toBe("pass");
    expect(find(result.data, "extension_responsive")?.status).toBe("pass");
  });

  it("flags an unavailable wallet and skips the connection probe", async () => {
    const result = await diagnoseWalletConnection(
      fakeAdapter({ isAvailable: () => false }),
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.healthy).toBe(false);
    expect(find(result.data, "wallet_installed")?.status).toBe("fail");
    expect(find(result.data, "extension_responsive")?.status).toBe("skipped");
    expect(result.data.recommendations.length).toBeGreaterThan(0);
  });

  it("reports a failing connection probe with a rejection recommendation", async () => {
    const result = await diagnoseWalletConnection(
      fakeAdapter({
        connect: async () =>
          err(SorokitErrorCode.WALLET_CONNECT_FAILED, "user rejected"),
      }),
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.healthy).toBe(false);
    expect(find(result.data, "extension_responsive")?.status).toBe("fail");
    expect(result.data.recommendations.some((r) => r.includes("approve"))).toBe(true);
  });

  it("passes the network check when the endpoint is reachable", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    const result = await diagnoseWalletConnection(fakeAdapter(), {
      networkUrl: "https://horizon.test",
      fetchFn,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(find(result.data, "network_connectivity")?.status).toBe("pass");
    expect(fetchFn).toHaveBeenCalledWith("https://horizon.test", { method: "GET" });
  });

  it("fails the network check when fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await diagnoseWalletConnection(fakeAdapter(), {
      networkUrl: "https://horizon.test",
      fetchFn,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.healthy).toBe(false);
    expect(find(result.data, "network_connectivity")?.status).toBe("fail");
  });

  it("warns when the network endpoint returns a non-ok status", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const result = await diagnoseWalletConnection(fakeAdapter(), {
      networkUrl: "https://horizon.test",
      fetchFn,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(find(result.data, "network_connectivity")?.status).toBe("warn");
  });

  it("skips the network check when no URL is provided", async () => {
    const result = await diagnoseWalletConnection(fakeAdapter());
    if (result.status !== "ok") throw new Error("expected ok");
    expect(find(result.data, "network_connectivity")?.status).toBe("skipped");
  });

  it("skips the connection probe when probeConnection is false", async () => {
    const connect = vi.fn(async () => ok("G..."));
    const result = await diagnoseWalletConnection(
      fakeAdapter({ connect }),
      { probeConnection: false },
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(find(result.data, "extension_responsive")?.status).toBe("skipped");
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("signing history (#38)", () => {
  function signingAdapter(overrides?: Partial<WalletAdapter>): WalletAdapter {
    return {
      walletType: WalletType.FREIGHTER,
      isAvailable: () => true,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn().mockResolvedValue(ok("signed-xdr")),
      ...overrides,
    };
  }

  it("records a success entry when signing succeeds", async () => {
    const store = new InMemorySigningHistoryStore();
    await signTransaction(
      signingAdapter(),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015", accountToSign: "GABC" },
      store,
    );
    const result = getSigningHistory(store);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(1);
    const [rec] = result.data;
    expect(rec!.status).toBe("success");
    expect(rec!.signer).toBe("GABC");
    expect(rec!.timestamp).toBeTruthy();
    expect(rec!.txHash).toBeTruthy();
    expect(rec!.error).toBeUndefined();
  });

  it("uses 'unknown' as signer when accountToSign is not provided", async () => {
    const store = new InMemorySigningHistoryStore();
    await signTransaction(
      signingAdapter(),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" },
      store,
    );
    const result = getSigningHistory(store);
    if (result.status !== "ok") return;
    expect(result.data[0]!.signer).toBe("unknown");
  });

  it("records a failure entry when adapter throws", async () => {
    const store = new InMemorySigningHistoryStore();
    await signTransaction(
      signingAdapter({ signTransaction: vi.fn().mockRejectedValue(new Error("Network timeout")) }),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" },
      store,
    );
    const result = getSigningHistory(store);
    if (result.status !== "ok") return;
    expect(result.data[0]!.status).toBe("failure");
    expect(result.data[0]!.error).toContain("Signing failed");
  });

  it("records a failure entry when adapter returns an error result", async () => {
    const store = new InMemorySigningHistoryStore();
    await signTransaction(
      signingAdapter({
        signTransaction: vi.fn().mockResolvedValue(
          err(SorokitErrorCode.WALLET_SIGN_FAILED, "Adapter error"),
        ),
      }),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" },
      store,
    );
    const result = getSigningHistory(store);
    if (result.status !== "ok") return;
    expect(result.data[0]!.status).toBe("failure");
    expect(result.data[0]!.error).toBe("Adapter error");
  });

  it("does not record when no historyStore is provided (backward compatible)", async () => {
    const store = new InMemorySigningHistoryStore();
    // Call without store — should not throw and store remains empty
    await signTransaction(
      signingAdapter(),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" },
    );
    const result = getSigningHistory(store);
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(0);
  });

  it("filters records by signer", async () => {
    const store = new InMemorySigningHistoryStore();
    const input = { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" };
    await signTransaction(signingAdapter(), { ...input, accountToSign: "ALICE" }, store);
    await signTransaction(signingAdapter(), { ...input, accountToSign: "BOB" }, store);

    const result = getSigningHistory(store, { signer: "ALICE" });
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.signer).toBe("ALICE");
  });

  it("filters records by status", async () => {
    const store = new InMemorySigningHistoryStore();
    const input = { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" };
    await signTransaction(signingAdapter(), input, store);
    await signTransaction(
      signingAdapter({ signTransaction: vi.fn().mockRejectedValue(new Error("fail")) }),
      input,
      store,
    );

    const successes = getSigningHistory(store, { status: "success" });
    const failures = getSigningHistory(store, { status: "failure" });
    if (successes.status !== "ok" || failures.status !== "ok") return;
    expect(successes.data).toHaveLength(1);
    expect(failures.data).toHaveLength(1);
  });

  it("filters records by date range", async () => {
    const store = new InMemorySigningHistoryStore();
    const input = { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" };
    await signTransaction(signingAdapter(), input, store);

    const after = new Date(Date.now() + 60_000).toISOString();
    const result = getSigningHistory(store, { from: after });
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(0);
  });

  it("exportSigningHistory returns valid JSON", async () => {
    const store = new InMemorySigningHistoryStore();
    await signTransaction(
      signingAdapter(),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015", accountToSign: "GABC" },
      store,
    );
    const records = store.query();
    const exported = exportSigningHistory(records, "json");
    expect(exported.status).toBe("ok");
    if (exported.status !== "ok") return;
    const parsed: unknown = JSON.parse(exported.data);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBe(1);
  });

  it("exportSigningHistory returns CSV with header row", async () => {
    const store = new InMemorySigningHistoryStore();
    await signTransaction(
      signingAdapter(),
      { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015", accountToSign: "GABC" },
      store,
    );
    const records = store.query();
    const exported = exportSigningHistory(records, "csv");
    expect(exported.status).toBe("ok");
    if (exported.status !== "ok") return;
    const lines = exported.data.split("\n");
    expect(lines[0]).toBe("txHash,signer,timestamp,status,error");
    expect(lines.length).toBe(2);
  });

  it("InMemorySigningHistoryStore.clear() removes all entries", async () => {
    const store = new InMemorySigningHistoryStore();
    const input = { transactionXdr: "some-xdr", networkPassphrase: "Test SDF Network ; September 2015" };
    await signTransaction(signingAdapter(), input, store);
    store.clear();
    expect(store.query()).toHaveLength(0);
  });
});
