// ============================================================================
//  Standalone certificate stylesheet — used when downloading a generated
//  certificate as a self-contained HTML file. Mirrors the .cert-* rules of
//  tubular.css without the .tubular-app scoping (the download has no app
//  shell). Kept as a string so the exported file needs no external assets.
// ============================================================================
export const CERT_CSS = `
body{background:#e8e8e4;margin:0;padding:24px;font-family:'Inter',system-ui,sans-serif}
.cert-doc{background:#fafaf7;color:#1a1a1a;padding:44px 50px;max-width:920px;margin:0 auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.25);border:1px solid #ddd}
.cert-doc::before{content:'';position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#d97706 0%,#d97706 33%,#1e40af 33%,#1e40af 66%,#1a1a1a 66%,#1a1a1a 100%)}
.cert-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #1a1a1a;margin-bottom:22px}
.cert-brand .logo{display:flex;align-items:center;gap:12px}
.cert-brand .logo-mark{width:48px;height:48px;background:linear-gradient(135deg,#d97706,#92400e);border-radius:3px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:22px}
.cert-brand .logo-text h2{font-size:19px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:#1a1a1a;line-height:1.1;margin:0}
.cert-brand .logo-text p{font-size:10.5px;color:#666;letter-spacing:.16em;text-transform:uppercase;font-weight:500;margin:4px 0 0}
.cert-brand .bv-line{font-size:10px;color:#666;letter-spacing:.1em;margin-top:8px;font-family:ui-monospace,monospace}
.cert-num{text-align:right}
.cert-num .lbl{font-size:9.5px;color:#888;letter-spacing:.18em;text-transform:uppercase;font-weight:600;margin-bottom:3px}
.cert-num .val{font-family:ui-monospace,monospace;font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:8px}
.cert-num .qr{width:72px;height:72px;background:#1a1a1a;display:inline-block;margin-top:6px;background-image:repeating-linear-gradient(0deg,#1a1a1a 0px,#1a1a1a 3px,#fafaf7 3px,#fafaf7 6px),repeating-linear-gradient(90deg,#1a1a1a 0px,#1a1a1a 3px,transparent 3px,transparent 6px);background-blend-mode:difference}
.cert-title{text-align:center;margin-bottom:26px}
.cert-title h1{font-size:24px;letter-spacing:.22em;text-transform:uppercase;font-weight:600;color:#1a1a1a;margin:0 0 6px}
.cert-title .sub{font-size:10.5px;color:#666;letter-spacing:.2em;text-transform:uppercase;font-weight:500}
.cert-title .accent-line{width:80px;height:3px;background:#d97706;margin:14px auto 0}
.cert-section{margin-bottom:22px}
.cert-section-title{font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:#666;font-weight:600;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #ddd}
.cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px}
.cert-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dotted #ddd;font-size:12px}
.cert-row .k{color:#666;font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-size:10px}
.cert-row .v{color:#1a1a1a;font-weight:600;font-family:ui-monospace,monospace;text-align:right;font-size:11.5px}
.cert-class-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.cert-class-cell{background:#fff;border:1px solid #ddd;padding:14px 10px;text-align:center;position:relative}
.cert-class-cell::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--lc,#999)}
.cert-class-cell.premium{--lc:#ffffff;border-top-color:#ccc}
.cert-class-cell.c2{--lc:#facc15}
.cert-class-cell.c3{--lc:#fb923c}
.cert-class-cell.scrap{--lc:#ef4444}
.cert-class-cell.needs{--lc:#a855f7}
.cert-class-cell .lbl{font-size:9.5px;color:#666;letter-spacing:.16em;text-transform:uppercase;font-weight:600;margin:4px 0 6px}
.cert-class-cell .val{font-size:24px;font-weight:600;color:#1a1a1a}
.cert-class-cell .unit{font-size:9.5px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
.cert-verdict{background:#fff;border:2px solid;padding:20px;text-align:center}
.cert-verdict.pass{border-color:#047857;background:rgba(16,185,129,.05)}
.cert-verdict.fail{border-color:#b91c1c;background:rgba(239,68,68,.05)}
.cert-verdict.due{border-color:#a16207;background:rgba(234,179,8,.05)}
.cert-verdict.unc{border-color:#1e40af;background:rgba(59,130,246,.05)}
.cert-verdict .lbl{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#666;font-weight:600;margin-bottom:6px}
.cert-verdict .val{font-size:26px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
.cert-verdict.pass .val{color:#047857}
.cert-verdict.fail .val{color:#b91c1c}
.cert-verdict.due .val{color:#a16207}
.cert-verdict.unc .val{color:#1e40af}
.cert-remark{background:#fff;border-left:3px solid #d97706;padding:12px 16px;font-size:12px;color:#333;line-height:1.5;font-style:italic;min-height:46px}
.cert-footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:32px;padding-top:22px;border-top:1px solid #ddd}
.sig-block{text-align:center}
.sig-block .line{border-bottom:1px solid #1a1a1a;height:32px;margin-bottom:6px}
.sig-block .name{font-family:ui-monospace,monospace;font-size:10.5px;color:#1a1a1a;font-weight:600}
.sig-block .role{font-size:9.5px;color:#666;letter-spacing:.1em;text-transform:uppercase;margin-top:3px}
.cert-disclaimer{font-size:9.5px;color:#888;text-align:center;margin-top:22px;line-height:1.5;letter-spacing:.04em}
@media print{body{background:#fff;padding:0}.cert-doc{box-shadow:none;border:none;max-width:100%}}
`;
